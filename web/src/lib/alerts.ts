// Alert subscriptions live on the server (GET/POST/DELETE /subscriptions). The browser keeps nothing but a change
// signal so the header counter refreshes after the Platform page adds or removes one.
import type { Area } from '../api/client';

const EVENT = 'firely:subscriptions';
export function notifySubscriptionsChanged(): void { window.dispatchEvent(new Event(EVENT)); }
export function onSubscriptionsChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** The server accepts h3, bbox, lat+lon(+radius_km) or admin; drawn polygons are not subscribable yet. */
export function subscribableArea(area: Area): Area | null {
  if ('geometry' in area) return null;
  return area;
}

/** Telegram chat ids are integers (groups are negative). */
export function parseChatId(text: string): number | null {
  const t = text.trim();
  if (!/^-?\d{3,20}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
