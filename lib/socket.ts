"use client"

type Handler = (payload: unknown) => void

class NativeRealtime {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Handler>>()
  private reconnects = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private url: string) {
    this.connect()
  }

  on<T = unknown>(event: string, handler: (payload: T) => void) {
    const wrapped = handler as Handler
    const set = this.listeners.get(event) ?? new Set<Handler>()
    set.add(wrapped)
    this.listeners.set(event, set)
  }

  off<T = unknown>(event: string, handler: (payload: T) => void) {
    this.listeners.get(event)?.delete(handler as Handler)
  }

  private emit(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach(handler => handler(payload))
  }

  private connect() {
    if (!this.url || typeof window === "undefined") return
    this.ws = new WebSocket(this.url)
    this.ws.addEventListener("open", () => {
      this.reconnects = 0
      console.log("[ws] connected")
    })
    this.ws.addEventListener("close", () => {
      console.log("[ws] disconnected")
      this.scheduleReconnect()
    })
    this.ws.addEventListener("message", event => {
      try {
        const msg = JSON.parse(event.data)
        if (msg?.type) this.emit(msg.type, msg.data)
      } catch {
        // Ignore malformed frames.
      }
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.reconnects >= 5) return
    this.reconnects += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 2000)
  }
}

let socket: NativeRealtime | null = null

function realtimeUrl() {
  const explicit = process.env.NEXT_PUBLIC_GO_WS
  if (explicit) return explicit

  const goApi = process.env.NEXT_PUBLIC_GO_API
  if (goApi) {
    const url = new URL(goApi, window.location.origin)
    if (url.pathname.endsWith("/go")) url.pathname = url.pathname.slice(0, -3) || "/"
    url.pathname = "/ws"
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    return url.toString()
  }

  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`
}

export function getSocket(): NativeRealtime {
  if (!socket) socket = new NativeRealtime(realtimeUrl())
  return socket
}
