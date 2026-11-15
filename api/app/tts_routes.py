"""Narration audio for the story mode: text to speech on the server with Piper (offline neural TTS, MIT).

GET /tts?text=...&lang=es|en|pt -> audio/wav

Browsers' speechSynthesis depends on the voices installed in the operating system (Chrome on Linux usually has
none), so the story narration was silent there. Piper runs on the API host instead: no external service and the same
voice on every device. Voices (~60 MB each, rhasspy/piper-voices) are downloaded on first use into
FIRELY_STATE_DIR/tts/voices; every synthesized sentence is cached in FIRELY_STATE_DIR/cache/tts (same text, same file).
The text is the narration the page already shows: figures come from the API, this only reads them aloud.
"""
from __future__ import annotations

import hashlib
import io
import threading
import wave
from functools import lru_cache
from pathlib import Path

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from . import db

router = APIRouter()
MAX_CHARS = 800
VOICES = {  # language -> (huggingface path, voice name)
    "es": ("es/es_MX/ald/medium", "es_MX-ald-medium"),
    "en": ("en/en_US/lessac/medium", "en_US-lessac-medium"),
    "pt": ("pt/pt_BR/faber/medium", "pt_BR-faber-medium"),
}
BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
_download_lock = threading.Lock()
_synth_lock = threading.Lock()


def _voice_dir() -> Path:
    return db.state_root() / "tts" / "voices"


def _ensure_voice(lang: str) -> Path:
    path, name = VOICES[lang]
    folder = _voice_dir()
    model = folder / f"{name}.onnx"
    with _download_lock:
        for suffix in (".onnx", ".onnx.json"):
            target = folder / f"{name}{suffix}"
            if target.is_file() and target.stat().st_size > 0:
                continue
            folder.mkdir(parents=True, exist_ok=True)
            tmp = target.with_suffix(target.suffix + ".part")
            with requests.get(f"{BASE}/{path}/{name}{suffix}", stream=True, timeout=120,
                              headers={"User-Agent": "firely-tts"}) as r:
                r.raise_for_status()
                with open(tmp, "wb") as fh:
                    for chunk in r.iter_content(1 << 20):
                        fh.write(chunk)
            tmp.replace(target)
    return model


@lru_cache(maxsize=3)
def _voice(lang: str):
    from piper import PiperVoice
    return PiperVoice.load(str(_ensure_voice(lang)))


@router.get("/tts", response_class=FileResponse, responses={200: {"content": {"audio/wav": {}}}})
def tts(text: str = Query(..., min_length=1, max_length=MAX_CHARS), lang: str = Query("es", pattern="^(es|en|pt)$")):
    clean = " ".join(text.split())
    key = hashlib.sha256(f"{lang}|{VOICES[lang][1]}|{clean}".encode()).hexdigest()[:32]
    cache = db.state_root() / "cache" / "tts" / f"{key}.wav"
    if not cache.is_file():
        try:
            voice = _voice(lang)
            buf = io.BytesIO()
            with _synth_lock, wave.open(buf, "wb") as w:  # one synthesis at a time on a small server
                voice.synthesize_wav(clean, w)
        except ImportError as exc:
            raise HTTPException(503, detail={"code": "tts_unavailable", "message": "piper-tts is not installed"}) from exc
        except (requests.RequestException, OSError, RuntimeError) as exc:
            raise HTTPException(503, detail={"code": "tts_unavailable", "message": "Voice could not be loaded"}) from exc
        try:
            cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_suffix(".tmp")
            tmp.write_bytes(buf.getvalue())
            tmp.replace(cache)
        except OSError:  # read-only state: answer without caching
            from fastapi.responses import Response
            return Response(buf.getvalue(), media_type="audio/wav")
    return FileResponse(cache, media_type="audio/wav", headers={"Cache-Control": "public, max-age=604800"})
