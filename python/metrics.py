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

# Track previous counters for rate calculations
_prev_net = None
_prev_net_ts = None
_prev_disk_io = None
_prev_disk_io_ts = None


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

    rx_rate = (counters.bytes_recv - _prev_net.bytes_recv) / elapsed / 1024
    tx_rate = (counters.bytes_sent - _prev_net.bytes_sent) / elapsed / 1024

    _prev_net    = counters
    _prev_net_ts = now

    return max(0.0, rx_rate), max(0.0, tx_rate)


def _get_disk_io_rates() -> tuple[float, float]:
    """Return current disk read/write rates in MB/s."""
    global _prev_disk_io, _prev_disk_io_ts
    if not PSUTIL_AVAILABLE:
        return 0.0, 0.0

    try:
        now = time.monotonic()
        counters = psutil.disk_io_counters()
        if counters is None:
            return 0.0, 0.0

        if _prev_disk_io is None or _prev_disk_io_ts is None:
            _prev_disk_io = counters
            _prev_disk_io_ts = now
            return 0.0, 0.0

        elapsed = now - _prev_disk_io_ts
        if elapsed < 0.1:
            return 0.0, 0.0

        read_mb  = (counters.read_bytes  - _prev_disk_io.read_bytes)  / elapsed / 1024 / 1024
        write_mb = (counters.write_bytes - _prev_disk_io.write_bytes) / elapsed / 1024 / 1024

        _prev_disk_io    = counters
        _prev_disk_io_ts = now

        return max(0.0, read_mb), max(0.0, write_mb)
    except Exception:
        return 0.0, 0.0


def snapshot() -> dict[str, Any]:
    """Collect a single metrics snapshot."""
    if not PSUTIL_AVAILABLE:
        import random
        last = metrics_deque[-1] if metrics_deque else {
            "cpu": 22.0, "ram": 40.0, "disk": 26.0,
            "netIn": 30.0, "netOut": 18.0,
            "diskRead": 5.0, "diskWrite": 2.0,
            "cpuCores": [],
        }
        return {
            "cpu":       round(max(2,  min(95, last["cpu"]  + (random.random() - 0.5) * 8)),  1),
            "cpuCores":  [],
            "ram":       round(max(5,  min(90, last["ram"]  + (random.random() - 0.5) * 4)),  1),
            "disk":      round(max(5,  min(95, last["disk"] + (random.random() - 0.5) * 0.3)),1),
            "diskRead":  round(max(0,  last["diskRead"]  + (random.random() - 0.5) * 8),  2),
            "diskWrite": round(max(0,  last["diskWrite"] + (random.random() - 0.5) * 4),  2),
            "netIn":     round(max(0,  last["netIn"]  + (random.random() - 0.5) * 40),    1),
            "netOut":    round(max(0,  last["netOut"] + (random.random() - 0.5) * 20),    1),
            "ts":        int(time.time() * 1000),
        }

    net_in, net_out       = _get_net_rates()
    disk_read, disk_write = _get_disk_io_rates()
    cpu_cores             = psutil.cpu_percent(percpu=True)

    return {
        "cpu":       round(psutil.cpu_percent(interval=None), 1),
        "cpuCores":  [round(c, 1) for c in cpu_cores],
        "ram":       round(psutil.virtual_memory().percent, 1),
        "disk":      round(psutil.disk_usage("/").percent, 1),
        "diskRead":  round(disk_read,  2),
        "diskWrite": round(disk_write, 2),
        "netIn":     round(net_in,  1),
        "netOut":    round(net_out, 1),
        "ts":        int(time.time() * 1000),
    }


async def collect_metrics() -> None:
    """Background task: collect one snapshot per second into the rolling deque."""
    if PSUTIL_AVAILABLE:
        psutil.cpu_percent(interval=None)
        psutil.cpu_percent(percpu=True)
        await asyncio.sleep(0.1)
        _get_net_rates()
        _get_disk_io_rates()

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
        return [
            {"pid": 1024, "name": "node",        "cpu": 12.4, "mem_mb": 152, "status": "sleeping", "user": "root",     "cmd": "node /app/server.js",         "type": "system"},
            {"pid": 2381, "name": "postgres",     "cpu": 8.7,  "mem_mb": 248, "status": "sleeping", "user": "postgres", "cmd": "postgres: writer",            "type": "system"},
            {"pid": 982,  "name": "dockerd",      "cpu": 6.1,  "mem_mb": 52,  "status": "sleeping", "user": "root",     "cmd": "/usr/bin/dockerd -H fd://",   "type": "system"},
            {"pid": 4012, "name": "traefik",      "cpu": 4.3,  "mem_mb": 76,  "status": "sleeping", "user": "1000",     "cmd": "traefik --providers.docker",  "type": "system"},
            {"pid": 3201, "name": "redis-server", "cpu": 2.9,  "mem_mb": 31,  "status": "sleeping", "user": "redis",    "cmd": "redis-server *:6379",         "type": "system"},
        ]

    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status", "username", "cmdline"]):
        try:
            info = p.info
            procs.append({
                "pid":    info["pid"],
                "name":   info["name"] or "",
                "cpu":    round(info["cpu_percent"] or 0, 1),
                "mem_mb": round((info["memory_info"].rss if info["memory_info"] else 0) / 1024 / 1024, 1),
                "status": info["status"] or "unknown",
                "user":   info["username"] or "",
                "cmd":    " ".join(info["cmdline"] or [info["name"] or ""])[:120],
                "type":   "system",
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    procs.sort(key=lambda x: x["cpu"], reverse=True)
    return procs[:50]
