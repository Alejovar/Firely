import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Popover } from '@astryxdesign/core/Popover';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Banner } from '@astryxdesign/core/Banner';
import AreaSearch from '../AreaSearch';
import { searchAdmin, ApiError, type AdminCandidate } from '../../api/client';
import { useApp } from '../../state/AppState';
import { requestMapDraw } from '../../lib/mapBus';
import { Box, OutlineButton } from '../../ui/kit';

const s = stylex.create({
  row: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', minWidth: 0 },
  tools: { display: { default: 'flex', '@media (max-width: 1100px)': 'none' }, gap: '8px', flexShrink: 0 },
  compact: { display: { default: 'none', '@media (max-width: 1100px)': 'flex' }, flexShrink: 0 },
  menu: { maxHeight: '60vh', overflowY: 'auto', minWidth: '16rem' },
});
const strings = {
  es: { draw: 'Dibujar área', point: 'Lat / Lon + radio', admin: 'Municipio', tools: 'Área', apply: 'Aplicar', find: 'Buscar municipio', lat: 'Latitud', lon: 'Longitud', radius: 'Radio (km)' },
  en: { draw: 'Draw area', point: 'Lat / Lon + radius', admin: 'Municipality', tools: 'Area', apply: 'Apply', find: 'Find municipality', lat: 'Latitude', lon: 'Longitude', radius: 'Radius (km)' },
  pt: { draw: 'Desenhar área', point: 'Lat / Lon + raio', admin: 'Município', tools: 'Área', apply: 'Aplicar', find: 'Buscar município', lat: 'Latitude', lon: 'Longitude', radius: 'Raio (km)' },
};
function PointTool({ size }: { size: 'lg' | 'md' }) {
  const app = useApp(), t = strings[app.lang];
  const [lat, setLat] = useState(25.4), [lon, setLon] = useState(-100.5), [radius, setRadius] = useState(20), [open, setOpen] = useState(false);
  return <Popover label={t.point} isOpen={open} onOpenChange={setOpen} content={<VStack gap={2}><NumberInput label={t.lat} value={lat} min={-90} max={90} onChange={setLat} /><NumberInput label={t.lon} value={lon} min={-180} max={180} onChange={setLon} /><NumberInput label={t.radius} value={radius} min={1} max={500} onChange={setRadius} /><Button label={t.apply} variant="primary" onClick={() => { if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && radius > 0) { app.setArea({ kind: 'point', label: `${lat.toFixed(3)}, ${lon.toFixed(3)} · ${radius} km`, area: { lat, lon, radius_km: radius } }); setOpen(false); } }} /></VStack>}><OutlineButton size={size}>{t.point}</OutlineButton></Popover>;
}
function AdminTool({ size }: { size: 'lg' | 'md' }) {
  const app = useApp(), t = strings[app.lang];
  const [query, setQuery] = useState(''), [items, setItems] = useState<AdminCandidate[]>([]), [error, setError] = useState(''), [open, setOpen] = useState(false);
  useEffect(() => { if (query.trim().length < 2) { setItems([]); return; } const controller = new AbortController(); const timer = setTimeout(() => searchAdmin(query, controller.signal).then(r => setItems(r.candidates)).catch(e => { if (!controller.signal.aborted) setError(e instanceof ApiError ? `API ${e.status}` : String(e)); }), 250); return () => { clearTimeout(timer); controller.abort(); }; }, [query]);
  return <Popover label={t.admin} isOpen={open} onOpenChange={setOpen} content={<VStack gap={2} xstyle={s.menu}><TextInput label={t.find} value={query} onChange={setQuery} />{error && <Banner status="error" title={error} />}{items.map(item => <Button key={`${item.country}-${item.code}`} variant="ghost" label={`${item.name}${item.parent ? `, ${item.parent}` : ''}`} onClick={() => { app.setArea({ kind: 'admin', label: item.name, area: { admin: item.code }, bbox: item.bbox }); setOpen(false); }} />)}</VStack>}><OutlineButton size={size}>{t.admin}</OutlineButton></Popover>;
}
export default function TopBarTools() {
  const app = useApp(), t = strings[app.lang];
  return <Box xs={s.row}>
    <AreaSearch />
    <Box xs={s.tools}><OutlineButton size="lg" onClick={requestMapDraw}>{t.draw}</OutlineButton><PointTool size="lg" /><AdminTool size="lg" /></Box>
    <Box xs={s.compact}><Popover label={t.tools} content={<VStack gap={2}><OutlineButton onClick={requestMapDraw}>{t.draw}</OutlineButton><PointTool size="md" /><AdminTool size="md" /></VStack>}><OutlineButton size="lg">{t.tools} ▾</OutlineButton></Popover></Box>
  </Box>;
}
