"""Long-polling Telegram interface to Firely's read-only API.

Run with ``.venv/bin/python -m bot.telegram_bot``.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import httpx

from .client import APIError, FirelyClient, TelegramClient, ROOT, setting
from .render import calendar_png


STATE_PATH = ROOT / "data" / "interim" / "bot_state.json"
LANGS = {"es", "en", "pt"}
WORDS = {
    "es": {"help": "Comandos: /calendario <lugar> [año], /temporada <lugar>, /incendios <lugar>, /lang es|en|pt, /ayuda.",
           "welcome": "Firely: calendario de actividad de quemas.\n", "usage": "Indica un lugar. Ejemplo: /calendario Arteaga 2021",
           "unknown": "Comando no reconocido. Usa /ayuda.", "choice": "Elige un lugar respondiendo con su número:",
           "bad_choice": "Responde con uno de los números de la lista.", "not_found": "No se encontró el lugar.",
           "bad_area": "La API no devolvió una caja geográfica válida para este lugar.",
           "down": "La API de Firely no está disponible ahora. Intenta más tarde.",
           "slow": "Espera un momento antes de enviar otra consulta.", "lang": "Idioma cambiado a español.",
           "no_data": "No hay datos disponibles para este lugar y periodo.",
           "peak": "Mes con mayor actividad", "latest": "Último mes", "anomaly": "anomalía", "return": "periodo de retorno",
           "unavailable": "no disponible", "years": "años", "events": "Incendios principales", "season": "Temporada",
           "simulated": "Datos simulados de la API de desarrollo."},
    "en": {"help": "Commands: /calendario <place> [year], /temporada <place>, /incendios <place>, /lang es|en|pt, /ayuda.",
           "welcome": "Firely: fire activity calendar.\n", "usage": "Enter a place. Example: /calendario Arteaga 2021",
           "unknown": "Unknown command. Use /ayuda.", "choice": "Choose a place by replying with its number:",
           "bad_choice": "Reply with a number from the list.", "not_found": "Place not found.",
           "bad_area": "The API did not return a valid bounding box for this place.",
           "down": "The Firely API is unavailable. Try again later.",
           "slow": "Please wait before sending another request.", "lang": "Language changed to English.",
           "no_data": "No data available for this place and period.",
           "peak": "Peak activity month", "latest": "Latest month", "anomaly": "anomaly", "return": "return period",
           "unavailable": "unavailable", "years": "years", "events": "Top fire events", "season": "Season",
           "simulated": "Simulated data from the development API."},
    "pt": {"help": "Comandos: /calendario <lugar> [ano], /temporada <lugar>, /incendios <lugar>, /lang es|en|pt, /ayuda.",
           "welcome": "Firely: calendário de atividade do fogo.\n", "usage": "Informe um lugar. Exemplo: /calendario Arteaga 2021",
           "unknown": "Comando desconhecido. Use /ayuda.", "choice": "Escolha um lugar respondendo com o número:",
           "bad_choice": "Responda com um número da lista.", "not_found": "Lugar não encontrado.",
           "bad_area": "A API não retornou uma caixa geográfica válida para este lugar.",
           "down": "A API Firely está indisponível. Tente mais tarde.",
           "slow": "Aguarde antes de enviar outra consulta.", "lang": "Idioma alterado para português.",
           "no_data": "Não há dados para este lugar e período.",
           "peak": "Mês de maior atividade", "latest": "Último mês", "anomaly": "anomalia", "return": "período de retorno",
           "unavailable": "indisponível", "years": "anos", "events": "Principais incêndios", "season": "Temporada",
           "simulated": "Dados simulados da API de desenvolvimento."},
}
MONTHS = {
    "es": "ene feb mar abr may jun jul ago sep oct nov dic".split(),
    "en": "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(),
    "pt": "jan fev mar abr mai jun jul ago set out nov dez".split(),
}


def parse_command(text: str) -> tuple[str | None, str, int | None]:
    match = re.fullmatch(r"\s*/([a-zA-Z]+)(?:@[\w_]+)?(?:\s+(.*?))?\s*", text, re.S)
    if not match:
        return None, text.strip(), None
    command, argument = match.group(1).lower(), (match.group(2) or "").strip()
    year = None
    if command == "calendario":
        year_match = re.fullmatch(r"(.*?)\s+(\d{4})", argument, re.S)
        if year_match:
            argument, year = year_match.group(1).strip(), int(year_match.group(2))
    return command, argument, year


def footer(envelope: dict | None) -> str:
    envelope = envelope or {}
    return ("Fuente: NASA FIRMS · metodología "
            f"{envelope.get('methodology_version') or 'no disponible'} · datos hasta "
            f"{envelope.get('data_cutoff') or 'no disponible'}")


def _bbox(candidate: dict) -> str | None:
    box = candidate.get("bbox")
    if isinstance(box, (list, tuple)) and len(box) == 4:
        box = ",".join(str(x) for x in box)
    if not isinstance(box, str):
        return None
    try:
        west, south, east, north = [float(x) for x in box.split(",")]
    except ValueError:
        return None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        return None
    return box


class Bot:
    def __init__(self, telegram: TelegramClient, api: FirelyClient, *, state_path: Path = STATE_PATH,
                 min_interval: float = 1.0, clock=time.monotonic):
        self.telegram, self.api = telegram, api
        self.state_path, self.min_interval, self.clock = state_path, min_interval, clock
        self.last_request: dict[str, float] = {}
        self.last_envelope: dict | None = None
        try:
            self.state = json.loads(state_path.read_text(encoding="utf-8"))
            if not isinstance(self.state, dict):
                self.state = {}
        except (FileNotFoundError, OSError, ValueError):
            self.state = {}

    def _save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(self.state, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.state_path)

    def _metadata(self) -> dict:
        if self.last_envelope is None:
            try:
                self.last_envelope = self.api.metadata()
            except APIError:
                return {}
        return self.last_envelope

    def _send(self, chat_id: int, message: str, envelope: dict | None = None) -> None:
        self.telegram.send_message(chat_id, message + "\n\n" + footer(envelope if envelope is not None else self._metadata()))

    def handle_update(self, update: dict) -> None:
        message = update.get("message") or {}
        if not isinstance(message.get("text"), str) or not isinstance(message.get("chat"), dict):
            return
        chat_id = message["chat"].get("id")
        if not isinstance(chat_id, int):
            return
        key = str(chat_id)
        record = self.state.setdefault(key, {"lang": "es"})
        lang = record.get("lang", "es") if record.get("lang") in LANGS else "es"
        words = WORDS[lang]
        command, argument, year = parse_command(message["text"])
        pending = record.get("pending")
        is_choice = command is None and pending is not None
        now = self.clock()
        if not is_choice and now - self.last_request.get(key, float("-inf")) < self.min_interval:
            self._send(chat_id, words["slow"])
            return
        self.last_request[key] = now
        if is_choice:
            try:
                index = int(argument) - 1
                candidate = pending["candidates"][index]
                if index < 0:
                    raise IndexError
            except (ValueError, TypeError, IndexError, KeyError):
                self._send(chat_id, words["bad_choice"], pending.get("envelope"))
                return
            record.pop("pending", None)
            self._save()
            self._fetch(chat_id, lang, pending["command"], candidate, pending.get("year"))
            return
        if command == "lang":
            if argument not in LANGS:
                self._send(chat_id, "/lang es|en|pt")
                return
            record["lang"] = argument
            self._save()
            self._send(chat_id, WORDS[argument]["lang"])
            return
        if command in {"start", "ayuda", "help"}:
            self._send(chat_id, (words["welcome"] if command == "start" else "") + words["help"])
            return
        if command not in {"calendario", "temporada", "incendios"}:
            self._send(chat_id, words["unknown"])
            return
        if not argument:
            self._send(chat_id, words["usage"])
            return
        try:
            resolved = self.api.resolve(argument, lang)
        except APIError:
            self._send(chat_id, words["down"], {})
            return
        self.last_envelope = resolved
        candidates = resolved.get("candidates") or []
        if not isinstance(candidates, list) or not candidates:
            self._send(chat_id, words["not_found"], resolved)
            return
        if resolved.get("ambiguous") or len(candidates) > 1:
            record["pending"] = {"command": command, "year": year, "candidates": candidates,
                                 "envelope": {"methodology_version": resolved.get("methodology_version"),
                                              "data_cutoff": resolved.get("data_cutoff")}}
            self._save()
            choices = "\n".join(f"{i}. {item.get('label') or '?'}" for i, item in enumerate(candidates, 1))
            self._send(chat_id, words["choice"] + "\n" + choices, resolved)
            return
        self._fetch(chat_id, lang, command, candidates[0], year)

    def _fetch(self, chat_id: int, lang: str, command: str, candidate: dict, year: int | None) -> None:
        words = WORDS[lang]
        bbox = _bbox(candidate)
        if bbox is None:
            self._send(chat_id, words["bad_area"])
            return
        label = candidate.get("label") or ""
        try:
            if command == "calendario":
                result = self.api.calendar(bbox, year)
            elif command == "temporada":
                result = self.api.season(bbox)
            else:
                result = self.api.events(bbox)
        except APIError:
            self._send(chat_id, words["down"], {})
            return
        self.last_envelope = result
        prefix = (words["simulated"] + "\n") if result.get("mock") else ""
        if command == "calendario":
            rows = [r for r in result.get("rows", []) if isinstance(r, dict) and
                    isinstance(r.get("year"), int) and isinstance(r.get("month"), int) and
                    1 <= r["month"] <= 12]
            if not rows:
                self._send(chat_id, prefix + words["no_data"], result)
                return
            monthly: dict[int, list[float]] = {}
            for row in rows:
                value = row.get("count_harm")
                if isinstance(value, (int, float)):
                    monthly.setdefault(row["month"], []).append(value)
            peak = max(monthly, key=lambda m: sum(monthly[m]) / len(monthly[m])) if monthly else None
            latest = max(rows, key=lambda r: (r["year"], r["month"]))
            fmt = lambda value: f"{value:g}" if isinstance(value, (int, float)) else words["unavailable"]
            latest_label = f"{MONTHS[lang][latest['month'] - 1]} {latest['year']}"
            query = {"bbox": bbox}
            if year is not None:
                query.update({"from": f"{year}-01-01", "to": f"{year}-12-31"})
            summary = (f"{prefix}{label}\n{words['peak']}: {MONTHS[lang][peak - 1] if peak else words['unavailable']}\n"
                       f"{words['latest']}: {latest_label} · {words['anomaly']}: {fmt(latest.get('anomaly_ratio'))}×"
                       f" · {words['return']}: {fmt(latest.get('return_period_years'))} {words['years']}"
                       f"\nVer datos: {self.api.query_url('/calendar', query)}")
            self._send(chat_id, summary, result)
            try:
                png = calendar_png(result, label)
            except ValueError:
                return
            self.telegram.send_photo(chat_id, png, footer(result))
        elif command == "temporada":
            summary = result.get("summary_es")
            self._send(chat_id, prefix + f"{words['season']} · {label}\n" +
                       (str(summary) if summary else words["no_data"]) +
                       f"\nVer datos: {self.api.query_url('/season', {'bbox': bbox})}", result)
        else:
            events = result.get("rows") or []
            if not events:
                self._send(chat_id, prefix + words["no_data"], result)
                return
            ranked = sorted(events, key=lambda r: r.get("rank") if isinstance(r.get("rank"), (int, float)) else float("inf"))[:3]
            lines = [prefix + f"{words['events']} · {label}"]
            for event in ranked:
                date = event.get("start_date") or words["unavailable"]
                count = event.get("n_hotspots_harm")
                detail = f" · {count:g} VIIRS-eq" if isinstance(count, (int, float)) else ""
                lines.append(f"{event.get('rank') or len(lines)}. {date}{detail}")
            lines.append(f"Ver datos: {self.api.query_url('/events', {'bbox': bbox})}")
            self._send(chat_id, "\n".join(lines), result)

    def run(self) -> None:
        self.telegram.set_commands([
            {"command": "start", "description": "Firely"},
            {"command": "ayuda", "description": "Ayuda / Help / Ajuda"},
            {"command": "calendario", "description": "Calendario de fuego"},
            {"command": "temporada", "description": "Temporada"},
            {"command": "incendios", "description": "Eventos principales"},
            {"command": "lang", "description": "es / en / pt"},
        ])
        offset = None
        while True:
            try:
                updates = self.telegram.get_updates(offset=offset)
                for update in updates:
                    offset = max(offset or 0, update["update_id"] + 1)
                    self.handle_update(update)
            except (httpx.HTTPError, APIError, OSError, KeyError):
                time.sleep(3)


def main() -> int:
    token = setting("TELEGRAM_BOT_TOKEN")
    if not token:
        print("TELEGRAM_BOT_TOKEN is missing. Set it in the environment or repo-root .env to run the bot.")
        return 1
    Bot(TelegramClient(token), FirelyClient()).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
