import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Map, type GeoJSONSource, type ExpressionSpecification } from 'maplibre-gl';
import { BASEMAP_CREDIT, blueMarbleBrightness, blueMarbleSource } from '../lib/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TerraDraw, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { Popover } from '@astryxdesign/core/Popover';
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput';
import {
  getCalendar, getHotspotsGeoJson, getPriorityCells, getRecent, getRecurrence, getSpread, getTerritory, getWindLocalities, ApiError,
  type HotspotsGeoJson, type PriorityCellsResponse, type RecentFeatureCollection, type RecurrenceGeoJson, type SpreadResponse, type TerritoryResponse, type WindLocalitiesResponse,
} from '../api/client';
import { useApp } from '../state/AppState';
import { simplifyPolygon } from '../lib/drawnArea';
import { areaGeometry, geometryBbox, hotspotPeriod } from '../lib/mapVisual';
import { onMapDraw } from '../lib/mapBus';
import { monthNames, monthShort } from '../i18n';
import { FlameLegend, registerFlameImage } from './map/FlameMarker';
import { FLAME_ICON } from './map/flameImage';
import { TERRAIN_CREDIT, TERRAIN_CREDIT_URL, TERRAIN_PITCH, TERRAIN_SOURCE, resetBearing, setMapRelief } from './map/mapScene';
import { PRIORITY_STOPS, RECURRENCE_STOPS, mapInk } from '../lib/dataviz';
import { Box, Caption, Inline, LinkButton, OutlineButton, Toggle, kit } from '../ui/kit';


