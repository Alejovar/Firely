import { describe, expect, it } from 'vitest';
import { linePath, type SeriesPoint } from './harmonizationChart';

const points: SeriesPoint[] = [
  { year: 2001, modis_raw: 10, viirs_raw: null, harmonized: 20 },
  { year: 2002, modis_raw: 12, viirs_raw: 30, harmonized: 22 },
  { year: 2003, modis_raw: 14, viirs_raw: null, harmonized: 24 },
  { year: 2004, modis_raw: 16, viirs_raw: 35, harmonized: 26 },
];

describe('linePath', () => {
  it('breaks a line at missing sensor readings', () => {
    expect(linePath(points, 'viirs_raw', (year) => year - 2000, (value) => value))
      .toBe('M2.00,30.00 M4.00,35.00');
  });
  it('joins uninterrupted annual readings', () => {
    expect(linePath(points, 'harmonized', (year) => year - 2000, (value) => value))
      .toBe('M1.00,20.00 L2.00,22.00 L3.00,24.00 L4.00,26.00');
  });
});
