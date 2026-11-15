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

/** Who Gotita is talking to: anyone curious (plain words), a firefighter (operational) or a scientist (full detail). */
export type Profile = 'curioso' | 'brigadista' | 'cientifico';

/** Plain-language comparison with normal, from the API anomaly ratio (observed / reference median). */
export function versusNormal(ratio: number | null | undefined, lang: Lang): string | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  const w = { es: ['mucho más que lo normal', 'más que lo normal', 'parecido a lo normal', 'menos que lo normal'],
              en: ['much more than normal', 'more than normal', 'about normal', 'less than normal'],
              pt: ['muito mais que o normal', 'mais que o normal', 'parecido com o normal', 'menos que o normal'] }[lang];
  return ratio >= 2 ? w[0] : ratio >= 1.25 ? w[1] : ratio > 0.8 ? w[2] : w[3];
}

export function localSummary(calendar: CalendarResponse, lang: Lang, profile: Profile, referenceYears?: number | null): string {
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
  const vs = versusNormal(latest.anomaly_ratio, lang);
  if (profile === 'curioso') {
    if (lang === 'en') return `The month with the most fire was ${peakMonth}: satellites saw ${count} hot spots (each one is a hot place seen from space, not always a wildfire). In ${latestMonth} they saw ${recent}${vs ? `, ${vs} for that month` : ''}.`;
    if (lang === 'pt') return `O mês com mais fogo foi ${peakMonth}: os satélites viram ${count} pontos de calor (cada um é um lugar quente visto do espaço, nem sempre um incêndio). Em ${latestMonth} viram ${recent}${vs ? `, ${vs} para esse mês` : ''}.`;
    return `El mes con más fuego fue ${peakMonth}: los satélites vieron ${count} puntos de calor (cada uno es un lugar caliente visto desde el espacio, no siempre un incendio). En ${latestMonth} vieron ${recent}${vs ? `, ${vs} para ese mes` : ''}.`;
  }
  if (profile === 'brigadista') {
    if (lang === 'en') return `Peak activity was ${count} detections in ${peakMonth}. The latest month, ${latestMonth}, had ${recent}${ratio ? ` (${ratio} the usual for that month)` : ''}. Check the map for where activity was concentrated.`;
    if (lang === 'pt') return `O pico foi de ${count} detecções em ${peakMonth}. O último mês, ${latestMonth}, teve ${recent}${ratio ? ` (${ratio} o habitual para esse mês)` : ''}. Consulte o mapa para localizar a atividade.`;
    return `El máximo fue de ${count} detecciones en ${peakMonth}. El último mes, ${latestMonth}, registró ${recent}${ratio ? ` (${ratio} lo habitual para ese mes)` : ''}. Consulta el mapa para ubicar la actividad.`;
  }
  const percentile = latest.percentile == null ? null : number.format(latest.percentile);
  const years = referenceYears == null ? null : formatCount(referenceYears, lang);
  const estimated = rows.some((row) => row.is_estimated) || rows.some((row) => calendar.harmonization_uncertainty?.years_estimated?.includes(row.year));
  if (lang === 'en') return `Peak: ${count} harmonized detections in ${peakMonth}; latest: ${recent} in ${latestMonth}. Percentile: ${percentile ?? 'unavailable'}; reference: ${years ?? 'unknown'} years; anomaly: ${ratio ?? 'unavailable'}; estimated return period: ${period ?? 'unavailable'} years.${estimated ? ' Some years are estimated through sensor harmonization; compare them with this uncertainty in mind.' : ''}`;
  if (lang === 'pt') return `Pico: ${count} detecções harmonizadas em ${peakMonth}; último mês: ${recent} em ${latestMonth}. Percentil: ${percentile ?? 'indisponível'}; referência: ${years ?? 'desconhecida'} anos; anomalia: ${ratio ?? 'indisponível'}; período de retorno estimado: ${period ?? 'indisponível'} anos.${estimated ? ' Alguns anos são estimados pela harmonização dos sensores; considere essa incerteza na comparação.' : ''}`;
  return `Máximo: ${count} detecciones armonizadas en ${peakMonth}; último mes: ${recent} en ${latestMonth}. Percentil: ${percentile ?? 'no disponible'}; referencia: ${years ?? 'desconocida'} años; anomalía: ${ratio ?? 'no disponible'}; periodo de retorno estimado: ${period ?? 'no disponible'} años.${estimated ? ' Algunos años se estimaron mediante armonización de sensores; considera esa incertidumbre al compararlos.' : ''}`;
}

