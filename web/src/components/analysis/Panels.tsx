import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Table, type TableColumn } from '@astryxdesign/core/Table';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import * as stylex from '@stylexjs/stylex';
import type { AnalogsResponse, ContextResponse, EventsResponse, FireEvent, NightResponse, ReportedResponse, SeasonResponse, WeekdayResponse } from '../../api/client';
import type { Lang } from '../../i18n';
import { monthShort } from '../../i18n';
import { chartInk, categorical, divergingSteps, sequentialSteps, emphasisSeries } from '../../lib/dataviz';
import { dayOfYear, ensoColor, formatNumber, compactEventDates } from './helpers';

const words = {
 es: { season: 'Cada línea muestra el inicio y fin de la temporada; el punto marca el máximo.', trend: 'Cambio de inicio por década', observed: 'Solo años observados', all: 'Todos los años', caveat: 'La afirmación principal usa años observados: las estimaciones de 2001–2011 pueden contener artefactos del método.', analog: 'Compara esta temporada con tres años de evolución similar; la proyección es orientativa.', similar: 'Similitud', total: 'Total al cierre', projection: 'Proyección de detecciones al cierre', weak: 'Análogos débiles', weakDetail: 'La similitud es baja; usa esta proyección solo como indicación.', context: 'ONI muestra la fase climática mensual; la línea indica anomalía de peligro meteorológico donde hay datos.', fwi: 'Anomalía FWI', oni: 'ONI', events: 'Estos grupos de detecciones ayudan a priorizar la revisión de posibles incendios.', filter: 'Se excluyen grupos de un solo punto; se muestran grupos con al menos 3 detecciones.', reported: 'Compara incendios reportados por CONAFOR y puntos calientes detectados, en escalas separadas.', noReported: 'CONAFOR no tiene datos para este estado y año.', weekday: 'La distribución por día y la proporción nocturna describen detecciones, no sus causas.', noEffect: 'No hay evidencia de un efecto del día de la semana', effect: 'La distribución varía entre días; esto no identifica una causa.', night: 'Proporción nocturna por año', noData: 'No hay datos para este análisis en el área y rango elegidos.', choose: 'Prueba otra área o periodo.', gfw: 'GFWED solo cubre Coahuila y algunos años; no hay anomalías meteorológicas aquí.' },
 en: { season: 'Each line spans season onset to end; the dot marks the peak.', trend: 'Onset change per decade', observed: 'Observed years only', all: 'All years', caveat: 'The main claim uses observed years: 2001–2011 estimates may contain method artifacts.', analog: 'Compare this season with three similarly evolving years; the projection is indicative.', similar: 'Similarity', total: 'Year-end total', projection: 'Projected year-end detections', weak: 'Weak analogs', weakDetail: 'Similarity is low; treat this projection as indicative only.', context: 'ONI shows monthly climate phase; the line shows fire-weather anomaly where available.', fwi: 'FWI anomaly', oni: 'ONI', events: 'These detection groups help prioritize review of potential fires.', filter: 'Single-point clusters are excluded; groups have at least 3 detections.', reported: 'Compare CONAFOR reported fires and detected hotspots on separate scales.', noReported: 'CONAFOR has no data for this state and year.', weekday: 'Weekday distribution and night share describe detections, not causes.', noEffect: 'There is no evidence of a weekday effect', effect: 'The distribution varies by day; this does not identify a cause.', night: 'Night share by year', noData: 'No data for this analysis in the selected area and range.', choose: 'Try another area or period.', gfw: 'GFWED covers only Coahuila and some years; there are no fire-weather anomalies here.' },
 pt: { season: 'Cada linha vai do início ao fim da temporada; o ponto marca o pico.', trend: 'Mudança no início por década', observed: 'Somente anos observados', all: 'Todos os anos', caveat: 'A conclusão principal usa anos observados: estimativas de 2001–2011 podem conter artefatos do método.', analog: 'Compare esta temporada com três anos semelhantes; a projeção é indicativa.', similar: 'Semelhança', total: 'Total no fim do ano', projection: 'Projeção de detecções no fim do ano', weak: 'Análogos fracos', weakDetail: 'A semelhança é baixa; use a projeção apenas como indicação.', context: 'ONI mostra a fase climática mensal; a linha mostra anomalia meteorológica onde há dados.', fwi: 'Anomalia FWI', oni: 'ONI', events: 'Esses grupos de detecções ajudam a priorizar a revisão de possíveis incêndios.', filter: 'Grupos de um único ponto são excluídos; exibimos grupos com pelo menos 3 detecções.', reported: 'Compare incêndios reportados pela CONAFOR e focos detectados em escalas separadas.', noReported: 'A CONAFOR não tem dados para este estado e ano.', weekday: 'A distribuição semanal e a proporção noturna descrevem detecções, não causas.', noEffect: 'Não há evidência de efeito do dia da semana', effect: 'A distribuição varia entre dias; isso não identifica uma causa.', night: 'Proporção noturna por ano', noData: 'Não há dados para esta análise na área e período selecionados.', choose: 'Tente outra área ou período.', gfw: 'GFWED cobre apenas Coahuila e alguns anos; não há anomalias meteorológicas aqui.' },
} as const;
function Empty({ lang, description }: { lang: Lang; description?: string }) { const t = words[lang]; return <EmptyState title={t.noData} description={description ?? t.choose} />; }
function ChartCard({ title, lead, children, alternative }: { title: string; lead: string; children: React.ReactNode; alternative?: string }) { return <Card padding={5}><VStack gap={4} xstyle={styles.chart}><Heading level={3}>{title}</Heading><Text>{lead}</Text>{children}{alternative && <Text type="supporting" color="secondary">{alternative}</Text>}</VStack></Card>; }
const styles = stylex.create({ chart: { width: '100%', minWidth: 0 }, nowrap: { whiteSpace: 'nowrap' } });
const axis = { tick: chartInk.tick, axisLine: false, tickLine: false } as const;
const grid = <CartesianGrid stroke={chartInk.grid} vertical={false} />;

