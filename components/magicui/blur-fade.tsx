"use client"
import { cn } from "@/lib/utils"

interface BlurFadeProps {
  children: React.ReactNode
  className?: string
  delay?: number
  duration?: number
  inView?: boolean
}

export default function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.4,
}: BlurFadeProps) {
  return (
    <div
      className={cn("animate-in fade-in slide-in-from-bottom-2 fill-mode-both", className)}
      style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  )
}
