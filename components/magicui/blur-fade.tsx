"use client"
import { motion } from "framer-motion"
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
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, filter: "blur(6px)", y: 8 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{ duration, delay, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}
