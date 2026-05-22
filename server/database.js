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

// ── Metrics ───────────────────────────────────────────────────────────────────

function _fmtUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

async function getDbMetrics(containerName) {
  const creds = await getDbCredentials(containerName)
  if (creds.engine === "postgres") return _pgMetrics(creds)
  if (creds.engine === "mysql")    return _myMetrics(creds)
  if (creds.engine === "redis")    return _redisMetrics2(creds)
  if (creds.engine === "mongodb")  return _mongoMetrics(creds)
  throw new Error(`Unsupported engine: ${creds.engine}`)
}

async function _pgMetrics(creds) {
  const { Client } = require("pg")
  const client = new Client({ host: creds.host, port: creds.port, user: creds.user, password: creds.password, database: creds.database, connectionTimeoutMillis: 5000 })
  await client.connect()
  try {
    const [statsRes, sizeRes, activeRes] = await Promise.all([
      client.query(
        `SELECT numbackends,xact_commit,xact_rollback,
                ROUND(blks_hit::numeric/NULLIF(blks_hit+blks_read,0)*100,1) AS cache_hit_pct,
                tup_inserted,tup_updated,tup_deleted,tup_fetched
         FROM pg_stat_database WHERE datname=$1`, [creds.database]),
      client.query(`SELECT pg_size_pretty(pg_database_size($1)) AS size`, [creds.database]),
      client.query(`SELECT count(*)::int AS active FROM pg_stat_activity WHERE state='active'`),
    ])
    const s   = statsRes.rows[0] || {}
    const hit = s.cache_hit_pct !== null ? Number(s.cache_hit_pct) : null
    return { engine: "postgres", metrics: [
      { label: "Active Connections",  value: activeRes.rows[0]?.active ?? 0 },
      { label: "Total Connections",   value: s.numbackends ?? 0 },
      { label: "Cache Hit Rate",      value: hit !== null ? `${hit}%` : "—", tone: hit !== null ? (hit < 90 ? "warn" : "ok") : undefined },
      { label: "Database Size",       value: sizeRes.rows[0]?.size ?? "—" },
      { label: "Commits",             value: Number(s.xact_commit ?? 0).toLocaleString() },
      { label: "Rollbacks",           value: Number(s.xact_rollback ?? 0), tone: Number(s.xact_rollback) > 0 ? "warn" : "ok" },
      { label: "Rows Fetched",        value: Number(s.tup_fetched ?? 0).toLocaleString() },
      { label: "Rows Inserted",       value: Number(s.tup_inserted ?? 0).toLocaleString() },
      { label: "Rows Updated",        value: Number(s.tup_updated ?? 0).toLocaleString() },
      { label: "Rows Deleted",        value: Number(s.tup_deleted ?? 0).toLocaleString() },
    ]}
  } finally { await client.end() }
}

async function _myMetrics(creds) {
  const mysql = require("mysql2/promise")
  const conn  = await mysql.createConnection({ host: creds.host, port: creds.port, user: creds.user, password: creds.password, connectTimeout: 5000 })
  try {
    const [rows] = await conn.query(
      `SHOW GLOBAL STATUS WHERE Variable_name IN (
        'Threads_connected','Threads_running','Questions',
        'Com_select','Com_insert','Com_update','Com_delete',
        'Innodb_buffer_pool_read_requests','Innodb_buffer_pool_reads',
        'Uptime','Aborted_connects')`)
    const m = Object.fromEntries(rows.map(r => [r.Variable_name, r.Value]))
    const bpReqs  = Number(m.Innodb_buffer_pool_read_requests || 0)
    const bpReads = Number(m.Innodb_buffer_pool_reads || 0)
    const bpHit   = bpReqs > 0 ? ((1 - bpReads / bpReqs) * 100).toFixed(1) : null
    return { engine: "mysql", metrics: [
      { label: "Threads Connected",    value: Number(m.Threads_connected ?? 0) },
      { label: "Threads Running",      value: Number(m.Threads_running ?? 0) },
      { label: "Total Queries",        value: Number(m.Questions ?? 0).toLocaleString() },
      { label: "SELECT",               value: Number(m.Com_select ?? 0).toLocaleString() },
      { label: "INSERT",               value: Number(m.Com_insert ?? 0).toLocaleString() },
      { label: "UPDATE",               value: Number(m.Com_update ?? 0).toLocaleString() },
      { label: "DELETE",               value: Number(m.Com_delete ?? 0).toLocaleString() },
      { label: "Buffer Pool Hit Rate", value: bpHit !== null ? `${bpHit}%` : "—", tone: bpHit !== null ? (Number(bpHit) < 90 ? "warn" : "ok") : undefined },
      { label: "Uptime",               value: _fmtUptime(Number(m.Uptime ?? 0)) },
      { label: "Aborted Connects",     value: Number(m.Aborted_connects ?? 0), tone: Number(m.Aborted_connects) > 0 ? "warn" : "ok" },
    ]}
  } finally { await conn.end() }
}

