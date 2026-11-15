"""Long-polling Telegram interface to Firely's read-only API.

Run with ``.venv/bin/python -m bot.telegram_bot``.
"""

from __future__ import annotations

import json
import math
import os
import re
import time
from pathlib import Path

import httpx

from .client import APIError, FirelyClient, TelegramClient, ROOT, setting
from .render import calendar_png
from . import stt


def default_state_path() -> Path:
    """Chat preferences (language, pending choice, last location). In Docker: the writable /state volume."""
    state_dir = os.environ.get("FIRELY_STATE_DIR")
    return Path(state_dir) / "bot" / "bot_state.json" if state_dir else ROOT / "data" / "interim" / "bot_state.json"


STATE_PATH = default_state_path()
LANGS = {"es", "en", "pt"}
WORDS = {
    "es": {"start": "Tu chat_id es: {chat_id}\nLo necesitas para suscribirte a las alertas de ejercicio de Firely: en la web (Plataforma › Alertas) o con POST /api/subscriptions indica este chat_id, el área y el umbral. Un operador revisa y aprueba cada suscripción antes de cualquier envío, y todos los mensajes van marcados EJERCICIO / PRUEBA (no son alertas oficiales). Para darte de baja, pide al operador que borre la suscripción.\n",
           "help": "Comandos: /calendario <lugar> [año], /temporada <lugar>, /incendios <lugar>, /semaforo <lugar>, /pronostico <lugar>, /hoy <lugar>, /lang es|en|pt, /ayuda. También puedes escribir o mandar una nota de voz (¿cómo va la temporada en Arteaga?) o compartir tu ubicación.",
           "welcome": "Firely: calendario de actividad de quemas.\n", "usage": "Indica un lugar. Ejemplo: /calendario Arteaga 2021",
           "unknown": "Comando no reconocido. Usa /ayuda.", "choice": "Elige un lugar respondiendo con su número:",
           "bad_choice": "Responde con uno de los números de la lista.", "not_found": "No se encontró el lugar.",
           "bad_area": "La API no devolvió una caja geográfica válida para este lugar.",
           "down": "La API de Firely no está disponible ahora. Intenta más tarde.",
           "slow": "Espera un momento antes de enviar otra consulta.", "lang": "Idioma cambiado a español.",
           "no_data": "No hay datos disponibles para este lugar y periodo.",
           "peak": "Mes con mayor actividad", "latest": "Último mes", "anomaly": "anomalía", "return": "periodo de retorno",
           "unavailable": "no disponible", "years": "años", "events": "Incendios principales", "season": "Temporada",
           "simulated": "Datos simulados de la API de desarrollo.", "heard": "Entendí", "no_voice": "No puedo transcribir notas de voz en este servidor. Escribe tu pregunta, por ejemplo: incendios en Arteaga en marzo de 2021.", "voice_error": "No pude descargar o entender la nota de voz. Intenta de nuevo o escribe la pregunta.", "here": "Tu ubicación (±25 km)", "priority": "Prioridad", "recent": "Detecciones de las últimas 24 h", "recent_none": "Sin detecciones en las últimas 24 h.", "recent_off": "La capa de detecciones recientes no está disponible en este servidor.", "no_location": "Indica un lugar o comparte tu ubicación.", "point": "Un punto de calor es una detección satelital, no un incendio confirmado.", "outlook": "Perspectiva 1-3 meses", "expected": "esperadas", "normal": "normal", "outlook_clim": "aquí el modelo no supera a lo normal; se muestra lo normal", "issued": "Con datos hasta", "outlook_note": "Actividad esperada (detecciones armonizadas), no dónde empieza un incendio."},
    "en": {"start": "Your chat_id is: {chat_id}\nYou need it to subscribe to Firely exercise alerts: on the web (Platform › Alerts) or with POST /api/subscriptions, give this chat_id, the area and the threshold. An operator reviews and approves each subscription before anything is sent, and every message is marked EXERCISE / TEST (not an official alert). To unsubscribe, ask the operator to delete the subscription.\n",
           "help": "Commands: /calendario <place> [year], /temporada <place>, /incendios <place>, /semaforo <place>, /pronostico <place>, /hoy <place>, /lang es|en|pt, /ayuda. You can also type or send a voice note (how is the season in Arteaga?) or share your location.",
           "welcome": "Firely: fire activity calendar.\n", "usage": "Enter a place. Example: /calendario Arteaga 2021",
           "unknown": "Unknown command. Use /ayuda.", "choice": "Choose a place by replying with its number:",
           "bad_choice": "Reply with a number from the list.", "not_found": "Place not found.",
           "bad_area": "The API did not return a valid bounding box for this place.",
           "down": "The Firely API is unavailable. Try again later.",
           "slow": "Please wait before sending another request.", "lang": "Language changed to English.",
           "no_data": "No data available for this place and period.",
           "peak": "Peak activity month", "latest": "Latest month", "anomaly": "anomaly", "return": "return period",
           "unavailable": "unavailable", "years": "years", "events": "Top fire events", "season": "Season",
           "simulated": "Simulated data from the development API.", "heard": "I understood", "no_voice": "This server cannot transcribe voice notes. Type your question, e.g. fires in Arteaga in March 2021.", "voice_error": "I could not download or understand the voice note. Try again or type the question.", "here": "Your location (±25 km)", "priority": "Priority", "recent": "Detections in the last 24 h", "recent_none": "No detections in the last 24 h.", "recent_off": "The recent-detections layer is not available on this server.", "no_location": "Name a place or share your location.", "point": "A hotspot is a satellite detection, not a confirmed fire.", "outlook": "1-3 month outlook", "expected": "expected", "normal": "normal", "outlook_clim": "the model does not beat normal here; showing normal", "issued": "Data up to", "outlook_note": "Expected activity (harmonized detections), not where a fire will start."},
    "pt": {"start": "Seu chat_id é: {chat_id}\nVocê precisa dele para assinar os alertas de exercício do Firely: na web (Plataforma › Alertas) ou com POST /api/subscriptions, informe este chat_id, a área e o limiar. Um operador revisa e aprova cada assinatura antes de qualquer envio, e todas as mensagens são marcadas EXERCÍCIO / TESTE (não são alertas oficiais). Para cancelar, peça ao operador que apague a assinatura.\n",
           "help": "Comandos: /calendario <lugar> [ano], /temporada <lugar>, /incendios <lugar>, /semaforo <lugar>, /pronostico <lugar>, /hoy <lugar>, /lang es|en|pt, /ayuda. Você também pode escrever ou mandar um áudio (como está a temporada em Arteaga?) ou compartilhar sua localização.",
           "welcome": "Firely: calendário de atividade do fogo.\n", "usage": "Informe um lugar. Exemplo: /calendario Arteaga 2021",
           "unknown": "Comando desconhecido. Use /ayuda.", "choice": "Escolha um lugar respondendo com o número:",
           "bad_choice": "Responda com um número da lista.", "not_found": "Lugar não encontrado.",
           "bad_area": "A API não retornou uma caixa geográfica válida para este lugar.",
           "down": "A API Firely está indisponível. Tente mais tarde.",
           "slow": "Aguarde antes de enviar outra consulta.", "lang": "Idioma alterado para português.",
           "no_data": "Não há dados para este lugar e período.",
           "peak": "Mês de maior atividade", "latest": "Último mês", "anomaly": "anomalia", "return": "período de retorno",
           "unavailable": "indisponível", "years": "anos", "events": "Principais incêndios", "season": "Temporada",
           "simulated": "Dados simulados da API de desenvolvimento.", "heard": "Entendi", "no_voice": "Este servidor não transcreve áudios. Escreva sua pergunta, por exemplo: incêndios em Arteaga em março de 2021.", "voice_error": "Não consegui baixar ou entender o áudio. Tente de novo ou escreva a pergunta.", "here": "Sua localização (±25 km)", "priority": "Prioridade", "recent": "Detecções das últimas 24 h", "recent_none": "Sem detecções nas últimas 24 h.", "recent_off": "A camada de detecções recentes não está disponível neste servidor.", "no_location": "Informe um lugar ou compartilhe sua localização.", "point": "Um ponto de calor é uma detecção de satélite, não um incêndio confirmado.", "outlook": "Perspectiva 1-3 meses", "expected": "esperadas", "normal": "normal", "outlook_clim": "aqui o modelo não supera o normal; mostra-se o normal", "issued": "Dados até", "outlook_note": "Atividade esperada (detecções harmonizadas), não onde um incêndio vai começar."},
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


def location_bbox(lat, lon, km: float = 25.0) -> str | None:
    """Box of about `km` around a location shared in Telegram. The point comes from the user, never from a model."""
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    d_lat = km / 111.0
    d_lon = d_lat / max(0.2, math.cos(math.radians(lat)))
    return f"{max(-180, lon - d_lon):.4f},{max(-90, lat - d_lat):.4f},{min(180, lon + d_lon):.4f},{min(90, lat + d_lat):.4f}"


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
        if not isinstance(message.get("chat"), dict):
            return
        chat_id = message["chat"].get("id")
        if not isinstance(chat_id, int):
            return
        key = str(chat_id)
        record = self.state.setdefault(key, {"lang": "es"})
        lang = record.get("lang", "es") if record.get("lang") in LANGS else "es"
        words = WORDS[lang]
        location = message.get("location")
        if isinstance(location, dict):
            box = location_bbox(location.get("latitude"), location.get("longitude"))
            if box:
                record["location"] = {"label": words["here"], "bbox": box}
                record.pop("pending", None)
                self._save()
                self._fetch(chat_id, lang, "semaforo", record["location"], None)
                self._fetch(chat_id, lang, "hoy", record["location"], None)
            return
        text = message.get("text")
        voice = message.get("voice") or message.get("audio")
        if not isinstance(text, str) and isinstance(voice, dict) and voice.get("file_id"):
            if not stt.available():
                self._send(chat_id, words["no_voice"])
                return
            try:
                text = stt.transcribe(self.telegram.download_file(voice["file_id"]), lang)
            except (APIError, httpx.HTTPError, OSError, KeyError, ValueError):
                text = None
            if not text:
                self._send(chat_id, words["voice_error"])
                return
            self.telegram.send_message(chat_id, f"{words['heard']}: «{text}»")
        if not isinstance(text, str):
            return
        command, argument, year = parse_command(text)
        if command is None and record.get("pending") is None and argument and not argument.isdigit():
            command = "calendario"  # free text or a transcribed voice note: natural-language area + dates
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
        if command in {"start", "id", "chatid"}:
            # The chat id identifies this chat: it is only ever sent back to the same chat, never logged.
            intro = words["welcome"] if command == "start" else ""
            self._send(chat_id, intro + words["start"].format(chat_id=chat_id) + "\n" + words["help"])
            return
        if command in {"ayuda", "help"}:
            self._send(chat_id, words["help"])
            return
        if command not in {"calendario", "temporada", "incendios", "semaforo", "hoy", "pronostico"}:
            self._send(chat_id, words["unknown"])
            return
        if not argument:
            if command in {"semaforo", "hoy"} and record.get("location"):
                self._fetch(chat_id, lang, command, record["location"], None)
            else:
                self._send(chat_id, words["no_location"] if command in {"semaforo", "hoy"} else words["usage"])
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
        if year is None and command == "calendario":
            intent = resolved.get("intent") or {}
            start, end = intent.get("date_from"), intent.get("date_to")
            if isinstance(start, str) and isinstance(end, str) and start[:4] == end[:4] and start[:4].isdigit():
                year = int(start[:4])
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
            elif command == "semaforo":
                result = self.api.risk(bbox)
            elif command == "hoy":
                result = self.api.recent(bbox, 24)
            elif command == "pronostico":
                result = self.api.outlook(bbox)
            else:
                result = self.api.events(bbox)
        except APIError:
            self._send(chat_id, words["recent_off"] if command == "hoy" else words["down"], {})
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
        elif command == "semaforo":
            summary = result.get("summary_es")
            parts = [f"{words['priority']} · {label}", str(summary) if summary else words["no_data"]]
            for component in (result.get("components") or [])[:5]:
                if isinstance(component, dict) and component.get("note"):
                    parts.append(f"- {component.get('label')}: {component['note']}")
            parts.append(f"Ver datos: {self.api.query_url('/risk', {'bbox': bbox})}")
            self._send(chat_id, prefix + "\n".join(parts), result)
        elif command == "hoy":
            features = [f for f in (result.get("features") or []) if isinstance(f, dict)]
            if not features:
                self._send(chat_id, prefix + f"{label}\n{words['recent_none']}", result)
                return
            frps = [(f.get("properties") or {}).get("frp_mw") for f in features]
            frps = [x for x in frps if isinstance(x, (int, float))]
            lines = [prefix + f"{words['recent']} · {label}: {len(features)}"]
            if frps:
                lines.append(f"FRP máx.: {max(frps):g} MW")
            lines.append(words["point"])
            lines.append(f"Ver datos: {self.api.query_url('/recent', {'bbox': bbox, 'hours': 24})}")
            self._send(chat_id, "\n".join(lines), result)
        elif command == "pronostico":
            items = [f for f in (result.get("forecasts") or []) if isinstance(f, dict)]
            if not items:
                self._send(chat_id, prefix + (result.get("empty_reason") or words["no_data"]), result)
                return
            lines = [prefix + f"{words['outlook']} · {label}"]
            issued = sorted({f.get("issue") for f in items if f.get("issue")})
            for f in items:
                target = str(f.get("target") or "")
                month = MONTHS[lang][int(target[5:7]) - 1] + " " + target[:4] if len(target) == 7 else target
                normal = f.get("normal_detections")
                if f.get("show") == "climatology":
                    lines.append(f"{month}: {words['normal']} ~{normal:g} ({words['outlook_clim']})")
                    continue
                ratio = f.get("ratio_to_normal")
                ratio_txt = f" · {ratio:g}×" if isinstance(ratio, (int, float)) else ""
                country = f" [{f.get('country')}]" if len({x.get('country') for x in items}) > 1 else ""
                lines.append(f"{month}{country}: ~{f.get('expected_detections'):g} {words['expected']} "
                             f"({words['normal']} {normal:g}){ratio_txt}")
            if issued:
                lines.append(f"{words['issued']} {', '.join(issued)}")
            lines.append(words["outlook_note"])
            lines.append(f"Ver datos: {self.api.query_url('/forecast', {'bbox': bbox})}")
            self._send(chat_id, "\n".join(lines), result)
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
            {"command": "id", "description": "Tu chat_id (para suscribirte a alertas)"},
            {"command": "calendario", "description": "Calendario de fuego"},
            {"command": "temporada", "description": "Temporada"},
            {"command": "incendios", "description": "Eventos principales"},
            {"command": "semaforo", "description": "Prioridad del área"},
            {"command": "pronostico", "description": "Perspectiva de actividad 1-3 meses"},
            {"command": "hoy", "description": "Detecciones últimas 24 h"},
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
        print("TELEGRAM_BOT_TOKEN is missing. Set it in the environment or repo-root .env to run the bot.", flush=True)
        # In Docker (restart: on-failure) exit cleanly instead of crash-looping while no token is configured.
        return 0 if os.environ.get("FIRELY_BOT_EXIT_OK_WITHOUT_TOKEN") == "1" else 1
    Bot(TelegramClient(token), FirelyClient()).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
