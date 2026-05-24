"use client"

import { usePathname, useRouter } from "next/navigation"
import { RefreshCw, Bell, Settings, Search } from "lucide-react"
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

const PAGE_TITLES: Record<string, string> = {
  "/containers":   "Containers",
  "/stats":        "System Stats",
  "/processes":    "Processes",
  "/coolify":      "Coolify",
  "/images":       "Images",
  "/networks":     "Networks",
  "/databases":    "Databases",
  "/scan-history": "Scan History",
  "/sbom-history": "SBOMs",
  "/alerts":       "Alerts",
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const title = PAGE_TITLES[pathname] ?? "PulseNode"

  return (
    <header
      className="h-[52px] flex items-center px-5 gap-4 flex-shrink-0"
      style={{
        background: "var(--bg-1)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <span style={{ color: "var(--fg-3)" }}>production-01</span>
        <span style={{ color: "var(--fg-4)" }}>/</span>
        <span className="font-medium" style={{ color: "var(--fg)" }}>{title}</span>
      </div>

      {/* Search */}
      <div
        className="flex-1 max-w-sm mx-auto hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Search size={12} style={{ color: "var(--fg-3)" }} className="flex-shrink-0" />
        <input
          className="bg-transparent outline-none text-sm flex-1 min-w-0"
          style={{ color: "var(--fg)" }}
          placeholder="Search containers, images, processes…"
        />
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
        >
          ⌘K
        </span>
      </div>

      {/* Actions */}
      <div className="ml-auto flex items-center gap-0.5">
        <AnimatedThemeToggler className="pn-icon-btn" variant="circle" duration={520} />
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: "var(--fg-3)" }}
          title="Refresh"
          onClick={() => window.location.reload()}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg-3)"
          }}
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: pathname === "/alerts" ? "var(--fg)" : "var(--fg-3)" }}
          title="Alerts"
          onClick={() => router.push("/alerts")}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
            ;(e.currentTarget as HTMLButtonElement).style.color = pathname === "/alerts" ? "var(--fg)" : "var(--fg-3)"
          }}
        >
          <Bell size={14} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: pathname === "/settings" ? "var(--fg)" : "var(--fg-3)" }}
          title="Settings"
          onClick={() => router.push("/settings")}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
            ;(e.currentTarget as HTMLButtonElement).style.color = pathname === "/settings" ? "var(--fg)" : "var(--fg-3)"
          }}
        >
          <Settings size={14} />
        </button>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ml-1 flex-shrink-0"
          style={{ background: "var(--acc)" }}
        >
          SS
        </div>
      </div>
    </header>
  )
}
