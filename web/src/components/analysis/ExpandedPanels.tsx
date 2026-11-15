import * as stylex from '@stylexjs/stylex';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { AnalogsResponse, CalendarResponse, EventsResponse, RecurrenceGeoJson, RiskResponse, TerritoryResponse } from '../../api/client';
import type { Lang } from '../../i18n';
import { monthShort } from '../../i18n';
import { categorical, chartInk, dailyBar, emphasisSeries } from '../../lib/dataviz';
import { Box, Caption, Inline } from '../../ui/kit';
import { compactEventDates, formatNumber } from './helpers';
import { closestLocality, cumulativeCalendar, recurrenceStats } from './newHelpers';

const s = stylex.create({
  lead: { fontSize: '16px', lineHeight: 1.45, textWrap: 'pretty' },
  evGrid: { display: 'grid', gridTemplateColumns: '22px minmax(0, 1.6fr) minmax(0, 2fr) 40px 76px', gap: '6px 10px', alignItems: 'center', fontSize: '12.5px', '@media (max-width: 520px)': { gridTemplateColumns: '18px minmax(0, 1.4fr) minmax(0, 1.2fr) 30px 64px', gap: '6px' } },
  evRank: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-disabled)' },
  evName: { display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 },
  evTitle: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  evTop: { fontWeight: 600 },
  evSub: { fontSize: '11px', color: 'var(--color-text-disabled)' },
  evBarCell: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  evBar: { display: 'block', height: '10px', borderRadius: '2px', flexShrink: 0, minWidth: '2px' },
  evNum: { fontVariantNumeric: 'tabular-nums', fontSize: '11.5px', whiteSpace: 'nowrap' },
  chart: { width: '100%', minWidth: 0 },
  segment: { width: '100%', minHeight: 'var(--spacing-8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 'var(--spacing-3)', color: 'var(--color-text-on-dark)', overflow: 'hidden' },
  gauge: { width: '100%', height: 'var(--spacing-5)', overflow: 'hidden', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-background-muted)' },
  gaugeFill: { height: '100%', borderRadius: 'var(--radius-full)' },
  top: { backgroundColor: 'var(--color-background-muted)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)' },
  swatch: { width: 'var(--spacing-3)', height: 'var(--spacing-3)', borderRadius: 'var(--radius-sm)', flexShrink: 0 },
});
const copy = {
  es: { noData: 'No hay datos para esta área', try: 'Prueba otra área o periodo.', event: 'Evento', points: 'Puntos armonizados', days: 'Días', extent: 'Extensión ≈ km²', active: 'Activo', greatest: 'El incendio más grande del área es', of: 'el Nº 1 de', registered: 'eventos registrados', note: 'Eventos agrupados por cercanía: VIIRS ≤ 1,5 km, MODIS ≤ 3 km y fechas separadas ≤ 3 días. Extensión aproximada según píxeles detectados; no es superficie quemada.', cumulative: 'Acumulado del año vs. histórico', current: 'Año actual', median: 'Mediana histórica', band: 'p10–p90 histórico', analogs: 'Años parecidos', estimated: 'estimado', risk: 'Índice de riesgo', formula: 'v0: fórmula transparente', method: 'Ver método', exposed: 'Localidades más expuestas', components: 'Componentes del índice', territory: 'Territorio', area: 'Área', cells: 'Celdas H3', population: 'Población', admin: 'Municipio / estado', localities: 'Localidades', protected: 'Áreas protegidas', cover: 'Cobertura del suelo', distance: 'Distancia km', category: 'Categoría', recurrence: 'Recurrencia', atLeast: 'Celdas que ardieron', years: 'años o más', maximum: 'Máximo de años con fuego', histogram: 'Celdas por años con fuego' },
  en: { noData: 'No data for this area', try: 'Try another area or period.', event: 'Event', points: 'Harmonized points', days: 'Days', extent: 'Extent ≈ km²', active: 'Active', greatest: 'The largest fire in this area is', of: 'ranked No. 1 of', registered: 'recorded events', note: 'Events clustered by proximity: VIIRS ≤ 1.5 km, MODIS ≤ 3 km, and dates ≤ 3 days apart. Extent approximated from detected pixels; it is not burned area.', cumulative: 'Year to date vs. history', current: 'Current year', median: 'Historical median', band: 'historical p10–p90', analogs: 'Similar years', estimated: 'estimated', risk: 'Risk index', formula: 'v0: transparent formula', method: 'View method', exposed: 'Most exposed localities', components: 'Index components', territory: 'Territory', area: 'Area', cells: 'H3 cells', population: 'Population', admin: 'Municipality / state', localities: 'Localities', protected: 'Protected areas', cover: 'Land cover', distance: 'Distance km', category: 'Category', recurrence: 'Recurrence', atLeast: 'Cells burned', years: 'years or more', maximum: 'Maximum fire years', histogram: 'Cells by fire years' },
  pt: { noData: 'Sem dados para esta área', try: 'Tente outra área ou período.', event: 'Evento', points: 'Pontos harmonizados', days: 'Dias', extent: 'Extensão ≈ km²', active: 'Ativo', greatest: 'O maior incêndio da área é', of: 'o Nº 1 de', registered: 'eventos registrados', note: 'Eventos agrupados por proximidade: VIIRS ≤ 1,5 km, MODIS ≤ 3 km e datas separadas ≤ 3 dias. Extensão aproximada por pixels detectados; não é área queimada.', cumulative: 'Acumulado do ano vs. histórico', current: 'Ano atual', median: 'Mediana histórica', band: 'p10–p90 histórico', analogs: 'Anos semelhantes', estimated: 'estimado', risk: 'Índice de risco', formula: 'v0: fórmula transparente', method: 'Ver método', exposed: 'Localidades mais expostas', components: 'Componentes do índice', territory: 'Território', area: 'Área', cells: 'Células H3', population: 'População', admin: 'Município / estado', localities: 'Localidades', protected: 'Áreas protegidas', cover: 'Cobertura do solo', distance: 'Distância km', category: 'Categoria', recurrence: 'Recorrência', atLeast: 'Células queimadas', years: 'anos ou mais', maximum: 'Máximo de anos com fogo', histogram: 'Células por anos com fogo' },
} as const;
const empty = (lang: Lang) => <EmptyState title={copy[lang].noData} description={copy[lang].try} />;
const loc = (lang: Lang) => ({ es: 'es-MX', en: 'en-US', pt: 'pt-BR' })[lang];

