import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'firely.mobile.backend.v1';
export const isMobileApp = Capacitor.isNativePlatform() || import.meta.env.VITE_NATIVE_APP === '1';

export function validateBackend(value: string, allowLocal = import.meta.env.DEV || import.meta.env.VITE_USB_DEV === '1'): string {
  const url = new URL(value.trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocal && loopback && url.protocol === 'http:')) {
    throw new Error('Usa una dirección HTTPS pública para el servidor.');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('La dirección no debe contener credenciales, parámetros ni fragmentos.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function configuredBackend(): string {
  if (isMobileApp) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return validateBackend(stored);
    } catch { /* use the build configuration when storage is unavailable */ }
    const built = import.meta.env.VITE_API_URL;
    try { return built ? validateBackend(built) : ''; }
    catch { return ''; } // A bad build URL must not prevent opening the configuration screen.
  }
  return (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

export async function checkBackend(value: string, signal?: AbortSignal): Promise<string> {
  const base = validateBackend(value);
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(`${base}/openapi.json`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`El servidor respondió HTTP ${response.status}.`);
  const schema = await response.json();
  if (!String(schema.info?.title).startsWith('Firely API') || !schema.paths?.['/calendar']) {
    throw new Error('La dirección no corresponde a una API Firely compatible. Incluye /api si usas el proxy Docker.');
  }
  if (String(schema.info.title).includes('(mock)')) throw new Error('La API está en modo simulado. Activa FIRELY_API_MODE=real en el servidor.');
  return base;
}

export function rememberBackend(base: string) {
  localStorage.setItem(STORAGE_KEY, validateBackend(base));
}
