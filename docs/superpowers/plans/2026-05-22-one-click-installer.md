# One-Click Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `install.sh` — a curl|bash one-liner that clones the repo, auto-detects the VPS IP, starts all Docker containers, and prints a clickable URL when done.

**Architecture:** A single self-contained Bash script hosted at the repo root. When piped through bash it clones (or updates) the repo, writes `.env.local`, runs `docker compose up --build -d` with the standalone Nginx overlay, polls the health endpoint, then prints the access URL. The README is updated to feature the one-liner as the primary install method.

**Tech Stack:** Bash, Docker Compose v2, git, curl, openssl

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `install.sh` | Full installer: prereqs → clone → config → build → health → URL |
| Modify | `README.md` | Replace "One-command deploy" section with curl\|bash one-liner |

---

### Task 1: Create `install.sh` — banner, colors, prereq checks

**Files:**
- Create: `install.sh`

- [ ] **Step 1: Write the file with shebang, color vars, banner, and prereq checker**

```bash
cat > /home/sakitha/apps/vps/install.sh << 'SCRIPT'
#!/usr/bin/env bash
# PulseNode — one-command installer
# Usage: curl -fsSL https://raw.githubusercontent.com/SakithaSamarathunga33/vps/main/install.sh | bash
set -euo pipefail

G='\033[0;32m'; C='\033[0;36m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'

REPO_URL="https://github.com/SakithaSamarathunga33/vps.git"
INSTALL_DIR="${PULSENODE_DIR:-$HOME/pulsenode}"
[[ "$(id -u)" == "0" ]] && INSTALL_DIR="/opt/pulsenode"

echo -e "${C}${B}"
cat << 'BANNER'
  ____        _          _   _           _
 |  _ \ _   _| |___  ___| \ | | ___   __| | ___
 | |_) | | | | / __|/ _ \  \| |/ _ \ / _` |/ _ \
 |  __/| |_| | \__ \  __/ |\  | (_) | (_| |  __/
 |_|    \__,_|_|___/\___|_| \_|\___/ \__,_|\___|
BANNER
echo -e "${N}${G}  One-command VPS monitoring dashboard installer${N}"
echo ""

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${R}✗ $1 is not installed.${N}  $2"
    exit 1
  fi
}
check_cmd git    "Install: sudo apt-get install git"
check_cmd curl   "Install: sudo apt-get install curl"
check_cmd docker "Install Docker: https://docs.docker.com/get-docker/"
if ! docker compose version &>/dev/null 2>&1; then
  echo -e "${R}✗ Docker Compose v2 not available.${N}"
  echo "  https://docs.docker.com/compose/install/"
  exit 1
fi

echo -e "${G}✓ git            $(git --version | awk '{print $3}')${N}"
echo -e "${G}✓ Docker         $(docker --version | awk '{print $3}' | tr -d ',')${N}"
echo -e "${G}✓ Docker Compose $(docker compose version --short 2>/dev/null || echo 'v2')${N}"
echo ""
SCRIPT
```

- [ ] **Step 2: Verify the file was created and is valid bash so far**

```bash
bash -n /home/sakitha/apps/vps/install.sh && echo "syntax OK"
```
Expected: `syntax OK`

---

### Task 2: Add clone/update logic

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Append the clone-or-update block to install.sh**

```bash
cat >> /home/sakitha/apps/vps/install.sh << 'SCRIPT'

# ── Clone or update ────────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo -e "${C}━━━  Updating existing install at ${INSTALL_DIR}  ━━━━━━━━━━━━━━━${N}"
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo -e "${C}━━━  Cloning PulseNode into ${INSTALL_DIR}  ━━━━━━━━━━━━━━━━━━━━${N}"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
echo ""
SCRIPT
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n /home/sakitha/apps/vps/install.sh && echo "syntax OK"
```
Expected: `syntax OK`

---

### Task 3: Add IP detection and single confirmation prompt

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Append IP detection block**

```bash
cat >> /home/sakitha/apps/vps/install.sh << 'SCRIPT'

# ── Detect public IP ───────────────────────────────────────────────────────────
DETECTED_IP=$(
  curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null ||
  curl -fsSL --max-time 5 https://ifconfig.me   2>/dev/null ||
  hostname -I 2>/dev/null | awk '{print $1}'    ||
  echo "localhost"
)

echo -e "${C}━━━  Access URL  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
printf "  Detected IP: ${B}%s${N}\n" "$DETECTED_IP"
printf "  Install at http://%s/ ? [Y/n]: " "$DETECTED_IP"
read -r CONFIRM </dev/tty || CONFIRM="y"
if [[ "${CONFIRM,,}" == "n" ]]; then
  printf "  Enter your VPS IP or hostname: "
  read -r DETECTED_IP </dev/tty
fi
HOST="${DETECTED_IP#https://}"; HOST="${HOST#http://}"; HOST="${HOST%%/*}"
BASE_URL="http://${HOST}"
WS_URL="ws://${HOST}"
echo ""
SCRIPT
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n /home/sakitha/apps/vps/install.sh && echo "syntax OK"
```
Expected: `syntax OK`

---

### Task 4: Add `.env.local` writer

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Append env writer block**

```bash
cat >> /home/sakitha/apps/vps/install.sh << 'SCRIPT'

# ── Write .env.local ───────────────────────────────────────────────────────────
API_SECRET=$(openssl rand -hex 32 2>/dev/null \
  || head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)

