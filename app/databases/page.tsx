"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database as DatabaseIcon,
  Download,
  Gauge,
  HardDrive,
  PlugZap,
  Plus,
  Search,
  TerminalSquare,
} from "lucide-react"
import { nodeApi, pythonApi, API_BASE } from "@/lib/api"
import type { CustomConnection, Database, DbMetrics, DbSchemaResult } from "@/lib/types"
import { DatabaseQueryEditor } from "@/components/dashboard/DatabaseQueryEditor"
import { DatabaseMetricsPanel } from "@/components/dashboard/DatabaseMetricsPanel"
import { CreateDatabaseModal } from "@/components/dashboard/CreateDatabaseModal"
import { ConnectDatabaseModal } from "@/components/dashboard/ConnectDatabaseModal"
import { DbIcon } from "@/components/dashboard/DbIcon"

type TabId = "overview" | "query" | "metrics"

function TabBtn({ active, onClick, label, icon: Icon }: {
  active: boolean; onClick: () => void; label: string; icon: typeof DatabaseIcon
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
        active
          ? "border-pn-electric text-pn-electric"
          : "border-transparent text-helm-fg3 hover:text-helm-fg"
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

const ENGINE_COLOR: Record<string, string> = {
  postgres: "var(--db-postgres)",
  postgresql: "var(--db-postgres)",
  redis: "var(--db-redis)",
  mysql: "var(--db-mysql)",
  clickhouse: "var(--db-clickhouse)",
  mongodb: "var(--db-mongo)",
}

const STATUS_FILTERS = ["all", "ok", "warn", "bad"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function engineColor(engine: string) {
  return ENGINE_COLOR[engine.toLowerCase()] ?? "var(--db-other)"
}

function statusTone(state: string) {
  if (state === "ok") return "ok"
  if (state === "warn") return "warn"
  return "bad"
}

function triggerBackup(dbName: string) {
  const a = document.createElement("a")
  a.href = `${API_BASE}/api/database/${encodeURIComponent(dbName)}/backup`
  a.download = `${dbName}-backup`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function ConnSpark({ data, color }: { data: number[]; color: string }) {
  const values = data.length > 1 ? data : [0, 0]
  const w = 92
  const h = 28
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const step = w / (values.length - 1)
  const pts = values.map((v, i) =>
    `${(i * step).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`
  )
  const d = `M ${pts.join(" L ")}`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <path d={`${d} L ${w},${h} L 0,${h} Z`} fill={color} fillOpacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KpiTile({
  label,
  value,
  icon: Icon,
  tone = "var(--acc)",
  detail,
}: {
  label: string
  value: string | number
  icon: typeof DatabaseIcon
  tone?: string
  detail?: string
}) {
  return (
    <div className="gsap-enter min-w-0 rounded-lg border border-pulseNode-border/10 bg-pulseNode-navyLight px-3 py-2 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-helm-fg3">{label}</span>
        <Icon size={13} style={{ color: tone }} />
      </div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-lg font-semibold leading-none text-helm-fg">{value}</span>
        {detail && <span className="truncate pb-0.5 text-[10px] text-helm-fg3">{detail}</span>}
      </div>
    </div>
  )
}

function ConnectionStringPanel({ dbName }: { dbName: string }) {
  const [uri, setUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${API_BASE}/api/database/${encodeURIComponent(dbName)}/connection-string`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setUri(data.connectionString || null)
      })
      .catch(() => {
        if (!cancelled) setUri(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [dbName])

  function copy() {
    if (!uri) return
    navigator.clipboard.writeText(uri)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="rounded-lg border border-pulseNode-border/10 bg-pulseNode-navy/50">
      <div className="flex items-center gap-2 border-b border-pulseNode-border/10 px-3 py-2">
        <PlugZap size={13} className="text-pn-electric" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-helm-fg3">Connection string</span>
      </div>
      <div className="flex items-center gap-2 overflow-hidden px-3 py-2">
        {loading && <span className="text-xs text-helm-fg3">Loading…</span>}
        {!loading && uri && (
          <>
            <div className="min-w-0 flex-1 overflow-x-auto rounded-md bg-pulseNode-navyLight">
              <code className="block whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-helm-fg">
                {uri}
              </code>
            </div>
            <button onClick={copy} className="pn-icon-btn flex-shrink-0" title="Copy" aria-label="Copy connection string">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </>
        )}
        {!loading && !uri && <span className="text-xs text-red-400">Could not build connection string.</span>}
      </div>
    </div>
  )
}

function DbDetails({ db, onTableClick }: { db: Database; onTableClick?: (name: string) => void }) {
  const [dbs,        setDbs]        = useState<string[]>([])
  const [selectedDb, setSelectedDb] = useState("")
  const [tables,     setTables]     = useState<Array<{ name: string; rows: number }>>([])
  const [loading,    setLoading]    = useState(true)

  // Fetch databases list on mount
  useEffect(() => {
    nodeApi.get<DbSchemaResult>(`/api/database/${db.name}/schema`)
      .then(({ data }) => {
        setDbs(data.databases)
        const first = data.databases[0] || ""
        setSelectedDb(first)
        // schema without ?database returns tables too for redis/non-relational
        if (data.tables.length) { setTables(data.tables); setLoading(false) }
      })
      .catch(() => setLoading(false))
  }, [db.name])

  // Re-fetch tables when selected DB changes
  useEffect(() => {
    if (!selectedDb) return
    setLoading(true)
    nodeApi.get<DbSchemaResult>(`/api/database/${db.name}/schema?database=${encodeURIComponent(selectedDb)}`)
      .then(({ data }) => setTables(data.tables))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [db.name, selectedDb])

  // Merge size info from Python if available (Python has totalSize/indexSize, schema API has rows)
  const displayTables = tables.map(t => {
    const pyRow = db.tables?.find(p => p.name === t.name)
    return { ...t, totalSize: pyRow?.totalSize, indexSize: pyRow?.indexSize }
  })

  const hasSize = displayTables.some(t => t.totalSize)

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
      <div className="rounded-lg border border-pulseNode-border/10 bg-pulseNode-navy/40">
        {/* Header with optional DB selector */}
        <div className="flex items-center justify-between gap-2 border-b border-pulseNode-border/10 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-helm-fg3">Tables</span>
          <div className="flex items-center gap-2">
            {dbs.length > 1 && (
              <select
                value={selectedDb}
                onChange={e => setSelectedDb(e.target.value)}
                className="bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg text-[10px] rounded px-1.5 py-0.5 cursor-pointer"
              >
                {dbs.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <span className="font-mono text-[10px] text-helm-fg3">{displayTables.length} objects</span>
          </div>
        </div>

        {loading && <p className="px-3 py-4 text-xs text-helm-fg3">Loading tables…</p>}

        {!loading && displayTables.length > 0 && (
          <div className="relative max-h-48 overflow-y-auto">
            <table className="pn-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="right">Rows</th>
                  {hasSize && <th className="right">Total</th>}
                  {hasSize && <th className="right">Index</th>}
                </tr>
              </thead>
              <tbody>
                {displayTables.map(t => (
                  <tr
                    key={t.name}
                    onClick={() => onTableClick?.(t.name)}
                    className={onTableClick ? "cursor-pointer hover:bg-pn-electric/5" : ""}
                    title={onTableClick ? `Query: SELECT * FROM ${t.name} LIMIT 100` : undefined}
                  >
                    <td className="mono-cell">{t.name}</td>
                    <td className="right dim">{t.rows.toLocaleString()}</td>
                    {hasSize && <td className="right dim">{t.totalSize ?? "—"}</td>}
                    {hasSize && <td className="right dim">{t.indexSize ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && displayTables.length === 0 && (
          <p className="px-3 py-4 text-xs text-helm-fg3">
            {db.engine === "redis" ? "Redis has no tables." : "No tables found in this database."}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <ConnectionStringPanel dbName={db.name} />
        <div className="rounded-lg border border-pulseNode-border/10 bg-pulseNode-navy/40">
          <div className="flex items-center justify-between border-b border-pulseNode-border/10 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-helm-fg3">Slow queries</span>
            <span className={`font-mono text-[10px] ${db.slow > 0 ? "text-amber-400" : "text-helm-fg3"}`}>
              {db.slow} flagged
            </span>
          </div>
          {db.slowQueries && db.slowQueries.length > 0 ? (
            <div className="max-h-36 overflow-y-auto">
              <table className="pn-table w-full">
                <thead>
                  <tr>
                    <th>Query</th>
                    <th className="right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {db.slowQueries.map((query, i) => (
                    <tr key={`${query.timestamp}-${i}`}>
                      <td className="mono-cell max-w-[220px] truncate text-amber-400/90" title={query.query}>
                        {query.query}
                      </td>
                      <td className="right dim">{query.duration}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-3 py-4 text-xs text-helm-fg3">No slow queries reported.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DbExpand — tabbed expand area ─────────────────────────────────────────────

function DbExpand({ db, tab, onTabChange }: {
  db: Database
  tab: TabId
  onTabChange: (t: TabId) => void
}) {
  const [queryKey,     setQueryKey]     = useState(0)
  const [pendingQuery, setPendingQuery] = useState("")

  function handleTableClick(tableName: string) {
    const q = db.engine === "redis"   ? "KEYS *"
             : db.engine === "mongodb" ? `${tableName} {}`
             : `SELECT * FROM ${tableName} LIMIT 100;`
    setPendingQuery(q)
    setQueryKey(k => k + 1)
    onTabChange("query")
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-pulseNode-border/10 bg-pulseNode-navy/30">
        <TabBtn active={tab === "overview"} onClick={() => onTabChange("overview")} label="Overview" icon={DatabaseIcon} />
        <TabBtn active={tab === "query"}    onClick={() => onTabChange("query")}    label="Query"    icon={TerminalSquare} />
        <TabBtn active={tab === "metrics"}  onClick={() => onTabChange("metrics")}  label="Metrics"  icon={BarChart3} />
      </div>

      {/* Tab content */}
      <div className="p-3">
        {tab === "overview" && (
          <DbDetails db={db} onTableClick={handleTableClick} />
        )}
        {tab === "query" && (
          <DatabaseQueryEditor
            key={queryKey}
            db={db}
            initialQuery={pendingQuery}
            onClose={() => onTabChange("overview")}
          />
        )}
        {tab === "metrics" && (
          <DatabaseMetricsPanel db={db} onClose={() => onTabChange("overview")} />
        )}
      </div>
    </div>
  )
}

// ── DatabaseRow ───────────────────────────────────────────────────────────────

function DatabaseRow({
  db,
  connHist,
  expanded,
  onExpand,
}: {
  db: Database
  connHist: number[]
  expanded: boolean
  onExpand: () => void
}) {
  const [tab, setTab] = useState<TabId>("overview")

  function openTab(t: TabId) {
    if (!expanded) onExpand()
    setTab(t)
  }

  const color = engineColor(db.engine)
  const connPct = db.maxConns > 0 ? Math.round((db.conns / db.maxConns) * 100) : 0
  const isCoolify = db.name.toLowerCase().includes("coolify")
  const tone = statusTone(db.state)

  return (
    <>
      <tr className={`gsap-enter group ${expanded ? "selected" : ""}`}>
        <td className="w-8 px-3">
          <button
            onClick={onExpand}
            className="pn-icon-btn size-7"
            aria-label={expanded ? `Collapse ${db.name}` : `Expand ${db.name}`}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="min-w-[240px]">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-8 flex-shrink-0 place-items-center rounded-lg border"
              style={{ borderColor: "var(--border)", background: "var(--bg-2)" }}
            >
              <DbIcon engine={db.engine} size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-helm-fg">{db.name}</span>
                {isCoolify && <span className="sev info">Coolify</span>}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <span className="font-mono text-[10px] uppercase text-helm-fg3">{db.engine}</span>
                {db.version && <span className="truncate font-mono text-[10px] text-helm-fg4">{db.version}</span>}
              </div>
            </div>
          </div>
        </td>
        <td>
          <span className={`pill ${tone}`}>
            <span className="dot" />
            {db.state}
          </span>
        </td>
        <td className="hidden lg:table-cell">
          <div className="font-mono text-xs text-helm-fg">{db.size}</div>
        </td>
        <td className="min-w-[150px]">
          <div className="flex items-center justify-between gap-2 font-mono text-xs text-helm-fg">
            <span>{db.conns > 0 ? db.conns : "-"}</span>
            <span className="text-helm-fg3">/ {db.maxConns}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pulseNode-border/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(connPct, 100)}%`,
                background: connPct > 85 ? "var(--bad)" : connPct > 65 ? "var(--warn)" : "var(--ok)",
              }}
            />
          </div>
        </td>
        <td className="hidden xl:table-cell">
          <div className="font-mono text-xs text-helm-fg">{db.qps > 0 ? db.qps.toLocaleString() : "-"}</div>
        </td>
        <td className="hidden xl:table-cell">
          {db.slow > 0 ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-400">
              <AlertTriangle size={12} />
              {db.slow}
            </span>
          ) : (
            <span className="font-mono text-xs text-helm-fg3">0</span>
          )}
        </td>
        <td className="hidden 2xl:table-cell">
          <code className="block max-w-[210px] truncate font-mono text-[11px] text-helm-fg3">
            {db.host}:{db.port}
          </code>
        </td>
        <td className="hidden md:table-cell">
          <ConnSpark data={connHist} color={color} />
        </td>
        <td className="right sticky right-0 z-10 min-w-[220px] bg-pulseNode-navyLight shadow-[-12px_0_18px_-18px_rgba(0,0,0,0.55)]">
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => openTab("query")}
              className={`pn-btn px-2.5 py-1.5 ${expanded && tab === "query" ? "border-pn-electric/40 bg-pn-electric/10 text-pn-electric" : ""}`}
            >
              <TerminalSquare size={13} />
              Query
            </button>
            <button
              onClick={() => openTab("metrics")}
              className={`pn-btn px-2.5 py-1.5 ${expanded && tab === "metrics" ? "border-pn-electric/40 bg-pn-electric/10 text-pn-electric" : ""}`}
            >
              <BarChart3 size={13} />
              Metrics
            </button>
            <button onClick={() => triggerBackup(db.name)} className="pn-icon-btn" title="Backup" aria-label={`Backup ${db.name}`}>
              <Download size={13} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} className="bg-pulseNode-navy/25 p-0">
            <DbExpand db={db} tab={tab} onTabChange={setTab} />
          </td>
        </tr>
      )}
    </>
  )
}

