import { describe, expect, it } from 'vitest';
import { cumulativeCalendar, percentile, recurrenceStats } from './newHelpers';

describe('analysis data helpers', () => {
  it('interpolates percentiles without mutating data', () => {
    const values = [30, 10, 20];
    expect(percentile(values, .5)).toBe(20);
    expect(percentile(values, .1)).toBe(12);
    expect(values).toEqual([30, 10, 20]);
  });
  it('keeps missing months out of cumulative history', () => {
    const rows = [
      { year: 2023, month: 1, count_harm: 10 }, { year: 2023, month: 2, count_harm: 5 },
      { year: 2024, month: 1, count_harm: 20 }, { year: 2024, month: 3, count_harm: 7 },
      { year: 2025, month: 1, count_harm: 3 },
    ];
    const curve = cumulativeCalendar(rows, 2025, [2023]);
    expect(curve[0]).toMatchObject({ p10: 11, median: 15, p90: 19, current: 3 });
    expect(curve[1]).toMatchObject({ p10: 15, p90: 15, current: null });
    expect(curve[2].analogs[0].value).toBeNull();
  });
  it('counts recurrence thresholds over returned cells', () => {
    const data = { features: [1, 3, 5].map(years_burned => ({ properties: { years_burned } })), max_years_burned: 5 };
    expect(recurrenceStats(data as never)).toMatchObject({ cells: 3, atLeast3: 2, atLeast5: 1, maxYears: 5 });
  });
});
