# Database Query Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline query editor to the Databases page so users can browse DB schemas, select tables, and run SQL/commands against Postgres, MySQL, Redis, and MongoDB containers, with credentials auto-detected from Docker env vars.

**Architecture:** Node.js executes all queries using engine-specific drivers (`pg`, `mysql2`, `ioredis`, `mongodb`). A new `server/database.js` module reads Docker container env vars for credentials, fetches schema, and executes queries — credentials never leave the server. The frontend renders an inline editor panel that expands below the DB card grid when a card is selected.

**Tech Stack:** Node.js + `pg` + `mysql2` + `ioredis` + `mongodb` (server); React + Next.js + TypeScript (frontend); existing `AlertDialog`, `nodeApi` patterns from the codebase.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `pg`, `mysql2`, `ioredis`, `mongodb` |
| `lib/types.ts` | Modify | Add `DbSchemaResult`, `DbQueryResult` types |
| `server/database.js` | Create | Credential detection, schema fetch, query execution |
| `server/index.js` | Modify | Two new API routes |
| `components/dashboard/DatabaseQueryEditor.tsx` | Create | Full inline query editor UI |
| `app/databases/page.tsx` | Modify | Selected-card state + render editor |

---

## Task 1: Install Server-Side DB Drivers

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the four DB driver packages**

```bash
npm install pg mysql2 ioredis mongodb
```

Expected output: packages added to `node_modules` and `package.json` `dependencies`.

- [ ] **Step 2: Verify they resolve**

```bash
node -e "require('pg'); require('mysql2'); require('ioredis'); require('mongodb'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pg, mysql2, ioredis, mongodb drivers for query editor"
```

---

## Task 2: Add TypeScript Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Append the two new interfaces to the end of `lib/types.ts`**

```typescript
export interface DbSchemaResult {
  databases: string[]
  tables: Array<{ name: string; rows: number }>
}

export interface DbQueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  durationMs: number
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add DbSchemaResult and DbQueryResult types"
```

---

## Task 3: Create `server/database.js`

**Files:**
- Create: `server/database.js`

This module has three exported functions: `getDbSchema`, `executeQuery`, `isDestructiveQuery`. It also has private helpers for credential extraction, engine-specific connections, and host resolution.

- [ ] **Step 1: Create the file with credential detection and helpers**

```javascript
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
```

- [ ] **Step 2: Add schema fetching functions (append to the same file)**

```javascript
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
        const tRes = await dbClient.query("SELECT tablename AS name, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC")
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
  } finally { redis.disconnect() }
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
```

- [ ] **Step 3: Add query execution functions (append to the same file)**

```javascript
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
  } finally { redis.disconnect() }
}

async function _runMongo(creds, query, database) {
  const { MongoClient } = require("mongodb")
  const match = query.trim().match(/^(\S+)\s*(.*)$/s)
  if (!match) throw new Error("Format: <collection> {json filter}")
  const [, collection, filterStr] = match
  const filter = filterStr.trim() ? JSON.parse(filterStr) : {}
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
```

- [ ] **Step 4: Add safety check and exports (append to the same file)**

```javascript
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
```

- [ ] **Step 5: Smoke-test the module loads without error**

```bash
node -e "const db = require('./server/database'); console.log(Object.keys(db))"
```

Expected output: `[ 'getDbSchema', 'executeQuery', 'isDestructiveQuery' ]`

- [ ] **Step 6: Commit**

```bash
git add server/database.js
git commit -m "feat: add server/database.js — credential detection and query execution"
```

---

## Task 4: Add API Routes to `server/index.js`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the import at the top of `server/index.js` alongside the other requires**

Find this line in `server/index.js`:
```javascript
const { getHostInfo, getCpuUsage, getDisk, getNetworkRates }       = require("./host")
```

Add directly below it:
```javascript
const { getDbSchema, executeQuery, isDestructiveQuery }            = require("./database")
```

- [ ] **Step 2: Add the two routes to `server/index.js`**

Find the Coolify routes section (search for `/* ── Coolify routes`). Add the following block **before** it:

```javascript
/* ── Database query routes ─────────────────────────────────────────────────── */

/** Return database list and (optionally) table list for a DB container */
app.get("/api/database/:name/schema", async (req, res) => {
  try {
    const schema = await getDbSchema(req.params.name, req.query.database || null)
    res.json(schema)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** Execute a query against a DB container */
app.post("/api/database/:name/query", async (req, res) => {
  const { query, database, force } = req.body
  if (!query || typeof query !== "string")
    return res.status(400).json({ error: "query is required" })
  if (!force && isDestructiveQuery(query))
    return res.status(422).json({ error: "Destructive query detected. Send force:true to proceed." })
  try {
    const result = await executeQuery(req.params.name, query, database || null)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 3: Start the server and verify both routes exist**

```bash
node server/index.js &
sleep 2
curl -s http://localhost:4001/health
```

Expected: `{"ok":true,"ts":<timestamp>}`

```bash
curl -s http://localhost:4001/api/database/nonexistent/schema 2>&1 | head -3
kill %1
```

Expected: a JSON object with an `error` key (container not found is expected).

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add GET /api/database/:name/schema and POST /api/database/:name/query routes"
```

---

## Task 5: Create `DatabaseQueryEditor` Component

**Files:**
- Create: `components/dashboard/DatabaseQueryEditor.tsx`

- [ ] **Step 1: Create the file with sub-components and imports**

```tsx
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { nodeApi } from "@/lib/api"
import type { Database, DbSchemaResult, DbQueryResult } from "@/lib/types"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

// ── SchemaSidebar ─────────────────────────────────────────────────────────────

function SchemaSidebar({
  tables,
  onTableClick,
}: {
  tables: Array<{ name: string; rows: number }>
  onTableClick: (name: string) => void
}) {
  return (
    <div className="w-[180px] flex-shrink-0 bg-pulseNode-navy border-r border-pulseNode-border/10 p-2 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider text-helm-fg3 mb-2 font-semibold px-1">
        Tables
      </div>
      {tables.length === 0 ? (
        <p className="text-[10px] text-helm-fg3 px-1">No tables found</p>
      ) : (
        tables.map(t => (
          <button
            key={t.name}
            onClick={() => onTableClick(t.name)}
            className="w-full text-left px-2 py-1 rounded text-[11px] font-mono text-helm-fg3 hover:text-helm-fg hover:bg-pulseNode-border/10 flex items-center justify-between gap-1"
          >
            <span className="truncate">{t.name}</span>
            <span className="text-[9px] text-helm-fg3 flex-shrink-0">
              {t.rows.toLocaleString()}
            </span>
          </button>
        ))
      )}
    </div>
  )
}

// ── ResultsTable ──────────────────────────────────────────────────────────────

function ResultsTable({ result }: { result: DbQueryResult }) {
  function exportCsv() {
    const header = result.columns.join(",")
    const body = result.rows
      .map(r => r.map(v => JSON.stringify(v ?? "")).join(","))
      .join("\n")
    const blob = new Blob([header + "\n" + body], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "query-result.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border-t border-pulseNode-border/10">
      <div className="px-3 py-1.5 bg-pulseNode-navy/50 flex items-center gap-2 border-b border-pulseNode-border/10">
        <span className="text-[10px] text-green-400">
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
        </span>
        <span className="text-pulseNode-border/30">·</span>
        <span className="text-[10px] text-helm-fg3">{result.durationMs}ms</span>
        <button
          onClick={exportCsv}
          className="ml-auto text-[10px] text-helm-fg3 hover:text-helm-fg transition-colors"
        >
          Export CSV
        </button>
      </div>
      <div className="overflow-auto max-h-48">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-pulseNode-navyLight sticky top-0">
              {result.columns.map(c => (
                <th
                  key={c}
                  className="px-3 py-1.5 text-left text-helm-fg3 font-normal border-b border-pulseNode-border/10 whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-b border-pulseNode-border/5 hover:bg-pulseNode-border/5">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="px-3 py-1 font-mono text-helm-fg whitespace-nowrap max-w-[200px] truncate"
                    title={cell == null ? "null" : String(cell)}
                  >
                    {cell == null
                      ? <span className="text-helm-fg3 italic">null</span>
                      : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the main `DatabaseQueryEditor` export (append to the same file)**

```tsx
// ── DatabaseQueryEditor ───────────────────────────────────────────────────────

