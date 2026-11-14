import { describe, expect, it } from 'vitest';
import { rawSeries, rankedModels, signed } from '../components/method/data';

describe('method data helpers', () => {
  it('joins raw sensors at the VIIRS transition without changing either input', () => {
    const rows = [{ year: 2011, modis_raw: 10, viirs_raw: null, harmonized: 20 }, { year: 2012, modis_raw: 11, viirs_raw: 35, harmonized: 32 }];
    expect(rawSeries(rows).map(row => row.raw_concat)).toEqual([10, 35]);
    expect(rows[0]).not.toHaveProperty('raw_concat');
  });
  it('ranks models by measured error', () => {
    const models = [{ label: 'b', annual_mape_pct: 5, cell_rmse_improvement_pct: 0, chosen: false }, { label: 'a', annual_mape_pct: 2, cell_rmse_improvement_pct: 0, chosen: true }];
    expect(rankedModels(models).map(model => model.label)).toEqual(['a', 'b']);
    expect(signed(-19.7, 1)).toBe('-19.7%');
  });
});
