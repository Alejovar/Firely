import { useEffect, useState } from 'react';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { Card } from '@astryxdesign/core/Card';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Table } from '@astryxdesign/core/Table';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getDaily, getReturnPeriod, type CalendarResponse, type DailyRow, type ReturnPeriodResponse } from '../api/client';
import { useApp } from '../state/AppState';
import { monthNames } from '../i18n';
import { chartInk, emphasisSeries } from '../lib/dataviz';
import { apiMessage, fmt, words } from '../lib/explorerLabels';

interface ObservedDailyRow extends DailyRow { count_raw?: number | null }
interface DayTableRow extends Record<string, unknown> { id: string; day: number; count: string; frp?: string }
export default function DailyDrawer({ calendar }: { calendar: CalendarResponse | null }) {
  const app=useApp(); const selected=app.selected; const [last,setLast]=useState(selected); const shown=selected ?? last;
  const [days,setDays]=useState<ObservedDailyRow[]>([]),[rp,setRp]=useState<ReturnPeriodResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
  const areaKey=JSON.stringify(app.area.area);
  useEffect(()=>{if(selected)setLast(selected);},[selected]);
  useEffect(()=>{if(!selected)return;const controller=new AbortController();setDays([]);setRp(null);setError(null);setLoading(true);Promise.all([getDaily(app.area.area,selected.year,selected.month,controller.signal),getReturnPeriod(app.area.area,selected.year,selected.month,controller.signal)]).then(([daily,period])=>{setDays(Array.isArray(daily)?daily:daily.rows??daily.days??[]);setRp(period);}).catch(e=>{if(!controller.signal.aborted)setError(apiMessage(e,app.lang));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[areaKey,selected?.year,selected?.month,app.lang]);
  const title=shown?`${monthNames[app.lang][shown.month-1]} ${shown.year}`:'';
  const row=calendar?.rows.find(r=>r.year===shown?.year&&r.month===shown?.month);
  const dayCount=shown?new Date(shown.year,shown.month,0).getDate():0;
  const byDay=new Map(days.map((r,i)=>[r.day??(r.date?Number(r.date.slice(-2)):i+1),r]));
  const completeDays=Array.from({length:dayCount},(_,i)=>({day:i+1,count:byDay.get(i+1)?.count_raw??0,frp:byDay.get(i+1)?.frp_harm??null}));
  const hasFrp=days.some(r=>r.frp_harm!=null);
  const table:DayTableRow[]=completeDays.map(r=>({id:String(r.day),day:r.day,count:fmt(r.count,app.lang),...(hasFrp?{frp:fmt(r.frp,app.lang,1)}:{})}));
  return <Drawer isOpen={!!selected} onOpenChange={open=>{if(!open)app.setSelected(null);}} label={title||'Detalle diario'} width="min(36rem, 100%)"><Layout height="fill" header={<DrawerHeader title={title} onOpenChange={open=>{if(!open)app.setSelected(null);}} />} content={<LayoutContent padding={6}><VStack gap={4}>
    {loading?<Skeleton width="100%" height="16rem"/>:error?<Banner status="error" title={error}/>:days.length===0?<EmptyState title={app.lang==='es'?'El detalle diario no está disponible para este mes':app.lang==='pt'?'O detalhe diário não está disponível para este mês':'Daily detail is unavailable for this month'}/>:<><Banner status="info" title={app.lang==='es'?'El desglose diario muestra detecciones observadas por el satélite sin armonizar; la armonización es mensual.':app.lang==='pt'?'O detalhamento diário mostra detecções observadas pelo satélite sem harmonização; a harmonização é mensal.':'Daily detail shows observed satellite detections without harmonization; harmonization is monthly.'}/><Card><VStack gap={3}><Heading level={3}>{app.lang==='es'?'Detecciones observadas por día':app.lang==='pt'?'Detecções observadas por dia':'Observed detections per day'}</Heading><ResponsiveContainer width="100%" height={190}><BarChart data={completeDays}><CartesianGrid vertical={false} stroke={chartInk.grid}/><XAxis dataKey="day" tick={chartInk.tick}/><YAxis tick={chartInk.tick}/><Tooltip/><Bar dataKey="count" fill={emphasisSeries.harmonized.stroke} isAnimationActive={false}/></BarChart></ResponsiveContainer><Collapsible trigger={app.lang==='es'?'Ver datos del gráfico':app.lang==='pt'?'Ver dados do gráfico':'View chart data'} defaultIsOpen={false}><Table data={table} idKey="id" density="compact" columns={[{key:'day',header:app.lang==='en'?'Day':app.lang==='pt'?'Dia':'Día'},{key:'count',header:app.lang==='en'?'Detections':app.lang==='pt'?'Detecções':'Detecciones'},...(hasFrp?[{key:'frp',header:'FRP'}]:[])]}/></Collapsible></VStack></Card></>}
    <Card><VStack gap={2}><Heading level={3}>Resumen del mes</Heading><Text>{fmt(row?.count_harm,app.lang)} {words[app.lang].count} · {fmt(row?.anomaly_ratio,app.lang,1)}× {words[app.lang][app.reference]}</Text><Text>{rp?.return_period_years == null?'—':`Una vez cada ${fmt(rp.return_period_years,app.lang)} años`} · Percentil {rp?.percentile == null ? '—' : Math.round(rp.percentile * 100)}</Text><Text type="supporting" color="secondary">{rp?.attribution||calendar?.attribution||'NASA FIRMS'} · {rp?.methodology_version||calendar?.methodology_version} · {rp?.data_cutoff||calendar?.data_cutoff}</Text></VStack></Card>
  </VStack></LayoutContent>} /></Drawer>;
}
