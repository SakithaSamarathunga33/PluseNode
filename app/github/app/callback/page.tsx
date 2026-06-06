"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { RefreshCw, CheckCircle, XCircle } from "lucide-react"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

function CallbackInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const installationId = searchParams.get("installation_id")
    const action = searchParams.get("setup_action")
    const state = searchParams.get("state")

    // If state encodes a different origin (user was on a different PulseNode
    // instance when they clicked Install), relay them there so their instance
    // registers the installation — not this one.
    if (state) {
      try {
        const originFromState = atob(state)
        if (
          originFromState &&
          /^https?:\/\//.test(originFromState) &&
          originFromState !== window.location.origin
        ) {
          const relay = new URLSearchParams()
          if (installationId) relay.set("installation_id", installationId)
          if (action) relay.set("setup_action", action)
          // No state forwarded — avoids relay loops
          window.location.href = `${originFromState}/github/app/callback?${relay}`
          return
        }
      } catch { /* invalid base64 — fall through to local handling */ }
    }

    if (!installationId && action !== "delete") {
      setStatus("error")
      setMessage("Missing installation_id parameter.")
      return
    }

    const params = new URLSearchParams()
    if (installationId) params.set("installation_id", installationId)
    if (action) params.set("setup_action", action)

    fetch(`${GO_API}/api/github/app/register?${params}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "Registration failed")
        if (action === "delete") {
          setStatus("ok")
          setMessage("App uninstalled successfully.")
        } else {
          setStatus("ok")
          setMessage(`Installation registered for ${d.accountLogin ?? "your account"}.`)
        }
        setTimeout(() => router.push("/github"), 1500)
      })
      .catch(e => {
        setStatus("error")
        setMessage(e.message)
        setTimeout(() => router.push("/github"), 3000)
      })
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-1)" }}>
      <div className="rounded-2xl p-8 text-center space-y-4 max-w-sm w-full"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        {status === "loading" && (
          <>
            <RefreshCw size={32} className="mx-auto animate-spin" style={{ color: "var(--acc)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>Registering installation…</p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle size={32} className="mx-auto" style={{ color: "var(--ok)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>{message}</p>
            <p className="text-xs" style={{ color: "var(--fg-3)" }}>Redirecting…</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={32} className="mx-auto" style={{ color: "var(--err)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>Something went wrong</p>
            <p className="text-xs" style={{ color: "var(--fg-3)" }}>{message}</p>
            <p className="text-xs" style={{ color: "var(--fg-3)" }}>Redirecting to GitHub settings…</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function GitHubAppCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-1)" }}>
        <RefreshCw size={32} className="animate-spin" style={{ color: "var(--acc)" }} />
      </div>
    }>
      <CallbackInner />
    </Suspense>
  )
}