const s = stylex.create({
  root: { position: 'relative', width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', backgroundColor: 'var(--color-background-body)' },
  canvas: { position: 'absolute', inset: 0 },
  svg: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
  overlay: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' },
  basemap: { display: 'none' },
  tick: { position: 'absolute', fontSize: '10.5px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', textShadow: '0 0 3px var(--color-background-body), 0 0 2px var(--color-background-body)' },
  tickLat: { left: '6px', transform: 'translateY(-120%)' },
  tickLon: { bottom: '30px', transform: 'translateX(4px)' },
  loc: { position: 'absolute', display: 'flex', alignItems: 'center', gap: '5px', transform: 'translate(-5px, -5px)', pointerEvents: 'auto', whiteSpace: 'nowrap' },
  locSq: { width: '9px', height: '9px', borderWidth: '1.5px', borderStyle: 'solid', borderColor: 'var(--color-background-body)', flexShrink: 0 },
  locName: { fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)', textShadow: '0 1px 3px var(--color-background-body), 0 0 2px var(--color-background-body)' },
  anp: { position: 'absolute', fontFamily: 'var(--font-family-heading)', fontStyle: 'italic', fontSize: '12.5px', fontWeight: 500, whiteSpace: 'nowrap', transform: 'translate(-50%, -50%)', textShadow: '0 0 3px var(--color-background-body), 0 0 2px var(--color-background-body)' },
  coneLabel: { position: 'absolute', fontSize: '11.5px', fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', textShadow: '0 0 3px var(--color-background-body), 0 0 2px var(--color-background-body)' },
  card: { position: 'absolute', zIndex: 3, borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '2px', backgroundColor: 'var(--color-background-surface)' },
  area: { left: '16px', top: '16px', width: 'min(300px, calc(100% - 32px))', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', '@media (max-width: 720px)': { top: '12px', left: '12px', width: 'calc(100% - 24px)', padding: '10px 12px' } },
  areaTitle: { fontFamily: 'var(--font-family-heading)', fontWeight: 600, fontSize: '20px', lineHeight: 1.2, fontVariationSettings: '"opsz" 32' },
  areaMeta: { display: 'flex', flexDirection: 'column', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.45 },
  links: { display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px', fontSize: '13px' },
  layers: { right: '16px', bottom: '40px', width: '236px', overflow: 'hidden', maxHeight: 'calc(100% - 96px)', overflowY: 'auto', '@media (max-width: 720px)': { right: '12px', bottom: '36px', width: 'min(236px, calc(100% - 24px))' } },
  layersHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--color-border)', width: '100%', borderWidth: 0, backgroundColor: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700 },
  layer: { padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '13px' },
  layerText: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  layerSub: { fontSize: '11.5px', color: 'var(--color-text-secondary)' },
  hours: { padding: '4px 14px 12px', display: 'flex', gap: '4px' },
  hourBtn: { flexGrow: 1, height: '26px', borderRadius: '4px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', backgroundColor: 'transparent', color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  hourOn: { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-background-surface)', borderColor: 'var(--color-text-primary)' },
  legendRow: { position: 'absolute', left: '16px', bottom: '52px', display: 'flex', alignItems: 'flex-end', gap: '16px', zIndex: 2, '@media (max-width: 720px)': { left: '12px', bottom: '36px', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' } },
  legend: { padding: '8px 11px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', borderRadius: '2px', backgroundColor: 'var(--color-background-surface)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' },
  legendItems: { display: 'flex', alignItems: 'center', gap: '8px' },
  dot: { borderRadius: '50%', flexShrink: 0 },
  scale: { display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)', textShadow: '0 0 3px var(--color-background-body)' },
  scaleBar: { height: '5px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-text-secondary)', borderTopWidth: 0 },
  attribution: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: '26px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 14px', fontSize: '11px', color: 'var(--color-text-secondary)', backgroundColor: 'color-mix(in srgb, var(--color-background-body) 82%, transparent)', zIndex: 2, textAlign: 'right', '@media (max-width: 720px)': { fontSize: '10px', padding: '2px 8px' } },
  zoom: { position: 'absolute', right: '16px', top: '16px', zIndex: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden', '@media (max-width: 720px)': { top: 'auto', bottom: '64px', right: 'auto', left: '12px', display: 'none' } },
  zoomBtn: { width: '32px', height: '32px', borderWidth: 0, backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' }, color: 'var(--color-text-primary)', fontSize: '17px', cursor: 'pointer', fontFamily: 'inherit', ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '-2px' } },
  zoomSep: { height: '1px', backgroundColor: 'var(--color-border)' },
  zoomText: { fontSize: '12px', fontWeight: 700, ':disabled': { opacity: 0.4, cursor: 'not-allowed' } },
  zoomOn: { color: 'var(--color-text-accent)', backgroundColor: 'var(--color-accent-muted)' },
  north: { display: 'inline-block', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-accent)' },
  notices: { position: 'absolute', top: '16px', right: '60px', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', maxWidth: 'min(22rem, calc(100% - 400px))', pointerEvents: 'none', '@media (max-width: 1280px)': { top: 'auto', bottom: '120px', right: 'auto', left: '16px', alignItems: 'flex-start', maxWidth: 'calc(100% - 290px)' }, '@media (max-width: 720px)': { bottom: 'auto', top: '150px', left: '12px', maxWidth: 'calc(100% - 24px)' } },
  notice: { padding: '5px 9px', borderRadius: '2px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', backgroundColor: 'var(--color-background-surface)', fontSize: '12.5px', color: 'var(--color-text-primary)', lineHeight: 1.4 },
  noticeWarn: { borderColor: 'var(--color-accent)' },
  picked: { position: 'absolute', zIndex: 4, padding: '10px 12px', minWidth: '13rem', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', transform: 'translate(-50%, calc(-100% - 12px))' },
  pickedRow: { display: 'flex', justifyContent: 'space-between', gap: '12px' },
  close: { position: 'absolute', top: '4px', right: '6px', borderWidth: 0, backgroundColor: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '16px' },
  drawHint: { position: 'absolute', left: '50%', bottom: '64px', transform: 'translateX(-50%)', zIndex: 4, padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' },
});

const empty = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });
const fc = (geometry: GeoJSON.Geometry | null): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: geometry ? [{ type: 'Feature', geometry, properties: {} }] : [] });
const locale = { es: 'es-MX', en: 'en-US', pt: 'pt-BR' };
const labels = {
  es: { area: 'Área seleccionada', edit: 'Editar polígono', dates: 'Cambiar fechas', story: 'Ver como historia', layers: 'Capas', hotspots: 'Puntos de calor', recent: 'Detecciones recientes', recentSub: 'FIRMS, casi en tiempo real', goes: 'GOES geoestacionario', vision: 'Cada 5 min, próximamente', priority: 'Índice de prioridad', prioritySub: 'Por celda, de 0 a 100', recurrence: 'Recurrencia', times: 'Veces que ha ardido', spread: 'Cono de propagación', active: 'Según viento y área; orientativo', exposure: 'Exposición', places: 'Localidades y ANP', frp: 'Poder radiativo (FRP)', low: 'bajo', high: 'alto', noData: 'Sin puntos en', pick: 'Elige un mes con actividad en el calendario.', pts: 'puntos', toward: 'hacia', loading: 'Cargando puntos…', recentNo: 'Sin detecciones recientes', map: 'Mapa de Firely', basemap: 'Mapa base · relieve sombreado', dark: 'oscuro', light: 'claro', drawing: 'Haz clic para trazar el polígono y doble clic para cerrarlo.', coneNo: 'No hay cono de propagación porque falta el dato de viento', downwind: 'a favor del viento', zoomIn: 'Acercar', zoomOut: 'Alejar', years: 'años con fuego', truncated: 'se muestran los más intensos', admin: 'Límite:', indicative: 'orientativo, no es pronóstico oficial' },
  en: { area: 'Selected area', edit: 'Edit polygon', dates: 'Change dates', story: 'View as a story', layers: 'Layers', hotspots: 'Hotspots', recent: 'Recent detections', recentSub: 'FIRMS near real time', goes: 'GOES geostationary', vision: 'Every 5 min, coming soon', priority: 'Priority index', prioritySub: 'Per cell, 0 to 100', recurrence: 'Recurrence', times: 'Times it has burned', spread: 'Spread cone', active: 'From wind and area; indicative', exposure: 'Exposure', places: 'Localities and protected areas', frp: 'Radiative power (FRP)', low: 'low', high: 'high', noData: 'No hotspots in', pick: 'Choose a month with activity in the calendar.', pts: 'hotspots', toward: 'toward', loading: 'Loading hotspots…', recentNo: 'No recent detections', map: 'Firely map', basemap: 'Base map · shaded relief', dark: 'dark', light: 'light', drawing: 'Click to trace the polygon and double-click to close it.', coneNo: 'No spread cone: wind data is missing', downwind: 'downwind', zoomIn: 'Zoom in', zoomOut: 'Zoom out', years: 'years with fire', truncated: 'showing the strongest', admin: 'Boundary:', indicative: 'indicative, not an official forecast' },
  pt: { area: 'Área selecionada', edit: 'Editar polígono', dates: 'Alterar datas', story: 'Ver como história', layers: 'Camadas', hotspots: 'Pontos de calor', recent: 'Detecções recentes', recentSub: 'FIRMS, quase em tempo real', goes: 'GOES geoestacionário', vision: 'A cada 5 min, em breve', priority: 'Índice de prioridade', prioritySub: 'Por célula, de 0 a 100', recurrence: 'Recorrência', times: 'Vezes que queimou', spread: 'Cone de propagação', active: 'Por vento e área; indicativo', exposure: 'Exposição', places: 'Localidades e áreas protegidas', frp: 'Poder radiativo (FRP)', low: 'baixo', high: 'alto', noData: 'Sem pontos em', pick: 'Escolha um mês com atividade no calendário.', pts: 'pontos', toward: 'para', loading: 'Carregando pontos…', recentNo: 'Sem detecções recentes', map: 'Mapa Firely', basemap: 'Mapa base · relevo sombreado', dark: 'escuro', light: 'claro', drawing: 'Clique para traçar o polígono e duplo clique para fechá-lo.', coneNo: 'Sem cone de propagação: falta o dado de vento', downwind: 'a favor do vento', zoomIn: 'Aproximar', zoomOut: 'Afastar', years: 'anos com fogo', truncated: 'mostrando os mais intensos', admin: 'Limite:', indicative: 'indicativo, não é previsão oficial' },
};
type Lang = keyof typeof labels;
function apiError(e: unknown, lang: Lang) {
  if (e instanceof ApiError) return e.status === 503 && e.code === 'firms_map_key_missing' ? { es: 'Detecciones recientes: falta la llave FIRMS en el servidor', en: 'Recent detections: the server needs a FIRMS key', pt: 'Detecções recentes: falta a chave FIRMS no servidor' }[lang] : { es: `El servidor respondió con un error (${e.status}). Vuelve a intentarlo en un momento.`, en: `The server returned an error (${e.status}). Try again in a moment.`, pt: `O servidor respondeu com erro (${e.status}). Tente de novo em instantes.` }[lang];
  return e instanceof Error ? e.message : String(e);
}
function source(map: Map, id: string, data: GeoJSON.FeatureCollection) { (map.getSource(id) as GeoJSONSource | undefined)?.setData(data); }

/** Point at `km` along `deg` (bearing) from origin, small-distance approximation. */
function destination(lat: number, lon: number, km: number, deg: number): [number, number] {
  const r = deg * Math.PI / 180;
  return [lon + km * Math.sin(r) / (111.32 * Math.cos(lat * Math.PI / 180)), lat + km * Math.cos(r) / 110.57];
}
function centroid(geometry: unknown): [number, number] | null {
  const g = geometry as GeoJSON.Geometry | null;
  if (!g) return null;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? [...g.coordinates].sort((a, b) => b[0].length - a[0].length)[0]?.[0] : null;
  if (!ring?.length) return null;
  return [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];
}
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2, 5, 10, 20];
const SCALE_KM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export default function MapPanel() {
  const app = useApp(), lang = app.lang, t = labels[lang];
  const node = useRef<HTMLDivElement>(null), mapRef = useRef<Map | null>(null), drawRef = useRef<TerraDraw | null>(null), drawing = useRef(false), areaRef = useRef(app.setArea);
  areaRef.current = app.setArea;
  const [latestMonth, setLatestMonth] = useState<{ year: number; month: number } | null>(null);
  const [ready, setReady] = useState(false), [tick, setTick] = useState(0), [isDrawing, setIsDrawing] = useState(false);
  const [hotspots, setHotspots] = useState<HotspotsGeoJson | null>(null), [recent, setRecent] = useState<RecentFeatureCollection | null>(null), [recurrence, setRecurrence] = useState<RecurrenceGeoJson | null>(null);
  const [priority, setPriority] = useState<PriorityCellsResponse | null>(null);
  const [territory, setTerritory] = useState<TerritoryResponse | null>(null), [spread, setSpread] = useState<{ inner: SpreadResponse; outer: SpreadResponse } | null>(null), [wind, setWind] = useState<WindLocalitiesResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({}), [loading, setLoading] = useState<Record<string, boolean>>({}), [drawError, setDrawError] = useState('');
  const [picked, setPicked] = useState<{ lng: number; lat: number; props: Record<string, unknown> } | null>(null);
  const [relief, setRelief] = useState(true), [reliefError, setReliefError] = useState(false), [bearing, setBearing] = useState(0);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [layersOpen, setLayersOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 720px)').matches);
  const areaKey = JSON.stringify(app.area.area);
  const [periodFrom, periodTo] = app.selected || latestMonth ? hotspotPeriod(app.selected ?? latestMonth, app.from, app.to) : [app.from, app.to];
  const shownMonth = app.selected ?? latestMonth;
  const month = shownMonth ? `${monthShort[lang][shownMonth.month - 1]} ${shownMonth.year}` : new Intl.DateTimeFormat(locale[lang], { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${app.to.slice(0, 7)}-01T00:00:00Z`));
  const monthLong = shownMonth ? `${monthNames[lang][shownMonth.month - 1]} ${shownMonth.year}` : month;

  useEffect(() => { if (app.selected) return; const controller = new AbortController(); setLatestMonth(null); getCalendar(app.area.area, app.from, app.to, 'count', 'median', controller.signal).then(data => { const rows = data.rows.filter(r => (r.count_harm ?? 0) > 0).sort((a, b) => a.year - b.year || a.month - b.month); const last = rows.at(-1); if (last) setLatestMonth({ year: last.year, month: last.month }); }).catch(e => { if (!controller.signal.aborted) setErrors(old => ({ ...old, latest: apiError(e, lang) })); }); return () => controller.abort(); }, [areaKey, app.from, app.to, app.selected, lang]);

  useEffect(() => {
    if (!node.current) return;
    const map = new Map({
      container: node.current,
      style: { version: 8, sources: {
        earth: blueMarbleSource,
      }, layers: [
        { id: 'earth', type: 'raster', source: 'earth', paint: { 'raster-brightness-max': blueMarbleBrightness(true), 'raster-saturation': -0.15 } },
      ] },
      center: [-100.55, 25.45], zoom: 8, pitch: TERRAIN_PITCH, attributionControl: false, dragRotate: false, maxPitch: 70,
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize()); observer.observe(node.current);
    let frame = 0;
    let stopFlames = () => {};
    const bump = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setTick(v => v + 1)); };
    map.on('move', bump); map.on('resize', bump); map.on('terrain', bump);
    map.on('rotate', () => setBearing(map.getBearing()));
    map.on('sourcedata', e => { if (e.sourceId === TERRAIN_SOURCE && e.isSourceLoaded) bump(); });
    map.on('error', e => { if ((e as unknown as { sourceId?: string }).sourceId === TERRAIN_SOURCE) { setRelief(false); setReliefError(true); } });
    map.on('load', () => {
      for (const id of ['firely-area', 'firely-points', 'firely-recent', 'firely-recurrence', 'firely-priority', 'firely-protected', 'firely-cone', 'firely-cone-inner']) map.addSource(id, { type: 'geojson', data: empty() });
      map.addLayer({ id: 'firely-recurrence', type: 'fill', source: 'firely-recurrence', paint: { 'fill-color': RECURRENCE_STOPS[0], 'fill-opacity': 0.55 } });
      map.addLayer({ id: 'firely-priority', type: 'fill', source: 'firely-priority', layout: { visibility: 'none' }, paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'index'], ...PRIORITY_STOPS.flat()] as unknown as ExpressionSpecification, 'fill-opacity': 0.45, 'fill-outline-color': 'rgba(0,0,0,0.25)' } });
      map.addLayer({ id: 'firely-protected-fill', type: 'fill', source: 'firely-protected', paint: { 'fill-color': mapInk.protectedArea, 'fill-opacity': 0.1 } });
      map.addLayer({ id: 'firely-protected', type: 'line', source: 'firely-protected', paint: { 'line-color': mapInk.protectedArea, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'firely-area-fill', type: 'fill', source: 'firely-area', paint: { 'fill-color': '#e8803f', 'fill-opacity': 0.06 } });
      map.addLayer({ id: 'firely-border', type: 'line', source: 'firely-area', paint: { 'line-color': '#e8803f', 'line-width': 2, 'line-dasharray': [3, 2] } });
      map.addLayer({ id: 'firely-cone-fill', type: 'fill', source: 'firely-cone', paint: { 'fill-color': '#ebe8e3', 'fill-opacity': 0.1 } });
      map.addLayer({ id: 'firely-cone-inner', type: 'fill', source: 'firely-cone-inner', paint: { 'fill-color': '#ebe8e3', 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'firely-cone-line', type: 'line', source: 'firely-cone', paint: { 'line-color': '#ebe8e3', 'line-width': 1.2, 'line-dasharray': [4, 3] } });
      stopFlames = registerFlameImage(map);
      const flameLayout = {
        'icon-image': FLAME_ICON, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.2, 9, 0.3, 12, 0.45] as unknown as ExpressionSpecification,
      };
      map.addLayer({ id: 'firely-points', type: 'symbol', source: 'firely-points', layout: flameLayout });
      map.addLayer({ id: 'firely-recent', type: 'symbol', source: 'firely-recent', layout: flameLayout });
      setReady(true); bump();
    });
    map.on('click', e => {
      if (drawing.current) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ['firely-points', 'firely-recent'] })[0];
      if (hit) { setPicked({ lng: e.lngLat.lng, lat: e.lngLat.lat, props: hit.properties || {} }); return; }
      const cell = map.getLayoutProperty('firely-priority', 'visibility') === 'visible' ? map.queryRenderedFeatures(e.point, { layers: ['firely-priority'] })[0] : undefined;
      if (cell) { setPicked({ lng: e.lngLat.lng, lat: e.lngLat.lat, props: { priority: true, ...(cell.properties || {}) } }); return; }
      setPicked(null);
    });
    map.on('mouseenter', 'firely-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'firely-points', () => { map.getCanvas().style.cursor = ''; });
    return () => { stopFlames(); cancelAnimationFrame(frame); observer.disconnect(); drawRef.current?.stop(); drawRef.current = null; map.remove(); mapRef.current = null; };
  }, []);

  // scheme-dependent paint
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    const dark = app.scheme === 'dark';
    map.setPaintProperty('earth', 'raster-brightness-max', blueMarbleBrightness(dark));
    const ink = dark ? '#ebe8e3' : '#1a1c1e', ember = dark ? '#e8803f' : '#c9601f';
    for (const id of ['firely-cone-fill', 'firely-cone-inner']) map.setPaintProperty(id, 'fill-color', ink);
    map.setPaintProperty('firely-cone-line', 'line-color', ink);
    map.setPaintProperty('firely-border', 'line-color', ember); map.setPaintProperty('firely-area-fill', 'fill-color', ember);
  }, [ready, app.scheme]);

  useEffect(() => { const map = mapRef.current; if (!ready || !map) return; setMapRelief(map, relief); }, [ready, relief]);

  useEffect(() => { const map = mapRef.current; if (!ready || !map) return; const g = areaGeometry(app.area); source(map, 'firely-area', fc(g)); const b = app.area.bbox ?? geometryBbox(g); if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: window.matchMedia('(max-width: 720px)').matches ? { top: 150, bottom: 70, left: 24, right: 24 } : { top: 70, bottom: 60, left: 60, right: 200 }, maxZoom: 11, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350 }); }, [areaKey, ready]);
  useEffect(() => { const map = mapRef.current; if (!ready || !map) return; source(map, 'firely-points', hotspots ? { type: 'FeatureCollection', features: hotspots.features.filter(f => !app.selectedDay || f.properties.date.slice(0, 10) === app.selectedDay) } as GeoJSON.FeatureCollection : empty()); map.setLayoutProperty('firely-points', 'visibility', app.layers.hotspots ? 'visible' : 'none'); }, [ready, hotspots, app.selectedDay, app.layers.hotspots]);
  useEffect(() => { const map = mapRef.current; if (!ready || !map) return; source(map, 'firely-recent', recent as GeoJSON.FeatureCollection ?? empty()); map.setLayoutProperty('firely-recent', 'visibility', app.layers.recent ? 'visible' : 'none'); }, [ready, recent, app.layers.recent]);
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    source(map, 'firely-recurrence', recurrence as GeoJSON.FeatureCollection ?? empty());
    const max = Math.max(1, recurrence?.max_years_burned ?? 1);
    map.setPaintProperty('firely-recurrence', 'fill-color', ['interpolate', ['linear'], ['get', 'years_burned'], 1, RECURRENCE_STOPS[0], Math.max(1.01, max * 0.25), RECURRENCE_STOPS[1], Math.max(1.02, max * 0.5), RECURRENCE_STOPS[2], Math.max(1.03, max * 0.75), RECURRENCE_STOPS[3], Math.max(1.04, max), RECURRENCE_STOPS[4]] as ExpressionSpecification);
    map.setLayoutProperty('firely-recurrence', 'visibility', app.layers.recurrence ? 'visible' : 'none');
  }, [ready, recurrence, app.layers.recurrence]);
  useEffect(() => { const map = mapRef.current; if (!ready || !map) return; source(map, 'firely-priority', priority as unknown as GeoJSON.FeatureCollection ?? empty()); map.setLayoutProperty('firely-priority', 'visibility', app.layers.priority ? 'visible' : 'none'); }, [ready, priority, app.layers.priority]);
  useEffect(() => { const map = mapRef.current; if (!ready || !map) return; source(map, 'firely-protected', territory?.protected_areas as GeoJSON.FeatureCollection ?? empty()); for (const id of ['firely-protected', 'firely-protected-fill']) map.setLayoutProperty(id, 'visibility', app.layers.exposure ? 'visible' : 'none'); }, [ready, territory, app.layers.exposure]);
  useEffect(() => { const map = mapRef.current; if (!ready || !map) return; const cone = (r?: SpreadResponse) => { const c = (r as unknown as { cone?: GeoJSON.Feature })?.cone; return c ? { type: 'FeatureCollection', features: [c] } as GeoJSON.FeatureCollection : empty(); }; source(map, 'firely-cone', cone(spread?.outer)); source(map, 'firely-cone-inner', cone(spread?.inner)); for (const id of ['firely-cone-fill', 'firely-cone-inner', 'firely-cone-line']) map.setLayoutProperty(id, 'visibility', app.layers.spread ? 'visible' : 'none'); }, [ready, spread, app.layers.spread]);

  const load = <T,>(key: string, enabled: boolean, run: (signal: AbortSignal) => Promise<T>, set: (v: T | null) => void) => {
    const controller = new AbortController(); set(null); setErrors(old => ({ ...old, [key]: '' }));
    if (!enabled) return () => controller.abort();
    setLoading(v => ({ ...v, [key]: true }));
    run(controller.signal).then(set).catch(e => { if (!controller.signal.aborted) setErrors(v => ({ ...v, [key]: apiError(e, lang) })); }).finally(() => { if (!controller.signal.aborted) setLoading(v => ({ ...v, [key]: false })); });
    return () => controller.abort();
  };
  useEffect(() => load('hotspots', app.layers.hotspots && periodFrom <= periodTo, sig => getHotspotsGeoJson(app.area.area, periodFrom, periodTo, 20000, sig), setHotspots), [areaKey, periodFrom, periodTo, app.layers.hotspots, lang]);
  useEffect(() => load('recent', app.layers.recent && !!app.live, sig => getRecent(app.area.area, (app.live || 24) as 24 | 48, sig), setRecent), [areaKey, app.layers.recent, app.live, lang]);
  useEffect(() => load('recurrence', app.layers.recurrence, sig => getRecurrence(app.area.area, app.from, app.to, sig), setRecurrence), [areaKey, app.from, app.to, app.layers.recurrence, lang]);
  useEffect(() => load('priority', app.layers.priority, sig => getPriorityCells(app.area.area, undefined, sig), setPriority), [areaKey, app.layers.priority, lang]);
  useEffect(() => load('territory', true, sig => getTerritory(app.area.area, sig), setTerritory), [areaKey, lang]);
  useEffect(() => load('spread', app.layers.spread, sig => Promise.all([getSpread(app.area.area, 6, sig), getSpread(app.area.area, 12, sig)]).then(([inner, outer]) => ({ inner, outer })), setSpread), [areaKey, app.layers.spread, lang]);
  useEffect(() => load('wind', app.layers.exposure, sig => getWindLocalities(app.area.area, 12, sig), setWind), [areaKey, app.layers.exposure, lang]);

  const beginDraw = () => {
    const map = mapRef.current; if (!map) return;
    setRelief(false); setMapRelief(map, false, true); // drawing needs the flat view
    setDrawError(''); drawing.current = true; setIsDrawing(true); drawRef.current?.stop();
    const draw = new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map }), modes: [new TerraDrawPolygonMode()] });
    drawRef.current = draw;
    draw.on('finish', () => {
      const feature = draw.getSnapshot().find(f => f.geometry.type === 'Polygon'); if (!feature) return;
      try { const geometry = simplifyPolygon((feature.geometry as GeoJSON.Polygon).coordinates[0]); const bbox = geometryBbox(geometry) ?? undefined; areaRef.current({ kind: 'drawn', label: lang === 'en' ? 'Drawn area' : lang === 'pt' ? 'Área desenhada' : 'Área dibujada', area: { geometry: JSON.stringify(geometry) }, bbox }); } catch (e) { setDrawError(e instanceof Error ? e.message : String(e)); }
      draw.stop(); drawRef.current = null; drawing.current = false; setIsDrawing(false);
    });
    draw.start(); draw.setMode('polygon');
  };
  useEffect(() => onMapDraw(beginDraw), [ready, lang]);
  useEffect(() => { const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape' && drawing.current) { drawRef.current?.stop(); drawRef.current = null; drawing.current = false; setIsDrawing(false); } }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel); }, []);

  // ---- HTML/SVG overlays projected from the map (graticule, labels, scale) ----
  const view = useMemo(() => {
    const map = mapRef.current; if (!ready || !map) return null;
    const canvas = map.getContainer(); const w = canvas.clientWidth, h = canvas.clientHeight;
    const b = map.getBounds(); const south = b.getSouth(), north = b.getNorth(), west = b.getWest(), east = b.getEast();
    const step = STEPS.find(x => (north - south) / x <= 4.5) ?? 20;
    const lonStep = STEPS.find(x => (east - west) / x <= 4.5) ?? 20;
    const dec = (x: number) => (x < 0.1 ? 2 : x < 1 ? 2 : 0);
    const lats: { y: number; label: string }[] = []; const lons: { x: number; label: string }[] = [];
    const W = lang === 'en' ? 'W' : 'O';
    for (let v = Math.ceil(south / step) * step; v <= north; v += step) { const y = map.project([map.getCenter().lng, v]).y; if (y > 30 && y < h - 40) lats.push({ y, label: `${Math.abs(v).toFixed(dec(step))}°${v >= 0 ? 'N' : 'S'}` }); }
    for (let v = Math.ceil(west / lonStep) * lonStep; v <= east; v += lonStep) { const x = map.project([v, map.getCenter().lat]).x; if (x > 40 && x < w - 40) lons.push({ x, label: `${Math.abs(v).toFixed(dec(lonStep))}°${v >= 0 ? 'E' : W}` }); }
    const mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (512 * 2 ** map.getZoom());
    const km = [...SCALE_KM].reverse().find(d => d * 1000 / mpp <= 100) ?? 0.1;
    const inView = (lon: number, lat: number) => { const p = map.project([lon, lat]); return p.x > 0 && p.x < w && p.y > 0 && p.y < h ? p : null; };
    const downwind = new Set((wind?.localities ?? []).map(l => l.name));
    const locs: { x: number; y: number; name: string; hot: boolean; title: string }[] = [];
    const placed: [number, number, number, number][] = [];
    const free = (x: number, y: number, text: string) => { const r: [number, number, number, number] = [x - 6, y - 9, x + 16 + text.length * 6.2, y + 9]; if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return false; placed.push(r); return true; };
    if (app.layers.exposure) {
      const seen = new Set<string>();
      for (const l of (wind?.localities ?? []).slice(0, 6)) { const p = inView(l.lon, l.lat); if (p && !seen.has(l.name) && free(p.x, p.y, l.name)) { seen.add(l.name); locs.push({ x: p.x, y: p.y, name: l.name, hot: true, title: `${l.name}, ${t.downwind}, ${l.distance_km} km ${l.compass}${l.pop ? `, ${new Intl.NumberFormat(locale[lang]).format(l.pop)} hab.` : ''}` }); } }
      for (const l of [...(territory?.localities ?? [])].sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0)).slice(0, map.getZoom() >= 10 ? 14 : 8)) { const p = inView(l.lon, l.lat); if (p && !seen.has(l.name) && free(p.x, p.y, l.name)) { seen.add(l.name); locs.push({ x: p.x, y: p.y, name: l.name, hot: downwind.has(l.name), title: `${l.name}${l.pop ? `, ${new Intl.NumberFormat(locale[lang]).format(l.pop)} hab.` : ''}` }); } }
    }
    const anps = app.layers.exposure ? (territory?.protected_areas.features ?? []).slice(0, 4).map(f => { const c = centroid(f.geometry); const p = c && inView(c[0], c[1]); return p && free(p.x - 60, p.y, f.properties.name) ? { x: p.x, y: p.y, name: f.properties.name } : null; }).filter(Boolean) as { x: number; y: number; name: string }[] : [];
    let cone: { inner?: { x: number; y: number }; outer?: { x: number; y: number }; text: string; title: string } | null = null;
    if (app.layers.spread && spread) {
      const o = spread.outer, i = spread.inner;
      const po = map.project(destination(o.origin.lat, o.origin.lon, o.reach_km, o.direction.toward_deg));
      const pi = map.project(destination(i.origin.lat, i.origin.lon, i.reach_km * 0.75, i.direction.toward_deg));
      const rate = o.reach_km / Math.max(1, o.hours);
      cone = { outer: { x: po.x, y: po.y }, inner: { x: pi.x, y: pi.y }, text: `${o.hours} h, ${rate.toFixed(1)} km/h ${t.toward} ${o.direction.toward_compass}`, title: `${o.warning} ${o.method}. ${lang === 'en' ? 'Wind' : 'Viento'} ${o.wind.speed_kmh} km/h (${o.wind.source})` };
    }
    const pickedAt = picked ? map.project([picked.lng, picked.lat]) : null;
    return { w, h, lats, lons, km, px: km * 1000 / mpp, locs, anps, cone, pickedAt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tick, wind, territory, spread, picked, app.layers.exposure, app.layers.spread, lang]);

  const method = hotspots?.methodology_version || recurrence?.methodology_version || territory?.methodology_version;
  const cutoff = hotspots?.data_cutoff || recent?.data_cutoff || territory?.data_cutoff;
  const notices: { key: string; text: string; warn?: boolean }[] = [];
  if (reliefError) notices.push({ key: 'relief', warn: true, text: lang === 'es' ? 'No se pudo cargar el relieve. Se muestra la vista plana.' : lang === 'en' ? 'Terrain unavailable. Showing the flat view.' : 'Relevo indisponível. Mostrando a vista plana.' });
  if (drawError) notices.push({ key: 'draw', text: drawError, warn: true });
  for (const [key, message] of Object.entries(errors)) if (message && (key === 'territory' || (key === 'hotspots' && app.layers.hotspots) || (key === 'recent' && app.layers.recent) || (key === 'recurrence' && app.layers.recurrence) || (key === 'priority' && app.layers.priority) || (key === 'spread' && app.layers.spread))) notices.push({ key, text: key === 'spread' ? `${t.coneNo}. ${message}` : message, warn: true });
  if (loading.hotspots) notices.push({ key: 'loading', text: t.loading });
  if (app.layers.hotspots && hotspots && hotspots.features.length === 0) notices.push({ key: 'empty', text: `${t.noData} ${monthLong}. ${t.pick}` });
  if (app.layers.hotspots && hotspots?.truncated) notices.push({ key: 'trunc', text: `${new Intl.NumberFormat(locale[lang]).format(hotspots.n_total)} ${t.pts}; ${t.truncated}` });
  if (app.layers.recent && recent && recent.features.length === 0) notices.push({ key: 'recentNo', text: t.recentNo });

  const layerRows: { key: keyof typeof app.layers; label: string; sub: string; disabled?: boolean; title?: string }[] = [
    { key: 'hotspots', label: t.hotspots, sub: `${monthLong}${hotspots ? `, ${new Intl.NumberFormat(locale[lang]).format(hotspots.n_total ?? hotspots.features.length)} ${t.pts}` : ''}` },
    { key: 'recent', label: t.recent, sub: t.recentSub },
    { key: 'goes', label: t.goes, sub: t.vision, disabled: true },
    { key: 'recurrence', label: t.recurrence, sub: recurrence && app.layers.recurrence ? `${t.times}, 0–${recurrence.max_years_burned}` : t.times },
    { key: 'priority', label: t.priority, sub: priority && app.layers.priority ? `${t.prioritySub}, ${priority.period}` : t.prioritySub },
    { key: 'spread', label: t.spread, sub: t.active, title: t.indicative },
    { key: 'exposure', label: t.exposure, sub: t.places },
  ];
  const reliefLabel = lang === 'es' ? 'Relieve 3D' : lang === 'en' ? '3D terrain' : 'Relevo 3D';
  const reliefHint = touch
    ? (lang === 'es' ? 'Gira e inclina con dos dedos' : lang === 'en' ? 'Rotate and tilt with two fingers' : 'Gire e incline com dois dedos')
    : (lang === 'es' ? 'Clic derecho y arrastra para girar' : lang === 'en' ? 'Right-click and drag to rotate' : 'Clique direito e arraste para girar');
  const northLabel = lang === 'es' ? 'Orientar al norte' : lang === 'en' ? 'Reset north' : 'Orientar ao norte';
  const fmtKm = (km: number) => km < 1 ? `${km * 1000} m` : `${km} km`;
  const anpLabel = (name: string) => /^(anp|apff|pn|rb|parque|reserva|área)/i.test(name) ? name : `ANP ${name}`;
  const pp = picked?.props as { date?: string; ts_utc?: string; sensor?: string; platform?: string; frp_mw?: number; confidence_h?: string; daynight?: string } | undefined;

  return (
    <Box xs={s.root}>
      <Box ref={node} xs={s.canvas} style={{ position: "absolute", inset: 0 }} role="application" aria-label={t.map} />
      {view && !relief && <svg {...stylex.props(s.svg)} aria-hidden="true">
        {view.lats.map(l => <line key={`la${l.label}`} x1={0} x2={view.w} y1={l.y} y2={l.y} stroke="var(--color-border)" strokeWidth={1} opacity={0.75} />)}
        {view.lons.map(l => <line key={`lo${l.label}`} y1={0} y2={view.h} x1={l.x} x2={l.x} stroke="var(--color-border)" strokeWidth={1} opacity={0.75} />)}
      </svg>}
      {view && <Box xs={s.overlay}>
        {!relief && view.lats.map(l => <Inline key={`la${l.label}`} xs={[s.tick, s.tickLat]} style={{ top: l.y }}>{l.label}</Inline>)}
        {!relief && view.lons.map(l => <Inline key={`lo${l.label}`} xs={[s.tick, s.tickLon]} style={{ left: l.x }}>{l.label}</Inline>)}
        {view.anps.map(a => <Inline key={a.name} xs={s.anp} style={{ left: a.x, top: a.y, color: mapInk.protectedArea }}>{anpLabel(a.name)}</Inline>)}
        {view.locs.map(l => <Inline key={l.name} xs={s.loc} style={{ left: l.x, top: l.y }} title={l.title}><Inline xs={s.locSq} style={{ backgroundColor: l.hot ? mapInk.exposedLocality : mapInk.otherLocality }} /><Inline xs={s.locName}>{l.name}</Inline></Inline>)}
        {view.cone?.inner && <Inline xs={s.coneLabel} style={{ left: view.cone.inner.x, top: view.cone.inner.y }} title={view.cone.title}>6 h</Inline>}
        {view.cone?.outer && <Inline xs={s.coneLabel} style={{ left: Math.min(view.cone.outer.x + 6, view.w - 170), top: Math.max(view.cone.outer.y - 14, 30) }} title={view.cone.title}>{view.cone.text}</Inline>}
      </Box>}

      <Box xs={[s.card, s.area]}>
        <Inline xs={s.areaTitle} aria-label={`${t.area}: ${app.area.label}`}>{app.area.label}</Inline>
        <Box xs={s.areaMeta}>{territory ? <><Inline>{new Intl.NumberFormat(locale[lang], { maximumFractionDigits: 0 }).format(territory.area_km2)} km², {monthLong}</Inline>{territory.admin?.source && <Inline>{territory.admin.municipality ? `${t.admin} ${territory.admin.source}` : territory.admin.source}</Inline>}</> : <Inline>{loading.territory ? '…' : monthLong}</Inline>}</Box>
        <Box xs={s.links}>
          <LinkButton onClick={beginDraw}>{t.edit}</LinkButton>
          <Popover label={t.dates} content={<DateRangeInput label={t.dates} value={{ start: app.from as DateRange['start'], end: app.to as DateRange['end'] }} onChange={v => { if (v) app.setRange(v.start, v.end); }} numberOfMonths={1} />}><LinkButton>{t.dates}</LinkButton></Popover>
          <LinkButton onClick={() => app.navigate('historia')}>{t.story}</LinkButton>
        </Box>
      </Box>

      <Box xs={[s.card, s.zoom]}>
        <button type="button" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => mapRef.current?.zoomIn()} {...stylex.props(s.zoomBtn)}>+</button>
        <Inline xs={s.zoomSep} />
        <button type="button" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => mapRef.current?.zoomOut()} {...stylex.props(s.zoomBtn)}>−</button>
        <Inline xs={s.zoomSep} />
        <button type="button" aria-pressed={relief} disabled={isDrawing} title={reliefLabel} aria-label={reliefLabel} onClick={() => { setReliefError(false); setRelief(v => !v); }} {...stylex.props(s.zoomBtn, s.zoomText, relief && s.zoomOn)}>3D</button>
        {relief && Math.abs(bearing) > 0.5 && <><Inline xs={s.zoomSep} />
        <button type="button" title={northLabel} aria-label={northLabel} onClick={() => mapRef.current && resetBearing(mapRef.current)} {...stylex.props(s.zoomBtn)}><Inline xs={s.north} style={{ transform: `rotate(${-bearing}deg)` }}>N</Inline></button></>}
      </Box>

      {notices.length > 0 && <Box xs={s.notices} aria-live="polite">{notices.map(n => <Inline key={n.key} xs={[s.notice, n.warn && s.noticeWarn]}>{n.text}</Inline>)}</Box>}

      <Box xs={[s.card, s.layers]}>
        <button type="button" aria-expanded={layersOpen} onClick={() => setLayersOpen(v => !v)} {...stylex.props(s.layersHead)}><Inline>{t.layers}</Inline><Caption>{layersOpen ? '−' : '+'}</Caption></button>
        {layersOpen && <>
          <Box xs={s.layer}>
            <Inline xs={s.layerText}><Inline>{reliefLabel}</Inline><Inline xs={s.layerSub}>{reliefHint}</Inline></Inline>
            <Toggle label={reliefLabel} isOn={relief} disabled={isDrawing} onChange={v => { setReliefError(false); setRelief(v); }} />
          </Box>
          {layerRows.map(r => <Box key={r.key} xs={s.layer} title={r.title}>
            <Inline xs={s.layerText}><Inline>{r.label}</Inline><Inline xs={s.layerSub}>{r.sub}</Inline></Inline>
            <Toggle label={r.label} isOn={!r.disabled && app.layers[r.key]} disabled={r.disabled} title={r.disabled ? t.vision : undefined} onChange={v => { app.setLayer(r.key, v); if (r.key === 'recent' && v && !app.live) app.setLive(24); }} />
          </Box>)}
          <Box xs={s.hours}>{([24, 48] as const).map(hh => <button key={hh} type="button" aria-pressed={app.layers.recent && (app.live || 24) === hh} onClick={() => { app.setLive(hh); app.setLayer('recent', true); }} {...stylex.props(s.hourBtn, app.layers.recent && (app.live || 24) === hh && s.hourOn)}>{hh} h</button>)}</Box>
        </>}
      </Box>

      <Box xs={s.legendRow}>
        <Box xs={s.legend}>
          <Caption>{t.frp} · MW</Caption>
          <Inline xs={s.legendItems}><FlameLegend level={0} />&lt;15<FlameLegend level={1} />15–&lt;40<FlameLegend level={2} />≥40<FlameLegend level={3} />{lang === 'es' ? 'Sin dato' : lang === 'en' ? 'Unknown' : 'Sem dado'}</Inline>
        </Box>
        {view && !relief && <Box xs={s.scale}><Inline xs={s.scaleBar} style={{ width: Math.round(view.px) }} />{fmtKm(view.km)}</Box>}
      </Box>

      {picked && view?.pickedAt && pp && !picked.props.priority && <Box xs={[s.card, s.picked]} style={{ left: view.pickedAt.x, top: view.pickedAt.y }} role="dialog" aria-label={t.hotspots}>
        <button type="button" aria-label="Cerrar" onClick={() => setPicked(null)} {...stylex.props(s.close)}>×</button>
        <Caption>{pp.sensor || pp.platform || 'FIRMS'}{pp.platform && pp.platform !== pp.sensor ? `, ${pp.platform}` : ''}</Caption>
        <Box xs={s.pickedRow}><Inline>{(pp.date || pp.ts_utc || '').slice(0, 16).replace('T', ' ')}</Inline><Inline xs={kit.mono}>{pp.daynight === 'N' ? (lang === 'en' ? 'night' : 'noche') : pp.daynight === 'D' ? (lang === 'en' ? 'day' : 'día') : ''}</Inline></Box>
        <Box xs={s.pickedRow}><Inline>FRP</Inline><Inline xs={kit.mono}>{pp.frp_mw ?? '—'} MW</Inline></Box>
        {pp.confidence_h && <Box xs={s.pickedRow}><Inline>{lang === 'en' ? 'confidence' : 'confianza'}</Inline><Inline xs={kit.mono}>{pp.confidence_h}</Inline></Box>}
      {picked && view?.pickedAt && !!picked.props.priority && <Box xs={[s.card, s.picked]} style={{ left: view.pickedAt.x, top: view.pickedAt.y }} role="dialog" aria-label={t.priority}>
        <button type="button" aria-label="Cerrar" onClick={() => setPicked(null)} {...stylex.props(s.close)}>×</button>
        <Caption title={String(picked.props.h3 ?? '')}>{t.priority}</Caption>
        <Box xs={s.pickedRow}><Inline>{String(picked.props.level ?? '')}</Inline><Inline xs={kit.mono}>{Number(picked.props.index ?? 0).toFixed(0)} / 100</Inline></Box>
        {picked.props.population_10km != null && <Box xs={s.pickedRow}><Inline>{lang === 'en' ? 'people ≤10 km' : 'hab. ≤10 km'}</Inline><Inline xs={kit.mono}>{new Intl.NumberFormat(locale[lang]).format(Number(picked.props.population_10km))}</Inline></Box>}
      </Box>}
      </Box>}

      {isDrawing && <Box xs={[s.card, s.drawHint]} role="status">{t.drawing}<OutlineButton size="sm" onClick={() => { drawRef.current?.stop(); drawRef.current = null; drawing.current = false; setIsDrawing(false); }}>{lang === 'en' ? 'Cancel (Esc)' : 'Cancelar (Esc)'}</OutlineButton></Box>}

      <Box xs={s.attribution}>NASA FIRMS (MODIS C6.1 · VIIRS 375 m) {lang === 'en' ? 'harmonized' : 'armonizados'}{method ? ` · ${method}` : ''}{cutoff ? ` · ${cutoff}` : ''} · {BASEMAP_CREDIT}{relief && <> · <a href={TERRAIN_CREDIT_URL} target="_blank" rel="noreferrer">{TERRAIN_CREDIT}</a></>}{territory?.admin?.source ? ` · ${territory.admin.source.split(' ')[0]}` : ''}</Box>
    </Box>
  );
}
