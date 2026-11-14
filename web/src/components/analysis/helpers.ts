import { divergingSteps } from '../../lib/dataviz';
import { monthShort, type Lang } from '../../i18n';

export function dayOfYear(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return NaN;
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}

export function ensoStep(oni: number | null, phase?: string | null): number {
  if (oni != null && Number.isFinite(oni)) {
    if (oni <= -1.5) return 0;
    if (oni <= -1) return 1;
    if (oni < -0.5) return 2;
    if (oni <= 0.5) return 3;
    if (oni < 1) return 4;
    if (oni < 1.5) return 5;
    return 6;
  }
  const p = (phase ?? '').toLowerCase();
  return /niña|nina|cold/.test(p) ? 1 : /niño|nino|warm/.test(p) ? 5 : 3;
}
export function ensoColor(oni: number | null, phase?: string | null): string {
  return divergingSteps()[ensoStep(oni, phase)];
}
export function formatNumber(value: number | null | undefined, lang: Lang, digits = 0): string {
  return value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat(({ es: 'es-MX', en: 'en-US', pt: 'pt-BR' } as const)[lang], { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}
export function clampContextRange(from: string, to: string): [string, string] {
  const end = to < '2026-08-31' ? to : '2026-08-31';
  const start = `${Number(end.slice(0, 4)) - 4}-01-01`;
  return [from > start ? from : start, end];
}

export function compactEventDates(start: string, end: string, lang: Lang): string {
  const a = start.slice(0, 10).split('-').map(Number);
  const b = end.slice(0, 10).split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some(x => !Number.isFinite(x)) || b.some(x => !Number.isFinite(x))) return `${start} – ${end}`;
  const months = monthShort[lang];
  if (a[0] === b[0] && a[1] === b[1]) return `${months[a[1] - 1]} ${a[2]}–${b[2]}, ${a[0]}`;
  if (a[0] === b[0]) return `${months[a[1] - 1]} ${a[2]} – ${months[b[1] - 1]} ${b[2]}, ${a[0]}`;
  return `${months[a[1] - 1]} ${a[2]}, ${a[0]} – ${months[b[1] - 1]} ${b[2]}, ${b[0]}`;
}
