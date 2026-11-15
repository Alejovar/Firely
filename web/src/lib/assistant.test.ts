import { describe, expect, it } from 'vitest';
import { calendarQuery, candidateArea, contextWindow, formatAnomaly, formatCount, largestLocalities, latestContextRow, latestRow, localSummary, peakRow, returnPeriodQuery } from '../components/assistant/helpers';
import type { CalendarResponse, ResolveAreaResponse } from '../api/client';

describe('assistant data helpers', () => {
  it('rejects malformed bounding boxes and preserves a valid candidate', () => {
    expect(candidateArea({ label: 'Bad', bbox: '1,2,1,3' })).toBeNull();
    expect(candidateArea({ label: 'Arteaga', bbox: [-101, 25, -100, 26] })?.area).toEqual({ bbox: '-101,25,-100,26' });
  });
  it('uses the exact calendar request parameters', () => {
    const area = candidateArea({ label: 'Arteaga', bbox: [-101, 25, -100, 26] })!;
    expect(calendarQuery(area, '2021-03-01', '2021-03-31')).toBe('/calendar?bbox=-101%2C25%2C-100%2C26&from=2021-03-01&to=2021-03-31&metric=count&reference=median');
  });
  it('chooses latest by date and peak by count', () => {
    const rows = [{ year: 2022, month: 1, count_harm: 4 }, { year: 2021, month: 12, count_harm: 8 }];
    expect(latestRow(rows)).toBe(rows[0]);
    expect(peakRow(rows)).toBe(rows[1]);
  });
  it('resolves an ambiguous Arteaga request through the selected calendar and local summary', () => {
    const resolved: ResolveAreaResponse = {
      ambiguous: true,
      intent: { place_text: 'sierra de Arteaga', date_from: '2021-03-01', date_to: '2021-03-31' },
      candidates: [
        { label: 'Arteaga, Coahuila', bbox: [-100.9, 25.2, -100.2, 25.7] },
        { label: 'Arteaga, Michoacán', bbox: [-102.5, 18.3, -101.8, 19] },
        { label: 'Arteaga, Santa Fe', bbox: [-61.5, -31, -60.8, -30.4] },
      ],
    };
    const options = resolved.candidates.map(candidateArea).filter((area) => area !== null);
    expect(resolved.ambiguous).toBe(true);
    expect(options).toHaveLength(3);
    expect(options.map((area) => area.label)).toEqual(['Arteaga, Coahuila', 'Arteaga, Michoacán', 'Arteaga, Santa Fe']);
    expect(calendarQuery(options[0], resolved.intent.date_from!, resolved.intent.date_to!)).toBe(
      '/calendar?bbox=-100.9%2C25.2%2C-100.2%2C25.7&from=2021-03-01&to=2021-03-31&metric=count&reference=median',
    );
    const calendar: CalendarResponse = {
      methodology_version: 'test-v1', data_cutoff: '2026-08-31', attribution: 'NASA FIRMS',
      rows: [
        { year: 2021, month: 3, count_harm: 42, anomaly_ratio: 2.5, return_period_years: 12 },
        { year: 2021, month: 2, count_harm: 10 },
      ],
    };
    expect(peakRow(calendar.rows)?.count_harm).toBe(42);
    expect(latestRow(calendar.rows)?.month).toBe(3);
    for (const lang of ['es', 'en', 'pt'] as const) {
      const summary = localSummary(calendar, lang, 'cientifico', 21);
      expect(summary).toContain('42');
      expect(summary).toContain(formatAnomaly(2.5, lang));
      expect(summary).toContain('12');
      expect(summary).toContain('21');
      expect(summary).not.toContain('Consulta de origen no disponible.');
    }
  });
  it('expands monthly context and clamps to available dates', () => {
    expect(contextWindow('2021-03-01', '2021-03-31', '2026-08-31')).toEqual({ from: '2020-03-01', to: '2022-03-31' });
    expect(contextWindow('2001-01-01', '2001-01-31', '2026-08-31').from).toBe('2001-01-01');
    expect(contextWindow('2026-08-01', '2026-08-31', '2026-08-31').to).toBe('2026-08-31');
    expect(contextWindow('2026-08-01', '2026-08-15', '2026-08-15').to).toBe('2026-08-15');
  });
  it('formats counts and anomaly by language', () => {
    expect(formatCount(866.4, 'es')).toBe('866');
    expect(formatAnomaly(108.2, 'es')).toBe('108×');
    expect(formatAnomaly(2.5, 'es')).toBe('2,5×');
    expect(formatAnomaly(2.5, 'en')).toBe('2.5×');
  });
  it('builds the exact return-period query', () => {
    const area = candidateArea({ label: 'Arteaga', bbox: [-101, 25, -100, 26] })!;
    expect(returnPeriodQuery(area, 2021, 3)).toBe('/return-period?bbox=-101%2C25%2C-100%2C26&year=2021&month=3');
  });
  it('orders populated localities and selects the latest weather month without changing API rows', () => {
    const localities = [
      { name: 'Small', pop: 10, lat: 1, lon: 1 },
      { name: 'Unknown', pop: null, lat: 2, lon: 2 },
      { name: 'Large', pop: 100, lat: 3, lon: 3 },
    ];
    expect(largestLocalities(localities, 2).map(row => row.name)).toEqual(['Large', 'Small']);
    expect(localities[0].name).toBe('Small');
    const months = [
      { year: 2025, month: 12, oni: null, enso_phase: 'La Niña', fwi_mean: null, fwi_anom: null, dc_anom: null, dmc_anom: null },
      { year: 2026, month: 2, oni: null, enso_phase: 'El Niño', fwi_mean: null, fwi_anom: 1.2, dc_anom: null, dmc_anom: null },
      { year: 2026, month: 1, oni: null, enso_phase: null, fwi_mean: null, fwi_anom: null, dc_anom: null, dmc_anom: null },
    ];
    expect(latestContextRow(months)?.month).toBe(2);
    expect(months[0].month).toBe(12);
  });
});
