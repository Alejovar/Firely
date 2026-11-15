import type { CalendarRow } from '../api/client';
export function noteForValue(value:number,max:number,aboveP90=false){const intensity=max>0?Math.min(1,Math.max(0,value/max)):0;return {frequency:220+660*intensity,gain:.04+.18*intensity,dissonance:aboveP90};}
export function playCalendar(rows:CalendarRow[], metric:'count'|'frp', onEnd:()=>void){
 const AudioContextClass=window.AudioContext;const context=new AudioContextClass();const values=rows.map(r=>metric==='frp'?r.frp_harm??0:r.count_harm??0);const max=Math.max(1,...values);const start=context.currentTime+.05;const duration=.22;
 rows.forEach((row,i)=>{const note=noteForValue(values[i],max,(row.percentile??0)>=.9);const at=start+i*duration;const play=(frequency:number,gain:number)=>{const osc=context.createOscillator(),amp=context.createGain();osc.type='sine';osc.frequency.value=frequency;amp.gain.setValueAtTime(0,at);amp.gain.linearRampToValueAtTime(gain,at+.025);amp.gain.exponentialRampToValueAtTime(.001,at+duration*.9);osc.connect(amp).connect(context.destination);osc.start(at);osc.stop(at+duration);};play(note.frequency,note.gain);if(note.dissonance)play(note.frequency*1.08,note.gain*.45);});
 const timer=window.setTimeout(()=>{void context.close();onEnd();},(rows.length*duration+.1)*1000);
 return ()=>{window.clearTimeout(timer);void context.close();};
}
