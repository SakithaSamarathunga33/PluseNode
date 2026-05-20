# Build Cache Clear Button with Magic UI Terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Clear Build Cache" button to the Disk card that opens a terminal-styled dialog streaming real-time output from `docker builder prune -f`.

**Architecture:** A new SSE route on the Node.js server spawns `docker builder prune -f` and streams lines to the client. The stats page opens an AlertDialog containing the Magic UI Terminal component, which animates each streamed line. State flows `idle → running → done | error`.

**Tech Stack:** Node.js `child_process.spawn`, SSE (`text/event-stream`), React `useState`/`useRef`, Magic UI Terminal (`motion/react`), base-ui AlertDialog.

---

### Task 1: Create Magic UI Terminal component

**Files:**
- Create: `components/magicui/terminal.tsx`

- [ ] **Step 1: Create the terminal component file**

```tsx
"use client"

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefAttributes,
} from "react"
import {
  motion,
  useInView,
  type DOMMotionComponents,
  type HTMLMotionProps,
  type MotionProps,
} from "motion/react"

import { cn } from "@/lib/utils"

interface SequenceContextValue {
  completeItem: (index: number) => void
  activeIndex: number
  sequenceStarted: boolean
}

const SequenceContext = createContext<SequenceContextValue | null>(null)

const useSequence = () => useContext(SequenceContext)

const ItemIndexContext = createContext<number | null>(null)
const useItemIndex = () => useContext(ItemIndexContext)

const motionElements = {
  article: motion.article,
  div: motion.div,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  h5: motion.h5,
  h6: motion.h6,
  li: motion.li,
  p: motion.p,
  section: motion.section,
  span: motion.span,
} as const

type MotionElementType = Extract<
  keyof DOMMotionComponents,
  keyof typeof motionElements
>
type TerminalTypingMotionComponent = ComponentType<
  Omit<HTMLMotionProps<"span">, "ref"> & RefAttributes<HTMLElement>
>

interface AnimatedSpanProps extends MotionProps {
  children: React.ReactNode
  delay?: number
  className?: string
  startOnView?: boolean
}

export const AnimatedSpan = ({
  children,
  delay = 0,
  className,
  startOnView = false,
  ...props
}: AnimatedSpanProps) => {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  })

  const sequence = useSequence()
  const itemIndex = useItemIndex()
  const [hasStarted, setHasStarted] = useState(false)
  useEffect(() => {
    if (!sequence || itemIndex === null) return
    if (!sequence.sequenceStarted) return
    if (hasStarted) return
    if (sequence.activeIndex === itemIndex) {
      setHasStarted(true)
    }
  }, [sequence, hasStarted, itemIndex])

  const shouldAnimate = sequence ? hasStarted : startOnView ? isInView : true

  return (
    <motion.div
      ref={elementRef}
      initial={{ opacity: 0, y: -5 }}
      animate={shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
      transition={{ duration: 0.3, delay: sequence ? 0 : delay / 1000 }}
      className={cn("grid text-sm font-normal tracking-tight", className)}
      onAnimationComplete={() => {
        if (!sequence) return
        if (itemIndex === null) return
        sequence.completeItem(itemIndex)
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

interface TypingAnimationProps extends Omit<MotionProps, "children"> {
  children: string
  className?: string
  duration?: number
  delay?: number
  as?: MotionElementType
  startOnView?: boolean
}

export const TypingAnimation = ({
  children,
  className,
  duration = 60,
  delay = 0,
  as: Component = "span",
  startOnView = true,
  ...props
}: TypingAnimationProps) => {
  if (typeof children !== "string") {
    throw new Error("TypingAnimation: children must be a string. Received:")
  }

  const MotionComponent = motionElements[
    Component
  ] as TerminalTypingMotionComponent

  const [displayedText, setDisplayedText] = useState<string>("")
  const [started, setStarted] = useState(false)
  const elementRef = useRef<HTMLElement | null>(null)
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  })

  const sequence = useSequence()
  const itemIndex = useItemIndex()
  const hasSequence = sequence !== null
  const sequenceStarted = sequence?.sequenceStarted ?? false
  const sequenceActiveIndex = sequence?.activeIndex ?? null
  const sequenceCompleteItemRef = useRef<
    SequenceContextValue["completeItem"] | null
  >(null)
  const sequenceItemIndexRef = useRef<number | null>(null)

  useEffect(() => {
    sequenceCompleteItemRef.current = sequence?.completeItem ?? null
    sequenceItemIndexRef.current = itemIndex
  }, [sequence?.completeItem, itemIndex])

  useEffect(() => {
    let startTimeout: ReturnType<typeof setTimeout> | null = null

    if (hasSequence && itemIndex !== null) {
      if (sequenceStarted && !started && sequenceActiveIndex === itemIndex) {
        setStarted(true)
      }
    } else if (!startOnView || isInView) {
      startTimeout = setTimeout(() => setStarted(true), delay)
    }

    return () => {
      if (startTimeout !== null) {
        clearTimeout(startTimeout)
      }
    }
  }, [
    delay,
    startOnView,
    isInView,
    started,
    hasSequence,
    sequenceActiveIndex,
    sequenceStarted,
    itemIndex,
  ])

  useEffect(() => {
    let typingEffect: ReturnType<typeof setInterval> | null = null

    if (started) {
      let i = 0
      typingEffect = setInterval(() => {
        if (i < children.length) {
          setDisplayedText(children.substring(0, i + 1))
          i++
        } else {
          if (typingEffect !== null) {
            clearInterval(typingEffect)
          }
          const completeItem = sequenceCompleteItemRef.current
          const currentItemIndex = sequenceItemIndexRef.current
          if (completeItem && currentItemIndex !== null) {
            completeItem(currentItemIndex)
          }
        }
      }, duration)
    }

    return () => {
      if (typingEffect !== null) {
        clearInterval(typingEffect)
      }
    }
  }, [children, duration, started])

  return (
    <MotionComponent
      ref={elementRef}
      className={cn("text-sm font-normal tracking-tight", className)}
      {...props}
    >
      {displayedText}
    </MotionComponent>
  )
}

interface TerminalProps {
  children: React.ReactNode
  className?: string
  sequence?: boolean
  startOnView?: boolean
}

export const Terminal = ({
  children,
  className,
  sequence = true,
  startOnView = true,
}: TerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isInView = useInView(containerRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  })

  const [activeIndex, setActiveIndex] = useState(0)
  const sequenceHasStarted = sequence ? !startOnView || isInView : false

  const contextValue = useMemo<SequenceContextValue | null>(() => {
    if (!sequence) return null
    return {
      completeItem: (index: number) => {
        setActiveIndex((current) => (index === current ? current + 1 : current))
      },
      activeIndex,
      sequenceStarted: sequenceHasStarted,
    }
  }, [sequence, activeIndex, sequenceHasStarted])

  const wrappedChildren = useMemo(() => {
    if (!sequence) return children
    const array = Children.toArray(children)
    return array.map((child, index) => (
      <ItemIndexContext.Provider key={index} value={index}>
        {child as React.ReactNode}
      </ItemIndexContext.Provider>
    ))
  }, [children, sequence])

  const content = (
    <div
      ref={containerRef}
      className={cn(
        "border-border bg-background z-0 h-full max-h-100 w-full max-w-lg rounded-xl border",
        className
      )}
    >
      <div className="border-border flex flex-col gap-y-2 border-b p-4">
        <div className="flex flex-row gap-x-2">
          <div className="h-2 w-2 rounded-full bg-red-500"></div>
          <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
        </div>
      </div>
      <pre className="p-4">
        <code className="grid gap-y-1 overflow-auto">{wrappedChildren}</code>
      </pre>
    </div>
  )

  if (!sequence) return content

  return (
    <SequenceContext.Provider value={contextValue}>
      {content}
    </SequenceContext.Provider>
  )
}
```

