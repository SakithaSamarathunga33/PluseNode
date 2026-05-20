"use client"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface Sparkle { id: number; x: string; y: string; size: number; delay: number; color: string }

interface SparklesTextProps {
  text: string
  className?: string
  sparklesCount?: number
  colors?: { first: string; second: string }
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function generateSparkle(colors: { first: string; second: string }): Sparkle {
  return {
    id: Math.random(),
    x: `${randomBetween(0, 100)}%`,
    y: `${randomBetween(0, 100)}%`,
    size: randomBetween(4, 8),
    delay: randomBetween(0, 1.5),
    color: Math.random() > 0.5 ? colors.first : colors.second,
  }
}

export default function SparklesText({
  text,
  className,
  sparklesCount = 8,
  colors = { first: "var(--pn-cyan)", second: "var(--pn-blue)" },
}: SparklesTextProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([])

  useEffect(() => {
    const sparkleColors = { first: colors.first, second: colors.second }
    setSparkles(Array.from({ length: sparklesCount }, () => generateSparkle(sparkleColors)))
    const interval = setInterval(() => {
      setSparkles(prev =>
        prev.map(s =>
          Math.random() > 0.6 ? generateSparkle(sparkleColors) : s
        )
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [sparklesCount, colors.first, colors.second])

  return (
    <span className={cn("relative inline-block", className)}>
      {sparkles.map(s => (
        <span
          key={s.id}
          className="pointer-events-none absolute"
          style={{ left: s.x, top: s.y, width: s.size, height: s.size }}
        >
          <svg
            width={s.size}
            height={s.size}
            viewBox="0 0 12 12"
            fill="none"
            style={{ animation: `sparkle 1.5s ${s.delay}s ease-in-out infinite` }}
          >
            <path
              d="M6 0L7.09 4.91L12 6L7.09 7.09L6 12L4.91 7.09L0 6L4.91 4.91L6 0Z"
              fill={s.color}
            />
          </svg>
        </span>
      ))}
      <span className="relative z-10">{text}</span>
    </span>
  )
}
