"""Alert subscriptions (§10.1 of docs/firely-descripcion.md).

A subscription is an area, a threshold and a Telegram chat. The daily job ``pipeline.alerts_job`` evaluates them with
the real priority index (/risk) and the harmonized anomaly; nothing is sent until an operator approves the
subscription on the server (``python -m pipeline.alerts_job --approve <id>``), and every message is marked as an
exercise/test. The store is a JSON file in ``FIRELY_STATE_DIR`` (writable volume), guarded by a file lock because the
API runs several workers.
"""
from __future__ import annotations

import fcntl
import json
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import db
from .extra_routes import _area
from .real import ATTRIBUTION

router = APIRouter()
AREA_KEYS = ("h3", "bbox", "lat", "lon", "radius_km", "admin")
MAX_CELLS = 5000
MAX_SUBSCRIPTIONS = 500


def store_path():
    return db.state_root() / "subscriptions.json"


@contextmanager
def locked():
    """Exclusive lock over the store; yields (load, save)."""
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path.with_suffix(".lock"), "a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def load() -> list[dict]:
    path = store_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return data if isinstance(data, list) else []


def save_json(path, payload) -> None:
    """Atomic JSON write (temp file + rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def save(items: list[dict]) -> None:
    save_json(store_path(), items)


def area_params(area: dict) -> dict:
    return {k: area[k] for k in AREA_KEYS if area.get(k) is not None}


def public(item: dict) -> dict:
    """Subscription as returned by the API: the chat id is masked (it identifies a person or group)."""
    chat = "" if item.get("chat_id") is None else str(item["chat_id"])
    return {**{k: v for k, v in item.items() if k != "chat_id"}, "chat_id_masked": "…" + chat[-3:] if chat else None}


class Area(BaseModel):
    h3: str | None = None
    bbox: str | None = None
    lat: float | None = None
    lon: float | None = None
    radius_km: float | None = None
    admin: str | None = None


class SubscriptionIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    area: Area
    chat_id: int | None = Field(None, description="Telegram chat id; omit it to only evaluate and preview the alert")
    min_index: float = Field(55.0, ge=0, le=100, description="Priority index (/risk, 0–100) that triggers the alert")
    min_anomaly_ratio: float | None = Field(None, gt=0, le=1000,
                                            description="Optional: latest month / median of the same month in other years")
    lang: str = Field("es", pattern="^(es|en|pt)$")


@router.post("/subscriptions", status_code=201)
def create_subscription(body: SubscriptionIn):
    params = area_params(body.area.model_dump())
    if not params:
        raise HTTPException(422, "area requires one selector (h3, bbox, lat+lon[+radius_km] or admin)")
    cells, area = _area(params.get("h3"), params.get("bbox"), params.get("lat"), params.get("lon"),
                        params.get("radius_km"), params.get("admin"), None)
    if not cells:
        raise HTTPException(422, "Empty area")
    if len(cells) > MAX_CELLS:
        raise HTTPException(422, detail={"code": "area_too_large", "message": f"At most {MAX_CELLS} r6 cells"})
    item = {"id": uuid.uuid4().hex[:12], "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "name": body.name, "area": params, "area_cells": len(cells), "chat_id": body.chat_id,
            "min_index": body.min_index, "min_anomaly_ratio": body.min_anomaly_ratio, "lang": body.lang,
            "approved": False, "approved_at": None}
    try:
        with locked():
            items = load()
            if len(items) >= MAX_SUBSCRIPTIONS:
                raise HTTPException(409, detail={"code": "subscriptions_full", "message": "Subscription store is full"})
            items.append(item)
            save(items)
    except OSError as exc:
        raise HTTPException(503, detail={"code": "state_unwritable", "message": "FIRELY_STATE_DIR is not writable"}) from exc
    return {"attribution": ATTRIBUTION, "subscription": public(item),
            "note": "Pendiente de aprobación humana: el operador la aprueba en el servidor antes de cualquier envío. "
                    "Los mensajes van marcados como ejercicio/prueba."}


@router.get("/subscriptions")
def list_subscriptions():
    return {"attribution": ATTRIBUTION, "rows": [public(i) for i in load()]}


@router.get("/subscriptions/{sub_id}/preview")
def preview_subscription(sub_id: str):
    """Evaluate a subscription NOW with the real data and return the exact message the daily job would send.
    Sends nothing: it lets an operator (or a demo) check the alert without Telegram or shell access."""
    from ai.intent import setting
    from pipeline import alerts_job  # imported here: alerts_job imports this module
    item = next((i for i in load() if i.get("id") == sub_id), None)
    if item is None:
        raise HTTPException(404, "Subscription not found")
    ev = alerts_job.evaluate(item)
    approved, telegram = bool(item.get("approved")), bool(setting("TELEGRAM_BOT_TOKEN"))
    if not ev["triggered"]:
        status = "below_threshold"
    elif not item.get("chat_id"):
        status = "no_chat"
    elif not approved:
        status = "pending_approval"
    elif not telegram:
        status = "telegram_not_configured"
    else:
        status = "would_send"
    return {"attribution": ATTRIBUTION, "subscription": public(item), "evaluation": ev, "status": status,
            "message": alerts_job.message(item, ev), "sent": False,
            "note": "Vista previa: no se envió nada. El trabajo diario (06:30 UTC) envía solo si el umbral se cumple, "
                    "la suscripción está aprobada y el bot de Telegram está configurado."}


@router.delete("/subscriptions/{sub_id}")
def delete_subscription(sub_id: str):
    try:
        with locked():
            items = load()
            kept = [i for i in items if i.get("id") != sub_id]
            if len(kept) == len(items):
                raise HTTPException(404, "Subscription not found")
            save(kept)
    except OSError as exc:
        raise HTTPException(503, detail={"code": "state_unwritable", "message": "FIRELY_STATE_DIR is not writable"}) from exc
    return {"deleted": sub_id}
