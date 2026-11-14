import { describe, expect, it } from 'vitest';
import { buildHash, defaultState, parseHash } from './hash';

describe('url state', () => {
  const base = defaultState(new Date('2026-11-14'));

  it('round-trips a bbox area, dates and options', () => {
    const state = { ...base, page: 'explorar' as const, metric: 'frp' as const, mode: 'anomaly' as const, selected: { year: 2021, month: 3 } };
    expect(parseHash(buildHash(state), base)).toEqual(state);
  });

  it('round-trips a point area and a drawn polygon', () => {
    const point = { ...base, area: { label: 'Punto', kind: 'point' as const, area: { lat: 25.43, lon: -100.95, radius_km: 20 } } };
    expect(parseHash(buildHash(point), base).area).toEqual(point.area);
    const geometry = JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
    const drawn = { ...base, area: { label: 'Área dibujada', kind: 'drawn' as const, area: { geometry } } };
    expect(parseHash(buildHash(drawn), base).area.area).toEqual({ geometry });
  });

  it('falls back to defaults on garbage and drops oversized polygons from the URL', () => {
    expect(parseHash('#/nada?area=bbox:1,2&from=hoy', base)).toEqual({ ...base, page: base.page });
    const huge = { ...base, area: { label: 'x', kind: 'drawn' as const, area: { geometry: 'g'.repeat(5000) } } };
    expect(buildHash(huge)).not.toContain('area=');
  });

  it('keeps the page', () => {
    expect(parseHash('#/metodo', base).page).toBe('metodo');
    expect(parseHash('#/asistente?x=1', base).page).toBe('asistente');
  });
});
