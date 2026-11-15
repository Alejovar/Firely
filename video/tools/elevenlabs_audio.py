"""Music bed and sound effects with ElevenLabs. Key from the fish universal variable; never printed.
Usage: python3 -I tools/elevenlabs_audio.py music|sfx"""
import json, sys, urllib.error, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from elevenlabs_vo import key

OUT = Path(__file__).resolve().parent.parent / "assets/audio"
MUSIC = ("Calm, hopeful documentary underscore for a science explainer about wildfires seen from satellites. "
         "Warm felt piano and soft pulsing synth pad, gentle marimba plucks, 92 bpm, minimal and uncluttered so a voice sits on top. "
         "Quiet, slightly tense first 30 seconds, then opens up brighter and warmer with light percussion, resolves gently at the end. No vocals.")
SFX = {
    "pop": ("Soft UI pop, a small rounded bubble pop for a number landing on screen, clean, no reverb", 0.5),
    "stamp": ("A rubber stamp hitting paper firmly on a desk, single thud, short", 0.7),
    "whoosh": ("Short soft airy whoosh transition, smooth, subtle", 0.8),
    "whoosh2": ("Gentle swish transition, light and quick, subtle", 0.6),
    "notify": ("Smartphone messaging app notification, two soft friendly tones, short", 0.9),
    "fire": ("Distant wildfire crackling ambience with soft wind, low and calm, no music", 8.0),
    "boing": ("Cute cartoon water droplet bounce, soft and playful, short", 0.6),
}


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"xi-api-key": key(), "Content-Type": "application/json"})
    try:
        return urllib.request.urlopen(req, timeout=300).read()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()[:400]}")


if sys.argv[1] == "music":
    length = int(float(sys.argv[2]) * 1000) if len(sys.argv) > 2 else 90000
    audio = post("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
                 {"prompt": MUSIC, "music_length_ms": length, "force_instrumental": True})
    (OUT / "music.mp3").write_bytes(audio); print("music ok")
else:
    for name, (text, dur) in SFX.items():
        if (OUT / f"{name}.mp3").exists():
            continue
        audio = post("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
                     {"text": text, "duration_seconds": dur, "prompt_influence": 0.5})
        (OUT / f"{name}.mp3").write_bytes(audio); print(name, "ok")
