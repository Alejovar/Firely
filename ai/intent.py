"""Extract place and time without allowing the model to supply facts or geometry."""
from __future__ import annotations

import json
import os
import re
import unicodedata
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path

MONTHS = {
    1: 'enero january janeiro', 2: 'febrero february fevereiro',
    3: 'marzo march marco março', 4: 'abril april', 5: 'mayo may maio',
    6: 'junio june junho', 7: 'julio july julho', 8: 'agosto august',
    9: 'septiembre setiembre september setembro', 10: 'octubre october outubro',
    11: 'noviembre november novembro', 12: 'diciembre december dezembro',
}
MONTH_INDEX = {word: number for number, names in MONTHS.items() for word in names.split()}
MONTH_PATTERN = '|'.join(sorted(MONTH_INDEX, key=len, reverse=True))


def setting(name: str, default: str | None = None) -> str | None:
    """Environment wins over simple repo-root .env values; never expose values."""
    if name in os.environ:
        return os.environ[name]
    path = Path(__file__).resolve().parents[1] / '.env'
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and key.strip() == name:
                return value.strip().strip('"\'')
    except OSError:
        pass
    return default


def fold(value: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKD', value.casefold()) if not unicodedata.combining(c))


def _month_end(year: int, month: int) -> str:
    return date(year, month, monthrange(year, month)[1]).isoformat()


def rules(text: str, today: date | None = None) -> dict:
    today = today or date.today()
    clean = fold(text)
    lang = 'pt' if re.search(r'\b(mostre|incendios|ultimos|meses|em|de janeiro|de marco)\b', clean) and ('mostre' in clean or 'em ' in clean or 'janeiro' in clean) else ('en' if re.search(r'\b(show|fires|wildfires|last|in|from|winter)\b', clean) else 'es')
    granularity = 'day' if re.search(r'\b(dias|days|dia|day)\b|\d{4}-\d{2}-\d{2}', clean) else ('year' if re.search(r'\b(anos|years|anos|ano|year)\b', clean) else 'month')
    start = end = None
    spans = []
    iso = list(re.finditer(r'\b(\d{4})-(\d{2})-(\d{2})\b', clean))
    if iso:
        try:
            dates = [date.fromisoformat(m.group()) for m in iso]
            start, end = min(dates).isoformat(), max(dates).isoformat()
            spans.extend(m.span() for m in iso)
        except ValueError:
            pass
    if start is None:
        relative = re.search(r'\b(?:ultimos|ultimas|last|past)\s+(\d+)\s+(dias|days|meses|months|anos|years)\b', clean)
        if relative:
            count, unit = int(relative[1]), relative[2]
            if unit in ('dias', 'days'):
                first = today - timedelta(days=count - 1)
            else:
                months = count * (12 if unit in ('anos', 'years') else 1)
                index = today.year * 12 + today.month - 1 - months
                first = date(index // 12, index % 12 + 1, 1)
            start, end = first.isoformat(), today.isoformat()
            spans.append(relative.span())
    if start is None:
        winter = re.search(r'\b(invierno|winter|inverno)\s+(20\d{2})\b', clean)
        if winter:
            year = int(winter[2]); start, end = f'{year}-12-01', _month_end(year + 1, 2)
            spans.append(winter.span())
    if start is None:
        pattern = rf'\b({MONTH_PATTERN})\b'
        matches = list(re.finditer(pattern, clean))
        years = list(re.finditer(r'\b(?:19|20)\d{2}\b', clean))
        if matches and years:
            year = int(years[-1].group()); first = MONTH_INDEX[matches[0].group()]; last = MONTH_INDEX[matches[-1].group()]
            last_year = year + (last < first)
            start, end = f'{year}-{first:02d}-01', _month_end(last_year, last)
            spans.extend(m.span() for m in matches + years)
        elif years:
            year = int(years[-1].group()); start, end = f'{year}-01-01', f'{year}-12-31'
            spans.extend(m.span() for m in years)
            granularity = 'year'
    # Remove dates and common request words, retaining geographic qualifiers.
    place = clean
    for a, b in sorted(spans, reverse=True):
        place = place[:a] + ' ' + place[b:]
    place = re.sub(r'\b(?:muestrame|mostrar|dame|quiero|ver|show|me|mostre|mostra|please|por favor|fires|wildfires|incendios|incendio|queimas|burns|en|in|em|de|del|da|do|el|la|los|las|the|from|to|a|hasta|ate|entre|between|during|durante|sobre|actividad|activity)\b', ' ', place)
    place = re.sub(r'[^\w\s-]', ' ', place)
    place = re.sub(r'\s+', ' ', place).strip()
    return {'place_text': place or None, 'date_from': start, 'date_to': end, 'granularity': granularity, 'lang': lang, 'source': 'rules'}


def _valid(value: dict) -> bool:
    if not isinstance(value, dict) or set(value) != {'place_text', 'date_from', 'date_to', 'granularity', 'lang'}:
        return False
    if value['granularity'] not in ('day', 'month', 'year') or value['lang'] not in ('es', 'en', 'pt'):
        return False
    if value['place_text'] is not None and (not isinstance(value['place_text'], str) or len(value['place_text']) > 250):
        return False
    try:
        for field in ('date_from', 'date_to'):
            if value[field] is not None:
                date.fromisoformat(value[field])
        return not (value['date_from'] and value['date_to'] and value['date_from'] > value['date_to'])
    except (TypeError, ValueError):
        return False


def extract(text: str, *, client=None, today: date | None = None) -> dict:
    if not text or not text.strip():
        raise ValueError('text is required')
    key = setting('ANTHROPIC_API_KEY')
    if not key:
        return rules(text, today)
    try:
        if client is None:
            import anthropic
            client = anthropic.Anthropic(api_key=key, timeout=5.0)
        schema = json.loads((Path(__file__).parent / 'prompts' / 'intent.schema.json').read_text())
        system = (Path(__file__).parent / 'prompts' / 'intent.md').read_text()
        response = client.messages.create(model=setting('FIRELY_LLM_MODEL', 'claude-sonnet-5-5'), max_tokens=256,
            system=system, messages=[{'role': 'user', 'content': text}],
            tools=[{'name': 'extract_intent', 'description': 'Extract place and dates only', 'input_schema': schema}],
            tool_choice={'type': 'tool', 'name': 'extract_intent'})
        for block in response.content:
            if getattr(block, 'type', None) == 'tool_use' and getattr(block, 'name', None) == 'extract_intent' and _valid(block.input):
                return {**block.input, 'source': 'llm'}
    except Exception:
        pass
    return rules(text, today)
