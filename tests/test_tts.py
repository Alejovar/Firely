"""GET /tts: Piper narration, cached per (language, text); no voice download in tests."""
import wave

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.app import tts_routes


class FakeVoice:
    calls = 0

    def synthesize_wav(self, text, w):
        FakeVoice.calls += 1
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
        w.writeframes(b"\x00\x00" * 2205)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FIRELY_STATE_DIR", str(tmp_path))
    monkeypatch.setattr(tts_routes, "_voice", lambda lang: FakeVoice())
    app = FastAPI(); app.include_router(tts_routes.router)
    return TestClient(app)


def test_tts_returns_wav_and_caches(client, tmp_path):
    FakeVoice.calls = 0
    r = client.get("/tts", params={"text": "Mayo fue el mes de mayor actividad.", "lang": "es"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav" and r.content[:4] == b"RIFF"
    again = client.get("/tts", params={"text": "Mayo  fue el mes de mayor actividad.", "lang": "es"})  # same text, extra space
    assert again.content == r.content and FakeVoice.calls == 1
    assert len(list((tmp_path / "cache" / "tts").glob("*.wav"))) == 1


def test_tts_validates_input(client):
    assert client.get("/tts", params={"text": "x" * 801}).status_code == 422
    assert client.get("/tts", params={"text": "hola", "lang": "fr"}).status_code == 422
