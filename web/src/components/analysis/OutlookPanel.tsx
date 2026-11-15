// "Perspectiva 1-3 meses" (GET /forecast). Numbers come from the API; this file only lays them out.
// Regla de oro: where the back-test did not beat climatology (`show === 'climatology'`) only the normal is shown.
import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { ApiError, getOutlook, type Area, type OutlookItem, type OutlookResponse } from '../../api/client';
import type { Lang } from '../../i18n';
import { monthShort } from '../../i18n';
import { outlookInk } from '../../lib/dataviz';
import { Box, Caption, Inline } from '../../ui/kit';

const s = stylex.create({
  row: { display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 92px', gap: '10px', alignItems: 'center', fontSize: '12.5px', paddingBlock: '4px' },
  month: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' },
  bars: { display: 'flex', flexDirection: 'column', gap: '3px' },
  track: { height: '8px', borderRadius: '2px', backgroundColor: 'var(--color-background-muted)', overflow: 'hidden' },
  fill: { display: 'block', height: '100%', borderRadius: '2px' },
  num: { fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  stack: { display: 'flex', height: '10px', borderRadius: '2px', overflow: 'hidden' },
  seg: { display: 'block', height: '100%' },
  key: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', marginInlineEnd: '4px', verticalAlign: 'middle' },
});

const T = {
  es: { title: 'Perspectiva 1-3 meses', exp: 'esperadas', normal: 'normal (promedio 2012-2025)', climOnly: 'Se muestra lo normal: aquí el modelo no superó a la climatología en la prueba 2023-2025.',
        issued: 'Con datos hasta', skill: 'mejor que lo normal en la prueba 2023-2025', above: 'por encima', near: 'cerca', below: 'por debajo',
        likely: 'celdas con probabilidad ≥ 50 % de quedar por encima de lo normal', obs: 'observado', interval: 'intervalo 10-90 %',
        unavailable: 'Perspectiva no disponible', none: 'Sin pronóstico para esta área.', ofNormal: 'de lo normal' },
  en: { title: '1-3 month outlook', exp: 'expected', normal: 'normal (2012-2025 mean)', climOnly: 'Showing normal: here the model did not beat climatology in the 2023-2025 test.',
        issued: 'Data up to', skill: 'better than normal in the 2023-2025 test', above: 'above', near: 'near', below: 'below',
        likely: 'cells with ≥ 50% chance of above-normal activity', obs: 'observed', interval: '10-90% interval',
        unavailable: 'Outlook unavailable', none: 'No outlook for this area.', ofNormal: 'of normal' },
  pt: { title: 'Perspectiva 1-3 meses', exp: 'esperadas', normal: 'normal (média 2012-2025)', climOnly: 'Mostra-se o normal: aqui o modelo não superou a climatologia no teste 2023-2025.',
        issued: 'Dados até', skill: 'melhor que o normal no teste 2023-2025', above: 'acima', near: 'perto', below: 'abaixo',
        likely: 'células com probabilidade ≥ 50 % de ficar acima do normal', obs: 'observado', interval: 'intervalo 10-90 %',
        unavailable: 'Perspectiva indisponível', none: 'Sem previsão para esta área.', ofNormal: 'do normal' },
};

type Load = { key: string; data?: OutlookResponse; error?: unknown };

function useOutlook(area: Area) {
  const key = JSON.stringify(area);
  const [state, setState] = useState<Load>({ key: '' });
  useEffect(() => { const c = new AbortController(); setState({ key }); getOutlook(area, c.signal).then(data => setState({ key, data })).catch(error => { if (!c.signal.aborted) setState({ key, error }); }); return () => c.abort(); }, [key]);
  return state.key === key ? state : { key };
}

function label(target: string, lang: Lang) {
  const m = Number(target.slice(5, 7));
  return m >= 1 && m <= 12 ? `${monthShort[lang][m - 1]} ${target.slice(0, 4)}` : target;
}

function Row({ item, top, lang, many }: { item: OutlookItem; top: number; lang: Lang; many: boolean }) {
  const t = T[lang], fmt = (x: number) => x.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: x < 10 ? 1 : 0 });
  const climOnly = item.show === 'climatology';
  const p = item.probabilities;
  return <VStack gap={1}>
    <Box xs={s.row}>
      <Inline xs={s.month}>{label(item.target, lang)}{many ? ` · ${item.country}` : ''}</Inline>
      <Box xs={s.bars} role="img" aria-label={`${t.normal} ${fmt(item.normal_detections)}${climOnly ? '' : `, ${t.exp} ${fmt(item.expected_detections)}`}`}>
        {!climOnly && <Inline xs={s.track}><Inline xs={s.fill} style={{ width: `${Math.min(100, (item.expected_detections / top) * 100)}%`, backgroundColor: outlookInk.expected }} /></Inline>}
        <Inline xs={s.track}><Inline xs={s.fill} style={{ width: `${Math.min(100, (item.normal_detections / top) * 100)}%`, backgroundColor: outlookInk.normal }} /></Inline>
      </Box>
      <Inline xs={s.num}>{climOnly ? `${fmt(item.normal_detections)} ${t.normal}`
        : item.ratio_to_normal != null ? `${Math.round(item.ratio_to_normal * 100)} % ${t.ofNormal}` : fmt(item.expected_detections)}</Inline>
    </Box>
    {!climOnly && p && <Box xs={s.stack} role="img" aria-label={`${t.below} ${Math.round(p.below * 100)} %, ${t.near} ${Math.round(p.near * 100)} %, ${t.above} ${Math.round(p.above * 100)} %`}>
      <Inline xs={s.seg} style={{ width: `${p.below * 100}%`, backgroundColor: outlookInk.below }} />
      <Inline xs={s.seg} style={{ width: `${p.near * 100}%`, backgroundColor: outlookInk.near }} />
      <Inline xs={s.seg} style={{ width: `${p.above * 100}%`, backgroundColor: outlookInk.above }} />
    </Box>}
    {!climOnly && <Caption>
      {t.exp} {fmt(item.expected_detections)}, {t.normal} {fmt(item.normal_detections)}
      {item.interval_10_90 ? `, ${t.interval} ${fmt(item.interval_10_90[0])}-${fmt(item.interval_10_90[1])}` : ''}
      {item.cells_likely_above_normal != null ? `, ${item.cells_likely_above_normal} ${t.likely}` : ''}
      {item.observed_detections != null ? `, ${t.obs} ${fmt(item.observed_detections)}` : ''}
    </Caption>}
  </VStack>;
}

