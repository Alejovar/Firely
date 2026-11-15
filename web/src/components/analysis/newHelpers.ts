import type { CalendarRow, FireEvent, Locality, RecurrenceGeoJson } from '../../api/client';

export function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function cumulativeCalendar(rows: CalendarRow[], currentYear: number, analogYears: number[]) {
  const byYear = new Map<number, Map<number, CalendarRow>>();
  for (const row of rows) {
    if (row.month < 1 || row.month > 12) continue;
    if (!byYear.has(row.year)) byYear.set(row.year, new Map());
    byYear.get(row.year)!.set(row.month, row);
  }
  const totals = new Map<number, Array<number | null>>();
  const estimated = new Set<number>();
  for (const [year, months] of byYear) {
    let sum = 0;
    let complete = true;
    const values: Array<number | null> = [];
    for (let month = 1; month <= 12; month++) {
      const row = months.get(month);
      if (!row || row.count_harm == null) complete = false;
      if (row?.is_estimated) estimated.add(year);
      if (complete) sum += row!.count_harm!;
      values.push(complete ? sum : null);
    }
    totals.set(year, values);
  }
  return Array.from({ length: 12 }, (_, i) => {
    const historical = [...totals].filter(([year]) => year < currentYear).map(([, values]) => values[i]).filter((v): v is number => v != null);
    const p10 = percentile(historical, .1);
    const p90 = percentile(historical, .9);
    return { month: i + 1, p10, band: p10 == null || p90 == null ? null : p90 - p10, p90, median: percentile(historical, .5), current: totals.get(currentYear)?.[i] ?? null,
      analogs: analogYears.map(year => ({ year, value: totals.get(year)?.[i] ?? null, estimated: estimated.has(year) })) };
  });
}

export function recurrenceStats(data: RecurrenceGeoJson) {
  const years = data.features.map(f => f.properties.years_burned).filter(Number.isFinite);
  const histogram = [...new Set(years)].sort((a, b) => a - b).map(year => ({ year, cells: years.filter(n => n === year).length }));
  return { cells: years.length, atLeast3: years.filter(n => n >= 3).length, atLeast5: years.filter(n => n >= 5).length, maxYears: data.max_years_burned, histogram };
}

export function closestLocality(event: FireEvent, localities: Locality[]): Locality | null {
  let best: Locality | null = null;
  let distance = Infinity;
  for (const locality of localities) {
    const dy = (locality.lat - event.centroid_lat) * 111;
    const dx = (locality.lon - event.centroid_lon) * 111 * Math.cos(event.centroid_lat * Math.PI / 180);
    const d = Math.hypot(dx, dy);
    if (d < distance) { best = locality; distance = d; }
  }
  return best;
}
