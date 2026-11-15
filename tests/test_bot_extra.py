"""Bot features from §11.2: free text, shared location, /semaforo, /hoy and voice notes."""
import httpx

from bot import stt, telegram_bot
from bot.telegram_bot import location_bbox
from tests.test_bot import META, FakeAPITransport, make_bot, update


class RichAPI(FakeAPITransport):
    def post(self, url, json=None):
        self.calls.append(("POST", url, json))
        return self._response("POST", url, {**META, "ambiguous": False, "intent": {"date_from": "2021-03-01", "date_to": "2021-03-31"},
                                            "candidates": [{"label": "Sierra de Arteaga", "bbox": "-100.9,25.2,-100.2,25.7"}]})

    def get(self, url, params=None):
        if url.endswith("/risk"):
            self.calls.append(("GET", url, params))
            return self._response("GET", url, {**META, "summary_es": "Prioridad alta: índice 70.0 de 100 para marzo 2021.",
                                               "components": [{"label": "Anomalía", "note": "percentil 0.95"}]})
        if url.endswith("/recent"):
            self.calls.append(("GET", url, params))
            return self._response("GET", url, {**META, "type": "FeatureCollection", "features": [
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-100.5, 25.4]}, "properties": {"frp_mw": 12.5}},
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-100.6, 25.4]}, "properties": {"frp_mw": 3.0}}]})
        return super().get(url, params)


def test_free_text_uses_natural_language_and_intent_year(tmp_path):
    api = RichAPI()
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("incendios en la sierra de Arteaga en marzo de 2021"))
    assert api.calls[0][2]["text"] == "incendios en la sierra de Arteaga en marzo de 2021"
    assert api.calls[1] == ("GET", "http://fake-api/calendar", {"bbox": "-100.9,25.2,-100.2,25.7", "from": "2021-01-01", "to": "2021-12-31"})
    assert "Sierra de Arteaga" in telegram.messages[0]


def test_semaforo_and_hoy(tmp_path):
    api = RichAPI()
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update(update("/semaforo Arteaga"))
    assert "Prioridad alta" in telegram.messages[-1] and "- Anomalía: percentil 0.95" in telegram.messages[-1] and "/risk?bbox=" in telegram.messages[-1]
    bot.handle_update(update("/hoy Arteaga"))
    assert "últimas 24 h · Sierra de Arteaga: 2" in telegram.messages[-1] and "FRP máx.: 12.5 MW" in telegram.messages[-1]
    assert "no un incendio confirmado" in telegram.messages[-1]


def test_shared_location_runs_priority_and_recent_and_is_remembered(tmp_path):
    api = RichAPI()
    bot, telegram = make_bot(tmp_path, api)
    bot.handle_update({"message": {"chat": {"id": 42}, "location": {"latitude": 25.4, "longitude": -100.6}}})
    gets = [c for c in api.calls if c[0] == "GET"]
    assert [c[1].rsplit("/", 1)[-1] for c in gets] == ["risk", "recent"]
    west, south, east, north = map(float, gets[0][2]["bbox"].split(","))
    assert west < -100.6 < east and south < 25.4 < north
    assert "Tu ubicación" in telegram.messages[0]
    bot.handle_update(update("/semaforo"))  # no argument: uses the remembered location
    assert api.calls[-1][1].endswith("/risk")


def test_location_bbox_validation():
    assert location_bbox(95, 0) is None and location_bbox("25", -100) is None
    assert location_bbox(0, 0) == "-0.2252,-0.2252,0.2252,0.2252"


def test_voice_note_without_stt_asks_to_type(tmp_path, monkeypatch):
    monkeypatch.setattr(stt, "available", lambda: False)
    bot, telegram = make_bot(tmp_path, RichAPI())
    bot.handle_update({"message": {"chat": {"id": 42}, "voice": {"file_id": "abc"}}})
    assert "Escribe tu pregunta" in telegram.messages[0]


def test_voice_note_is_transcribed_and_answered(tmp_path, monkeypatch):
    monkeypatch.setattr(stt, "available", lambda: True)
    monkeypatch.setattr(stt, "transcribe", lambda audio, lang: "hay fuego cerca de la sierra de Arteaga")
    api = RichAPI()
    bot, telegram = make_bot(tmp_path, api)
    monkeypatch.setattr(bot.telegram, "download_file", lambda file_id: b"OggS")
    bot.handle_update({"message": {"chat": {"id": 42}, "voice": {"file_id": "abc"}}})
    assert telegram.messages[0] == "Entendí: «hay fuego cerca de la sierra de Arteaga»"
    assert api.calls[0][2]["text"] == "hay fuego cerca de la sierra de Arteaga"


def test_voice_download_error(tmp_path, monkeypatch):
    monkeypatch.setattr(stt, "available", lambda: True)
    bot, telegram = make_bot(tmp_path, RichAPI())

    def boom(file_id):
        raise httpx.ConnectError("x")
    monkeypatch.setattr(bot.telegram, "download_file", boom)
    bot.handle_update({"message": {"chat": {"id": 42}, "voice": {"file_id": "abc"}}})
    assert "No pude descargar" in telegram.messages[0]


def test_stt_unavailable_without_dependency(monkeypatch):
    stt._model.cache_clear()
    import builtins
    real_import = builtins.__import__

    def fake(name, *a, **k):
        if name == "faster_whisper":
            raise ImportError
        return real_import(name, *a, **k)
    monkeypatch.setattr(builtins, "__import__", fake)
    assert stt.available() is False and stt.transcribe(b"x") is None
    stt._model.cache_clear()
    assert telegram_bot.stt is stt
