import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map } from 'maplibre-gl';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRenderMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Area, RecentFeatureCollection } from './api/client';
import { simplifyPolygon, type PolygonGeometry } from './drawnArea';
import { messages, type Language } from './i18n';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';

const style: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

interface Props {
  area: Area;
  recent: RecentFeatureCollection | null;
  theme: 'dark' | 'light';
  selectedDate?: string;
  onPick: (lat: number, lon: number) => void;
  drawing: boolean;
  language: Language;
  onDraw: (geometry: PolygonGeometry) => void;
  onDrawingChange: (drawing: boolean) => void;
}

export default function MapView({ area, recent, theme, selectedDate, onPick, drawing, language, onDraw, onDrawingChange }: Props) {
  const container = useRef<HTMLElement>(null);
  const map = useRef<Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const onPickRef = useRef(onPick);
  const onDrawRef = useRef(onDraw);
  const onDrawingChangeRef = useRef(onDrawingChange);
  const drawingRef = useRef(drawing);
  const areaRef = useRef(area);
  const recentRef = useRef(recent);
  areaRef.current = area;
  recentRef.current = recent;
  onPickRef.current = onPick;
  onDrawRef.current = onDraw;
  onDrawingChangeRef.current = onDrawingChange;
  drawingRef.current = drawing;

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style,
      center: [-100.95, 25.43],
      zoom: 8,
      attributionControl: false,
    });
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    instance.on('click', (event) => { if (!drawingRef.current) onPickRef.current(event.lngLat.lat, event.lngLat.lng); });
    instance.on('load', () => {
      instance.addSource('recent', { type: 'geojson', data: recentRef.current ?? { type: 'FeatureCollection', features: [] } });
      const colors = getComputedStyle(document.documentElement);
      instance.addLayer({ id: 'recent-circles', type: 'circle', source: 'recent', paint: {
        'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'frp_mw'], 0], 0, 4, 10, 6, 100, 12, 500, 18],
        'circle-color': colors.getPropertyValue('--color-accent').trim(),
        'circle-stroke-color': colors.getPropertyValue('--color-background-surface').trim(),
        'circle-stroke-width': 2,
      } });
      fitArea(instance, areaRef.current);
      const terra = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: instance }),
        modes: [new TerraDrawPolygonMode({ keyEvents: { finish: 'Enter', cancel: 'Escape' } }), new TerraDrawRenderMode({ styles: {} })],
      });
      terra.on('finish', (id) => {
        const feature = terra.getSnapshotFeature(id);
        if (feature?.geometry.type !== 'Polygon') return;
        try {
          const geometry = simplifyPolygon(feature.geometry.coordinates[0]);
          terra.updateFeatureGeometry(id, geometry);
          terra.removeFeatures(terra.getSnapshot().map((item) => item.id).filter((other): other is string | number => other != null && other !== id));
          terra.setMode('render');
          onDrawRef.current(geometry);
          onDrawingChangeRef.current(false);
        } catch {
          terra.removeFeatures([id]);
        }
      });
      terra.start();
      terra.setMode(drawingRef.current ? 'polygon' : 'render');
      draw.current = terra;
    });
    const onDoubleClick = (event: MouseEvent) => {
      if (!drawingRef.current) return;
      event.preventDefault();
      instance.getCanvas().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    };
    instance.getCanvas().addEventListener('dblclick', onDoubleClick);
    return () => { draw.current?.stop(); draw.current = null; marker.current?.remove(); instance.getCanvas().removeEventListener('dblclick', onDoubleClick); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const terra = draw.current;
    if (!terra) return;
    if (drawing) terra.setMode('polygon');
    else terra.setMode('render');
  }, [drawing]);

  useEffect(() => {
    if (!map.current) return;
    marker.current?.remove();
    if (!('geometry' in area)) draw.current?.clear();
    if ('lat' in area) {
      marker.current = new maplibregl.Marker({ color: 'var(--color-accent)' })
        .setLngLat([area.lon, area.lat])
        .addTo(map.current);
    }
    fitArea(map.current, area);
  }, [area]);

  useEffect(() => {
    const source = map.current?.getSource('recent') as GeoJSONSource | undefined;
    source?.setData(recent ?? { type: 'FeatureCollection', features: [] });
  }, [recent]);

  useEffect(() => {
    if (!map.current?.getLayer('recent-circles')) return;
    const colors = getComputedStyle(document.documentElement);
    map.current.setPaintProperty('recent-circles', 'circle-color', colors.getPropertyValue('--color-accent').trim());
    map.current.setPaintProperty('recent-circles', 'circle-stroke-color', colors.getPropertyValue('--color-background-surface').trim());
  }, [theme]);

  return <VStack as="section" gap={2} aria-label="Mapa de la zona seleccionada">
    <VStack ref={container} height="55vh" minHeight="18rem" style={{ maxHeight: "32rem" }} aria-label="Mapa interactivo" />
    <Text type="supporting">{drawing ? messages[language].drawingHint : 'Haz clic en el mapa para elegir coordenadas'}</Text>
    {selectedDate && <Text type="supporting">Periodo seleccionado: {selectedDate}</Text>}
    <Text type="supporting">Mapa © OpenStreetMap · Datos de fuego: NASA FIRMS</Text>
  </VStack>;
}

function fitArea(map: Map, area: Area) {
  if ('lat' in area) map.flyTo({ center: [area.lon, area.lat], zoom: 8, essential: true });
  else {
    let bounds: number[] | undefined;
    if ('bbox' in area) bounds = area.bbox.split(',').map(Number);
    if ('geometry' in area) {
      try {
        const ring = (JSON.parse(area.geometry) as PolygonGeometry).coordinates[0];
        bounds = [Math.min(...ring.map((point) => point[0])), Math.min(...ring.map((point) => point[1])), Math.max(...ring.map((point) => point[0])), Math.max(...ring.map((point) => point[1]))];
      } catch { /* Ignore malformed geometry. */ }
    }
    if (bounds?.length === 4 && bounds.every(Number.isFinite)) map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, maxZoom: 11 });
  }
}
