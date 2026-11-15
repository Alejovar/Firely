import type { CalendarRow } from '../api/client';
export interface CapDraft { headline:string; severity:'Moderate'|'Severe'; urgency:'Expected'; certainty:'Observed'; area:string; onset:string; instruction:string; social:string; status:'Exercise' }
export function capDraft(label:string,row:CalendarRow|undefined,cutoff:string):CapDraft {
 const fired=(row?.percentile??0)>=.9;
 const month=row ? new Intl.DateTimeFormat('es',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(row.year,row.month-1,1))) : 'mes actual';
 return {status:'Exercise',headline:`${fired?'Actividad de fuego elevada':'Vigilancia de actividad de fuego'} en ${label}`,severity:fired?'Severe':'Moderate',urgency:'Expected',certainty:'Observed',area:label,onset:/^\d{4}-\d{2}-\d{2}$/.test(cutoff)?`${cutoff}T00:00:00Z`:cutoff,instruction:'Consulte a Protección Civil local. Si observa humo o fuego, llame al número de emergencias de su localidad.',social:`FIRELY: ${label} registra ${row?.count_harm!=null?new Intl.NumberFormat('es-MX',{maximumFractionDigits:row.count_harm<10?1:0}).format(row.count_harm):'sin dato'} puntos de calor armonizados en ${month}. Consulte las indicaciones de Protección Civil local.`};
}
export function capXml(d:CapDraft):string {
 const esc=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
 return `<?xml version="1.0" encoding="UTF-8"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>firely-exercise-${Date.now()}</identifier><sender>firely.local</sender><sent>${esc(new Date().toISOString())}</sent><status>Exercise</status><msgType>Alert</msgType><scope>Private</scope><info><language>es-MX</language><category>Fire</category><event>Actividad de fuego satelital</event><urgency>${d.urgency}</urgency><severity>${d.severity}</severity><certainty>${d.certainty}</certainty><headline>${esc(d.headline)}</headline><onset>${esc(d.onset)}</onset><description>${esc(d.social)}</description><instruction>${esc(d.instruction)}</instruction><area><areaDesc>${esc(d.area)}</areaDesc></area></info></alert>`;
}