export function SeasonPanel({ data, lang }: { data: SeasonResponse; lang: Lang }) {
 const t = words[lang];
 if (!data.rows.length) return <Empty lang={lang} />;
 const rows = data.rows.map(row => ({ ...row, range: [dayOfYear(row.onset), dayOfYear(row.end)], peakDay: dayOfYear(row.peak) }));
 const color = sequentialSteps('dark')[2];
 const peakColor = categorical[1];
 const shape = (props: { x?: number; y?: number; width?: number; height?: number; payload?: typeof rows[number] }) => {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return <g />;
  const peakY = y + (payload.range[1] - payload.peakDay) / Math.max(1, payload.range[1] - payload.range[0]) * height;
  return <g><line x1={x + width / 2} x2={x + width / 2} y1={y} y2={y + height} stroke={color} strokeWidth={2} strokeDasharray={payload.is_estimated ? '4 4' : undefined} opacity={payload.is_estimated ? 0.55 : 1} /><circle cx={x + width / 2} cy={peakY} r={4} fill={peakColor} opacity={payload.is_estimated ? 0.55 : 1} /></g>;
 };
 const trend = (label: string, value: typeof data.trend.onset) => `${label}: ${formatNumber(value.sen_days_per_decade, lang, 1)} ${lang === 'en' ? 'days/decade' : lang === 'pt' ? 'dias/década' : 'días/década'}; p=${formatNumber(value.p_value, lang, 3)} (n=${value.n})`;
 return <VStack gap={4}>
  <ChartCard title={lang === 'es' ? 'Temporadas por año' : lang === 'pt' ? 'Temporadas por ano' : 'Seasons by year'} lead={t.season}>
   <ResponsiveContainer width="100%" height={300}><ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>{grid}<XAxis dataKey="year" {...axis} /><YAxis domain={[1, 366]} ticks={[1, 60, 121, 182, 244, 305, 366]} tickFormatter={v => monthShort[lang][Math.min(11, Math.floor((Number(v) - 1) / 30.5))]} {...axis} /><ChartTooltip formatter={(_v, _n, item) => { const p = item.payload as typeof rows[number]; return [`${p.onset} – ${p.end}; pico ${p.peak}${p.is_estimated ? ', estimado' : ''}`, String(p.year)]; }} /><Bar dataKey="range" name="Temporada" shape={shape} isAnimationActive={false} /></ComposedChart></ResponsiveContainer>
   <Text type="supporting">{lang === 'es' ? 'Azul = temporada, punto naranja = pico, línea discontinua = año estimado.' : lang === 'pt' ? 'Azul = temporada, ponto laranja = pico, linha tracejada = ano estimado.' : 'Blue = season, orange dot = peak, dashed line = estimated year.'}</Text>
   <Collapsible trigger={lang === 'es' ? 'Ver datos de la gráfica' : lang === 'pt' ? 'Ver dados do gráfico' : 'View chart data'} defaultIsOpen={false}><Table data={rows.map(r => ({ year: r.year, onset: r.onset, peak: r.peak, end: r.end, estimated: r.is_estimated ? (lang === 'en' ? 'Yes' : 'Sí') : (lang === 'en' ? 'No' : 'No') }))} columns={[{ key: 'year', header: lang === 'en' ? 'Year' : 'Año' }, { key: 'onset', header: lang === 'en' ? 'Start' : 'Inicio' }, { key: 'peak', header: lang === 'en' ? 'Peak' : 'Pico' }, { key: 'end', header: lang === 'en' ? 'End' : 'Fin' }, { key: 'estimated', header: lang === 'en' ? 'Estimated' : 'Estimado' }]} density="compact" /></Collapsible>
  </ChartCard>
  <Card padding={5}><VStack gap={3}><Text>{lang === 'es' ? 'La tendencia de inicio usa solo años observados de VIIRS.' : lang === 'pt' ? 'A tendência de início usa apenas anos observados por VIIRS.' : 'The onset trend uses observed VIIRS years only.'}</Text><Text type="label">{t.trend}</Text><Text type="supporting">{trend(t.observed, data.trend_observed_only.onset)}</Text><Text type="supporting">{t.caveat}</Text></VStack></Card>
 </VStack>;
}



