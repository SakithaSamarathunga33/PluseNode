"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { nodeApi } from "@/lib/api"
import type { ApiError } from "@/lib/api"
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
  engine,
  onTableClick,
  onCreateDb,
}: {
  tables: Array<{ name: string; rows: number }>
  engine: string
  onTableClick: (name: string) => void
  onCreateDb: (name: string) => void
}) {
  const [newDbName, setNewDbName] = useState("")
  const [creating,  setCreating]  = useState(false)
  const supportsCreate = engine === "postgres" || engine === "mysql"

  async function handleCreate() {
    const name = newDbName.trim()
    if (!name) return
    setCreating(true)
    try {
      await onCreateDb(name)
      setNewDbName("")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="w-[180px] flex-shrink-0 bg-pulseNode-navy border-r border-pulseNode-border/10 flex flex-col">
      {/* Create database form */}
      {supportsCreate && (
        <div className="px-2 pt-2 pb-1.5 border-b border-pulseNode-border/10">
          <div className="text-[9px] uppercase tracking-wider text-helm-fg3 mb-1.5 font-semibold px-1">
            New Database
          </div>
          <div className="flex gap-1">
            <input
              value={newDbName}
              onChange={e => setNewDbName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="db_name"
              className="flex-1 min-w-0 bg-pulseNode-navyLight border border-pulseNode-border/20 text-helm-fg text-[10px] font-mono rounded px-1.5 py-1 outline-none focus:border-pn-electric/50 placeholder:text-helm-fg3/40"
            />
            <button
              onClick={handleCreate}
              disabled={!newDbName.trim() || creating}
              className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:bg-pulseNode-border/20 disabled:text-helm-fg3 text-white text-[10px] font-bold px-1.5 py-1 rounded transition-colors"
            >
              {creating ? "…" : "+"}
            </button>
          </div>
        </div>
      )}

      {/* Tables list */}
      <div className="flex-1 overflow-y-auto p-2">
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
              title={`Click to view data`}
              className="w-full text-left px-2 py-1 rounded text-[11px] font-mono text-helm-fg3 hover:text-pn-electric hover:bg-pulseNode-border/10 flex items-center justify-between gap-1 group transition-colors"
            >
              <span className="truncate group-hover:underline">{t.name}</span>
              <span className="text-[9px] text-helm-fg3 flex-shrink-0">
                {t.rows > 0 ? t.rows.toLocaleString() : "—"}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ── QueryResult ───────────────────────────────────────────────────────────────

function QueryResult({ result }: { result: DbQueryResult }) {
  const isSelect = result.columns.length > 0
  const isDml    = !isSelect && result.rowCount > 0
  const isDdl    = !isSelect && result.rowCount === 0

  function exportCsv() {
    const header = result.columns.join(",")
    const body   = result.rows.map(r => r.map(v => JSON.stringify(v ?? "")).join(",")).join("\n")
    const blob   = new Blob([header + "\n" + body], { type: "text/csv" })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement("a")
    a.href = url; a.download = "query-result.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  // DDL / non-returning statement
  if (isDdl) return (
    <div className="border-t border-pulseNode-border/10 px-4 py-3 flex items-center gap-2 bg-emerald-500/5">
      <span className="text-emerald-400 text-base">✓</span>
      <span className="text-xs text-emerald-400 font-medium">Query executed successfully</span>
      <span className="text-[10px] text-helm-fg3 ml-auto">{result.durationMs}ms</span>
    </div>
  )

  // INSERT / UPDATE / DELETE with affected rows
  if (isDml) return (
    <div className="border-t border-pulseNode-border/10 px-4 py-3 flex items-center gap-2 bg-emerald-500/5">
      <span className="text-emerald-400 text-base">✓</span>
      <span className="text-xs text-emerald-400 font-medium">
        {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} affected
      </span>
      <span className="text-[10px] text-helm-fg3 ml-auto">{result.durationMs}ms</span>
    </div>
  )

  // SELECT result table
  return (
    <div className="border-t border-pulseNode-border/10">
      <div className="px-3 py-1.5 bg-pulseNode-navy/50 flex items-center gap-2 border-b border-pulseNode-border/10">
        <span className="text-[10px] text-green-400">
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
        </span>
        <span className="text-pulseNode-border/30">·</span>
        <span className="text-[10px] text-helm-fg3">{result.durationMs}ms</span>
        <button onClick={exportCsv} className="ml-auto text-[10px] text-helm-fg3 hover:text-helm-fg transition-colors">
          Export CSV
        </button>
      </div>
      <div className="overflow-auto max-h-48">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-pulseNode-navyLight sticky top-0">
              {result.columns.map(c => (
                <th key={c} className="px-3 py-1.5 text-left text-helm-fg3 font-normal border-b border-pulseNode-border/10 whitespace-nowrap">
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
                    {cell == null ? <span className="text-helm-fg3 italic">null</span> : String(cell)}
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

// ── DatabaseQueryEditor ───────────────────────────────────────────────────────

export function DatabaseQueryEditor({
  db,
  onClose,
}: {
  db: Database
  onClose: () => void
}) {
  const [schema,           setSchema]           = useState<DbSchemaResult>({ databases: [], tables: [] })
  const [selectedDatabase, setSelectedDatabase] = useState("")
  const [query,            setQuery]            = useState("")
  const [result,           setResult]           = useState<DbQueryResult | null>(null)
  const [error,            setError]            = useState<string | null>(null)
  const [loading,          setLoading]          = useState(false)
  const [showWarning,      setShowWarning]      = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isRedis = db.engine === "redis"
  const isMongo = db.engine === "mongodb"
  const hasQuery = query.trim().length > 0

  function loadSchema(dbName?: string) {
    const qs = dbName ? `?database=${encodeURIComponent(dbName)}` : ""
    nodeApi
      .get<DbSchemaResult>(`/api/database/${db.name}/schema${qs}`)
      .then(({ data }) => {
        setSchema(prev => ({
          databases: data.databases.length ? data.databases : prev.databases,
          tables:    data.tables,
        }))
        if (!dbName && data.databases.length > 0) setSelectedDatabase(data.databases[0])
      })
      .catch(err => setError((err as ApiError).message ?? "Failed to load schema"))
  }

  // Load database list on mount
  useEffect(() => { loadSchema() }, [db.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload table list when selected database changes
  useEffect(() => {
    if (!selectedDatabase) return
    loadSchema(selectedDatabase)
  }, [db.name, selectedDatabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const runQuery = useCallback(
    async (force = false) => {
      if (!hasQuery) return
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
        // Refresh sidebar tables so newly created tables appear immediately
        loadSchema(selectedDatabase || undefined)
      } catch (err: unknown) {
        const apiErr = err as ApiError
        if (apiErr?.status === 422) {
          setShowWarning(true)
        } else {
          setError(apiErr?.message || "Query failed")
          // Refresh sidebar even on error — prior statements may have committed
          loadSchema(selectedDatabase || undefined)
        }
      } finally {
        setLoading(false)
      }
    },
    [query, db.name, selectedDatabase, hasQuery] // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function handleCreateDb(name: string) {
    setError(null)
    try {
      await nodeApi.post(`/api/database/${db.name}/query`, {
        query: `CREATE DATABASE ${name};`,
        force: false,
      })
      // Refresh database list
      loadSchema()
    } catch (err: unknown) {
      setError((err as ApiError).message || "Failed to create database")
    }
  }

  async function handleTableClick(tableName: string) {
    const q = isRedis ? "KEYS *"
            : isMongo ? `${tableName} {}`
            : `SELECT * FROM ${tableName} LIMIT 100;`
    setQuery(q)
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const res = await nodeApi.post<DbQueryResult>(`/api/database/${db.name}/query`, {
        query: q,
        database: selectedDatabase || undefined,
        force: false,
      })
      setResult(res)
    } catch (err: unknown) {
      setError((err as ApiError)?.message || "Query failed")
    } finally {
      setLoading(false)
    }
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
          <span className={`text-[10px] ${error && !result ? "text-red-400" : "text-green-400"}`}>
            {error && !result ? "● error" : "● connected"}
          </span>
          <button
            onClick={onClose}
            aria-label="Close query editor"
            className="ml-auto text-helm-fg3 hover:text-helm-fg text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body: sidebar + editor */}
        <div className="flex" style={{ minHeight: 260 }}>
          <SchemaSidebar
            tables={schema.tables}
            engine={db.engine}
            onTableClick={handleTableClick}
            onCreateDb={handleCreateDb}
          />

          <div className="flex-1 flex flex-col min-w-0">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-pulseNode-navy font-mono text-xs text-helm-fg p-3 resize-none outline-none placeholder:text-helm-fg3/40"
              style={{ minHeight: 180 }}
              spellCheck={false}
            />
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 bg-pulseNode-navy border-t border-pulseNode-border/10 flex-shrink-0">
              <button
                onClick={() => runQuery()}
                disabled={loading}
                className={`
                  text-xs font-semibold px-3 py-1.5 rounded-md transition-all
                  ${hasQuery && !loading
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                    : "bg-pulseNode-border/20 text-helm-fg3 cursor-not-allowed"
                  }
                `}
              >
                {loading ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={() => { setQuery(""); setResult(null); setError(null) }}
                className="text-xs text-helm-fg3 hover:text-helm-fg border border-pulseNode-border/20 px-3 py-1.5 rounded-md transition-colors"
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

        {/* Error / warning banner */}
        {error && (() => {
          const isWarn = /already exists|duplicate/i.test(error)
          return (
            <div className={`px-4 py-2.5 border-t flex items-start gap-2 ${
              isWarn
                ? "bg-amber-500/10 border-amber-500/20"
                : "bg-red-500/10 border-red-500/20"
            }`}>
              <span className={`flex-shrink-0 mt-0.5 ${isWarn ? "text-amber-400" : "text-red-400"}`}>
                {isWarn ? "⚠" : "✕"}
              </span>
              <p className={`text-xs font-mono break-all ${isWarn ? "text-amber-400" : "text-red-400"}`}>
                {error}
                {isWarn && <span className="ml-2 not-italic opacity-70">(other statements in the batch may have succeeded)</span>}
              </p>
            </div>
          )
        })()}

        {/* Results */}
        {result && <QueryResult result={result} />}
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
