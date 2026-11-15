// Data-encoding colors. They are DATA, not styling: every chart, map layer and calendar takes its colors from here.
// Rules (dataviz skill + Firely identity guide): counts = cividis (dark blue -> yellow, colour-blind safe, same in both
// modes), anomalies = diverging blue-white-red with a neutral midpoint, series identity = categorical slots in fixed order,
// and the "emphasis" form (one accent series over neutral context) when one series is the point.
// The ember accent is for UI only, never for data -- except the exposure markers on the map, which mark people at risk.
import type { CalendarRow, Metric } from '../api/client';
import type { CalendarMode, } from '../state/hash';

export type Scheme = 'dark' | 'light';

/** Zero or missing cells recede into the surface. */
export const EMPTY_CELL = 'light-dark(#e3e8e1, #1f2622)';

/** Cividis, sampled. 0 detections -> #00204D, maximum -> #FDE34A. */
export const CIVIDIS = ['#00204d', '#1f3a6e', '#4a5470', '#6f6f72', '#958f78', '#c0b26d', '#fde34a'] as const;
/** Diverging RdBu (reversed): below the reference = blue, above = red. */
export const DIVERGING = ['#2166ac', '#67a9cf', '#d1e5f0', '#f2f0eb', '#fddbc7', '#ef8a62', '#b2182b'] as const;
export const CIVIDIS_GRADIENT = `linear-gradient(90deg, ${CIVIDIS.join(', ')})`;
export const DIVERGING_GRADIENT = `linear-gradient(90deg, ${DIVERGING.join(', ')})`;

