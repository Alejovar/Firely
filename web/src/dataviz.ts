import type { CalendarRow, Metric } from './api/client';

export const cividis = ['#00204d', '#31446b', '#666970', '#958f78', '#c8b866', '#fde34a'] as const;
export const diverging = ['#2166ac', '#67a9cf', '#d1e5f0', '#f2f0ec', '#fddbc7', '#ef8a62', '#b2182b'] as const;
export const seriesColors = {
  dark: { modis: '#3987e5', firely: '#d95926', viirs: '#199e70' },
  light: { modis: '#2a78d6', firely: '#eb6834', viirs: '#1baf7a' },
} as const;

export function colorFor(row: CalendarRow, mode: 'count' | 'anomaly', metric: Metric, max: number): string | undefined {
  if (mode === 'anomaly') {
    const ratio = row.anomaly_ratio;
    if (ratio == null || !Number.isFinite(ratio)) return undefined;
    return diverging[Math.max(0, Math.min(6, Math.round(3 + Math.log2(Math.max(0.125, ratio)))))];
  }
  const value = metric === 'frp' ? row.frp_harm : row.count_harm;
  if (value == null || !Number.isFinite(value)) return undefined;
  return cividis[Math.min(5, Math.floor(Math.sqrt(Math.max(0, value) / Math.max(1, max)) * 5.999))];
}

export function cellTextColor(color: string): string {
  const channels = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 145 ? '#11151a' : '#ffffff';
}
