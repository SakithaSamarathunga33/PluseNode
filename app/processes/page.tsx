"use client"

import { useState, useRef, useMemo } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { MoreHorizontal, ChevronDown, ChevronUp, Users, Layers, Activity } from "lucide-react"
import { PROCESSES } from "@/lib/mock-data"
import { Pill } from "@/components/dashboard/Pill"
import { ProgressBar } from "@/components/dashboard/ProgressBar"
import { cn } from "@/lib/utils"

// ── Inline helpers ─────────────────────────────────────────────────────────────

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pulseNode-navyLight border border-pulseNode-border/15 text-xs text-helm-fg3 hover:text-helm-fg transition-colors">
      <span className="text-helm-fg4">{label}</span>
      <span className="text-helm-fg">{value}</span>
      <ChevronDown size={10} />
    </button>
  )
}

function ActionBtn({ icon, title, tone = "" }: { icon: React.ReactNode; title: string; tone?: string }) {
  return (
    <button
      title={title}
      className={cn(
        "p-1.5 rounded-md text-xs transition-colors",
        tone === "danger"
          ? "text-red-400 hover:bg-red-500/10"
          : "text-helm-fg3 hover:bg-pulseNode-navyLight hover:text-helm-fg"
      )}
    >
      {icon}
    </button>
  )
}

// Mini inline progress bar
function MiniBar({ value, color = "var(--pn-cyan)" }: { value: number; color?: string }) {
  return (
    <div className="w-[60px] h-[3px] bg-pulseNode-navy rounded-full overflow-hidden flex-shrink-0">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
      />
    </div>
  )
}

type SortKey = "cpu" | "mem" | "pid"