interface EventRow extends Record<string, unknown> { id: string; rank: number; name: string; date: string; points: string; days: string; extent: string; active: boolean; top: boolean }
export function FireEvents({ data, territory, lang, live }: { data: EventsResponse; territory?: TerritoryResponse; lang: Lang; live: boolean }) {
  const t = copy[lang];
  if (!data.rows.length) return empty(lang);
  const ordered = [...data.rows].sort((a, b) => b.n_hotspots_harm - a.n_hotspots_harm);
  const cutoff = Date.parse(`${data.data_cutoff.slice(0, 10)}T00:00:00Z`);
  const rows: EventRow[] = ordered.map((e, i) => ({ id: e.event_id, rank: i + 1,
    name: closestLocality(e, territory?.localities ?? [])?.name ?? `${formatNumber(e.centroid_lat, lang, 3)}, ${formatNumber(e.centroid_lon, lang, 3)}`,
    date: compactEventDates(e.start_date, e.end_date, lang), points: formatNumber(e.n_hotspots_harm, lang), days: formatNumber(e.duration_days, lang), extent: `≈ ${formatNumber(e.area_approx_km2, lang, 2)}`,
    active: live && Number.isFinite(cutoff) && cutoff - Date.parse(`${e.end_date.slice(0, 10)}T00:00:00Z`) >= 0 && cutoff - Date.parse(`${e.end_date.slice(0, 10)}T00:00:00Z`) <= 3 * 86400000, top: i === 0 }));
  const shown = rows.slice(0, 8), peak = Math.max(1, ...ordered.slice(0, 8).map(e => e.n_hotspots_harm));
  return <VStack gap={3}>
    <Text xstyle={s.lead}>{t.greatest} <strong>{rows[0].name}</strong>: {t.of} {formatNumber(rows.length, lang)} {t.registered}.</Text>
    <Box xs={s.evGrid} role="table" aria-label={t.event}>
      <Box role="row" style={{ display: 'contents' }}>{['#', t.event, t.points, t.days, t.extent].map(h => <Caption key={h} role="columnheader">{h}</Caption>)}</Box>
      {shown.map((r, i) => <Box key={r.id} role="row" style={{ display: 'contents' }}>
        <Inline role="cell" xs={s.evRank}>{r.rank}</Inline>
        <Inline role="cell" xs={s.evName}><Inline xs={[s.evTitle, r.top && s.evTop]}>{r.name}</Inline><Inline xs={s.evSub}>{r.date}{r.active ? `, ${t.active}` : ''}</Inline></Inline>
        <Inline role="cell" xs={s.evBarCell}><Inline xs={s.evBar} style={{ width: `calc((100% - 52px) * ${ordered[i].n_hotspots_harm / peak})`, backgroundColor: r.top ? dailyBar.picked : dailyBar.base }} /><Inline xs={s.evNum}>{r.points}</Inline></Inline>
        <Inline role="cell" xs={s.evNum}>{r.days}</Inline>
        <Inline role="cell" xs={s.evNum}>{r.extent}</Inline>
      </Box>)}
    </Box>
    <Text type="supporting" color="secondary">{t.note}</Text>
  </VStack>;
}

