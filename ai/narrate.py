"""Traceable, local-first descriptions of Firely API results."""
from __future__ import annotations

import re

from .intent import setting

_NUMBER = re.compile(r'(?<![\w])[-+]?\d+(?:[.,]\d+)?(?![\w])')
TEXT = {
 'es': {'calendar': 'Calendario', 'chart': 'Gráfica', 'value': 'valor', 'month': 'mes', 'year': 'año', 'none': 'No hay datos numéricos disponibles.', 'missing': 'Consulta de origen no disponible.', 'method': 'Metodología', 'cutoff': 'corte de datos', 'attr': 'Fuente', 'view': 'ver datos'},
 'en': {'calendar': 'Calendar', 'chart': 'Chart', 'value': 'value', 'month': 'month', 'year': 'year', 'none': 'No numeric data available.', 'missing': 'Source query unavailable.', 'method': 'Methodology', 'cutoff': 'data cutoff', 'attr': 'Source', 'view': 'view data'},
 'pt': {'calendar': 'Calendário', 'chart': 'Gráfico', 'value': 'valor', 'month': 'mês', 'year': 'ano', 'none': 'Não há dados numéricos disponíveis.', 'missing': 'Consulta de origem indisponível.', 'method': 'Metodologia', 'cutoff': 'corte dos dados', 'attr': 'Fonte', 'view': 'ver dados'},
}


def numbers_preserved(output: str, payload) -> bool:
    """Every numeric token in the proposed text must exist in API payload data."""
    from collections import Counter
    import json
    available = Counter(_NUMBER.findall(json.dumps(payload, ensure_ascii=False, default=str)))
    proposed = Counter(_NUMBER.findall(output))
    return all(available[number] >= count for number, count in proposed.items())


def _query(payload):
    query = payload.get('query') or payload.get('source_query')
    return query if isinstance(query, str) and query.startswith('/') and not query.startswith('//') else None


def describe(kind: str, payload: dict, lang: str = 'es', profile: str = 'brigadista', *, client=None) -> str:
    if kind not in ('calendar', 'chart') or lang not in TEXT or profile not in ('brigadista', 'cientifico'):
        raise ValueError('Invalid description parameters')
    if not isinstance(payload, dict):
        raise ValueError('payload must be an API result object')
    t = TEXT[lang]
    rows = payload.get('rows') or []
    metric = payload.get('metric', 'count')
    field = 'frp_harm' if metric == 'frp' else 'count_harm'
    usable = [r for r in rows if isinstance(r, dict) and isinstance(r.get(field), (int, float)) and not isinstance(r.get(field), bool)]
    query = _query(payload)
    if not query or not payload.get('methodology_version') or not payload.get('data_cutoff') or payload.get('attribution') != 'NASA FIRMS':
        return t['missing']
    cite = f" ({t['view']}: {query})" if query else f" ({t['missing']})"
    if usable:
        row = max(usable, key=lambda r: r[field])
        parts = [f"{t[k]} {row[k]}" for k in ('year', 'month') if k in row]
        detail = ', '.join(parts)
        sentence = f"{t[kind]}: {detail + ', ' if detail else ''}{t['value']} {row[field]}{cite}."
    else:
        sentence = t['none'] + cite + '.'
    version = payload.get('methodology_version')
    cutoff = payload.get('data_cutoff')
    attribution = payload.get('attribution', 'NASA FIRMS')
    # Metadata and attribution travel with every numerical statement.
    metadata = f"{t['method']}: {version or 'unknown'}; {t['cutoff']}: {cutoff or 'unknown'}; {t['attr']}: {attribution}{cite}."
    template = sentence + ' ' + metadata
    if not setting('ANTHROPIC_API_KEY'):
        return template
    try:
        if client is None:
            import anthropic
            client = anthropic.Anthropic(api_key=setting('ANTHROPIC_API_KEY'), timeout=5.0)
        response = client.messages.create(model=setting('FIRELY_LLM_MODEL', 'claude-sonnet-5-5'), max_tokens=180,
            system='Reword this description in the same language. Do not introduce numbers, change facts, or add claims. Return plain text only.',
            messages=[{'role': 'user', 'content': sentence}])
        proposed = ''.join(block.text for block in response.content if getattr(block, 'type', None) == 'text').strip()
        # The citation is appended by code, not entrusted to the model.
        if proposed and numbers_preserved(proposed, payload) and not re.search(r'https?://', proposed):
            proposed = re.sub(r'\s*\([^)]*(?:ver datos|view data|source query|consulta de origem)[^)]*\)\.?\s*$', '', proposed, flags=re.I)
            return proposed.rstrip('. ') + cite + '. ' + metadata
    except Exception:
        pass
    return template
