# Build Cache Clear Button with Magic UI Terminal

**Date:** 2026-05-20  
**Status:** Approved

## Overview

Add a "Clear Build Cache" button to the Disk card in `app/stats/page.tsx`. Clicking it opens a `shadcn` Dialog containing a Magic UI Terminal that streams and animates real-time output from `docker builder prune -f`.

## Components

### 1. Server route — `server/index.js`

New route: `POST /api/docker/build-cache/clear`

- Spawns `docker builder prune -f` via `child_process.spawn`
- Streams stdout/stderr lines as Server-Sent Events (SSE)
- Event format: `data: { type: "line", text: "..." }\n\n`
- On process close: `data: { type: "done", freed: "X.XX GB" }\n\n`
- On error: `data: { type: "error", text: "..." }\n\n`
- Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`

### 2. Terminal component — `components/magicui/terminal.tsx`

Copy the Magic UI Terminal component verbatim from the docs. Exports: `Terminal`, `AnimatedSpan`, `TypingAnimation`.

### 3. Stats page — `app/stats/page.tsx`

**State additions:**
```ts
const [cacheDialogOpen, setCacheDialogOpen] = useState(false)
const [cacheLines, setCacheLines] = useState<string[]>([])
const [cacheState, setCacheState] = useState<"idle" | "running" | "done" | "error">("idle")
const [cacheFreed, setCacheFreed] = useState("")
```

**Button:** Added at the bottom of the Disk card, after the I/O Rate section:
```tsx
<button onClick={handleClearCache}>Clear Build Cache</button>
```

**Dialog:** `shadcn` Dialog opens when `cacheDialogOpen` is true. Contains the Magic UI `Terminal` with `sequence={false}` (lines are pushed dynamically, not pre-known). Each line in `cacheLines` renders as an `AnimatedSpan`. Final line shows `✔ Done — X freed` in green or `✗ Error` in red. A "Close" button appears when `cacheState` is `done` or `error`.

**handleClearCache function:**
1. Set `cacheDialogOpen(true)`, `cacheState("running")`, `cacheLines(["$ docker builder prune -f"])`
2. `fetch("/api/docker/build-cache/clear", { method: "POST" })` — get SSE stream via `response.body`
3. Read with `ReadableStream` reader, parse SSE lines, push to `cacheLines`
4. On `done` event: set `cacheFreed`, `cacheState("done")`
5. On `error` event: set `cacheState("error")`

## State Machine

```
idle → (button click) → running → done
                               → error
```

Dialog is closeable at any state. On close, reset all cache state back to `idle`.

## Files Changed

| File | Change |
|------|--------|
| `server/index.js` | Add SSE route `POST /api/docker/build-cache/clear` |
| `components/magicui/terminal.tsx` | New file — Magic UI Terminal component |
| `app/stats/page.tsx` | Add button, dialog, state, and SSE client logic |

## Non-Goals

- No confirmation dialog before clearing (destructive but recoverable — Docker rebuilds cache on next build)
- No progress percentage (Docker prune doesn't emit one)
- No cancellation mid-stream
