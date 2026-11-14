import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Map, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TerraDraw, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';

// Vite serves the worker as a separate asset; MapLibre 6 must be told where it is.
setWorkerUrl(workerUrl);
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { getRecent, ApiError, type RecentFeatureCollection } from '../api/client';
import { useApp } from '../state/AppState';
import type { AreaSel } from '../state/hash';
import { DEFAULT_AREA } from '../state/hash';
import { simplifyPolygon } from '../lib/drawnArea';
import { emphasisSeries } from '../lib/dataviz';
import { words } from '../lib/explorerLabels';

const s = stylex.create({
  card: { alignSelf: 'start', position: {default:'sticky','@media (max-width: 1099px)':'static'}, top: 'var(--spacing-20)', height: {default:'calc(100vh - var(--spacing-24))','@media (max-width: 1099px)':'auto'}, minHeight: {default:'36rem','@media (max-width: 1099px)':'auto'} },
  content: { height: '100%', minHeight: 0 },
  map: { width: '100%', flexGrow: {default:1,'@media (max-width: 719px)':0}, minHeight: {default:'30rem','@media (max-width: 719px)':'20rem'}, height: {default:'auto','@media (max-width: 719px)':'20rem'}, borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: 'var(--color-background-muted)' },
});
const featureCollection = (geometry: GeoJSON.Geometry | null): GeoJSON.FeatureCollection => ({type:'FeatureCollection',features:geometry ? [{type:'Feature',geometry,properties:{}}] : []});
function areaGeometry(sel: AreaSel): GeoJSON.Geometry | null {
  if ('geometry' in sel.area) { try { return JSON.parse(sel.area.geometry) as GeoJSON.Geometry; } catch { return null; } }
  if ('lat' in sel.area) {
    const {lat,lon,radius_km:radius} = sel.area; const coords: [number,number][]=[];
    for (let i=0;i<=64;i++) { const angle=2*Math.PI*i/64; coords.push([lon+(radius/111.32/Math.max(0.1,Math.cos(lat*Math.PI/180)))*Math.cos(angle),lat+(radius/111.32)*Math.sin(angle)]); }
    return {type:'Polygon',coordinates:[coords]};
  }
  const b = sel.bbox ?? ('bbox' in sel.area ? sel.area.bbox.split(',').map(Number) as [number,number,number,number] : null);
  if (!b || b.some(n=>!Number.isFinite(n))) return null;
  return {type:'Polygon',coordinates:[[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]]]};
}
function bboxOfGeometry(g: GeoJSON.Polygon): [number,number,number,number] { const points=g.coordinates.flat(); return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]; }

