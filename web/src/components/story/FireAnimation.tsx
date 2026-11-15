// 25 years of harmonized fire activity, month by month, on H3 res-4 cells (§7.6). Polygons are built once with h3-js;
// each frame only updates a feature-state, so the map never re-uploads geometry. The video export composes the map
// canvas with the month caption, legend and attribution on a 2D canvas and records it with MediaRecorder.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Map as MlMap, type GeoJSONSource } from 'maplibre-gl';
import { blueMarbleBrightness, blueMarbleSource } from '../../lib/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cellToBoundary } from 'h3-js';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { ApiError, getAnimationFrames, type AnimationCountry, type AnimationFrames } from '../../api/client';
import { useApp } from '../../state/AppState';
import { ANIMATION_GRADIENT, ANIMATION_RAMP, videoInk } from '../../lib/dataviz';
import { countryForLat, frameDelay, monthLabel, pickVideoMime, rampT, ringsBbox, scaleTop, validFrames, videoFileName, ANIMATION_SECONDS } from '../../lib/animation';
import { compact } from '../../lib/explorerLabels';
import { Box, Caption, Inline, OutlineButton, Pills, Segmented } from '../../ui/kit';

const SPEEDS = ['0.5', '1', '2'] as const;
type Speed = typeof SPEEDS[number];

const s = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', minWidth: 0 },
  head: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', maxWidth: '44rem' },
  controls: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-3)', flexWrap: 'wrap' },
  group: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexWrap: 'wrap' },
  stage: { position: 'relative', width: '100%', aspectRatio: { default: '16 / 10', '@media (max-width: 720px)': '4 / 5' }, borderRadius: '2px', overflow: 'hidden', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-emphasized)', backgroundColor: 'var(--color-background-muted)' },
  // width/height too: maplibre-gl.css sets .maplibregl-map{position:relative} and can win over 'absolute', which
  // left the container 0 px tall (blank animation)
  map: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  stamp: { position: 'absolute', top: 'var(--spacing-3)', left: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 12px', borderRadius: '2px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-text-secondary)', backgroundColor: 'var(--color-background-surface)', pointerEvents: 'none' },
  month: { fontFamily: 'var(--font-family-heading)', fontWeight: 600, fontSize: { default: '24px', '@media (max-width: 720px)': '19px' }, lineHeight: 1.1, fontVariantNumeric: 'lining-nums tabular-nums', fontVariationSettings: '"opsz" 36' },
  est: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' },
  estMark: { width: '2px', height: '12px', backgroundColor: 'var(--color-border-emphasized)' },
  loading: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'var(--color-text-secondary)' },
  scrub: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', fontSize: '12.5px', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' },
  range: { flex: '1 1 auto', minWidth: 0, accentColor: 'var(--color-accent)' },
  legend: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--color-text-secondary)' },
  legendL: { display: 'flex', alignItems: 'center', gap: '8px', fontVariantNumeric: 'tabular-nums' },
  bar: { width: '140px', height: '8px', borderRadius: '1px' },
  key: { display: 'flex', alignItems: 'center', gap: '5px' },
  rec: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', flexWrap: 'wrap' },
  recBar: { flex: '1 1 14rem', minWidth: 0 },
});