export function DatabaseQueryEditor({
  db,
  onClose,
}: {
  db: Database
  onClose: () => void
}) {
  const [schema, setSchema] = useState<DbSchemaResult>({ databases: [], tables: [] })
  const [selectedDatabase, setSelectedDatabase] = useState("")
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<DbQueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isRedis = db.engine === "redis"
  const isMongo = db.engine === "mongodb"

  // Load database list on mount
  useEffect(() => {
    nodeApi
      .get<DbSchemaResult>(`/api/database/${db.name}/schema`)
      .then(({ data }) => {
        setSchema(data)
        if (data.databases.length > 0) setSelectedDatabase(data.databases[0])
      })
      .catch(err => setError(err.message))
  }, [db.name])

  // Reload table list when selected database changes
  useEffect(() => {
    if (!selectedDatabase) return
    nodeApi
      .get<DbSchemaResult>(`/api/database/${db.name}/schema?database=${encodeURIComponent(selectedDatabase)}`)
      .then(({ data }) => setSchema(prev => ({ ...prev, tables: data.tables })))
      .catch(() => {})
  }, [db.name, selectedDatabase])

  const runQuery = useCallback(
    async (force = false) => {
      if (!query.trim()) return
      setLoading(true)
      setError(null)
      setResult(null)
      try {
        const res = await nodeApi.post<DbQueryResult>(`/api/database/${db.name}/query`, {
          query,
          database: selectedDatabase || undefined,
          force,
        })
        setResult(res)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Query failed"
        if (msg.startsWith("422")) {
          setShowWarning(true)
        } else {
          setError(msg)
        }
      } finally {
        setLoading(false)
      }
    },
    [query, db.name, selectedDatabase]
  )

  function handleTableClick(tableName: string) {
    if (isRedis) setQuery("KEYS *")
    else if (isMongo) setQuery(`${tableName} {}`)
    else setQuery(`SELECT * FROM ${tableName} LIMIT 100;`)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      runQuery()
    }
  }

  const placeholder = isRedis
    ? "KEYS *\nGET mykey\nSET mykey value"
    : isMongo
    ? "users {\"active\": true}\ncollectionName {}"
    : "SELECT * FROM users LIMIT 100;"

  return (
    <>
      <div className="bg-pulseNode-navyLight rounded-xl border border-pn-electric/20 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-pulseNode-navy border-b border-pulseNode-border/10">
          <span className="font-semibold text-sm text-helm-fg">{db.name}</span>
          {!isRedis && !isMongo && schema.databases.length > 0 && (
            <>
              <span className="text-pulseNode-border/30">|</span>
              <select
                value={selectedDatabase}
                onChange={e => setSelectedDatabase(e.target.value)}
                className="bg-pulseNode-navyLight border border-pulseNode-border/20 text-helm-fg text-xs rounded px-2 py-0.5 cursor-pointer"
              >
                {schema.databases.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </>
          )}
          <span className="text-[10px] text-green-400">● connected</span>
          <button
            onClick={onClose}
            aria-label="Close query editor"
            className="ml-auto text-helm-fg3 hover:text-helm-fg text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body: sidebar + editor */}
        <div className="flex" style={{ height: 280 }}>
          <SchemaSidebar tables={schema.tables} onTableClick={handleTableClick} />

          <div className="flex-1 flex flex-col min-w-0">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-pulseNode-navy font-mono text-xs text-helm-fg p-3 resize-none outline-none placeholder:text-helm-fg3/40"
              spellCheck={false}
            />
            <div className="flex items-center gap-2 px-3 py-2 bg-pulseNode-navy border-t border-pulseNode-border/10">
              <button
                onClick={() => runQuery()}
                disabled={loading || !query.trim()}
                className="bg-pn-electric text-white text-xs font-medium px-3 py-1 rounded-md hover:bg-pn-electric/90 disabled:opacity-40 transition-colors"
              >
                {loading ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={() => { setQuery(""); setResult(null); setError(null) }}
                className="text-xs text-helm-fg3 hover:text-helm-fg border border-pulseNode-border/20 px-3 py-1 rounded-md transition-colors"
              >
                Clear
              </button>
              <span className="ml-auto text-[10px] text-helm-fg3">
                {isRedis
                  ? "Redis command"
                  : isMongo
                  ? "collection {filter}"
                  : "Ctrl+↵ to run · 100 row limit"}
              </span>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && <ResultsTable result={result} />}
      </div>

      {/* Destructive query confirmation dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destructive query detected</AlertDialogTitle>
            <AlertDialogDescription>
              This query may permanently delete or modify data (DROP, TRUNCATE, or DELETE/UPDATE without WHERE). Are you sure you want to run it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowWarning(false); runQuery(true) }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Run anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/DatabaseQueryEditor.tsx
git commit -m "feat: add DatabaseQueryEditor inline component"
```

---

## Task 6: Wire Up the Editor in the Databases Page

**Files:**
- Modify: `app/databases/page.tsx`

- [ ] **Step 1: Add the import for `DatabaseQueryEditor` at the top of `app/databases/page.tsx`**

Find the existing imports block. Add this line after the last import:

```tsx
import { DatabaseQueryEditor } from "@/components/dashboard/DatabaseQueryEditor"
```

- [ ] **Step 2: Update the `DbCard` component to accept and call `onQueryClick`**

Find this in `app/databases/page.tsx`:
```tsx
function DbCard({ db, connHist }: { db: Database; connHist: number[] }) {
```

Replace with:
```tsx
function DbCard({ db, connHist, onQueryClick }: { db: Database; connHist: number[]; onQueryClick: () => void }) {
```

- [ ] **Step 3: Wire the "Query" button in `DbCard` to call `onQueryClick`**

Find this footer button in `DbCard`:
```tsx
<ActionBtn>Query</ActionBtn>
```

Replace with:
```tsx
<button
  onClick={onQueryClick}
  className="flex-1 border border-pn-electric/30 text-pn-electric hover:bg-pn-electric/10 px-2 py-1 rounded-lg text-xs transition-colors text-center"
>
  Query
</button>
```

- [ ] **Step 4: Add `selectedDb` state to `DatabasesPage` and the editor below the grid**

Find this state block in `DatabasesPage`:
```tsx
  const [databases,   setDatabases]   = useState<Database[]>([])
  const [connHist,    setConnHist]    = useState<Record<string, number[]>>({})
  const [totalConns,  setTotalConns]  = useState(0)
  const [connHistory, setConnHistory] = useState<number[]>([0])
```

Replace with:
```tsx
  const [databases,   setDatabases]   = useState<Database[]>([])
  const [connHist,    setConnHist]    = useState<Record<string, number[]>>({})
  const [totalConns,  setTotalConns]  = useState(0)
  const [connHistory, setConnHistory] = useState<number[]>([0])
  const [selectedDb,  setSelectedDb]  = useState<Database | null>(null)
```

- [ ] **Step 5: Pass `onQueryClick` to each `DbCard` and render the editor below the grid**

Find this in the return JSX of `DatabasesPage`:
```tsx
          {databases.map(db => (
            <DbCard
              key={db.name}
              db={db}
              connHist={connHist[db.name] ?? connHist[db.host] ?? []}
            />
          ))}
        </div>
```

Replace with:
```tsx
          {databases.map(db => (
            <DbCard
              key={db.name}
              db={db}
              connHist={connHist[db.name] ?? connHist[db.host] ?? []}
              onQueryClick={() => setSelectedDb(prev => prev?.name === db.name ? null : db)}
            />
          ))}
        </div>

        {selectedDb && (
          <DatabaseQueryEditor
            db={selectedDb}
            onClose={() => setSelectedDb(null)}
          />
        )}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Start the dev server and manually test the golden path**

```bash
npm run dev
```

Open `http://localhost:3000/databases` in a browser.

Verify:
1. DB cards render as before
2. Clicking "Query" on a card opens the editor panel below the grid
3. Clicking "Query" again on the same card closes the editor
4. Clicking "Query" on a different card switches to that DB's editor
5. The schema sidebar loads (may show "No tables found" if no live DB is connected — that's correct)
6. Typing in the editor and pressing Ctrl+Enter attempts a query
7. The close (✕) button dismisses the editor

- [ ] **Step 8: Commit**

```bash
git add app/databases/page.tsx
git commit -m "feat: wire DatabaseQueryEditor into databases page — inline query editor complete"
```

---

## Self-Review Notes

- **Spec coverage check:** All sections of the design spec are covered — UI (card selection, sidebar, editor, results, error banner), backend (credential detection per engine, schema endpoint, query endpoint, safety validation), credential flow, error handling table, and file map.
- **No placeholders:** All steps contain real code.
- **Type consistency:** `DbSchemaResult` and `DbQueryResult` defined in Task 2 (types.ts) and used identically in Task 5 (component). `getDbSchema` / `executeQuery` / `isDestructiveQuery` defined in Task 3 and imported in Task 4.
- **`nodeApi.post` return type:** `nodeApi.post<T>` returns `Promise<T>` directly (not `{ data: T }`), which matches how it's used in Task 5 Step 2.
