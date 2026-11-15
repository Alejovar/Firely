import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldStore, type PackStorage, canReadOffline, queryKey } from './fieldStore';
import { downloadFieldPack, fieldQueries } from './fieldDownload';
import { defaultState } from '../state/hash';
import { checkBackend, validateBackend } from './backend';

const provenance = { methodology_version: '1.2-test', data_cutoff: '2026-08-31', attribution: 'NASA FIRMS' };
const selection = { ...defaultState(new Date('2026-11-15')), from: '2021-01-01', to: '2021-12-31', selected: { year: 2021, month: 3 } };
function storage() {
  const files = new Map<string, string>();
  const driver: PackStorage = {
    list: async () => [...files.keys()], read: async name => files.get(name)!,
    write: async (name, text) => { files.set(name, text); }, remove: async name => { files.delete(name); },
  };
  return { files, store: new FieldStore(driver), driver };
}
const reply = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const goodFetch = () => vi.fn(async () => reply({ ...provenance, rows: [] }));
afterEach(() => vi.unstubAllGlobals());

describe('field packages', () => {
  it('survives a new store instance, preserves provenance, and deletes the package', async () => {
    const { driver, store } = storage();
    vi.stubGlobal('fetch', goodFetch());
    const pack = await downloadFieldPack('https://one.example/api', selection, new AbortController().signal, () => {}, store);
    const reopened = new FieldStore(driver);
    expect((await reopened.list(pack.backend))[0]).toMatchObject({ methodologyVersion: provenance.methodology_version, dataCutoff: provenance.data_cutoff });
    expect(await reopened.lookup(pack.backend, fieldQueries(selection)[0])).toMatchObject({ data: { ...provenance, rows: [] }, savedAt: pack.savedAt });
    await reopened.remove(pack.id);
    expect(await store.list(pack.backend)).toEqual([]);
  });

  it('never substitutes another backend, area, metric, or date', async () => {
    const { store } = storage(); vi.stubGlobal('fetch', goodFetch());
    await downloadFieldPack('https://one.example/api', selection, new AbortController().signal, () => {}, store);
    const path = fieldQueries(selection)[0];
    expect(await store.lookup('https://two.example/api', path)).toBeNull();
    expect(await store.lookup('https://one.example/api', path.replace('metric=count', 'metric=frp'))).toBeNull();
    expect(await store.lookup('https://one.example/api', path.replace('2021-01-01', '2020-01-01'))).toBeNull();
    expect(await store.lookup('https://one.example/api', path.replace('25.2', '24.2'))).toBeNull();
  });

  it('keeps the previous download when a required calendar update fails or contains mock data', async () => {
    const { files, store } = storage(); vi.stubGlobal('fetch', goodFetch());
    await downloadFieldPack('https://one.example/api', selection, new AbortController().signal, () => {}, store);
    const before = [...files.entries()];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(downloadFieldPack('https://one.example/api', selection, new AbortController().signal, () => {}, store)).rejects.toThrow('503');
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ...provenance, rows: [], mock: true })));
    await expect(downloadFieldPack('https://one.example/api', selection, new AbortController().signal, () => {}, store)).rejects.toThrow('simuladas');
    expect([...files.entries()]).toEqual(before);
    files.set('pack-interrupted.json', '{');
    expect(await store.list('https://one.example/api')).toHaveLength(1);
  });

  it('records unavailable optional analyses and never caches forecasts or recent detections', async () => {
    const { store } = storage();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/calendar?') ? reply({ ...provenance, rows: [] }) : new Response('', { status: 503 })));
    const pack = await downloadFieldPack('https://one.example/api', selection, new AbortController().signal, () => {}, store);
    expect(pack.resources).toHaveLength(2);
    expect(pack.unavailable.length).toBe(fieldQueries(selection).length - 2);
    for (const path of ['/risk/forecast', '/recent', '/spread', '/describe', '/subscriptions', '/priority/cells']) expect(canReadOffline(path)).toBe(false);
  });

  it('does not persist an aborted download or incompatible optional provenance', async () => {
    const { store } = storage(), controller = new AbortController();
    vi.stubGlobal('fetch', goodFetch());
    await expect(downloadFieldPack('https://one.example/api', selection, controller.signal, () => controller.abort(), store)).rejects.toThrow();
    expect(await store.list('https://one.example/api')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => reply({ ...provenance, rows: [], ...(url.includes('/calendar?') ? {} : { methodology_version: 'other' }) })));
    const pack = await downloadFieldPack('https://one.example/api', selection, new AbortController().signal, () => {}, store);
    expect(pack.resources).toHaveLength(2);
  });

  it('keys every filter and includes only the selected daily month', () => {
    expect(queryKey('/calendar?metric=count&bbox=1&from=2021')).toBe(queryKey('/calendar?from=2021&bbox=1&metric=count'));
    expect(fieldQueries(selection).some(path => path.startsWith('/calendar/daily?') && path.includes('month=3') && path.includes('year=2021'))).toBe(true);
    expect(fieldQueries({ ...selection, selected: null }).some(path => path.startsWith('/calendar/daily?'))).toBe(false);
  });
});

describe('remote backend settings', () => {
  it('requires HTTPS and refuses embedded credentials and query strings', () => {
    expect(validateBackend(' https://firely.example/api/// ', false)).toBe('https://firely.example/api');
    for (const url of ['http://firely.example/api', 'http://localhost:8081/api', 'https://user:pass@firely.example', 'https://firely.example?key=secret', 'https://firely.example/#fragment']) expect(() => validateBackend(url, false)).toThrow();
    expect(validateBackend('http://localhost:8081/api', true)).toBe('http://localhost:8081/api');
  });

  it('checks the actual API contract and rejects mock or non-Firely servers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ info: { title: 'Firely API (real)' }, paths: { '/calendar': {} } })));
    await expect(checkBackend('https://firely.example/api')).resolves.toBe('https://firely.example/api');
    vi.stubGlobal('fetch', vi.fn(async () => reply({ info: { title: 'Firely API (mock)' }, paths: { '/calendar': {} } })));
    await expect(checkBackend('https://firely.example/api')).rejects.toThrow('simulado');
    vi.stubGlobal('fetch', vi.fn(async () => reply({ info: { title: 'Other' }, paths: {} })));
    await expect(checkBackend('https://firely.example/api')).rejects.toThrow('compatible');
  });
});
