import { describe, expect, it } from 'vitest';
import { dayOfYear, ensoStep, formatNumber, clampContextRange, compactEventDates } from './helpers';

describe('analysis helpers', () => {
  it('computes UTC day of year across leap years', () => {
    expect(dayOfYear('2024-03-01')).toBe(61);
    expect(dayOfYear('2023-03-01')).toBe(60);
  });
  it('maps ONI to cool, neutral and warm diverging steps', () => {
    expect(ensoStep(-1.6)).toBe(0);
    expect(ensoStep(-0.5)).toBe(3);
    expect(ensoStep(0.5)).toBe(3);
    expect(ensoStep(1.6)).toBe(6);
    expect(ensoStep(null, 'La Niña')).toBe(1);
  });
  it('formats nulls and decimals', () => {
    expect(formatNumber(null, 'es')).toBe('—');
    expect(formatNumber(12.345, 'en', 1)).toBe('12.3');
  });
  it('limits context to five calendar years and the data cutoff', () => {
    expect(clampContextRange('2001-01-01', '2026-11-14')).toEqual(['2022-01-01', '2026-08-31']);
  });
});

describe('compactEventDates', () => {
 it('shows a compact same-month interval in the chosen language', () => {
  expect(compactEventDates('2021-03-16', '2021-03-31', 'en')).toBe('Mar 16–31, 2021');
  expect(compactEventDates('2021-03-16', '2021-03-31', 'es')).toBe('mar 16–31, 2021');
 });
 it('keeps both months when an event crosses a month boundary', () => {
  expect(compactEventDates('2021-03-31', '2021-04-02', 'en')).toBe('Mar 31 – Apr 2, 2021');
 });
});
