"use client"

import { useState, useRef, useEffect } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { nodeApi, pythonApi, API_BASE } from "@/lib/api"
import type { Database, CustomConnection } from "@/lib/types"
import { StatCard } from "@/components/dashboard/StatCard"
import { Pill } from "@/components/dashboard/Pill"
import { ProgressBar } from "@/components/dashboard/ProgressBar"
import BlurFade from "@/components/magicui/blur-fade"
import { DatabaseQueryEditor } from "@/components/dashboard/DatabaseQueryEditor"
import { DatabaseMetricsPanel } from "@/components/dashboard/DatabaseMetricsPanel"
import { CreateDatabaseModal } from "@/components/dashboard/CreateDatabaseModal"
import { ConnectDatabaseModal } from "@/components/dashboard/ConnectDatabaseModal"
import { DbIcon } from "@/components/dashboard/DbIcon"

/* ── Engine colours ─────────────────────────────────────────────────── */
const ENGINE_COLOR: Record<string, string> = {
  postgres:      "var(--db-postgres)",
  redis:         "var(--db-redis)",
  mysql:         "var(--db-mysql)",
  clickhouse:    "var(--db-clickhouse)",
  mongodb:       "var(--db-other)",
}
function engineColor(e: string) { return ENGINE_COLOR[e] ?? "var(--db-other)" }

/* ── Connection sparkline ────────────────────────────────────────────── */
function ConnSpark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-[40px] opacity-20 flex items-end">
    <div className="w-full h-[2px] rounded" style={{ background: color }} />
  </div>
  const w = 100, h = 40
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const step = w / (data.length - 1)
  const pts = data.map((v, i) =>
    `${(i * step).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`
  )
  const d = `M ${pts.join(" L ")}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <path d={`${d} L ${w},${h} L 0,${h} Z`} fill={color} fillOpacity={0.14} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── Download backup helper ──────────────────────────────────────────── */
function triggerBackup(dbName: string) {
  const a = document.createElement("a")
  a.href = `${API_BASE}/api/database/${encodeURIComponent(dbName)}/backup`
  a.download = `${dbName}-backup`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/* ── Connection string copy button ───────────────────────────────────── */
function ConnectionStringSection({ dbName }: { dbName: string }) {
  const [uri,     setUri]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [open,    setOpen]    = useState(false)

  async function load() {
    if (uri) { setOpen(o => !o); return }
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/database/${encodeURIComponent(dbName)}/connection-string`)
      const data = await res.json()
      setUri(data.connectionString || null)
    } catch { setUri(null) }
    finally { setLoading(false) }
  }

  function copy() {
    if (!uri) return
    navigator.clipboard.writeText(uri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border-t border-pulseNode-border/10">
      <button
        onClick={load}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-helm-fg3 hover:text-helm-fg transition-colors"
      >
        <span className="uppercase tracking-wider font-semibold">Connection String</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {loading && <p className="text-[10px] text-helm-fg3">Loading…</p>}
          {!loading && uri && (
            <div className="flex items-center gap-2 bg-pulseNode-navy rounded-lg px-2.5 py-2 border border-pulseNode-border/15">
              <code className="flex-1 text-[10px] font-mono text-helm-fg break-all">{uri}</code>
              <button
                onClick={copy}
                className="flex-shrink-0 text-[10px] text-pn-electric hover:text-pn-electric/80 font-medium transition-colors"
              >
                {copied ? "✓" : "Copy"}
              </button>
            </div>
          )}
          {!loading && !uri && <p className="text-[10px] text-red-400">Could not build connection string</p>}
        </div>
      )}
    </div>
  )
}