- [ ] **Step 2: Verify the file was created**

```bash
ls components/magicui/terminal.tsx
```
Expected: file listed.

- [ ] **Step 3: Check motion/react is available**

```bash
grep "motion" package.json
```
Expected: a line containing `"motion"` or `"framer-motion"`. If absent, run `npm install motion` before continuing.

- [ ] **Step 4: Commit**

```bash
git add components/magicui/terminal.tsx
git commit -m "feat: add Magic UI Terminal component"
```

---

### Task 2: Add SSE route for Docker build cache clear

**Files:**
- Modify: `server/index.js:204` (after the Coolify routes, before the Socket.io section)

- [ ] **Step 1: Add the SSE route**

Open `server/index.js`. After line 204 (after the `app.get("/api/coolify/deployments"...)` block and before `/* ── Socket.io ─────`), insert:

```js
/** Clear Docker build cache — streams output via SSE */
app.post("/api/docker/build-cache/clear", (req, res) => {
  const { spawn } = require("child_process")

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const proc = spawn("docker", ["builder", "prune", "-f"])

  proc.stdout.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach(line => send({ type: "line", text: line }))
  })

  proc.stderr.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach(line => send({ type: "line", text: line }))
  })

  proc.on("close", (code) => {
    if (code === 0) {
      send({ type: "done" })
    } else {
      send({ type: "error", text: `Process exited with code ${code}` })
    }
    res.end()
  })

  proc.on("error", (err) => {
    send({ type: "error", text: err.message })
    res.end()
  })

  req.on("close", () => proc.kill())
})
```

