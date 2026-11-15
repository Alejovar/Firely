import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { UrlState } from '../state/hash';

export interface FieldResource { path: string; data: unknown }
export interface FieldPack {
  version: 1;
  id: string;
  backend: string;
  savedAt: string;
  selection: UrlState;
  resources: FieldResource[];
  unavailable: string[];
  bytes: number;
  methodologyVersion: string;
  dataCutoff: string;
  attribution: string;
}

export interface PackStorage {
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

const folder = 'firely-field-v1';
const options = { directory: Directory.Data, encoding: Encoding.UTF8 };
const fileStorage: PackStorage = {
  async list() {
    await Filesystem.mkdir({ path: folder, directory: Directory.Data, recursive: true }).catch(async error => {
      // A missing directory is expected on first use; permission and quota errors must surface.
      try { await Filesystem.stat({ path: folder, directory: Directory.Data }); } catch { throw error; }
    });
    return (await Filesystem.readdir({ path: folder, directory: Directory.Data })).files.map(file => file.name);
  },
  async read(name) {
    const { data } = await Filesystem.readFile({ ...options, path: `${folder}/${name}` });
    return typeof data === 'string' ? data : data.text();
  },
  async write(name, text) {
    await Filesystem.writeFile({ ...options, path: `${folder}/${name}`, data: text, recursive: true });
  },
  async remove(name) { await Filesystem.deleteFile({ directory: Directory.Data, path: `${folder}/${name}` }); },
};

// Canonical query keys include every filter and are scoped to the exact backend.
export function queryKey(path: string): string {
  const url = new URL(path, 'https://field.invalid');
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}

const historical = new Set(['/calendar', '/calendar/daily', '/season', '/analogs', '/events', '/context', '/weekday', '/night', '/territory', '/reported', '/return-period']);
export function canReadOffline(path: string): boolean { return historical.has(new URL(path, 'https://field.invalid').pathname); }

export class FieldStore {
  constructor(private storage: PackStorage = fileStorage) {}

  async list(backend: string): Promise<FieldPack[]> {
    const names = (await this.storage.list()).filter(name => /^pack-[a-z0-9-]+\.json$/.test(name));
    const packs: FieldPack[] = [];
    for (const name of names) {
      const text = await this.storage.read(name);
      let pack: FieldPack;
      try { pack = JSON.parse(text) as FieldPack; }
      catch { continue; } // An interrupted new download must not hide older complete files.
      if (!pack || typeof pack !== 'object') continue;
      if (pack.version === 1 && pack.backend === backend && Array.isArray(pack.resources)) packs.push(pack);
    }
    return packs.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async save(pack: FieldPack) {
    if (!/^[a-z0-9-]+$/.test(pack.id)) throw new Error('Identificador de descarga inválido.');
    const text = JSON.stringify(pack);
    if (new Blob([text]).size > 20 * 1024 * 1024) throw new Error('El área supera 20 MB. Reduce el periodo antes de descargarla.');
    await this.storage.write(`pack-${pack.id}.json`, text);
    // Every download uses a new file: an interrupted update never overwrites the previous snapshot.
  }

  async remove(id: string) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Identificador de descarga inválido.');
    await this.storage.remove(`pack-${id}.json`);
  }

  async lookup(backend: string, path: string) {
    if (!canReadOffline(path)) return null;
    const key = queryKey(path);
    for (const pack of await this.list(backend)) {
      const resource = pack.resources.find(row => queryKey(row.path) === key);
      if (resource) return { data: resource.data, savedAt: pack.savedAt, label: pack.selection.area.label };
    }
    return null;
  }
}

export const fieldStore = new FieldStore();
