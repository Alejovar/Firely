"""Weekly watch bulletin (§11.2 "Agente vigía con boletín semanal"). Idempotent: meant for a weekly cron.

For each subscription in ``FIRELY_STATE_DIR/subscriptions.json`` that an operator approved
(``python -m pipeline.alerts_job --approve <id>``):

1. asks the Firely API for the bulletin of the subscription's area (``GET /bulletin``, over HTTP, the same template
   the app and the MCP server use; figures come from the harmonized series, nothing is computed here);
2. formats it as a Telegram message marked as an EXERCISE/TEST, with NASA FIRMS attribution, methodology version
   and data cutoff;
3. sends it by Telegram only when ``TELEGRAM_BOT_TOKEN`` is set and ``--dry-run`` is not given; otherwise it only logs.

Each (subscription, ISO week) is sent at most once (``bulletin_sent.json``); every evaluation is appended to
``bulletin_log.jsonl`` without the chat id or the message text.

    python -m pipeline.bulletin_job               # inside the api container (API at http://127.0.0.1:8000)
    python -m pipeline.bulletin_job --dry-run     # fetch and log only, never send
    python -m pipeline.bulletin_job --api-url http://127.0.0.1:8000 --print   # also print the messages
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

PREFIX = {"es": "[EJERCICIO / PRUEBA] Boletín semanal del vigía de Firely; no es una alerta oficial.",
          "en": "[EXERCISE / TEST] Firely weekly watch bulletin; not an official alert.",
          "pt": "[EXERCÍCIO / TESTE] Boletim semanal do vigia do Firely; não é um alerta oficial."}
AREA_KEYS = ("h3", "bbox", "lat", "lon", "radius_km", "admin")
TELEGRAM_LIMIT = 4000  # Telegram accepts 4096 characters per message


def state_root() -> Path:
    return Path(os.environ.get("FIRELY_STATE_DIR") or os.environ.get("FIRELY_DATA_PROCESSED", "data/processed"))


def _sent_path() -> Path:
    return state_root() / "bulletin_sent.json"


def _log(entry: dict) -> None:
    path = state_root() / "bulletin_log.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _load_json(path: Path, default):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default
    return data if isinstance(data, type(default)) else default


def _save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def subscriptions() -> list[dict]:
    """Same store as POST /subscriptions (api.app.subscriptions_routes), read without importing the API."""
    items = _load_json(state_root() / "subscriptions.json", [])
    return [i for i in items if isinstance(i, dict)]


def week_key(today: date | None = None) -> str:
    y, w, _ = (today or datetime.now(timezone.utc).date()).isocalendar()
    return f"{y}-W{w:02d}"


def api_url(explicit: str | None = None) -> str:
    return (explicit or os.environ.get("FIRELY_API_URL") or "http://127.0.0.1:8000").rstrip("/")


def fetch_bulletin(base: str, area: dict, timeout: float = 120) -> dict:
    """GET /bulletin for an area. Raises RuntimeError with a short reason (never the URL's secrets: there are none)."""
    import httpx
    params = {k: area[k] for k in AREA_KEYS if area.get(k) is not None}
    try:
        r = httpx.get(base + "/bulletin", params=params, timeout=timeout)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"API unreachable ({type(exc).__name__})") from exc
    if r.status_code != 200:
        raise RuntimeError(f"API {r.status_code}")
    body = r.json()
    if not isinstance(body, dict) or not isinstance(body.get("sections"), list):
        raise RuntimeError("unexpected /bulletin response")
    return body


