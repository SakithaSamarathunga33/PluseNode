"use client"

import { useState, useRef } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { DATABASES, SPARKS } from "@/lib/mock-data"
import { StatCard } from "@/components/dashboard/StatCard"
import { Pill } from "@/components/dashboard/Pill"
import { ProgressBar } from "@/components/dashboard/ProgressBar"
import BlurFade from "@/components/magicui/blur-fade"
import { cn } from "@/lib/utils"

/* ── Engine colours ─────────────────────────────────────────────────── */
const ENGINE_COLOR: Record<string, string> = {
  postgres:   "var(--db-postgres)",
  redis:      "var(--db-redis)",
  mysql:      "var(--db-mysql)",
  clickhouse: "var(--db-clickhouse)",
}
function engineColor(e: string) { return ENGINE_COLOR[e] ?? "var(--db-other)" }

/* ── Tiny inline sparkline ───────────────────────────────────────────── */
function Spark({ data, color = "var(--pn-cyan)", h = 40 }: { data: number[]; color?: string; h?: number }) {
  const w = 100
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`)
  const d = `M ${pts.join(" L ")}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <path d={`${d} L ${w},${h} L 0,${h} Z`} fill={color} fillOpacity={0.14} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── Mock table rows for the accordion ──────────────────────────────── */
const MOCK_TABLES = [
  { name: "users",    rows: 12400, totalSize: "48 MB",  indexSize: "12 MB" },
  { name: "events",   rows: 89200, totalSize: "210 MB", indexSize: "44 MB" },
  { name: "sessions", rows: 4100,  totalSize: "8 MB",   indexSize: "2 MB"  },
]
const MOCK_SLOW = [{ query: "SELECT * FROM events WHERE...", duration: 520, timestamp: "2 min ago" }]

/* ── Action button ───────────────────────────────────────────────────── */
function ActionBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex-1 border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg px-2 py-1 rounded-lg text-xs transition-colors text-center">
      {children}
    </button>
  )
}

/* ── DB Card ─────────────────────────────────────────────────────────── */
function DbCard({ db }: { db: typeof DATABASES[0] }) {
  const [expanded, setExpanded] = useState(false)
  const color = engineColor(db.engine)
  const connPct = Math.round((db.conns / db.maxConns) * 100)
  const stateTone = db.state === "ok" ? "ok" : db.state === "warn" ? "warn" : "bad"
  const isCoolify = db.name.toLowerCase().includes("coolify")

  return (
    <div className="gsap-enter bg-pulseNode-navyLight rounded-xl border border-pulseNode-border/10 shadow-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pulseNode-border/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
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
            <div className="text-sm font-semibold text-helm-fg">{db.qps.toLocaleString()}</div>
          </div>
        </div>

        {/* Connections bar */}
        <div>
          <div className="flex justify-between text-[10px] text-helm-fg3 mb-1">
            <span>Connections</span>
            <span>{db.conns} / {db.maxConns}</span>
          </div>
          <ProgressBar value={connPct} tone={connPct > 85 ? "bad" : connPct > 65 ? "warn" : "ok"} />
        </div>

        {/* Mini spark */}
        <div className="opacity-60">
          <Spark data={db.engine === "redis" ? SPARKS.io : SPARKS.cpu} color={color} h={40} />
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
                  {MOCK_TABLES.map(t => (
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

            {/* Slow queries */}
            {db.slow > 0 && (
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
                    {MOCK_SLOW.map((q, i) => (
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

      {/* Footer */}
      <div className="border-t border-pulseNode-border/10 px-3 py-2 flex gap-2">
        <ActionBtn>Query</ActionBtn>
        <ActionBtn>Metrics</ActionBtn>
        <ActionBtn>Backup</ActionBtn>
        <button
          onClick={() => setExpanded(p => !p)}
          className="border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg px-2 py-1 rounded-lg text-xs transition-colors"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function DatabasesPage() {
  const container = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.from(".gsap-enter", {
      y: 20, opacity: 0, duration: 0.5, stagger: 0.08, ease: "power2.out",
    })
  }, { scope: container })

  const totalConns = DATABASES.reduce((s, d) => s + d.conns, 0)
  const totalQps   = DATABASES.reduce((s, d) => s + d.qps, 0)
  const totalSlow  = DATABASES.reduce((s, d) => s + d.slow, 0)

  return (
    <div ref={container} className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-helm-fg">Databases</h1>
          <p className="text-sm text-helm-fg3 mt-0.5">
            {DATABASES.length} databases · {totalConns} connections · {totalQps.toLocaleString()} QPS
          </p>
        </div>
        <div className="flex gap-2">
          <button className="border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg px-3 py-1.5 rounded-lg text-sm transition-colors">
            Backup
          </button>
          <button className="bg-pn-electric text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-pn-electric/90 transition-colors">
            + Connect database
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="gsap-enter">
          <StatCard label="Databases" value={DATABASES.length} tone="acc" />
        </div>
        <div className="gsap-enter">
          <StatCard label="Connections" value={totalConns} tone="acc" spark={SPARKS.net} />
        </div>
        <div className="gsap-enter">
          <StatCard label="Queries/sec" value={totalQps.toLocaleString()} tone="info" animate={false} />
        </div>
        <div className="gsap-enter">
          <StatCard label="Slow queries" value={totalSlow} tone={totalSlow > 0 ? "warn" : "ok"} />
        </div>
      </div>

      {/* DB card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {DATABASES.map(db => <DbCard key={db.name} db={db} />)}
      </div>
    </div>
  )
}
