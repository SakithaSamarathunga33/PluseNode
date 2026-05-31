import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { AppShell } from "@/components/AppShell"

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
    icon: "/helmet.png",
    shortcut: "/helmet.png",
    apple: "/helmet.png",
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
