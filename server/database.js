// server/database.js
"use strict"

const { getDockerInstance, isMock } = require("./docker")

// ── Env parsing ───────────────────────────────────────────────────────────────

function parseEnv(envArr) {
  const map = {}
  for (const e of envArr) {
    const idx = e.indexOf("=")
    if (idx !== -1) map[e.slice(0, idx)] = e.slice(idx + 1)
  }
  return map
}

function getContainerIp(info) {
  const networks = Object.values(info.NetworkSettings.Networks || {})
  const found = networks.find(n => n.IPAddress)
  return found?.IPAddress || info.Name.replace(/^\//, "")
}

// ── Credential detection ──────────────────────────────────────────────────────

async function getDbCredentials(containerName) {
  if (isMock()) {
    return { engine: "postgres", host: "127.0.0.1", port: 5432, user: "postgres", password: "postgres", database: "postgres" }
  }

  const docker = getDockerInstance()
  const info = await docker.getContainer(containerName).inspect()
  const env = parseEnv(info.Config.Env || [])
  const host = getContainerIp(info)
  const image = info.Config.Image.toLowerCase()

  if (image.includes("postgres")) {
    return {
      engine: "postgres", host, port: 5432,
      user: env.POSTGRES_USER || "postgres",
      password: env.POSTGRES_PASSWORD || "",
      database: env.POSTGRES_DB || env.POSTGRES_USER || "postgres",
    }
  }
  if (image.includes("mysql") || image.includes("mariadb")) {
    return {
      engine: "mysql", host, port: 3306,
      user: env.MYSQL_USER || "root",
      password: env.MYSQL_ROOT_PASSWORD || env.MYSQL_PASSWORD || "",
      database: env.MYSQL_DATABASE || "",
    }
  }
  if (image.includes("redis")) {
    return {
      engine: "redis", host, port: 6379,
      password: env.REDIS_PASSWORD || null,
    }
  }
  if (image.includes("mongo")) {
    return {
      engine: "mongodb", host, port: 27017,
      user: env.MONGO_INITDB_ROOT_USERNAME || "",
      password: env.MONGO_INITDB_ROOT_PASSWORD || "",
      database: env.MONGO_INITDB_DATABASE || "admin",
    }
  }
  throw new Error(`Unsupported engine for image: ${info.Config.Image}`)
}

// ── Schema fetching ───────────────────────────────────────────────────────────

async function getDbSchema(containerName, database) {
  const creds = await getDbCredentials(containerName)
  if (creds.engine === "postgres") return _postgresSchema(creds, database)
  if (creds.engine === "mysql")    return _mysqlSchema(creds, database)
  if (creds.engine === "redis")    return _redisSchema(creds)
  if (creds.engine === "mongodb")  return _mongoSchema(creds, database)
  throw new Error(`Unsupported engine: ${creds.engine}`)
}

async function _postgresSchema(creds, selectedDb) {
  const { Client } = require("pg")
  const client = new Client({ host: creds.host, port: creds.port, user: creds.user, password: creds.password, database: creds.database, connectionTimeoutMillis: 5000 })
  await client.connect()
  try {
    const dbRes = await client.query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
    const databases = dbRes.rows.map(r => r.datname)
    let tables = []
    if (selectedDb) {
      const dbClient = new Client({ host: creds.host, port: creds.port, user: creds.user, password: creds.password, database: selectedDb, connectionTimeoutMillis: 5000 })
      await dbClient.connect()
      try {
        const tRes = await dbClient.query("SELECT relname AS name, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC")
        tables = tRes.rows.map(r => ({ name: r.name, rows: Number(r.rows) }))
      } finally { await dbClient.end() }
    }
    return { databases, tables }
  } finally { await client.end() }
}

async function _mysqlSchema(creds, selectedDb) {
  const mysql = require("mysql2/promise")
  const conn = await mysql.createConnection({ host: creds.host, port: creds.port, user: creds.user, password: creds.password, connectTimeout: 5000 })
  try {
    const [dbRows] = await conn.query("SHOW DATABASES")
    const skip = new Set(["information_schema", "performance_schema", "mysql", "sys"])
    const databases = dbRows.map(r => Object.values(r)[0]).filter(d => !skip.has(d))
    let tables = []
    if (selectedDb) {
      const [tRows] = await conn.query(
        "SELECT TABLE_NAME AS name, TABLE_ROWS AS rows FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_ROWS DESC",
        [selectedDb]
      )
      tables = tRows.map(r => ({ name: r.name, rows: Number(r.rows) || 0 }))
    }
    return { databases, tables }
  } finally { await conn.end() }
}

async function _redisSchema(creds) {
  const Redis = require("ioredis")
  const redis = new Redis({ host: creds.host, port: creds.port, password: creds.password || undefined, connectTimeout: 5000, lazyConnect: true })
  await redis.connect()
  try {
    const count = await redis.dbsize()
    return { databases: ["db0"], tables: [{ name: `${count} keys total`, rows: count }] }
  } finally { await redis.disconnect() }
}

async function _mongoSchema(creds, selectedDb) {
  const { MongoClient } = require("mongodb")
  const auth = creds.user ? `${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.password)}@` : ""
  const client = new MongoClient(`mongodb://${auth}${creds.host}:${creds.port}`, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  try {
    const dbs = await client.db("admin").admin().listDatabases()
    const skip = new Set(["admin", "local", "config"])
    const databases = dbs.databases.map(d => d.name).filter(n => !skip.has(n))
    let tables = []
    const targetDb = selectedDb || databases[0]
    if (targetDb) {
      const db = client.db(targetDb)
      const colls = await db.listCollections().toArray()
      tables = await Promise.all(colls.map(async c => ({
        name: c.name,
        rows: await db.collection(c.name).estimatedDocumentCount(),
      })))
    }
    return { databases, tables }
  } finally { await client.close() }
}

// ── Query execution ───────────────────────────────────────────────────────────

async function executeQuery(containerName, query, database) {
  const creds = await getDbCredentials(containerName)
  const start = Date.now()
  let result
  if (creds.engine === "postgres") result = await _runPostgres(creds, query, database)
  else if (creds.engine === "mysql")    result = await _runMysql(creds, query, database)
  else if (creds.engine === "redis")    result = await _runRedis(creds, query)
  else if (creds.engine === "mongodb")  result = await _runMongo(creds, query, database)
  else throw new Error(`Unsupported engine: ${creds.engine}`)
  return { ...result, durationMs: Date.now() - start }
}

async function _runPostgres(creds, query, database) {
  const { Client } = require("pg")
  const client = new Client({ host: creds.host, port: creds.port, user: creds.user, password: creds.password, database: database || creds.database, connectionTimeoutMillis: 5000 })
  await client.connect()
  try {
    const res = await client.query(query)
    const columns = res.fields?.map(f => f.name) || []
    const rows = (res.rows || []).slice(0, 100).map(r => columns.map(c => r[c] ?? null))
    return { columns, rows, rowCount: res.rowCount ?? rows.length }
  } finally { await client.end() }
}

async function _runMysql(creds, query, database) {
  const mysql = require("mysql2/promise")
  const conn = await mysql.createConnection({ host: creds.host, port: creds.port, user: creds.user, password: creds.password, database: database || creds.database || undefined, connectTimeout: 5000 })
  try {
    const [rows, fields] = await conn.query(query)
    if (!Array.isArray(rows)) {
      return { columns: ["affectedRows", "insertId"], rows: [[rows.affectedRows, rows.insertId]], rowCount: rows.affectedRows }
    }
    const columns = fields?.map(f => f.name) || []
    return { columns, rows: rows.slice(0, 100).map(r => columns.map(c => r[c] ?? null)), rowCount: rows.length }
  } finally { await conn.end() }
}

async function _runRedis(creds, command) {
  const Redis = require("ioredis")
  const redis = new Redis({ host: creds.host, port: creds.port, password: creds.password || undefined, connectTimeout: 5000, lazyConnect: true })
  await redis.connect()
  try {
    const parts = command.trim().split(/\s+/)
    const result = await redis.call(...parts)
    if (Array.isArray(result)) {
      const columns = ["index", "value"]
      const rows = result.map((v, i) => [String(i), String(v ?? "nil")])
      return { columns, rows, rowCount: rows.length }
    }
    return { columns: ["result"], rows: [[String(result ?? "nil")]], rowCount: 1 }
  } finally { await redis.disconnect() }
}

async function _runMongo(creds, query, database) {
  const { MongoClient } = require("mongodb")
  const match = query.trim().match(/^(\S+)\s*(.*)$/s)
  if (!match) throw new Error("Format: <collection> {json filter}")
  const [, collection, filterStr] = match
  let filter = {}
  if (filterStr.trim()) {
    try { filter = JSON.parse(filterStr) }
    catch { throw new Error("Invalid JSON filter — use format: {\"key\": \"value\"}") }
  }
  const auth = creds.user ? `${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.password)}@` : ""
  const client = new MongoClient(`mongodb://${auth}${creds.host}:${creds.port}`, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  try {
    const docs = await client.db(database || creds.database).collection(collection).find(filter).limit(100).toArray()
    if (docs.length === 0) return { columns: [], rows: [], rowCount: 0 }
    const columns = [...new Set(docs.flatMap(d => Object.keys(d)))]
    const rows = docs.map(d => columns.map(c => {
      const v = d[c]
      return v == null ? null : typeof v === "object" ? JSON.stringify(v) : v
    }))
    return { columns, rows, rowCount: docs.length }
  } finally { await client.close() }
}

// ── Safety validation ─────────────────────────────────────────────────────────

function isDestructiveQuery(query) {
  const q = query.toUpperCase().replace(/\s+/g, " ").trim()
  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b/.test(q)) return true
  if (/\bTRUNCATE\b/.test(q)) return true
  if (/\bDELETE\s+FROM\b/.test(q) && !/\bWHERE\b/.test(q)) return true
  if (/\bUPDATE\b/.test(q) && !/\bWHERE\b/.test(q)) return true
  return false
}

module.exports = { getDbSchema, executeQuery, isDestructiveQuery }
