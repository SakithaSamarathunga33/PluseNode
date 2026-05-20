# PulseNode

PulseNode is a sleek VPS and container operations console built with Next.js. It gives you a polished control surface for monitoring containers, system stats, processes, Coolify resources, images, networks, databases, scan history, SBOMs, and alerts.

![PulseNode dashboard](public/Screenshot%202026-05-20%20065221.png)

## Highlights

- Container dashboard with status, uptime, ports, CPU, RAM, and quick actions
- Host-level cards for CPU, memory, disk, network, and load average
- Dedicated pages for system stats, processes, Docker images, networks, databases, Coolify, scans, SBOMs, and alerts
- Dark and full-white light themes with persisted theme switching
- Live-ready Node and Python service structure for Docker/system metrics
- Polished PulseNode branding with custom logo and helmet app icon

## Tech Stack

- Next.js 14 and React 18
- TypeScript
- Tailwind CSS
- GSAP and Framer Motion
- Recharts
- Express, Socket.IO, Dockerode
- FastAPI-style Python metrics service

## Getting Started

Install dependencies:

```bash
npm install
```

Run the full development stack:

```bash
npm run dev
```

Or run only the Next.js frontend:

```bash
npm run dev:next
```

Open `http://localhost:3000` in your browser.

## Scripts

```bash
npm run dev          # Next.js + Node API + Python metrics service
npm run dev:next     # Frontend only
npm run dev:node     # Node API only
npm run dev:python   # Python metrics service only
npm run build        # Production build
npm run typecheck    # TypeScript checks
```

## Deploy With Docker

Copy the deployment env template and edit the public URLs for your VPS:

```bash
cp .env.deploy.example .env
nano .env
```

For a plain IP-based deployment, set these values to your server IP:

```bash
NEXT_PUBLIC_ORIGIN=http://YOUR_VPS_IP:3000
NEXT_PUBLIC_NODE_API=http://YOUR_VPS_IP:4001
NEXT_PUBLIC_PYTHON_API=http://YOUR_VPS_IP:8001
NEXT_PUBLIC_WS_URL=ws://YOUR_VPS_IP:4001
```

Start the stack:

```bash
docker compose up -d --build
```

PulseNode will run as three containers:

- `web` on port `3000`
- `node-api` on port `4001`
- `python-api` on port `8001`

The Node API mounts `/var/run/docker.sock` so it can discover Docker containers, images, and networks on the VPS. Keep `NODE_API_AUTH=false` only while running behind a trusted firewall or reverse proxy; turn it on after adding frontend token auth.

## Project Structure

```text
app/          Next.js app routes and global styles
components/   Sidebar, dashboard widgets, UI primitives, motion helpers
lib/          Mock data, API helpers, sockets, and shared types
server/       Node/Express Docker and API services
python/       Python metrics/security/database services
public/       PulseNode logo, app icon, and screenshots
```

## Branding

- `public/logo.png` powers the sidebar logo.
- `public/helmeticon.png` is used as the browser/app icon.
- The current dark theme is the default PulseNode look; light mode uses a clean white operations-console palette.