def message(sub: dict, bulletin: dict) -> str:
    """Plain-text message. Every figure is copied verbatim from the /bulletin template."""
    lines = [PREFIX.get(sub.get("lang"), PREFIX["es"]), f"Área: {sub.get('name') or sub.get('id')}",
             str(bulletin.get("title") or "Boletín semanal"), ""]
    for section in bulletin.get("sections") or []:
        if not isinstance(section, dict):
            continue
        heading = section.get("heading")
        if heading == "Aviso":
            continue  # replaced by the exercise prefix and the footer
        lines.append(f"■ {heading}")
        items = section.get("items")
        if isinstance(items, list) and items:
            lines += [f"- {i.get('name')}: {i.get('text')}" for i in items if isinstance(i, dict)]
        elif section.get("text"):
            lines.append(str(section["text"]))
        lines.append("")
    lines.append("Boletín generado por plantilla a partir de la serie armonizada; las estimaciones 2001-2011 "
                 "tienen incertidumbre.")
    lines.append(f"Fuente: {bulletin.get('attribution') or 'NASA FIRMS'} · methodology_version "
                 f"{bulletin.get('methodology_version') or 'no disponible'} · corte "
                 f"{bulletin.get('data_cutoff') or 'no disponible'}")
    lines.append(f"Para dejar de recibir estos ejercicios, pide al operador la baja de la suscripción {sub.get('id')}.")
    text = "\n".join(lines)
    return text if len(text) <= TELEGRAM_LIMIT else text[:TELEGRAM_LIMIT - 1] + "…"


def _telegram(token: str):
    from bot.client import TelegramClient
    return TelegramClient(token)


def _token() -> str | None:
    try:
        from bot.client import setting
        return setting("TELEGRAM_BOT_TOKEN") or None
    except ImportError:
        return os.environ.get("TELEGRAM_BOT_TOKEN") or None


def run(*, dry_run: bool = False, telegram=None, token: str | None = None, fetch=None, base: str | None = None,
        today: date | None = None) -> list[dict]:
    """Fetch and send the bulletin of every approved subscription; returns the log entries (with `message`).
    `telegram` and `fetch(base, area)` are injectable for tests."""
    if token is None and telegram is None:
        token = _token()
    send_enabled = not dry_run and (telegram is not None or bool(token))
    fetch = fetch or fetch_bulletin
    base = api_url(base)
    week = week_key(today)
    sent = _load_json(_sent_path(), {})
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    results = []
    for sub in subscriptions():
        entry = {"ts": now, "week": week, "subscription": sub.get("id"), "name": sub.get("name")}
        key = f"{sub.get('id')}|{week}"
        if not sub.get("approved"):
            entry["status"] = "pending_approval"
        elif key in sent:
            entry["status"] = "already_sent"
        else:
            try:
                bulletin = fetch(base, sub.get("area") or {})
            except RuntimeError as exc:
                entry.update(status="skipped", reason=str(exc))
            else:
                text = message(sub, bulletin)
                entry.update(data_cutoff=bulletin.get("data_cutoff"),
                             methodology_version=bulletin.get("methodology_version"), message=text)
                if not send_enabled:
                    entry["status"] = "dry_run"
                else:
                    try:
                        (telegram or _telegram(token)).send_message(sub["chat_id"], text)
                        entry["status"] = "sent"
                        sent[key] = {"ts": now}
                        _save_json(_sent_path(), sent)
                    except Exception as exc:  # network or Telegram error: log it without the token or the chat id
                        entry.update(status="error", reason=type(exc).__name__)
        results.append(entry)
        _log({k: v for k, v in entry.items() if k != "message"})
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="fetch and log only, never send")
    parser.add_argument("--api-url", default=None, help="Firely API base URL (default $FIRELY_API_URL or http://127.0.0.1:8000)")
    parser.add_argument("--print", dest="show", action="store_true", help="also print each message text")
    args = parser.parse_args()
    if not args.dry_run and not _token():
        print("TELEGRAM_BOT_TOKEN no está definido: modo dry-run (solo se registra).", file=sys.stderr)
    for entry in run(dry_run=args.dry_run, base=args.api_url):
        print(json.dumps({k: v for k, v in entry.items() if k != "message"}, ensure_ascii=False))
        if args.show and entry.get("message"):
            print(entry["message"] + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
