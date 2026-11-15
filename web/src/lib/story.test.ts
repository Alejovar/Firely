import { describe,it,expect } from 'vitest';
import { storySlides,kmlFromHotspots,csvFromHotspots } from './story';
import { capDraft,capXml } from './cap';
import { widgetSnippet } from './widgetSnippet';
import type { CalendarResponse,EventsResponse,SeasonResponse,ContextResponse,HotspotsGeoJson } from '../api/client';
const envelope={methodology_version:'1.2',data_cutoff:'2026-03-18',attribution:'NASA FIRMS'};
describe('derived story and exports',()=>{
 it('uses computed peak and does not invent absent events',()=>{const cal:CalendarResponse={...envelope,rows:Array.from({length:12},(_,i)=>({year:2024,month:i+1,count_harm:i===3?12:1,anomaly_ratio:i===3?3:1}))};const season:SeasonResponse={...envelope,rows:[],trend:{onset:{n:0,sen_days_per_decade:null,p_value:null},peak:{n:0,sen_days_per_decade:null,p_value:null}},trend_observed_only:{onset:{n:0,sen_days_per_decade:null,p_value:null},peak:{n:0,sen_days_per_decade:null,p_value:null}},summary_es:'Sin tendencia',method:'test'};const slides=storySlides(cal,{...envelope,rows:[]} as EventsResponse,season,{...envelope,rows:[],coverage:''} as ContextResponse,'es');expect(slides).toHaveLength(5);expect(slides[0].title).toContain('abril');expect(slides[0].detail).toContain('52,2%');expect(slides[2].title).toContain('No se identificaron');expect(slides[3].title).toBe('Sin tendencia')});
 it('escapes KML point fields and exports CSV coordinates',()=>{const data:HotspotsGeoJson={...envelope,type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-100,25]},properties:{date:'2026-03-01',sensor:'MODIS',platform:'Terra',frp_mw:12,confidence_h:'high',daynight:'D'}}],truncated:false,n_total:1};expect(kmlFromHotspots(data)).toContain('<coordinates>-100,25,0</coordinates>');expect(csvFromHotspots(data)).toContain('MODIS,Terra,12,high,D,-100,25')});
 it('keeps CAP as a private exercise',()=>{const xml=capXml(capDraft('Arteaga',{year:2026,month:3,count_harm:20,percentile:.95},'2026-03-18'));expect(xml).toContain('<status>Exercise</status>');expect(xml).toContain('<scope>Private</scope>');expect(xml).toContain('<onset>2026-03-18T00:00:00Z</onset>')});
 it('creates a two line FIRELY embed',()=>{expect(widgetSnippet('https://firely.example',{lat:25,lon:-100,radius:30,theme:'dark',lang:'pt'}).split('\n')).toHaveLength(2)})
});
describe('kml card', () => {
  it('explains each detection in plain language, grouped by day', () => {
    const data: HotspotsGeoJson = { attribution: 'NASA FIRMS', methodology_version: 'v1', data_cutoff: '2026-08-31', type: 'FeatureCollection', truncated: false, n_total: 2,
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-100.3, 25.4] }, properties: { date: '2021-03-17', sensor: 'VIIRS', platform: 'SNPP', frp_mw: 52.4, confidence_h: 'alta', daynight: 'N' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-100.2, 25.5] }, properties: { date: '2021-03-18', sensor: 'MODIS', platform: 'Aqua', frp_mw: 3, confidence_h: 'nominal', daynight: 'D' } },
      ] };
    const kml = kmlFromHotspots(data, { label: 'Sierra de Arteaga', from: '2021-03-01', to: '2021-03-31' });
    expect(kml).toContain('Firely: detecciones de calor, Sierra de Arteaga (2021-03-01 a 2021-03-31)');
    expect(kml).toContain('17 de marzo de 2021: 1 punto');
    expect(kml).toContain('VIIRS a bordo de Suomi NPP');
    expect(kml).toContain('#frp-alto');
    expect(kml).toContain('#frp-bajo');
    expect(kml).toContain('De noche');
    expect(kml).toContain('No es el contorno de un incendio');
  });
});
