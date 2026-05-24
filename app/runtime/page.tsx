"use client"

import { useState, useEffect, useRef } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { Box, RefreshCw, ArrowUpDown, Cpu, MemoryStick } from "lucide-react"
import { nodeApi } from "@/lib/api"
import Link from "next/link"

type ContainerStat = {
  id: string
  name: string
  image: string
  state: string
  cpu: number
  ramPct: number
  ramMb: number
  ramLimitMb: number
}

type SortKey = "cpu" | "ramMb" | "name"

function fmtMb(mb: number) {
  return mb < 1024 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(2)} GB`
}

function Bar({ value, warn = 60, danger = 80, color }: { value: number; warn?: number; danger?: number; color?: string }) {
  const c = color ?? (value >= danger ? "var(--bad)" : value >= warn ? "var(--warn)" : "var(--pn-cyan)")
  return (
    <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, value)}%`, background: c }} />
    </div>
  )
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl px-5 py-4 flex items-center gap-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--bg-3)" }}>
        {icon}
      </div>
      <div>
        <p className="text-[11px]" style={{ color: "var(--fg-3)" }}>{label}</p>
        <p className="text-xl font-bold leading-tight" style={{ color: "var(--fg)" }}>{value}</p>
        {sub && <p className="text-[11px]" style={{ color: "var(--fg-3)" }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function RuntimePage() {
  const [containers, setContainers] = useState<ContainerStat[]>([])
  const [loading, setLoading]       = useState(true)
  const [sortKey, setSortKey]       = useState<SortKey>("cpu")
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc")
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.fromTo(".gsap-enter", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: "power2.out" })
  }, { scope: containerRef, dependencies: [loading] })

  function fetchStats() {
    nodeApi.get<ContainerStat[]>("/api/docker/container-stats")
      .then(({ data }) => {
        if (Array.isArray(data)) {
          setContainers(data)
          setLastUpdate(new Date())
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchStats()
    const id = setInterval(() => { if (!document.hidden) fetchStats() }, 3000)
    return () => clearInterval(id)
  }, [])

  const sorted = [...containers].sort((a, b) => {
    const av = a[sortKey as keyof ContainerStat] as number | string
    const bv = b[sortKey as keyof ContainerStat] as number | string
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const totalCpu    = containers.reduce((s, c) => s + c.cpu, 0)
  const totalRamMb  = containers.reduce((s, c) => s + c.ramMb, 0)
  const avgCpu      = containers.length ? totalCpu / containers.length : 0
  const hottest     = containers.length ? [...containers].sort((a, b) => b.cpu - a.cpu)[0] : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--fg-3)" }} />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="p-6 space-y-6">

      {/* Header */}
      <div className="gsap-enter flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            <Box size={18} style={{ color: "var(--acc)" }} />
            Runtime Monitor
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--fg-3)" }}>
            Live CPU and memory usage for all running Docker containers
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--fg-3)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 status-live" />
          Live · refreshes every 3s
          {lastUpdate && (
            <span className="ml-1">· {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {containers.length > 0 && (
        <div className="gsap-enter grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Running containers"
            value={String(containers.length)}
            icon={<Box size={16} style={{ color: "var(--acc)" }} />}
          />
          <StatCard
            label="Avg CPU usage"
            value={`${avgCpu.toFixed(1)}%`}
            sub={`Total: ${totalCpu.toFixed(1)}%`}
            icon={<Cpu size={16} style={{ color: "var(--pn-cyan)" }} />}
          />
          <StatCard
            label="Total RAM used"
            value={fmtMb(totalRamMb)}
            icon={<MemoryStick size={16} style={{ color: "var(--pn-blue)" }} />}
          />
          <StatCard
            label="Highest CPU"
            value={hottest ? `${hottest.cpu.toFixed(1)}%` : "—"}
            sub={hottest?.name}
            icon={<Cpu size={16} style={{ color: hottest && hottest.cpu > 70 ? "var(--bad)" : "var(--warn)" }} />}
          />
        </div>
      )}

      {/* Container table */}
      <div className="gsap-enter rounded-xl overflow-hidden" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
            Containers
            <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--fg-3)" }}>
              {containers.length} running
            </span>
          </span>
          <Link href="/containers" className="text-xs transition-opacity hover:opacity-70" style={{ color: "var(--acc)" }}>
            Manage →
          </Link>
        </div>

        {containers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Box size={32} style={{ color: "var(--fg-4)" }} />
            <p className="text-sm" style={{ color: "var(--fg-3)" }}>No running containers</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="pn-table w-full">
              <thead>
                <tr>
                  <th>
                    <button className="flex items-center gap-1 hover:opacity-70 transition-opacity" onClick={() => toggleSort("name")}>
                      Container {sortKey === "name" && <ArrowUpDown size={10} />}
                    </button>
                  </th>
                  <th>Image</th>
                  <th>
                    <button className="flex items-center gap-1 hover:opacity-70 transition-opacity" onClick={() => toggleSort("cpu")}>
                      CPU% {sortKey === "cpu" && <ArrowUpDown size={10} />}
                    </button>
                  </th>
                  <th>
                    <button className="flex items-center gap-1 hover:opacity-70 transition-opacity" onClick={() => toggleSort("ramMb")}>
                      RAM {sortKey === "ramMb" && <ArrowUpDown size={10} />}
                    </button>
                  </th>
                  <th>RAM %</th>
                  <th className="right">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Box size={13} style={{ color: "var(--acc)", flexShrink: 0 }} />
                        <div>
                          <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{c.name}</p>
                          <p className="text-[10px] font-mono" style={{ color: "var(--fg-4)" }}>{c.id}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-[11px] font-mono" style={{ color: "var(--fg-3)" }}>
                        {c.image.length > 36 ? c.image.slice(0, 36) + "…" : c.image}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Bar value={c.cpu} />
                        <span className="text-[12px] font-mono w-12 text-right flex-shrink-0"
                          style={{ color: c.cpu >= 80 ? "var(--bad)" : c.cpu >= 60 ? "var(--warn)" : "var(--fg)" }}>
                          {c.cpu.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <Bar value={c.ramPct} color={c.ramPct >= 80 ? "var(--bad)" : c.ramPct >= 60 ? "var(--warn)" : "var(--pn-blue)"} />
                        <span className="text-[12px] font-mono w-16 text-right flex-shrink-0" style={{ color: "var(--fg)" }}>
                          {fmtMb(c.ramMb)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-mono" style={{ color: c.ramPct >= 80 ? "var(--bad)" : c.ramPct >= 60 ? "var(--warn)" : "var(--fg)" }}>
                          {c.ramPct.toFixed(1)}%
                        </span>
                        {c.ramLimitMb > 0 && (
                          <span className="text-[10px]" style={{ color: "var(--fg-4)" }}>
                            of {fmtMb(c.ramLimitMb)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="right">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ background: "color-mix(in srgb, var(--ok) 15%, transparent)", color: "var(--ok)" }}>
                        <span className="w-1 h-1 rounded-full status-live" style={{ background: "var(--ok)" }} />
                        running
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