const CPU_CORES = [
  { label: "CPU1", pct: 22 },
  { label: "CPU2", pct: 18 },
  { label: "CPU3", pct: 31 },
  { label: "CPU4", pct: 14 },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProcessesPage() {
  const [search,  setSearch]  = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("cpu")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.fromTo(
      ".gsap-enter",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: "power2.out" }
    )
  }, { scope: containerRef })

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc")
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const sorted = useMemo(() => {
    const q = search.toLowerCase()
    let list = q
      ? PROCESSES.filter(p =>
          p.cmd.toLowerCase().includes(q) ||
          p.user.toLowerCase().includes(q) ||
          String(p.pid).includes(q)
        )
      : [...PROCESSES]

    list.sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number
      const bv = b[sortKey as keyof typeof b] as number
      return sortDir === "desc" ? bv - av : av - bv
    })
    return list
  }, [search, sortKey, sortDir])

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null
    return sortDir === "desc"
      ? <ChevronDown size={11} className="inline ml-0.5" />
      : <ChevronUp size={11} className="inline ml-0.5" />
  }

  return (
    <div ref={containerRef} className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="gsap-enter flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-helm-fg">Processes</h1>
          <p className="text-[12px] text-helm-fg3 mt-0.5">
            {PROCESSES.length} processes · {PROCESSES.filter(p => p.type === "pm2").length} PM2 · {PROCESSES.filter(p => p.type === "system").length} system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulseNode-navyLight border border-pulseNode-border/15 text-xs text-helm-fg3 hover:text-helm-fg transition-colors">
            <Layers size={12} /> Threads
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulseNode-navyLight border border-pulseNode-border/15 text-xs text-helm-fg3 hover:text-helm-fg transition-colors">
            <Users size={12} /> All users
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulseNode-electric text-xs text-white font-medium hover:opacity-90 transition-opacity">
            <Activity size={12} /> Live
          </button>
        </div>
      </div>

      {/* ── CPU core strip ── */}
      <div className="gsap-enter rounded-xl bg-pulseNode-navyLight border border-pulseNode-border/10 shadow-card px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-helm-fg3 mb-3">CPU Cores</p>
        <div className="grid grid-cols-4 gap-4">
          {CPU_CORES.map(core => (
            <div key={core.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-helm-fg3">{core.label}</span>
                <span className="text-[10px] font-mono font-bold text-pulseNode-cyan">{core.pct}%</span>
              </div>
              <ProgressBar value={core.pct} tone="ok" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Filter row ── */}
      <div className="gsap-enter flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search processes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] max-w-[280px] px-3 py-1.5 rounded-lg bg-pulseNode-navyLight border border-pulseNode-border/20 text-xs text-helm-fg placeholder:text-helm-fg3 focus:outline-none focus:ring-1 focus:ring-pulseNode-cyan/40"
        />
        <FilterChip label="User"  value="All" />
        <FilterChip label="State" value="All" />

        {/* Sort btn-group */}
        <div className="flex items-center rounded-lg border border-pulseNode-border/15 overflow-hidden ml-auto">
          {(["cpu", "mem", "pid"] as SortKey[]).map(k => (
            <button
              key={k}
              onClick={() => handleSort(k)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors uppercase tracking-wide",
                sortKey === k
                  ? "bg-pulseNode-navyLight text-helm-fg"
                  : "text-helm-fg3 hover:text-helm-fg"
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* ── Process table ── */}
      <div className="gsap-enter rounded-xl bg-pulseNode-navyLight border border-pulseNode-border/10 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="pn-table w-full">
            <thead>
              <tr>
                <th className="w-14">
                  <button onClick={() => handleSort("pid")} className="flex items-center gap-0.5 hover:text-helm-fg transition-colors">
                    PID <SortIcon k="pid" />
                  </button>
                </th>
                <th>User</th>
                <th>Command</th>
                <th>State</th>
                <th>
                  <button onClick={() => handleSort("cpu")} className="flex items-center gap-0.5 hover:text-helm-fg transition-colors">
                    CPU% <SortIcon k="cpu" />
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort("mem")} className="flex items-center gap-0.5 hover:text-helm-fg transition-colors">
                    MEM% <SortIcon k="mem" />
                  </button>
                </th>
                <th>VIRT</th>
                <th>RES</th>
                <th>TIME+</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(proc => (
                <tr
                  key={proc.pid}
                  className={cn(
                    proc.type === "pm2" && "border-l-2 border-pulseNode-cyan"
                  )}
                >
                  {/* PID */}
                  <td className="mono-cell dim">{proc.pid}</td>

                  {/* User */}
                  <td className="dim">{proc.user}</td>

                  {/* Command */}
                  <td>
                    <div className="flex items-center gap-2">
                      {proc.type === "pm2" && (
                        <span className="bg-pn-cyan/10 text-pn-cyan text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                          PM2
                        </span>
                      )}
                      <span className="font-mono text-[12px] text-helm-fg truncate max-w-[380px]" title={proc.cmd}>
                        {proc.cmd}
                      </span>
                    </div>
                  </td>

                  {/* State */}
                  <td>
                    {proc.state === "R"
                      ? <Pill tone="ok" dot>Running</Pill>
                      : <Pill tone="outline">Sleep</Pill>
                    }
                  </td>

                  {/* CPU% */}
                  <td>
                    <div className="flex items-center gap-2">
                      <MiniBar value={(proc.cpu / 15) * 100} color="var(--pn-cyan)" />
                      <span className="text-[11px] font-mono text-helm-fg">{proc.cpu.toFixed(1)}</span>
                    </div>
                  </td>

                  {/* MEM% */}
                  <td>
                    <div className="flex items-center gap-2">
                      <MiniBar value={(proc.mem / 10) * 100} color="var(--pn-blue)" />
                      <span className="text-[11px] font-mono text-helm-fg">{proc.mem.toFixed(1)}</span>
                    </div>
                  </td>

                  {/* VIRT */}
                  <td className="mono-cell dim">{proc.virt}</td>

                  {/* RES */}
                  <td className="mono-cell dim">{proc.res}</td>

                  {/* TIME+ */}
                  <td className="mono-cell dim">{proc.time}</td>

                  {/* Actions */}
                  <td className="right">
                    <ActionBtn icon={<MoreHorizontal size={14} />} title="More actions" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-pulseNode-border/10">
          <span className="text-[11px] text-helm-fg3">
            Showing {sorted.length} of {PROCESSES.length} processes
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-live" />
            Live · 2s
          </div>
        </div>
      </div>
    </div>
  )
}
