import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { FirelyIcon } from './FirelyIcon';
import { MapSurface } from './MapSurface';
import { CalendarView } from './CalendarView';
import { AnalysisView } from './AnalysisView';
import { AssistantView } from './AssistantView';
import { Filters } from './Filters';
import { LoadState, Metadata, Sparkline } from './DataViews';
import { api, DEFAULT_AREA, DEFAULT_FILTERS, fmt, metricValue, periodLabel, useResource } from './data';
import { glass } from './glass';

const pages = { mapa: 'Mapa', calendario: 'Calendario', analisis: 'Análisis', asistente: 'Asistente' };
const currentPage = () => Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'mapa';
const emptyFeatures = [];

export function App() {
  const [page, setPage] = useState(currentPage);
  const [area, setArea] = useState(DEFAULT_AREA);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [liveHours, setLiveHours] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showArea, setShowArea] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [mapError, setMapError] = useState('');
  const [dialog, setDialog] = useState(null);
  const current = useRef({ page, dialog, drawing });
  current.current = { page, dialog, drawing };
  const heading = useRef(null);
  const areaKey = JSON.stringify(area.query);
  const calendar = useResource(`calendar:${areaKey}:${JSON.stringify(filters)}`, signal => api.getCalendar(area.query, filters.from, filters.to, filters.metric, filters.reference, signal));
  const recent = useResource(`recent:${areaKey}:${liveHours}`, signal => liveHours ? api.getRecent(area.query, liveHours, signal) : null);
  const features = recent.data?.features || emptyFeatures;
  const rows = calendar.data?.rows || [];
  const latest = rows.at(-1);
  const point = selected === null ? null : features[selected];

  useEffect(() => {
    const navigate = () => {
      setPage(currentPage()); setDrawing(false);
      window.scrollTo(0, 0);
      requestAnimationFrame(() => heading.current?.focus());
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => setSelected(null), [areaKey, liveHours]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (current.current.dialog) setDialog(null);
      else if (current.current.drawing) setDrawing(false);
      else if (current.current.page !== 'mapa') location.hash = 'mapa';
      else NativeApp.exitApp();
    });
    return () => { listener.then(handle => handle.remove()); };
  }, []);

  function apply(nextFilters, nextArea) {
    setFilters(nextFilters);
    if (nextArea) { setArea(nextArea); setMapError(''); }
    setDialog(null);
  }
  function chooseArea(next) { setArea(next); setMapError(''); }
  function showFeature(index) { setSelected(index); setDialog('feature'); }

  return <Stack minHeight="100dvh" style={{ position: 'relative', isolation: 'isolate', background: 'var(--color-background-body)', color: 'var(--color-text-primary)', overflow: 'clip' }}>
    {page === 'mapa' && <Stack style={{ position: 'absolute', inset: 0, zIndex: -1 }}>
      <MapSurface area={area} features={features} selected={selected} onSelect={setSelected} onArea={chooseArea} showArea={showArea} recenter={recenter} drawing={drawing} onDrawingChange={setDrawing} onError={setMapError} />
      <Stack style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, var(--color-map-shade), transparent 35%, var(--color-background-body))' }} />
    </Stack>}

    <Stack as="header" direction="horizontal" hAlign="between" vAlign="center" padding={4} style={{ paddingTop: 'max(var(--spacing-5), env(safe-area-inset-top))', width: '100%', maxWidth: '48rem', marginInline: 'auto' }}>
      <Button href="#mapa" label="Firely, inicio" variant="ghost" icon={<FirelyIcon name="flame" size="lg" color="orange" />}><Text type="large" weight="bold">Firely</Text></Button>
      <Stack direction="horizontal" gap={2}>
        <IconButton href="#asistente" label="Buscar" tooltip="Buscar un lugar" icon={<FirelyIcon name="search" />} />
        <IconButton label="Fuentes y metodología" tooltip="Fuentes y metodología" icon={<FirelyIcon name="info" />} onClick={() => setDialog('about')} />
      </Stack>
    </Stack>

    <Stack as="main" gap={page === 'mapa' ? 3 : 5} padding={4} width="100%" maxWidth="48rem" style={{ marginInline: 'auto', flex: 1, pointerEvents: page === 'mapa' ? 'none' : 'auto' }}>
      {page !== 'mapa' && <Stack gap={3} ref={heading} tabIndex={-1} style={{ outline: 'none' }}>
        <Stack direction="horizontal" gap={3} hAlign="between" vAlign="center">
          <Heading level={1}>{pages[page]}</Heading>
          <Button label="Filtros" size="sm" onClick={() => setDialog('filters')} />
        </Stack>
        {calendar.data?.mock && <Text type="label" color="accent">DATOS SIMULADOS DEL SERVIDOR</Text>}
      </Stack>}

      {page === 'mapa' && <>
        <Stack direction="horizontal" hAlign="between" vAlign="start" gap={2} style={{ pointerEvents: 'auto' }}>
          <Button label="Filtros" icon={<FirelyIcon name="layers" />} onClick={() => setDialog('filters')}>MODIS + VIIRS <FirelyIcon name="chevronDown" size="sm" /></Button>
          <Stack gap={2}>
            <IconButton label="Mostrar límite del área" tooltip="Mostrar límite del área" icon={<FirelyIcon name="layers" />} aria-pressed={showArea} onClick={() => setShowArea(value => !value)} />
            <IconButton label="Centrar mapa" tooltip="Centrar en el área consultada" icon={<FirelyIcon name="target" />} onClick={() => { setRecenter(value => value + 1); setMapError(''); }} />
            <IconButton label={drawing ? 'Cancelar dibujo' : 'Dibujar área'} tooltip={drawing ? 'Cancelar dibujo' : 'Dibujar un polígono'} icon={<FirelyIcon name="map" />} aria-pressed={drawing} onClick={() => setDrawing(value => !value)} />
          </Stack>
        </Stack>
        {drawing && <Stack padding={3} style={{ ...glass, pointerEvents: 'auto' }}><Text role="status">Toca los vértices sobre el mapa y termina el polígono para consultar esa área.</Text><Button label="Cancelar dibujo" onClick={() => setDrawing(false)} /></Stack>}
        <Stack height="clamp(7rem, 18dvh, 20rem)" style={{ pointerEvents: 'none' }} />
        <Stack gap={3} padding={4} style={{ ...glass, marginTop: 'auto', pointerEvents: 'auto' }}>
          <Stack width="2.5rem" height=".2rem" style={{ background: 'var(--color-glass-edge)', borderRadius: 'var(--radius-full)', marginInline: 'auto' }} />
          <Text type="supporting">Actividad en la región</Text>
          <Heading level={1}>{area.label}</Heading>
          <Text type="supporting" color="accent">{calendar.data?.mock ? 'SIMULADA' : latest?.is_estimated ? 'ESTIMADA DESDE MODIS' : latest ? 'SERIE ARMONIZADA' : 'SIN SERIE DISPONIBLE'}</Text>
          <LoadState resource={calendar} empty={!rows.length}>
            <Stack direction="horizontal" gap={4} hAlign="between" vAlign="center">
              <Stack gap={1}>
                <Text type="supporting">{periodLabel(latest)}</Text>
                <Text type="large" weight="bold" hasTabularNumbers>{fmt(metricValue(latest, filters.metric))} {filters.metric === 'frp' ? 'MW de FRP' : 'detecciones'}</Text>
                <Text type="supporting">{fmt(latest?.anomaly_ratio)}× la {filters.reference === 'median' ? 'mediana' : 'media'} histórica</Text>
              </Stack>
              <Stack width="36%"><Sparkline rows={rows.slice(-12)} value={row => metricValue(row, filters.metric)} label="Actividad de los últimos meses disponibles" /></Stack>
            </Stack>
          </LoadState>
          <Button href="#calendario" label="Ver calendario histórico" width="100%" />
          <Button href="#analisis" label="Ver análisis completo" variant="ghost" endContent={<FirelyIcon name="chevronRight" />} />
          {liveHours > 0 && <Stack gap={3}>
            <Text type="label">Detecciones recientes · {liveHours} h</Text>
            <LoadState resource={recent}>
              <Text>{recent.data ? `${features.length} detecciones recibidas` : 'Sin respuesta disponible'}</Text>
              {features.length > 0 && <Button label={point ? 'Ver detección seleccionada' : 'Ver detecciones recientes'} onClick={() => setDialog(point ? 'feature' : 'features')} />}
              {recent.data && !features.length && <Text type="supporting">No se recibieron detecciones para esta consulta; no confirma ausencia de incendios.</Text>}
            </LoadState>
            <Metadata data={recent.data} />
          </Stack>}
          <Text type="supporting">Un punto de calor es una detección satelital, no un incendio confirmado. El fondo Blue Marble es histórico.</Text>
          <Metadata data={calendar.data} />
        </Stack>
        <Text type="supporting">Fondo: NASA GIBS · Blue Marble · no es una imagen actual</Text>
        {mapError && <Text role="status" type="supporting">{mapError}</Text>}
      </>}
      {page === 'calendario' && <CalendarView resource={calendar} area={area} filters={filters} />}
      {page === 'analisis' && <AnalysisView area={area} filters={filters} cutoff={calendar.data?.data_cutoff} onArea={chooseArea} />}
      {page === 'asistente' && <AssistantView area={area} filters={filters} calendar={calendar} onApply={apply} />}
    </Stack>

    <Stack as="nav" aria-label="Navegación principal" direction="horizontal" gap={1} hAlign="between" padding={2} style={{ ...glass, position: 'sticky', bottom: 'max(var(--spacing-3), env(safe-area-inset-bottom))', width: 'calc(100% - var(--spacing-6))', maxWidth: '45rem', marginInline: 'auto', marginBottom: 'max(var(--spacing-3), env(safe-area-inset-bottom))', zIndex: 1 }}>
      {Object.entries(pages).map(([key, label]) => <Button key={key} href={`#${key}`} label={label} size="sm" aria-current={page === key ? 'page' : undefined} variant="ghost" width="25%">
        <Stack gap={1} hAlign="center" style={{ color: page === key ? 'var(--color-text-accent)' : 'var(--color-text-primary)' }}>
          <FirelyIcon name={key === 'mapa' ? 'map' : key === 'calendario' ? 'calendar' : key === 'analisis' ? 'chart' : 'spark'} size="lg" />
          <Text type="supporting" color="inherit">{label}</Text>
        </Stack>
      </Button>)}
    </Stack>

    <Dialog isOpen={Boolean(dialog)} onOpenChange={open => { if (!open) setDialog(null); }} padding={4}>
      <DialogHeader title={dialog === 'filters' ? 'Filtros' : dialog === 'feature' ? 'Detección reciente' : dialog === 'features' ? 'Detecciones recientes' : 'Fuentes y metodología'} onOpenChange={() => setDialog(null)} />
      <Stack gap={4} paddingBlockStart={4}>
        {dialog === 'filters' && <Filters filters={filters} area={area} liveHours={liveHours} onApply={apply} onLiveChange={setLiveHours} />}
        {dialog === 'about' && <>
          <Text>La API del equipo proporciona la serie armonizada, los análisis y la resolución de lugares. Las cifras no se rellenan si no hay datos. Los años estimados desde MODIS se distinguen de la referencia observada de VIIRS.</Text>
          <Text>El mapa base NASA Blue Marble es histórico; no representa el estado actual del territorio. Las detecciones recientes requieren FIRMS y son independientes del intervalo del calendario.</Text>
          <Metadata data={calendar.data} />
        </>}
        {dialog === 'features' && <>
          <Text type="supporting">Se muestran hasta 50 detecciones de las {features.length} recibidas. Selecciona una para ver su ficha.</Text>
          {features.slice(0, 50).map((feature, index) => <Button key={index} label={`Detección ${index + 1} · ${feature.properties?.platform || 'FIRMS'} · ${feature.properties?.ts_utc || 'hora no disponible'}`} onClick={() => showFeature(index)} />)}
        </>}
        {dialog === 'feature' && (point ? <>
          <Text>Satélite: {point.properties?.platform || 'no disponible'}</Text>
          <Text>Adquisición UTC: {point.properties?.ts_utc || 'no disponible'}</Text>
          <Text>Latitud: {Number(point.geometry.coordinates[1]).toFixed(5)} · Longitud: {Number(point.geometry.coordinates[0]).toFixed(5)}</Text>
          <Text>FRP: {fmt(point.properties?.frp_mw)} MW · Confianza: {point.properties?.confidence_h || 'no disponible'}</Text>
          <Text type="supporting">Una detección no confirma un incendio.</Text>
          <Metadata data={recent.data} />
        </> : <Text>La detección ya no forma parte de la consulta actual.</Text>)}
        <Button label="Cerrar" onClick={() => setDialog(null)} />
      </Stack>
    </Dialog>
  </Stack>;
}
