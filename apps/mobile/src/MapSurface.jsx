import React, { useEffect, useRef, useState } from 'react';
import { Map, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TerraDraw, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { Stack } from '@astryxdesign/core/Stack';

setWorkerUrl(workerUrl);
const empty = () => ({ type: 'FeatureCollection', features: [] });
function outline(area) {
  if (area.query.geometry) return JSON.parse(area.query.geometry);
  if ('lat' in area.query) {
    const { lat, lon, radius_km: radius } = area.query;
    const ring = Array.from({ length: 65 }, (_, i) => {
      const angle = i / 64 * Math.PI * 2;
      return [lon + Math.cos(angle) * radius / (111.32 * Math.max(.1, Math.cos(lat * Math.PI / 180))), lat + Math.sin(angle) * radius / 111.32];
    });
    return { type: 'Polygon', coordinates: [ring] };
  }
  const [w, s, e, n] = area.bbox;
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}
function collection(area, visible) {
  return { type: 'FeatureCollection', features: visible ? [{ type: 'Feature', geometry: outline(area), properties: {} }] : [] };
}
function fit(map, area) {
  if (area.bbox) map.fitBounds([[area.bbox[0], area.bbox[1]], [area.bbox[2], area.bbox[3]]], { padding: { top: 120, bottom: Math.min(map.getContainer().clientHeight * .48, 420), left: 50, right: 50 }, maxZoom: 8, duration: 450 });
  else if ('lat' in area.query) map.flyTo({ center: [area.query.lon, area.query.lat], zoom: 7, duration: 450 });
}
function tokenColor(node, token) {
  const sample = document.createElement('i');
  sample.style.color = `var(${token})`;
  node.append(sample);
  const color = getComputedStyle(sample).color;
  sample.remove();
  return color;
}

export function MapSurface({ area, features, selected, onSelect, onArea, showArea, recenter, drawing, onDrawingChange, onError }) {
  const node = useRef(null), mapRef = useRef(null), drawRef = useRef(null);
  const values = useRef({ area, features, selected, onSelect, onArea, showArea, drawing, onDrawingChange, onError });
  values.current = { area, features, selected, onSelect, onArea, showArea, drawing, onDrawingChange, onError };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let map;
    try {
      const accent = tokenColor(node.current, '--color-accent');
      const ink = tokenColor(node.current, '--color-text-primary');
      map = new Map({
        container: node.current, center: [-102, 25], zoom: 4, minZoom: 2, maxZoom: 11,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            earth: { type: 'raster', tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'], tileSize: 256, maxzoom: 8, attribution: 'NASA GIBS · Blue Marble (histórico)' },
            area: { type: 'geojson', data: empty() },
            live: { type: 'geojson', data: empty() },
          },
          layers: [
            { id: 'earth', type: 'raster', source: 'earth', paint: { 'raster-brightness-max': .72, 'raster-saturation': -.15 } },
            { id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': accent, 'fill-opacity': .08 } },
            { id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': ink, 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': .7 } },
            { id: 'live-glow', type: 'circle', source: 'live', paint: { 'circle-color': accent, 'circle-radius': 20, 'circle-blur': 1, 'circle-opacity': .6 } },
            { id: 'live-points', type: 'circle', source: 'live', paint: { 'circle-color': accent, 'circle-radius': ['case', ['==', ['get', '_index'], -1], 9, 5], 'circle-stroke-color': ink, 'circle-stroke-width': 1.5 } },
          ],
        },
      });
      mapRef.current = map;
      // Area selection and drawing must not wait for all remote image tiles.
      map.once('style.load', () => setReady(true));
      map.on('error', event => {
        if (import.meta.env.DEV) console.warn('Firely map:', event.error?.message);
        values.current.onError('No se pudo cargar parte del mapa. El fondo satelital necesita conexión a NASA GIBS.');
      });
      map.on('click', event => {
        if (values.current.drawing) return;
        const hit = map.queryRenderedFeatures(event.point, { layers: ['live-points'] })[0];
        if (hit) { values.current.onSelect(Number(hit.properties._index)); return; }
        const lat = Number(event.lngLat.lat.toFixed(5)), lon = Number(event.lngLat.lng.toFixed(5));
        values.current.onArea({ label: `Área seleccionada · ${lat}, ${lon}`, query: { lat, lon, radius_km: 25 }, bbox: [lon - .3, lat - .25, lon + .3, lat + .25] });
      });
    } catch {
      onError('Este dispositivo no pudo iniciar el mapa interactivo. Puedes elegir un lugar desde Buscar o introducir coordenadas en Filtros.');
    }
    return () => { drawRef.current?.stop(); map?.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    map.getSource('area').setData(collection(area, showArea));
    fit(map, area);
  }, [ready, JSON.stringify(area), recenter]);
  useEffect(() => {
    if (ready) mapRef.current.getSource('area').setData(collection(area, showArea));
  }, [ready, showArea]);
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.getSource('live').setData({ type: 'FeatureCollection', features: features.map((feature, index) => ({ ...feature, properties: { ...feature.properties, _index: index } })) });
    map.setPaintProperty('live-points', 'circle-radius', ['case', ['==', ['get', '_index'], selected ?? -1], 9, 5]);
  }, [ready, features, selected]);
  useEffect(() => {
    if (!ready || !drawing) return;
    const map = mapRef.current;
    const draw = new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map }), modes: [new TerraDrawPolygonMode()] });
    drawRef.current = draw;
    draw.on('finish', () => {
      const polygon = draw.getSnapshot().find(feature => feature.geometry.type === 'Polygon');
      if (!polygon) return;
      const ring = polygon.geometry.coordinates[0];
      if (ring.length > 300) { values.current.onError('Dibuja un área con menos de 300 vértices.'); values.current.onDrawingChange(false); return; }
      const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
      values.current.onArea({ label: 'Área dibujada', query: { geometry: JSON.stringify(polygon.geometry) }, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
      values.current.onDrawingChange(false);
    });
    const cancel = event => { if (event.key === 'Escape') values.current.onDrawingChange(false); };
    window.addEventListener('keydown', cancel);
    draw.start(); draw.setMode('polygon');
    return () => { draw.stop(); drawRef.current = null; window.removeEventListener('keydown', cancel); };
  }, [ready, drawing]);
  const center = area.bbox ? [(area.bbox[0] + area.bbox[2]) / 2, (area.bbox[1] + area.bbox[3]) / 2] : [area.query.lon, area.query.lat];
  const scale = area.bbox ? Math.min(3, 440 / Math.max(1, (area.bbox[2] - area.bbox[0]) * 10)) : 3;
  return <Stack style={{ position: 'absolute', inset: 0 }}>
    <svg width="100%" height="100%" viewBox="0 0 440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      <g transform={`translate(220 260) scale(${scale}) translate(${-(center[0] + 180) * 10} ${-(90 - center[1]) * 10})`}>
        <image href="/maps/blue-marble-december-2004.jpg" width="3600" height="1800" />
      </g>
    </svg>
    <Stack ref={node} role="application" aria-label="Mapa interactivo del área y las detecciones recientes" style={{ position: 'absolute', inset: 0 }} />
  </Stack>;
}
