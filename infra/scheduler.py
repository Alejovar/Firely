"""Run Firely's daily and weekly maintenance jobs at fixed UTC times.

Compose runs exactly one scheduler service. A success ledger in /state survives
container restarts, and failed jobs retry after an hour. The API mounts the same
processed-data directory read-only while this service can update it.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

JOBS = (
    ("daily_update", 6, 10, None, [sys.executable, "-m", "pipeline.daily_update"]),
    ("alerts", 6, 30, None, [sys.executable, "-m", "pipeline.alerts_job"]),
    ("bulletin", 7, 0, 0, [sys.executable, "-m", "pipeline.bulletin_job"]),
)
RETRY_SECONDS = 3600
TICK_SECONDS = 30


def ledger_path() -> Path:
    return Path(os.environ.get("FIRELY_STATE_DIR", "/state")) / "scheduler.json"


def read_ledger() -> dict:
    try:
        value = json.loads(ledger_path().read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_ledger(value: dict) -> None:
    path = ledger_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, sort_keys=True), encoding="utf-8")
    temp.replace(path)


def due_jobs(now: datetime, ledger: dict) -> list[tuple[str, str, list[str]]]:
    """Return due jobs in dependency order. A missed Monday bulletin catches up that week."""
    now = now.astimezone(timezone.utc)
    day = now.date().isoformat()
    result = []
    for name, hour, minute, weekday, command in JOBS:
        if weekday is None:
            if (now.hour, now.minute) < (hour, minute):
                continue
            key = day
        else:
            if now.weekday() < weekday or (now.weekday() == weekday and (now.hour, now.minute) < (hour, minute)):
                continue
            year, week, _ = now.isocalendar()
            key = f"{year}-W{week:02d}"
        if ledger.get(name) == key:
            continue
        result.append((name, key, command))
    return result


def tick(now: datetime | None = None, runner=None) -> dict:
    now = now or datetime.now(timezone.utc)
    runner = runner or subprocess.run
    ledger = read_ledger()
    attempts = ledger.get("attempts", {})
    if not isinstance(attempts, dict):
        attempts = {}
    for name, day, command in due_jobs(now, ledger):
        # A failed job can retry, but cannot spin on an unavailable external service.
        if now.timestamp() - float(attempts.get(name, 0)) < RETRY_SECONDS:
            continue
        attempts[name] = now.timestamp()
        ledger["attempts"] = attempts
        save_ledger(ledger)
        print(f"[{now.isoformat()}] starting {name}", flush=True)
        try:
            completed = runner(command, check=False)
            code = completed.returncode
        except OSError as exc:
            code = 127
            print(f"{name} could not start: {type(exc).__name__}", flush=True)
        if code == 0:
            ledger[name] = day
            save_ledger(ledger)
        print(f"[{datetime.now(timezone.utc).isoformat()}] {name} exit={code}", flush=True)
    return ledger


def main() -> int:
    print("Firely scheduler started; schedule is UTC", flush=True)
    while True:
        tick()
        time.sleep(TICK_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