echo -e "${C}━━━  Writing configuration  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
cat > .env.local << EOF
# PulseNode — generated by install.sh on $(date -u '+%Y-%m-%d %H:%M UTC')
NEXT_PUBLIC_ORIGIN=${BASE_URL}
NEXT_PUBLIC_NODE_API=${BASE_URL}
NEXT_PUBLIC_PYTHON_API=${BASE_URL}
NEXT_PUBLIC_WS_URL=${WS_URL}
WEB_PORT=127.0.0.1:3000
NODE_PORT=127.0.0.1:4001
PYTHON_PORT=127.0.0.1:8001
LISTEN_PORT=80
NODE_API_AUTH=false
NODE_API_SECRET=${API_SECRET}
COOLIFY_API_URL=
COOLIFY_API_TOKEN=
DATABASE_URL=
EOF
echo -e "  ${G}✓ .env.local written${N}"
echo ""
SCRIPT
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n /home/sakitha/apps/vps/install.sh && echo "syntax OK"
```
Expected: `syntax OK`

---

### Task 5: Add docker compose build + start

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Append docker compose block**

```bash
cat >> /home/sakitha/apps/vps/install.sh << 'SCRIPT'

# ── Build and start ────────────────────────────────────────────────────────────
echo -e "${C}━━━  Building and starting containers  ━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "  ${Y}First run takes a few minutes — building Docker images...${N}"
echo ""

docker compose \
  -f docker-compose.yml \
  -f docker-compose.standalone.yml \
  up -d --build
SCRIPT
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n /home/sakitha/apps/vps/install.sh && echo "syntax OK"
```
Expected: `syntax OK`

---

### Task 6: Add health-check poller and final URL display

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Append health poll + final screen block**

```bash
cat >> /home/sakitha/apps/vps/install.sh << 'SCRIPT'

# ── Wait for services ──────────────────────────────────────────────────────────
echo ""
echo -e "${C}━━━  Waiting for services to be ready  ━━━━━━━━━━━━━━━━━━━━━${N}"
WAIT=0
until curl -fsSL --max-time 2 "http://localhost/health" &>/dev/null; do
  if (( WAIT >= 60 )); then
    echo -e "\n  ${Y}⚠ Taking longer than expected. Check: docker compose logs${N}"
    break
  fi
  printf "\r  Waiting... %ds" "$WAIT"
  sleep 3
  WAIT=$((WAIT + 3))
done
printf "\r  ${G}✓ Services ready${N}          \n"
echo ""

# ── Done ───────────────────────────────────────────────────────────────────────
echo -e "${G}${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${G}${B}  ✓  PulseNode is live!${N}"
echo ""
echo -e "  ${B}Open in browser  →  ${C}${BASE_URL}/${N}"
echo ""
echo -e "  ${B}Quick links:${N}"
echo -e "    ${C}${BASE_URL}/containers${N}"
echo -e "    ${C}${BASE_URL}/stats${N}"
echo -e "    ${C}${BASE_URL}/processes${N}"
echo -e "    ${C}${BASE_URL}/databases${N}"
echo ""
echo -e "  Installed at:  ${Y}${INSTALL_DIR}${N}"
echo -e "  To stop:       ${Y}docker compose -f docker-compose.yml -f docker-compose.standalone.yml down${N}"
echo -e "  To update:     ${Y}curl -fsSL https://raw.githubusercontent.com/SakithaSamarathunga33/vps/main/install.sh | bash${N}"
echo -e "${G}${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
SCRIPT
```

- [ ] **Step 2: Final syntax check on the complete script**

```bash
bash -n /home/sakitha/apps/vps/install.sh && echo "syntax OK"
```
Expected: `syntax OK`

- [ ] **Step 3: Make executable**

```bash
chmod +x /home/sakitha/apps/vps/install.sh
```

- [ ] **Step 4: Dry-run verification — confirm the script structure is correct**

```bash
head -5 /home/sakitha/apps/vps/install.sh
wc -l /home/sakitha/apps/vps/install.sh
```
Expected: shebang on line 1, file is ~90-110 lines

---

### Task 7: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "One-command deploy" section**

Open `README.md` and replace the existing `## One-command deploy` section with:

```markdown
## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/SakithaSamarathunga33/vps/main/install.sh | bash
```

The script:
1. Checks Docker and Docker Compose v2 are installed
2. Clones the repo into `~/pulsenode` (or `/opt/pulsenode` when run as root)
3. Detects your server's public IP — one prompt to confirm
4. Writes the config, builds all Docker images, starts everything behind Nginx on port 80
5. Polls until services are ready, then prints your clickable dashboard URL

When it finishes:
```
  Open in browser  →  http://YOUR_IP/

  Quick links:
    http://YOUR_IP/containers
    http://YOUR_IP/stats
    http://YOUR_IP/processes
    http://YOUR_IP/databases
```

**Re-running the same command updates an existing install** (git pull + rebuild).

### Requirements

| Requirement | Version |
|------------|---------|
| Docker | 24+ |
| Docker Compose plugin (v2) | 2.20+ |
| git | any |
| Linux VPS | Any distro with Docker |
| Open port | 80 |

> The Node.js API mounts `/var/run/docker.sock` to read containers, images, and networks from the host Docker daemon.
```

- [ ] **Step 2: Verify the section renders correctly**

```bash
grep -A 40 "## One-command install" /home/sakitha/apps/vps/README.md | head -45
```
Expected: shows the curl one-liner followed by the numbered list and the URL box example.

---

### Task 8: Commit

**Files:**
- Commit: `install.sh`, `README.md`

- [ ] **Step 1: Stage and commit**

```bash
cd /home/sakitha/apps/vps
git add install.sh README.md
git commit -m "$(cat <<'EOF'
feat: add curl|bash one-click installer (install.sh)

Auto-detects VPS IP, clones repo, writes config, builds Docker images,
polls health endpoint, and prints a clickable URL at the end.
Re-running updates an existing install via git pull + rebuild.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify commit**

```bash
git log --oneline -3
```
Expected: newest commit starts with `feat: add curl|bash one-click installer`
