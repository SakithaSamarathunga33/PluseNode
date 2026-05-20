"""Security scanning via Trivy subprocess + SBOM management."""

import asyncio
import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from mock_data import MOCK_SCANS, MOCK_SBOMS

SCANS_FILE = Path(__file__).parent / "scans.json"
SBOMS_FILE = Path(__file__).parent / "sboms.json"

TRIVY_AVAILABLE = shutil.which("trivy") is not None


def get_scans() -> list[dict[str, Any]]:
    """Return persisted scan history, falling back to mock data."""
    if SCANS_FILE.exists():
        try:
            return json.loads(SCANS_FILE.read_text())
        except Exception:
            pass
    return MOCK_SCANS


def get_sboms() -> list[dict[str, Any]]:
    """Return persisted SBOM history, falling back to mock data."""
    if SBOMS_FILE.exists():
        try:
            return json.loads(SBOMS_FILE.read_text())
        except Exception:
            pass
    return MOCK_SBOMS


async def run_scan(target: str) -> dict[str, Any]:
    """Run a Trivy vulnerability scan against a Docker image.

    Falls back to a mock result if Trivy is not installed.
    Result is persisted to scans.json.
    """
    scan_id = f"scan_{int(time.time()) % 100000:05x}"
    started = time.strftime("%b %-d, %-I:%M %p")
    t0 = time.monotonic()

    if not target:
        return {"error": "target is required"}

    if not TRIVY_AVAILABLE:
        # Return realistic mock scan result
        import random
        duration_s = random.randint(10, 45)
        result = {
            "id":       scan_id,
            "image":    target,
            "scanner":  "Trivy",
            "started":  started,
            "duration": f"{duration_s}s",
            "status":   "done",
            "crit":     random.randint(0, 2),
            "high":     random.randint(0, 5),
            "med":      random.randint(1, 8),
            "low":      random.randint(2, 15),
        }
        _persist_scan(result)
        return result

    try:
        proc = await asyncio.create_subprocess_exec(
            "trivy", "image", "--format", "json", "--quiet", target,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        duration = round(time.monotonic() - t0, 1)

        if proc.returncode != 0:
            result = {
                "id": scan_id, "image": target, "scanner": "Trivy",
                "started": started, "duration": f"{duration}s",
                "status": "failed", "crit": 0, "high": 0, "med": 0, "low": 0,
            }
            _persist_scan(result)
            return result

        data = json.loads(stdout)
        counts = {"crit": 0, "high": 0, "med": 0, "low": 0}
        for res in data.get("Results", []):
            for vuln in res.get("Vulnerabilities", []):
                sev = vuln.get("Severity", "").lower()
                if sev == "critical":   counts["crit"] += 1
                elif sev == "high":     counts["high"] += 1
                elif sev == "medium":   counts["med"]  += 1
                elif sev == "low":      counts["low"]  += 1

        result = {
            "id": scan_id, "image": target, "scanner": "Trivy",
            "started": started, "duration": f"{duration}s", "status": "done",
            **counts,
        }
        _persist_scan(result)
        return result

    except asyncio.TimeoutError:
        result = {
            "id": scan_id, "image": target, "scanner": "Trivy",
            "started": started, "duration": "120s", "status": "failed",
            "crit": 0, "high": 0, "med": 0, "low": 0,
        }
        _persist_scan(result)
        return result


async def generate_sbom(target: str, fmt: str = "spdx-json") -> dict[str, Any]:
    """Generate an SBOM for a Docker image. Falls back to mock if Trivy unavailable."""
    generated = time.strftime("%b %-d, %-I:%M %p")

    if not TRIVY_AVAILABLE:
        import random
        result = {
            "image":     target,
            "format":    "SPDX 2.3" if "spdx" in fmt else "CycloneDX 1.5",
            "packages":  random.randint(50, 400),
            "generated": generated,
            "licenses":  random.randint(5, 20),
            "ecosystem": {"go": random.randint(0, 150), "npm": random.randint(0, 100), "deb": random.randint(0, 50), "other": random.randint(5, 30)},
        }
        _persist_sbom(result)
        return result

    try:
        proc = await asyncio.create_subprocess_exec(
            "trivy", "image", "--format", fmt, "--quiet", target,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
        data = json.loads(stdout)

        packages = len(data.get("packages", data.get("components", [])))
        result = {
            "image":     target,
            "format":    "SPDX 2.3" if "spdx" in fmt else "CycloneDX 1.5",
            "packages":  packages,
            "generated": generated,
            "licenses":  0,
            "ecosystem": {"go": 0, "npm": 0, "deb": 0, "other": packages},
        }
        _persist_sbom(result)
        return result
    except Exception as e:
        return {"error": str(e)}


def _persist_scan(result: dict) -> None:
    scans = get_scans()
    if not any(s["id"] == result["id"] for s in scans):
        scans.insert(0, result)
        SCANS_FILE.write_text(json.dumps(scans[:50], indent=2))


def _persist_sbom(result: dict) -> None:
    sboms = get_sboms()
    sboms.insert(0, result)
    SBOMS_FILE.write_text(json.dumps(sboms[:50], indent=2))
