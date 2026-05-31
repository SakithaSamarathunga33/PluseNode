"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/sidebar/AppSidebar"
import { Topbar } from "@/components/dashboard/Topbar"

// The login page is a standalone full-screen view — it must not render the
// dashboard chrome (sidebar + topbar). Every other route gets the normal shell.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname?.startsWith("/login")) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
