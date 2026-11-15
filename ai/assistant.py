"""Gotita's conversation layer: decides whether a message asks for DATA (the app then queries the harmonized series)
or is a conversational/follow-up question (safety, what to do, what a figure means), and answers the latter in the
voice of the selected profile.

Rules that keep it honest (CLAUDE.md, principios de diseño):
* The model never produces figures: in an answer it may only repeat numbers that appear in the context the app sends
  (what it already showed). Anything that needs new numbers goes back as mode "data", with a standalone query the
  place search understands ("¿y en marzo?" after Arteaga -> "Arteaga, Coahuila en marzo").
* Safety advice is general and points to the authorities; it never replaces official instructions.
* Without the API key, or when the call fails, local rules and templates answer.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from .intent import fold, llm_model, rules, setting

PROFILES = ("curioso", "brigadista", "cientifico")
MAX_HISTORY = 6
SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["mode", "reply", "query"],
    "properties": {
        "mode": {"type": "string", "enum": ["data", "answer"]},
        "reply": {"type": "string"},
        "query": {"type": "string"},
    },
}


def _system(profile: str, lang: str, today: date) -> str:
    base = (Path(__file__).parent / "prompts" / "assistant.md").read_text(encoding="utf-8")
    return base.replace("{PROFILE}", profile).replace("{LANG}", lang).replace("{TODAY}", today.isoformat())


def _clip(text: str | None, n: int) -> str:
    return (text or "").strip()[:n]


def reply(message: str, profile: str = "curioso", lang: str = "es", history: list[dict] | None = None,
          context: dict | None = None, *, client=None, today: date | None = None) -> dict:
    """{"mode": "data"|"answer", "reply": str, "query": str, "source": "llm"|"rules"}"""
    profile = profile if profile in PROFILES else "curioso"
    lang = lang if lang in ("es", "en", "pt") else "es"
    today = today or date.today()
    context = context or {}
    key = setting("ANTHROPIC_API_KEY")
    if key or client is not None:
        try:
            if client is None:
                import anthropic
                client = anthropic.Anthropic(api_key=key, timeout=20.0)
            msgs = []
            for item in (history or [])[-MAX_HISTORY:]:
                role = "assistant" if item.get("role") == "assistant" else "user"
                text = _clip(item.get("text"), 1500)
                if text:
                    if msgs and msgs[-1]["role"] == role:
                        msgs[-1]["content"] += "\n" + text
                    else:
                        msgs.append({"role": role, "content": text})
            if msgs and msgs[0]["role"] == "assistant":
                msgs.pop(0)
            ctx = (f"<contexto>\nLugar consultado: {_clip(context.get('place'), 200) or 'ninguno'}\n"
                   f"Periodo: {_clip(context.get('period'), 60) or 'ninguno'}\n"
                   f"Lo que la app ya mostró (únicas cifras que puedes repetir):\n{_clip(context.get('summary'), 2500) or 'nada'}\n"
                   f"</contexto>\n\n<mensaje>\n{_clip(message, 2000)}\n</mensaje>")
            if msgs and msgs[-1]["role"] == "user":
                msgs[-1]["content"] += "\n\n" + ctx
            else:
                msgs.append({"role": "user", "content": ctx})
            response = client.messages.create(
                model=llm_model(), max_tokens=1500, system=_system(profile, lang, today), messages=msgs,
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}})
            if getattr(response, "stop_reason", None) not in ("refusal", "max_tokens"):
                for block in response.content:
                    if getattr(block, "type", None) == "text":
                        data = json.loads(block.text)
                        if data.get("mode") in ("data", "answer") and isinstance(data.get("reply"), str):
                            if data["mode"] == "answer" and not data["reply"].strip():
                                break
                            return {"mode": data["mode"], "reply": data["reply"].strip(),
                                    "query": (data.get("query") or "").strip()[:300], "source": "llm"}
                        break
        except Exception:  # noqa: BLE001 - any failure falls back to the local rules
            pass
    return local_reply(message, profile, lang, context, today)


# ------------------------------------------------------------------ local rules (no LLM)
SAFETY = re.compile(r"\b(resguard\w*|proteg\w*|evacu\w*|que hago|que debo hacer|que hacer|seguridad|prevenir|prevencion|"
                    r"kit|mochila|humo|casa|familia|mascota\w*|ganado|protect\w*|safe\w*|evacuat\w*|what should i do|"
                    r"proteger|seguranca|evacuar)\b")
EXPLAIN = re.compile(r"\b(que es|que significa|como se lee|por que|explica\w*|what is|what does|why|o que e)\b")
GREET = re.compile(r"^\s*(hola|buenas|buenos dias|hey|hi|hello|ola|oi|gracias|thanks|obrigad\w*)\b")

TEMPLATES = {
    "es": {
        "safety": {
            "curioso": "Lo más importante es estar preparado antes de que haya fuego cerca: ten a mano tus documentos, agua y medicinas en una mochila, y acuerda con tu familia a dónde irían. Si ves humo o fuego cerca, aléjate, llama al 911 y sigue lo que diga Protección Civil.",
            "brigadista": "Para resguardar personas y bienes:\n1. Limpia una franja de al menos 10 metros alrededor de la casa: pasto seco, hojas, leña y basura.\n2. Prepara una mochila: documentos, agua, medicinas, linterna, radio y cubrebocas.\n3. Define dos rutas de salida y un punto de reunión; incluye a niños, adultos mayores y mascotas.\n4. Si el fuego se acerca, no esperes: evacúa hacia donde ya se quemó o hacia zonas abiertas, nunca cuesta arriba.\n5. Llama al 911 y sigue a Protección Civil y CONAFOR.",
            "cientifico": "La protección depende de reducir combustible y exposición: una franja limpia de 10–30 m reduce la intensidad del frente cerca de las estructuras, y el riesgo crece con vegetación seca, viento y pendiente. Los puntos de calor satelitales indican actividad pasada, no la posición del frente: para decisiones en tiempo real hay que seguir a Protección Civil y CONAFOR (911 en México).",
        },
        "explain": {
            "curioso": "Un punto de calor es un lugar que un satélite vio más caliente que su alrededor. Casi siempre es fuego en vegetación, pero puede ser una quema agrícola. Firely junta los de dos satélites distintos para que se puedan comparar los años.",
            "brigadista": "Un punto de calor es una detección satelital de algo caliente: indica actividad, no el tamaño del incendio. Úsalo para ver dónde y cuándo suele haber fuego y si este mes va por encima o por debajo de lo normal.",
            "cientifico": "Cada punto es una detección activa de MODIS (1 km) o VIIRS (375 m). Firely las lleva a una unidad común, el equivalente de un VIIRS S-NPP, por celda H3 y mes; los años 2001–2011 son estimados y llevan banda de incertidumbre.",
        },
        "greet": "¡Hola! Pregúntame por el fuego de un lugar y un periodo, o qué hacer para protegerte.",
        "help": "Puedo contarte cómo ha sido el fuego en un lugar, cómo viene la temporada, o darte recomendaciones para protegerte. Prueba: «¿Cómo viene diciembre en Arteaga, Coahuila?»",
    },
    "en": {
        "safety": {
            "curioso": "Get ready before fire is near: keep documents, water and medicine in a bag and agree with your family where to go. If you see smoke or fire nearby, move away, call emergency services and follow the authorities.",
            "brigadista": "To protect people and property:\n1. Clear at least 10 m around the house: dry grass, leaves, firewood and trash.\n2. Pack a go-bag: documents, water, medicine, flashlight, radio, masks.\n3. Plan two exit routes and a meeting point; include children, elderly people and pets.\n4. If the fire approaches, leave early, toward burned or open ground, never uphill.\n5. Call emergency services and follow civil protection.",
            "cientifico": "Protection comes from reducing fuel and exposure: a cleared 10–30 m strip lowers fire intensity near structures, and risk rises with dry fuel, wind and slope. Satellite hotspots show past activity, not the fire front: follow civil protection for real-time decisions.",
        },
        "explain": {
            "curioso": "A hotspot is a place a satellite saw hotter than its surroundings. It is usually a vegetation fire, sometimes a farm burn. Firely joins two different satellites so years can be compared.",
            "brigadista": "A hotspot is a satellite detection of something hot: it shows activity, not fire size. Use it to see where and when fire usually happens and whether this month is above or below normal.",
            "cientifico": "Each hotspot is an active-fire detection from MODIS (1 km) or VIIRS (375 m). Firely maps them to one unit, an S-NPP VIIRS equivalent, per H3 cell and month; 2001–2011 are estimates with an uncertainty band.",
        },
        "greet": "Hi! Ask me about fire in a place and period, or how to stay safe.",
        "help": "I can tell you how fire has been in a place, how the season looks, or how to protect yourself. Try: “How does December look in Arteaga, Coahuila?”",
    },
    "pt": {
        "safety": {
            "curioso": "Prepare-se antes do fogo chegar: deixe documentos, água e remédios numa mochila e combine com a família para onde ir. Se vir fumaça ou fogo perto, afaste-se, ligue para a emergência e siga a Defesa Civil.",
            "brigadista": "Para proteger pessoas e bens:\n1. Limpe pelo menos 10 m ao redor da casa: capim seco, folhas, lenha e lixo.\n2. Prepare uma mochila: documentos, água, remédios, lanterna, rádio, máscaras.\n3. Defina duas rotas de saída e um ponto de encontro; inclua crianças, idosos e animais.\n4. Se o fogo se aproximar, saia cedo, para áreas já queimadas ou abertas, nunca morro acima.\n5. Ligue para a emergência e siga a Defesa Civil.",
            "cientifico": "A proteção vem de reduzir combustível e exposição: uma faixa limpa de 10–30 m diminui a intensidade perto das construções; o risco cresce com vegetação seca, vento e declive. Focos de calor mostram atividade passada, não a frente do fogo: siga a Defesa Civil.",
        },
        "explain": {
            "curioso": "Um foco de calor é um lugar que um satélite viu mais quente que o entorno. Geralmente é fogo na vegetação, às vezes queima agrícola. O Firely junta dois satélites diferentes para comparar os anos.",
            "brigadista": "Um foco de calor é uma detecção de satélite de algo quente: mostra atividade, não o tamanho do incêndio. Use para ver onde e quando costuma haver fogo e se este mês está acima ou abaixo do normal.",
            "cientifico": "Cada foco é uma detecção de fogo ativo do MODIS (1 km) ou do VIIRS (375 m). O Firely leva tudo a uma unidade comum, equivalente a um VIIRS S-NPP, por célula H3 e mês; 2001–2011 são estimativas com faixa de incerteza.",
        },
        "greet": "Olá! Pergunte sobre o fogo de um lugar e período, ou como se proteger.",
        "help": "Posso contar como foi o fogo num lugar, como vem a temporada, ou como se proteger. Experimente: «Como vem dezembro em Arteaga, Coahuila?»",
    },
}


def local_reply(message: str, profile: str, lang: str, context: dict, today: date) -> dict:
    t, clean = TEMPLATES[lang], fold(message)
    parsed = rules(message, today)
    if SAFETY.search(clean):
        return {"mode": "answer", "reply": t["safety"][profile], "query": "", "source": "rules"}
    if EXPLAIN.search(clean) and not parsed["date_from"]:
        return {"mode": "answer", "reply": t["explain"][profile], "query": "", "source": "rules"}
    if GREET.search(clean) and (not parsed["place_text"] or len(clean.split()) <= 3):
        return {"mode": "answer", "reply": t["greet"], "query": "", "source": "rules"}
    place = (context.get("place") or "").strip()
    if parsed["place_text"]:
        return {"mode": "data", "reply": "", "query": message.strip(), "source": "rules"}
    if parsed["date_from"] and place:  # "¿y en marzo?" after a place: keep the place
        return {"mode": "data", "reply": "", "query": f"{message.strip()} en {place}", "source": "rules"}
    return {"mode": "answer", "reply": t["help"], "query": "", "source": "rules"}
