const NODE_API   = process.env.NEXT_PUBLIC_NODE_API   || "http://localhost:4001"
const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API || "http://localhost:8001"

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<{ data: T; mock: boolean }> {
  const res = await fetch(url, { cache: "no-store", ...init })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const data = await res.json() as T
  const mock  = res.headers.get("X-Data-Source") === "mock"
  return { data, mock }
}

export const nodeApi = {
  /** GET from Node.js server. On network error, throws so caller can fall back to mock. */
  get: <T>(path: string) => fetchJSON<T>(`${NODE_API}${path}`),

  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${NODE_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`${res.status} ${path}`)
    return res.json() as Promise<T>
  },
}

export const pythonApi = {
  /** GET from Python FastAPI. On network error, throws so caller can fall back to mock. */
  get: <T>(path: string) => fetchJSON<T>(`${PYTHON_API}${path}`),

  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${PYTHON_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`${res.status} ${path}`)
    return res.json() as Promise<T>
  },
}