const copy = {
  es: { title: '25 años de fuego, mes a mes', lead: `La actividad armonizada de cada celda H3, desde enero de 2001 hasta hoy, en unos ${ANIMATION_SECONDS} segundos. Se ven las temporadas encenderse y apagarse en cada región.`, mx: 'México', ar: 'Argentina', all: 'Seis países', country: 'Cobertura', play: 'Reproducir', pause: 'Pausar', again: 'Volver a empezar', speed: 'Velocidad', video: 'Descargar video', cancel: 'Cancelar', recording: 'Grabando video', recNote: `Se graba la animación completa a velocidad normal, unos ${ANIMATION_SECONDS} segundos. No cambies de pestaña mientras tanto.`, noRec: 'Este navegador no puede grabar video desde la página (falta MediaRecorder con WebM). Prueba con Chrome, Edge o Firefox de escritorio.', recFail: 'No se pudo grabar el video.', est: 'Estimado desde MODIS', obs: 'Observado por VIIRS', more: 'o más puntos al mes por celda', loading: 'Cargando 25 años de celdas', slider: 'Mes de la animación', empty: 'No hay celdas con actividad para este país.', basemap: 'Mapa base: NASA GIBS, Blue Marble.', cut: 'datos hasta', method: 'metodología', unit: 'puntos' },
  en: { title: '25 years of fire, month by month', lead: `Harmonized activity in every H3 cell, from January 2001 to today, in about ${ANIMATION_SECONDS} seconds. Watch the fire seasons light up and fade in each region.`, mx: 'Mexico', ar: 'Argentina', all: 'Six countries', country: 'Coverage', play: 'Play', pause: 'Pause', again: 'Start over', speed: 'Speed', video: 'Download video', cancel: 'Cancel', recording: 'Recording video', recNote: `The full animation is recorded at normal speed, about ${ANIMATION_SECONDS} seconds. Keep this tab in front meanwhile.`, noRec: 'This browser cannot record video from the page (no MediaRecorder with WebM). Try desktop Chrome, Edge or Firefox.', recFail: 'The video could not be recorded.', est: 'Estimated from MODIS', obs: 'Observed by VIIRS', more: 'or more detections per cell and month', loading: 'Loading 25 years of cells', slider: 'Animation month', empty: 'No cells with activity for this country.', basemap: 'Basemap: NASA GIBS, Blue Marble.', cut: 'data through', method: 'methodology', unit: 'detections' },
  pt: { title: '25 anos de fogo, mês a mês', lead: `A atividade harmonizada de cada célula H3, de janeiro de 2001 até hoje, em cerca de ${ANIMATION_SECONDS} segundos. As temporadas acendem e se apagam em cada região.`, mx: 'México', ar: 'Argentina', all: 'Seis países', country: 'Cobertura', play: 'Reproduzir', pause: 'Pausar', again: 'Recomeçar', speed: 'Velocidade', video: 'Baixar vídeo', cancel: 'Cancelar', recording: 'Gravando vídeo', recNote: `A animação completa é gravada em velocidade normal, cerca de ${ANIMATION_SECONDS} segundos. Mantenha esta aba à frente.`, noRec: 'Este navegador não consegue gravar vídeo da página (sem MediaRecorder com WebM). Tente Chrome, Edge ou Firefox no computador.', recFail: 'Não foi possível gravar o vídeo.', est: 'Estimado a partir do MODIS', obs: 'Observado pelo VIIRS', more: 'ou mais focos por célula e mês', loading: 'Carregando 25 anos de células', slider: 'Mês da animação', empty: 'Não há células com atividade para este país.', basemap: 'Mapa base: NASA GIBS, Blue Marble.', cut: 'dados até', method: 'metodologia', unit: 'focos' },
};

interface Rec { recorder: MediaRecorder; raf: number; cancelled: boolean; stopTimer?: number }

/** Resolve a theme token to a concrete CSS value the 2D canvas understands. */
function resolved(prop: 'color' | 'fontFamily', value: string, host: HTMLElement): string {
  const probe = document.createElement('span');
  probe.style[prop] = value; probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
  host.appendChild(probe);
  const out = getComputedStyle(probe)[prop];
  probe.remove();
  return out;
}

