"use client"
import { io, type Socket } from "socket.io-client"

let socket: Socket | null = null

const opts = {
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  transports: ["websocket", "polling"] as string[],
}

export function getSocket(): Socket {
  if (!socket) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL
    socket = wsUrl ? io(wsUrl, opts) : io(opts)
    socket.on("connect",    () => console.log("[socket] connected"))
    socket.on("disconnect", () => console.log("[socket] disconnected"))
  }
  return socket
}