/** History of one calendar month in an area: how many complete years had at least one harmonized detection, the
 *  median and the largest month. Pure counting over API rows; years 2001-2011 are MODIS-based estimates. */
export interface MonthHistory { month: number; years: number; withFire: number; median: number; max?: { year: number; count: number }; firstYear?: number; lastYear?: number }
export function monthHistory(rows: CalendarRow[], month: number, lastCompleteYear: number): MonthHistory {
  const sel = rows.filter(r => r.month === month && r.year <= lastCompleteYear && Number.isFinite(r.count_harm));
  const values = sel.map(r => r.count_harm as number).sort((a, b) => a - b);
  const mid = values.length ? (values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2) : 0;
  const top = sel.reduce<CalendarRow | undefined>((m, r) => !m || (r.count_harm as number) > (m.count_harm as number) ? r : m, undefined);
  return { month, years: sel.length, withFire: sel.filter(r => (r.count_harm as number) >= 1).length, median: mid,
    max: top ? { year: top.year, count: top.count_harm as number } : undefined,
    firstYear: sel.length ? Math.min(...sel.map(r => r.year)) : undefined, lastYear: sel.length ? Math.max(...sel.map(r => r.year)) : undefined };
}

/** Months (YYYY-MM) between two ISO dates, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while ((y < ey || (y === ey && m <= em)) && out.length < 36) { out.push(`${y}-${String(m).padStart(2, '0')}`); m === 12 ? (y++, m = 1) : m++; }
  return out;
}

const FUTURE = {
  es: { out: (m: string, last: string) => `${m} está fuera del horizonte del pronóstico (llega hasta ${last}).`,
        hist: (n: number, of: number, m: string, a: number, b: number, med: string) => `Históricamente, en ${m} hubo detecciones en ${n} de ${of} años (${a}-${b}); mediana ${med} detecciones.`,
        likely: 'Si se repite el patrón histórico, lo más probable es que haya actividad.', unlikely: 'Históricamente ese mes suele no tener detecciones en esta área.',
        fc: (m: string, e: string, n: string) => `Para ${m} se esperan ~${e} ${e === '1' ? 'detección' : 'detecciones'} (normal ${n}).`, clim: (m: string, n: string) => `Para ${m} se muestra lo normal (${n} detecciones): aquí el modelo no supera a la climatología.`,
        note: 'Detección satelital no es incendio confirmado.',
        // curioso
        cOut: (m: string) => `${m} está demasiado lejos para pronosticarlo, pero te cuento qué ha pasado otros años:`,
        cHist: (n: number, of: number, m: string) => `en ${n} de ${of} años hubo fuego en ${m}.`,
        cOdds: ['Así que es muy probable que vuelva a haber.', 'Así que es probable que haya.', 'Puede pasar, pero no es lo más común.', 'Es raro que haya fuego ese mes aquí.'],
        cFc: (m: string, e: string, vs: string) => e === '0' || e === '1' ? `Para ${m} Gotita espera muy pocos puntos de calor (uno o ninguno), ${vs}.` : `Para ${m} Gotita espera unos ${e} puntos de calor, ${vs}.`,
        cClim: (m: string, n: string) => `Para ${m} lo normal son unos ${n} puntos de calor; Gotita no puede prometer más que eso aquí.`,
        cNote: 'Un punto de calor es algo caliente visto por satélite; no siempre es un incendio.',
        // científico
        sFc: (m: string, h: number, e: string, n: string, iv: string) => `${m} (h=${h}): ${e} detecciones esperadas (climatología ${n}${iv}).`,
        sProb: (b: number, n: number, a: number) => ` P(debajo/cerca/encima de lo normal) = ${b}/${n}/${a} %.`,
        sSkill: (s: number) => ` Skill contra climatología en la prueba 2023-2025: ${s > 0 ? '+' : ''}${s} %.`,
        sHist: (n: number, of: number, m: string, a: number, b: number, med: string, mx?: string) => `Climatología de ${m} ${a}-${b}: detecciones en ${n}/${of} años, mediana ${med}${mx ? `, máximo ${mx}` : ''} (2001-2011 estimados desde MODIS).`,
        sNote: (v: string) => `Modelo ${v}: LightGBM por horizonte, variables de fuego, clima NASA POWER y ONI; terciles calibrados en 2022.` },
  en: { out: (m: string, last: string) => `${m} is beyond the forecast horizon (it reaches ${last}).`,
        hist: (n: number, of: number, m: string, a: number, b: number, med: string) => `Historically, ${m} had detections in ${n} of ${of} years (${a}-${b}); median ${med} detections.`,
        likely: 'If the historical pattern holds, activity is likely.', unlikely: 'Historically that month usually has no detections in this area.',
        fc: (m: string, e: string, n: string) => `For ${m}, ~${e} ${e === '1' ? 'detection is' : 'detections are'} expected (normal ${n}).`, clim: (m: string, n: string) => `For ${m} the normal is shown (${n} detections): the model does not beat climatology here.`,
        note: 'A satellite detection is not a confirmed fire.',
        cOut: (m: string) => `${m} is too far ahead to forecast, but here is what happened in other years:`,
        cHist: (n: number, of: number, m: string) => `there was fire in ${m} in ${n} of ${of} years.`,
        cOdds: ['So it is very likely to happen again.', 'So it is likely.', 'It can happen, but it is not the most common.', 'Fire that month is rare here.'],
        cFc: (m: string, e: string, vs: string) => e === '0' || e === '1' ? `For ${m} Gotita expects very few hot spots (one or none), ${vs}.` : `For ${m} Gotita expects about ${e} hot spots, ${vs}.`,
        cClim: (m: string, n: string) => `For ${m} the normal is about ${n} hot spots; Gotita cannot promise more than that here.`,
        cNote: 'A hot spot is something hot seen by satellite; it is not always a wildfire.',
        sFc: (m: string, h: number, e: string, n: string, iv: string) => `${m} (h=${h}): ${e} expected detections (climatology ${n}${iv}).`,
        sProb: (b: number, n: number, a: number) => ` P(below/near/above normal) = ${b}/${n}/${a} %.`,
        sSkill: (s: number) => ` Skill vs climatology in the 2023-2025 test: ${s > 0 ? '+' : ''}${s} %.`,
        sHist: (n: number, of: number, m: string, a: number, b: number, med: string, mx?: string) => `${m} climatology ${a}-${b}: detections in ${n}/${of} years, median ${med}${mx ? `, maximum ${mx}` : ''} (2001-2011 estimated from MODIS).`,
        sNote: (v: string) => `Model ${v}: LightGBM per horizon, fire, NASA POWER climate and ONI predictors; terciles calibrated on 2022.` },
  pt: { out: (m: string, last: string) => `${m} está fora do horizonte da previsão (vai até ${last}).`,
        hist: (n: number, of: number, m: string, a: number, b: number, med: string) => `Historicamente, em ${m} houve detecções em ${n} de ${of} anos (${a}-${b}); mediana ${med} detecções.`,
        likely: 'Se o padrão histórico se repetir, o mais provável é que haja atividade.', unlikely: 'Historicamente esse mês costuma não ter detecções nesta área.',
        fc: (m: string, e: string, n: string) => `Para ${m} ${e === '1' ? 'espera-se ~1 detecção' : `esperam-se ~${e} detecções`} (normal ${n}).`, clim: (m: string, n: string) => `Para ${m} mostra-se o normal (${n} detecções): aqui o modelo não supera a climatologia.`,
        note: 'Detecção de satélite não é incêndio confirmado.',
        cOut: (m: string) => `${m} está longe demais para prever, mas conto o que aconteceu em outros anos:`,
        cHist: (n: number, of: number, m: string) => `houve fogo em ${m} em ${n} de ${of} anos.`,
        cOdds: ['Então é muito provável que aconteça de novo.', 'Então é provável.', 'Pode acontecer, mas não é o mais comum.', 'Fogo nesse mês é raro aqui.'],
        cFc: (m: string, e: string, vs: string) => e === '0' || e === '1' ? `Para ${m} a Gotita espera pouquíssimos pontos de calor (um ou nenhum), ${vs}.` : `Para ${m} a Gotita espera uns ${e} pontos de calor, ${vs}.`,
        cClim: (m: string, n: string) => `Para ${m} o normal são uns ${n} pontos de calor; a Gotita não pode prometer mais que isso aqui.`,
        cNote: 'Um ponto de calor é algo quente visto por satélite; nem sempre é um incêndio.',
        sFc: (m: string, h: number, e: string, n: string, iv: string) => `${m} (h=${h}): ${e} detecções esperadas (climatologia ${n}${iv}).`,
        sProb: (b: number, n: number, a: number) => ` P(abaixo/perto/acima do normal) = ${b}/${n}/${a} %.`,
        sSkill: (s: number) => ` Skill contra a climatologia no teste 2023-2025: ${s > 0 ? '+' : ''}${s} %.`,
        sHist: (n: number, of: number, m: string, a: number, b: number, med: string, mx?: string) => `Climatologia de ${m} ${a}-${b}: detecções em ${n}/${of} anos, mediana ${med}${mx ? `, máximo ${mx}` : ''} (2001-2011 estimados a partir do MODIS).`,
        sNote: (v: string) => `Modelo ${v}: LightGBM por horizonte, variáveis de fogo, clima NASA POWER e ONI; tercis calibrados em 2022.` },
} as const;

export interface FutureItem {
  target: string; horizon?: number; expected: number; normal: number; show: 'forecast' | 'climatology';
  probabilities?: { below: number; near: number; above: number }; interval?: [number, number]; skill?: number;
}
/** Template answer for a question about future months: forecast where the horizon reaches, history otherwise.
 *  Same numbers for every profile; only the wording and the amount of detail change. */
