"""PulseNode Python FastAPI â€” system metrics, database introspection, security scanning."""

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from metrics  import collect_metrics, get_live_metrics, get_history, get_processes
from database import get_db_inspect, get_db_connections
from security import get_scans, get_sboms, run_scan, generate_sbom


# â”€â”€ Lifespan: start background metrics collector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(collect_metrics())
    print("[python] âœ“ PulseNode FastAPI started â€” metrics collection running")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app = FastAPI(
    title="PulseNode Python API",
    version="1.0.0",
    description="System metrics, database introspection, and security scanning for PulseNode.",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = [
    os.getenv("NEXT_PUBLIC_ORIGIN", "http://localhost:3000"),
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# â”€â”€ Request models â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class ScanRequest(BaseModel):
    target: str

class SBOMRequest(BaseModel):
    target: str
    format: str = "spdx-json"


# â”€â”€ Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "pulsenode-python"}


# â”€â”€ Metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/metrics/live")
async def metrics_live() -> dict[str, Any]:
    """Latest system metrics snapshot (CPU, RAM, disk, net I/O)."""
    return get_live_metrics()


@app.get("/metrics/history")
async def metrics_history() -> list[dict[str, Any]]:
    """60-point rolling history of system metrics."""
    return get_history()


@app.get("/metrics/processes")
async def metrics_processes() -> list[dict[str, Any]]:
    """Top 50 processes sorted by CPU usage."""
    return get_processes()


# â”€â”€ Database â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/database/inspect")
async def database_inspect() -> list[dict[str, Any]]:
    """All databases with tables, sizes, slow queries, active connections."""
    return await get_db_inspect()


@app.get("/database/connections")
async def database_connections() -> list[dict[str, Any]]:
    """Active connection count per database."""
    return await get_db_connections()


# â”€â”€ Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/security/scans")
async def security_scans() -> list[dict[str, Any]]:
    """Vulnerability scan history."""
    return get_scans()


@app.post("/security/scan")
async def security_scan(body: ScanRequest) -> dict[str, Any]:
    """Run a Trivy vulnerability scan against the specified image."""
    if not body.target:
        raise HTTPException(status_code=400, detail="target is required")
    return await run_scan(body.target)


@app.get("/security/sboms")
async def security_sboms() -> list[dict[str, Any]]:
    """SBOM history."""
    return get_sboms()


@app.post("/security/sbom")
async def security_sbom(body: SBOMRequest) -> dict[str, Any]:
    """Generate an SBOM for the specified image."""
    if not body.target:
        raise HTTPException(status_code=400, detail="target is required")
    return await generate_sbom(body.target, body.format)
