import { describe, expect, it } from 'vitest';
import { calendarCellValue, compact, newest } from './explorerLabels';

describe('explorer formatting', () => {
  it('finds the latest month even when the API rows are unsorted', () => {
    expect(newest([{year:2021,month:5},{year:2026,month:2},{year:2025,month:12}])).toEqual({year:2026,month:2});
  });
  it('keeps absent activity distinct from zero', () => {
    expect(compact(undefined,'es')).toBe('—');
    expect(compact(0,'es')).not.toBe('—');
  });
  it('keeps calendar cells compact without an estimate suffix', () => {
    expect(calendarCellValue(15.2,'es')).toBe('15');
    expect(calendarCellValue(9.54,'es')).toBe('9.5');
    expect(calendarCellValue(null,'es')).toBe('—');
  });
});

import { calendarQuery, monthRank, yearPhase } from './explorerLabels';
describe('calendar interpretation', () => {
  it('ranks a selected month among the same calendar months', () => {
    expect(monthRank([{year:2020,month:3,count_harm:10},{year:2021,month:3,count_harm:30},{year:2022,month:3,count_harm:20},{year:2022,month:4,count_harm:80}],{year:2022,month:3,count_harm:20})).toEqual({rank:2,total:3});
  });
  it('uses the most frequent non-neutral ENSO phase', () => {
    expect(yearPhase([{year:2020,month:1,enso_phase:'La Niña'},{year:2020,month:2,enso_phase:'El Niño'},{year:2020,month:3,enso_phase:'La Niña'},{year:2021,month:1,enso_phase:'neutral'}],2020)).toBe('nina');
    expect(yearPhase([{year:2021,month:1,enso_phase:'neutral'}],2021)).toBeNull();
  });
  it('builds the exact filtered calendar query', () => {
    expect(calendarQuery({admin:'05004'},'2020-01-01','2021-12-31','count','median','forestal')).toBe('/calendar?admin=05004&from=2020-01-01&to=2021-12-31&metric=count&reference=median&burn_type=forestal');
  });
});
