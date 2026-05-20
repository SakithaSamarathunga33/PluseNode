"use client"

import { useState, useRef, useMemo, useEffect, useCallback } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import {
  ChevronDown, ChevronUp, Users, Layers, Activity,
  XCircle, PauseCircle, PlayCircle, Ban, AlertTriangle,
} from "lucide-react"
import { PROCESSES as MOCK_PROCESSES } from "@/lib/mock-data"
import { nodeApi, pythonApi } from "@/lib/api"
import type { Process } from "@/lib/types"
import { Pill } from "@/components/dashboard/Pill"
import { ProgressBar } from "@/components/dashboard/ProgressBar"
import { cn } from "@/lib/utils"

// ── Python process mapper ──────────────────────────────────────────────────────

type PyProcess = {
  pid: number; name: string; cpu: number; mem_mb: number
  status: string; user: string; cmd: string; type: string
}

function mapPyProcess(p: PyProcess): Process {
  return {
    pid:   p.pid,
    user:  p.user,
    cpu:   p.cpu,
    mem:   p.mem_mb,
    virt:  "—",
    res:   `${p.mem_mb} MB`,
    cmd:   p.cmd || p.name,
    state: p.status === "running" ? "R" : "S",
    time:  "—",
    type:  "system" as const,
    name:  p.name,
    memMb: p.mem_mb,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pulseNode-navyLight border border-pulseNode-border/15 text-xs text-helm-fg3 hover:text-helm-fg transition-colors">
      <span className="text-helm-fg4">{label}</span>
      <span className="text-helm-fg">{value}</span>
      <ChevronDown size={10} />
    </button>
  )
}

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

// ── Action dropdown ────────────────────────────────────────────────────────────

type ActionMenuProps = {
  proc: Process
  onKill: (p: Process) => void
  onSuspend: (p: Process) => void
  onClose: () => void
}

