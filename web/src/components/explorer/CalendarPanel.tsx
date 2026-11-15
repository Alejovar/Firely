import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Banner } from '@astryxdesign/core/Banner';
import type { CalendarResponse } from '../../api/client';
import { useApp } from '../../state/AppState';
import { playCalendar } from '../../lib/sonify';
import { newest } from '../../lib/explorerLabels';
import CalendarHeatmap from '../CalendarHeatmap';
import Compare from './Compare';
import CellPanel from './CellPanel';
import { Box, Inline, OutlineButton, Pills, Segmented } from '../../ui/kit';

const s = stylex.create({
  root: { padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: '14px', '@media (max-width: 720px)': { padding: '14px 16px' } },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' },
  titles: { display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 300px', minWidth: 0 },
  title: { fontFamily: 'var(--font-family-heading)', fontWeight: 600, fontSize: '22px', lineHeight: 1.15, fontVariationSettings: '"opsz" 36' },
  sub: { fontSize: '13px', color: 'var(--color-text-secondary)' },
  actions: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: 0 },
  filters: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px', flexWrap: 'wrap' },
  filter: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--color-text-secondary)' },
  compare: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', borderRadius: '6px' },
});
const labels = {
  es: { title: 'Calendario de actividad', sub: 'Puntos de calor armonizados por mes, de', listen: 'Escuchar', stop: 'Detener', compare: 'Comparar', count: 'Conteo', anomaly: 'Anomalía', type: 'Tipo', all: 'Todas', farm: 'Agrícola', forest: 'Forestal', reference: 'Referencia', median: 'Mediana', mean: 'Promedio', metric: 'Métrica', points: 'Puntos', note: 'Cada mes suena como una nota: más fuego, nota más aguda. Los meses muy por encima de lo normal suenan disonantes.', land: 'Por cobertura del suelo (aprox.): agrícola = celdas de cultivo; forestal = bosque y matorral.', frpSub: 'Poder radiativo armonizado por mes, de', cloud: 'Vista de nubes', original: 'Original', corrected: 'Corregida', cloudNote: 'Estimación por fracción de cielo despejado, disponible solo en Coahuila. No sustituye el conteo observado; el rayado señala meses con poca visibilidad.' },
  en: { title: 'Activity calendar', sub: 'Harmonized hotspots by month,', listen: 'Listen to', stop: 'Stop', compare: 'Compare', count: 'Count', anomaly: 'Anomaly', type: 'Type', all: 'All', farm: 'Agricultural', forest: 'Forest', reference: 'Reference', median: 'Median', mean: 'Mean', metric: 'Metric', points: 'Points', note: 'Sonification: each month is a note; more fire, higher note; above P90 it turns dissonant.', land: 'Land-cover proxy: agricultural = cropland cells; forest = forest and shrub cells.', frpSub: 'Harmonized radiative power by month,', cloud: 'Cloud view', original: 'Original', corrected: 'Corrected', cloudNote: 'Estimate from clear-sky fraction, available only in Coahuila. It does not replace the observed count; hatching marks months with poor visibility.' },
  pt: { title: 'Calendário de atividade', sub: 'Pontos de calor harmonizados por mês, de', listen: 'Ouvir', stop: 'Parar', compare: 'Comparar', count: 'Contagem', anomaly: 'Anomalia', type: 'Tipo', all: 'Todas', farm: 'Agrícola', forest: 'Florestal', reference: 'Referência', median: 'Mediana', mean: 'Média', metric: 'Métrica', points: 'Pontos', note: 'Sonificação: cada mês é uma nota; mais fogo, nota mais aguda; acima de P90 soa dissonante.', land: 'Por cobertura do solo (aprox.): agrícola = cultivo; florestal = floresta e arbustos.', frpSub: 'Poder radiativo harmonizado por mês, de', cloud: 'Vista de nuvens', original: 'Original', corrected: 'Corrigida', cloudNote: 'Estimativa pela fração de céu limpo, disponível apenas em Coahuila. Não substitui a contagem observada; as hachuras indicam meses com baixa visibilidade.' },
};
export default function CalendarPanel({ data, loading, error, cloudCorrected, onCloudCorrectedChange }: { data: CalendarResponse | null; loading: boolean; error: string | null; cloudCorrected: boolean; onCloudCorrectedChange: (value: boolean) => void }) {
  const app = useApp(), t = labels[app.lang];
  const [comparing, setComparing] = useState(false), [playing, setPlaying] = useState(false), [audioError, setAudioError] = useState<string | null>(null);
  const stop = useRef<null | (() => void)>(null);
  const year = app.selected?.year ?? (data?.rows.length ? newest(data.rows).year : undefined) ?? Number(app.to.slice(0, 4));
  useEffect(() => () => { stop.current?.(); }, []);
  useEffect(() => { stop.current?.(); stop.current = null; setPlaying(false); }, [data, app.metric]);
  const toggleAudio = () => {
    if (playing) { stop.current?.(); stop.current = null; setPlaying(false); return; }
    const rows = (data?.rows ?? []).filter(r => r.year === year).sort((a, b) => a.month - b.month); if (!rows.length) return;
    try { stop.current = playCalendar(rows, app.metric, () => { stop.current = null; setPlaying(false); }); setPlaying(true); setAudioError(null); }
    catch { setAudioError(app.lang === 'es' ? 'No se pudo iniciar el audio' : app.lang === 'pt' ? 'Não foi possível iniciar o áudio' : 'Could not start audio'); }
  };
  return (
    <Box as="section" xs={s.root} aria-label={t.title}>
      <Box xs={s.head}>
        <Box xs={s.titles}><Inline xs={s.title}>{t.title}</Inline><Inline xs={s.sub}>{app.metric === 'frp' ? t.frpSub : t.sub} {app.from.slice(0, 4)} {app.lang === 'en' ? 'to' : 'a'} {app.to.slice(0, 4)}</Inline></Box>
        <Box xs={s.actions}>
          <OutlineButton title={t.note} onClick={toggleAudio} isOn={playing} disabled={!data?.rows.some(r => r.year === year)}>{playing ? t.stop : `${t.listen} ${year}`}</OutlineButton>
          <OutlineButton isOn={comparing} aria-pressed={comparing} onClick={() => { if (comparing) app.setCompare(null); setComparing(!comparing); }}>{t.compare}</OutlineButton>
          <Segmented label={t.title} value={app.mode} onChange={v => app.setMode(v)} options={[{ value: 'count', label: t.count }, { value: 'anomaly', label: t.anomaly }]} />
        </Box>
      </Box>
      <Box xs={s.filters}>
        <Inline xs={s.filter} title={t.land}>{t.type}<Pills label={t.type} value={app.burn} onChange={v => app.setBurn(v)} options={[{ value: 'all', label: t.all }, { value: 'agricola', label: t.farm }, { value: 'forestal', label: t.forest }]} /></Inline>
        <Inline xs={s.filter}>{t.reference}<Pills label={t.reference} value={app.reference} onChange={v => app.setReference(v)} options={[{ value: 'median', label: t.median }, { value: 'mean', label: t.mean }]} /></Inline>
        <Inline xs={s.filter}>{t.metric}<Pills label={t.metric} value={app.metric} onChange={v => app.setMetric(v)} options={[{ value: 'count', label: t.points }, { value: 'frp', label: 'FRP' }]} /></Inline>
      </Box>
      {app.metric === 'count' && data?.rows.some(row => row.count_harm_cloudcorr != null) && <Box xs={s.filter} title={t.cloudNote}>{t.cloud}<Segmented label={t.cloud} value={cloudCorrected && app.mode === 'count' ? 'corrected' : 'original'} onChange={value => { onCloudCorrectedChange(value === 'corrected'); if (value === 'corrected') app.setMode('count'); }} options={[{ value: 'original', label: t.original }, { value: 'corrected', label: t.corrected }]} /></Box>}
      {cloudCorrected && app.metric === 'count' && app.mode === 'count' && <Inline xs={s.sub}>{t.cloudNote}</Inline>}
      {audioError && <Banner status="error" title={audioError} />}
      <CalendarHeatmap data={data} loading={loading} error={error} cloudCorrected={cloudCorrected && app.metric === 'count' && app.mode === 'count'} />
      {comparing && <Box xs={s.compare}><Compare /></Box>}
      {app.selected && <CellPanel data={data} loading={loading} error={error} />}
    </Box>
  );
}