export function CumulativeChart({ calendar, analogs, lang, currentYear }: { calendar: CalendarResponse; analogs: AnalogsResponse; lang: Lang; currentYear: number }) {
  const t = copy[lang];
  const years = analogs.analogs.slice(0, 3).map(a => a.year);
  const curve = cumulativeCalendar(calendar.rows, currentYear, years);
  if (!curve.some(row => row.current != null || row.median != null)) return empty(lang);
  const throughMonth = Number(analogs.date.slice(5, 7));
  const rows = curve.map(row => ({ ...row, current: row.month < throughMonth ? row.current : row.month === throughMonth ? analogs.current_count_harm : null, label: monthShort[lang][row.month - 1], ...Object.fromEntries(row.analogs.map(a => [`year${a.year}`, a.value])) }));
  return <Card padding={5}><VStack gap={4} xstyle={s.chart}><Heading level={3}>{t.cumulative}</Heading><Text type="supporting">{lang === 'es' ? 'Conteo mensual armonizado acumulado; banda histórica de todos los años anteriores al actual.' : lang === 'pt' ? 'Contagem mensal harmonizada acumulada; faixa histórica dos anos anteriores.' : 'Cumulative harmonized monthly counts; historical band from all earlier years.'}</Text><ResponsiveContainer width="100%" height={280}><ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}><CartesianGrid stroke={chartInk.grid} vertical={false} /><XAxis dataKey="label" tick={chartInk.tick} /><YAxis tick={chartInk.tick} /><ChartTooltip /><Area dataKey="p10" stackId="range" stroke="none" fill="transparent" isAnimationActive={false} /><Area dataKey="band" stackId="range" stroke="none" fill={categorical[0]} fillOpacity={0.2} isAnimationActive={false} /><Line dataKey="median" name={t.median} stroke={chartInk.axis} strokeDasharray="6 4" dot={false} isAnimationActive={false} />{years.map((year, i) => <Line key={year} dataKey={`year${year}`} name={`${year}${analogs.estimated_analog_years.includes(year) ? ` (${t.estimated})` : ''}`} stroke={categorical[i + 2]} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />)}<Line dataKey="current" name={`${currentYear}`} stroke={emphasisSeries.harmonized.stroke} strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer><HStack gap={3} wrap="wrap"><Text type="supporting">━ {currentYear}, {t.current}</Text><Text type="supporting">┄ {t.median}</Text><Text type="supporting">▰ {t.band}</Text>{years.map(year => <Text key={year} type="supporting">━ {year}{analogs.estimated_analog_years.includes(year) ? ` (${t.estimated})` : ''}</Text>)}</HStack></VStack></Card>;
}