export default function FireAnimation() {
  const app = useApp(), L = app.lang, t = copy[L];
  const initialCountry = useMemo<AnimationCountry>(() => {
    const b = app.area.bbox; const lat = b ? (b[1] + b[3]) / 2 : 'lat' in app.area.area ? app.area.area.lat : undefined;
    return countryForLat(lat);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<AnimationCountry>(initialCountry);
  const [data, setData] = useState<AnimationFrames | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('1');
  const [recording, setRecording] = useState(false);
  const [recMsg, setRecMsg] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const node = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const applied = useRef<Float32Array | null>(null);
  const rec = useRef<Rec | null>(null);
  const frameRef = useRef(0); frameRef.current = frame;

  const top = useMemo(() => data ? scaleTop(data.values, data.max) : 1, [data]);
  const estimated = useMemo(() => new Set(data?.is_estimated_months ?? []), [data]);
  const months = data?.months ?? [];
  const last = Math.max(0, months.length - 1);
  const ym = months[frame];
  const isEst = ym ? estimated.has(ym) : false;

  // Map, once.
  useEffect(() => {
    if (!node.current) return;
    const map = new MlMap({
      container: node.current as HTMLDivElement,
      style: { version: 8, sources: {
        earth: blueMarbleSource,
        cells: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      }, layers: [
        { id: 'earth', type: 'raster', source: 'earth', paint: { 'raster-brightness-max': blueMarbleBrightness(true), 'raster-saturation': -0.15 } },
                { id: 'cells', type: 'fill', source: 'cells', paint: {
          'fill-color': ['interpolate', ['linear'], ['coalesce', ['feature-state', 't'], 0], ...ANIMATION_RAMP.flat()] as never,
          'fill-opacity': ['case', ['>', ['coalesce', ['feature-state', 't'], 0], 0], 0.92, 0] as never,
          'fill-antialias': false,
        } },
      ] },
      center: [-90, -10], zoom: 1.6, attributionControl: false, dragRotate: false, pitchWithRotate: false, scrollZoom: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize()); observer.observe(node.current);
    map.on('load', () => setMapReady(true));
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; setMapReady(false); };
  }, []);

  // Basemap follows the theme.
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapReady) return;
    const dark = app.scheme === 'dark';
    map.setPaintProperty('earth', 'raster-brightness-max', blueMarbleBrightness(dark));
  }, [mapReady, app.scheme]);

  // Frames for the chosen country.
  useEffect(() => {
    const c = new AbortController();
    setData(null); setError(null); setPlaying(false); setFrame(0);
    getAnimationFrames(country, 4, c.signal).then(d => {
      if (!validFrames(d)) throw new Error('bad frames');
      setData(d);
    }).catch(e => { if (!c.signal.aborted) setError(e instanceof ApiError ? `Error ${e.status}${e.code ? `: ${e.code}` : ''}` : L === 'en' ? 'Could not load the animation.' : L === 'pt' ? 'Não foi possível carregar a animação.' : 'No se pudo cargar la animación.'); });
    return () => c.abort();
  }, [country, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const paint = useCallback((i: number) => {
    const map = mapRef.current, prev = applied.current; if (!map || !data || !prev) return;
    const row = data.values[i]; if (!row) return;
    for (let j = 0; j < row.length; j++) {
      const v = rampT(row[j], top);
      if (Math.abs(v - prev[j]) > 1e-3) { map.setFeatureState({ source: 'cells', id: j }, { t: v }); prev[j] = v; }
    }
  }, [data, top]);
  useEffect(() => { paint(frame); }, [frame, paint]);

  // Geometry, once per dataset: cell index = feature id.
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapReady || !data) return;
    const rings = data.cells.map(cell => cellToBoundary(cell, true) as [number, number][]);
    const src = map.getSource('cells') as GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: rings.map((ring, id) => ({ type: 'Feature', id, properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } })) });
    applied.current = new Float32Array(data.cells.length);
    applied.current.fill(-1);
    const bbox = ringsBbox(rings);
    if (bbox) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 24, duration: 0 });
    map.removeFeatureState({ source: 'cells' });
    const onSourceData = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (event.sourceId === 'cells' && event.isSourceLoaded) {
        applied.current?.fill(-1);
        paint(frameRef.current);
        map.off('sourcedata', onSourceData);
      }
    };
    map.on('sourcedata', onSourceData);
    return () => { map.off('sourcedata', onSourceData); };
  }, [data, mapReady, paint]);


  // Playback clock: the whole series in ANIMATION_SECONDS / speed (recording always runs at 1x).
  useEffect(() => {
    if (!playing || !data) return;
    const delay = frameDelay(data.months.length, recording ? 1 : Number(speed));
    const id = window.setTimeout(() => {
      if (frame >= last) {
        setPlaying(false);
        if (rec.current) { const r = rec.current; r.stopTimer = window.setTimeout(() => r.recorder.state !== 'inactive' && r.recorder.stop(), 1200); }
      } else setFrame(frame + 1);
    }, delay);
    return () => window.clearTimeout(id);
  }, [playing, frame, data, speed, recording, last]);

  const togglePlay = () => { if (!playing && frame >= last) setFrame(0); setPlaying(!playing); };

  const finishRec = () => {
    const r = rec.current; if (!r) return;
    cancelAnimationFrame(r.raf); if (r.stopTimer) clearTimeout(r.stopTimer);
    rec.current = null; setRecording(false);
  };
  const cancelRec = () => {
    const r = rec.current; if (!r) return;
    r.cancelled = true; setPlaying(false);
    if (r.recorder.state !== 'inactive') r.recorder.stop(); else finishRec();
  };
  useEffect(() => () => { const r = rec.current; if (r) { r.cancelled = true; cancelAnimationFrame(r.raf); if (r.recorder.state !== 'inactive') r.recorder.stop(); } }, []);

  const startRec = async () => {
    const map = mapRef.current; if (!map || !data || !node.current) return;
    const Recorder = (window as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    const mime = pickVideoMime(Recorder?.isTypeSupported?.bind(Recorder));
    if (!Recorder || !mime || typeof HTMLCanvasElement.prototype.captureStream !== 'function') { setRecMsg(t.noRec); return; }
    setRecMsg(null); setPlaying(false); setFrame(0); paint(0);
    await new Promise<void>(resolve => { const done = () => resolve(); map.once('idle', done); window.setTimeout(done, 4000); map.triggerRepaint(); });

    const src = map.getCanvas();
    const scale = Math.min(1, 1280 / src.width);
    const comp = document.createElement('canvas');
    comp.width = Math.round(src.width * scale / 2) * 2; comp.height = Math.round(src.height * scale / 2) * 2;
    const g = comp.getContext('2d'); if (!g) { setRecMsg(t.noRec); return; }
    const serif = resolved('fontFamily', 'var(--font-family-heading)', node.current);
    const sans = resolved('fontFamily', 'var(--font-family-body)', node.current);
    const W = comp.width, H = comp.height, u = Math.max(1, Math.min(W, H) / 540);
    const note = `${data.attribution}. Firely, ${t.method} v${data.methodology_version}, ${t.cut} ${data.data_cutoff}.`;
    const draw = () => {
      g.drawImage(src, 0, 0, W, H);
      const month = monthLabel(data.months[frameRef.current], L), est = estimated.has(data.months[frameRef.current] ?? '');
      // Month stamp.
      g.font = `600 ${Math.round(26 * u)}px ${serif}`; const mw = g.measureText(month).width;
      g.font = `400 ${Math.round(12.5 * u)}px ${sans}`; const sub = est ? t.est : t.obs; const sw = g.measureText(sub).width;
      const pad = 12 * u, bw = Math.max(mw, sw + 10 * u) + pad * 2, bh = 60 * u;
      g.fillStyle = videoInk.card; g.fillRect(14 * u, 14 * u, bw, bh);
      g.fillStyle = videoInk.text; g.font = `600 ${Math.round(26 * u)}px ${serif}`; g.textBaseline = 'top'; g.fillText(month, 14 * u + pad, 14 * u + 10 * u);
      g.fillStyle = est ? videoInk.estimated : videoInk.muted; g.fillRect(14 * u + pad, 14 * u + 40 * u, 2 * u, 12 * u);
      g.fillStyle = videoInk.muted; g.font = `400 ${Math.round(12.5 * u)}px ${sans}`; g.fillText(sub, 14 * u + pad + 8 * u, 14 * u + 40 * u);
      // Legend and attribution band.
      const band = 46 * u; g.fillStyle = videoInk.card; g.fillRect(0, H - band, W, band);
      const grad = g.createLinearGradient(14 * u, 0, 134 * u, 0); ANIMATION_RAMP.forEach(([p, c]) => grad.addColorStop(p, c));
      g.fillStyle = videoInk.text; g.font = `400 ${Math.round(11.5 * u)}px ${sans}`; g.textBaseline = 'middle';
      g.fillText('0', 14 * u, H - band + 15 * u);
      g.fillStyle = grad; g.fillRect(26 * u, H - band + 11 * u, 110 * u, 8 * u);
      g.fillStyle = videoInk.text; g.fillText(`${compact(top, L)} ${t.more}`, 142 * u, H - band + 15 * u);
      g.fillStyle = videoInk.muted; g.font = `400 ${Math.round(10.5 * u)}px ${sans}`;
      let line = note; while (g.measureText(line).width > W - 28 * u && line.length > 10) line = line.slice(0, -2);
      g.fillText(line === note ? line : `${line.trimEnd()}…`, 14 * u, H - band + 33 * u);
      if (rec.current) rec.current.raf = requestAnimationFrame(draw);
    };
    let recorder: MediaRecorder;
    try {
      const stream = comp.captureStream(30);
      recorder = new Recorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    } catch { setRecMsg(t.noRec); return; }
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { setRecMsg(t.recFail); };
    recorder.onstop = () => {
      const cancelled = rec.current?.cancelled ?? true;
      finishRec();
      if (cancelled || !chunks.length) return;
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      const a = document.createElement('a'); a.href = url; a.download = videoFileName(country, data.months);
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
    rec.current = { recorder, raf: 0, cancelled: false };
    draw();
    recorder.start(500);
    setRecording(true); setPlaying(true);
  };

  const countryLabel = country === 'all' ? t.all : country === 'Argentina' ? t.ar : t.mx;
  return <Box as="section" xs={s.root} id="animacion" aria-label={t.title}>
    <Box xs={s.head}><Heading level={2}>{t.title}</Heading><Text type="supporting">{t.lead}</Text></Box>
    <Box xs={s.controls}>
      <Box xs={s.group}>
        <OutlineButton accent onClick={togglePlay} disabled={!data || recording} aria-pressed={playing}>{playing ? t.pause : frame >= last && frame > 0 ? t.again : t.play}</OutlineButton>
        <Segmented label={t.speed} value={speed} onChange={v => setSpeed(v)} options={SPEEDS.map(v => ({ value: v, label: `${v.replace('.', L === 'en' ? '.' : ',')}×`, title: `${t.speed} ${v}×` }))} />
      </Box>
      <Box xs={s.group}>
        <Pills label={t.country} value={country} onChange={v => { if (!recording) setCountry(v); }} options={[{ value: 'Mexico', label: t.mx }, { value: 'Argentina', label: t.ar }, { value: 'all', label: t.all }]} />
        <OutlineButton onClick={startRec} disabled={!data || recording} title={t.recNote}>{t.video}</OutlineButton>
      </Box>
    </Box>
    {recording && <Box xs={s.rec}><ProgressBar xstyle={s.recBar} label={t.recording} value={last ? Math.round(100 * frame / last) : 0} hasValueLabel /><Button label={t.cancel} onClick={cancelRec} /></Box>}
    {recMsg && <Banner status="warning" title={recMsg} />}
    {error && <Banner status="error" title={error} endContent={<Button label={L === 'en' ? 'Retry' : L === 'pt' ? 'Tentar de novo' : 'Reintentar'} onClick={() => setRetry(n => n + 1)} />} />}
    <Box xs={s.stage}>
      <Box xs={s.map} ref={node} role="img" aria-label={`${t.title}, ${countryLabel}: ${monthLabel(ym, L)}${isEst ? `, ${t.est}` : ''}`} />
      {!data && !error && <Box xs={s.loading}>{t.loading}</Box>}
      {data && !data.cells.length && <Box xs={s.loading}>{t.empty}</Box>}
      {data && ym && <Box xs={s.stamp} aria-live={playing ? 'off' : 'polite'}>
        <Inline xs={s.month}>{monthLabel(ym, L)}</Inline>
        <Inline xs={s.est}><Inline xs={s.estMark} style={{ backgroundColor: isEst ? 'var(--color-border-emphasized)' : 'transparent' }} />{isEst ? t.est : t.obs}</Inline>
      </Box>}
    </Box>
    <Box xs={s.scrub}>
      <Inline>{months[0]?.slice(0, 4) ?? '2001'}</Inline>
      <input {...stylex.props(s.range)} type="range" min={0} max={last} value={frame} disabled={!data || recording} aria-label={t.slider} aria-valuetext={monthLabel(ym, L)} onChange={e => { setPlaying(false); setFrame(Number(e.target.value)); }} />
      <Inline>{months[last]?.slice(0, 4) ?? ''}</Inline>
    </Box>
    <Box xs={s.legend}>
      <Inline xs={s.legendL}>0<Inline xs={s.bar} style={{ backgroundImage: ANIMATION_GRADIENT }} />{compact(top, L)} {t.more}</Inline>
      <Inline xs={s.key}><Inline xs={s.estMark} />{t.est}{data?.is_estimated_months.length ? ` (${data.is_estimated_months[0].slice(0, 4)}–${data.is_estimated_months[data.is_estimated_months.length - 1].slice(0, 4)})` : ''}</Inline>
    </Box>
    {data && <Caption>{data.attribution}. Firely, {t.method} v{data.methodology_version}, {t.cut} {data.data_cutoff}. {t.basemap}</Caption>}
  </Box>;
}
