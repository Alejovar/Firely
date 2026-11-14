// Data-encoding colors. They are DATA, not styling, and they come from Astryx's own data tokens
// (`npx astryx docs tokens/tokens-data`) so themes and color modes stay in charge. Rules (dataviz skill):
// sequential = one hue, diverging = two hues + a neutral midpoint, series identity = categorical slots in a fixed
// order, and the "emphasis" form (one accent series over neutral context) when one series is the point.
import type { CalendarRow, Metric } from '../api/client';
import type { CalendarMode, } from '../state/hash';

export type Scheme = 'dark' | 'light';

/** Zero or missing cells recede into the surface. */
export const EMPTY_CELL = 'var(--color-background-muted)';

// five sequential steps; on a dark surface more activity is BRIGHTER, on a light one DARKER
const SEQ_LIGHT = ['--color-data-blue-1', '--color-data-blue-2', '--color-data-blue-3', '--color-data-blue-4', '--color-data-blue-5'] as const;
const SEQ_DARK = ['--color-data-blue-5', '--color-data-blue-4', '--color-data-blue-3', '--color-data-blue-2', '--color-data-blue-1'] as const;
// diverging: cool (below the reference) <- neutral -> warm (above), equal arms
const DIV = ['--color-data-blue-4', '--color-data-blue-3', '--color-data-blue-2', '--color-data-neutral', '--color-data-red-2', '--color-data-red-3', '--color-data-red-4'] as const;

export const cssVar = (name: string) => `var(${name})`;
export const sequentialSteps = (scheme: Scheme) => (scheme === 'dark' ? SEQ_DARK : SEQ_LIGHT).map(cssVar);
export const divergingSteps = () => DIV.map(cssVar);

/** Text that stays legible on top of a cell of the given step (index 0..n-1 of its ramp). */
export function onCellText(step: number, steps: number, scheme: Scheme, diverging = false): string {
  const bright = diverging ? step === 3 || step === 2 || step === 4 : (scheme === 'dark' ? step >= steps - 2 : step <= 1);
  return bright ? 'var(--color-text-on-light, #11151a)' : 'var(--color-text-on-dark, #ffffff)';
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
    return { background: divergingSteps()[step], color: onCellText(step, 7, scheme, true), step };
  }
  const value = metric === 'frp' ? row.frp_harm : row.count_harm;
  if (value == null || !Number.isFinite(value) || value <= 0) return { background: EMPTY_CELL, color: 'var(--color-text-secondary)', step: null };
  const step = seqStep(value, max);
  return { background: sequentialSteps(scheme)[step], color: onCellText(step, 5, scheme), step };
}

/** Star-chart series: the harmonized series is THE point (accent), raw series are neutral context told apart by dash. */
export const emphasisSeries = {
  harmonized: { stroke: 'var(--color-data-categorical-orange)', strokeWidth: 3, dash: undefined as string | undefined },
  modisRaw: { stroke: 'var(--color-data-neutral)', strokeWidth: 1.75, dash: undefined as string | undefined },
  viirsRaw: { stroke: 'var(--color-data-neutral)', strokeWidth: 1.75, dash: '6 4' },
} as const;

/** Categorical slots in FIXED order (never cycled): use for entities that must be told apart, e.g. countries. */
export const categorical = [
  'var(--color-data-categorical-blue)', 'var(--color-data-categorical-orange)', 'var(--color-data-categorical-teal)',
  'var(--color-data-categorical-purple)', 'var(--color-data-categorical-pink)', 'var(--color-data-categorical-green)',
] as const;

/** Shared axis/grid look for recharts so every chart reads as one system. */
export const chartInk = {
  axis: 'var(--color-text-secondary)',
  grid: 'var(--color-border-subtle, var(--color-background-muted))',
  tick: { fontSize: 12, fill: 'var(--color-text-secondary)' },
} as const;
