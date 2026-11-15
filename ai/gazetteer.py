"""Offline name matching against Firely's processed geographic Parquet tables."""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from pathlib import Path

from shapely import wkb

from api.app import db
from .intent import fold

COUNTRIES = ('Mexico', 'Argentina')


def _key(value):
    value = fold(str(value or ''))
    # punctuation separates words: the LLM keeps 'Arteaga, Coahuila' as written, and 'arteaga,' must match 'arteaga'
    value = re.sub(r'[^\w\s-]', ' ', value)
    value = re.sub(r'\b(?:incendios?|fires?|wildfires?|queimas?|en|in|em|sierra|serra|mountains?|municipio|municipality|cidade|ciudad|de|del|da|do|the|province|provincia|estado|state)\b', ' ', value)
    return ' '.join(value.split())


def _bbox(geometry):
    if geometry is None:
        return None
    try:
        return list(wkb.loads(bytes(geometry)).bounds)
    except Exception:
        return None


def _rows(root: Path):
    for country in COUNTRIES:
        folder = root / 'geo' / country
        for table in ('admin_units', 'localities', 'protected_areas'):
            path = folder / f'{table}.parquet'
            if not path.is_file():
                continue
            with db.connection() as con:
                fields = {row[0] for row in con.execute('DESCRIBE SELECT * FROM read_parquet(?)', [str(path)]).fetchall()}
                if table == 'admin_units':
                    bbox = ('bbox_west,bbox_south,bbox_east,bbox_north' if 'bbox_west' in fields
                            else 'bbox_min_lon,bbox_min_lat,bbox_max_lon,bbox_max_lat')
                    rows = con.execute(f'SELECT name, code, parent_code, level, {bbox} FROM read_parquet(?)', [str(path)]).fetchall()
                    for name, code, parent, level, *box in rows:
                        yield dict(name=name, code=code, parent=parent, kind=level, country=country, bbox=list(box))
                elif table == 'localities':
                    code, parent = ('cvegeo', 'cve_ent' if country == 'Mexico' else 'adm1')
                    if country == 'Argentina':
                        code = 'geonameid'
                    rows = con.execute(f'SELECT name, {code}, {parent}, lon, lat FROM read_parquet(?)', [str(path)]).fetchall()
                    for name, code_value, parent_value, lon, lat in rows:
                        if lon is not None and lat is not None:
                            yield dict(name=name, code=str(code_value), parent=parent_value, kind='locality', country=country, bbox=[lon, lat, lon, lat])
                else:
                    name_col = 'name' if 'name' in fields else 'NAME'
                    code_col = 'SITE_PID' if 'SITE_PID' in fields else None
                    selection = f'{name_col}, {code_col}, geometry_wkb' if code_col else f'{name_col}, geometry_wkb'
                    for row in con.execute(f'SELECT {selection} FROM read_parquet(?)', [str(path)]).fetchall():
                        name, code_value, geometry = row if code_col else (row[0], None, row[1])
                        box = _bbox(geometry)
                        if box:
                            yield dict(name=name, code=code_value, parent=None, kind='protected_area', country=country, bbox=box)


def resolve(place_text: str | None, *, root: Path | None = None, limit: int = 10, margin: float = 0.06) -> dict:
    key = _key(place_text)
    if not key:
        return {'candidates': [], 'ambiguous': False}
    root = Path(root) if root is not None else db.processed_root()
    tokens = key.split()
    matches = []
    parent_names = {}
    for row in _rows(root):
        if row['kind'] in ('ent', 'adm1'):
            parent_names[str(row['code'])] = str(row['name'])
        name = _key(row['name'])
        if not name:
            continue
        # Exact name wins; a qualified place may include a parent name.
        exact = name == key
        partial = f' {name} ' in f' {key} ' or f' {key} ' in f' {name} '
        score = 1.0 if exact else (0.85 if partial else SequenceMatcher(None, key, name).ratio())
        if len(tokens) > 1 and not exact and not partial and name in tokens:
            score = 0.78
        if score < 0.72:
            continue
        matches.append({**row, 'score': round(score, 3)})
    tier = lambda r: 0 if r['kind'] in ('ent', 'mun', 'adm1', 'adm2') else (1 if r['kind'] == 'protected_area' else 2)
    # A parent qualifier in the text ('Arteaga, Coahuila') disambiguates a repeated place name; compare by
    # significant tokens because official names are longer ('Coahuila de Zaragoza').
    own = set(tokens)
    qualifier = {t for t in key.split() if len(t) >= 4}
    for r in matches:
        parent_name = parent_names.get(str(r['parent']), str(r['parent'] or ''))
        parent_tokens = {t for t in _key(parent_name).split() if len(t) >= 4}
        if r['parent'] and parent_tokens and parent_tokens & (qualifier - set(_key(r['name']).split())) and len(own) > 1:
            r['score'] = round(min(1.0, r['score'] + 0.12), 3)
    matches.sort(key=lambda r: (-r['score'], tier(r), r['country'], r['name']))
    output, seen = [], set()
    for r in matches:
        parent_label = parent_names.get(str(r['parent']), r['parent']) if r['parent'] else r['country']
        # The same place listed as an admin unit and as a locality counts once (admin unit wins, it sorts first).
        identity = (r['country'], fold(str(parent_label)), fold(str(r['name'])))
        if identity in seen:
            continue
        seen.add(identity)
        output.append({k: v for k, v in r.items() if k != 'name'} | {'label': f"{r['name']}, {parent_label}"})
        if len(output) >= limit:
            break
    # Ambiguous only among DIFFERENT places of the same tier with a close score (two Arteaga municipalities);
    # a hamlet with the same name does not make 'Chilecito' or 'Saltillo' ambiguous.
    top = output[0] if output else None
    rivals = [c for c in output[1:] if top and tier(c) == tier(top) and c['score'] >= top['score'] - margin]
    return {'candidates': output, 'ambiguous': bool(rivals)}
