"""Voiceover with ElevenLabs (with-timestamps): writes assets/vo/<scene>.mp3 and <scene>.json (character alignment).
The API key is read from the fish universal variable ELEVENLABS_API_KEY and never printed.
Usage: python3 -I tools/elevenlabs_vo.py [--lang en] [scene ...]   (default: all scenes missing an mp3)"""
import base64, json, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE = "EXAVITQu4vr4xnSDxMaL"  # Sarah (premade)
MODEL = "eleven_multilingual_v2"


def key():
    k = subprocess.run(["fish", "--no-config", "-c", "printf %s $ELEVENLABS_API_KEY"], capture_output=True, text=True).stdout.strip()
    if not k:
        sys.exit("ELEVENLABS_API_KEY no está definida")
    return k


def main():
    args = sys.argv[1:]
    lang = "es"
    if args[:1] == ["--lang"]:
        lang, args = args[1], args[2:]
    script = json.loads((ROOT / ("script.json" if lang == "es" else f"script_{lang}.json")).read_text(encoding="utf-8"))
    vo = ROOT / "assets/vo" if lang == "es" else ROOT / "assets/vo" / lang
    vo.mkdir(parents=True, exist_ok=True)
    names = list(script)
    todo = args or [s for s in names if not (vo / f"{s}.mp3").exists()]
    k = key()
    for s in todo:
        i = names.index(s)
        body = {"text": script[s], "model_id": MODEL,
                "voice_settings": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.55, "use_speaker_boost": True, "speed": 1.05},
                "previous_text": script[names[i - 1]] if i else None,
                "next_text": script[names[i + 1]] if i + 1 < len(names) else None}
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128",
                                     data=json.dumps(body).encode(), headers={"xi-api-key": k, "Content-Type": "application/json"})
        data = json.load(urllib.request.urlopen(req, timeout=120))
        (vo / f"{s}.mp3").write_bytes(base64.b64decode(data["audio_base64"]))
        (vo / f"{s}.json").write_text(json.dumps(data["alignment"], ensure_ascii=False))
        print(s, "ok", len(script[s]), "caracteres")


if __name__ == "__main__":
    main()
