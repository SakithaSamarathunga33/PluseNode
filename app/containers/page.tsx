"use client"

import { useState, useRef, useEffect } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import {
  RefreshCw, SlidersHorizontal, Plus, Square, RotateCcw,
  FileText, Terminal, BarChart2, Trash2, LayoutGrid, Settings2,
  Calendar, ChevronDown,
} from "lucide-react"
import { CONTAINERS as MOCK_CONTAINERS, HOST as MOCK_HOST, SPARKS } from "@/lib/mock-data"
import { nodeApi } from "@/lib/api"
import type { Container, HostInfo } from "@/lib/types"
import { Pill } from "@/components/dashboard/Pill"

// ── Mini sparkline ─────────────────────────────────────────────────────────────

function MiniSpark({
  data, color = "var(--acc)", width = 64, height = 24,
}: { data: number[]; color?: string; width?: number; height?: number }) {
  const slice = data.slice(-20)
  const max = Math.max(...slice)
  const min = Math.min(...slice)
  const range = max - min || 1
  const step = width / (slice.length - 1)
  const pts = slice.map((v, i) =>
    `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 4)).toFixed(1)}`
  )
  const d = `M ${pts.join(" L ")}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block flex-shrink-0">
      <path d={`${d} L ${width},${height} L 0,${height} Z`} fill={color} fillOpacity={0.14} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, unit, sub, spark, delta, deltaTone = "flat", sparkColor = "var(--acc)",
}: {
  label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode;
  spark?: number[]; delta?: string; deltaTone?: "up" | "down" | "flat"; sparkColor?: string;
}) {
  const deltaStyle =
    deltaTone === "up"   ? { color: "var(--ok)",  background: "var(--ok-soft)" } :
    deltaTone === "down" ? { color: "var(--bad)", background: "var(--bad-soft)" } :
                           { color: "var(--fg-3)", background: "var(--bg-3)" }

  return (
    <div className="relative rounded-xl p-4 overflow-hidden"
      style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--fg-3)" }}>{label}</span>
        {delta && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={deltaStyle}>
            {delta}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold" style={{ color: sparkColor }}>{value}</span>
            {unit && <span className="text-sm" style={{ color: "var(--fg-3)" }}>{unit}</span>}
          </div>
          {sub && <div className="text-[11px] mt-1" style={{ color: "var(--fg-3)" }}>{sub}</div>}
        </div>
        {spark && <MiniSpark data={spark} color={sparkColor} />}
      </div>
    </div>
  )
}

// ── Filter chip ────────────────────────────────────────────────────────────────

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <button
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-all"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg-2)" }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-2)" }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)" }}
    >
      <span style={{ color: "var(--fg-3)" }}>{label}</span>
      <span style={{ color: "var(--fg)" }}>{value}</span>
      <ChevronDown size={10} style={{ color: "var(--fg-3)" }} />
    </button>
  )
}

// ── Action button ──────────────────────────────────────────────────────────────

function ActionBtn({ icon, title, danger }: { icon: React.ReactNode; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      className="p-1.5 rounded-md text-xs transition-colors"
      style={{ color: danger ? "var(--bad)" : "var(--fg-3)" }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = danger ? "var(--bad-soft)" : "var(--bg-hover)"
        el.style.color = danger ? "var(--bad)" : "var(--fg)"
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = "transparent"
        el.style.color = danger ? "var(--bad)" : "var(--fg-3)"
      }}
    >
      {icon}
    </button>
  )
}

// ── State badge ────────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  switch (state) {
    case "running": return <Pill tone="ok" dot>{state}</Pill>
    case "stopped": return <Pill tone="outline">{state}</Pill>
    case "exited":  return <Pill tone="bad">{state}</Pill>
    case "paused":  return <Pill tone="warn">{state}</Pill>
    default:        return <Pill tone="outline">{state}</Pill>
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: "all",     label: "All",     count: 12 },
  { key: "running", label: "Running", count: 10 },
  { key: "stopped", label: "Stopped", count: 1  },
  { key: "exited",  label: "Exited",  count: 1  },
]

const TIME_RANGES = ["1h", "12h", "24h", "7d"]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContainersPage() {
  const [tab, setTab]             = useState("running")
  const [search, setSearch]       = useState("")
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [timeRange, setTimeRange] = useState("1h")
  const [containers, setContainers] = useState<Container[]>(MOCK_CONTAINERS)
  const [host, setHost]           = useState<HostInfo>(MOCK_HOST)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    nodeApi.get<Container[]>("/api/docker/containers")
      .then(({ data }) => setContainers(data))
      .catch(() => {})
    nodeApi.get<HostInfo>("/api/host")
      .then(({ data }) => setHost(data))
      .catch(() => {})
  }, [])

  useGSAP(() => {
    gsap.fromTo(
      ".gsap-enter",
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power2.out" }
    )
  }, { scope: containerRef })

  const running = containers.filter(c => c.state === "running").length
  const stopped = containers.filter(c => c.state === "stopped").length
  const exited  = containers.filter(c => c.state === "exited").length

  const filtered = containers.filter(c => {
    const matchTab    = tab === "all" || c.state === tab
    const q           = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)
    return matchTab && matchSearch
  })

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allChecked = filtered.length > 0 && filtered.every(c => selected.has(c.id))


  return (
    <div ref={containerRef} className="p-5 space-y-4">

      {/* ── Header ── */}
      <div className="gsap-enter flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--fg)" }}>Containers</h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-3)" }}>
            10 containers · 8 running · 2 stopped · last scan 12 min ago
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg-2)" }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = "var(--bg-3)"; el.style.color = "var(--fg)"
              el.style.borderColor = "var(--border-2)"
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = "var(--bg-2)"; el.style.color = "var(--fg-2)"
              el.style.borderColor = "var(--border)"
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg-2)" }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = "var(--bg-3)"; el.style.color = "var(--fg)"
              el.style.borderColor = "var(--border-2)"
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = "var(--bg-2)"; el.style.color = "var(--fg-2)"
              el.style.borderColor = "var(--border)"
            }}
          >
            <SlidersHorizontal size={12} /> Filters
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--acc)" }}
          >
            <Plus size={12} /> New container
          </button>
        </div>
      </div>

      {/* ── Stat cards — 4 across ── */}
      <div className="gsap-enter grid grid-cols-4 gap-3">
        {/* Host */}
        <div className="relative rounded-xl p-4 overflow-hidden"
          style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--fg-3)" }}>Host</p>
          <p className="text-sm font-bold" style={{ color: "var(--fg)" }}>{host.name}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-3)" }}>{host.distro} · {host.kernel}</p>
        </div>

        {/* Apps */}
        <StatCard
          label="Apps"
          value={<span>{containers.length}<span className="text-sm font-normal ml-1" style={{ color: "var(--fg-3)" }}>containers</span></span>}
          sub={
            <span className="flex items-center gap-2">
              <Pill tone="ok" dot>{running} running</Pill>
              <Pill tone="bad" dot>{stopped + exited} stopped</Pill>
            </span>
          }
          sparkColor="var(--acc)"
        />

        {/* CPU */}
        <StatCard
          label="CPU"
          value={host.cpu.usage}
          unit="%"
          spark={SPARKS.cpu}
          delta="+1.2%"
          deltaTone="up"
          sparkColor="var(--acc)"
          sub={<span>{host.cpu.cores} cores · {host.cpu.model.split("@")[0].trim()}</span>}
        />

        {/* Memory */}
        <StatCard
          label="Memory"
          value={host.memory.pct}
          unit="%"
          spark={SPARKS.mem}
          delta="-0.5%"
          deltaTone="down"
          sparkColor="var(--warn)"
          sub={<span>{host.memory.used}/{host.memory.total} {host.memory.unit}</span>}
        />
      </div>

      {/* ── Disk / Network / Load strip ── */}
      <div className="gsap-enter grid grid-cols-3 gap-0 rounded-xl overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
        {/* Disk */}
        <div className="px-5 py-4" style={{ borderRight: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--fg-3)" }}>
              Disk Usage
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xl font-bold" style={{ color: "var(--fg)" }}>{host.disk.pct}%</span>
            <span className="text-xs" style={{ color: "var(--fg-3)" }}>
              {host.disk.used} / {host.disk.total} {host.disk.unit} · {host.disk.free} {host.disk.unit} free
            </span>
          </div>
          <div className="mt-2 h-[3px] rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
            <div className="h-full rounded-full" style={{ width: `${host.disk.pct}%`, background: "var(--acc-2)" }} />
          </div>
        </div>

        {/* Network */}
        <div className="px-5 py-4" style={{ borderRight: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--fg-3)" }}>
              Network · last 60s
            </span>
          </div>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-[10px]" style={{ color: "var(--fg-3)" }}>↓ RX</p>
              <p className="text-sm font-bold" style={{ color: "var(--ok)" }}>{host.network.rx} {host.network.unit}</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: "var(--fg-3)" }}>↑ TX</p>
              <p className="text-sm font-bold" style={{ color: "var(--ok)" }}>{host.network.tx} {host.network.unit}</p>
            </div>
            <MiniSpark data={SPARKS.cpu} color="var(--ok)" width={80} height={28} />
          </div>
        </div>

        {/* Load Avg */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--fg-3)" }}>
              Load Avg · 1m 5m 15m
            </span>
          </div>
          <div className="flex items-end gap-4">
            <div className="flex items-baseline gap-3">
              {host.load.map((l, i) => (
                <span key={i} className="text-xl font-bold" style={{ color: "var(--fg)" }}>
                  {l.toFixed(2)}
                </span>
              ))}
            </div>
            <MiniSpark data={SPARKS.mem} color="var(--acc)" width={80} height={28} />
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="gsap-enter flex items-center gap-0" style={{ borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-xs font-medium transition-colors flex items-center gap-1.5"
            style={{
              color: tab === t.key ? "var(--fg)" : "var(--fg-3)",
              borderBottom: tab === t.key ? "2px solid var(--acc)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {t.label}
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{
                background: tab === t.key ? "var(--acc-soft)" : "var(--bg-3)",
                color: tab === t.key ? "var(--acc)" : "var(--fg-3)",
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Filter row ── */}
      <div className="gsap-enter flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filter…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] max-w-[240px] px-3 py-1.5 rounded-lg text-xs focus:outline-none"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "var(--acc-border)" }}
          onBlur={e =>  { (e.target as HTMLInputElement).style.borderColor = "var(--border)" }}
        />
        <FilterChip label="Host:" value="All hosts" />
        <FilterChip label="Sort:" value="Created" />
        <FilterChip label="Group:" value="None" />

        {/* Time range */}
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {TIME_RANGES.map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className="px-2.5 py-1.5 text-xs transition-colors"
              style={{
                background: timeRange === r ? "var(--bg-3)" : "transparent",
                color: timeRange === r ? "var(--fg)" : "var(--fg-3)",
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg-3)" }}
        >
          <Calendar size={11} /> Date range
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {[LayoutGrid, Settings2].map((Icon, i) => (
            <button
              key={i}
              className="p-1.5 rounded-lg transition-colors"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                color: "var(--fg-3)",
              }}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Container table ── */}
      <div className="gsap-enter rounded-xl overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
        <div className="overflow-x-auto">
          <table className="pn-table w-full">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => {
                      if (allChecked) setSelected(new Set())
                      else setSelected(new Set(filtered.map(c => c.id)))
                    }}
                    className="w-3.5 h-3.5"
                  />
                </th>
                <th>Name</th>
                <th>Image</th>
                <th>State</th>
                <th>Uptime</th>
                <th>Ports</th>
                <th>CPU 1h</th>
                <th>RAM 1h</th>
                <th>Created</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="relative">
                  <td className="w-10">
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="w-3.5 h-3.5"
                      />
                    </div>
                  </td>

                  {/* Name */}
                  <td>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium truncate max-w-[160px]" style={{ color: "var(--fg)" }}>{c.name}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{ background: "var(--acc-soft-2)", color: "var(--acc)" }}
                      >
                        DOCKER
                      </span>
                      {c.ports && c.ports !== "—" && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                          style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
                        >
                          {c.ports}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="mono-cell dim max-w-[200px] truncate">{c.image}</td>
                  <td><StateBadge state={c.state} /></td>
                  <td className="dim">{c.uptime}</td>
                  <td className="mono-cell dim">{c.ports}</td>

                  {/* CPU 1h */}
                  <td>
                    <div className="flex items-center gap-2">
                      <MiniSpark data={SPARKS.cpu} color="var(--acc)" width={56} height={22} />
                      <span className="text-[11px] font-mono" style={{ color: "var(--fg)" }}>{c.cpu.toFixed(1)}%</span>
                    </div>
                  </td>

                  {/* RAM 1h */}
                  <td>
                    <div className="flex items-center gap-2">
                      <MiniSpark data={SPARKS.mem} color="var(--acc-2)" width={56} height={22} />
                      <span className="text-[11px] font-mono" style={{ color: "var(--fg)" }}>{c.ram.toFixed(1)}%</span>
                    </div>
                  </td>

                  <td className="dim">{c.created}</td>

                  {/* Actions */}
                  <td className="right">
                    <div className="flex items-center justify-end gap-0.5">
                      <ActionBtn icon={<Square size={13} />}      title="Stop"    danger />
                      <ActionBtn icon={<RotateCcw size={13} />}   title="Restart" />
                      <ActionBtn icon={<FileText size={13} />}    title="Logs" />
                      <ActionBtn icon={<Terminal size={13} />}    title="Shell" />
                      <ActionBtn icon={<BarChart2 size={13} />}   title="Stats" />
                      <ActionBtn icon={<Trash2 size={13} />}      title="Remove"  danger />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="text-[11px]" style={{ color: "var(--fg-3)" }}>
            Showing {filtered.length} of {containers.length} containers
          </span>
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ok)" }}>
            <span className="w-1.5 h-1.5 rounded-full status-live" style={{ background: "var(--ok)" }} />
            Live polling · 5s
          </div>
        </div>
      </div>
    </div>
  )
}
