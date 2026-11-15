import json

import httpx

from bot.client import FirelyClient, TelegramClient
from bot.render import calendar_png
from bot.telegram_bot import Bot, main, parse_command


META = {"methodology_version": "test-v1", "data_cutoff": "2026-08-31", "attribution": "NASA FIRMS"}


class FakeAPITransport:
    def __init__(self, *, ambiguous=False, down=False):
        self.calls = []
        self.subscriptions = []
        self.ambiguous = ambiguous
        self.down = down

    def _response(self, method, url, body):
        if self.down:
            raise httpx.ConnectError("unreachable")
        return httpx.Response(200, json=body, request=httpx.Request(method, url))

    def post(self, url, json=None):
        self.calls.append(("POST", url, json))
        if url.endswith("/subscriptions"):
            row = {"id": f"sub{len(self.subscriptions) + 1:02d}", "name": json["name"],
                   "min_index": json["min_index"], "chat_id": json["chat_id"]}
            self.subscriptions.append(row)
            return self._response("POST", url, {**META, "subscription": {k: v for k, v in row.items() if k != "chat_id"}})
        candidates = [{"label": "Arteaga, Coahuila", "bbox": "-100.9,25.2,-100.2,25.7"}]
        if self.ambiguous:
            candidates.append({"label": "Arteaga, Michoacán", "bbox": "-102.4,18.2,-102.0,18.5"})
        return self._response("POST", url, {**META, "candidates": candidates, "ambiguous": self.ambiguous})

    def get(self, url, params=None):
        self.calls.append(("GET", url, params))
        if url.endswith("/calendar"):
            body = {**META, "rows": [
                {"year": 2021, "month": 3, "count_harm": 12, "anomaly_ratio": 2.5,
                 "return_period_years": 8, "is_estimated": True},
                {"year": 2021, "month": 4, "count_harm": 4, "anomaly_ratio": 0.8,
                 "return_period_years": 2, "is_estimated": False}]}
        elif url.endswith("/alerts/preview"):
            body = {"attribution": "NASA FIRMS", "triggered": True, "sent": False,
                    "message": "[EJERCICIO / PRUEBA] Mensaje de prueba de Firely; no es una alerta oficial.\nÁrea: " + params["name"]}
        elif url.endswith("/subscriptions"):
            body = {**META, "rows": [{k: v for k, v in row.items() if k != "chat_id"}
                                    for row in self.subscriptions if row["chat_id"] == params["chat_id"]]}
        elif url.endswith("/season"):
            body = {**META, "summary_es": "Temporada de prueba.", "rows": []}
        else:
            body = {**META, "rows": [{"rank": i, "start_date": f"202{i}-03-01",
                                        "n_hotspots_harm": i * 10} for i in range(1, 5)]}
        return self._response("GET", url, body)

    def delete(self, url, params=None):
        self.calls.append(("DELETE", url, params))
        sub_id = url.rsplit("/", 1)[-1]
        self.subscriptions = [row for row in self.subscriptions
                              if not (row["id"] == sub_id and row["chat_id"] == params["chat_id"])]
        return self._response("DELETE", url, {"deleted": sub_id})


class FakeTelegramTransport:
    def __init__(self):
        self.calls = []

    def post(self, url, data=None, files=None):
        self.calls.append((url.rsplit("/", 1)[-1], data, files))
        return httpx.Response(200, json={"ok": True, "result": []}, request=httpx.Request("POST", url))

    @property
    def messages(self):
        return [data["text"] for method, data, _ in self.calls if method == "sendMessage"]

    @property
    def photos(self):
        return [(data, files) for method, data, files in self.calls if method == "sendPhoto"]


def update(text):
    return {"message": {"chat": {"id": 42}, "text": text}}


def make_bot(tmp_path, api_transport):
    telegram_transport = FakeTelegramTransport()
    bot = Bot(TelegramClient("fake-token", transport=telegram_transport),
              FirelyClient("http://fake-api", transport=api_transport),
              state_path=tmp_path / "bot_state.json", min_interval=0)
    return bot, telegram_transport


def test_parse_commands():
    assert parse_command("/calendario@firely_bot Sierra de Arteaga 2021") == (
        "calendario", "Sierra de Arteaga", 2021)
    assert parse_command("/temporada Chilecito") == ("temporada", "Chilecito", None)
    assert parse_command("2") == (None, "2", None)


