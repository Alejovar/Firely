import { describe, expect, it } from 'vitest';
import { futureSummary, monthHistory, monthsBetween } from '../components/assistant/helpers';
import type { CalendarRow } from '../api/client';

const rows: CalendarRow[] = [];
for (let y = 2001; y <= 2026; y++) for (let m = 1; m <= (y === 2026 ? 10 : 12); m++) rows.push({ year: y, month: m, count_harm: m === 3 ? (y % 5 === 0 ? 0 : 10 + y - 2000) : 0 });

describe('future questions in the assistant', () => {
  it('counts the history of a calendar month over complete years only', () => {
    const h = monthHistory(rows, 3, 2025);
    expect(h.years).toBe(25);
    expect(h.withFire).toBe(20); // 2005, 2010, 2015, 2020, 2025 had none
    expect(h.max).toEqual({ year: 2024, count: 34 });
    expect([h.firstYear, h.lastYear]).toEqual([2001, 2025]);
  });
  it('lists the requested months', () => {
    expect(monthsBetween('2026-12-01', '2027-03-31')).toEqual(['2026-12', '2027-01', '2027-02', '2027-03']);
  });
  it('answers beyond the horizon with history and inside it with the forecast', () => {
    const histories = { 3: monthHistory(rows, 3, 2025) };
    const text = futureSummary(['2027-03'], [{ target: '2027-01', expected: 2, normal: 2.1, show: 'forecast' }], histories, 'es');
    expect(text).toContain('fuera del horizonte');
    expect(text).toContain('20 de 25 años');
    expect(text).toContain('lo más probable es que haya actividad');
    const inside = futureSummary(['2027-01'], [{ target: '2027-01', expected: 2, normal: 2.1, show: 'forecast' }], {}, 'es');
    expect(inside).toContain('se esperan');
  });
});
