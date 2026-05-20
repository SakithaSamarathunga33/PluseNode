"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { RefreshCw, Bell, Settings, Search, Moon, Sun } from "lucide-react"

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
  const title = PAGE_TITLES[pathname] ?? "PulseNode"
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    const saved = window.localStorage.getItem("pn-theme")
    const nextTheme = saved === "light" ? "light" : "dark"
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
  }, [])

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark"
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem("pn-theme", nextTheme)
  }

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
        <button
          onClick={toggleTheme}
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: "var(--fg-3)" }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg-3)"
          }}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        {[
          { Icon: RefreshCw, label: "Refresh" },
          { Icon: Bell, label: "Notifications", badge: true },
          { Icon: Settings, label: "Settings" },
        ].map(({ Icon, label, badge }) => (
          <button
            key={label}
            className="relative p-2 rounded-lg transition-colors"
            style={{ color: "var(--fg-3)" }}
            title={label}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
              ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent"
              ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg-3)"
            }}
          >
            <Icon size={14} />
            {badge && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>
        ))}
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