const rangeStyles = stylex.create({
  track: { position: 'relative', width: '100%', height: '4.5rem', marginTop: 'var(--spacing-2)' },
  axis: { position: 'absolute', left: 0, right: 0, top: '1.25rem', height: '1px', backgroundColor: 'var(--color-border-subtle)' },
  range: { position: 'absolute', top: 'calc(1.25rem - 4px)', height: '8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-data-blue-3)' },
  median: { position: 'absolute', top: 'calc(1.25rem - 6px)', width: '12px', height: '12px', marginLeft: '-6px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-data-categorical-orange)', boxShadow: '0 0 0 2px var(--color-background-card)' },
  tick: { position: 'absolute', top: '1.75rem', width: '1px', height: '6px', backgroundColor: 'var(--color-text-secondary)' },
  label: { position: 'absolute', top: '2.5rem', whiteSpace: 'nowrap' },
});

/** p10-p90 range with the median marked; positions are percentages of the card width so sizes stay true at any width. */
function ProjectionRange({ p, lang }: { p: { p10: number; p50: number; p90: number }; lang: Lang }) {
  const max = Math.max(1, p.p90 * 1.08);
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const labels = [['p10', p.p10, '0%', 'start'], ['p50', p.p50, at(p.p50), 'middle'], ['p90', p.p90, at(p.p90), 'end']] as const;
  return <VStack xstyle={rangeStyles.track} role="img" aria-label={`p10 ${formatNumber(p.p10, lang)}; p50 ${formatNumber(p.p50, lang)}; p90 ${formatNumber(p.p90, lang)}`}>
    <VStack xstyle={rangeStyles.axis} />
    <VStack xstyle={rangeStyles.range} style={{ left: at(p.p10), width: `calc(${at(p.p90)} - ${at(p.p10)})` }} />
    <VStack xstyle={rangeStyles.median} style={{ left: at(p.p50) }} />
    {labels.map(([name, value, left, align]) => <VStack key={name} xstyle={rangeStyles.label} style={{ left: name === 'p10' ? at(p.p10) : left, transform: align === 'middle' ? 'translateX(-50%)' : align === 'end' ? 'translateX(-100%)' : undefined }}>
      <Text type="supporting" color="secondary">{name}, {formatNumber(value, lang)}</Text></VStack>)}
  </VStack>;
}

