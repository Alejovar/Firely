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