- [ ] **Step 2: Verify server starts without error**

```bash
node server/index.js &
sleep 2
curl -s http://localhost:4001/health
kill %1
```
Expected: `{"ok":true,"ts":...}`

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add SSE route for Docker build cache clear"
```

---

### Task 3: Add button, dialog, and terminal to stats page

**Files:**
- Modify: `app/stats/page.tsx`

- [ ] **Step 1: Add imports at the top of the file**

In `app/stats/page.tsx`, add to the existing imports block (around line 3–14):

```tsx
import { Trash2 } from "lucide-react"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Terminal, AnimatedSpan } from "@/components/magicui/terminal"
```

Note: `Trash2` is already in lucide-react. Merge with the existing `lucide-react` import line — change:
```tsx
import { Download, MoreHorizontal, Zap } from "lucide-react"
```
to:
```tsx
import { Download, MoreHorizontal, Zap, Trash2 } from "lucide-react"
```

- [ ] **Step 2: Add cache state variables**

Inside the component body, after the existing `useState` declarations (around line 100–103), add:

```tsx
const [cacheOpen,  setCacheOpen]  = useState(false)
const [cacheLines, setCacheLines] = useState<string[]>([])
const [cacheState, setCacheState] = useState<"idle" | "running" | "done" | "error">("idle")
const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
```

- [ ] **Step 3: Add handleClearCache function**

After the state declarations and before the `useEffect` hooks, add:

```tsx
const handleClearCache = async () => {
  setCacheLines(["$ docker builder prune -f"])
  setCacheState("running")
  setCacheOpen(true)

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_NODE_API ?? ""}/api/docker/build-cache/clear`,
      { method: "POST" }
    )
    if (!res.body) throw new Error("No response body")

    const reader = res.body.getReader()
    readerRef.current = reader
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split("\n")

      for (const raw of lines) {
        const trimmed = raw.trim()
        if (!trimmed.startsWith("data:")) continue
        try {
          const payload = JSON.parse(trimmed.slice(5).trim())
          if (payload.type === "line") {
            setCacheLines(prev => [...prev, payload.text])
          } else if (payload.type === "done") {
            setCacheLines(prev => [...prev, "✔ Build cache cleared."])
            setCacheState("done")
          } else if (payload.type === "error") {
            setCacheLines(prev => [...prev, `✗ ${payload.text}`])
            setCacheState("error")
          }
        } catch {
          // malformed SSE line — skip
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setCacheLines(prev => [...prev, `✗ ${msg}`])
    setCacheState("error")
  }
}

const handleCacheDialogClose = () => {
  readerRef.current?.cancel()
  readerRef.current = null
  setCacheOpen(false)
  setCacheState("idle")
  setCacheLines([])
}
```

