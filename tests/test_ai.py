import json
from datetime import date
from types import SimpleNamespace

import duckdb
import pytest
from shapely.geometry import box

from ai import gazetteer, intent, narrate
from api.app.ai_routes import ResolveRequest, resolve_area


@pytest.mark.parametrize(('phrase', 'place', 'start', 'end', 'lang'), [
 ('muéstrame los incendios en la sierra de Arteaga en marzo de 2021', 'sierra arteaga', '2021-03-01', '2021-03-31', 'es'),
 ('incendios en Arteaga de marzo a mayo de 2021', 'arteaga', '2021-03-01', '2021-05-31', 'es'),
 ('show fires in Saltillo in March 2021', 'saltillo', '2021-03-01', '2021-03-31', 'en'),
 ('show wildfires in Saltillo from March to May 2021', 'saltillo', '2021-03-01', '2021-05-31', 'en'),
 ('mostre incêndios em Chilecito em março de 2021', 'chilecito', '2021-03-01', '2021-03-31', 'pt'),
 ('incêndios em Chilecito de março a maio de 2021', 'chilecito', '2021-03-01', '2021-05-31', 'pt'),
 ('últimos 5 días en Arteaga', 'arteaga', '2026-11-10', '2026-11-14', 'es'),
 ('last 7 days in Saltillo', 'saltillo', '2026-11-08', '2026-11-14', 'en'),
 ('últimos 2 meses en Saltillo', 'saltillo', '2026-09-01', '2026-11-14', 'es'),
 ('invierno 2020 en Arteaga', 'arteaga', '2020-12-01', '2021-02-28', 'es'),
 ('winter 2020 in Saltillo', 'saltillo', '2020-12-01', '2021-02-28', 'en'),
 ('incendios en Arteaga 2021-03-05', 'arteaga', '2021-03-05', '2021-03-05', 'es'),
 ('incendios en Arteaga 2020', 'arteaga', '2020-01-01', '2020-12-31', 'es'),
])
def test_rules(phrase, place, start, end, lang):
    result = intent.rules(phrase, date(2026, 11, 14))
    assert (result['place_text'], result['date_from'], result['date_to'], result['lang']) == (place, start, end, lang)
    assert result['source'] == 'rules'


class FakeMessages:
    def __init__(self, content=None, fail=False):
        self.content = content
        self.fail = fail
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if self.fail:
            raise RuntimeError('offline')
        return SimpleNamespace(content=self.content)


def test_llm_tool_and_failure(monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'fake-test-key')
    block = SimpleNamespace(type='text', text=json.dumps({
        'place_text': 'Arteaga', 'date_from': '2021-03-01', 'date_to': '2021-03-31',
        'granularity': 'month', 'lang': 'es'}))
    fake = SimpleNamespace(messages=FakeMessages([block]))
    result = intent.extract('Arteaga en marzo de 2021', client=fake)
    assert result['source'] == 'llm'
    assert fake.messages.kwargs['messages'] == [{'role': 'user', 'content': 'Arteaga en marzo de 2021'}]
    fmt = fake.messages.kwargs['output_config']['format']
    assert fmt['type'] == 'json_schema' and 'coordinates' not in fmt['schema']['properties']
    assert 'tool_choice' not in fake.messages.kwargs  # forced tool use is rejected by current models
    assert fake.messages.kwargs['model'] == 'claude-haiku-5-5'
    fake.messages.fail = True
    assert intent.extract('Arteaga en marzo de 2021', client=fake)['source'] == 'rules'


def test_missing_key(monkeypatch):
    monkeypatch.setattr(intent, 'setting', lambda name, default=None: None)
    assert intent.extract('incendios en Arteaga en marzo de 2021')['source'] == 'rules'


def test_gazetteer_fixture(tmp_path):
    folder = tmp_path / 'geo' / 'Mexico'
    folder.mkdir(parents=True)
    con = duckdb.connect(':memory:')
    con.execute("SET memory_limit='1GB'")
    con.execute("CREATE TABLE admins AS SELECT * FROM (VALUES ('ent','05','Coahuila',NULL,-103.0,24.0,-100.0,29.0),('ent','16','Michoacán',NULL,-103.0,18.0,-101.0,20.0),('mun','05004','Arteaga','05',-101.0,25.0,-100.0,26.0),('mun','16010','Arteaga','16',-103.0,18.0,-102.0,19.0)) t(level,code,name,parent_code,bbox_west,bbox_south,bbox_east,bbox_north)")
    con.execute('COPY admins TO ? (FORMAT PARQUET)', [str(folder / 'admin_units.parquet')])
    con.execute("CREATE TABLE loc AS SELECT '050040001' cvegeo, 'Arteaga' AS name, '05' cve_ent, '004' cve_mun, -100.5 lon, 25.5 lat")
    con.execute('COPY loc TO ? (FORMAT PARQUET)', [str(folder / 'localities.parquet')])
    con.execute('CREATE TABLE areas(name VARCHAR, geometry_wkb BLOB)')
    con.execute('INSERT INTO areas VALUES (?, ?)', ['Sierra de Arteaga', box(-101, 25, -100, 26).wkb])
    con.execute('COPY areas TO ? (FORMAT PARQUET)', [str(folder / 'protected_areas.parquet')])
    result = gazetteer.resolve('Arteaga', root=tmp_path)
    assert result['ambiguous'] is True
    assert {c['code'] for c in result['candidates'] if c['kind'] == 'mun'} == {'05004', '16010'}
    assert gazetteer.resolve('Sierra de Arteaga', root=tmp_path)['candidates']
    # the LLM keeps punctuation as written: 'Arteaga, Coahuila' must still resolve to the Coahuila municipality
    qualified = gazetteer.resolve('Arteaga, Coahuila', root=tmp_path)
    assert qualified['candidates'][0]['code'] == '05004' and qualified['ambiguous'] is False


def test_narration_numbers_and_citation(monkeypatch):
    payload = {'query': '/calendar?admin=05004&from=2021-03-01', 'methodology_version': 'v1',
               'data_cutoff': '2026-08-31', 'attribution': 'NASA FIRMS',
               'rows': [{'year': 2021, 'month': 3, 'count_harm': 42}]}
    monkeypatch.setattr(narrate, 'setting', lambda name, default=None: 'fake' if name == 'ANTHROPIC_API_KEY' else default)
    bad = SimpleNamespace(messages=FakeMessages([SimpleNamespace(type='text', text='There were 999 fires.')]))
    output = narrate.describe('calendar', payload, 'en', client=bad)
    assert '999' not in output and '42' in output and 'view data: /calendar?' in output
    assert 'NASA FIRMS' in output and 'v1' in output and '2026-08-31' in output
    assert not narrate.numbers_preserved('999 fires', payload)
    assert '42' not in narrate.describe('calendar', {k: v for k, v in payload.items() if k != 'query'}, 'en')
    good = SimpleNamespace(messages=FakeMessages([SimpleNamespace(type='text', text='Peak value 42')]))
    assert 'Peak value 42 (view data:' in narrate.describe('chart', payload, 'en', client=good)


def test_router(monkeypatch):
    monkeypatch.setattr(intent, 'setting', lambda name, default=None: None)
    monkeypatch.setattr(gazetteer, 'resolve', lambda place: {'candidates': [], 'ambiguous': False})
    body = resolve_area(ResolveRequest(text='Arteaga en marzo de 2021'))
    assert body['source'] == 'rules' and body['attribution'] == 'NASA FIRMS'
    assert 'methodology_version' in body and 'data_cutoff' in body
