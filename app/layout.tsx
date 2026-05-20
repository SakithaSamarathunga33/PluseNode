import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { AppSidebar } from "@/components/sidebar/AppSidebar"
import { Topbar } from "@/components/dashboard/Topbar"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: "PulseNode",
  description: "Infrastructure at a glance",
  icons: {
    icon: "/helmeticon.png",
    shortcut: "/helmeticon.png",
    apple: "/helmeticon.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body
        className="antialiased"
        style={{
          background: "var(--body-bg)",
          color: "var(--fg)",
          minHeight: "100vh",
        }}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('pn-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){}",
          }}
        />
        <div className="flex h-screen overflow-hidden">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