export function AnalogsPanel({ data, lang }: { data: AnalogsResponse; lang: Lang }) {
 const t = words[lang];
 if (!data.analogs.length) return <Empty lang={lang} />;
 const p = data.projection;
 return <VStack gap={4}><Text>{t.analog}</Text>{data.confidence === 'low' && <Banner status="warning" title={t.weak} description={t.weakDetail} />}
  <Grid columns={{ minWidth: 240, max: 3, repeat: 'fit' }} gap={3}>{data.analogs.slice(0, 3).map(a => <Card key={a.year} padding={4}><VStack gap={3}><HStack gap={2} wrap="wrap" vAlign="center"><Heading level={3}>{a.year}</Heading>{a.oni_phase && <Badge label={a.oni_phase} variant="blue" />}{a.is_estimated && <Badge label={lang === 'en' ? 'Estimated' : lang === 'pt' ? 'Estimado' : 'Estimado'} variant="neutral" />}</HStack><ProgressBar label={t.similar} value={Math.max(0, a.similarity * (a.similarity <= 1 ? 100 : 1))} max={100} hasValueLabel /><Text type="supporting">{t.total}: {formatNumber(a.year_end_count_harm, lang)} {lang === 'es' ? 'puntos' : lang === 'pt' ? 'pontos' : 'points'}</Text></VStack></Card>)}</Grid>
  {p ? <Card padding={5}><VStack gap={3}><Heading level={3}>{t.projection}</Heading><ProjectionRange p={p} lang={lang} /></VStack></Card> : <Empty lang={lang} />}
 </VStack>;
}

