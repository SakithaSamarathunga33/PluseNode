"use client"

import type { LucideIcon } from "lucide-react"
import { NumberTicker } from "@/components/magicui/number-ticker"

interface StatCardProps {
  label: string
  value: number | string
  unit?: string
  sub?: React.ReactNode
  icon?: LucideIcon
  spark?: number[]
  delta?: string
  deltaTone?: "up" | "down" | "flat"
  tone?: "acc" | "warn" | "bad" | "info" | "ok"
  accent?: boolean
  animate?: boolean
}

function MiniSparkline({ data, color = "var(--acc)" }: { data: number[]; color?: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 84, h = 28
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

const TONE_COLORS: Record<string, string> = {
  acc:  "var(--acc)",
  warn: "var(--warn)",
  bad:  "var(--bad)",
  info: "var(--info)",
  ok:   "var(--ok)",
}

export function StatCard({
  label, value, unit, sub, icon: Icon, spark, delta, deltaTone, tone = "acc", accent, animate = true
}: StatCardProps) {
  const color = TONE_COLORS[tone]
  const isNum = typeof value === "number"

  const deltaStyle =
    deltaTone === "up"   ? { color: "var(--ok)",  background: "var(--ok-soft)"  } :
    deltaTone === "down" ? { color: "var(--bad)", background: "var(--bad-soft)" } :
                           { color: "var(--fg-3)", background: "var(--bg-3)"    }

  return (
    <div
      className="relative rounded-xl p-4 overflow-hidden"
      style={{
        background: "var(--card)",
        border: accent ? `1px solid color-mix(in srgb, ${color} 27%, transparent)` : "1px solid var(--border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span
          className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5"
          style={{ color: "var(--fg-3)" }}
        >
          {Icon && <Icon size={11} />}
          {label}
        </span>
        {delta && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={deltaStyle}>
            {delta}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold" style={{ color }}>
              {isNum && animate
                ? <NumberTicker value={value as number} className="text-2xl font-bold" />
                : value
              }
            </span>
            {unit && <span className="text-sm" style={{ color: "var(--fg-3)" }}>{unit}</span>}
          </div>
          {sub && <div className="text-[11px] mt-1 flex items-center gap-2" style={{ color: "var(--fg-3)" }}>{sub}</div>}
        </div>
        {spark && (
          <div className="flex-shrink-0">
            <MiniSparkline data={spark} color={color} />
          </div>
        )}
      </div>
    </div>
  )
}
