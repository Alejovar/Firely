import { describe, expect, it } from 'vitest';
import { cellTextColor, colorFor, cividis, diverging } from './dataviz';

describe('calendar data colors', () => {
  it('maps count and anomaly values to the endpoints of their ramps', () => {
    expect(colorFor({ year: 2020, month: 1, count_harm: 0 }, 'count', 'count', 100)).toBe(cividis[0]);
    expect(colorFor({ year: 2020, month: 1, count_harm: 100 }, 'count', 'count', 100)).toBe(cividis[5]);
    expect(colorFor({ year: 2020, month: 1, anomaly_ratio: 1 }, 'anomaly', 'count', 100)).toBe(diverging[3]);
    expect(colorFor({ year: 2020, month: 1 }, 'anomaly', 'count', 100)).toBeUndefined();
  });
  it('uses contrasting labels on the darkest and lightest cells', () => {
    expect(cellTextColor(cividis[0])).not.toBe(cellTextColor(cividis[5]));
  });
});
