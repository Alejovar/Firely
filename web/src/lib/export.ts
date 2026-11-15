import type { CalendarResponse, HotspotsGeoJson } from '../api/client';
import { divergingSteps, encodeCell, FRP_CLASSES, sequentialSteps } from './dataviz';
import { yearPhase } from './explorerLabels';
export function provenance(data:{attribution?:string;methodology_version?:string;data_cutoff?:string}){return `${data.attribution||'NASA FIRMS'} · methodology_version=${data.methodology_version||'unknown'} · data_cutoff=${data.data_cutoff||'unknown'}`;}
const csv=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
export function calendarCsv(data:CalendarResponse){const columns=['year','month','count_harm','count_harm_lo','count_harm_hi','frp_harm','anomaly_ratio','percentile','return_period_years','clear_frac','is_estimated','enso_phase'] as const;return `# ${provenance(data)}\n${columns.join(',')}\n${data.rows.map(row=>columns.map(k=>csv(row[k])).join(',')).join('\n')}\n`;}
export function geoJsonFile(data:HotspotsGeoJson){return JSON.stringify({...data,attribution:data.attribution||'NASA FIRMS',methodology_version:data.methodology_version,data_cutoff:data.data_cutoff},null,2);}
const xml=(s:unknown)=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
export function kmlColor(css:string){const match=css.match(/\d+(?:\.\d+)?/g);if(!match||match.length<3)return 'ffffffff';const [r,g,b]=match.slice(0,3).map(v=>Math.max(0,Math.min(255,Math.round(Number(v)))).toString(16).padStart(2,'0'));return `ff${b}${g}${r}`;}
const PLATFORM: Record<string,{name:string;pixel:string}> = {
  Terra:{name:'MODIS a bordo de Terra (NASA)',pixel:'1 km'}, Aqua:{name:'MODIS a bordo de Aqua (NASA)',pixel:'1 km'},
  SNPP:{name:'VIIRS a bordo de Suomi NPP (NASA/NOAA)',pixel:'375 m'}, NOAA20:{name:'VIIRS a bordo de NOAA-20',pixel:'375 m'}, NOAA21:{name:'VIIRS a bordo de NOAA-21',pixel:'375 m'},
};
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const longDate=(iso:string)=>{const [y,m,d]=iso.slice(0,10).split('-').map(Number);return `${d} de ${MONTHS[m-1]} de ${y}`;};
const frpClass=(frp:number|null)=>FRP_CLASSES.find(c=>(frp??0)>=c.min&&(frp??0)<c.max)??FRP_CLASSES[0];
const hexKml=(hex:string)=>{const h=hex.replace('#','');return `ff${h.slice(4,6)}${h.slice(2,4)}${h.slice(0,2)}`;};
/** Google Earth / GIS file of individual detections: one folder per day, one styled point per detection,
 *  and a plain-language card per point saying what it is. */