export function RiskPanel({ data, territory, lang }: { data: RiskResponse; territory?: TerritoryResponse; lang: Lang }) {
  const t = copy[lang];
  const color = { baja: 'var(--color-success)', media: 'var(--color-warning)', alta: 'var(--color-error)', extrema: 'var(--color-error)' }[data.level];
  const level = { es: { baja: 'Baja', media: 'Media', alta: 'Alta', extrema: 'Extrema' }, en: { baja: 'Low', media: 'Medium', alta: 'High', extrema: 'Extreme' }, pt: { baja: 'Baixa', media: 'Média', alta: 'Alta', extrema: 'Extrema' } }[lang][data.level];
  const localities = [...(territory?.localities ?? [])].sort((a, b) => (a.dist_km ?? Infinity) - (b.dist_km ?? Infinity)).slice(0, 3);
  return <VStack gap={4}><Card padding={5}><VStack gap={4}><HStack gap={3} wrap="wrap" vAlign="center"><Heading level={3}>{t.risk}: {formatNumber(data.index, lang, 0)} / 100</Heading><Badge label={level.toLocaleUpperCase(loc(lang))} variant={data.level === 'baja' ? 'success' : data.level === 'media' ? 'warning' : 'error'} /><Badge label={t.formula} variant="neutral" /></HStack><VStack xstyle={s.gauge} role="meter" aria-label={t.risk} aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.index}><VStack xstyle={s.gaugeFill} style={{ width: `${Math.max(0, Math.min(100, data.index))}%`, backgroundColor: color }} /></VStack><Text>{data.summary_es}</Text><Heading level={4}>{t.components}</Heading>{[...data.components].sort((a, b) => b.weight - a.weight).map(c => <VStack key={c.key} gap={1}><HStack gap={2} wrap="wrap"><Text>{c.label}</Text><Text type="supporting" color="secondary">{formatNumber(c.value * 100, lang, 1)} / 100, {formatNumber(c.weight * 100, lang)}%</Text></HStack><ProgressBar label={c.label} value={Math.min(100, Math.max(0, c.value * 100))} max={100} /><Text type="supporting" color="secondary">{c.note}</Text></VStack>)}<Collapsible trigger={t.method} defaultIsOpen={false}><Text type="supporting">{data.method}</Text></Collapsible></VStack></Card><Card padding={5}><VStack gap={3}><Heading level={3}>{t.exposed}</Heading>{localities.length ? localities.map(l => <HStack key={`${l.name}-${l.lat}`} gap={2} wrap="wrap"><Text>{l.name}</Text><Text type="supporting">{formatNumber(l.pop, lang)} {t.population.toLocaleLowerCase(loc(lang))}, {formatNumber(l.dist_km, lang, 1)} km</Text></HStack>) : empty(lang)}</VStack></Card></VStack>;
}

