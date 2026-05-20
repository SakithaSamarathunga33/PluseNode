"use client"
import { cn } from "@/lib/utils"

interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  colorFrom?: string
  colorTo?: string
  delay?: number
}

export function BorderBeam({
  className,
  size = 200,
  duration = 10,
  colorFrom = "var(--pn-cyan)",
  colorTo = "var(--pn-blue)",
  delay = 0,
}: BorderBeamProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={
        {
          "--size": size,
          "--duration": duration,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          "--delay": `-${delay}s`,
        } as React.CSSProperties
      }
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          border: "1px solid transparent",
          background: `linear-gradient(${colorFrom}, ${colorTo}) border-box`,
          WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
          opacity: 0.6,
          animation: `border-beam calc(${duration}s) infinite linear`,
          animationDelay: `calc(${delay}s)`,
        }}
      />
    </div>
  )
}
