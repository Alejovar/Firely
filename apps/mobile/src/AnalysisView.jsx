import React, { useState } from 'react';
import { Stack } from '@astryxdesign/core/Stack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { api, fmt, candidateArea, useResource } from './data';
import { LoadState, Metadata, Rows, numberColumn } from './DataViews';

const tabs = [ ['season', 'Temporada'], ['analogs', 'Años análogos'], ['context', 'Contexto'], ['events', 'Eventos de fuego'], ['reported', 'Reportados CONAFOR'], ['weekday', 'Día y noche'] ];
const observed = row => row.is_estimated ? 'Estimado' : 'Observado';
export function AnalysisView({ area, filters, cutoff, onArea }) {
  const [tab, setTab] = useState('season');
  const [adminText, setAdminText] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const admin = useResource(`admins:${adminSearch}`, signal => adminSearch ? api.searchAdmin(adminSearch, signal) : null);
  const end = cutoff && cutoff < filters.to ? cutoff : filters.to;
  const startYear = Math.max(Number(filters.from.slice(0, 4)), Number(end.slice(0, 4)) - 4);
  const contextStart = `${startYear}-01-01`;
  const noAdmin = tab === 'reported' && !area.query.admin;
  const resource = useResource(`analysis:${tab}:${JSON.stringify(area.query)}:${JSON.stringify(filters)}:${cutoff}`, signal => {
    if (noAdmin) return null;
    if (tab === 'season') return api.getSeason(area.query, signal);
    if (tab === 'analogs') return api.getAnalogs(area.query, end, signal);
    if (tab === 'context') return api.getContext(area.query, contextStart, end, signal);
    if (tab === 'events') return api.getEvents(area.query, filters.from, filters.to, 3, signal);
    if (tab === 'reported') return api.getReported(area.query, filters.from, filters.to, signal);
    return Promise.all([api.getWeekday(area.query, signal), api.getNight(area.query, signal)]).then(([weekday, night]) => ({ weekday, night }));
  });
  const data = resource.data;
  const metadata = tab === 'weekday' ? data?.weekday : data;
  return <Stack gap={4}>
    <Text type="supporting">{area.label}</Text>
    <Selector label="Tipo de análisis" value={tab} onChange={setTab} options={tabs.map(([value, label]) => ({ value, label }))} />
    {['season', 'weekday'].includes(tab) && <Text type="supporting">Usa todo el historial disponible del área, independientemente del intervalo del calendario.</Text>}
    {tab === 'reported' && <Stack gap={3}>
      <TextInput label="Estado o municipio de México" type="search" value={adminText} onChange={setAdminText} onEnter={() => setAdminSearch(adminText.trim())} />
      <Button label="Buscar unidad administrativa" onClick={() => setAdminSearch(adminText.trim())} />
      {adminSearch && <LoadState resource={admin} empty={!admin.data?.candidates?.length}>
        {(admin.data?.candidates || []).filter(item => ['mx', 'mexico', 'méxico'].includes(item.country?.toLowerCase())).map(item => <Button key={item.code} label={[item.name, item.parent].filter(Boolean).join(', ')} onClick={() => {
          try { onArea(candidateArea(item, true)); setAdminSearch(''); setSelectionError(''); } catch (error) { setSelectionError(error.message); }
        }} />)}
      </LoadState>}
      {noAdmin && <Text role="status">Selecciona una unidad administrativa mexicana para consultar los reportes CONAFOR.</Text>}
      {selectionError && <Text role="alert">{selectionError}</Text>}
    </Stack>}
    {!noAdmin && <LoadState resource={resource}>
      {tab === 'season' && data && <>
        <Heading level={2}>Temporada de actividad</Heading>
        {!data.rows?.length ? <Text>Sin datos suficientes para estimar temporadas.</Text> : <>
          <Text>{data.summary_es}</Text>
          <Text type="supporting">Fechas derivadas de conteos mensuales distribuidos uniformemente; no son fechas diarias observadas.</Text>
          <Rows label="Temporadas por año" rows={data.rows} columns={[{ key: 'year', header: 'Año' }, { key: 'onset', header: 'Inicio' }, { key: 'peak', header: '50% anual' }, { key: 'end', header: 'Fin' }, numberColumn('annual_count_harm', 'Detecciones'), { key: 'is_estimated', header: 'Origen', renderCell: observed }]} />
        </>}
      </>}
      {tab === 'analogs' && data && <>
        <Heading level={2}>Años análogos</Heading>
        <Text type="supporting">Comparación hasta {data.date}. Confianza: {data.confidence || 'no disponible'}. No es un pronóstico operativo.</Text>
        {data.projection && <Text>Rango histórico proyectado: {fmt(data.projection.p10)} a {fmt(data.projection.p90)}; mediana {fmt(data.projection.p50)} detecciones.</Text>}
        <Rows label="Años análogos" rows={data.analogs} columns={[{ key: 'year', header: 'Año' }, numberColumn('similarity', 'Similitud'), numberColumn('year_end_count_harm', 'Cierre anual'), { key: 'is_estimated', header: 'Origen', renderCell: observed }]} />
      </>}
      {tab === 'context' && data && <>
        <Heading level={2}>Contexto climático</Heading>
        <Text type="supporting">{contextStart} a {end} · {data.coverage || 'Cobertura según los datos disponibles'}. Máximo cinco años por consulta.</Text>
        <Rows label="Contexto por mes" rows={data.rows} columns={[{ key: 'year', header: 'Año' }, { key: 'month', header: 'Mes' }, numberColumn('oni', 'ONI'), { key: 'enso_phase', header: 'ENSO', renderCell: row => row.enso_phase || '—' }, numberColumn('fwi_mean', 'FWI medio'), numberColumn('fwi_anom', 'Anomalía FWI')]} />
      </>}
      {tab === 'events' && data && <>
        <Heading level={2}>Eventos agrupados</Heading>
        <Text type="supporting">Agrupaciones de detecciones, no incendios confirmados. El conteo de eventos aún es crudo y la extensión aproximada no equivale a superficie quemada.</Text>
        <Rows label="Eventos de fuego" rows={data.rows} columns={[{ key: 'start_date', header: 'Inicio' }, { key: 'end_date', header: 'Fin' }, numberColumn('duration_days', 'Días'), numberColumn('n_hotspots_harm', 'Puntos agrupados'), numberColumn('frp_total', 'FRP total'), numberColumn('area_approx_km2', 'Extensión km²')]} />
      </>}
      {tab === 'reported' && data && <>
        <Heading level={2}>Reportes en campo</Heading>
        <Text type="supporting">{data.coverage || 'Según cobertura CONAFOR disponible'}. Los incendios reportados y los puntos de calor satelitales son medidas diferentes.</Text>
        <Rows label="Reportes CONAFOR" rows={data.rows} columns={[{ key: 'year', header: 'Año' }, { key: 'month', header: 'Mes' }, numberColumn('reported_fires', 'Incendios reportados'), numberColumn('reported_area_ha', 'Hectáreas reportadas')]} />
      </>}
      {tab === 'weekday' && data && <>
        <Heading level={2}>Patrón semanal y nocturno</Heading>
        <Text>{data.weekday.summary_es}</Text>
        {data.weekday.n_events === 0 ? <Text>Sin registros de eventos disponibles para evaluar el patrón semanal.</Text> : <Rows label="Eventos por día de la semana" rows={(data.weekday.counts_monday_first || []).map((count, index) => ({ day: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][index], count }))} columns={[{ key: 'day', header: 'Día' }, numberColumn('count', 'Eventos')]} />}
        <Rows label="Detecciones nocturnas" rows={data.night.rows} columns={[{ key: 'year', header: 'Año' }, numberColumn('night_detections', 'Nocturnas'), numberColumn('total_detections', 'Total'), { key: 'night_ratio', header: 'Porcentaje nocturno', renderCell: row => Number.isFinite(row.night_ratio) ? `${fmt(row.night_ratio * 100)} %` : '—' }]} />
        <Metadata data={data.night} />
      </>}
    </LoadState>}
    <Metadata data={metadata} />
  </Stack>;
}