export default function MapPanel() {
  const app = useApp(); const t=words[app.lang];
  const node=useRef<HTMLDivElement>(null), mapRef=useRef<Map|null>(null), drawRef=useRef<TerraDraw|null>(null), drawing=useRef(false), areaRef=useRef(app.setArea);
  const [ready,setReady]=useState(false),[drawError,setDrawError]=useState<string|null>(null),[liveError,setLiveError]=useState<string|null>(null),[recent,setRecent]=useState<RecentFeatureCollection|null>(null),[liveLoading,setLiveLoading]=useState(false);
  areaRef.current=app.setArea;
  useEffect(() => {
    if (!node.current) return;
    const map=new Map({container:node.current,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]},center:[-100.55,25.45],zoom:8,attributionControl:false});
    mapRef.current=map;
    const observer=new ResizeObserver(()=>map.resize()); observer.observe(node.current);
    map.on('load',()=>{
      const token=emphasisSeries.harmonized.stroke.slice(4,-1);
      const accent=getComputedStyle(node.current!).getPropertyValue(token).trim() || getComputedStyle(node.current!).getPropertyValue('--color-accent').trim();
      map.addSource('firely-area',{type:'geojson',data:featureCollection(null)});
      map.addLayer({id:'firely-fill',type:'fill',source:'firely-area',paint:{'fill-color':accent,'fill-opacity':0.14}});
      map.addLayer({id:'firely-border',type:'line',source:'firely-area',paint:{'line-color':accent,'line-width':2}});
      map.addSource('firely-live',{type:'geojson',data:featureCollection(null)});
      map.addLayer({id:'firely-live-points',type:'circle',source:'firely-live',paint:{'circle-color':accent,'circle-opacity':0.75,'circle-radius':['interpolate',['linear'],['coalesce',['get','frp_mw'],0],0,3,100,12]}});
      setReady(true);
    });
    map.on('click',e=>{if(drawing.current)return;areaRef.current({kind:'point',label:`${e.lngLat.lat.toFixed(3)}, ${e.lngLat.lng.toFixed(3)} · 20 km`,area:{lat:e.lngLat.lat,lon:e.lngLat.lng,radius_km:20}});});
    return ()=>{observer.disconnect();drawRef.current?.stop();drawRef.current=null;map.remove();mapRef.current=null;setReady(false);};
  },[]);
  const areaKey=JSON.stringify(app.area);
  useEffect(()=>{const map=mapRef.current;if(!ready||!map)return;(map.getSource('firely-area') as GeoJSONSource).setData(featureCollection(areaGeometry(app.area)));let b=app.area.bbox; if(!b&&'lat' in app.area.area){const {lat,lon,radius_km:r}=app.area.area;b=[lon-r/100,lat-r/111,lon+r/100,lat+r/111];} if(b) map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:28,maxZoom:11,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:350});},[areaKey,ready]);
  useEffect(()=>{const map=mapRef.current;if(!ready||!map)return;(map.getSource('firely-live') as GeoJSONSource).setData(recent ?? featureCollection(null));},[recent,ready]);
  useEffect(()=>{const controller=new AbortController();setRecent(null);setLiveError(null);if(!app.live)return;setLiveLoading(true);getRecent(app.area.area,app.live,controller.signal).then(setRecent).catch(e=>{if(!controller.signal.aborted)setLiveError(e instanceof ApiError&&e.status===503&&e.code==='firms_map_key_missing'?'La capa en vivo necesita una llave de FIRMS en el servidor':`${t.map}: ${e instanceof ApiError ? `${e.status} ${e.code ?? ''}` : 'error'}`);}).finally(()=>{if(!controller.signal.aborted)setLiveLoading(false);});return()=>controller.abort();},[areaKey,app.live,app.lang]);
  const beginDraw=()=>{const map=mapRef.current;if(!map)return;setDrawError(null);drawing.current=true;drawRef.current?.stop();const draw=new TerraDraw({adapter:new TerraDrawMapLibreGLAdapter({map}),modes:[new TerraDrawPolygonMode()]});drawRef.current=draw;draw.on('finish',()=>{const feature=draw.getSnapshot().find(f=>f.geometry.type==='Polygon');if(!feature)return;try{const geometry=simplifyPolygon((feature.geometry as GeoJSON.Polygon).coordinates[0]);const bbox=bboxOfGeometry(geometry);areaRef.current({kind:'drawn',label:'Área dibujada',area:{geometry:JSON.stringify(geometry)},bbox});}catch(e){setDrawError(e instanceof Error?e.message:String(e));}draw.stop();drawRef.current=null;drawing.current=false;});draw.start();draw.setMode('polygon');};
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drawing.current){drawRef.current?.stop();drawRef.current=null;drawing.current=false;}};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);},[]);
  const newest=recent?.features.map(f=>f.properties.ts_utc).filter((v):v is string=>!!v).sort().at(-1);
  return <Card xstyle={s.card}><VStack gap={3} xstyle={s.content}><Heading level={2}>{t.map}</Heading><HStack gap={2} wrap="wrap" vAlign="center"><Button size="sm" label="Dibujar área" onClick={beginDraw}/><Button size="sm" label="Borrar área" variant="ghost" onClick={()=>app.setArea(DEFAULT_AREA)}/><SegmentedControl label="En vivo" size="sm" value={String(app.live)} onChange={v=>app.setLive(Number(v) as 0|24|48)}><SegmentedControlItem value="0" label="Apagado"/><SegmentedControlItem value="24" label="24 h"/><SegmentedControlItem value="48" label="48 h"/></SegmentedControl></HStack>
    {drawError&&<Banner status="error" title={drawError}/>} {liveError&&<Banner status="warning" title={liveError}/>}<div ref={node} {...stylex.props(s.map)} role="application" aria-label="Mapa de área y detecciones recientes"/><Text type="supporting" color="secondary">© OpenStreetMap contributors · Datos de fuego: NASA FIRMS</Text>{app.live>0&&(liveLoading?<Skeleton width="100%" height="var(--spacing-6)"/>:recent?.features.length?<Text type="supporting" color="secondary">{recent.features.length} detecciones · {newest ?? '—'}</Text>:!liveError?<EmptyState title="Sin detecciones recientes" isCompact/>:null)}</VStack></Card>;
}
