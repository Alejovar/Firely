export type SeriesPoint = { year: number; modis_raw: number; viirs_raw: number | null; harmonized: number };
export type SeriesKey = 'modis_raw' | 'viirs_raw' | 'harmonized';

export function linePath(series: SeriesPoint[], key: SeriesKey, x: (year: number) => number, y: (value: number) => number): string {
  let started = false;
  return series.map((point) => {
    const value = point[key];
    if (value == null || !Number.isFinite(value)) { started = false; return ''; }
    const command = started ? 'L' : 'M';
    started = true;
    return `${command}${x(point.year).toFixed(2)},${y(value).toFixed(2)}`;
  }).filter(Boolean).join(' ');
}
