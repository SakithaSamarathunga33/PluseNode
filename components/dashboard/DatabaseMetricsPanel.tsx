"use client"

import { useState, useEffect, useCallback } from "react"
import { nodeApi } from "@/lib/api"
import type { Database, DbMetricItem, DbMetrics } from "@/lib/types"

function MetricCard({ item }: { item: DbMetricItem }) {
  const valueColor =
    item.tone === "ok"   ? "text-green-400" :
    item.tone === "warn" ? "text-amber-400" :
    item.tone === "bad"  ? "text-red-400"   :
    "text-helm-fg"

  return (
    <div className="bg-pulseNode-navy rounded-lg p-3 flex flex-col gap-1">
      <div className="text-[9px] uppercase tracking-wider text-helm-fg3 font-medium leading-none">
        {item.label}
      </div>
      <div className={`text-sm font-semibold leading-none ${valueColor}`}>
        {String(item.value)}
      </div>
    </div>
  )
}

export function DatabaseMetricsPanel({
  db,
  onClose,
}: {
  db: Database
  onClose: () => void
}) {
  const [metrics, setMetrics] = useState<DbMetrics | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMetrics = useCallback(() => {
    nodeApi
      .get<DbMetrics>(`/api/database/${db.name}/metrics`)
      .then(({ data }) => { setMetrics(data); setError(null) })
      .catch(err => setError(err instanceof Error ? err.message : "Failed to load metrics"))
      .finally(() => setLoading(false))
  }, [db.name])

  useEffect(() => {
    fetchMetrics()
    const timer = setInterval(fetchMetrics, 5000)
    return () => clearInterval(timer)
  }, [fetchMetrics])

  return (
    <div className="bg-pulseNode-navyLight rounded-xl border border-amber-500/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-pulseNode-navy border-b border-pulseNode-border/10">
        <span className="font-semibold text-sm text-helm-fg">{db.name}</span>
        <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">Metrics</span>
        {!loading && !error && (
          <span className="text-[9px] text-helm-fg3">live · refreshes every 5s</span>
        )}
        <button
          onClick={onClose}
          aria-label="Close metrics panel"
          className="ml-auto text-helm-fg3 hover:text-helm-fg text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <p className="text-xs text-helm-fg3">Loading metrics…</p>
        )}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {metrics.metrics.map((m, i) => (
              <MetricCard key={i} item={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
