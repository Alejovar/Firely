"""Narration audio for the story mode: text to speech on the server.

GET /tts?text=...&lang=es|en|pt -> audio/mpeg (neural voice) or audio/wav (Piper fallback)

Engines, in the order of FIRELY_TTS_ENGINE (default "edge,piper"):
* edge: Microsoft's neural voices (es-MX-DaliaNeural, en-US-JennyNeural, pt-BR-FranciscaNeural) through the
  edge-tts package, the most natural voices. It uses the public endpoint of the Edge "read aloud" feature, which is
  not an official API: it can change without notice, and the text (the narration already on screen) leaves the server.
* piper: offline neural TTS on the API host (MIT); used when edge fails or when FIRELY_TTS_ENGINE=piper.

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
EDGE_VOICES = {"es": "es-MX-DaliaNeural", "en": "en-US-JennyNeural", "pt": "pt-BR-FranciscaNeural"}
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


def _engines() -> list[str]:
    import os
    raw = os.environ.get("FIRELY_TTS_ENGINE", "edge,piper")
    return [e.strip() for e in raw.split(",") if e.strip() in ("edge", "piper")] or ["piper"]


def _edge(text: str, lang: str, dest: Path) -> None:
    import edge_tts
    tmp = dest.with_suffix(".part")
    edge_tts.Communicate(text, EDGE_VOICES[lang], connect_timeout=8, receive_timeout=30).save_sync(str(tmp))
    if not tmp.is_file() or tmp.stat().st_size < 1000:
        raise RuntimeError("empty audio")
    tmp.replace(dest)


def _piper(text: str, lang: str, dest: Path) -> None:
    voice = _voice(lang)
    buf = io.BytesIO()
    with _synth_lock, wave.open(buf, "wb") as w:  # one synthesis at a time on a small server
        voice.synthesize_wav(text, w)
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(buf.getvalue())
    tmp.replace(dest)


MEDIA = {"edge": ("mp3", "audio/mpeg"), "piper": ("wav", "audio/wav")}


@router.get("/tts", response_class=FileResponse, responses={200: {"content": {"audio/mpeg": {}, "audio/wav": {}}}})
def tts(text: str = Query(..., min_length=1, max_length=MAX_CHARS), lang: str = Query("es", pattern="^(es|en|pt)$")):
    clean = " ".join(text.split())
    folder = db.state_root() / "cache" / "tts"
    errors = []
    for engine in _engines():
        ext, media = MEDIA[engine]
        voice = EDGE_VOICES[lang] if engine == "edge" else VOICES[lang][1]
        key = hashlib.sha256(f"{engine}|{voice}|{clean}".encode()).hexdigest()[:32]
        cache = folder / f"{key}.{ext}"
        if not cache.is_file():
            try:
                folder.mkdir(parents=True, exist_ok=True)
                (_edge if engine == "edge" else _piper)(clean, lang, cache)
            except Exception as exc:  # noqa: BLE001 - try the next engine
                errors.append(f"{engine}: {type(exc).__name__}")
                continue
        return FileResponse(cache, media_type=media, headers={"Cache-Control": "public, max-age=604800", "X-TTS-Engine": engine})
    raise HTTPException(503, detail={"code": "tts_unavailable", "message": "; ".join(errors) or "no engine"})