export function RecurrencePanel({ data, lang }: { data: RecurrenceGeoJson; lang: Lang }) {
  const t = copy[lang]; const stats = recurrenceStats(data);
  if (!stats.cells) return empty(lang);
  const percent = (n: number) => formatNumber(100 * n / stats.cells, lang, 1);
  return <Card padding={5}><VStack gap={4} xstyle={s.chart}><Heading level={3}>{t.recurrence}</Heading><Text>{percent(stats.atLeast3)}% {t.atLeast.toLocaleLowerCase(loc(lang))} 3 {t.years}; {percent(stats.atLeast5)}% 5 {t.years}. {t.maximum}: {formatNumber(stats.maxYears, lang)}.</Text><Text type="supporting">{formatNumber(stats.atLeast3, lang)} / {formatNumber(stats.cells, lang)} ≥ 3, {formatNumber(stats.atLeast5, lang)} / {formatNumber(stats.cells, lang)} ≥ 5</Text><ResponsiveContainer width="100%" height={190}><BarChart data={stats.histogram}><CartesianGrid stroke={chartInk.grid} vertical={false} /><XAxis dataKey="year" tick={chartInk.tick} /><YAxis tick={chartInk.tick} /><ChartTooltip /><Bar dataKey="cells" name={t.histogram} fill={categorical[0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></VStack></Card>;
}

interface LocalityRow extends Record<string, unknown> { id: string; name: string; pop: string; distance: string }
export function TerritoryPanel({ data, lang }: { data: TerritoryResponse; lang: Lang }) {
  const t = copy[lang];
  const landcover = data.landcover.filter(l => l.share > 0).slice(0, 6);
  const localities: LocalityRow[] = data.localities.map((l, i) => ({ id: `${l.name}-${i}`, name: l.name, pop: formatNumber(l.pop, lang), distance: formatNumber(l.dist_km, lang, 1) }));
  return <VStack gap={4}><Grid columns={{ minWidth: 145, max: 4, repeat: 'fit' }} gap={2}>{[[t.area, `${formatNumber(data.area_km2, lang, 1)} km²`], [t.cells, formatNumber(data.cells, lang)], [t.population, formatNumber(data.population_total, lang)], [t.admin, [data.admin?.municipality, data.admin?.state].filter(Boolean).join(', ') || '—']].map(([label, value]) => <Card key={label} padding={3}><VStack gap={1}><Text type="supporting" color="secondary">{label}</Text><Heading level={4}>{value}</Heading></VStack></Card>)}</Grid><Text type="supporting" color="secondary">{data.admin?.source ?? '—'}</Text><Card padding={5}><VStack gap={3}><Heading level={3}>{t.localities}</Heading>{localities.length ? <Table data={localities} columns={[{ key: 'name', header: t.localities }, { key: 'pop', header: t.population }, { key: 'distance', header: t.distance }]} idKey="id" density="compact" /> : empty(lang)}</VStack></Card><Card padding={5}><VStack gap={3}><Heading level={3}>{t.protected}</Heading>{data.protected_areas.features.length ? data.protected_areas.features.map((f, i) => <HStack key={`${f.properties.name}-${i}`} gap={2} wrap="wrap"><Text>{f.properties.name}</Text>{f.properties.category && <Badge label={f.properties.category} variant="teal" />}</HStack>) : empty(lang)}</VStack></Card><Card padding={5}><VStack gap={3}><Heading level={3}>{t.cover}</Heading>{landcover.length ? <><VStack gap={0} role="img" aria-label={landcover.map(l => `${l.biome} ${formatNumber(l.share * 100, lang, 1)}%`).join(', ')}>{landcover.map((l, i) => <HStack key={l.biome} xstyle={s.segment} style={{ backgroundColor: categorical[i], minHeight: `calc(var(--spacing-8) * ${Math.max(1, l.share * 8)})` }}><Text>{l.biome}</Text><Text>{formatNumber(l.share * 100, lang, 1)}%</Text></HStack>)}</VStack>{landcover.map((l, i) => <HStack key={l.biome} gap={2} vAlign="center"><VStack xstyle={s.swatch} style={{ backgroundColor: categorical[i] }} /><Text type="supporting">{l.biome}, {formatNumber(l.share * 100, lang, 1)}%</Text></HStack>)}</> : empty(lang)}</VStack></Card></VStack>;
}
