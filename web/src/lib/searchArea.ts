import type { Area, AreaCandidate, ResolvedIntent } from '../api/client';

export function candidateArea(candidate: AreaCandidate): Area | null {
  const values = typeof candidate.bbox === 'string' ? candidate.bbox.split(',').map(Number) : candidate.bbox;
  if (values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [west, south, east, north] = values;
  if (west > east || south > north) return null;
  const padLon = west === east ? 0.1 : 0;
  const padLat = south === north ? 0.1 : 0;
  return { bbox: [Math.max(-180, west - padLon), Math.max(-90, south - padLat), Math.min(180, east + padLon), Math.min(90, north + padLat)].join(',') };
}

export function intentDates(intent: ResolvedIntent | undefined, currentFrom: string, currentTo: string, maxDate: string) {
  const minDate = '2000-01-01';
  const clamp = (value: string) => value < minDate ? minDate : value > maxDate ? maxDate : value;
  const valid = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const from = valid(intent?.date_from) ? clamp(intent.date_from) : currentFrom;
  const to = valid(intent?.date_to) ? clamp(intent.date_to) : currentTo;
  return { from: from <= to ? from : to, to };
}

export function dateIntentLabel(intent: ResolvedIntent | undefined): string | null {
  const from = intent?.date_from;
  const to = intent?.date_to;
  if (!from && !to) return null;
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from.slice(0, 7) === to.slice(0, 7)) {
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${from}T00:00:00Z`));
  }
  return [from, to].filter(Boolean).join(' – ');
}
