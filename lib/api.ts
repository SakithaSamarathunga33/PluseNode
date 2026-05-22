const NODE_API   = process.env.NEXT_PUBLIC_NODE_API   ?? ""
const PYTHON_API = process.env.NEXT_PUBLIC_PYTHON_API ?? ""

export const API_BASE = NODE_API

/** Attaches .status so callers can distinguish 422 from 500 without parsing the message. */
async function throwApiError(res: Response, label: string): Promise<never> {
  let msg = `${res.status} ${label}`
  try {
    const body = await res.json()
    if (body?.error) msg = body.error
    else if (body?.detail) msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)
  } catch { /* keep default msg */ }
  const err = new Error(msg)
  ;(err as ApiError).status = res.status
  throw err
}

export interface ApiError extends Error { status: number }

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<{ data: T; mock: boolean }> {
  const res = await fetch(url, { cache: "no-store", ...init })
  if (!res.ok) await throwApiError(res, url)
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
    if (!res.ok) await throwApiError(res, path)
    return res.json() as Promise<T>
  },

  delete: async <T>(path: string): Promise<T> => {
    const res = await fetch(`${NODE_API}${path}`, { method: "DELETE" })
    if (!res.ok) await throwApiError(res, path)
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
    if (!res.ok) await throwApiError(res, path)
    return res.json() as Promise<T>
  },
}