/* ── DB Card ─────────────────────────────────────────────────────────── */
function DbCard({ db, connHist, onQueryClick, onMetricsClick }: {
  db: Database
  connHist: number[]
  onQueryClick: () => void
  onMetricsClick: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const color    = engineColor(db.engine)
  const connPct  = db.maxConns > 0 ? Math.round((db.conns / db.maxConns) * 100) : 0
  const stateTone = db.state === "ok" ? "ok" : db.state === "warn" ? "warn" : "bad"
  const isCoolify = db.name.toLowerCase().includes("coolify")

  return (
    <div className="gsap-enter bg-pulseNode-navyLight rounded-xl border border-pulseNode-border/10 shadow-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pulseNode-border/10">
        <div className="flex items-center gap-2 min-w-0">
          <DbIcon engine={db.engine} size={18} className="flex-shrink-0" />
          <span className="font-semibold text-sm text-helm-fg truncate">{db.name}</span>
          <code className="text-[10px] text-helm-fg3 font-mono">{db.version}</code>
          {isCoolify && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-pn-electric/15 text-pn-electric uppercase tracking-wider">
              COOLIFY
            </span>
          )}
        </div>
        <Pill tone={stateTone} dot>{db.state}</Pill>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 space-y-3">
        {/* Size + QPS */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-helm-fg3 uppercase tracking-wider mb-0.5">Size</div>
            <div className="text-sm font-semibold text-helm-fg">{db.size}</div>
          </div>
          <div>
            <div className="text-[10px] text-helm-fg3 uppercase tracking-wider mb-0.5">QPS</div>
            <div className="text-sm font-semibold text-helm-fg">
              {db.qps > 0 ? db.qps.toLocaleString() : "—"}
            </div>
          </div>
        </div>

        {/* Connections bar */}
        <div>
          <div className="flex justify-between text-[10px] text-helm-fg3 mb-1">
            <span>Connections</span>
            <span>{db.conns > 0 ? `${db.conns} / ${db.maxConns}` : "—"}</span>
          </div>
          {db.conns > 0
            ? <ProgressBar value={connPct} tone={connPct > 85 ? "bad" : connPct > 65 ? "warn" : "ok"} />
            : <div className="h-[3px] rounded-full" style={{ background: "var(--pulseNode-navy, #0f1729)" }} />
          }
        </div>

        {/* Connection history sparkline */}
        <div className="opacity-60">
          <ConnSpark data={connHist.length ? connHist : [0, 0]} color={color} />
        </div>

        {/* host:port */}
        <div className="flex items-center justify-between">
          <code className="text-[11px] text-helm-fg3 font-mono">{db.host}:{db.port}</code>
          {db.slow > 0 && <Pill tone="warn">{db.slow} slow</Pill>}
        </div>
      </div>

      {/* Expanded accordion */}
      {expanded && (
        <BlurFade delay={0.05}>
          <div className="border-t border-pulseNode-border/10 px-4 py-3 space-y-4 bg-pulseNode-navy/30">
            {/* Tables */}
            {db.tables && db.tables.length > 0 ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-helm-fg3 mb-2 font-semibold">Tables</div>
                <table className="pn-table w-full text-xs">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="right">Rows</th>
                      <th className="right">Total Size</th>
                      <th className="right">Index Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.tables.map(t => (
                      <tr key={t.name}>
                        <td className="mono-cell">{t.name}</td>
                        <td className="right dim">{t.rows.toLocaleString()}</td>
                        <td className="right dim">{t.totalSize}</td>
                        <td className="right dim">{t.indexSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[11px] text-helm-fg3">
                No table data — set <code className="font-mono">DATABASE_URL</code> to enable introspection.
              </p>
            )}

            {/* Slow queries */}
            {db.slowQueries && db.slowQueries.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-2 font-semibold">Slow Queries</div>
                <table className="pn-table w-full text-xs">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th className="right">Duration</th>
                      <th className="right">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.slowQueries.map((q, i) => (
                      <tr key={i}>
                        <td className="mono-cell text-amber-400/80">{q.query}</td>
                        <td className="right dim">{q.duration}ms</td>
                        <td className="right dim">{q.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </BlurFade>
      )}

      {/* Connection string (collapsible) */}
      <ConnectionStringSection dbName={db.name} />

      {/* Footer */}
      <div className="border-t border-pulseNode-border/10 px-3 py-2 flex gap-2">
        <button
          onClick={onQueryClick}
          className="flex-1 border border-pn-electric/30 text-pn-electric hover:bg-pn-electric/10 px-2 py-1 rounded-lg text-xs transition-colors text-center"
        >
          Query
        </button>
        <button
          onClick={onMetricsClick}
          className="flex-1 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 px-2 py-1 rounded-lg text-xs transition-colors text-center"
        >
          Metrics
        </button>
        <button
          onClick={() => triggerBackup(db.name)}
          className="flex-1 border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg px-2 py-1 rounded-lg text-xs transition-colors text-center"
        >
          Backup
        </button>
        <button
          onClick={() => setExpanded(p => !p)}
          className="border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg px-2 py-1 rounded-lg text-xs transition-colors"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function DatabasesPage() {
  const container = useRef<HTMLDivElement>(null)
  const [databases,        setDatabases]        = useState<Database[]>([])
  const [connHist,         setConnHist]         = useState<Record<string, number[]>>({})
  const [totalConns,       setTotalConns]       = useState(0)
  const [connHistory,      setConnHistory]      = useState<number[]>([0])
  const [selectedDb,       setSelectedDb]       = useState<Database | null>(null)
  const [selectedMetricsDb,setSelectedMetricsDb]= useState<Database | null>(null)
  const [showCreate,       setShowCreate]       = useState(false)
  const [showConnect,      setShowConnect]      = useState(false)

  useEffect(() => {
    // Step 1: Docker gives real running DB containers (always the source of truth)
    nodeApi.get<Database[]>("/api/docker/databases")
      .then(({ data }) => {
        if (data.length > 0) {
          setDatabases(data)
          // Step 2: Try Python to enrich with introspection data (tables, sizes)
          pythonApi.get<Database[]>("/database/inspect")
            .then(({ data: pyData }) => {
              if (!pyData.length) return
              setDatabases(prev => prev.map(db => {
                // Only enrich if Python found a DB with a matching host/name
                const match = pyData.find(p =>
                  p.host === db.host || p.host === db.name || p.name === db.name
                )
                if (!match) return db
                return {
                  ...db,
                  size:        match.size !== "—" ? match.size : db.size,
                  conns:       match.conns > 0    ? match.conns : db.conns,
                  qps:         match.qps   > 0    ? match.qps   : db.qps,
                  slow:        match.slow,
                  tables:      match.tables,
                  slowQueries: match.slowQueries,
                }
              }))
            })
            .catch(() => {})
        }
      })
      .catch(() => {})

    // Step 3: Poll Python /database/connections every 10s to update counts + build sparklines
    function pollConnections() {
      pythonApi.get<{ name: string; conns: number }[]>("/database/connections")
        .then(({ data }) => {
          const total = data.reduce((s, d) => s + d.conns, 0)
          setTotalConns(total)
          setConnHistory(prev => {
            const next = [...prev.slice(-59), total]
            return next
          })
          setConnHist(prev => {
            const next = { ...prev }
            for (const d of data) {
              const h = next[d.name] ?? []
              next[d.name] = [...h.slice(-19), d.conns]
            }
            // Also update databases connection counts
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
      y: 20, opacity: 0, duration: 0.5, stagger: 0.08, ease: "power2.out",
    })
  }, { scope: container })

  const totalQps  = databases.reduce((s, d) => s + d.qps,  0)
  const totalSlow = databases.reduce((s, d) => s + d.slow, 0)

  return (
    <div ref={container} className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-helm-fg">Databases</h1>
          <p className="text-sm text-helm-fg3 mt-0.5">
            {databases.length} databases · {totalConns} connections
            {totalQps > 0 && ` · ${totalQps.toLocaleString()} QPS`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              for (const db of databases) {
                triggerBackup(db.name)
                await new Promise(r => setTimeout(r, 600))
              }
            }}
            className="border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            Backup all
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            + Create database
          </button>
          <button
            onClick={() => setShowConnect(true)}
            className="bg-[var(--acc)] text-white shadow-sm shadow-[var(--acc-soft)] px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[var(--acc-2)] transition-colors"
          >
            + Connect database
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="gsap-enter">
          <StatCard label="Databases"   value={databases.length} tone="acc" />
        </div>
        <div className="gsap-enter">
          <StatCard label="Connections" value={totalConns} tone="acc" spark={connHistory} />
        </div>
        <div className="gsap-enter">
          <StatCard
            label="Queries/sec"
            value={totalQps > 0 ? totalQps.toLocaleString() : "—"}
            tone="info"
            animate={false}
          />
        </div>
        <div className="gsap-enter">
          <StatCard label="Slow queries" value={totalSlow} tone={totalSlow > 0 ? "warn" : "ok"} />
        </div>
      </div>

      {/* DB card grid */}
      {databases.length === 0 ? (
        <div className="text-center py-16 text-helm-fg3 text-sm">
          Loading database containers…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {databases.map(db => (
              <DbCard
                key={db.name}
                db={db}
                connHist={connHist[db.name] ?? connHist[db.host] ?? []}
                onQueryClick={() => setSelectedDb(prev => prev?.name === db.name ? null : db)}
                onMetricsClick={() => setSelectedMetricsDb(prev => prev?.name === db.name ? null : db)}
              />
            ))}
          </div>

          {selectedMetricsDb && (
            <DatabaseMetricsPanel
              db={selectedMetricsDb}
              onClose={() => setSelectedMetricsDb(null)}
            />
          )}

          {selectedDb && (
            <DatabaseQueryEditor
              db={selectedDb}
              onClose={() => setSelectedDb(null)}
            />
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateDatabaseModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            // Refresh docker databases list after provisioning
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
            // Add saved external connection as a pseudo-database card
            setDatabases(prev => [
              ...prev.filter(d => d.name !== conn.name),
              {
                name:    conn.name || `${conn.engine} @ ${conn.host}`,
                engine:  conn.engine,
                version: conn.version || "",
                host:    conn.host,
                port:    conn.port,
                size:    "—",
                conns:   0,
                maxConns: 100,
                qps:     0,
                slow:    0,
                state:   "ok",
              },
            ])
            setShowConnect(false)
          }}
        />
      )}
    </div>
  )
}