function hex(c: string) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
/** Continuous cividis lookup, t in 0..1. */
export function cividis(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (CIVIDIS.length - 1);
  const i = Math.min(CIVIDIS.length - 2, Math.floor(x)), f = x - i;
  const a = hex(CIVIDIS[i]), b = hex(CIVIDIS[i + 1]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',')})`;
}

const SEQ5 = [0, 0.25, 0.5, 0.75, 1].map(cividis);
export const cssVar = (name: string) => `var(${name})`;
/** Five sequential steps (cividis). The scheme argument is kept for callers; cividis reads on both surfaces. */
export const sequentialSteps = (_scheme?: Scheme) => SEQ5;
export const divergingSteps = () => [...DIVERGING];

/** Text that stays legible on top of a cell of the given step (index 0..n-1 of its ramp). */
export function onCellText(step: number, steps: number, _scheme: Scheme, diverging = false): string {
  const bright = diverging ? step >= 2 && step <= 4 : step >= steps - 2;
  return bright ? '#11151a' : '#ffffff';
}

export interface CellEncoding { background: string; color: string; step: number | null }

/** Quantize a value to 0..4 with a square-root scale (the activity distribution is very skewed). */
export function seqStep(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(4, Math.max(0, Math.floor(Math.sqrt(value / max) * 5)));
}
/** log2 ratio against the reference: 0.125x .. 8x map to the 7 diverging steps. */
export function divStep(ratio: number): number {
  return Math.max(0, Math.min(6, Math.round(3 + Math.log2(Math.max(0.125, ratio)))));
}

export function encodeCell(row: CalendarRow | undefined, mode: CalendarMode, metric: Metric, max: number, scheme: Scheme): CellEncoding {
  if (!row) return { background: 'transparent', color: 'var(--color-text-secondary)', step: null };
  if (mode === 'anomaly') {
    const ratio = row.anomaly_ratio;
    if (ratio == null || !Number.isFinite(ratio)) return { background: EMPTY_CELL, color: 'var(--color-text-secondary)', step: null };
    const step = divStep(ratio);
    return { background: DIVERGING[step], color: onCellText(step, 7, scheme, true), step };
  }
  const value = metric === 'frp' ? row.frp_harm : row.count_harm;
  if (value == null || !Number.isFinite(value)) return { background: EMPTY_CELL, color: 'var(--color-text-secondary)', step: null };
  if (value <= 0) return { background: CIVIDIS[0], color: '#ffffff', step: 0 };
  const t = max > 0 ? Math.sqrt(value / max) : 0;
  const step = seqStep(value, max);
  return { background: cividis(0.06 + 0.94 * t), color: onCellText(step, 5, scheme), step };
}

/** Selected calendar cell / big ratio badge: the brightest cividis yellow. */
export const SELECTED_FILL = CIVIDIS[CIVIDIS.length - 1];
export const SELECTED_INK = '#1a1c1e';

/** Map: fire radiative power. Grey for weak fires, cividis yellow for strong ones. */
export const FRP_STOPS: [number, string][] = [[0, '#7c7b78'], [5, '#958f78'], [15, '#bcaf6f'], [40, '#fde34a']];
export const FRP_LEGEND = ['#7c7b78', '#bcaf6f', '#fde34a'] as const;
/** KML export: the same three FRP classes as the map legend (MW thresholds, colour). */
export const FRP_CLASSES = [
  { id: 'bajo', label: 'bajo', min: 0, max: 15, color: FRP_LEGEND[0] },
  { id: 'medio', label: 'medio', min: 15, max: 40, color: FRP_LEGEND[1] },
  { id: 'alto', label: 'alto', min: 40, max: Infinity, color: FRP_LEGEND[2] },
] as const;
/** Map: recurrence (years burned), cividis from 1 year to the maximum. */
export const RECURRENCE_STOPS = [0.15, 0.4, 0.65, 0.85, 1].map(cividis);
/** Map overlays. */
export const mapInk = {
  protectedArea: '#7fb48a',
  exposedLocality: '#e8803f',
  otherLocality: '#8a9097',
  goes: '#67a9cf',
  semaphore: { red: '#b2182b', redGlow: 'rgba(178,24,43,.8)', amber: '#e0a526', green: '#4f9d69' },
  alertLabel: { bg: 'rgba(178,24,43,.16)', fg: 'light-dark(#9c1426, #e5707e)' },
  nina: 'light-dark(#2a6a96, #67a9cf)',
  nino: 'light-dark(#ad4422, #ef8a62)',
} as const;

/** Star-chart series: the harmonized series is THE point (accent), raw series are neutral context told apart by dash. */
export const emphasisSeries = {
  harmonized: { stroke: 'var(--color-data-categorical-orange)', strokeWidth: 3, dash: undefined as string | undefined },
  modisRaw: { stroke: 'var(--color-data-neutral)', strokeWidth: 1.75, dash: undefined as string | undefined },
  viirsRaw: { stroke: 'var(--color-data-neutral)', strokeWidth: 1.75, dash: '6 4' },
} as const;

/** Daily breakdown bars: cividis mid-tone, the picked day in full yellow. */
export const dailyBar = { base: '#958f78', picked: '#fde34a' } as const;

/** Categorical slots in FIXED order (never cycled): use for entities that must be told apart, e.g. countries. */
export const categorical = [
  'var(--color-data-categorical-blue)', 'var(--color-data-categorical-orange)', 'var(--color-data-categorical-teal)',
  'var(--color-data-categorical-purple)', 'var(--color-data-categorical-pink)', 'var(--color-data-categorical-green)',
] as const;

/** Shared axis/grid look for recharts so every chart reads as one system. */
export const chartInk = {
  axis: 'var(--color-text-secondary)',
  grid: 'var(--color-border-subtle, var(--color-background-muted))',
  tick: { fontSize: 11.5, fill: 'var(--color-text-secondary)', fontFamily: '"Atkinson Hyperlegible Next", system-ui, sans-serif' },
} as const;

/** A month is drawn hatched ("cloudy") when less than this share of the area was seen clear (MYD08 cloud fraction). */
export const CLOUDY_CLEAR_FRAC = 0.35;
/** Semaphore tag for the amber level. */
export const amberLabel = { bg: 'rgba(224,165,38,.18)', fg: 'light-dark(#7a5200, #e0a526)' } as const;

/** Priority index (0–100) per H3 cell: cividis, so "more urgent" is brighter, never the ember accent. */
export const PRIORITY_STOPS: [number, string][] = [0, 25, 50, 75, 100].map(v => [v, cividis(v / 100)]);
/** FWI forecast bars (cividis by value relative to the climatology) and the climatology reference line. */
export const fwiInk = { climatology: 'var(--color-text-secondary)' } as const;

/** 25-year animation: harmonized activity per H3 cell, t = sqrt(value / fixed top) in 0..1. Cividis from its first
 *  lifted step (the darkest navy disappears on the dark basemap) to yellow. Zero cells are not drawn at all. */
export const ANIMATION_RAMP: [number, string][] = [0, 0.25, 0.5, 0.75, 1].map(t => [t, cividis(0.14 + 0.86 * t)]);
export const ANIMATION_GRADIENT = `linear-gradient(90deg, ${ANIMATION_RAMP.map(([, c]) => c).join(', ')})`;
/** Burned-in video captions: a dark card with light ink, legible over either basemap. */
export const videoInk = { card: 'rgba(16,20,18,.78)', text: '#f1f3ef', muted: '#b9c0b7', estimated: '#e0a526' } as const;

/** Seasonal outlook (/forecast): tercile categories on the diverging scale (below = blue, above = red), and the
 *  expected-vs-normal bars (normal = neutral context, expected = accent). */
export const outlookInk = {
  below: DIVERGING[1], near: DIVERGING[3], above: DIVERGING[5],
  normal: 'var(--color-data-neutral)', expected: 'var(--color-data-categorical-orange)',
} as const;

/** Gotita (assistant mascot) glow behind the large figure, one per mode: decorative, not data. */
export const gotitaGlow = {
  curioso: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-data-categorical-green) 26%, transparent), transparent)',
  brigadista: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 28%, transparent), transparent)',
  cientifico: 'radial-gradient(closest-side, color-mix(in srgb, var(--color-data-categorical-blue) 28%, transparent), transparent)',
} as const;