export default function DatabasesPage() {
  const container = useRef<HTMLDivElement>(null)
  const [databases, setDatabases] = useState<Database[]>([])
  const [connHist, setConnHist] = useState<Record<string, number[]>>({})
  const [totalConns, setTotalConns] = useState(0)
  const [connHistory, setConnHistory] = useState<number[]>([0])
  const [expandedDb, setExpandedDb] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showConnect, setShowConnect] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  useEffect(() => {
    nodeApi.get<Database[]>("/api/docker/databases")
      .then(({ data }) => {
        if (data.length === 0) return
        setDatabases(data)

        pythonApi.get<Database[]>("/database/inspect")
          .then(({ data: pyData }) => {
            if (!pyData.length) return
            setDatabases(prev => prev.map(db => {
              const match = pyData.find(p => p.host === db.host || p.host === db.name || p.name === db.name)
              if (!match) return db
              return {
                ...db,
                size: match.size !== "-" ? match.size : db.size,
                conns: match.conns > 0 ? match.conns : db.conns,
                qps: match.qps > 0 ? match.qps : db.qps,
                slow: match.slow,
                tables: match.tables,
                slowQueries: match.slowQueries,
              }
            }))
          })
          .catch(() => {})

        data.forEach(db => {
          nodeApi.get<DbMetrics>(`/api/database/${db.name}/metrics`)
            .then(({ data: metrics }) => {
              const get = (label: string) => metrics.metrics.find(x => x.label === label)?.value
              const size = get("Database Size") || get("Used Memory") || get("Resident Memory")
              const conns = Number(
                get("Active Connections") ||
                get("Connected Clients") ||
                get("Current Connections") ||
                get("Threads Connected") ||
                0
              )
              setDatabases(prev => prev.map(d => {
                if (d.name !== db.name) return d
                return {
                  ...d,
                  size: d.size === "-" && size ? String(size) : d.size,
                  conns: d.conns === 0 && conns > 0 ? conns : d.conns,
                }
              }))
            })
            .catch(() => {})
        })
      })
      .catch(() => {})

    function pollConnections() {
      pythonApi.get<{ name: string; conns: number }[]>("/database/connections")
        .then(({ data }) => {
          const total = data.reduce((s, d) => s + d.conns, 0)
          setTotalConns(total)
          setConnHistory(prev => [...prev.slice(-59), total])
          setConnHist(prev => {
            const next = { ...prev }
            for (const d of data) {
              const h = next[d.name] ?? []
              next[d.name] = [...h.slice(-19), d.conns]
            }
            setDatabases(dbs => dbs.map(db => {
              const found = data.find(d => d.name === db.name || d.name === db.host)
              return found && found.conns > 0 ? { ...db, conns: found.conns } : db
            }))
            return next
          })
        })
        .catch(() => {})
    }

    pollConnections()
    const timer = setInterval(pollConnections, 10000)
    return () => clearInterval(timer)
  }, [])

  useGSAP(() => {
    gsap.from(".gsap-enter", {
      y: 10,
      opacity: 0,
      duration: 0.35,
      stagger: 0.035,
      ease: "power2.out",
    })
  }, { scope: container })

  const totalQps = databases.reduce((s, d) => s + d.qps, 0)
  const totalSlow = databases.reduce((s, d) => s + d.slow, 0)
  const unhealthy = databases.filter(d => d.state !== "ok").length

  const filteredDatabases = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return databases.filter(db => {
      const matchesStatus = statusFilter === "all" || db.state === statusFilter
      const matchesSearch =
        !needle ||
        db.name.toLowerCase().includes(needle) ||
        db.engine.toLowerCase().includes(needle) ||
        db.host.toLowerCase().includes(needle)
      return matchesStatus && matchesSearch
    })
  }, [databases, search, statusFilter])

  return (
    <div ref={container} className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-helm-fg">Databases</h1>
            <span className="live">Live</span>
          </div>
          <p className="mt-1 text-sm text-helm-fg3">
            {databases.length} databases · {totalConns} connections
            {totalQps > 0 && ` · ${totalQps.toLocaleString()} QPS`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              for (const db of databases) {
                triggerBackup(db.name)
                await new Promise(r => setTimeout(r, 600))
              }
            }}
            className="pn-btn"
          >
            <Download size={13} />
            Backup all
          </button>
          <button onClick={() => setShowCreate(true)} className="pn-btn">
            <Plus size={13} />
            Create database
          </button>
          <button onClick={() => setShowConnect(true)} className="pn-btn-primary">
            <PlugZap size={13} />
            Connect database
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Databases" value={databases.length} icon={DatabaseIcon} />
        <KpiTile label="Connections" value={totalConns} icon={Activity} detail={`${Math.max(...connHistory)} peak`} tone="var(--ok)" />
        <KpiTile label="Queries/sec" value={totalQps > 0 ? totalQps.toLocaleString() : "-"} icon={Gauge} tone="var(--info)" />
        <KpiTile label="Slow queries" value={totalSlow} icon={AlertTriangle} tone={totalSlow > 0 ? "var(--warn)" : "var(--ok)"} detail={unhealthy > 0 ? `${unhealthy} attention` : "healthy"} />
      </div>

      <div className="pn-card overflow-hidden rounded-lg">
        <div className="flex flex-col gap-3 border-b border-pulseNode-border/10 bg-pulseNode-navyLight px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="pn-search">
              <Search size={13} className="text-helm-fg3" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search databases, engines, hosts"
              />
            </div>
            <div className="flex rounded-lg border border-pulseNode-border/10 bg-pulseNode-navy p-1">
              {STATUS_FILTERS.map(filter => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    statusFilter === filter
                      ? "bg-pulseNode-navyLight text-helm-fg shadow-sm"
                      : "text-helm-fg3 hover:text-helm-fg"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="pn-chip">
              <span className="label">Rows</span>
              <span className="value">{filteredDatabases.length}</span>
            </span>
            <span className="pn-chip">
              <span className="label">Storage</span>
              <span className="value"><HardDrive size={12} className="inline" /> tracked</span>
            </span>
          </div>
        </div>

        {databases.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center px-4 text-center">
            <div>
              <DatabaseIcon size={28} className="mx-auto mb-3 text-helm-fg3" />
              <p className="text-sm font-medium text-helm-fg">Loading database containers</p>
              <p className="mt-1 text-xs text-helm-fg3">Detected databases and external connections will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="pn-table min-w-[1120px]">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>Database</th>
                  <th>State</th>
                  <th className="hidden lg:table-cell">Size</th>
                  <th>Connections</th>
                  <th className="hidden xl:table-cell">QPS</th>
                  <th className="hidden xl:table-cell">Slow</th>
                  <th className="hidden 2xl:table-cell">Endpoint</th>
                  <th className="hidden md:table-cell">Activity</th>
                  <th className="right sticky right-0 z-10 bg-pulseNode-navyLight shadow-[-12px_0_18px_-18px_rgba(0,0,0,0.55)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDatabases.map(db => (
                  <DatabaseRow
                    key={db.name}
                    db={db}
                    connHist={connHist[db.name] ?? connHist[db.host] ?? []}
                    expanded={expandedDb === db.name}
                    onExpand={() => setExpandedDb(prev => prev === db.name ? null : db.name)}
                  />
                ))}
              </tbody>
            </table>
            {filteredDatabases.length === 0 && (
              <div className="border-t border-pulseNode-border/10 px-4 py-10 text-center text-sm text-helm-fg3">
                No databases match the current filters.
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateDatabaseModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            nodeApi.get<Database[]>("/api/docker/databases")
              .then(({ data }) => { if (data.length > 0) setDatabases(data) })
              .catch(() => {})
          }}
        />
      )}

      {showConnect && (
        <ConnectDatabaseModal
          onClose={() => setShowConnect(false)}
          onSaved={(conn: CustomConnection) => {
            setDatabases(prev => [
              ...prev.filter(d => d.name !== conn.name),
              {
                name: conn.name || `${conn.engine} @ ${conn.host}`,
                engine: conn.engine,
                version: conn.version || "",
                host: conn.host,
                port: conn.port,
                size: "-",
                conns: 0,
                maxConns: 100,
                qps: 0,
                slow: 0,
                state: "ok",
              },
            ])
            setShowConnect(false)
          }}
        />
      )}
    </div>
  )
}
