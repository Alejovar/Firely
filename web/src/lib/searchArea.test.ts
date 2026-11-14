import { describe, expect, it } from 'vitest';
import { candidateArea, dateIntentLabel, intentDates } from './searchArea';

describe('candidateArea', () => {
  it('pads point-like localities for a usable map view', () => {
    expect(candidateArea({ label: 'Arteaga', kind: 'locality', bbox: [-100, 25, -100, 25] })).toEqual({ bbox: '-100.1,24.9,-99.9,25.1' });
  });
  it('preserves a nondegenerate bbox', () => {
    expect(candidateArea({ label: 'Coahuila', bbox: [-103, 24, -99, 30] })).toEqual({ bbox: '-103,24,-99,30' });
  });
});

describe('intent dates', () => {
  it('clamps the parsed dates and renders a month chip', () => {
    expect(intentDates({ date_from: '1999-03-01', date_to: '2027-03-31' }, '2020-01-01', '2020-12-31', '2026-11-14')).toEqual({ from: '2000-01-01', to: '2026-11-14' });
    expect(dateIntentLabel({ date_from: '2021-03-01', date_to: '2021-03-31' })).toBe('marzo de 2021');
  });
});
