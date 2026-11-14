import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import MapView from './MapView';
import HarmonizationPage from './HarmonizationPage';
import { ApiError, getCalendar, getDaily, getRecent, resolveArea, type Area, type AreaCandidate, type CalendarResponse, type CalendarRow, type DailyRow, type Metric, type RecentFeatureCollection, type Reference, type ResolvedIntent } from './api/client';
import { candidateArea, dateIntentLabel, intentDates } from './searchArea';
import { messages, type Language } from './i18n';
import type { PolygonGeometry } from './drawnArea';
import { Theme } from '@astryxdesign/core/theme';
import { themes } from './astryx-themes';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavItem } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Table } from '@astryxdesign/core/Table';
import { BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { cividis, diverging, colorFor, cellTextColor } from './dataviz';

const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function displayValue(row: CalendarRow, mode: 'count' | 'anomaly', metric: Metric) {
  if (mode === 'anomaly') return row.anomaly_ratio == null ? '—' : `${row.anomaly_ratio.toFixed(1)}×`;
  const value = metric === 'frp' ? row.frp_harm : row.count_harm;
  return value == null ? '—' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0, notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

function describe(row: CalendarRow, metric: Metric) {
  const value = metric === 'frp' ? row.frp_harm : row.count_harm;
  return [
    `${monthNames[row.month - 1]} de ${row.year}`,
    value == null ? 'sin valor' : `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${metric === 'frp' ? 'MW de FRP armonizada' : 'puntos de calor armonizados'}`,
    row.anomaly_ratio == null ? '' : `${row.anomaly_ratio.toFixed(2)} veces la referencia`,
    row.percentile == null ? '' : `percentil ${Math.round(row.percentile <= 1 ? row.percentile * 100 : row.percentile)}`,
    row.return_period_years == null ? '' : `periodo de retorno: 1 vez cada ${row.return_period_years.toFixed(1)} años`,
    row.is_estimated ? 'estimación armonizada' : '',
    row.clear_frac != null && row.clear_frac < 0.5 ? 'baja visibilidad por nubes' : '',
  ].filter(Boolean).join(' · ');
}

function dailyRows(response: Awaited<ReturnType<typeof getDaily>>): DailyRow[] {
  if (Array.isArray(response)) return response;
  return response.rows ?? response.days ?? [];
}

export default function App() {
  const [page, setPage] = useState<'map' | 'method'>(() => window.location.hash === '#metodo' ? 'method' : 'map');
  const today = new Date().toISOString().slice(0, 10);
  const [language, setLanguage] = useState<Language>('es');
  const t = messages[language];
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('firely-theme') === 'light' ? 'light' : 'dark');
  const [area, setArea] = useState<Area>({ lat: 25.43, lon: -100.95, radius_km: 20 });
  const [areaLabel, setAreaLabel] = useState('Sierra de Arteaga, Coahuila');
  const [drawing, setDrawing] = useState(false);
  const [drawnStatus, setDrawnStatus] = useState('');
  const [search, setSearch] = useState('');
  const [lat, setLat] = useState('25.43');
  const [lon, setLon] = useState('-100.95');
  const [radius, setRadius] = useState('20');
  const [from, setFrom] = useState('2001-01-01');
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState<'count' | 'anomaly'>('count');
  const [metric, setMetric] = useState<Metric>('count');
  const [reference, setReference] = useState<Reference>('median');
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [dailyError, setDailyError] = useState('');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<AreaCandidate[]>([]);
  const [parsedIntent, setParsedIntent] = useState<ResolvedIntent | null>(null);
  const [searchStatus, setSearchStatus] = useState('');
  const searchController = useRef<AbortController | null>(null);
  const [liveHours, setLiveHours] = useState<0 | 24 | 48>(0);
  const [recent, setRecent] = useState<RecentFeatureCollection | null>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const [liveError, setLiveError] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('firely-theme', theme);
  }, [theme]);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  useEffect(() => {
    const onHashChange = () => setPage(window.location.hash === '#metodo' ? 'method' : 'map');
    window.addEventListener('hashchange', onHashChange);
    return () => { window.removeEventListener('hashchange', onHashChange); searchController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (from > to) { setStatus('La fecha inicial debe ser anterior a la fecha final.'); setCalendar(null); return; }
    const controller = new AbortController();
    setLoading(true);
    setStatus('');
    getCalendar(area, from, to, metric, reference, controller.signal)
      .then((result) => { setCalendar(result); setLoading(false); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCalendar(null); setLoading(false);
        setStatus(`No se pudo cargar el calendario: ${error instanceof Error ? error.message : 'error desconocido'}. Comprueba que la API esté activa.`);
      });
    return () => controller.abort();
  }, [area, from, to, metric, reference]);

  useEffect(() => {
    if (!selected) { setDaily([]); setDailyError(''); return; }
    const controller = new AbortController();
    setDaily([]); setDailyError(''); setSelectedDay(null);
    getDaily(area, selected.year, selected.month, controller.signal)
      .then((result) => setDaily(dailyRows(result)))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDailyError(`No se pudo cargar el desglose diario: ${error instanceof Error ? error.message : 'error desconocido'}`);
      });
    return () => controller.abort();
  }, [area, selected]);

  useEffect(() => {
    if (!liveHours) { setRecent(null); setLiveStatus(''); setLiveError(''); return; }
    let controller: AbortController | null = null;
    const fetchLayer = () => {
      controller?.abort();
      controller = new AbortController();
      const active = controller;
      setLiveStatus('Cargando detecciones en vivo…');
      getRecent(area, liveHours, active.signal).then((result) => {
        if (active.signal.aborted) return;
        setRecent(result); setLiveError(''); setLiveStatus('');
      }).catch((error: unknown) => {
        if (active.signal.aborted) return;
        setRecent(null); setLiveStatus('');
        setLiveError(error instanceof ApiError && error.status === 503 && error.code === 'firms_map_key_missing'
          ? 'La capa en vivo necesita una llave de FIRMS en el servidor'
          : 'No se pudo cargar la capa en vivo. Inténtalo de nuevo más tarde.');
      });
    };
    setRecent(null); setLiveError('');
    fetchLayer();
    const interval = window.setInterval(fetchLayer, 300000);
    return () => { window.clearInterval(interval); controller?.abort(); };
  }, [area, liveHours]);

  const visibleRows = useMemo(() => (calendar?.rows ?? []).filter((row) => {
    const firstDay = `${row.year}-${String(row.month).padStart(2, '0')}-01`;
    const lastDay = `${row.year}-${String(row.month).padStart(2, '0')}-${new Date(row.year, row.month, 0).getDate()}`;
    return firstDay <= to && lastDay >= from;
  }), [calendar, from, to]);
  const byMonth = useMemo(() => new Map<string, CalendarRow>(visibleRows.map((row): [string, CalendarRow] => [`${row.year}-${row.month}`, row])), [visibleRows]);
  const years = useMemo(() => {
    const first = Number(from.slice(0, 4));
    const last = Number(to.slice(0, 4));
    return Number.isFinite(first) && Number.isFinite(last) && last >= first && last - first < 100
      ? Array.from({ length: last - first + 1 }, (_, i) => last - i) : [];
  }, [from, to]);
  const max = Math.max(1, ...visibleRows.map((row) => metric === 'frp' ? row.frp_harm ?? 0 : row.count_harm ?? 0));
  const selectedRow = selected ? byMonth.get(`${selected.year}-${selected.month}`) : undefined;
  const selectedPeriod = selected ? `${monthNames[selected.month - 1]} ${selected.year}${selectedDay ? ` · día ${selectedDay}` : ''}` : undefined;

  function chooseCoordinates(event: FormEvent) {
    event.preventDefault();
    const latitude = Number(lat), longitude = Number(lon), radiusKm = Number(radius);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(radiusKm) || radiusKm <= 0) {
      setStatus('Introduce latitud, longitud y radio válidos.'); return;
    }
    setArea({ lat: latitude, lon: longitude, radius_km: radiusKm });
    setDrawing(false); setDrawnStatus('');
    setAreaLabel(`${latitude.toFixed(3)}°, ${longitude.toFixed(3)}° · ${radiusKm} km`);
    setSelected(null);
  }

  async function searchAdmin(event: FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearchStatus('Buscando área…'); setCandidates([]); setParsedIntent(null);
    try {
      const result = await resolveArea(search.trim(), language, controller.signal);
      if (controller.signal.aborted) return;
      setParsedIntent(result.intent);
      if (!result.candidates?.length) { setSearchStatus('No se encontraron áreas para esa búsqueda.'); return; }
      if (result.ambiguous) { setCandidates(result.candidates); setSearchStatus('Elige un resultado para continuar.'); return; }
      chooseCandidate(result.candidates[0], result.intent);
    } catch (error) {
      if (!controller.signal.aborted) setSearchStatus(`No se pudo resolver el área: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }
  }

  function chooseCandidate(candidate: AreaCandidate, intent = parsedIntent) {
    const nextArea = candidateArea(candidate);
    if (!nextArea) { setSearchStatus('Ese resultado no contiene un área consultable.'); return; }
    setArea(nextArea);
    setDrawing(false); setDrawnStatus('');
    setAreaLabel(candidate.label);
    setCandidates([]); setSelected(null); setSearchStatus(`Área seleccionada: ${candidate.label}`);
    const dates = intentDates(intent ?? undefined, from, to, today);
    setFrom(dates.from); setTo(dates.to);
  }

  function mapPick(latitude: number, longitude: number) {
    setLat(latitude.toFixed(5)); setLon(longitude.toFixed(5));
    setArea({ lat: latitude, lon: longitude, radius_km: Number(radius) || 20 });
    setDrawnStatus('');
    setAreaLabel(`${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°`);
    setSelected(null);
  }

  function finishDrawing(geometry: PolygonGeometry) {
    setArea({ geometry: JSON.stringify(geometry) });
    setAreaLabel(messages[language].drawnArea);
    setDrawnStatus(messages[language].drawnStatus.replace('{count}', String(geometry.coordinates[0].length - 1)));
    setSelected(null);
  }

  function clearDrawing() {
    const latitude = Number(lat), longitude = Number(lon), radiusKm = Number(radius);
    setArea({ lat: Number.isFinite(latitude) && Math.abs(latitude) <= 90 ? latitude : 25.43, lon: Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? longitude : -100.95, radius_km: Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : 20 });
    setAreaLabel(`${lat}°, ${lon}° · ${radius} km`);
    setDrawing(false); setDrawnStatus(''); setSelected(null);
  }

  return <Theme theme={themes.firely} mode={theme}>
    <AppShell height="auto" variant="wash" topNav={<TopNav label="Navegación principal" heading={<Text type="large" color="accent">✦ FIRELY</Text>}
      startContent={<HStack gap={1} wrap="wrap"><TopNavItem label="Mapa" href="#mapa" isSelected={page === 'map'} /><TopNavItem label="Cómo armonizamos" href="#metodo" isSelected={page === 'method'} /></HStack>}
      centerContent={page === 'map' ? <form onSubmit={searchAdmin}><VStack gap={1}><HStack gap={2} vAlign="end" wrap="wrap"><TextInput label={t.search} type="search" value={search} onChange={setSearch} placeholder="Arteaga, Coahuila" /><Button label="Buscar" type="submit" variant="primary" /></HStack>{parsedIntent && <HStack gap={1} wrap="wrap">{dateIntentLabel(parsedIntent) && <Token size="sm" label={dateIntentLabel(parsedIntent)!} onRemove={() => setParsedIntent((intent) => intent ? { ...intent, date_from: null, date_to: null } : null)} />}{parsedIntent.place_text && <Token size="sm" label={parsedIntent.place_text} onRemove={() => setParsedIntent((intent) => intent ? { ...intent, place_text: undefined } : null)} />}</HStack>}<Text type="supporting" role="status" aria-live="polite">{searchStatus}</Text></VStack></form> : undefined}
      endContent={<HStack gap={2} vAlign="center" wrap="wrap">
        <Selector label="Idioma" value={language} onChange={(value) => setLanguage(value as Language)} options={[{ value: 'es', label: 'ES' }, { value: 'en', label: 'EN' }, { value: 'pt', label: 'PT' }]} size="sm" />
        <Switch label={theme === 'dark' ? 'Modo oscuro' : 'Modo claro'} value={theme === 'dark'} onChange={(checked) => setTheme(checked ? 'dark' : 'light')} size="sm" />
      </HStack>} /> }>
      {page === 'method' ? <HarmonizationPage theme={theme} /> :
      <VStack gap={6} padding={6}>
        <VStack gap={2}>
          <Text type="label" color="accent">SERIE ARMONIZADA · NIVEL 0</Text>
          <Heading level={1} type="display-3">El historial del fuego, mes a mes</Heading>
          <Text color="secondary">Explora la actividad de quemas en el área seleccionada. Los años tempranos muestran estimaciones armonizadas.</Text>
        </VStack>
        <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
          <VStack gap={4}>
            <Card><VStack gap={3}>
              <HStack hAlign="between" vAlign="center" wrap="wrap"><VStack gap={1}><Text type="label" color="secondary">ÁREA SELECCIONADA</Text><Heading level={3}>{'geometry' in area ? t.drawnArea : areaLabel}</Heading></VStack><HStack gap={2} wrap="wrap"><Button label={drawing ? t.cancelDraw : t.draw} aria-pressed={drawing} onClick={() => setDrawing(!drawing)} />{'geometry' in area && <Button label={t.clearArea} onClick={clearDrawing} />}</HStack></HStack>
              <MapView area={area} recent={recent} theme={theme} selectedDate={selectedPeriod} onPick={mapPick} drawing={drawing} language={language} onDraw={finishDrawing} onDrawingChange={setDrawing} />
              <HStack gap={3} wrap="wrap" vAlign="center"><Text type="label">En vivo</Text><SegmentedControl label="En vivo" value={String(liveHours)} onChange={(value) => setLiveHours(Number(value) as 0 | 24 | 48)} size="sm"><SegmentedControlItem value="0" label="Apagado" /><SegmentedControlItem value="24" label="24 h" /><SegmentedControlItem value="48" label="48 h" /></SegmentedControl><Text type="supporting" role="status" aria-live="polite">{liveStatus || (recent ? `${recent.features.length} detecciones · más reciente: ${recent.data_cutoff ? new Date(recent.data_cutoff).toLocaleString('es-MX') : 'sin fecha'} · ${recent.attribution || 'NASA FIRMS'}` : '')}</Text></HStack>
              {liveError && <Banner status="warning" title={liveError} />}
              <Text role="status" aria-live="polite">{'geometry' in area ? t.drawnStatus.replace('{count}', String(JSON.parse(area.geometry).coordinates[0].length - 1)) : drawnStatus}</Text>
              <form onSubmit={chooseCoordinates} aria-label="Seleccionar área por coordenadas"><VStack gap={3}>
                <Heading level={4}>{t.coordinates}</Heading>
                <Grid columns={{ minWidth: 110, repeat: 'fit' }} gap={2}>
                  <NumberInput label="Latitud" value={Number(lat)} onChange={(value) => setLat(String(value))} step={0.01} />
                  <NumberInput label="Longitud" value={Number(lon)} onChange={(value) => setLon(String(value))} step={0.01} />
                  <NumberInput label="Radio km" value={Number(radius)} onChange={(value) => setRadius(String(value))} step={1} />
                </Grid><Button label="Aplicar" type="submit" variant="primary" />
              </VStack></form>
            </VStack></Card>
          </VStack>
          <VStack gap={4}>
            <Card><VStack gap={3}>
              <DateRangeInput label={t.range} value={{ start: from as ISODateString, end: to as ISODateString }} onChange={(value) => { if (value) { setFrom(value.start); setTo(value.end); setSelected(null); } }} min="2000-01-01" max={today as ISODateString} hasClear={false} />
              <HStack gap={3} wrap="wrap">
                <SegmentedControl label="Vista" value={mode} onChange={(value) => setMode(value as 'count' | 'anomaly')} size="sm"><SegmentedControlItem value="count" label={t.count} /><SegmentedControlItem value="anomaly" label={t.anomaly} /></SegmentedControl>
                <SegmentedControl label="Métrica" value={metric} onChange={(value) => setMetric(value as Metric)} size="sm"><SegmentedControlItem value="count" label="Puntos" /><SegmentedControlItem value="frp" label="FRP" /></SegmentedControl>
                <SegmentedControl label="Referencia" value={reference} onChange={(value) => setReference(value as Reference)} size="sm"><SegmentedControlItem value="median" label={t.median} /><SegmentedControlItem value="mean" label={t.mean} /></SegmentedControl>
              </HStack>
            </VStack></Card>
            {candidates.length > 0 && <Card><VStack gap={2}><Heading level={4}>Selecciona el área correcta</Heading>{candidates.map((candidate, index) => <Button key={index} label={candidate.label} onClick={() => chooseCandidate(candidate)} />)}</VStack></Card>}
          </VStack>
        </Grid>
            <Card><VStack gap={3}>
              <HStack hAlign="between" vAlign="center" wrap="wrap"><VStack gap={1}><Text type="label" color="accent">{from.slice(0, 4)}—{to.slice(0, 4)}</Text><Heading level={2}>{t.activity}</Heading></VStack><Text type="supporting">{mode === 'anomaly' ? `Razón frente a la ${reference === 'median' ? 'mediana' : 'media'} histórica` : metric === 'frp' ? 'Potencia radiativa armonizada · MW' : 'Puntos de calor armonizados'}</Text></HStack>
              {status && <Text role="alert">{status}</Text>}{loading && <Text role="status">{t.loading}</Text>}{!loading && calendar?.rows.length === 0 && <Text>{t.noData}</Text>}
              <Table data={years.map((year) => {
                const rowMonths = months.map((_, index) => byMonth.get(`${year}-${index + 1}`));
                return { year, estimated: rowMonths.some((row) => row?.is_estimated) || (calendar?.harmonization_uncertainty?.years_estimated?.includes(year) ?? false), total: rowMonths.reduce<number>((sum, row) => sum + (metric === 'frp' ? row?.frp_harm ?? 0 : row?.count_harm ?? 0), 0) };
              })} idKey="year" density="compact" dividers="none" columns={[
                { key: 'year', header: 'Año', renderCell: (item) => <Text type="label">{item.year}{item.estimated ? ' E' : ''}</Text> },
                ...months.map((month, index) => ({ key: month, header: month, renderCell: (item: { year: number }) => {
                  const row = byMonth.get(`${item.year}-${index + 1}`);
                  const color = row ? colorFor(row, mode, metric, max) : undefined;
                  const active = selected?.year === item.year && selected.month === index + 1;
                  return row ? <Tooltip content={describe(row, metric)}><Button label={describe(row, metric)} aria-pressed={active} onClick={() => { setSelected({ year: item.year, month: index + 1 }); setSelectedDay(null); }} style={{ backgroundColor: color ?? 'var(--color-background-muted)', color: color ? cellTextColor(color) : 'var(--color-text-primary)', border: active ? 'var(--spacing-0-5) solid var(--color-accent)' : 'none', borderRadius: 'var(--radius-element)', padding: 'var(--spacing-1)', minWidth: '100%' }}>{displayValue(row, mode, metric)}{row.is_estimated ? ' E' : ''}{row.clear_frac != null && row.clear_frac < 0.5 ? ' ◌' : ''}</Button></Tooltip> : <Text type="supporting">—</Text>;
                }})),
                { key: 'total', header: 'Total', renderCell: (item) => <Text type="supporting">{item.total ? Math.round(item.total).toLocaleString('es-MX') : '—'}</Text> },
              ]} />
              <HStack gap={2} vAlign="center" wrap="wrap"><Text type="supporting">{mode === 'anomaly' ? 'Menos que la referencia' : 'Menor actividad'}</Text>{(mode === 'anomaly' ? diverging : cividis).map((color) => <Text key={color} aria-hidden="true" style={{ backgroundColor: color, color: cellTextColor(color), padding: 'var(--spacing-1)' }}>■</Text>)}<Text type="supporting">{mode === 'anomaly' ? 'Más que la referencia' : 'Mayor actividad'}</Text><Text type="supporting">E = estimación armonizada · ◌ = baja visibilidad por nubes</Text></HStack>
            </VStack></Card>
            {selected && <Card><VStack gap={3}>
              <HStack hAlign="between" vAlign="center" wrap="wrap"><Heading level={2}>{t.daily} · {monthNames[selected.month - 1]} {selected.year}</Heading><Button label="Cerrar" onClick={() => setSelected(null)} /></HStack>
              {selectedRow && <Text type="supporting">{describe(selectedRow, metric)}</Text>}{dailyError && <Text role="alert">{dailyError}</Text>}{!dailyError && daily.length === 0 && <Text type="supporting">Sin valores diarios disponibles.</Text>}
              {!dailyError && metric === 'frp' && daily.length > 0 && !daily.some((row) => row.frp_harm != null) && <Text type="supporting">La API no ofrece FRP diaria para este mes.</Text>}
              {daily.length > 0 && (metric === 'count' || daily.some((row) => row.frp_harm != null)) && <ResponsiveContainer width="100%" height={150}><BarChart data={daily.map((row, index) => ({ day: row.day ?? (Number(row.date?.slice(-2)) || index + 1), value: metric === 'frp' ? row.frp_harm ?? 0 : row.count_harm ?? 0 }))}><XAxis dataKey="day" tick={{ fill: 'var(--color-text-secondary)' }} /><YAxis tick={{ fill: 'var(--color-text-secondary)' }} /><ChartTooltip cursor={{ fill: 'var(--color-background-muted)' }} /><Bar dataKey="value" name={metric === 'frp' ? 'FRP · MW' : 'Puntos'} fill="var(--color-accent)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}
              {daily.length > 0 && (metric === 'count' || daily.some((row) => row.frp_harm != null)) && <Table data={daily.map((row, index) => ({ day: row.day ?? (Number(row.date?.slice(-2)) || index + 1), count: row.count_harm, frp: row.frp_harm }))} idKey="day" density="compact" columns={[{ key: 'day', header: 'Día', renderCell: (row) => <Button label={String(row.day)} variant={selectedDay === row.day ? 'primary' : 'ghost'} onClick={() => setSelectedDay(row.day)} /> }, { key: 'count', header: 'Puntos', renderCell: (row) => <Text>{row.count?.toLocaleString('es-MX') ?? '—'}</Text> }, { key: 'frp', header: 'FRP · MW', renderCell: (row) => <Text>{row.frp?.toLocaleString('es-MX') ?? '—'}</Text> }]} />}
              {selectedDay && <Text type="supporting">Día {selectedDay} seleccionado; el mapa muestra el periodo activo.</Text>}
            </VStack></Card>}
        <Text type="supporting">Fuente: NASA FIRMS (MODIS C6.1 y VIIRS 375 m). Los puntos de calor no equivalen a incendios ni a superficie quemada.</Text>
        <Text type="supporting">{calendar?.mock ? 'Datos simulados de desarrollo · ' : ''}Metodología: {calendar?.methodology_version ?? '—'} · Corte de datos: {calendar?.data_cutoff ?? '—'}</Text>
      </VStack>}
    </AppShell>
  </Theme>;
}
