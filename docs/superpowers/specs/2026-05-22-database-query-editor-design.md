# Database Query Editor — Design Spec

**Date:** 2026-05-22
**Status:** Approved

## Summary

Add an inline query editor to the Databases page so users can browse schemas, select tables, and run SQL/commands against any detected database cluster — whether managed by Coolify or deployed directly on the VPS. Credentials are auto-detected from Docker container environment variables and never exposed to the browser.

---

## Decisions

| Question | Decision |
|---|---|
| Layout | Inline panel below the DB card grid |
| Engines | PostgreSQL, MySQL/MariaDB, Redis, MongoDB |
| Credentials | Auto-detect from Docker container env vars (server-side only) |
| Safety | Warn on destructive queries (client + server validation) |
| Query executor | Node.js (`pg`, `mysql2`, `ioredis`, `mongodb` drivers) |

---

## UI Design

### Card Selection

- Clicking "Query" on a DB card **highlights it** with a blue ring and **expands the query editor panel below** the card grid
- Other cards dim slightly to indicate only one can be active at a time
- Clicking the close button or pressing Escape collapses the panel

### Query Editor Panel

**Header bar:**
- DB name badge + engine color dot
- Database dropdown (lists all databases in the cluster)
- Schema name (e.g. `public` for Postgres)
- Connection status indicator (green dot = connected, red = error)
- Close button

**Left sidebar (180px):**
- "Tables" section label with row counts
- Clicking a table auto-runs `SELECT * FROM <table> LIMIT 100`
- Active table highlighted in blue

**Editor area:**
- Syntax-highlighted `<textarea>` (monospace, dark theme matching app)
- `Ctrl+Enter` keyboard shortcut to run
- Hard 100-row limit displayed as hint
- "Run" button (primary) + "Clear" button

**Results panel:**
- Row count + execution time in ms
- Scrollable table with column headers and rows
- "Export CSV" button top-right
- Inline error banner for query errors (syntax, permissions)

### Engine-Specific Adaptations

- **Redis:** Command input instead of SQL (`GET key`, `KEYS *`, `SET key value`). Results shown as key/value pairs.
- **MongoDB:** Collection browser in sidebar (not tables). JSON filter input (`{"active": true}`). Results shown as document rows.
- **Postgres / MySQL:** Full SQL editor with schema browser.

---

## Backend Architecture

### New file: `server/database.js`

**`getDbCredentials(containerName)`**
- Inspects Docker container env vars via `dockerode`
- Per-engine extraction:
  - Postgres: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  - MySQL: `MYSQL_USER` / `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`
  - Redis: `REDIS_PASSWORD` (optional — omit if absent)
  - MongoDB: `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`
- Returns connection object; **never returned to browser**

**`getDbSchema(containerName, engine, connInfo)`**
- Postgres/MySQL: queries `information_schema.tables` for table list + row estimates
- Redis: returns `DBSIZE` + key scan sample
- MongoDB: returns collection list with document counts
- Returns `{ databases: string[], tables: { name, rows }[] }`

**`executeQuery(engine, connInfo, query, database)`**
- Opens short-lived connection per request
- Dispatches to engine driver: `pg`, `mysql2/promise`, `ioredis`, `mongodb`
- Normalises response to `{ columns: string[], rows: any[][], rowCount: number, durationMs: number }`
- Closes connection after execution

### New Routes in `server/index.js`

```
GET  /api/database/:name/schema?database=myapp_db   → databases list + table list for selected DB
POST /api/database/:name/query                       → execute query, return results
```

`GET /api/database/:name/schema` — omitting `?database` returns only the databases list (for the dropdown); including it also returns tables.

`POST /api/database/:name/query` body:
```json
{ "query": "SELECT * FROM users LIMIT 10", "database": "myapp_db" }
```

### Server-Side Safety Validation

Before executing, check for destructive patterns even if the client already warned:
- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`
- `DELETE FROM` without a `WHERE` clause
- `UPDATE` without a `WHERE` clause

Returns `HTTP 422` with a descriptive message if detected without explicit `{ "force": true }` in the body.

---

## Credential Auto-Detection Flow

1. User clicks "Query" → `GET /api/database/postgres-main/schema`
2. Node.js calls Docker API to inspect container `postgres-main` env vars
3. Credentials extracted server-side, connection opened, schema fetched
4. Schema returned to browser (database list + table list)
5. User writes query, clicks Run → `POST /api/database/postgres-main/query`
6. Node.js reads credentials again from Docker, connects, executes, closes connection
7. Returns `{ columns, rows, rowCount, durationMs }` — no credentials in response

---

## Frontend Changes

### `app/databases/page.tsx`

- Add `selectedDb: string | null` state
- Pass `onSelect` callback to `DbCard`
- Render `<DatabaseQueryEditor db={selectedDb} />` below the card grid when `selectedDb` is set

### `components/dashboard/DatabaseQueryEditor.tsx` (new)

Sub-components:
- `SchemaSidebar` — database dropdown + table list
- `QueryInput` — textarea with keyboard shortcut handler
- `ResultsTable` — column headers + rows + export
- `DestructiveWarningDialog` — wraps existing `AlertDialog` pattern from the app

State:
- `databases: string[]` — populated on mount
- `selectedDatabase: string`
- `tables: { name, rows }[]`
- `query: string`
- `result: { columns, rows, rowCount, durationMs } | null`
- `error: string | null`
- `loading: boolean`

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Container not running | Inline error banner: "Container is not running" |
| No credentials found in env | Inline error: "No credentials detected — set POSTGRES_PASSWORD on the container" |
| Connection refused | Inline error: "Could not connect — is the container healthy?" |
| Query syntax error | Inline error below run button with DB error message |
| Destructive query (no force) | Warning dialog — user must confirm to proceed |
| Result > 100 rows | Hard-limited server-side; note shown in results bar |

---

## Files to Create / Modify

| File | Change |
|---|---|
| `server/database.js` | New — credential detection + query execution |
| `server/index.js` | Add `GET /api/database/:name/schema` and `POST /api/database/:name/query` |
| `components/dashboard/DatabaseQueryEditor.tsx` | New — full inline editor component |
| `app/databases/page.tsx` | Add selected state + render `DatabaseQueryEditor` |
| `server/package.json` | Add `pg`, `mysql2`, `ioredis`, `mongodb` drivers |
