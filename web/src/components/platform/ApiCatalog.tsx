// "API" section of the platform page: the endpoints people actually use, grouped by what they are for, each one
// testable with the active area. The full reference (every route, every parameter) stays in /docs.
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { API_URL, areaParams, type Area } from '../../api/client';

type Endpoint = { path: string; what: string; dates?: boolean; noArea?: boolean };
const GROUPS: { title: string; items: Endpoint[] }[] = [
  { title: 'Historia del fuego', items: [
    { path: '/calendar', what: 'Calendario mes a mes del área, con lo normal, la anomalía y el periodo de retorno.', dates: true },
    { path: '/season', what: 'Inicio, pico y fin de la temporada de cada año, y su tendencia.' },
    { path: '/events', what: 'Incendios principales: detecciones agrupadas en el espacio y el tiempo.' },
    { path: '/analogs', what: 'Los años más parecidos al momento actual.' },
  ] },
  { title: 'Pronóstico y riesgo', items: [
    { path: '/forecast', what: 'Perspectiva de actividad a 1-3 meses, contra lo normal.' },
    { path: '/risk', what: 'Índice de prioridad 0-100 y de qué se compone.' },
    { path: '/risk/forecast', what: 'Peligro meteorológico de incendio para los próximos 8 días (FWI).' },
  ] },
  { title: 'Mapas y descargas', items: [
    { path: '/hotspots.geojson', what: 'Puntos de calor del área para cualquier mapa web.', dates: true },
    { path: '/hotspots.csv', what: 'Los mismos puntos en una tabla.', dates: true },
    { path: '/export.kml', what: 'Archivo para abrir en Google Earth.', dates: true },
  ] },
  { title: 'Contexto del área', items: [
    { path: '/weather', what: 'Lluvia, temperatura, humedad y viento de NASA POWER.' },
    { path: '/territory', what: 'Localidades, población y áreas protegidas dentro del área.' },
  ] },
  { title: 'Avisos', items: [
    { path: '/watch', what: 'Municipios con actividad fuera de lo normal (vigía).', noArea: true },
    { path: '/alerts/cap', what: 'Alertas CAP aprobadas, como feed para otros sistemas.', noArea: true },
  ] },
];

const sx = stylex.create({
  row: { paddingBlock: 'var(--spacing-2)', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)' },
  path: { fontFamily: 'var(--font-family-code)' },
  out: { fontFamily: 'var(--font-family-code)', fontSize: '12px', whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: '28rem', margin: 0,
    padding: 'var(--spacing-3)', borderRadius: 'var(--radius-2)', backgroundColor: 'var(--color-background-muted)' },
  sticky: { position: 'sticky', top: 'var(--spacing-12)', alignSelf: 'start' },
});

export default function ApiCatalog({ area, from, to }: { area: Area; from: string; to: string }) {
  const [url, setUrl] = useState(''), [out, setOut] = useState(''), [busy, setBusy] = useState('');
  async function run(e: Endpoint) {
    const params = e.noArea ? new URLSearchParams() : areaParams(area);
    if (e.dates) { params.set('from', from); params.set('to', to); }
    const target = `${API_URL}${e.path}${params.toString() ? `?${params}` : ''}`;
    setUrl(target); setOut(''); setBusy(e.path);
    try {
      const r = await fetch(target);
      const text = await r.text();
      let shown = text;
      try { shown = JSON.stringify(JSON.parse(text), null, 2); } catch { /* GeoJSON/CSV/KML/XML: show as text */ }
      setOut(`${r.status} ${r.statusText}\n\n${shown.slice(0, 6000)}${shown.length > 6000 ? '\n…' : ''}`);
    } catch (err) { setOut(String(err)); } finally { setBusy(''); }
  }
  return <Grid columns={{ minWidth: 320, max: 2 }} gap={5}>
    <VStack gap={4}>{GROUPS.map(g => <VStack key={g.title} gap={1}><Heading level={3}>{g.title}</Heading>
      {g.items.map(e => <HStack key={e.path} gap={3} vAlign="center" hAlign="between" xstyle={sx.row}>
        <VStack gap={0.5}><HStack gap={2} vAlign="center"><Badge label="GET" variant="neutral" /><Text xstyle={sx.path}>{e.path}</Text></HStack><Text type="supporting">{e.what}</Text></VStack>
        <Button label="Probar" size="sm" variant="secondary" isLoading={busy === e.path} onClick={() => void run(e)} />
      </HStack>)}</VStack>)}</VStack>
    <VStack gap={3} xstyle={sx.sticky}>
      <HStack gap={2} wrap="wrap"><Button label="Documentación completa" href={`${API_URL}/docs`} target="_blank" /><Button label="Esquema OpenAPI" variant="secondary" href={`${API_URL}/openapi.json`} target="_blank" /></HStack>
      <Text type="supporting">Elige un endpoint y pulsa «Probar»: se consulta con el área y el periodo activos. Toda respuesta trae la versión del método, la fecha de corte y la atribución a NASA FIRMS.</Text>
      {url && <Text type="code" wordBreak="break-all">{url}</Text>}
      <pre {...stylex.props(sx.out)}>{out || 'La respuesta aparecerá aquí.'}</pre>
    </VStack>
  </Grid>;
}
