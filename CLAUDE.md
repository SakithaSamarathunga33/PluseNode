## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Architecture notes

### Routing / deployment
- External TLS is terminated by a shared **Traefik** instance (project `vps-monitor`, network `vps-monitor_proxy`), not by this project's Caddy. Caddy has no host port bindings and only does internal routing (`/go/*`, `/events`, `/ws`, `/health` → go-api; everything else → web). Bring the stack up with **both** compose files or Traefik can't see it:
  `docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d`
- `NEXT_PUBLIC_GO_API` is baked into the web bundle **at build time** and must be `/go` (Caddy proxies `/go/*` to go-api). If it's empty, client API calls hit Next.js instead of the backend and every page shows zero data. Default lives in `docker-compose.yml`.

### Self-update (Settings page → `backend/internal/api/update.go`)
- `runUpdate()` runs **inside the go-api container** and shells out to `docker compose up -d --build`, which recreates the very container running it. State (`globalUpdate`) is in-memory and is lost on restart, so the frontend cannot rely on polling `/api/system/update/status` for completion.
- Key gotcha: `up -d --build` **builds the new image while the old containers keep serving**, so `/health` answers from old code the whole time. Detecting "update done" by `/health` being reachable reloads the *old* version. Instead, `/health` exposes `startedAt` (process boot time) and the settings page reloads only when that boot id **changes** (proving the container actually restarted). The 180s countdown is cosmetic only.

### Project builds — nixpacks (`backend/internal/builder/`)
- A user repo with **no Dockerfile** builds via **nixpacks**, run **directly inside the go-api container** against the mounted host Docker socket. So `backend/Dockerfile` must install both the `nixpacks` CLI binary **and** `docker-cli-buildx` (nixpacks builds with BuildKit). Gotcha: `ghcr.io/railwayapp/nixpacks` is nixpacks' *runtime base image*, **not** a CLI image — `docker run …nixpacks nixpacks build` fails with exit 127 (`executable not found`).
- Node projects that don't pin a version (`engines.node` / `.nvmrc`) get `NIXPACKS_NODE_VERSION=20` injected (`buildNixpacks`), because nixpacks defaults to Node 18 — too old for Next.js 16+ (`next build` hard-fails on <20.9.0). Projects that pin a version still win.

### Version display (`installedVersion()` / `version()` in `backend/internal/api/server.go`)
- This is the **dev/publish box**: commits are pushed from here and CI auto-tags on the remote, but the box never pulls those tags back, so its local git tags lag and `git describe --tags` reports a **stale** version. `version()` reconciles by resolving the latest GitHub release tag to its commit and checking it's an ancestor of HEAD (`git merge-base --is-ancestor`); an at-or-ahead box reports up-to-date. Falls back to tag-string compare when the commit isn't local (shallow clones).

### Local dev / verify
- After changing Go code or a Dockerfile, rebuild just that service (old containers keep serving until the new image is ready): `docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build go-api` (or `web`). The dev box's workspace is bind-mounted at `/workspace` in go-api.
- Most `/api/*` endpoints are auth-gated (401 without a token), so you can't curl them directly to verify — exercise the underlying logic with `docker exec vps-go-api-1 …` (e.g. the git commands behind `version()`) instead.
- Build logs render in a chrome-only `TerminalWindow` (live stream, no typing animation) in `components/magicui/terminal.tsx` — distinct from the sequencing `Terminal` in the same file.

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
