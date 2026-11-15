import { areaParams, type AreaCandidate, type CalendarResponse, type CalendarRow, type ContextRow, type Locality } from '../../api/client';
import { monthNames, type Lang } from '../../i18n';
import type { AreaSel } from '../../state/hash';

export function candidateArea(candidate: AreaCandidate): AreaSel | null {
  const bbox = typeof candidate.bbox === 'string' ? candidate.bbox.split(',').map(Number) : candidate.bbox;
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) return null;
  const [west, south, east, north] = bbox;
  if (west >= east || south >= north) return null;
  const box: [number, number, number, number] = [west, south, east, north];
  return { label: candidate.label, kind: 'bbox', bbox: box, area: { bbox: box.join(',') } };
}

export function calendarQuery(area: AreaSel, from: string, to: string): string {
  const params = areaParams(area.area);
  params.set('from', from);
  params.set('to', to);
  params.set('metric', 'count');
  params.set('reference', 'median');
  return `/calendar?${params}`;
}

export function returnPeriodQuery(area: AreaSel, year: number, month: number): string {
  const params = areaParams(area.area);
  params.set('year', String(year));
  params.set('month', String(month));
  return `/return-period?${params}`;
}

export function latestRow(rows: CalendarRow[]): CalendarRow | undefined {
  return [...rows].sort((a, b) => a.year - b.year || a.month - b.month).at(-1);
}

export function peakRow(rows: CalendarRow[]): CalendarRow | undefined {
  return rows.filter((row) => Number.isFinite(row.count_harm)).reduce<CalendarRow | undefined>((peak, row) =>
    !peak || (row.count_harm ?? -Infinity) > (peak.count_harm ?? -Infinity) ? row : peak, undefined);
}

export function largestLocalities(rows: Locality[], limit = 5): Locality[] {
  return rows.filter(row => row.pop != null && Number.isFinite(row.pop))
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function latestContextRow(rows: ContextRow[]): ContextRow | undefined {
  return [...rows].sort((a, b) => a.year - b.year || a.month - b.month).at(-1);
}

export function monthIndex(date: string): number {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
}

export function monthString(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

export function contextWindow(from: string, to: string, cutoff: string): { from: string; to: string } {
  const first = monthIndex('2001-01');
  const last = Number.isFinite(monthIndex(cutoff)) ? monthIndex(cutoff) : monthIndex('2026-08');
  const start = monthString(Math.max(first, monthIndex(from) - 12));
  const end = monthString(Math.min(last, monthIndex(to) + 12));
  const [endYear, endMonth] = end.split('-').map(Number);
  const endDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const lastDate = `${end}-${String(endDay).padStart(2, '0')}`;
  return { from: `${start}-01`, to: cutoff.slice(0, 10) < lastDate ? cutoff.slice(0, 10) : lastDate };
}

export function formatCount(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(value);
}

export function formatAnomaly(value: number, lang: Lang): string {
  return `${new Intl.NumberFormat(lang, { minimumFractionDigits: value < 10 ? 1 : 0, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)}×`;
}

export function localSummary(calendar: CalendarResponse, lang: Lang, profile: 'brigadista' | 'cientifico', referenceYears?: number | null): string {
  const rows = calendar.rows.filter((row) => Number.isFinite(row.count_harm));
  const peak = peakRow(rows), latest = latestRow(rows);
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  if (!peak || !latest) return {
    es: 'No hay detecciones armonizadas para resumir en este periodo.',
    en: 'There are no harmonized detections to summarize for this period.',
    pt: 'Não há detecções harmonizadas para resumir neste período.',
  }[lang];
  const peakMonth = `${monthNames[lang][peak.month - 1]} ${peak.year}`;
  const latestMonth = `${monthNames[lang][latest.month - 1]} ${latest.year}`;
  const ratio = latest.anomaly_ratio == null ? null : formatAnomaly(latest.anomaly_ratio, lang);
  const period = latest.return_period_years == null ? null : number.format(latest.return_period_years);
  const count = formatCount(peak.count_harm ?? 0, lang), recent = formatCount(latest.count_harm ?? 0, lang);
  if (profile === 'brigadista') {
    if (lang === 'en') return `Peak activity was ${count} detections in ${peakMonth}. The latest month, ${latestMonth}, had ${recent}. Check the map for where activity was concentrated.`;
    if (lang === 'pt') return `O pico foi de ${count} detecções em ${peakMonth}. O último mês, ${latestMonth}, teve ${recent}. Consulte o mapa para localizar a atividade.`;
    return `El máximo fue de ${count} detecciones en ${peakMonth}. El último mes, ${latestMonth}, registró ${recent}. Consulta el mapa para ubicar la actividad.`;
  }
  const percentile = latest.percentile == null ? null : number.format(latest.percentile);
  const years = referenceYears == null ? null : formatCount(referenceYears, lang);
  const estimated = rows.some((row) => row.is_estimated) || rows.some((row) => calendar.harmonization_uncertainty?.years_estimated?.includes(row.year));
  if (lang === 'en') return `Peak: ${count} harmonized detections in ${peakMonth}; latest: ${recent} in ${latestMonth}. Percentile: ${percentile ?? 'unavailable'}; reference: ${years ?? 'unknown'} years; anomaly: ${ratio ?? 'unavailable'}; estimated return period: ${period ?? 'unavailable'} years.${estimated ? ' Some years are estimated through sensor harmonization; compare them with this uncertainty in mind.' : ''}`;
  if (lang === 'pt') return `Pico: ${count} detecções harmonizadas em ${peakMonth}; último mês: ${recent} em ${latestMonth}. Percentil: ${percentile ?? 'indisponível'}; referência: ${years ?? 'desconhecida'} anos; anomalia: ${ratio ?? 'indisponível'}; período de retorno estimado: ${period ?? 'indisponível'} anos.${estimated ? ' Alguns anos são estimados pela harmonização dos sensores; considere essa incerteza na comparação.' : ''}`;
  return `Máximo: ${count} detecciones armonizadas en ${peakMonth}; último mes: ${recent} en ${latestMonth}. Percentil: ${percentile ?? 'no disponible'}; referencia: ${years ?? 'desconocida'} años; anomalía: ${ratio ?? 'no disponible'}; periodo de retorno estimado: ${period ?? 'no disponible'} años.${estimated ? ' Algunos años se estimaron mediante armonización de sensores; considera esa incertidumbre al compararlos.' : ''}`;
}
