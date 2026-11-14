import { useState } from 'react';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { HStack } from '@astryxdesign/core/HStack';
import { Token } from '@astryxdesign/core/Token';
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Button } from '@astryxdesign/core/Button';
import { Toast } from '@astryxdesign/core/Toast';
import { useApp } from '../state/AppState';
import { DEFAULT_AREA } from '../state/hash';
import { monthNames } from '../i18n';

export default function FilterBar() {
  const app = useApp();
  const [toast, setToast] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10) as ISODateString;
  const t = {
    es: { dates: 'Periodo', view: 'Vista', count: 'Conteo', anomaly: 'Anomalía', metric: 'Métrica', points: 'Puntos', reference: 'Referencia', median: 'Mediana', mean: 'Promedio', copy: 'Copiar enlace', copied: 'Enlace copiado', copyError: 'No se pudo copiar el enlace' },
    en: { dates: 'Dates', view: 'View', count: 'Count', anomaly: 'Anomaly', metric: 'Metric', points: 'Points', reference: 'Reference', median: 'Median', mean: 'Mean', copy: 'Copy link', copied: 'Link copied', copyError: 'Could not copy link' },
    pt: { dates: 'Período', view: 'Vista', count: 'Contagem', anomaly: 'Anomalia', metric: 'Métrica', points: 'Pontos', reference: 'Referência', median: 'Mediana', mean: 'Média', copy: 'Copiar link', copied: 'Link copiado', copyError: 'Não foi possível copiar o link' },
  }[app.lang];
  return <>
    <Toolbar label="Filtros" size="sm" dividers={['bottom']} startContent={<HStack gap={3} wrap="wrap" vAlign="center">
        <Token size="sm" label={app.area.label} onRemove={() => app.setArea(DEFAULT_AREA)} />
        <DateRangeInput label={t.dates} isLabelHidden size="sm" value={{ start: app.from as ISODateString, end: app.to as ISODateString }} min="2001-01-01" max={today} hasClear={false} onChange={(value) => { if (value) app.setRange(value.start, value.end); }} />
        <SegmentedControl size="sm" label={t.view} value={app.mode} onChange={(v) => app.setMode(v as 'count' | 'anomaly')}><SegmentedControlItem value="count" label={t.count} /><SegmentedControlItem value="anomaly" label={t.anomaly} /></SegmentedControl>
        <SegmentedControl size="sm" label={t.metric} value={app.metric} onChange={(v) => app.setMetric(v as 'count' | 'frp')}><SegmentedControlItem value="count" label={t.points} /><SegmentedControlItem value="frp" label="FRP" /></SegmentedControl>
        <SegmentedControl size="sm" label={t.reference} value={app.reference} onChange={(v) => app.setReference(v as 'median' | 'mean')}><SegmentedControlItem value="median" label={t.median} /><SegmentedControlItem value="mean" label={t.mean} /></SegmentedControl>
        {app.selected && <Token size="sm" color="blue" label={`${monthNames[app.lang][app.selected.month - 1]} ${app.selected.year}`} onRemove={() => app.setSelected(null)} />}
        <Button size="sm" label={t.copy} onClick={() => navigator.clipboard.writeText(location.href).then(() => setToast(t.copied)).catch(() => setToast(t.copyError))} />
      </HStack>} />
    {toast && <Toast body={toast} type="info" isAutoHide autoHideDuration={5000} onDismiss={() => setToast(null)} />}
  </>;
}