export function ContextPanel({ data, lang }: { data: ContextResponse; lang: Lang }) {
 const t = words[lang];
 if (!data.rows.length || data.rows.every(r => r.oni == null && r.fwi_anom == null)) return <Empty lang={lang} description={t.gfw} />;
 const hasFwi = data.rows.some(r => r.fwi_anom != null);
 const rows = data.rows.map(r => ({ ...r, label: `${monthShort[lang][r.month - 1]} ${r.year}` }));
 return <VStack gap={3}>
  <ChartCard title={t.oni} lead={lang === 'es' ? 'Índice oceánico de El Niño por mes.' : lang === 'pt' ? 'Índice oceânico El Niño por mês.' : 'Oceanic Niño Index by month.'} alternative={`${data.coverage}, ${rows.map(r => `${r.label}: ${formatNumber(r.oni, lang, 1)}`).join('; ')}`}>
   <VStack xstyle={styles.chart}><ResponsiveContainer width="100%" height={260}><BarChart data={rows} barCategoryGap="8%" margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>{grid}<XAxis dataKey="label" {...axis} minTickGap={32} /><YAxis {...axis} domain={[-2.5, 2.5]} /><ReferenceLine y={0.5} stroke={chartInk.axis} strokeDasharray="5 4" /><ReferenceLine y={-0.5} stroke={chartInk.axis} strokeDasharray="5 4" /><ChartTooltip /><Bar dataKey="oni" name={t.oni} fill={divergingSteps()[3]} isAnimationActive={false}>{rows.map((r, i) => <Cell key={i} fill={ensoColor(r.oni, r.enso_phase)} />)}</Bar></BarChart></ResponsiveContainer></VStack>
   <Text type="supporting">{lang === 'es' ? 'Azul = La Niña, neutro = neutral, rojo = El Niño, líneas discontinuas = ±0,5.' : lang === 'pt' ? 'Azul = La Niña, neutro = neutro, vermelho = El Niño, linhas tracejadas = ±0,5.' : 'Blue = La Niña, neutral = neutral, red = El Niño, dashed lines = ±0.5.'}</Text>
  </ChartCard>
  {hasFwi ? <ChartCard title={t.fwi} lead={lang === 'es' ? 'Anomalía meteorológica mensual de peligro de incendio.' : lang === 'pt' ? 'Anomalia meteorológica mensal de perigo de incêndio.' : 'Monthly fire-weather anomaly.'} alternative={rows.map(r => `${r.label}: ${formatNumber(r.fwi_anom, lang, 1)}`).join('; ')}>
   <VStack xstyle={styles.chart}><ResponsiveContainer width="100%" height={260}><ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>{grid}<XAxis dataKey="label" {...axis} minTickGap={32} /><YAxis {...axis} /><ReferenceLine y={0} stroke={chartInk.axis} /><ChartTooltip /><Line dataKey="fwi_anom" name={t.fwi} stroke={categorical[1]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></VStack>
  </ChartCard> : <EmptyState title={t.gfw} isCompact />}
 </VStack>;
}
interface EventTableRow extends Record<string, unknown> { id: string; position: number; globalRank: number; dates: string; duration: string; hotspots: string; frp: string; area: string; night: string }
export function EventsPanel({ data, lang }: { data: EventsResponse; lang: Lang }) {
 const t = words[lang];
 if (!data.rows.length) return <Empty lang={lang} />;
 const rows: EventTableRow[] = [...data.rows].sort((a, b) => b.frp_total - a.frp_total).map((e: FireEvent, index) => ({ id: e.event_id, position: index + 1, globalRank: e.rank, dates: compactEventDates(e.start_date, e.end_date, lang), duration: formatNumber(e.duration_days, lang), hotspots: formatNumber(e.n_hotspots_harm, lang), frp: formatNumber(e.frp_total, lang, 1), area: formatNumber(e.area_approx_km2, lang, 1), night: `${formatNumber(e.night_ratio * 100, lang, 1)} %` }));
 const columns: TableColumn<EventTableRow>[] = [
  { key: 'position', header: '#', renderCell: e => <Tooltip content={lang === 'es' ? `puesto ${e.globalRank} en el país` : lang === 'pt' ? `posição ${e.globalRank} no país` : `rank ${e.globalRank} nationally`}><Text>{e.position}</Text></Tooltip> },
  { key: 'dates', header: lang === 'en' ? 'Dates' : 'Fechas', renderCell: e => <Text xstyle={styles.nowrap}>{e.dates}</Text> },
  { key: 'duration', header: lang === 'en' ? 'Days' : 'Días' },
  { key: 'hotspots', header: lang === 'en' ? 'Hotspots' : 'Focos' },
  { key: 'frp', header: 'FRP total' },
  { key: 'area', header: 'km² aprox.' },
  { key: 'night', header: lang === 'en' ? 'Night' : 'Noche' },
 ];
 return <VStack gap={3}><Card padding={5}><VStack gap={3}><Heading level={3}>{lang === 'en' ? 'Ranked fire events' : 'Incendios detectados'}</Heading><Text>{t.events}</Text><Table data={rows} columns={columns} idKey="id" density="compact" isStriped /><Text type="supporting">{data.area_approx_note ?? (lang === 'en' ? 'Approximate area, not a mapped burn scar.' : 'Área aproximada, no superficie quemada cartografiada.')}</Text><Text type="supporting">{t.filter}</Text></VStack></Card></VStack>;
}

export function ReportedPanel({ data, lang }: { data: ReportedResponse; lang: Lang }) {
 const t = words[lang];
 if (!data.rows.length || data.rows.every(r => r.reported_fires == null)) return <Empty lang={lang} description={t.noReported} />;
 const rows = data.rows.map(r => ({ ...r, label: `${monthShort[lang][r.month - 1]} ${r.year}` }));
 const missingYears = [...new Set(data.rows.filter(r => !r.state_year_reported_data).map(r => r.year))];
 return <VStack gap={3}><Text>{t.reported}</Text>{missingYears.length > 0 && <Text type="supporting">{t.noReported} {missingYears.join(', ')}.</Text>}<Grid columns={{ minWidth: 260, max: 2, repeat: 'fit' }} gap={3}>
  <ChartCard title={lang === 'en' ? 'CONAFOR reported fires' : 'Incendios reportados, CONAFOR'} lead={data.coverage} alternative={rows.map(r => `${r.label}: ${formatNumber(r.reported_fires, lang)}`).join('; ')}><ResponsiveContainer width="100%" height={220}><BarChart data={rows}>{grid}<XAxis dataKey="label" {...axis} minTickGap={24} /><YAxis {...axis} /><ChartTooltip /><Bar dataKey="reported_fires" name="CONAFOR" fill={sequentialSteps('light')[3]} isAnimationActive={false} /></BarChart></ResponsiveContainer></ChartCard>
  <ChartCard title={lang === 'en' ? 'Detected hotspots' : 'Puntos calientes detectados'} lead={lang === 'en' ? 'Satellite detections in the state and year.' : 'Detecciones satelitales por estado y año.'} alternative={rows.map(r => `${r.label}: ${formatNumber(r.detected_hotspots_state_year, lang)}`).join('; ')}><ResponsiveContainer width="100%" height={220}><ComposedChart data={rows}>{grid}<XAxis dataKey="label" {...axis} minTickGap={24} /><YAxis {...axis} /><ChartTooltip /><Line dataKey="detected_hotspots_state_year" name="NASA FIRMS" stroke={emphasisSeries.harmonized.stroke} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></ChartCard>
 </Grid></VStack>;
}

export function WeekdayNightPanel({ data, lang }: { data: { weekday: WeekdayResponse; night: NightResponse }; lang: Lang }) {
 const t = words[lang];
 const dayNames = { es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], pt: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] }[lang];
 const weekday = data.weekday.counts_monday_first.map((count, i) => ({ day: dayNames[i], count }));
 const night = data.night.rows.map(r => ({ year: r.year, percent: r.night_ratio * 100 }));
 if (!weekday.some(r => r.count > 0) && !night.length) return <Empty lang={lang} />;
 return <VStack gap={3}><Text>{t.weekday}</Text><VStack gap={3}>
  <ChartCard title={lang === 'en' ? 'Detections by weekday' : 'Detecciones por día'} lead={`${data.weekday.summary_es}, n=${formatNumber(data.weekday.n_events, lang)} ${lang === 'en' ? 'events' : lang === 'pt' ? 'eventos' : 'eventos'}.`} alternative={weekday.map(r => `${r.day}: ${formatNumber(r.count, lang)}`).join('; ')}><ResponsiveContainer width="100%" height={220}><BarChart data={weekday}>{grid}<XAxis dataKey="day" {...axis} /><YAxis {...axis} domain={[0, 'auto']} /><ChartTooltip /><Bar dataKey="count" name="Detecciones" fill={sequentialSteps('light')[3]} isAnimationActive={false} /></BarChart></ResponsiveContainer><Text type="supporting">{data.weekday.p_value == null ? 'p: —' : `${data.weekday.p_value >= 0.05 ? t.noEffect : t.effect} (p=${formatNumber(data.weekday.p_value, lang, 3)}).`}</Text></ChartCard>
  {night.length ? <ChartCard title={t.night} lead={lang === 'en' ? 'Percentage of detections at night.' : 'Porcentaje de detecciones durante la noche.'} alternative={night.map(r => `${r.year}: ${formatNumber(r.percent, lang, 1)} %`).join('; ')}><ResponsiveContainer width="100%" height={220}><ComposedChart data={night}>{grid}<XAxis dataKey="year" {...axis} /><YAxis {...axis} unit="%" domain={[0, 100]} /><ChartTooltip /><Line dataKey="percent" name="Noche %" stroke={categorical[1]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></ChartCard> : <Empty lang={lang} />}
 </VStack></VStack>;
}
