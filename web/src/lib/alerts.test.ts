import { describe, expect, it } from 'vitest';
import { parseChatId, subscribableArea } from './alerts';

describe('server alert subscriptions', () => {
  it('accepts Telegram chat ids, including negative group ids', () => {
    expect(parseChatId(' 123456789 ')).toBe(123456789);
    expect(parseChatId('-1001234567890')).toBe(-1001234567890);
    expect(parseChatId('abc')).toBeNull();
    expect(parseChatId('12')).toBeNull();
  });
  it('refuses drawn polygons (the server takes bbox, point, h3 or admin)', () => {
    expect(subscribableArea({ geometry: '{"type":"Polygon","coordinates":[]}' })).toBeNull();
    expect(subscribableArea({ bbox: '-100.9,25.2,-100.2,25.7' })).toEqual({ bbox: '-100.9,25.2,-100.2,25.7' });
  });
});
