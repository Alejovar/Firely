"""Small injectable HTTP clients for Firely and the Telegram Bot API."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlencode

import httpx


ROOT = Path(__file__).resolve().parents[1]


def setting(name: str, default: str | None = None, *, root: Path = ROOT) -> str | None:
    """Read an environment setting, with a simple repo-root .env fallback."""
    if name in os.environ:
        return os.environ[name]
    path = root / ".env"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return default
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == name:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            return value
    return default


class APIError(Exception):
    """The API is unreachable or returned an unusable response."""


class FirelyClient:
    def __init__(self, base_url: str | None = None, transport=None, public_url: str | None = None):
        self.base_url = (base_url or setting("FIRELY_API_URL", "http://127.0.0.1:8000")).rstrip("/")
        # Links shown to users ("Ver datos") must use the public URL, not the internal one (http://api:8000 in Docker).
        if public_url is None and base_url is None:
            public_url = setting("FIRELY_PUBLIC_API_URL")
        self.public_url = (public_url or self.base_url).rstrip("/")
        self.transport = transport if transport is not None else httpx.Client(timeout=20)

    def request(self, method: str, path: str, *, params=None, json=None) -> dict:
        try:
            if method == "POST":
                response = self.transport.post(self.base_url + path, json=json)
            else:
                response = self.transport.get(self.base_url + path, params=params)
            response.raise_for_status()
            body = response.json()
            if not isinstance(body, dict):
                raise ValueError("Expected an API object")
            return body
        except (httpx.HTTPError, OSError, ValueError) as exc:
            raise APIError("Firely API unavailable") from exc

    def query_url(self, path: str, params: dict) -> str:
        return self.public_url + path + "?" + urlencode(params)

    def resolve(self, place: str, lang: str) -> dict:
        return self.request("POST", "/resolve-area", json={"text": place, "lang": lang})

    def calendar(self, bbox: str, year: int | None = None) -> dict:
        params = {"bbox": bbox}
        if year is not None:
            params.update({"from": f"{year}-01-01", "to": f"{year}-12-31"})
        return self.request("GET", "/calendar", params=params)

    def season(self, bbox: str) -> dict:
        return self.request("GET", "/season", params={"bbox": bbox})

    def events(self, bbox: str) -> dict:
        return self.request("GET", "/events", params={"bbox": bbox})

    def risk(self, bbox: str) -> dict:
        return self.request("GET", "/risk", params={"bbox": bbox})

    def recent(self, bbox: str, hours: int = 24) -> dict:
        return self.request("GET", "/recent", params={"bbox": bbox, "hours": hours})

    def metadata(self) -> dict:
        return self.request("GET", "/calendar", params={"from": "2001-01-01", "to": "2001-01-01"})


class TelegramClient:
    def __init__(self, token: str, transport=None):
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN is missing")
        self.base_url = f"https://api.telegram.org/bot{token}/"
        self.transport = transport if transport is not None else httpx.Client(timeout=40)

    def call(self, method: str, *, data=None, files=None) -> dict:
        response = self.transport.post(self.base_url + method, data=data, files=files)
        response.raise_for_status()
        body = response.json()
        if not body.get("ok"):
            raise APIError("Telegram request failed")
        return body

    def get_updates(self, offset: int | None = None, timeout: int = 30) -> list[dict]:
        return self.call("getUpdates", data={"offset": offset, "timeout": timeout})["result"]

    def send_message(self, chat_id: int, text: str) -> None:
        self.call("sendMessage", data={"chat_id": chat_id, "text": text})

    def send_photo(self, chat_id: int, png: bytes, caption: str) -> None:
        self.call("sendPhoto", data={"chat_id": chat_id, "caption": caption},
                  files={"photo": ("calendar.png", png, "image/png")})

    def download_file(self, file_id: str, max_bytes: int = 5_000_000) -> bytes:
        """Download a file sent to the bot (voice notes). Telegram serves it from /file/bot<token>/<path>."""
        info = self.call("getFile", data={"file_id": file_id})["result"]
        if int(info.get("file_size") or 0) > max_bytes:
            raise APIError("File too large")
        url = self.base_url.replace("/bot", "/file/bot", 1) + info["file_path"]
        response = self.transport.get(url) if hasattr(self.transport, "get") else httpx.get(url, timeout=40)
        response.raise_for_status()
        return response.content[:max_bytes]

    def set_commands(self, commands: list[dict]) -> None:
        self.call("setMyCommands", data={"commands": __import__("json").dumps(commands)})
