"use client"

import { useState, useRef } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line,
} from "recharts"
import { Download, MoreHorizontal, Zap } from "lucide-react"
import { HOST, SPARKS } from "@/lib/mock-data"
import { StatCard } from "@/components/dashboard/StatCard"
import { cn } from "@/lib/utils"

// ── Chart helpers ─────────────────────────────────────────────────────────────

type TooltipPayload = {
  color?: string
  name?: string
  value?: number | string
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string | number
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-pulseNode-navy border border-pulseNode-border/30 rounded-lg p-2 text-xs text-helm-fg shadow-card">
      <p className="text-helm-fg3 mb-0.5">t={label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-mono font-bold">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

const xStyle = { fill: "var(--pn-muted)", fontSize: 10 }
const yStyle = { fill: "var(--pn-muted)", fontSize: 10 }

function ChartCard({
  title, value, unit, children, dot = false,
}: {
  title: string; value: string; unit?: string; children: React.ReactNode; dot?: boolean
}) {
  return (
    <div className="gsap-enter rounded-xl bg-pulseNode-navyLight border border-pulseNode-border/10 shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-pulseNode-border/10">
        <div className="flex items-center gap-2">
          {dot && <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-live" />}
          <span className="text-xs font-semibold text-helm-fg">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono text-pulseNode-cyan">{value}</span>
          {unit && <span className="text-xs text-helm-fg3">{unit}</span>}
          <button className="p-1 rounded text-helm-fg3 hover:text-helm-fg transition-colors">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
      <div className="px-2 pt-3 pb-2">
        {children}
      </div>
    </div>
  )
}

const TIME_OPTIONS = ["5m", "1h", "6h", "24h", "7d"]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [timeRange, setTimeRange] = useState("6h")
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.fromTo(
      ".gsap-enter",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: "power2.out" }
    )
  }, { scope: containerRef })

  // Prepare chart data
  const cpuData    = SPARKS.cpuLong.map((v, i) => ({ t: i, v }))
  const memData    = SPARKS.memLong.map((v, i) => ({ t: i, v }))
  const ioData     = SPARKS.io.map((v, i) => ({ t: i, v }))
  const netData    = SPARKS.net.map((v, i) => ({ t: i, v, tx: SPARKS.netTx[i] ?? 0 }))

  // Memory breakdown (illustrative)
  const memUsed    = HOST.memory.used
  const memCached  = 0.6
  const memBuffers = 0.2
  const memFree    = HOST.memory.total - memUsed - memCached - memBuffers

  const memTotal   = HOST.memory.total
  const usedPct    = (memUsed / memTotal) * 100
  const cachedPct  = (memCached / memTotal) * 100
  const bufPct     = (memBuffers / memTotal) * 100
  const freePct    = (memFree / memTotal) * 100

  return (
    <div ref={containerRef} className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="gsap-enter flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-helm-fg">System Stats</h1>
          <p className="text-[12px] text-helm-fg3 mt-0.5">
            {HOST.name} · {HOST.region} · {HOST.ip}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range */}
          <div className="flex items-center rounded-lg border border-pulseNode-border/15 overflow-hidden">
            {TIME_OPTIONS.map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-2.5 py-1.5 text-xs transition-colors",
                  timeRange === r
                    ? "bg-pulseNode-navyLight text-helm-fg"
                    : "text-helm-fg3 hover:text-helm-fg"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulseNode-navyLight border border-pulseNode-border/15 text-xs text-helm-fg3 hover:text-helm-fg transition-colors">
            <Download size={12} /> Export
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulseNode-navyLight border border-pulseNode-border/15 text-xs text-green-400 hover:text-green-300 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-live" />
            Auto · 5s
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="gsap-enter grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="CPU"
          value={HOST.cpu.usage}
          unit="%"
          spark={SPARKS.cpu}
          delta="+1.2%"
          deltaTone="up"
          tone="acc"
          accent
          sub={<span>{HOST.cpu.model}</span>}
        />
        <StatCard
          label="Memory"
          value={HOST.memory.pct}
          unit="%"
          spark={SPARKS.mem}
          delta="-0.5%"
          deltaTone="down"
          tone="warn"
          sub={<span>{HOST.memory.used}/{HOST.memory.total} {HOST.memory.unit} used</span>}
        />
        <StatCard
          label="Disk"
          value={HOST.disk.pct}
          unit="%"
          spark={SPARKS.disk}
          tone="info"
          sub={<span>{HOST.disk.free} {HOST.disk.unit} free</span>}
        />
        <StatCard
          label="Network RX"
          value={HOST.network.rx}
          unit={HOST.network.unit}
          spark={SPARKS.net}
          tone="ok"
          sub={<span>TX {HOST.network.tx} {HOST.network.unit}</span>}
        />
      </div>

      {/* ── Charts 2×2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU */}
        <ChartCard title="CPU Usage" value={`${HOST.cpu.usage}%`} dot>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cpuData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--pn-cyan)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="var(--pn-cyan)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={xStyle} tickLine={false} axisLine={false} interval={29} />
              <YAxis tick={yStyle} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="v" name="CPU%" stroke="var(--pn-cyan)" strokeWidth={1.5} fill="url(#cpuFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Memory */}
        <ChartCard title="Memory Usage" value={`${HOST.memory.pct}%`} dot>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={memData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="memFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-warning)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="var(--color-warning)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tick={xStyle} tickLine={false} axisLine={false} interval={29} />
              <YAxis tick={yStyle} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="v" name="MEM%" stroke="var(--color-warning)" strokeWidth={1.5} fill="url(#memFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Disk I/O */}
        <ChartCard title="Disk I/O" value={`${SPARKS.io[SPARKS.io.length - 1].toFixed(0)} MB/s`}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ioData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="t" tick={xStyle} tickLine={false} axisLine={false} interval={14} />
              <YAxis tick={yStyle} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="v" name="I/O" fill="var(--pn-blue)" radius={[2, 2, 0, 0]} maxBarSize={8} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Network */}
        <ChartCard title="Network" value={`↓${HOST.network.rx} ↑${HOST.network.tx}`} unit={HOST.network.unit}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={netData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="t" tick={xStyle} tickLine={false} axisLine={false} interval={14} />
              <YAxis tick={yStyle} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="v"  name="RX" stroke="var(--pn-cyan)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="tx" name="TX" stroke="var(--pn-blue)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Detail cards 3-col ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Host Info */}
        <div className="gsap-enter rounded-xl bg-pulseNode-navyLight border border-pulseNode-border/10 shadow-card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-helm-fg3 mb-4">Host Info</p>
          <dl className="space-y-2.5">
            {[
              ["Hostname",  HOST.name],
              ["Distro",    HOST.distro],
              ["Kernel",    HOST.kernel],
              ["Uptime",    HOST.uptime],
              ["IP",        HOST.ip],
              ["Region",    HOST.region],
              ["CPU Model", HOST.cpu.model],
              ["Swap",      `${HOST.swap.used}/${HOST.swap.total} GB (${HOST.swap.pct}%)`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-2">
                <dt className="text-[11px] text-helm-fg3 flex-shrink-0">{k}</dt>
                <dd className="text-[11px] text-helm-fg font-mono text-right truncate max-w-[180px]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Memory Breakdown */}
        <div className="gsap-enter rounded-xl bg-pulseNode-navyLight border border-pulseNode-border/10 shadow-card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-helm-fg3 mb-4">Memory Breakdown</p>
          <p className="text-2xl font-bold text-pulseNode-cyan mb-1">
            {HOST.memory.used} <span className="text-sm text-helm-fg3 font-normal">/ {HOST.memory.total} {HOST.memory.unit}</span>
          </p>

          {/* Segmented bar */}
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 my-4">
            <div className="bg-pulseNode-cyan rounded-l-full" style={{ width: `${usedPct}%` }} title="Used" />
            <div className="bg-amber-400" style={{ width: `${cachedPct}%` }} title="Cached" />
            <div className="bg-pn-blue" style={{ width: `${bufPct}%` }} title="Buffers" />
            <div className="bg-pulseNode-navy rounded-r-full flex-1" title="Free" />
          </div>

          <div className="space-y-2">
            {[
              { label: "Used",    val: `${memUsed} GB`,    pct: usedPct,   color: "var(--pn-cyan)" },
              { label: "Cached",  val: `${memCached} GB`,  pct: cachedPct, color: "var(--color-warning)" },
              { label: "Buffers", val: `${memBuffers} GB`, pct: bufPct,    color: "var(--pn-blue)" },
              { label: "Free",    val: `${memFree.toFixed(1)} GB`, pct: freePct, color: "var(--pn-muted)" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                  <span className="text-[11px] text-helm-fg3">{row.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-helm-fg">{row.val}</span>
                  <span className="text-[10px] text-helm-fg3 w-8 text-right">{row.pct.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-pulseNode-border/10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-helm-fg3 mb-2">Swap</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-[3px] bg-pulseNode-navy rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${HOST.swap.pct}%` }} />
              </div>
              <span className="text-[11px] font-mono text-helm-fg">{HOST.swap.used}/{HOST.swap.total} GB</span>
            </div>
          </div>
        </div>

        {/* Disk */}
        <div className="gsap-enter rounded-xl bg-pulseNode-navyLight border border-pulseNode-border/10 shadow-card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-helm-fg3 mb-4">Disk</p>
          <p className="text-2xl font-bold text-pulseNode-blue mb-1">
            {HOST.disk.pct}% <span className="text-sm text-helm-fg3 font-normal">used</span>
          </p>

          <div className="my-4 h-3 rounded-full overflow-hidden bg-pulseNode-navy">
            <div className="h-full rounded-full bg-pulseNode-blue" style={{ width: `${HOST.disk.pct}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              { label: "Used",  val: `${HOST.disk.used} ${HOST.disk.unit}` },
              { label: "Free",  val: `${HOST.disk.free} ${HOST.disk.unit}` },
              { label: "Total", val: `${HOST.disk.total} ${HOST.disk.unit}` },
              { label: "Type",  val: "SSD" },
            ].map(item => (
              <div key={item.label} className="rounded-lg bg-pulseNode-navy/60 px-3 py-2">
                <p className="text-[10px] text-helm-fg3">{item.label}</p>
                <p className="text-sm font-mono font-bold text-helm-fg mt-0.5">{item.val}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-pulseNode-border/10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-helm-fg3 mb-2">I/O Rate</p>
            <div className="flex items-center gap-3">
              <Zap size={12} className="text-pulseNode-blue" />
              <span className="text-[11px] text-helm-fg3">Read</span>
              <span className="text-[11px] font-mono text-helm-fg ml-auto">42 MB/s</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <Zap size={12} className="text-amber-400" />
              <span className="text-[11px] text-helm-fg3">Write</span>
              <span className="text-[11px] font-mono text-helm-fg ml-auto">18 MB/s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
