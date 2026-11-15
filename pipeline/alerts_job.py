"""Daily job for alert subscriptions (§10.1). Idempotent: meant for cron, safe to run several times a day.

For each subscription in ``FIRELY_STATE_DIR/subscriptions.json`` (created through ``POST /subscriptions``):

1. evaluates the area with the real priority index (``/risk``) and the harmonized anomaly of the latest month
   (count / median of the same calendar month in the other years);
2. if the index reaches ``min_index`` or the anomaly reaches ``min_anomaly_ratio``, prepares a message marked as an
   EXERCISE/TEST;
3. sends it by Telegram (``bot.client.TelegramClient``) only when the subscription was approved by an operator and
   ``TELEGRAM_BOT_TOKEN`` is set; otherwise it only logs (dry run / pending approval).

Each (subscription, data period) is sent at most once (``alerts_sent.json``); every evaluation is appended to
``alerts_log.jsonl``. Figures come from the harmonized series; nothing is invented.

    .venv/bin/python -m pipeline.alerts_job               # evaluate and send what is due
    .venv/bin/python -m pipeline.alerts_job --dry-run     # evaluate and log only
    .venv/bin/python -m pipeline.alerts_job --list
    .venv/bin/python -m pipeline.alerts_job --approve <id>   # human approval (needs shell access to the server)
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from datetime import datetime, timezone

from fastapi import HTTPException

from api.app import db, extra_routes
from api.app import subscriptions_routes as subs
from api.app.real import ATTRIBUTION, VERSION, _cutoff

PREFIX = {"es": "[EJERCICIO / PRUEBA] Mensaje de prueba de Firely; no es una alerta oficial.",
          "en": "[EXERCISE / TEST] Firely test message; not an official alert.",
          "pt": "[EXERCÍCIO / TESTE] Mensagem de teste do Firely; não é um alerta oficial."}


def _sent_path():
    return db.state_root() / "alerts_sent.json"


def _log(entry: dict) -> None:
    path = db.state_root() / "alerts_log.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _load_sent() -> dict:
    try:
        data = json.loads(_sent_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _area_args(area: dict) -> dict:
    return {"h3": area.get("h3"), "bbox": area.get("bbox"), "lat": area.get("lat"), "lon": area.get("lon"),
            "radius_km": area.get("radius_km"), "admin": area.get("admin")}


def anomaly_ratio(area: dict):
    """(ratio, current, median, (year, month)) of the latest harmonized month; ratio None without a usable median."""
    args = _area_args(area)
    cells, _ = extra_routes._area(args["h3"], args["bbox"], args["lat"], args["lon"], args["radius_km"], args["admin"], None)
    rows = extra_routes._months(cells)
    latest = extra_routes._period(rows)
    if latest is None:
        return None, None, None, None
    current = next(v for y, m, v in rows if (y, m) == latest) or 0.0
    refs = [v or 0.0 for y, m, v in rows if m == latest[1] and y != latest[0]]
    median = statistics.median(refs) if refs else None
    return (current / median if median else None), current, median, latest


def evaluate(sub: dict) -> dict:
    risk = extra_routes.risk(**_area_args(sub["area"]))
    ratio, current, median, _ = anomaly_ratio(sub["area"])
    reasons = []
    if risk["index"] >= sub.get("min_index", 55):
        reasons.append("index")
    if sub.get("min_anomaly_ratio") and ratio is not None and ratio >= sub["min_anomaly_ratio"]:
        reasons.append("anomaly")
    return {"period": risk["period"], "index": risk["index"], "level": risk["level"], "summary_es": risk["summary_es"],
            "anomaly_ratio": None if ratio is None else round(ratio, 2), "current": current, "median": median,
            "triggered": bool(reasons), "reasons": reasons, "data_cutoff": risk.get("data_cutoff")}


def message(sub: dict, ev: dict) -> str:
    year, month = map(int, ev["period"].split("-"))
    lines = [PREFIX.get(sub.get("lang"), PREFIX["es"]), f"Área: {sub['name']}", ev["summary_es"]]
    if ev["anomaly_ratio"] is not None:
        lines.append(f"Anomalía de {extra_routes.MONTHS[month-1].lower()} {year}: {ev['anomaly_ratio']:.1f}× la mediana "
                     f"del mismo mes ({ev['current']:.1f} frente a {ev['median']:.1f} detecciones equivalentes).")
    base = os.environ.get("FIRELY_PUBLIC_URL", "").rstrip("/")
    if base:
        from urllib.parse import urlencode
        lines.append(f"Ver datos: {base}/risk?{urlencode(subs.area_params(sub['area']))}")
    lines.append(f"Fuente: {ATTRIBUTION} · methodology_version {VERSION} · corte {ev['data_cutoff'] or _cutoff()}")
    lines.append(f"Para dejar de recibir estos ejercicios, pide al operador la baja de la suscripción {sub['id']}.")
    return "\n".join(lines)


def _telegram(token):
    from bot.client import TelegramClient
    return TelegramClient(token)


def run(*, dry_run: bool = False, telegram=None, token: str | None = None) -> list[dict]:
    """Evaluate every subscription; returns the log entries. `telegram` is injectable for tests."""
    if token is None and telegram is None:
        from bot.client import setting
        token = setting("TELEGRAM_BOT_TOKEN") or None
    send_enabled = not dry_run and (telegram is not None or bool(token))
    sent = _load_sent()
    results = []
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for sub in subs.load():
        entry = {"ts": now, "subscription": sub.get("id"), "name": sub.get("name")}
        try:
            ev = evaluate(sub)
        except HTTPException as exc:
            entry.update(status="skipped", reason=str(exc.detail))
            results.append(entry)
            _log(entry)
            continue
        entry.update({k: ev[k] for k in ("period", "index", "level", "anomaly_ratio", "reasons")})
        key = f"{sub['id']}|{ev['period']}"
        if not ev["triggered"]:
            entry["status"] = "below_threshold"
        elif key in sent:
            entry["status"] = "already_sent"
        elif not sub.get("approved"):
            entry["status"] = "pending_approval"
        elif not send_enabled:
            entry["status"] = "dry_run"
            entry["message"] = message(sub, ev)
        else:
            try:
                client = telegram or _telegram(token)
                client.send_message(sub["chat_id"], message(sub, ev))
                entry["status"] = "sent"
                sent[key] = {"ts": now, "index": ev["index"]}
                subs.save_json(_sent_path(), sent)
            except Exception as exc:  # network or Telegram error: log it without the token or the chat id
                entry.update(status="error", reason=type(exc).__name__)
        results.append(entry)
        _log({k: v for k, v in entry.items() if k != "message"})
    return results


def approve(sub_id: str) -> bool:
    with subs.locked():
        items = subs.load()
        for item in items:
            if item.get("id") == sub_id:
                item["approved"] = True
                item["approved_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                subs.save(items)
                return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="evaluate and log only, never send")
    parser.add_argument("--approve", metavar="ID", help="approve a subscription for exercise messages")
    parser.add_argument("--list", action="store_true", help="list subscriptions (chat ids masked)")
    args = parser.parse_args()
    if args.approve:
        ok = approve(args.approve)
        print("aprobada" if ok else "no existe", args.approve)
        return 0 if ok else 1
    if args.list:
        for item in subs.load():
            print(json.dumps(subs.public(item), ensure_ascii=False))
        return 0
    from bot.client import setting
    if not args.dry_run and not setting("TELEGRAM_BOT_TOKEN"):
        print("TELEGRAM_BOT_TOKEN no está definido: modo dry-run (solo se registra).", file=sys.stderr)
    for entry in run(dry_run=args.dry_run):
        print(json.dumps({k: v for k, v in entry.items() if k != "message"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
