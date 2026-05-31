#!/usr/bin/env bash
# Rebuild and recreate the PulseNode stack on this box.
#
# Always uses BOTH compose files — the base plus the Traefik overlay — because
# the TLS/routing labels and the vps-monitor_proxy network attachment live in
# docker-compose.traefik.yml. A plain `docker compose up` drops them and Traefik
# returns 404.
#
# Also fetches git tags so the Settings page shows the right version: CI creates
# the release tag after you push, and `git push` never pulls tags back, so a
# manual rebuild would otherwise report a stale build.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Fetching release tags"
git fetch --tags origin

echo "==> Rebuilding and recreating stack (base + traefik overlay)"
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build

echo "==> Done. Installed version: $(git describe --tags --abbrev=0 2>/dev/null || echo unknown)"
