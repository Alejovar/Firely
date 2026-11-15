// Pure helpers for the 25-year animation (History page). No DOM, so vitest can cover them.
import type { AnimationFrames } from '../api/client';

/** Real-time length of the whole animation at speed 1x. */
export const ANIMATION_SECONDS = 30;

/** One fixed colour-scale top for the whole animation: the 99th percentile of the non-zero values, so a handful of
 *  extreme cell-months do not wash everything else into the darkest step. Never below 1. */
export function scaleTop(values: number[][], fallbackMax = 1): number {
  const positive: number[] = [];
  for (const row of values) for (const v of row) if (v > 0 && Number.isFinite(v)) positive.push(v);
  if (!positive.length) return Math.max(1, fallbackMax);
  positive.sort((a, b) => a - b);
  return Math.max(1, positive[Math.min(positive.length - 1, Math.floor(0.99 * (positive.length - 1)))]);
}

/** Position on the colour ramp, 0..1 (square root: the activity distribution is very skewed). 0 means "do not draw". */
export function rampT(value: number | undefined, top: number): number {
  if (!(value != null && value > 0) || !(top > 0)) return 0;
  return Math.sqrt(Math.min(value, top) / top);
}

/** Milliseconds per month so the full series lasts ANIMATION_SECONDS / speed. */
export function frameDelay(months: number, speed: number): number {
  return Math.max(16, (ANIMATION_SECONDS * 1000) / Math.max(1, months) / Math.max(0.1, speed));
}

/** "2001-03" -> "marzo de 2001" / "March 2001" / "março de 2001". */
export function monthLabel(ym: string | undefined, lang: 'es' | 'en' | 'pt'): string {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  const locale = lang === 'en' ? 'en-US' : lang === 'pt' ? 'pt-BR' : 'es-MX';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
}

/** First WebM type the browser can record, or null when MediaRecorder cannot do video. */
export function pickVideoMime(isSupported: ((t: string) => boolean) | undefined): string | null {
  if (!isSupported) return null;
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => { try { return isSupported(t); } catch { return false; } }) ?? null;
}

/** Bounding box of a set of rings, [west, south, east, north]. */
export function ringsBbox(rings: [number, number][][]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/** Sanity-check a response: every month row has one value per cell. */
export function validFrames(d: AnimationFrames | null | undefined): d is AnimationFrames {
  return !!d && Array.isArray(d.months) && Array.isArray(d.cells) && Array.isArray(d.values)
    && d.values.length === d.months.length && d.values.every(r => r.length === d.cells.length);
}

/** Country guess for the area the user is looking at (southern hemisphere -> Argentina). */
export function countryForLat(lat: number | undefined): 'Mexico' | 'Argentina' {
  return lat != null && lat < 0 ? 'Argentina' : 'Mexico';
}

export function videoFileName(country: string, months: string[]): string {
  const span = months.length ? `${months[0]}_${months[months.length - 1]}` : 'serie';
  return `firely-animacion-${country.toLowerCase()}-${span}.webm`;
}
