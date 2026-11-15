"""Speech-to-text for voice notes (§11.2 "Bot conversacional con notas de voz").

Pluggable and optional: Firely does not ship a transcription model. If ``faster-whisper`` is installed the bot
transcribes locally (no audio leaves the server); otherwise ``transcribe`` returns ``None`` and the bot asks the
user to type the question. Model size via ``FIRELY_STT_MODEL`` (default ``small``), language hint from the chat.
"""
from __future__ import annotations

import tempfile
from functools import lru_cache
from pathlib import Path

from .client import setting


@lru_cache(maxsize=1)
def _model():
    try:
        from faster_whisper import WhisperModel  # optional dependency
    except ImportError:
        return None
    return WhisperModel(setting("FIRELY_STT_MODEL", "small"), device="cpu", compute_type="int8")


def available() -> bool:
    return _model() is not None


def transcribe(audio: bytes, lang: str = "es") -> str | None:
    model = _model()
    if model is None or not audio:
        return None
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "voice.ogg"
        path.write_bytes(audio)
        segments, _ = model.transcribe(str(path), language=lang if lang in ("es", "en", "pt") else None, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip()
    return text or None