export function futureSummary(months: string[], items: FutureItem[], histories: Record<number, MonthHistory>, lang: Lang,
                              profile: Profile = 'brigadista', modelVersion?: string): string {
  const t = FUTURE[lang], fmt = (v: number) => formatCount(v, lang);
  const label = (ym: string) => `${monthNames[lang][Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const lastTarget = items.map(i => i.target).sort().at(-1);
  const parts: string[] = [];
  for (const ym of months) {
    const it = items.find(i => i.target === ym);
    const h = histories[Number(ym.slice(5, 7))];
    if (it) {
      if (profile === 'curioso') parts.push(it.show === 'forecast' ? t.cFc(label(ym), fmt(it.expected), versusNormal(it.normal > 0 ? it.expected / it.normal : null, lang) ?? '') : t.cClim(label(ym), fmt(it.normal)));
      else if (profile === 'cientifico') {
        if (it.show !== 'forecast') { parts.push(t.clim(label(ym), fmt(it.normal))); continue; }
        const iv = it.interval ? `; 10-90 % ${fmt(it.interval[0])}-${fmt(it.interval[1])}` : '';
        let line = t.sFc(label(ym), it.horizon ?? 0, fmt(it.expected), fmt(it.normal), iv);
        if (it.probabilities) line += t.sProb(Math.round(it.probabilities.below * 100), Math.round(it.probabilities.near * 100), Math.round(it.probabilities.above * 100));
        if (it.skill != null) line += t.sSkill(Math.round(it.skill * 100));
        parts.push(line);
      } else parts.push(it.show === 'forecast' ? t.fc(label(ym), fmt(it.expected), fmt(it.normal)) : t.clim(label(ym), fmt(it.normal)));
      continue;
    }
    if (profile === 'curioso') {
      parts.push(t.cOut(label(ym)));
      if (h && h.years) {
        parts.push(t.cHist(h.withFire, h.years, monthNames[lang][h.month - 1]));
        const share = h.withFire / h.years;
        parts.push(t.cOdds[share >= 0.8 ? 0 : share >= 0.5 ? 1 : share >= 0.2 ? 2 : 3]);
      }
      continue;
    }
    if (lastTarget) parts.push(t.out(label(ym), label(lastTarget)));
    if (h && h.years) {
      if (profile === 'cientifico') parts.push(t.sHist(h.withFire, h.years, monthNames[lang][h.month - 1], h.firstYear!, h.lastYear!, fmt(h.median), h.max ? `${fmt(h.max.count)} (${h.max.year})` : undefined));
      else {
        parts.push(t.hist(h.withFire, h.years, monthNames[lang][h.month - 1], h.firstYear!, h.lastYear!, fmt(h.median)));
        parts.push(h.withFire * 2 > h.years ? t.likely : t.unlikely);
      }
    }
  }
  parts.push(profile === 'curioso' ? t.cNote : profile === 'cientifico' && modelVersion ? `${t.note} ${t.sNote(modelVersion)}` : t.note);
  return parts.join(' ');
}