def test_calendar_flow(tmp_path):
    api = FakeAPITransport()
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("/calendario Arteaga 2021"))
    assert api.calls[0] == ("POST", "http://fake-api/resolve-area", {"text": "Arteaga", "lang": "es"})
    assert api.calls[1] == ("GET", "http://fake-api/calendar",
                            {"bbox": "-100.9,25.2,-100.2,25.7", "from": "2021-01-01", "to": "2021-12-31"})
    assert "Mes con mayor actividad: mar" in telegram.messages[0]
    assert "anomalía: 0.8×" in telegram.messages[0]
    assert "periodo de retorno: 2 años" in telegram.messages[0]
    assert telegram.messages[0].endswith("Fuente: NASA FIRMS · metodología test-v1 · datos hasta 2026-08-31")
    assert telegram.photos[0][1]["photo"][1].startswith(b"\x89PNG\r\n\x1a\n")
    assert telegram.photos[0][0]["caption"].endswith("datos hasta 2026-08-31")


def test_ambiguity_and_persisted_language(tmp_path):
    api = FakeAPITransport(ambiguous=True)
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("/lang en"))
    bot.handle_update(update("/calendario Arteaga"))
    assert "1. Arteaga, Coahuila" in telegram.messages[-1]
    assert "2. Arteaga, Michoacán" in telegram.messages[-1]
    assert not any(method == "GET" and url.endswith("/calendar") and params.get("bbox")
                   for method, url, params in api.calls)
    bot.handle_update(update("2"))
    assert api.calls[-1] == ("GET", "http://fake-api/calendar", {"bbox": "-102.4,18.2,-102.0,18.5"})
    assert "Latest month: Apr 2021" in telegram.messages[-1]
    assert json.loads((tmp_path / "bot_state.json").read_text())["42"]["lang"] == "en"
    assert "pending" not in bot.state["42"]


def test_missing_token(monkeypatch, capsys):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.setattr("bot.telegram_bot.setting", lambda name: None)
    assert main() == 1
    assert "TELEGRAM_BOT_TOKEN is missing" in capsys.readouterr().out


def test_api_down_and_rate_limit(tmp_path):
    api = FakeAPITransport(down=True)
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("/calendario Arteaga"))
    assert "La API de Firely no está disponible" in telegram.messages[0]
    assert telegram.messages[0].endswith("metodología no disponible · datos hasta no disponible")
    bot.min_interval = 10
    bot.clock = lambda: 100
    bot.handle_update(update("/ayuda"))
    bot.handle_update(update("/ayuda"))
    assert "Espera un momento" in telegram.messages[-1]


def test_png_bytes():
    png = calendar_png({**META, "rows": [{"year": 2005, "month": 1,
                                         "count_harm": 7, "is_estimated": True}]})
    assert png.startswith(b"\x89PNG\r\n\x1a\n")


def test_alert_command_replies_with_exercise_message(tmp_path):
    api = FakeAPITransport()
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("/alerta Arteaga"))
    assert any(url.endswith("/alerts/preview") and params["bbox"] == "-100.9,25.2,-100.2,25.7" for _, url, params in api.calls)
    assert telegram.messages[-1].startswith("[EJERCICIO / PRUEBA]") and "Arteaga, Coahuila" in telegram.messages[-1]


def test_subscribe_list_and_unsubscribe(tmp_path):
    api = FakeAPITransport()
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("/suscribir Arteaga"))
    posts = [call for call in api.calls if call[1].endswith("/subscriptions") and call[0] == "POST"]
    assert posts[0][2] == {"name": "Arteaga, Coahuila", "area": {"bbox": "-100.9,25.2,-100.2,25.7"},
                           "chat_id": 42, "min_index": 55, "lang": "es"}
    assert "evaluación diaria" in telegram.messages[-1] and "/baja" in telegram.messages[-1]
    bot.handle_update(update("/suscripciones"))
    assert "Arteaga, Coahuila · umbral 55 · ID sub01" in telegram.messages[-1]
    bot.handle_update(update("/baja sub"))
    assert "varias" not in telegram.messages[-1] and "Arteaga, Coahuila" in telegram.messages[-1]
    assert ("DELETE", "http://fake-api/subscriptions/sub01", {"chat_id": 42}) in api.calls
    bot.handle_update(update("/baja"))
    assert "No tienes suscripciones" in telegram.messages[-1]


def test_ambiguous_subscribe_and_remove_all(tmp_path):
    api = FakeAPITransport(ambiguous=True)
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("/lang en"))
    bot.handle_update(update("/suscribir Arteaga"))
    assert "2. Arteaga, Michoacán" in telegram.messages[-1]
    bot.handle_update(update("2"))
    assert api.subscriptions[0]["name"] == "Arteaga, Michoacán"
    assert "evaluated daily" in telegram.messages[-1]
    bot.handle_update(update("/suscribir Arteaga"))
    bot.handle_update(update("1"))
    bot.handle_update(update("/baja sub"))
    assert "matches several" in telegram.messages[-1] and len(api.subscriptions) == 2
    bot.handle_update(update("/baja"))
    assert "Arteaga, Michoacán" in telegram.messages[-1] and "Arteaga, Coahuila" in telegram.messages[-1]
    assert api.subscriptions == []
