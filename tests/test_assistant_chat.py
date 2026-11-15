"""Gotita conversation layer: routing data vs answer, persona voice, and the no-new-figures rule."""
import json
from datetime import date
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai import assistant
from api.app import ai_routes

TODAY = date(2026, 11, 15)


class Fake:
    def __init__(self, payload):
        self.payload, self.kwargs = payload, None
        self.messages = self

    def create(self, **kw):
        self.kwargs = kw
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=json.dumps(self.payload))])


def test_llm_answer_uses_persona_and_context():
    fake = Fake({"mode": "answer", "reply": "1. Limpia 10 metros alrededor de la casa.", "query": ""})
    out = assistant.reply("¿Cómo resguardo a mi familia?", "brigadista", "es",
                          [{"role": "user", "text": "¿Cómo viene diciembre en Arteaga?"}, {"role": "assistant", "text": "Se esperan 2 detecciones."}],
                          {"place": "Arteaga, Coahuila", "summary": "Se esperan 2 detecciones."}, client=fake, today=TODAY)
    assert out == {"mode": "answer", "reply": "1. Limpia 10 metros alrededor de la casa.", "query": "", "source": "llm"}
    assert "brigadista" in fake.kwargs["system"] and fake.kwargs["output_config"]["format"]["type"] == "json_schema"
    assert "tool_choice" not in fake.kwargs and fake.kwargs["messages"][0]["role"] == "user"
    assert "Arteaga, Coahuila" in fake.kwargs["messages"][-1]["content"]


def test_llm_data_rewrites_follow_up_query():
    fake = Fake({"mode": "data", "reply": "", "query": "Arteaga, Coahuila en marzo de 2027"})
    out = assistant.reply("¿y en marzo?", "curioso", "es", [], {"place": "Arteaga, Coahuila"}, client=fake, today=TODAY)
    assert out["mode"] == "data" and out["query"] == "Arteaga, Coahuila en marzo de 2027"


def test_rules_fallback(monkeypatch):
    monkeypatch.setattr(assistant, "setting", lambda name, default=None: None)
    safety = assistant.reply("¿cómo puedo resguardar a mi familia?", "brigadista", "es", today=TODAY)
    assert safety["mode"] == "answer" and "911" in safety["reply"] and safety["reply"].startswith("Para resguardar")
    assert "1." not in assistant.reply("¿cómo puedo resguardar a mi familia?", "curioso", "es", today=TODAY)["reply"]
    data = assistant.reply("¿Cómo viene diciembre en Arteaga, Coahuila?", "curioso", "es", today=TODAY)
    assert data["mode"] == "data"
    follow = assistant.reply("¿y en marzo de 2027?", "curioso", "es", context={"place": "Arteaga, Coahuila"}, today=TODAY)
    assert follow["mode"] == "data" and "Arteaga, Coahuila" in follow["query"]


def test_route(monkeypatch):
    monkeypatch.setattr(assistant, "setting", lambda name, default=None: None)
    app = FastAPI(); app.include_router(ai_routes.router)
    r = TestClient(app).post("/assistant/reply", json={"message": "hola", "profile": "cientifico", "lang": "es"})
    assert r.status_code == 200 and r.json()["mode"] == "answer" and r.json()["attribution"] == "NASA FIRMS"
