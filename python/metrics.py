"""System metrics collection using psutil with 60-point rolling deque."""

import asyncio
import time
from collections import deque
from typing import Any

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

# 60-point rolling window updated every second
metrics_deque: deque[dict[str, Any]] = deque(maxlen=60)

# Track previous network counters for calculating rates
_prev_net = None
_prev_net_ts = None


def _get_net_rates() -> tuple[float, float]:
    """Return current network I/O rates in KB/s."""
    global _prev_net, _prev_net_ts
    if not PSUTIL_AVAILABLE:
        return 30.0, 18.0

    now = time.monotonic()
    counters = psutil.net_io_counters()

    if _prev_net is None or _prev_net_ts is None:
        _prev_net = counters
        _prev_net_ts = now
        return 0.0, 0.0

    elapsed = now - _prev_net_ts
    if elapsed < 0.1:
        return 0.0, 0.0

    rx_rate = (counters.bytes_recv - _prev_net.bytes_recv) / elapsed / 1024  # KB/s
    tx_rate = (counters.bytes_sent - _prev_net.bytes_sent) / elapsed / 1024  # KB/s

    _prev_net    = counters
    _prev_net_ts = now

    return max(0.0, rx_rate), max(0.0, tx_rate)


def snapshot() -> dict[str, Any]:
    """Collect a single metrics snapshot. Falls back to random walk if psutil unavailable."""
    if not PSUTIL_AVAILABLE:
        import random
        last = metrics_deque[-1] if metrics_deque else {"cpu": 22.0, "ram": 40.0, "disk": 26.0, "netIn": 30.0, "netOut": 18.0}
        return {
            "cpu":    round(max(2, min(95, last["cpu"]  + (random.random() - 0.5) * 8)), 1),
            "ram":    round(max(5, min(90, last["ram"]  + (random.random() - 0.5) * 4)), 1),
            "disk":   round(max(5, min(95, last["disk"] + (random.random() - 0.5) * 0.3)), 1),
            "netIn":  round(max(0, last["netIn"]  + (random.random() - 0.5) * 40), 1),
            "netOut": round(max(0, last["netOut"] + (random.random() - 0.5) * 20), 1),
            "ts":     int(time.time() * 1000),
        }

    net_in, net_out = _get_net_rates()
    return {
        "cpu":    round(psutil.cpu_percent(interval=None), 1),
        "ram":    round(psutil.virtual_memory().percent, 1),
        "disk":   round(psutil.disk_usage("/").percent, 1),
        "netIn":  round(net_in, 1),
        "netOut": round(net_out, 1),
        "ts":     int(time.time() * 1000),
    }


async def collect_metrics() -> None:
    """Background task: collect one snapshot per second into the rolling deque."""
    # Warm up psutil CPU measurement
    if PSUTIL_AVAILABLE:
        psutil.cpu_percent(interval=None)
        await asyncio.sleep(0.1)
        _get_net_rates()  # prime network counters

    while True:
        try:
            metrics_deque.append(snapshot())
        except Exception:
            pass
        await asyncio.sleep(1)


def get_live_metrics() -> dict[str, Any]:
    """Return the most recent metrics snapshot."""
    if metrics_deque:
        return metrics_deque[-1]
    s = snapshot()
    metrics_deque.append(s)
    return s


def get_history() -> list[dict[str, Any]]:
    """Return the full 60-point rolling history."""
    return list(metrics_deque)


def get_processes() -> list[dict[str, Any]]:
    """Return top processes sorted by CPU usage."""
    if not PSUTIL_AVAILABLE:
        from mock_data import MOCK_SCANS  # reuse something just to avoid circular; use hardcoded
        return [
            {"pid": 1024, "name": "node",       "cpu": 12.4, "mem_mb": 152, "status": "sleeping", "user": "root",     "cmd": "node /app/server.js",            "type": "system"},
            {"pid": 2381, "name": "postgres",    "cpu": 8.7,  "mem_mb": 248, "status": "sleeping", "user": "postgres", "cmd": "postgres: writer",               "type": "system"},
            {"pid": 982,  "name": "dockerd",     "cpu": 6.1,  "mem_mb": 52,  "status": "sleeping", "user": "root",     "cmd": "/usr/bin/dockerd -H fd://",       "type": "system"},
            {"pid": 4012, "name": "traefik",     "cpu": 4.3,  "mem_mb": 76,  "status": "sleeping", "user": "1000",     "cmd": "traefik --providers.docker",      "type": "system"},
            {"pid": 3201, "name": "redis-server","cpu": 2.9,  "mem_mb": 31,  "status": "sleeping", "user": "redis",    "cmd": "redis-server *:6379",             "type": "system"},
        ]

    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status", "username", "cmdline"]):
        try:
            info = p.info
            procs.append({
                "pid":     info["pid"],
                "name":    info["name"] or "",
                "cpu":     round(info["cpu_percent"] or 0, 1),
                "mem_mb":  round((info["memory_info"].rss if info["memory_info"] else 0) / 1024 / 1024, 1),
                "status":  info["status"] or "unknown",
                "user":    info["username"] or "",
                "cmd":     " ".join(info["cmdline"] or [info["name"] or ""])[:120],
                "type":    "system",
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    procs.sort(key=lambda x: x["cpu"], reverse=True)
    return procs[:50]
