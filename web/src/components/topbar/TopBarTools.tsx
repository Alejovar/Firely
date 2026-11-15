import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Popover } from '@astryxdesign/core/Popover';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import AreaSearch from '../AreaSearch';
import { searchAdmin, ApiError, type AdminCandidate } from '../../api/client';
import { useApp } from '../../state/AppState';
import { loadSubscriptions } from '../../lib/alerts';
import { requestMapDraw } from '../../lib/mapBus';
const s = stylex.create({ row: { width: '100%', minWidth: 0, flexWrap: { default: 'nowrap', '@media (max-width: 959px)': 'wrap' } }, search: { flexGrow: 1, minWidth: 'min(100%, 14rem)' }, tools: { display: { default: 'flex', '@media (max-width: 959px)': 'none' } }, compact: { display: { default: 'none', '@media (max-width: 959px)': 'flex' } }, menu: { maxHeight: '60vh', overflowY: 'auto' } });
const strings = {
  es: { draw: 'Dibujar área', point: 'Lat / Lon + radio', admin: 'Municipio', alerts: 'Alertas', tools: 'Herramientas', apply: 'Aplicar', find: 'Buscar municipio', lat: 'Latitud', lon: 'Longitud', radius: 'Radio (km)' },
  en: { draw: 'Draw area', point: 'Lat / Lon + radius', admin: 'Municipality', alerts: 'Alerts', tools: 'Tools', apply: 'Apply', find: 'Find municipality', lat: 'Latitude', lon: 'Longitude', radius: 'Radius (km)' },
  pt: { draw: 'Desenhar área', point: 'Lat / Lon + raio', admin: 'Município', alerts: 'Alertas', tools: 'Ferramentas', apply: 'Aplicar', find: 'Buscar município', lat: 'Latitude', lon: 'Longitude', radius: 'Raio (km)' },
};
function PointTool() {
  const app = useApp(), t = strings[app.lang];
  const [lat, setLat] = useState(25.4), [lon, setLon] = useState(-100.5), [radius, setRadius] = useState(20), [open, setOpen] = useState(false);
  return <Popover label={t.point} isOpen={open} onOpenChange={setOpen} content={<VStack gap={2}><NumberInput label={t.lat} value={lat} min={-90} max={90} onChange={setLat} /><NumberInput label={t.lon} value={lon} min={-180} max={180} onChange={setLon} /><NumberInput label={t.radius} value={radius} min={1} max={500} onChange={setRadius} /><Button label={t.apply} onClick={() => { if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && radius > 0) { app.setArea({ kind: 'point', label: `${lat.toFixed(3)}, ${lon.toFixed(3)} · ${radius} km`, area: { lat, lon, radius_km: radius } }); setOpen(false); } }} /></VStack>}><Button size="sm" label={t.point} /></Popover>;
}
function AdminTool() {
  const app = useApp(), t = strings[app.lang];
  const [query, setQuery] = useState(''), [items, setItems] = useState<AdminCandidate[]>([]), [error, setError] = useState(''), [open, setOpen] = useState(false);
  useEffect(() => { if (query.trim().length < 2) { setItems([]); return; } const controller = new AbortController(); const timer = setTimeout(() => searchAdmin(query, controller.signal).then(r => setItems(r.candidates)).catch(e => { if (!controller.signal.aborted) setError(e instanceof ApiError ? `API ${e.status}` : String(e)); }), 250); return () => { clearTimeout(timer); controller.abort(); }; }, [query]);
  return <Popover label={t.admin} isOpen={open} onOpenChange={setOpen} content={<VStack gap={2} xstyle={s.menu}><TextInput label={t.find} value={query} onChange={setQuery} />{error && <Banner status="error" title={error} />}{items.map(item => <Button key={`${item.country}-${item.code}`} variant="ghost" label={`${item.name}${item.parent ? `, ${item.parent}` : ''}`} onClick={() => { app.setArea({ kind: 'admin', label: item.name, area: { admin: item.code }, bbox: item.bbox }); setOpen(false); }} />)}</VStack>}><Button size="sm" label={t.admin} /></Popover>;
}
export default function TopBarTools() {
  const app = useApp(), t = strings[app.lang];
  const [count, setCount] = useState(() => loadSubscriptions().length);
  useEffect(() => { const refresh = () => setCount(loadSubscriptions().length); window.addEventListener('storage', refresh); window.addEventListener('focus', refresh); return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); }; }, []);
  const buttons = <><Button size="sm" label={t.draw} onClick={requestMapDraw} /><PointTool /><AdminTool /><Button size="sm" label={t.alerts} onClick={() => app.navigate('plataforma')} />{count > 0 && <Badge label={String(count)} variant="neutral" />}</>;
  return <HStack gap={1} vAlign="center" xstyle={s.row}><VStack xstyle={s.search}><AreaSearch /></VStack><HStack gap={1} vAlign="center" xstyle={s.tools}>{buttons}</HStack><HStack xstyle={s.compact}><Popover label={t.tools} content={<VStack gap={2}>{buttons}</VStack>}><Button size="sm" label={t.tools} /></Popover></HStack></HStack>;
}
