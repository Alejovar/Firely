import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Popover } from '@astryxdesign/core/Popover';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@astryxdesign/core/Icon';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { resolveArea, searchAdmin, ApiError, type AreaCandidate, type ResolvedIntent } from '../api/client';
import { useApp } from '../state/AppState';
import { candidateArea, dateIntentLabel, intentDates } from '../lib/searchArea';
import { DEFAULT_AREA, type AreaSel } from '../state/hash';
import { nav } from '../i18n';

const s=stylex.create({ search: { width: '100%', minWidth: 0 }, row: { width: '100%', minWidth: 0 } });
function AreaSearchField() {
  const app=useApp(); const [text,setText]=useState(''),[candidates,setCandidates]=useState<AreaCandidate[]>([]),[suggestions,setSuggestions]=useState<AreaCandidate[]>([]),[intent,setIntent]=useState<ResolvedIntent|undefined>(),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState('');
  const request=useRef<AbortController|null>(null), submitRequest=useRef<AbortController|null>(null);
  useEffect(()=>{request.current?.abort();if(text.trim().length<3){setSuggestions([]);return;}const controller=new AbortController();request.current=controller;const timer=setTimeout(()=>searchAdmin(text.trim(),controller.signal).then(result=>setSuggestions(result.candidates.map(c=>({label:`${c.name}${c.parent ? `, ${c.parent}` : ''}`,kind:c.level,country:c.country,bbox:c.bbox,code:c.code})))).catch(()=>{}),250);return()=>{clearTimeout(timer);controller.abort();};},[text]);
  useEffect(()=>()=>{request.current?.abort();submitRequest.current?.abort();},[]);
  const apply=(candidate:AreaCandidate, parsed?:ResolvedIntent)=>{const area=candidateArea(candidate);if(!area)return;const bbox='bbox' in area ? area.bbox.split(',').map(Number) as [number,number,number,number] : undefined;const sel:AreaSel={kind:'bbox',label:candidate.label,area,bbox};const dates=intentDates(parsed,app.from,app.to,new Date().toISOString().slice(0,10));app.patch({area:sel,from:dates.from<'2001-01-01'?'2001-01-01':dates.from,to:dates.to<'2001-01-01'?'2001-01-01':dates.to,selected:null});setText('');setCandidates([]);setSuggestions([]);setOpen(false);setIntent(parsed);setNotice(candidate.label);};
  const submit=()=>{if(!text.trim())return;submitRequest.current?.abort();const controller=new AbortController();submitRequest.current=controller;setLoading(true);setNotice('');resolveArea(text.trim(),app.lang,controller.signal).then(result=>{setIntent(result.intent);if(!result.candidates.length){setNotice(app.lang==='es'?'No se encontraron lugares':app.lang==='pt'?'Nenhum lugar encontrado':'No places found');return;}if(result.ambiguous||result.candidates.length>1){setCandidates(result.candidates);setOpen(true);}else apply(result.candidates[0],result.intent);}).catch(e=>{if(!controller.signal.aborted)setNotice(e instanceof ApiError?`Error ${e.status}${e.code?` · ${e.code}`:''}`:'No se pudo buscar el lugar');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});};
  const shown=candidates.length?candidates:suggestions;
  return <VStack gap={1} xstyle={s.search}><HStack gap={1} vAlign="center" wrap="wrap" xstyle={s.row}><TextInput type="search" label={nav[app.lang].search} isLabelHidden placeholder={nav[app.lang].search} value={text} onChange={v=>{setText(v);setCandidates([]);setOpen(false);}} onEnter={submit} isLoading={loading} size="sm" width="min(26rem, calc(100% - var(--spacing-10)))" /><Button label={app.lang==='es'?'Buscar':app.lang==='pt'?'Buscar':'Search'} isIconOnly icon={<Icon icon={MagnifyingGlassIcon}/>} size="sm" onClick={submit}/>{shown.length>0&&<Popover label="Lugares" isOpen={open} onOpenChange={setOpen} content={<VStack gap={1}>{shown.map((c,i)=><Button key={`${c.label}-${i}`} variant="ghost" label={`${c.label}${c.kind?` · ${c.kind}`:''}${c.country?` · ${c.country}`:''}`} onClick={()=>apply(c,intent)}/>)}</VStack>}><Button size="sm" label={`${shown.length} ${app.lang==='en'?'places':'lugares'}`} onClick={()=>setOpen(true)}/></Popover>}</HStack>
    {(intent||notice)&&<HStack gap={1} wrap="wrap" vAlign="center">{intent?.place_text&&<Token size="sm" label={intent.place_text} onRemove={()=>{app.setArea(DEFAULT_AREA);setIntent(current=>current?{...current,place_text:undefined}:undefined);}}/>} {dateIntentLabel(intent)&&<Token size="sm" label={dateIntentLabel(intent)!} onRemove={()=>{app.setRange('2001-01-01',new Date().toISOString().slice(0,10));setIntent(current=>current?{...current,date_from:null,date_to:null}:undefined);}}/>}<Text type="supporting" color="secondary" aria-live="polite">{notice}</Text></HStack>}
  </VStack>;
}
export default function AreaSearch(){return <AreaSearchField/>;}
export function AreaSearchInline(){return <AreaSearchField/>;}
