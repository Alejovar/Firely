import { afterEach, describe, expect, it, vi } from 'vitest';
const { lookup, dispatch } = vi.hoisted(() => ({ lookup: vi.fn(), dispatch: vi.fn() }));
vi.mock('./fieldStore', async importOriginal => ({ ...await importOriginal<typeof import('./fieldStore')>(), fieldStore: { lookup } }));
import { getCalendar, getRiskForecast } from '../api/client';
const area = { bbox: '-100.9,25.2,-100.2,25.7' };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('offline API fallback', () => {
  it('uses a downloaded historical response only on a network failure and announces its date', async () => {
    vi.stubGlobal('window', { dispatchEvent: dispatch });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    lookup.mockResolvedValue({ data: { rows: [] }, savedAt: '2026-11-15', label: 'Arteaga' });
    expect(await getCalendar(area, '2021-01-01', '2021-12-31', 'count', 'median')).toEqual({ rows: [] });
    expect(dispatch.mock.calls[0][0].detail).toEqual({ savedAt: '2026-11-15', label: 'Arteaga' });
  });
  it('does not mask HTTP errors with old data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(getCalendar(area, '2021-01-01', '2021-12-31', 'count', 'median')).rejects.toMatchObject({ status: 503 });
    expect(lookup).not.toHaveBeenCalled();
  });
  it('does not fall back for cancelled queries or live forecasts', async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(getCalendar(area, '2021-01-01', '2021-12-31', 'count', 'median', controller.signal)).rejects.toThrow();
    await expect(getRiskForecast(area)).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
});
