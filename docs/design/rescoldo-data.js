(function(){
const MES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MESC=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const ML=['E','F','M','A','M','J','J','A','S','O','N','D'];
const CIV=['#00204d','#31446b','#666970','#958f78','#c8b866','#fde34a'];
const DIV=['#2166ac','#67a9cf','#d1e5f0','#f2f0ec','#fddbc7','#ef8a62','#b2182b'];
const BASE=[3,7,34,58,41,11,3,2,1,2,3,2];
const AGR=[.7,.6,.45,.3,.3,.5,.6,.6,.6,.6,.65,.7];
const YF={2000:1.1,2001:.8,2002:.9,2003:.7,2004:.6,2005:1.2,2006:1.3,2007:.6,2008:1.4,2009:1.1,2010:.5,2011:1.9,2012:1.6,2013:1,2014:.7,2015:.6,2016:.9,2017:1.3,2018:1,2019:1.1,2020:.9,2021:1.5,2022:1.2,2023:1,2024:1.7,2025:.8,2026:1.6};
const CLOUD=new Set(['2003-6','2008-7','2010-8','2015-5','2018-7','2013-8','2019-6','2005-11']);
const ONI={2000:'LN',2001:'N',2002:'EN',2003:'N',2004:'EN',2005:'N',2006:'EN',2007:'LN',2008:'LN',2009:'EN',2010:'LN',2011:'LN',2012:'N',2013:'N',2014:'N',2015:'EN',2016:'LN',2017:'LN',2018:'EN',2019:'N',2020:'LN',2021:'LN',2022:'LN',2023:'EN',2024:'N',2025:'LN',2026:'N'};
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
function ramp(s,t){t=Math.max(0,Math.min(1,t));const p=t*(s.length-1),i=Math.min(s.length-2,Math.floor(p)),f=p-i;const a=hex(s[i]),b=hex(s[i+1]);return 'rgb('+a.map((v,k)=>Math.round(v+(b[k]-v)*f)).join(',')+')';}
function lum(s,t){t=Math.max(0,Math.min(1,t));const [r,g,b]=hex(s[Math.round(t*(s.length-1))]);return (.299*r+.587*g+.114*b)/255;}
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const med=a=>{const s=[...a].sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);const i=(s.length-1)*p,l=Math.floor(i);return s[l]+(s[Math.min(l+1,s.length-1)]-s[l])*(i-l);};
function rawTotal(seed,scale){const r=rng(seed),t={};for(let y=2000;y<=2026;y++){t[y]=[];for(let m=0;m<12;m++)t[y][m]=Math.round(BASE[m]*scale*YF[y]*(.55+r()*.9));}
 if(seed===7){t[2021][2]=312;t[2021][3]=148;t[2012][3]=171;t[2011][3]=152;t[2011][4]=128;t[2024][3]=163;}return t;}
const CACHE={};
function calendar(o){o=o||{};const type=o.type||'todas',seed=o.seed||7,scale=o.scale||1,key=type+seed+scale;if(CACHE[key])return CACHE[key];
 const T=rawTotal(seed,scale),out={};
 for(let y=2000;y<=2026;y++)out[y]=T[y].map((v,m)=>type==='todas'?v:Math.round(v*(type==='agricola'?AGR[m]:1-AGR[m])));
 const refs=[];for(let m=0;m<12;m++){const a=[];for(let y=2000;y<=2025;y++)a.push(out[y][m]);refs.push({med:Math.max(1,med(a)),avg:Math.max(1,a.reduce((x,z)=>x+z,0)/a.length)});}
 out[2026][2]=Math.round(2.8*refs[2].med*18/31);out[2026][0]=Math.round(out[2026][0]*1.1);out[2026][1]=Math.round(out[2026][1]*1.3);
 for(let m=3;m<12;m++)out[2026][m]=null;
 let maxC=1;for(let y=2000;y<=2026;y++)out[y].forEach(v=>{if(v!=null)maxC=Math.max(maxC,v);});
 return CACHE[key]={out,refs,maxC};}
function cellColor(mode,v,ref,maxC){if(mode==='conteo'){const t=Math.sqrt(v/maxC);return{bg:v===0?'var(--cell0)':ramp(CIV,t),dark:lum(CIV,t)<.5};}
 const t=(Math.max(-2,Math.min(2,Math.log2(Math.max(.25,v)/ref)))+2)/4;return{bg:ramp(DIV,t),dark:t<.18||t>.82};}
// cumulative season curves at month resolution (x = month index 0..12)
function cumulative(out){const cum={};for(let y=2000;y<=2026;y++){let s=0;cum[y]=[0];for(let m=0;m<12;m++){if(out[y][m]==null){break;}s+=out[y][m];cum[y].push(s);}}
 cum[2026][3]=cum[2026][2]+out[2026][2];cum[2026].length=4;// partial: at mar 18
 const env=[];for(let i=0;i<=12;i++){const a=[];for(let y=2000;y<=2025;y++)a.push(cum[y][i]);env.push({p10:pct(a,.1),p50:pct(a,.5),p90:pct(a,.9),min:Math.min(...a),max:Math.max(...a)});}
 const cur=cum[2026],xNow=2+18/31;const d=[];for(let y=2000;y<=2025;y++){let e=0;for(let i=1;i<=3;i++)e+=(cum[y][i]-(i<3?cur[i]:cur[2]+(cur[3]-cur[2])))**2;d.push({y,e,total:cum[y][12]});}
 d.sort((a,b)=>a.e-b.e);return{cum,env,analogs:d.slice(0,3),xNow};}
function season(){const r=rng(3),a=[];for(let y=2000;y<=2025;y++){const k=y-2000;a.push({y,start:Math.round(74-.6*k+(r()-.5)*14),peak:Math.round(108-.35*k+(r()-.5)*12),end:Math.round(146+.3*k+(r()-.5)*14)});}return a;}
const doyLabel=d=>{const md=[31,28,31,30,31,30,31,31,30,31,30,31];let m=0;while(d>md[m]){d-=md[m];m++;}return d+' '+MESC[m];};
const EVENTS=[
 {id:'E-2021-031',name:'Los Lirios – El Tunal',start:'19 mar 2021',days:14,ha:'≈ 8,600 ha',frp:'41,200',pts:268,tipo:'Forestal'},
 {id:'E-2012-044',name:'Sierra de la Nieve',start:'02 abr 2012',days:11,ha:'≈ 5,900 ha',frp:'29,800',pts:171,tipo:'Forestal'},
 {id:'E-2024-027',name:'Cañón de San Lorenzo',start:'08 abr 2024',days:9,ha:'≈ 4,700 ha',frp:'24,100',pts:154,tipo:'Forestal'},
 {id:'E-2026-012',name:'San Antonio de las Alazanas',start:'12 mar 2026',days:7,ha:'≈ 3,900 ha',frp:'19,600',pts:143,tipo:'Forestal',active:true},
 {id:'E-2011-038',name:'Jamé – Mesa de las Tablas',start:'27 abr 2011',days:8,ha:'≈ 3,100 ha',frp:'15,900',pts:128,tipo:'Forestal'},
 {id:'E-2008-019',name:'Huachichil',start:'15 mar 2008',days:6,ha:'≈ 1,800 ha',frp:'8,700',pts:74,tipo:'Mixto'}];
const WEEK={labels:['L','M','M','J','V','S','D'],vals:[118,104,101,99,112,151,163]};
const CLIMA=(()=>{const r=rng(11),a=[];for(let y=2000;y<=2026;y++){const ln=ONI[y]==='LN',en=ONI[y]==='EN';a.push({y,rain:Math.round((ln?-28:en?22:0)+(r()-.5)*30),temp:+((ln?.6:en?-.3:0)+.03*(y-2000)+(r()-.5)*.8).toFixed(1)});}a[26].rain=-41;a[26].temp=1.4;return a;})();
const FWI=[{d:'Mié 18',v:28},{d:'Jue 19',v:31},{d:'Vie 20',v:36},{d:'Sáb 21',v:41},{d:'Dom 22',v:38},{d:'Lun 23',v:33},{d:'Mar 24',v:24}];
const fwiCat=v=>v>=38?{l:'Extremo',c:'#b2182b'}:v>=30?{l:'Muy alto',c:'#ef8a62'}:v>=21?{l:'Alto',c:'#fddbc7'}:{l:'Moderado',c:'#d1e5f0'};
const LOCS=[
 {n:'San Antonio de las Alazanas',km:4.2,dir:'NE',pop:'1,850',down:true,x:62,y:38},
 {n:'Los Lirios',km:7.8,dir:'E',pop:'960',down:true,x:70,y:47},
 {n:'Jamé',km:11.3,dir:'ENE',pop:'640',down:true,x:76,y:36},
 {n:'Arteaga (cabecera)',km:18.6,dir:'N',pop:'12,400',down:false,x:50,y:24},
 {n:'Huachichil',km:9.1,dir:'SO',pop:'410',down:false,x:33,y:68}];
const REPORT=[[2019,14,11],[2020,9,8],[2021,22,13],[2022,17,12],[2023,12,10],[2024,25,15],[2025,8,7]];
window.RD={MES,MESC,ML,CIV,DIV,CLOUD,ONI,ramp,lum,rng,med,pct,calendar,cellColor,cumulative,season,doyLabel,EVENTS,WEEK,CLIMA,FWI,fwiCat,LOCS,REPORT,
 path:(pts)=>pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(''),
 dots:(pts,r)=>pts.map(p=>'M'+(p[0]-r).toFixed(1)+' '+p[1].toFixed(1)+'a'+r+' '+r+' 0 1 0 '+2*r+' 0a'+r+' '+r+' 0 1 0 '+(-2*r)+' 0').join('')};
})();
