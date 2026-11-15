import type { CalendarRow, CalendarResponse, EventsResponse, SeasonResponse, ContextResponse, HotspotsGeoJson } from '../api/client';
import { monthNames, type Lang } from '../i18n';

export interface StorySlide { title: string; detail: string; year?: number; month?: number }
const fmt = (n: number, lang: Lang) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n);
export function storySlides(calendar: CalendarResponse, events: EventsResponse, season: SeasonResponse, context: ContextResponse, lang: Lang): StorySlide[] {
  const rows = calendar.rows.filter(r => r.count_harm != null);
  const years = [...new Set(rows.map(r => r.year))].sort((a,b)=>a-b);
  const fullYears = years.filter(y => rows.filter(r=>r.year===y).length===12);
  const annual = fullYears.map(y=>({year:y,total:rows.filter(r=>r.year===y).reduce((s,r)=>s+(r.count_harm??0),0)})).sort((a,b)=>a.total-b.total);
  const medYear = annual[Math.floor(annual.length/2)]?.year;
  const medianPeak = rows.filter(r=>r.year===medYear).sort((a,b)=>(b.count_harm??0)-(a.count_harm??0))[0];
  const max = [...rows].sort((a,b)=>(b.count_harm??0)-(a.count_harm??0))[0];
  const largest = [...events.rows].sort((a,b)=>b.n_hotspots_harm-a.n_hotspots_harm)[0];
  const contextRow = [...context.rows].reverse().find(r=>r.enso_phase);
  const months = monthNames[lang];
  const tr = (es: string, en: string, pt: string) => ({ es, en, pt })[lang];
  return [
    { title: medianPeak ? tr(`${months[medianPeak.month-1]} fue el mes de mayor actividad del año mediano (${medYear}).`, `${months[medianPeak.month-1]} was the busiest month of the median year (${medYear}).`, `${months[medianPeak.month-1]} foi o mês mais ativo do ano mediano (${medYear}).`) : tr('Aún no hay un año completo para comparar.','No complete year is available for comparison.','Ainda não há um ano completo para comparar.'), detail: medianPeak && annual.length ? tr(`${fmt(100*(medianPeak.count_harm??0)/(annual.find(a=>a.year===medYear)?.total||1),lang)}% de los puntos armonizados de ese año.`,`${fmt(100*(medianPeak.count_harm??0)/(annual.find(a=>a.year===medYear)?.total||1),lang)}% of that year's harmonized hotspots.`,`${fmt(100*(medianPeak.count_harm??0)/(annual.find(a=>a.year===medYear)?.total||1),lang)}% dos pontos harmonizados desse ano.`) : tr('Se necesitan doce meses completos.','Twelve complete months are needed.','São necessários doze meses completos.'), year:medYear, month:medianPeak?.month },
    { title: max ? tr(`El mes más activo fue ${months[max.month-1]} de ${max.year}.`,`The busiest month was ${months[max.month-1]} ${max.year}.`,`O mês mais ativo foi ${months[max.month-1]} de ${max.year}.`) : tr('No hay meses con datos.','No months have data.','Nenhum mês tem dados.'), detail: max ? `${fmt(max.count_harm??0,lang)} ${tr('puntos de calor armonizados','harmonized hotspots','pontos de calor harmonizados')}${max.anomaly_ratio != null ? ` · ${fmt(max.anomaly_ratio,lang)}× ${tr('la referencia','the reference','a referência')}` : ''}.` : tr('Sin datos.','No data.','Sem dados.'), year:max?.year, month:max?.month },
    { title: largest ? tr(`El evento de mayor tamaño detectado comenzó el ${largest.start_date}.`,`The largest detected event began on ${largest.start_date}.`,`O maior evento detectado começou em ${largest.start_date}.`) : tr('No se identificaron eventos en este periodo.','No events were identified in this period.','Nenhum evento foi identificado neste período.'), detail: largest ? tr(`${fmt(largest.n_hotspots_harm,lang)} puntos agrupados durante ${largest.duration_days} días. El área aproximada no equivale a área quemada.`,`${fmt(largest.n_hotspots_harm,lang)} grouped hotspots over ${largest.duration_days} days. Approximate area is not burned area.`,`${fmt(largest.n_hotspots_harm,lang)} pontos agrupados durante ${largest.duration_days} dias. A área aproximada não é área queimada.`) : tr('El agrupamiento requiere puntos suficientes.','Grouping requires enough hotspots.','O agrupamento requer pontos suficientes.'), year:largest ? Number(largest.start_date.slice(0,4)) : undefined, month:largest ? Number(largest.start_date.slice(5,7)) : undefined },
    { title: season.summary_es || tr('No hay una conclusión de tendencia disponible.','No trend conclusion is available.','Não há conclusão de tendência disponível.'), detail: tr(`Tendencia basada en años observados: ${season.trend_observed_only.peak.n} temporadas para el pico.`,`Observed-only trend: ${season.trend_observed_only.peak.n} peak seasons. The API summary above is supplied in Spanish.`,`Tendência apenas dos anos observados: ${season.trend_observed_only.peak.n} temporadas de pico. O resumo da API acima está em espanhol.`), year:season.rows.at(-1)?.year, month:season.rows.at(-1)?.peak ? Number(season.rows.at(-1)!.peak.slice(5,7)) : undefined },
    { title: contextRow ? tr(`${months[contextRow.month-1]} de ${contextRow.year}: fase ENSO ${contextRow.enso_phase}.`,`${months[contextRow.month-1]} ${contextRow.year}: ENSO phase ${contextRow.enso_phase}.`,`${months[contextRow.month-1]} de ${contextRow.year}: fase ENSO ${contextRow.enso_phase}.`) : tr('No hay contexto ENSO disponible para esta área y periodo.','No ENSO context is available for this area and period.','Não há contexto ENSO para esta área e período.'), detail: contextRow ? tr(`ONI ${contextRow.oni == null ? 'sin dato' : fmt(contextRow.oni,lang)}. La fase ENSO es contexto, no atribución causal de un incendio.`,`ONI ${contextRow.oni == null ? 'unavailable' : fmt(contextRow.oni,lang)}. ENSO phase is context, not a causal attribution for a fire.`,`ONI ${contextRow.oni == null ? 'sem dados' : fmt(contextRow.oni,lang)}. A fase ENSO é contexto, não atribuição causal de incêndio.`) : tr('La ausencia de contexto se muestra sin inferir una causa.','Missing context does not imply a cause.','A ausência de contexto não implica uma causa.'), year:contextRow?.year, month:contextRow?.month },
  ];
}
export function kmlFromHotspots(data: HotspotsGeoJson): string {
  const esc=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>FIRELY · NASA FIRMS</name><description>${esc(`${data.attribution} · ${data.methodology_version} · ${data.data_cutoff}`)}</description>${data.features.map(f=>`<Placemark><name>${esc(f.properties.date)}</name><description>${esc(`${f.properties.sensor} · FRP ${f.properties.frp_mw ?? 'n/a'} MW`)}</description><Point><coordinates>${f.geometry.coordinates.join(',')},0</coordinates></Point></Placemark>`).join('')}</Document></kml>`;
}
export function csvFromHotspots(data: HotspotsGeoJson): string {
  return ['date,sensor,platform,frp_mw,confidence,daynight,lon,lat',...data.features.map(f=>[f.properties.date,f.properties.sensor,f.properties.platform,f.properties.frp_mw??'',f.properties.confidence_h,f.properties.daynight,...f.geometry.coordinates].join(','))].join('\n');
}
export function playCalendar(rows: CalendarRow[], onMonth:(year:number,month:number)=>void):()=>void {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return ()=>{};
  const ctx = new AudioContextClass();
  let stopped=false;
  const ordered=[...rows].sort((a,b)=>a.year-b.year||a.month-b.month);
  const max=Math.max(1,...ordered.map(r=>r.count_harm??0));
  ordered.forEach((r,i)=>{
    const start=ctx.currentTime+i*.12;
    const volume=Math.min(.11,.015+.095*Math.sqrt((r.count_harm??0)/max));
    const tone=(freq:number,duration:number)=>{const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=freq;osc.type='sine';gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.01);gain.gain.exponentialRampToValueAtTime(.001,start+duration);osc.connect(gain).connect(ctx.destination);osc.start(start);osc.stop(start+duration);};
    tone(220+550*Math.sqrt((r.count_harm??0)/max),.1);
    if((r.anomaly_ratio??0)>=2) tone(370,.08);
    window.setTimeout(()=>{if(!stopped)onMonth(r.year,r.month)},i*120);
  });
  const timer=window.setTimeout(()=>ctx.close(),ordered.length*120+200);
  return ()=>{stopped=true;window.clearTimeout(timer);void ctx.close()};
}