async function _redisMetrics2(creds) {
  const Redis = require("ioredis")
  const redis = new Redis({ host: creds.host, port: creds.port, password: creds.password || undefined, connectTimeout: 5000, lazyConnect: true })
  await redis.connect()
  try {
    const raw = await redis.info("all")
    const m   = Object.fromEntries(
      raw.split("\r\n").filter(l => l.includes(":")).map(l => { const [k,...v]=l.split(":"); return [k.trim(), v.join(":").trim()] })
    )
    const hits   = Number(m.keyspace_hits || 0)
    const misses = Number(m.keyspace_misses || 0)
    const hitPct = hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) : null
    const keys   = Number(m.db0?.match(/keys=(\d+)/)?.[1] ?? 0)
    return { engine: "redis", metrics: [
      { label: "Connected Clients",    value: Number(m.connected_clients ?? 0) },
      { label: "Used Memory",          value: m.used_memory_human ?? "—" },
      { label: "Peak Memory",          value: m.used_memory_peak_human ?? "—" },
      { label: "Total Keys",           value: keys },
      { label: "Keyspace Hits",        value: hits.toLocaleString() },
      { label: "Keyspace Misses",      value: misses.toLocaleString() },
      { label: "Hit Rate",             value: hitPct !== null ? `${hitPct}%` : "—", tone: hitPct !== null ? (Number(hitPct) < 80 ? "warn" : "ok") : undefined },
      { label: "Commands Processed",   value: Number(m.total_commands_processed ?? 0).toLocaleString() },
      { label: "Uptime",               value: _fmtUptime(Number(m.uptime_in_seconds ?? 0)) },
      { label: "Redis Version",        value: m.redis_version ?? "—" },
    ]}
  } finally { await redis.disconnect() }
}

async function _mongoMetrics(creds) {
  const { MongoClient } = require("mongodb")
  const auth   = creds.user ? `${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.password)}@` : ""
  const client = new MongoClient(`mongodb://${auth}${creds.host}:${creds.port}`, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  try {
    const st  = await client.db("admin").command({ serverStatus: 1 })
    const con = st.connections || {}
    const ops = st.opcounters  || {}
    const mem = st.mem         || {}
    return { engine: "mongodb", metrics: [
      { label: "Current Connections",  value: con.current ?? 0 },
      { label: "Available Connections",value: con.available ?? 0 },
      { label: "Queries",              value: Number(ops.query ?? 0).toLocaleString() },
      { label: "Inserts",              value: Number(ops.insert ?? 0).toLocaleString() },
      { label: "Updates",              value: Number(ops.update ?? 0).toLocaleString() },
      { label: "Deletes",              value: Number(ops.delete ?? 0).toLocaleString() },
      { label: "Virtual Memory",       value: `${mem.virtual ?? 0} MB` },
      { label: "Resident Memory",      value: `${mem.resident ?? 0} MB` },
      { label: "Uptime",               value: _fmtUptime(Number(st.uptimeSeconds ?? 0)) },
      { label: "MongoDB Version",      value: st.version ?? "—" },
    ]}
  } finally { await client.close() }
}

// ── Backup streaming ──────────────────────────────────────────────────────────

async function streamDbBackup(containerName, res) {
  const creds = await getDbCredentials(containerName)
  if (isMock()) throw new Error("Backup not available in mock mode")
  const docker = getDockerInstance()
  const date   = new Date().toISOString().slice(0, 10)

  let cmd, filename, contentType, env = []

  if (creds.engine === "postgres") {
    filename    = `${containerName}-${date}.sql`
    contentType = "text/plain; charset=utf-8"
    env         = [`PGPASSWORD=${creds.password}`]
    cmd         = ["pg_dump", "-U", creds.user, "-d", creds.database]
  } else if (creds.engine === "mysql") {
    filename    = `${containerName}-${date}.sql`
    contentType = "text/plain; charset=utf-8"
    cmd         = ["mysqldump", "-u", creds.user, `-p${creds.password}`, creds.database]
  } else if (creds.engine === "redis") {
    filename    = `${containerName}-${date}.rdb`
    contentType = "application/octet-stream"
    const auth  = creds.password ? `-a '${creds.password}'` : ""
    cmd         = ["sh", "-c", `redis-cli --no-auth-warning ${auth} SAVE && cat /data/dump.rdb`]
  } else if (creds.engine === "mongodb") {
    filename    = `${containerName}-${date}.archive`
    contentType = "application/octet-stream"
    const auth  = creds.user ? `--username '${creds.user}' --password '${creds.password}' --authenticationDatabase admin` : ""
    cmd         = ["sh", "-c", `mongodump --archive --db '${creds.database}' ${auth}`]
  } else {
    throw new Error(`Backup not supported for engine: ${creds.engine}`)
  }

  const exec   = await docker.getContainer(containerName).exec({ Cmd: cmd, AttachStdout: true, AttachStderr: false, Env: env })
  const stream = await exec.start({ hijack: true, stdin: false })

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.setHeader("Content-Type", contentType)
  docker.modem.demuxStream(stream, res, process.stderr)

  await new Promise((resolve, reject) => { stream.on("end", resolve); stream.on("error", reject) })
}

module.exports = { getDbSchema, executeQuery, isDestructiveQuery, getDbMetrics, streamDbBackup }
