const CHANNEL_NAME = "pulsenode:realtime"
const EVENT_TYPES = [
  "system:metrics",
  "container:stats",
  "deploy:log",
  "alert:new",
  "alert:count",
]

let eventSource = null
let eventUrl = ""
let reconnectTimer = null
let reconnects = 0

const channel = new BroadcastChannel(CHANNEL_NAME)

function broadcast(message) {
  channel.postMessage(message)
}

function closeEventSource() {
  if (!eventSource) return
  eventSource.close()
  eventSource = null
}

function scheduleReconnect() {
  if (reconnectTimer || !eventUrl) return

  const delay = Math.min(30000, 1000 * 2 ** reconnects)
  reconnects += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function connect() {
  if (!eventUrl || eventSource) return

  eventSource = new EventSource(eventUrl)

  eventSource.addEventListener("open", () => {
    reconnects = 0
    broadcast({ type: "realtime:status", data: "connected" })
  })

  eventSource.addEventListener("error", () => {
    broadcast({ type: "realtime:status", data: "disconnected" })
    closeEventSource()
    scheduleReconnect()
  })

  for (const type of EVENT_TYPES) {
    eventSource.addEventListener(type, event => {
      try {
        broadcast({ type, data: JSON.parse(event.data) })
      } catch {
        broadcast({ type, data: event.data })
      }
    })
  }
}

self.onconnect = event => {
  const port = event.ports[0]

  port.addEventListener("message", message => {
    if (message.data?.type !== "connect" || !message.data.url) return

    if (eventUrl !== message.data.url) {
      eventUrl = message.data.url
      closeEventSource()
    }

    connect()
  })

  port.start()
}