export function hotspotsKml(data:HotspotsGeoJson, _colors?:{low:string;high:string}, meta:{label?:string;from?:string;to?:string}={}){
  const area=meta.label?`, ${meta.label}`:'';
  const period=meta.from&&meta.to?` (${meta.from} a ${meta.to})`:'';
  const intro=`<p><b>Qué contiene.</b> Cada punto es una detección de calor de un satélite: un píxel (375 m en VIIRS, 1 km en MODIS) donde el sensor midió una temperatura anómala al pasar. No es el contorno de un incendio: un mismo incendio produce muchos puntos, y varios satélites pueden ver el mismo fuego el mismo día.</p>
<p><b>Color.</b> Potencia radiativa del fuego (FRP): gris = baja (&lt; 15 MW), ocre = media (15 a 40 MW), amarillo = alta (40 MW o más). A más FRP, más energía liberada en ese momento.</p>
<p><b>Organización.</b> Una carpeta por día. Usa la barra de tiempo de Google Earth para recorrer los días.</p>
<p><b>Nota.</b> Son detecciones individuales de NASA FIRMS con confianza nominal o alta. Las cifras del calendario de Firely son la serie armonizada, que corrige las diferencias entre MODIS y VIIRS; por eso no coinciden con el número de puntos de este archivo.${data.truncated?` Este archivo trae los ${data.features.length} puntos de mayor FRP de ${data.n_total}; acota el periodo para tenerlos todos.`:''}</p>
<p>${xml(provenance(data))}</p>`;
  const styles=FRP_CLASSES.map(c=>`<Style id="frp-${c.id}"><IconStyle><color>${hexKml(c.color)}</color><scale>${c.id==='alto'?1:c.id==='medio'?0.8:0.6}</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>`).join('');
  const byDay=new Map<string,HotspotsGeoJson['features']>();
  for(const f of data.features){const d=f.properties.date.slice(0,10);if(!byDay.has(d))byDay.set(d,[]);byDay.get(d)!.push(f);}
  const folders=[...byDay.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([day,list])=>{
    const marks=list.map(f=>{const p=f.properties,[lon,lat]=f.geometry.coordinates,cls=frpClass(p.frp_mw),sat=PLATFORM[p.platform]??{name:`${p.sensor} ${p.platform}`,pixel:p.sensor==='MODIS'?'1 km':'375 m'};
      const frp=p.frp_mw==null?'sin dato':`${p.frp_mw.toLocaleString('es-MX',{maximumFractionDigits:1})} MW (${cls.label})`;
      const card=`<table>
<tr><td><b>Qué es</b></td><td>Detección de calor por satélite (posible fuego activo)</td></tr>
<tr><td><b>Fecha</b></td><td>${longDate(p.date)}</td></tr>
<tr><td><b>Paso del satélite</b></td><td>${p.daynight==='N'?'De noche':'De día'}</td></tr>
<tr><td><b>Satélite</b></td><td>${xml(sat.name)}</td></tr>
<tr><td><b>Tamaño del píxel</b></td><td>${sat.pixel}</td></tr>
<tr><td><b>Potencia del fuego (FRP)</b></td><td>${frp}</td></tr>
<tr><td><b>Confianza</b></td><td>${p.confidence_h==='alta'?'Alta':'Nominal'}</td></tr>
<tr><td><b>Coordenadas</b></td><td>${lat.toFixed(4)}, ${lon.toFixed(4)}</td></tr>
</table><p>Fuente: NASA FIRMS. Firely ${xml(data.methodology_version)}.</p>`;
      return `<Placemark><name>${xml(`${p.sensor} ${p.platform}, ${frp}`)}</name><Snippet maxLines="1">${xml(`${longDate(p.date)}, ${p.daynight==='N'?'noche':'día'}`)}</Snippet><description><![CDATA[${card}]]></description><styleUrl>#frp-${cls.id}</styleUrl><TimeStamp><when>${xml(p.date.slice(0,10))}</when></TimeStamp><ExtendedData><Data name="fecha"><value>${xml(p.date)}</value></Data><Data name="sensor"><value>${xml(p.sensor)}</value></Data><Data name="satelite"><value>${xml(p.platform)}</value></Data><Data name="frp_mw"><value>${p.frp_mw??''}</value></Data><Data name="confianza"><value>${xml(p.confidence_h)}</value></Data><Data name="dia_noche"><value>${xml(p.daynight)}</value></Data></ExtendedData><Point><coordinates>${lon},${lat},0</coordinates></Point></Placemark>`;}).join('');
    return `<Folder><name>${xml(`${longDate(day)}: ${list.length} ${list.length===1?'punto':'puntos'}`)}</name><open>0</open>${marks}</Folder>`;}).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(`Firely: detecciones de calor${area}${period}`)}</name><open>1</open><description><![CDATA[${intro}]]></description>${styles}${folders}</Document></kml>`;
}
export function calendarSvg(data:CalendarResponse,title:string,metric:'count'|'frp',mode:'count'|'anomaly',scheme:'dark'|'light',palette:(cssVar:string)=>string){
 const years=[...new Set(data.rows.map(r=>r.year))].sort((a,b)=>b-a);
 const lookup=new Map(data.rows.map(r=>[`${r.year}-${r.month}`,r]));
 const max=Math.max(1,...data.rows.map(r=>metric==='frp'?r.frp_harm??0:r.count_harm??0));
 const width=760,height=112+years.length*22;
 const ink=palette('var(--color-text-primary)'),sub=palette('var(--color-text-secondary)'),background=palette('var(--color-background-card)');
 const ramp=mode==='count'?sequentialSteps(scheme):divergingSteps();
 const cells=years.flatMap((year,i)=>Array.from({length:12},(_,j)=>{const row=lookup.get(`${year}-${j+1}`);const enc=encodeCell(row,mode,metric,max,scheme);const x=56+j*53,y=65+i*22;return `<rect x="${x}" y="${y}" width="48" height="17" rx="2" fill="${xml(palette(enc.background))}"/>${row?.clear_frac!=null&&row.clear_frac<.5?`<rect x="${x}" y="${y}" width="48" height="17" rx="2" fill="url(#cloud)"/>`:''}`;})).join('');
 const yearLabels=years.map((year,i)=>{const rows=data.rows.filter(r=>r.year===year),phase=yearPhase(data.rows,year);return `<text x="10" y="${78+i*22}" fill="${xml(sub)}" font-family="sans-serif" font-size="11">${year}${rows.some(r=>r.is_estimated)?' ≈':''}</text>${phase?`<text x="697" y="${78+i*22}" fill="${xml(palette(divergingSteps()[phase==='nina'?1:5]))}" font-family="sans-serif" font-size="10">${phase==='nina'?'Niña':'Niño'}</text>`:''}`;}).join('');
 const legendY=74+years.length*22;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><pattern id="cloud" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" fill="${xml(palette('var(--color-border-emphasized)'))}"/></pattern></defs><rect width="100%" height="100%" fill="${xml(background)}"/><text x="16" y="25" fill="${xml(ink)}" font-family="sans-serif" font-size="16">${xml(title)}</text><text x="56" y="53" fill="${xml(sub)}" font-family="sans-serif" font-size="11">E       F       M       A       M       J       J       A       S       O       N       D</text><text x="700" y="53" fill="${xml(sub)}" font-family="sans-serif" font-size="11">ONI</text>${cells}${yearLabels}<text x="16" y="${legendY}" fill="${xml(sub)}" font-family="sans-serif" font-size="10">0</text>${ramp.map((color,i)=>`<rect x="${42+i*18}" y="${legendY-9}" width="15" height="9" fill="${xml(palette(color))}"/>`).join('')}<text x="${50+ramp.length*18}" y="${legendY}" fill="${xml(sub)}" font-family="sans-serif" font-size="10">${Math.round(max)} ${xml(metric)} · ≈ MODIS · Nubes · Niña / Niño</text><text x="16" y="${height-8}" fill="${xml(sub)}" font-family="sans-serif" font-size="10">${xml(provenance(data))}</text></svg>`;
}
export async function saveFile(name:string,content:BlobPart,type:string){
  const blob = new Blob([content], { type });
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { shareNativeFile } = await import('../mobile/shareFile');
    await shareNativeFile(name, blob);
    return;
  }
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function svgPng(svg:string){const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth*2;canvas.height=img.naturalHeight*2;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.scale(2,2);ctx.drawImage(img,0,0);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG unavailable')),'image/png'));}finally{URL.revokeObjectURL(url);}}
