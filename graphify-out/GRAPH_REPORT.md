# Graph Report - .  (2026-05-26)

## Corpus Check
- 129 files · ~178,534 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1118 nodes · 1942 edges · 108 communities (68 shown, 40 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 217 edges (avg confidence: 0.82)
- Token cost: 63,056 input · 16,302 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Go API Handlers|Go API Handlers]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Database Management UI|Database Management UI]]
- [[_COMMUNITY_System Metrics Collection|System Metrics Collection]]
- [[_COMMUNITY_Auth Implementation Plan|Auth Implementation Plan]]
- [[_COMMUNITY_Docker Client Layer|Docker Client Layer]]
- [[_COMMUNITY_Deploy & Update System|Deploy & Update System]]
- [[_COMMUNITY_Build Pipeline|Build Pipeline]]
- [[_COMMUNITY_Database & Persistence|Database & Persistence]]
- [[_COMMUNITY_Docker Images UI|Docker Images UI]]
- [[_COMMUNITY_HTTP & Routing Layer|HTTP & Routing Layer]]
- [[_COMMUNITY_Process Monitoring|Process Monitoring]]
- [[_COMMUNITY_Security Scanning UI|Security Scanning UI]]
- [[_COMMUNITY_Project & Deploy API|Project & Deploy API]]
- [[_COMMUNITY_Path Aliases & Config|Path Aliases & Config]]
- [[_COMMUNITY_App Shell & Layout|App Shell & Layout]]
- [[_COMMUNITY_DB Query Engine|DB Query Engine]]
- [[_COMMUNITY_UI Utility Components|UI Utility Components]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_MagicUI Base Components|MagicUI Base Components]]
- [[_COMMUNITY_Caddy Reverse Proxy|Caddy Reverse Proxy]]
- [[_COMMUNITY_Coolify Integration UI|Coolify Integration UI]]
- [[_COMMUNITY_SBOM History UI|SBOM History UI]]
- [[_COMMUNITY_Network Monitoring UI|Network Monitoring UI]]
- [[_COMMUNITY_MagicUI Animations|MagicUI Animations]]
- [[_COMMUNITY_App Sidebar & Realtime|App Sidebar & Realtime]]
- [[_COMMUNITY_Container Management UI|Container Management UI]]
- [[_COMMUNITY_Mock Data & Types|Mock Data & Types]]
- [[_COMMUNITY_Terminal Animation Component|Terminal Animation Component]]
- [[_COMMUNITY_Alerts UI|Alerts UI]]
- [[_COMMUNITY_Docker Action API|Docker Action API]]
- [[_COMMUNITY_Project Detail Page|Project Detail Page]]
- [[_COMMUNITY_API Config & Health|API Config & Health]]
- [[_COMMUNITY_Container List UI|Container List UI]]
- [[_COMMUNITY_Security SBOM Service|Security SBOM Service]]
- [[_COMMUNITY_Environment & GitHub OAuth|Environment & GitHub OAuth]]
- [[_COMMUNITY_DB Schema Types|DB Schema Types]]
- [[_COMMUNITY_Sidebar State & Mocks|Sidebar State & Mocks]]
- [[_COMMUNITY_Badge & Tabs UI|Badge & Tabs UI]]
- [[_COMMUNITY_MagicUI Border Animations|MagicUI Border Animations]]
- [[_COMMUNITY_Database Handler Utils|Database Handler Utils]]
- [[_COMMUNITY_Stats & Metrics UI|Stats & Metrics UI]]
- [[_COMMUNITY_Socket Realtime Client|Socket Realtime Client]]
- [[_COMMUNITY_UI Screenshot Reference|UI Screenshot Reference]]
- [[_COMMUNITY_Database Metrics API|Database Metrics API]]
- [[_COMMUNITY_Auth Cookie Endpoints|Auth Cookie Endpoints]]
- [[_COMMUNITY_GitHub API Endpoints|GitHub API Endpoints]]
- [[_COMMUNITY_Builder & DB Encryption|Builder & DB Encryption]]
- [[_COMMUNITY_Helmet Logo Branding|Helmet Logo Branding]]
- [[_COMMUNITY_PulseNode Dark Logo|PulseNode Dark Logo]]
- [[_COMMUNITY_Card UI Component|Card UI Component]]
- [[_COMMUNITY_DB Write Operations|DB Write Operations]]
- [[_COMMUNITY_Suspicious Process Detection|Suspicious Process Detection]]
- [[_COMMUNITY_SharedWorker Realtime|SharedWorker Realtime]]
- [[_COMMUNITY_Runtime Stats Page|Runtime Stats Page]]
- [[_COMMUNITY_New Project Page|New Project Page]]
- [[_COMMUNITY_Settings Page|Settings Page]]
- [[_COMMUNITY_API Fetch Utilities|API Fetch Utilities]]
- [[_COMMUNITY_PulseNode Logo Assets|PulseNode Logo Assets]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_App Icon Branding|App Icon Branding]]
- [[_COMMUNITY_Logo Asset Variants|Logo Asset Variants]]
- [[_COMMUNITY_Deploy DB Schema|Deploy DB Schema]]
- [[_COMMUNITY_GitHub Integration Page|GitHub Integration Page]]
- [[_COMMUNITY_Login Page|Login Page]]
- [[_COMMUNITY_Auth & Update Concepts|Auth & Update Concepts]]
- [[_COMMUNITY_Install Script|Install Script]]
- [[_COMMUNITY_PostgreSQL Logo|PostgreSQL Logo]]
- [[_COMMUNITY_Projects List Page|Projects List Page]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_Claude Settings|Claude Settings]]
- [[_COMMUNITY_DB Init & Migration|DB Init & Migration]]
- [[_COMMUNITY_Deploy Script|Deploy Script]]
- [[_COMMUNITY_Firebase Logo|Firebase Logo]]
- [[_COMMUNITY_Next.js Middleware|Next.js Middleware]]
- [[_COMMUNITY_BlurFade Animation|BlurFade Animation]]
- [[_COMMUNITY_AWS Logo|AWS Logo]]
- [[_COMMUNITY_Azure Logo|Azure Logo]]
- [[_COMMUNITY_MongoDB Logo|MongoDB Logo]]
- [[_COMMUNITY_MySQL Logo|MySQL Logo]]
- [[_COMMUNITY_Oracle Logo|Oracle Logo]]
- [[_COMMUNITY_Redis Logo|Redis Logo]]
- [[_COMMUNITY_Supabase Logo|Supabase Logo]]
- [[_COMMUNITY_Topbar Component|Topbar Component]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next Config|Next Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_TS Path Aliases|TS Path Aliases]]
- [[_COMMUNITY_Alert Rule DB|Alert Rule DB]]
- [[_COMMUNITY_Alert Event DB|Alert Event DB]]
- [[_COMMUNITY_Notification Channel DB|Notification Channel DB]]
- [[_COMMUNITY_API Server Config|API Server Config]]
- [[_COMMUNITY_Docker Containers API|Docker Containers API]]
- [[_COMMUNITY_Docker Action API|Docker Action API]]
- [[_COMMUNITY_Docker Exec API|Docker Exec API]]
- [[_COMMUNITY_List Projects Handler|List Projects Handler]]
- [[_COMMUNITY_Create Project Handler|Create Project Handler]]
- [[_COMMUNITY_Create Alert Handler|Create Alert Handler]]
- [[_COMMUNITY_sqlc Code Generation|sqlc Code Generation]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 97 edges
2. `writeJSON()` - 79 edges
3. `writeError()` - 48 edges
4. `DB` - 40 edges
5. `Client` - 25 edges
6. `nodeApi` - 24 edges
7. `getenv()` - 17 edges
8. `compilerOptions` - 15 edges
9. `runUpdate()` - 13 edges
10. `Run()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `TooltipProvider()` --uses--> `cn()`  [INFERRED]
  components/ui/tooltip.tsx → lib/utils.ts
- `@/* Path Alias` --conceptually_related_to--> `cn()`  [INFERRED]
  tsconfig.json → lib/utils.ts
- `BlurFade()` --calls--> `cn()`  [EXTRACTED]
  components/magicui/blur-fade.tsx → lib/utils.ts
- `AlertDialogOverlay()` --calls--> `cn()`  [EXTRACTED]
  components/ui/alert-dialog.tsx → lib/utils.ts
- `AlertDialogMedia()` --calls--> `cn()`  [EXTRACTED]
  components/ui/alert-dialog.tsx → lib/utils.ts

## Hyperedges (group relationships)
- **MagicUI components sharing PulseNode CSS variable palette** — magicui_borderbeam_borderbeam, magicui_meteors_meteors, magicui_sparklestext_sparklestext, vps_tailwindconfig_pulsenode_palette, concept_pn_css_variables [EXTRACTED 1.00]
- **MagicUI components all using cn() utility** — magicui_borderbeam_borderbeam, magicui_blurfade_blurfade, magicui_meteors_meteors, magicui_numberticker_numberticker, magicui_sparklestext_sparklestext, magicui_terminal_terminal, magicui_terminal_animatedspan, magicui_terminal_typinganimation, lib_utils_cn [EXTRACTED 1.00]
- **Terminal sequenced animation system (Terminal + AnimatedSpan + TypingAnimation + Contexts)** — magicui_terminal_terminal, magicui_terminal_animatedspan, magicui_terminal_typinganimation, magicui_terminal_sequencecontext, magicui_terminal_itemindexcontext, magicui_terminal_useinview [EXTRACTED 1.00]
- **Tailwind custom animations consumed by MagicUI components** — vps_tailwindconfig_animation_border_beam, vps_tailwindconfig_animation_sparkle, vps_tailwindconfig_animation_meteor, magicui_borderbeam_borderbeam, magicui_sparklestext_sparklestext, magicui_meteors_meteors [EXTRACTED 1.00]

## Communities (108 total, 40 thin omitted)

### Community 0 - "Go API Handlers"
Cohesion: 0.05
Nodes (32): api.Server.listAuditLog handler, api.Server.authLogin handler, api.Server.authSetup handler, api.Server.authStatus handler, api.Server.provisionDatabase handler, api.Server.runProvision async func, hijackedConn, api.Server.metricsLive handler (+24 more)

### Community 1 - "Frontend Dependencies"
Cohesion: 0.05
Nodes (43): dependencies, @base-ui/react, class-variance-authority, clsx, developer-icons, gsap, @gsap/react, lucide-react (+35 more)

### Community 2 - "Database Management UI"
Cohesion: 0.07
Nodes (31): ConnectionStringPanel, DatabaseRow, DatabasesPage, DbDetails (schema/table browser), DbExpand (tabbed db panel), ConnectDatabaseModal(), Phase, CreateDatabaseModal() (+23 more)

### Community 3 - "System Metrics Collection"
Cohesion: 0.10
Nodes (34): Stat, Collector, cpuModel(), diffPercent(), diskUsage(), distro(), firstLine(), hostNetDev() (+26 more)

### Community 4 - "Auth Implementation Plan"
Cohesion: 0.06
Nodes (41): Login System Implementation Plan, Task 1: Add bcrypt dependency (golang.org/x/crypto), Task 2: Add users table + DB helpers, Task 3: Add MakeJWT + ValidateToken to auth package, Task 4: Create auth_handler.go, Task 5: Add requireAuth middleware + wire server.go routes, Task 6: Create login page (app/login/page.tsx), Task 7: Create Next.js middleware.ts (+33 more)

### Community 5 - "Docker Client Layer"
Cohesion: 0.10
Nodes (14): Client, cleanDockerStream(), dbMeta(), formatPorts(), imageVersion(), New(), shortID(), Container (+6 more)

### Community 6 - "Deploy & Update System"
Cohesion: 0.08
Nodes (27): coolifyProxy(), NewServer(), envVarVal(), loadDotEnv(), resolveCompose(), runUpdate(), streamCmd(), streamCmdEnv() (+19 more)

### Community 7 - "Build Pipeline"
Cohesion: 0.11
Nodes (20): api.Server.githubCallback handler, builder.buildCompose func, builder.buildDockerfile func, builder.buildNixpacks func, CommitInfo(), min(), Run(), builder.runContainer func (+12 more)

### Community 9 - "Docker Images UI"
Cohesion: 0.12
Nodes (19): ResultTable(), DeveloperIcon, IMAGE_ICON_MAP, IMAGES, DbQueryResult, DbSchemaResult, AlertDialog(), AlertDialogAction() (+11 more)

### Community 10 - "HTTP & Routing Layer"
Cohesion: 0.13
Nodes (5): writeJSON(), Server, Server, Server, Server

### Community 11 - "Process Monitoring"
Cohesion: 0.10
Nodes (16): Suspicious Process Detection Engine, FILL_COLORS, ProgressBar(), ProgressBarProps, pythonApi, ActionMenuProps, detectSuspicious(), DialogState (+8 more)

### Community 12 - "Security Scanning UI"
Cohesion: 0.11
Nodes (15): VulnBar(), Vulns, SCANS, Scan, MOCK_CVES, TREND_BARS, X_LABELS, Sheet() (+7 more)

### Community 13 - "Project & Deploy API"
Cohesion: 0.17
Nodes (4): writeError(), Server, Server, NewID()

### Community 14 - "Path Aliases & Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 15 - "App Shell & Layout"
Cohesion: 0.12
Nodes (15): geistMono, geistSans, metadata, RootLayout(), Home(), PAGE_TITLES, SEARCH_ITEMS, SearchItem (+7 more)

### Community 16 - "DB Query Engine"
Cohesion: 0.18
Nodes (9): engineFromImage(), firstEnv(), isDestructiveQuery(), parseCSVResult(), parseTSVResult(), dbQueryResult, dbSchemaResult, dbTableInfo (+1 more)

### Community 17 - "UI Utility Components"
Cohesion: 0.21
Nodes (16): cn(), Progress(), ProgressIndicator(), ProgressLabel(), ProgressTrack(), ProgressValue(), ScrollArea(), ScrollBar() (+8 more)

### Community 18 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 19 - "MagicUI Base Components"
Cohesion: 0.16
Nodes (11): @base-ui/react, MeteorsProps, Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), Input(), Separator() (+3 more)

### Community 20 - "Caddy Reverse Proxy"
Cohesion: 0.18
Nodes (5): Client, Handler, Match, Route, Upstream

### Community 21 - "Coolify Integration UI"
Cohesion: 0.14
Nodes (9): ENGINE_TONE, CONTAINERS, COOLIFY_DEPLOYMENTS, COOLIFY_PROJECTS, DATABASES, PROCESSES, AlertRule, CoolifyDeployment (+1 more)

### Community 22 - "SBOM History UI"
Cohesion: 0.15
Nodes (10): requestAnimationFrame, StatCardProps, TONE_COLORS, SBOMS, SBOM, NumberTicker(), NumberTickerProps, ECOSYSTEM_COLORS (+2 more)

### Community 23 - "Network Monitoring UI"
Cohesion: 0.13
Nodes (7): PillProps, TONE_STYLES, Series, UPlotChart(), UPlotChartProps, NETWORKS, COOLIFY_CONTAINERS

### Community 24 - "MagicUI Animations"
Cohesion: 0.17
Nodes (16): MagicUI Component Library, PulseNode CSS Variables (globals.css), BlurFade Component, BorderBeam Component, Meteors(), NumberTicker Component, NumberTicker RAF Easing Animation, generateSparkle Helper Function (+8 more)

### Community 25 - "App Sidebar & Realtime"
Cohesion: 0.30
Nodes (15): AppSidebar, Socket.IO Realtime Events, ContainersPage(), LogsPanel(), RemoveDialog(), TerminalPanel(), Pill(), StatCard() (+7 more)

### Community 26 - "Container Management UI"
Cohesion: 0.21
Nodes (15): ContainersPage, LogsPanel (container logs drawer), RemoveDialog (confirm container remove), TerminalPanel (container exec), ImagesPage, NetworksPage, TopologySVG (network diagram), WebSocket live metrics subscription pattern (+7 more)

### Community 27 - "Mock Data & Types"
Cohesion: 0.23
Nodes (13): MOCK COOLIFY_PROJECTS data, MOCK DATABASES data, Container, CoolifyApp, CoolifyDatabase, CoolifyMeta, CoolifyProject, CoolifyService (+5 more)

### Community 28 - "Terminal Animation Component"
Cohesion: 0.29
Nodes (13): AnimatedSpan(), AnimatedSpanProps, ItemIndexContext, MotionElementType, SequenceContext, SequenceContextValue, Terminal(), TerminalProps (+5 more)

### Community 29 - "Alerts UI"
Cohesion: 0.15
Nodes (9): CHANNEL_CARDS, MOCK_NEW_ALERT, SevIcon(), Tab, TABS, ToggleSwitch(), ALERT_RULES, MOCK ALERTS data (+1 more)

### Community 31 - "Project Detail Page"
Cohesion: 0.20
Nodes (8): Deployment, LogLine, Project, STATUS_COLOR, getSocket(), Handler, REALTIME_EVENTS, realtimeUrl()

### Community 32 - "API Config & Health"
Cohesion: 0.20
Nodes (7): Config, emptyList(), firstNonEmpty(), notImplemented(), signalHandler(), Server, Signal()

### Community 33 - "Container List UI"
Cohesion: 0.18
Nodes (4): ContainerHistory, DeveloperIcon, IMAGE_ICONS, TermLine

### Community 34 - "Security SBOM Service"
Cohesion: 0.31
Nodes (4): mockSBOMs(), mockScans(), New(), Service

### Community 35 - "Environment & GitHub OAuth"
Cohesion: 0.24
Nodes (3): decodeJSON(), upsertEnvLocal(), Server

### Community 36 - "DB Schema Types"
Cohesion: 0.20
Nodes (9): AlertEvent, AlertRule, ConnectedDatabase, Deployment, GitHubAccount, ManagedDatabase, NotificationChannel, Project (+1 more)

### Community 37 - "Sidebar State & Mocks"
Cohesion: 0.20
Nodes (9): ALERTS, HOST, BadgeCounts, BASE_NAV_SECTIONS, COOLIFY_ITEM, DEPLOY_SECTION, NavBadge, NavItem (+1 more)

### Community 38 - "Badge & Tabs UI"
Cohesion: 0.29
Nodes (8): class-variance-authority, Badge(), badgeVariants, Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 39 - "MagicUI Border Animations"
Cohesion: 0.31
Nodes (8): CSS Animation, BorderBeam(), BorderBeamProps, generateSparkle(), randomBetween(), Sparkle, SparklesText(), SparklesTextProps

### Community 40 - "Database Handler Utils"
Cohesion: 0.22
Nodes (5): buildConnString(), freePort(), randHex(), engineMeta, Server

### Community 41 - "Stats & Metrics UI"
Cohesion: 0.22
Nodes (5): API_BASE, SPARKS, HostInfo, PyMetrics, TIME_OPTIONS

### Community 43 - "UI Screenshot Reference"
Cohesion: 0.28
Nodes (9): Caddy Web Server Container, Container Statistics Panel, Docker Containers Dashboard - Portainer UI, CPU Usage Metric - 23%, Network I/O Metric - 284KB/s / 88KB/s, Portainer Container Management Tool, production-01 Docker Environment, Running Containers List (+1 more)

### Community 44 - "Database Metrics API"
Cohesion: 0.32
Nodes (6): formatSeconds(), parseInt64(), parseRedisInfo(), metricItem, metricsResponse, Server

### Community 47 - "Builder & DB Encryption"
Cohesion: 0.25
Nodes (4): builder.Config struct, aesKey(), Decrypt(), db.Project struct

### Community 48 - "Helmet Logo Branding"
Cohesion: 0.43
Nodes (7): Dark Navy and Cyan/Blue Neon Color Scheme, Hexagonal Border Frame, Server Monitoring Logo / App Icon, Corner Node Circles on Hexagon, Neon Pulse / Heartbeat Waveform, Server / Database Stack Icon, VPS / Server Management App Branding

### Community 49 - "PulseNode Dark Logo"
Cohesion: 0.36
Nodes (8): PulseNode Brand, Hexagon Server Icon, Pulse/Heartbeat Wave Icon Element, Server Rack Icon Element, PulseNode Dark Logo, Blue and Cyan Color Scheme, Dark Navy Background, PulseNode Wordmark Typography

### Community 50 - "Card UI Component"
Cohesion: 0.46
Nodes (7): Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader(), CardTitle()

### Community 52 - "Suspicious Process Detection"
Cohesion: 0.33
Nodes (7): detectSuspicious (security engine), ProcessesPage, Mock data fallback pattern (initial state), Suspicious process detection engine, MOCK CONTAINERS data, MOCK PROCESSES data, Process

### Community 54 - "Runtime Stats Page"
Cohesion: 0.33
Nodes (4): ContainerStat, fmtMb(), RuntimePage(), SortKey

### Community 55 - "New Project Page"
Cohesion: 0.33
Nodes (3): ADJECTIVES, NOUNS, Repo

### Community 56 - "Settings Page"
Cohesion: 0.33
Nodes (3): AuthStatus, UpdateStatus, VersionInfo

### Community 57 - "API Fetch Utilities"
Cohesion: 0.47
Nodes (5): X-Data-Source: mock header pattern, ApiError, fetchJSON(), mutateJSON(), throwApiError()

### Community 58 - "PulseNode Logo Assets"
Cohesion: 0.47
Nodes (6): PulseNode Brand, Blue Gradient Color Scheme, Server Monitoring / VPS Management Concept, Hexagon Icon with Server and Pulse Wave, PulseNode Logo (Dark Theme), PulseNode Wordmark

### Community 59 - "Next.js Config"
Cohesion: 0.33
Nodes (6): Next.js Config (standalone output), GSAP Animation Library, Next.js 14 Framework Dependency, Radix UI Component Dependencies, uPlot Charting Library, pulsenode Next.js Project

### Community 60 - "App Icon Branding"
Cohesion: 0.70
Nodes (5): App Branding / Icon - Health or Fitness Application, Heartbeat / ECG Line - Health Monitoring Symbol, helmet.png - App Icon / Logo, Letter P - Primary Symbol, Neon Glow Visual Style - Blue Gradient on Dark Background

### Community 61 - "Logo Asset Variants"
Cohesion: 0.70
Nodes (5): Hexagon Icon Element, PulseNode Logo (PNG, transparent background), Pulse/Heartbeat Waveform Visual Element, PulseNode Brand, Server Stack Visual Element

### Community 62 - "Deploy DB Schema"
Cohesion: 0.40
Nodes (5): AES-GCM Encryption for Tokens and Env Vars, deployment_logs SQLite table, deployments SQLite table, github_accounts SQLite table, projects SQLite table

### Community 65 - "Auth & Update Concepts"
Cohesion: 0.50
Nodes (4): LogLine (update log renderer), SettingsPage, Optional login protection (auth enable/disable), Self-update system (git pull + docker compose)

### Community 66 - "Install Script"
Cohesion: 0.83
Nodes (3): install.sh script, check_cmd(), port_in_use()

### Community 67 - "PostgreSQL Logo"
Cohesion: 0.67
Nodes (3): Relational Database, PostgreSQL Official Logo, PostgreSQL

### Community 73 - "Firebase Logo"
Cohesion: 0.67
Nodes (3): Google Firebase, Firebase Logo, Firebase

## Knowledge Gaps
- **298 isolated node(s):** `config`, `name`, `version`, `private`, `dev` (+293 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `writeJSON()` connect `HTTP & Routing Layer` to `API Config & Health`, `Environment & GitHub OAuth`, `Auth Middleware`, `Deploy & Update System`, `Database Handler Utils`, `Database Metrics API`, `Project & Deploy API`, `Auth Cookie Endpoints`, `GitHub API Endpoints`, `DB Query Engine`, `Docker Action API`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `cn()` connect `UI Utility Components` to `Sidebar State & Mocks`, `Badge & Tabs UI`, `MagicUI Border Animations`, `Docker Images UI`, `Stats & Metrics UI`, `BlurFade Animation`, `Security Scanning UI`, `Process Monitoring`, `App Shell & Layout`, `Card UI Component`, `MagicUI Base Components`, `Suspicious Process Detection`, `Coolify Integration UI`, `SBOM History UI`, `MagicUI Animations`, `TS Path Aliases`, `Terminal Animation Component`, `Alerts UI`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `getenv()` connect `Deploy & Update System` to `API Config & Health`, `Security SBOM Service`, `System Metrics Collection`, `Build Pipeline`, `GitHub API Endpoints`, `Builder & DB Encryption`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `cn()` (e.g. with `@/* Path Alias` and `TooltipProvider()`) actually correct?**
  _`cn()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 77 inferred relationships involving `writeJSON()` (e.g. with `.metricsLive()` and `.metricsHistory()`) actually correct?**
  _`writeJSON()` has 77 INFERRED edges - model-reasoned connections that need verification._
- **Are the 46 inferred relationships involving `writeError()` (e.g. with `.processes()` and `.freePort()`) actually correct?**
  _`writeError()` has 46 INFERRED edges - model-reasoned connections that need verification._
- **What connects `config`, `name`, `version` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._