export function OutlookPanel({ area, lang }: { area: Area; lang: Lang }) {
  const t = T[lang], st = useOutlook(area);
  if (st.error) return <Banner status={st.error instanceof ApiError && st.error.status === 503 ? 'warning' : 'error'} title={t.unavailable} description={st.error instanceof ApiError ? `API ${st.error.status}${st.error.code ? `, ${st.error.code}` : ''}` : String(st.error)} />;
  if (!st.data) return <Skeleton width="100%" height="10rem" />;
  const d = st.data, items = d.forecasts;
  const top = Math.max(1, ...items.map(i => Math.max(i.normal_detections, i.show === 'forecast' ? i.expected_detections : 0, i.interval_10_90?.[1] ?? 0)));
  const many = new Set(items.map(i => i.country)).size > 1;
  const issued = [...new Set(items.map(i => i.issue))].sort();
  const skills = items.filter(i => i.country === items[0]?.country && i.show === 'forecast' && i.skill.skill_vs_climatology != null);
  const climOnly = items.length > 0 && items.every(i => i.show === 'climatology');
  return <Card padding={5}><VStack gap={3}>
    <HStack gap={2} wrap="wrap" vAlign="center"><Heading level={3}>{t.title}</Heading>{issued.length > 0 && <Badge label={`${t.issued} ${issued.join(', ')}`} variant="neutral" />}</HStack>
    {items.length === 0 ? <Text>{d.empty_reason ?? t.none}</Text> : <>
      {climOnly && <Banner status="info" title={t.climOnly} />}
      <HStack gap={3} wrap="wrap">
        <Caption><Inline xs={s.key} style={{ backgroundColor: outlookInk.expected }} />{t.exp}</Caption>
        <Caption><Inline xs={s.key} style={{ backgroundColor: outlookInk.normal }} />{t.normal}</Caption>
        <Caption><Inline xs={s.key} style={{ backgroundColor: outlookInk.below }} />{t.below}</Caption>
        <Caption><Inline xs={s.key} style={{ backgroundColor: outlookInk.near }} />{t.near}</Caption>
        <Caption><Inline xs={s.key} style={{ backgroundColor: outlookInk.above }} />{t.above}</Caption>
      </HStack>
      <VStack gap={2}>{items.map(i => <Row key={`${i.country}-${i.horizon}`} item={i} top={top} lang={lang} many={many} />)}</VStack>
    </>}
    <Text type="supporting">
      {d.note}{skills.length ? ` h=1-3: ${skills.map(i => `${i.skill.skill_vs_climatology! > 0 ? '+' : ''}${Math.round(i.skill.skill_vs_climatology! * 100)} %`).join(' / ')} ${t.skill}.` : ''} {d.methodology_version}, {d.attribution}.
    </Text>
  </VStack></Card>;
}
