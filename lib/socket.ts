"use client"
import { io, type Socket } from "socket.io-client"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4001", {
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      transports: ["websocket", "polling"],
    })
    socket.on("connect", () => console.log("[socket] connected"))
    socket.on("disconnect", () => console.log("[socket] disconnected"))
  }
  return socket
}
