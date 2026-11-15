import { expect, it, vi } from 'vitest';
const { write, share } = vi.hoisted(() => ({ write: vi.fn(async (_options: { path: string }) => ({ uri: 'file:///cache/export.csv' })), share: vi.fn() }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: write } }));
vi.mock('@capacitor/share', () => ({ Share: { share } }));
import { blobBase64, shareNativeFile } from './shareFile';
it('preserves UTF-8 CSV and binary image bytes when sharing through Android', async () => {
  const text = 'Área,quemas\nMéxico,42';
  const csv = new Blob([text], { type: 'text/csv' });
  expect(new TextDecoder().decode(Uint8Array.from(atob(await blobBase64(csv)), c => c.charCodeAt(0)))).toBe(text);
  expect(await blobBase64(new Blob([new Uint8Array([0, 128, 255])]))).toBe('AID/');
  await shareNativeFile('../Área.csv', csv);
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE', recursive: true, data: await blobBase64(csv) }));
  expect(write.mock.calls[0][0].path).not.toContain('../');
  expect(share).toHaveBeenCalledWith({ title: '../Área.csv', files: ['file:///cache/export.csv'] });
});