function ActionMenu({ proc, onKill, onSuspend, onClose }: ActionMenuProps) {
  const [confirmKill, setConfirmKill] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-7 z-50 w-52 rounded-xl overflow-hidden"
      style={{
        background: "var(--card-elev)",
        border: "1px solid var(--border-2)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header */}
      <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[10px] font-mono" style={{ color: "var(--fg-3)" }}>PID {proc.pid}</p>
        <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>
          {proc.name || proc.cmd.split("/").pop()}
        </p>
      </div>

      <div className="p-1.5 space-y-0.5">
        {/* Suspend */}
        <button
          onClick={() => { onSuspend(proc); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-colors"
          style={{ color: "var(--warn)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--warn-soft)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <PauseCircle size={14} className="flex-shrink-0" />
          <div>
            <p className="font-semibold leading-tight">Suspend</p>
            <p className="text-[10px] leading-tight mt-0.5" style={{ color: "var(--fg-3)" }}>
              SIGSTOP · pause execution
            </p>
          </div>
        </button>

        {/* Kill */}
        {!confirmKill ? (
          <button
            onClick={() => setConfirmKill(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs text-left transition-colors"
            style={{ color: "var(--bad)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bad-soft)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <XCircle size={14} className="flex-shrink-0" />
            <div>
              <p className="font-semibold leading-tight">Kill process</p>
              <p className="text-[10px] leading-tight mt-0.5" style={{ color: "var(--fg-3)" }}>
                SIGKILL · force terminate
              </p>
            </div>
          </button>
        ) : (
          <div className="px-3 py-2.5 rounded-lg" style={{ background: "var(--bad-soft)", border: "1px solid var(--bad)" }}>
            <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--bad)" }}>
              <AlertTriangle size={11} /> Kill PID {proc.pid}?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { onKill(proc); onClose() }}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--bad)" }}
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmKill(false)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                style={{ color: "var(--fg-2)", background: "var(--bg-3)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sort key ───────────────────────────────────────────────────────────────────

type SortKey = "cpu" | "mem" | "pid"

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProcessesPage() {
  const [search,     setSearch]     = useState("")
  const [sortKey,    setSortKey]    = useState<SortKey>("cpu")
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("desc")
  const [processes,  setProcesses]  = useState<Process[]>(MOCK_PROCESSES)
  const [cpuCores,   setCpuCores]   = useState<number[]>([])
  const [menuPid,    setMenuPid]    = useState<number | null>(null)
  const [blocked,    setBlocked]    = useState<Process[]>([])
  const [toast,      setToast]      = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    pythonApi.get<PyProcess[]>("/metrics/processes")
      .then(({ data }) => {
        if (data.length >= 5) {
          setProcesses(data.map(mapPyProcess))
        } else {
          return nodeApi.get<Process[]>("/api/pm2/list")
            .then(({ data: pm2 }) => { if (pm2.length) setProcesses(pm2) })
        }
      })
      .catch(() => {
        nodeApi.get<Process[]>("/api/pm2/list")
          .then(({ data }) => { if (data.length) setProcesses(data) })
          .catch(() => {})
      })

    function fetchCores() {
      pythonApi.get<{ cpuCores?: number[] }>("/metrics/live")
        .then(({ data }) => { if (data.cpuCores?.length) setCpuCores(data.cpuCores) })
        .catch(() => {})
    }
    fetchCores()
    const coreTimer = setInterval(fetchCores, 3000)
    return () => clearInterval(coreTimer)
  }, [])

  useGSAP(() => {
    gsap.fromTo(".gsap-enter", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: "power2.out" })
  }, { scope: containerRef })

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleKill = useCallback((proc: Process) => {
    nodeApi.post(`/api/processes/kill/${proc.pid}`)
      .then(() => {
        setProcesses(prev => prev.filter(p => p.pid !== proc.pid))
        setBlocked(prev => prev.filter(p => p.pid !== proc.pid))
        showToast(`Killed ${proc.name || proc.cmd} (PID ${proc.pid})`)
      })
      .catch(err => showToast(`Kill failed: ${err.message}`))
  }, [])

  const handleSuspend = useCallback((proc: Process) => {
    nodeApi.post(`/api/processes/suspend/${proc.pid}`)
      .then(() => {
        setBlocked(prev => prev.find(p => p.pid === proc.pid) ? prev : [...prev, { ...proc, state: "T" }])
        showToast(`Suspended ${proc.name || proc.cmd} (PID ${proc.pid})`)
      })
      .catch(err => showToast(`Suspend failed: ${err.message}`))
  }, [])

  const handleResume = useCallback((proc: Process) => {
    nodeApi.post(`/api/processes/resume/${proc.pid}`)
      .then(() => {
        setBlocked(prev => prev.filter(p => p.pid !== proc.pid))
        showToast(`Resumed ${proc.name || proc.cmd} (PID ${proc.pid})`)
      })
      .catch(err => showToast(`Resume failed: ${err.message}`))
  }, [])

  // ── Sorting ──────────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const sorted = useMemo(() => {
    const blockedPids = new Set(blocked.map(p => p.pid))
    const q = search.toLowerCase()
    const list = processes
      .filter(p => !blockedPids.has(p.pid))
      .filter(p => !q || p.cmd.toLowerCase().includes(q) || p.user.toLowerCase().includes(q) || String(p.pid).includes(q))
    list.sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number
      const bv = b[sortKey as keyof typeof b] as number
      return sortDir === "desc" ? bv - av : av - bv
    })
    return list
  }, [search, sortKey, sortDir, processes, blocked])

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null
    return sortDir === "desc"
      ? <ChevronDown size={11} className="inline ml-0.5" />
      : <ChevronUp size={11} className="inline ml-0.5" />
  }

  return (
    <div ref={containerRef} className="p-6 space-y-5">

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{
            background: "var(--card-elev)",
            border: "1px solid var(--border-2)",
            color: "var(--fg)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}>
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <div className="gsap-enter flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-helm-fg">Processes</h1>
          <p className="text-[12px] text-helm-fg3 mt-0.5">
            {processes.length} processes · {processes.filter(p => p.type === "pm2").length} PM2 · {processes.filter(p => p.type === "system").length} system
            {blocked.length > 0 && <span className="text-amber-400"> · {blocked.length} suspended</span>}
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
      {cpuCores.length > 0 && (
        <div className="gsap-enter rounded-xl bg-pulseNode-navyLight border border-pulseNode-border/10 shadow-card px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-helm-fg3 mb-3">CPU Cores · live</p>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(cpuCores.length, 8)}, 1fr)` }}>
            {cpuCores.map((pct, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-helm-fg3">CPU{i + 1}</span>
                  <span className="text-[10px] font-mono font-bold text-pulseNode-cyan">{pct}%</span>
                </div>
                <ProgressBar value={pct} tone={pct > 85 ? "bad" : pct > 65 ? "warn" : "ok"} />
              </div>
            ))}
          </div>
        </div>
      )}

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
        <div className="flex items-center rounded-lg border border-pulseNode-border/15 overflow-hidden ml-auto">
          {(["cpu", "mem", "pid"] as SortKey[]).map(k => (
            <button
              key={k}
              onClick={() => handleSort(k)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors uppercase tracking-wide",
                sortKey === k ? "bg-pulseNode-navyLight text-helm-fg" : "text-helm-fg3 hover:text-helm-fg"
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
                    MEM <SortIcon k="mem" />
                  </button>
                </th>
                <th>RES</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(proc => (
                <tr key={proc.pid} className={cn(proc.type === "pm2" && "border-l-2 border-pulseNode-cyan")}>
                  <td className="mono-cell dim">{proc.pid}</td>
                  <td className="dim">{proc.user}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {proc.type === "pm2" && (
                        <span className="bg-pn-cyan/10 text-pn-cyan text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0">PM2</span>
                      )}
                      <span className="font-mono text-[12px] text-helm-fg truncate max-w-[380px]" title={proc.cmd}>
                        {proc.cmd}
                      </span>
                    </div>
                  </td>
                  <td>
                    {proc.state === "R"
                      ? <Pill tone="ok" dot>Running</Pill>
                      : <Pill tone="outline">Sleep</Pill>
                    }
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <MiniBar value={(proc.cpu / 15) * 100} color="var(--pn-cyan)" />
                      <span className="text-[11px] font-mono text-helm-fg">{proc.cpu.toFixed(1)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <MiniBar
                        value={proc.memMb != null ? Math.min(100, (proc.memMb / 500) * 100) : (proc.mem / 10) * 100}
                        color="var(--pn-blue)"
                      />
                      <span className="text-[11px] font-mono text-helm-fg">
                        {proc.memMb != null ? `${proc.memMb}M` : `${proc.mem.toFixed(1)}%`}
                      </span>
                    </div>
                  </td>
                  <td className="mono-cell dim">{proc.res}</td>
                  <td className="right">
                    <div className="relative flex justify-end">
                      <button
                        onClick={() => setMenuPid(menuPid === proc.pid ? null : proc.pid)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        style={{
                          color: menuPid === proc.pid ? "var(--fg)" : "var(--fg-3)",
                          background: menuPid === proc.pid ? "var(--bg-active)" : "transparent",
                          border: "1px solid var(--border)",
                        }}
                        onMouseEnter={e => {
                          if (menuPid !== proc.pid) (e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
                        }}
                        onMouseLeave={e => {
                          if (menuPid !== proc.pid) (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-3)"
                        }}
                      >
                        Actions <ChevronDown size={10} />
                      </button>
                      {menuPid === proc.pid && (
                        <ActionMenu
                          proc={proc}
                          onKill={handleKill}
                          onSuspend={handleSuspend}
                          onClose={() => setMenuPid(null)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-pulseNode-border/10">
          <span className="text-[11px] text-helm-fg3">
            Showing {sorted.length} of {processes.length} processes
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-live" />
            Live · 2s
          </div>
        </div>
      </div>

      {/* ── Blocked / Suspended section ── */}
      {blocked.length > 0 && (
        <div className="gsap-enter rounded-xl overflow-hidden shadow-card"
          style={{ border: "1px solid var(--warn-soft)", background: "var(--card)" }}>
          {/* Section header */}
          <div className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--warn-soft)" }}>
            <div className="flex items-center gap-2">
              <Ban size={14} style={{ color: "var(--warn)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--warn)" }}>Suspended Processes</span>
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-mono"
                style={{ background: "var(--warn-soft)", color: "var(--warn)", border: "1px solid var(--warn)" }}
              >
                {blocked.length}
              </span>
            </div>
            <span className="text-[11px]" style={{ color: "var(--fg-3)" }}>Resume a process to allow it to run again</span>
          </div>

          {/* Table */}
          <table className="pn-table w-full">
            <thead>
              <tr>
                <th>PID</th>
                <th>User</th>
                <th>Command</th>
                <th>State</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map(proc => (
                <tr key={proc.pid} style={{ borderLeft: "2px solid var(--warn)" }}>
                  <td className="mono-cell" style={{ color: "var(--warn)" }}>{proc.pid}</td>
                  <td className="dim">{proc.user}</td>
                  <td>
                    <span className="font-mono text-[12px] truncate max-w-[400px]" style={{ color: "var(--fg)" }} title={proc.cmd}>
                      {proc.cmd}
                    </span>
                  </td>
                  <td>
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--warn)" }} />
                      SIGSTOP · paused
                    </span>
                  </td>
                  <td className="right">
                    <button
                      onClick={() => handleResume(proc)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-auto"
                      style={{ background: "var(--ok-soft)", color: "var(--ok)", border: "1px solid var(--ok)" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                    >
                      <PlayCircle size={12} /> Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
