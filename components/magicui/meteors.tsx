"use client"
import { cn } from "@/lib/utils"

interface MeteorsProps {
  number?: number
  className?: string
}

export function Meteors({ number = 20, className }: MeteorsProps) {
  const meteors = Array.from({ length: number }, (_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    duration: `${Math.random() * 3 + 2}s`,
    size: Math.random() * 2 + 1,
  }))

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {meteors.map(m => (
        <span
          key={m.id}
          className="absolute"
          style={{
            top: m.top,
            left: m.left,
            width: `${m.size * 80}px`,
            height: `${m.size}px`,
            borderRadius: "9999px",
            background: "linear-gradient(90deg, var(--pn-cyan), transparent)",
            opacity: 0.6,
            transform: "rotate(-30deg)",
            animation: `meteor ${m.duration} ${m.delay} linear infinite`,
          }}
        />
      ))}
    </div>
  )
}
