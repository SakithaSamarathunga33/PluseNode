"use client"

let es: EventSource | null = null

export function getSSE(): EventSource {
  if (typeof window === "undefined") {
    // SSR guard — return a dummy object
    return { addEventListener: () => {}, removeEventListener: () => {} } as unknown as EventSource
  }
  if (!es || es.readyState === EventSource.CLOSED) {
    const url = process.env.NEXT_PUBLIC_SSE_URL ?? "/api/sse"
    es = new EventSource(url)
    es.addEventListener("open",  () => console.log("[sse] connected"))
    es.addEventListener("error", () => console.log("[sse] disconnected"))
  }
  return es
}
