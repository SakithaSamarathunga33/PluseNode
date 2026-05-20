"""Mock data for Python FastAPI — used when real services are unavailable."""

import random
from datetime import datetime, timedelta

# ── DB mock ────────────────────────────────────────────────────────────────────
MOCK_DATABASES = [
    {
        "name": "coolify_pg",
        "engine": "postgres",
        "version": "15.6",
        "host": "coolify-db",
        "port": 5432,
        "size": "486 MB",
        "conns": 12,
        "maxConns": 100,
        "qps": 142,
        "slow": 0,
        "state": "ok",
    },
    {
        "name": "app_main",
        "engine": "postgres",
        "version": "15.6",
        "host": "coolify-db",
        "port": 5432,
        "size": "2.1 GB",
        "conns": 28,
        "maxConns": 100,
        "qps": 380,
        "slow": 2,
        "state": "ok",
    },
    {
        "name": "cache",
        "engine": "redis",
        "version": "7.2.4",
        "host": "coolify-redis",
        "port": 6379,
        "size": "108 MB",
        "conns": 18,
        "maxConns": 200,
        "qps": 1924,
        "slow": 0,
        "state": "ok",
    },
    {
        "name": "queue",
        "engine": "redis",
        "version": "7.2.4",
        "host": "coolify-redis",
        "port": 6379,
        "size": "42 MB",
        "conns": 4,
        "maxConns": 200,
        "qps": 481,
        "slow": 0,
        "state": "ok",
    },
    {
        "name": "analytics",
        "engine": "clickhouse",
        "version": "24.3",
        "host": "ext-clickhouse-01",
        "port": 8123,
        "size": "12.4 GB",
        "conns": 6,
        "maxConns": 50,
        "qps": 38,
        "slow": 1,
        "state": "warn",
    },
]

MOCK_DB_TABLES = {
    "coolify_pg": [
        {"name": "users",    "rows": 12400, "totalSize": "48 MB",  "indexSize": "12 MB"},
        {"name": "events",   "rows": 89200, "totalSize": "210 MB", "indexSize": "44 MB"},
        {"name": "sessions", "rows": 4100,  "totalSize": "8 MB",   "indexSize": "2 MB"},
    ],
    "app_main": [
        {"name": "orders",   "rows": 241000, "totalSize": "890 MB", "indexSize": "210 MB"},
        {"name": "products", "rows": 8200,   "totalSize": "42 MB",  "indexSize": "8 MB"},
        {"name": "reviews",  "rows": 62000,  "totalSize": "180 MB", "indexSize": "38 MB"},
    ],
}

MOCK_SLOW_QUERIES = {
    "app_main": [
        {"query": "SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC", "duration": 520, "timestamp": "2 min ago"},
        {"query": "SELECT COUNT(*) FROM reviews GROUP BY product_id HAVING COUNT(*) > 100",  "duration": 380, "timestamp": "8 min ago"},
    ],
    "analytics": [
        {"query": "SELECT date_trunc('day', ts), count(*) FROM events GROUP BY 1",           "duration": 1240, "timestamp": "1 min ago"},
    ],
}

# ── Security mock ──────────────────────────────────────────────────────────────
MOCK_SCANS = [
    {"id": "scan_92a1f", "image": "minio/minio:RELEASE.2025-04-12",            "scanner": "Trivy", "started": "May 19, 5:12 AM",  "duration": "42s", "status": "done",   "crit": 1, "high": 3, "med": 7,  "low": 14},
    {"id": "scan_8721a", "image": "traefik:v3.6",                              "scanner": "Trivy", "started": "May 19, 5:11 AM",  "duration": "18s", "status": "done",   "crit": 0, "high": 1, "med": 4,  "low": 12},
    {"id": "scan_771ab", "image": "postgres:15-alpine",                        "scanner": "Trivy", "started": "May 19, 5:10 AM",  "duration": "22s", "status": "done",   "crit": 0, "high": 0, "med": 2,  "low": 6},
    {"id": "scan_6612c", "image": "ghcr.io/myorg/api:v0.3.0",                 "scanner": "Trivy", "started": "May 18, 11:02 PM", "duration": "31s", "status": "done",   "crit": 2, "high": 5, "med": 11, "low": 18},
    {"id": "scan_5511b", "image": "ghcr.io/myorg/tg-bot:v0.4.2",              "scanner": "Grype", "started": "May 18, 10:48 PM", "duration": "24s", "status": "done",   "crit": 0, "high": 0, "med": 3,  "low": 9},
    {"id": "scan_4499f", "image": "redis:7-alpine",                            "scanner": "Trivy", "started": "May 18, 8:18 PM",  "duration": "12s", "status": "done",   "crit": 0, "high": 0, "med": 1,  "low": 3},
    {"id": "scan_0099b", "image": "k6io/k6:0.50",                             "scanner": "Trivy", "started": "May 17, 3:48 PM",  "duration": "14s", "status": "failed", "crit": 0, "high": 0, "med": 0,  "low": 0},
]

MOCK_SBOMS = [
    {"image": "minio/minio:RELEASE.2025-04-12",            "format": "SPDX 2.3",      "packages": 248, "generated": "May 19, 5:12 AM",  "licenses": 14, "ecosystem": {"go": 198, "npm": 0,   "deb": 38,  "other": 12}},
    {"image": "traefik:v3.6",                              "format": "CycloneDX 1.5", "packages": 184, "generated": "May 19, 5:11 AM",  "licenses": 11, "ecosystem": {"go": 152, "npm": 0,   "deb": 24,  "other": 8}},
    {"image": "postgres:15-alpine",                        "format": "SPDX 2.3",      "packages": 96,  "generated": "May 19, 5:10 AM",  "licenses": 7,  "ecosystem": {"go": 0,   "npm": 0,   "deb": 0,   "other": 96}},
    {"image": "ghcr.io/myorg/api:v0.3.0",                 "format": "CycloneDX 1.5", "packages": 412, "generated": "May 18, 11:02 PM", "licenses": 22, "ecosystem": {"go": 0,   "npm": 318, "deb": 64,  "other": 30}},
    {"image": "ghcr.io/myorg/tg-bot:v0.4.2",              "format": "SPDX 2.3",      "packages": 198, "generated": "May 18, 10:48 PM", "licenses": 12, "ecosystem": {"go": 0,   "npm": 142, "deb": 38,  "other": 18}},
    {"image": "redis:7-alpine",                            "format": "CycloneDX 1.5", "packages": 64,  "generated": "May 18, 8:18 PM",  "licenses": 6,  "ecosystem": {"go": 0,   "npm": 0,   "deb": 0,   "other": 64}},
]
