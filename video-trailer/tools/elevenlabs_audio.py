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
    "boom": ("Deep cinematic movie trailer impact boom with heavy sub bass and long tail, powerful", 2.5),
    "boom2": ("Huge cinematic braam hit, dark brass and sub bass, trailer, short tail", 2.5),
    "riser": ("Cinematic tension riser building up, swelling strings and noise, ends abruptly", 3.0),
    "glitch": ("Digital glitch break, data corruption crackle and stutter, short", 1.0),
    "drone": ("Dark low cinematic drone with a slow heartbeat pulse, trailer underscore, no melody", 12.0),
    "pulse": ("Uplifting driving cinematic trailer music bed, pulsing synth arpeggio with taiko drums, 120 bpm, hopeful", 16.0),
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
