"""Database introspection via asyncpg. Falls back to mock data if DB is unreachable."""

import os
from typing import Any

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    ASYNCPG_AVAILABLE = False

from mock_data import (
    MOCK_DATABASES, MOCK_DB_TABLES, MOCK_SLOW_QUERIES
)

DATABASE_URL = os.getenv("DATABASE_URL", "")


async def _try_connect(dsn: str):
    """Attempt a short-lived asyncpg connection. Returns None on failure."""
    if not ASYNCPG_AVAILABLE or not dsn:
        return None
    try:
        conn = await asyncpg.connect(dsn, timeout=5)
        return conn
    except Exception:
        return None


async def get_db_inspect() -> list[dict[str, Any]]:
    """Return database list with tables, sizes, slow queries.
    Uses real DB if DATABASE_URL is set and reachable; otherwise returns mock."""
    conn = await _try_connect(DATABASE_URL)

    if conn is None:
        # Return mock data enriched with tables and slow queries
        result = []
        for db in MOCK_DATABASES:
            d = dict(db)
            d["tables"]      = MOCK_DB_TABLES.get(db["name"], _default_tables())
            d["slowQueries"] = MOCK_SLOW_QUERIES.get(db["name"], [])
            d["activeConns"] = _mock_active_conns(db["conns"])
            result.append(d)
        return result

    try:
        # Real Postgres introspection
        databases = await conn.fetch("""
            SELECT datname AS name,
                   pg_size_pretty(pg_database_size(datname)) AS size
            FROM pg_database
            WHERE datistemplate = false
            ORDER BY pg_database_size(datname) DESC
        """)

        result = []
        for db in databases:
            # Per-DB connection count
            conns = await conn.fetchval(
                "SELECT count(*) FROM pg_stat_activity WHERE datname = $1", db["name"]
            ) or 0

            tables = await conn.fetch("""
                SELECT tablename AS name,
                       n_live_tup AS rows,
                       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS "totalSize",
                       pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename))        AS "indexSize"
                FROM pg_stat_user_tables
                ORDER BY n_live_tup DESC
                LIMIT 10
            """)

            slow = await conn.fetch("""
                SELECT query, round(mean_exec_time::numeric, 0) AS duration,
                       calls, rows
                FROM pg_stat_statements
                WHERE mean_exec_time > 100
                ORDER BY mean_exec_time DESC
                LIMIT 5
            """) if await _has_pg_stat_statements(conn) else []

            result.append({
                "name":        db["name"],
                "engine":      "postgres",
                "version":     "15",
                "host":        "localhost",
                "port":        5432,
                "size":        db["size"],
                "conns":       conns,
                "maxConns":    100,
                "qps":         0,
                "slow":        len(slow),
                "state":       "ok",
                "tables":      [dict(t) for t in tables],
                "slowQueries": [{"query": s["query"][:80], "duration": s["duration"], "timestamp": "recent"} for s in slow],
                "activeConns": _mock_active_conns(conns),
            })

        return result
    finally:
        await conn.close()


async def get_db_connections() -> list[dict[str, Any]]:
    """Return connection counts per known database."""
    conn = await _try_connect(DATABASE_URL)

    if conn is None:
        return [{"name": db["name"], "conns": db["conns"]} for db in MOCK_DATABASES]

    try:
        rows = await conn.fetch("""
            SELECT datname, count(*) AS conns
            FROM pg_stat_activity
            GROUP BY datname
            ORDER BY conns DESC
        """)
        return [{"name": r["datname"], "conns": r["conns"]} for r in rows]
    finally:
        await conn.close()


async def _has_pg_stat_statements(conn) -> bool:
    try:
        await conn.fetchval("SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'")
        return True
    except Exception:
        return False


def _default_tables() -> list[dict]:
    return [
        {"name": "users",    "rows": 12400, "totalSize": "48 MB",  "indexSize": "12 MB"},
        {"name": "events",   "rows": 89200, "totalSize": "210 MB", "indexSize": "44 MB"},
        {"name": "sessions", "rows": 4100,  "totalSize": "8 MB",   "indexSize": "2 MB"},
    ]


def _mock_active_conns(count: int) -> list[dict]:
    import random
    users = ["app_user", "readonly", "admin", "analytics"]
    states = ["active", "idle", "idle in transaction"]
    return [
        {"pid": 10000 + i, "user": random.choice(users), "state": random.choice(states), "duration": f"{random.randint(1, 120)}s"}
        for i in range(min(count, 5))
    ]
