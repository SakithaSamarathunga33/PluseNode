"use client"

interface ProgressBarProps {
  value: number
  tone?: "ok" | "warn" | "bad" | "info" | ""
  className?: string
}

const FILL_COLORS = {
  ok:   "var(--ok)",
  warn: "var(--warn)",
  bad:  "var(--bad)",
  info: "var(--acc-2)",
  "":   "var(--acc)",
}

export function ProgressBar({ value, tone = "", className }: ProgressBarProps) {
  const t = tone || (value > 85 ? "bad" : value > 70 ? "warn" : "ok")
  return (
    <div
      className={`h-[3px] rounded-full overflow-hidden${className ? ` ${className}` : ""}`}
      style={{ background: "var(--bg-3)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-[600ms] ease-out"
        style={{ backgroundColor: FILL_COLORS[t as keyof typeof FILL_COLORS], width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}