- [ ] **Step 4: Add the "Clear Build Cache" button to the Disk card**

In `app/stats/page.tsx`, find the closing of the I/O Rate section inside the Disk card (around line 425):

```tsx
            </div>
          </div>
        </div>
```

Just before the final `</div>` that closes the Disk card (at the line containing `</div>` after the I/O Rate `div`), add a button section. The I/O Rate section ends around line 424–425. Add after the closing `</div>` of the I/O Rate section but before the Disk card's closing `</div>`:

```tsx
          <div className="mt-4 pt-4 border-t border-pulseNode-border/10">
            <Button
              variant="destructive"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={handleClearCache}
              disabled={cacheState === "running"}
            >
              <Trash2 size={12} />
              Clear Build Cache
            </Button>
          </div>
```

- [ ] **Step 5: Add the AlertDialog with Terminal**

Before the closing `</div>` of the entire return statement (at the very bottom of the JSX, just before `</div>\n  )\n}`), add:

```tsx
      <AlertDialog open={cacheOpen} onOpenChange={open => { if (!open) handleCacheDialogClose() }}>
        <AlertDialogContent className="max-w-2xl p-0 overflow-hidden gap-0 bg-pulseNode-navyLight border-pulseNode-border/20">
          <AlertDialogHeader className="px-5 pt-5 pb-0">
            <AlertDialogTitle className="text-sm font-semibold text-helm-fg flex items-center gap-2">
              <Trash2 size={14} className="text-red-400" />
              Clear Docker Build Cache
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="p-5">
            <Terminal
              sequence={false}
              startOnView={false}
              className="max-w-full border-pulseNode-border/20 bg-pulseNode-navy"
            >
              {cacheLines.map((line, i) => (
                <AnimatedSpan
                  key={i}
                  className={
                    line.startsWith("✔")
                      ? "text-green-400"
                      : line.startsWith("✗")
                      ? "text-red-400"
                      : line.startsWith("$")
                      ? "text-pulseNode-blue font-mono"
                      : "text-helm-fg3 font-mono text-xs"
                  }
                >
                  {line}
                </AnimatedSpan>
              ))}
              {cacheState === "running" && (
                <AnimatedSpan className="text-helm-fg3 font-mono text-xs">
                  <span className="animate-pulse">▋</span>
                </AnimatedSpan>
              )}
            </Terminal>
          </div>

          <AlertDialogFooter className="px-5 py-4 border-t border-pulseNode-border/10 bg-transparent rounded-none">
            <AlertDialogCancel
              onClick={handleCacheDialogClose}
              variant="outline"
              className="text-xs"
            >
              {cacheState === "running" ? "Cancel" : "Close"}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/stats/page.tsx
git commit -m "feat: add build cache clear button with terminal dialog to Disk card"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the Stats page in a browser**

Navigate to `http://localhost:3000/stats` (or the configured port).

- [ ] **Step 3: Verify the button appears**

The Disk card should show a red "Clear Build Cache" button at the bottom.

- [ ] **Step 4: Click the button and verify the terminal opens**

The dialog should open immediately with `$ docker builder prune -f` as the first line. Output lines should animate in. When complete, a green `✔ Build cache cleared.` line should appear and the button label should change to "Close".

- [ ] **Step 5: Verify the Close/Cancel button works**

Click "Close". The dialog should close and all state should reset (opening it again starts fresh).
