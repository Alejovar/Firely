import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { VStack } from '@astryxdesign/core/VStack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { getCalendar, searchAdmin, type CalendarResponse, type AdminCandidate } from '../../api/client';
import { useApp } from '../../state/AppState';
import { apiMessage } from '../../lib/explorerLabels';
import CalendarHeatmap from '../CalendarHeatmap';
const s=stylex.create({results:{display:'flex',flexWrap:'wrap',gap:'var(--spacing-2)'}});
export default function Compare(){const app=useApp();const [q,setQ]=useState(''),[candidates,setCandidates]=useState<AdminCandidate[]>([]),[data,setData]=useState<CalendarResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);const areaKey=JSON.stringify(app.compare?.area);
 useEffect(()=>{if(q.trim().length<2){setCandidates([]);return;}const c=new AbortController();const timer=window.setTimeout(()=>searchAdmin(q,c.signal).then(r=>setCandidates(r.candidates)).catch(e=>{if(!c.signal.aborted)setError(apiMessage(e,app.lang));}),250);return()=>{clearTimeout(timer);c.abort();};},[q,app.lang]);
 useEffect(()=>{if(!app.compare){setData(null);return;}const c=new AbortController();setLoading(true);setError(null);getCalendar(app.compare.area,app.from,app.to,app.metric,app.reference,c.signal,app.burn==='all'?undefined:app.burn).then(setData).catch(e=>{if(!c.signal.aborted)setError(apiMessage(e,app.lang));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[areaKey,app.from,app.to,app.metric,app.reference,app.burn,app.lang]);
 return <VStack gap={2}><TextInput label={app.lang==='es'?'Comparar con otra área':app.lang==='pt'?'Comparar com outra área':'Compare with another area'} value={q} onChange={setQ} placeholder={app.lang==='es'?'Buscar municipio o estado':app.lang==='pt'?'Buscar município ou estado':'Search municipality or state'}/>{error&&<Banner status="error" title={error}/>}<section {...stylex.props(s.results)} aria-label="Resultados">{candidates.map(c=><Button key={`${c.level}-${c.code}`} size="sm" label={`${c.name}${c.parent?`, ${c.parent}`:''}`} onClick={()=>{app.setCompare({label:c.name,kind:'admin',area:{admin:c.code},bbox:c.bbox});setCandidates([]);setQ(c.name);}}/>)}</section>{app.compare?<CalendarHeatmap data={data} loading={loading} error={error} label={app.compare.label}/>:<EmptyState title={app.lang==='es'?'Elige otra área para comparar':app.lang==='pt'?'Escolha outra área para comparar':'Choose another area to compare'} isCompact/>}</VStack>;
}
