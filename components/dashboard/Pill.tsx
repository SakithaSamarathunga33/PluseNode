interface PillProps {
  children: React.ReactNode
  tone?: "ok" | "bad" | "warn" | "info" | "acc" | "outline"
  dot?: boolean
  className?: string
}

const TONE_STYLES: Record<string, React.CSSProperties> = {
  ok:      { background: "var(--ok-soft)",   color: "var(--ok)"   },
  bad:     { background: "var(--bad-soft)",  color: "var(--bad)"  },
  warn:    { background: "var(--warn-soft)", color: "var(--warn)" },
  info:    { background: "var(--info-soft)", color: "var(--info)" },
  acc:     { background: "var(--acc-soft)",  color: "var(--acc)"  },
  outline: { background: "transparent", color: "var(--fg-3)", border: "1px solid var(--border-2)" },
}

export function Pill({ children, tone = "outline", dot, className }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap${className ? ` ${className}` : ""}`}
      style={TONE_STYLES[tone]}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
