interface Vulns { crit: number; high: number; med: number; low: number }

export function VulnBar({ v }: { v: Vulns }) {
  const total = v.crit + v.high + v.med + v.low
  if (total === 0) return <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "monospace" }}>—</span>
  return (
    <div className="flex items-center gap-1.5">
      {v.crit > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>
          C:{v.crit}
        </span>
      )}
      {v.high > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(249,115,22,0.18)", color: "#f97316" }}>
          H:{v.high}
        </span>
      )}
      {v.med > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
          M:{v.med}
        </span>
      )}
      {v.low > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "var(--acc-soft-2)", color: "var(--acc-2)" }}>
          L:{v.low}
        </span>
      )}
    </div>
  )
}
