const API = process.env.NEXT_PUBLIC_API ?? ""

export const API_BASE = API

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
  get: <T>(path: string) => fetchJSON<T>(`${API}${path}`),

  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) await throwApiError(res, path)
    return res.json() as Promise<T>
  },

  delete: async <T>(path: string): Promise<T> => {
    const res = await fetch(`${API}${path}`, { method: "DELETE" })
    if (!res.ok) await throwApiError(res, path)
    return res.json() as Promise<T>
  },
}

/** pythonApi now routes to the same Go backend — kept for compatibility. */
export const pythonApi = {
  get: <T>(path: string) => fetchJSON<T>(`${API}/api${path}`),

  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${API}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) await throwApiError(res, path)
    return res.json() as Promise<T>
  },
}
