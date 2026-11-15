import React, { Fragment, useEffect, useState } from 'react';
import { Stack } from '@astryxdesign/core/Stack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { api, fmt, months, metricValue, periodLabel, useResource, csvUrl } from './data';
import { LoadState, Metadata, Rows, Sparkline } from './DataViews';
import { glass } from './glass';

export function CalendarView({ resource, area, filters }) {
  const [selected, setSelected] = useState(null);
  const areaKey = JSON.stringify(area.query);
  useEffect(() => setSelected(null), [areaKey, JSON.stringify(filters)]);
  const detail = useResource(`daily:${areaKey}:${selected?.year}:${selected?.month}`, signal => !selected ? null : Promise.all([
    api.getDaily(area.query, selected.year, selected.month, signal),
    api.getReturnPeriod(area.query, selected.year, selected.month, signal),
  ]).then(([daily, period]) => ({ daily, period })));
  const rows = resource.data?.rows || [];
  const years = [...new Set(rows.map(row => row.year))].sort((a, b) => b - a);
  const lookup = new Map(rows.map(row => [`${row.year}-${row.month}`, row]));
  const values = rows.map(row => filters.mode === 'anomaly' ? row.anomaly_ratio : metricValue(row, filters.metric)).filter(Number.isFinite);
  const maximum = Math.max(1, ...values);
  const daily = detail.data?.daily;
  const days = Array.isArray(daily) ? daily : daily?.rows || daily?.days || [];
  return <Stack gap={4}>
    <Text type="supporting">{area.label} · {filters.from} a {filters.to}</Text>
    <Heading level={2}>{filters.mode === 'anomaly' ? 'Anomalía mensual' : 'Actividad mensual'}</Heading>
    <LoadState resource={resource} empty={!rows.length}>
      <Stack isScrollable padding={3} style={{ ...glass, borderRadius: 'var(--radius-container)' }}>
        <Stack style={{ display: 'grid', gridTemplateColumns: '3rem repeat(12, minmax(2.75rem, 1fr))', gap: 'var(--spacing-1)', minWidth: '39rem' }}>
          <Text type="supporting">Año</Text>{months.map(month => <Text key={month} type="supporting" justify="center">{month}</Text>)}
          {years.map(year => <Fragment key={year}>
            <Text type="supporting">{year}</Text>
            {months.map((month, index) => {
              const row = lookup.get(`${year}-${index + 1}`);
              const value = filters.mode === 'anomaly' ? row?.anomaly_ratio : metricValue(row, filters.metric);
              const text = filters.mode === 'anomaly' ? `${fmt(value)}×` : fmt(value);
              const intensity = Number.isFinite(value) ? Math.min(60, 10 + value / maximum * 50) : 0;
              return <Button key={month} label={`${month} ${year}: ${row ? text : 'sin datos'}${row?.is_estimated ? ', estimado' : ''}`} isDisabled={!row} size="sm" aria-pressed={selected?.year === year && selected?.month === index + 1}
                onClick={() => setSelected(row)}>
                <Stack width="100%" hAlign="center" padding={1} style={{ background: `color-mix(in srgb, var(--color-accent) ${intensity}%, transparent)`, borderRadius: 'var(--radius-element)', borderBottom: row?.is_estimated ? 'thin dotted var(--color-text-primary)' : undefined }}><Text type="supporting">{row ? text : '·'}</Text></Stack>
              </Button>;
            })}
          </Fragment>)}
        </Stack>
      </Stack>
      <Text type="supporting">Desliza para ver todos los meses. Borde punteado: estimado desde MODIS. «·»: sin registro, no equivale a cero.</Text>
      <Sparkline rows={rows} value={row => metricValue(row, filters.metric)} label="Serie mensual de la API" height="6rem" />
    </LoadState>
    <Metadata data={resource.data} />
    {selected && <Stack gap={4} padding={4} style={{ ...glass, borderRadius: 'var(--radius-container)' }}>
      <Heading level={2}>{periodLabel(selected)}</Heading>
      <Text>{fmt(metricValue(selected, filters.metric))} {filters.metric === 'frp' ? 'MW de FRP' : 'detecciones armonizadas'} · {selected.is_estimated ? 'Estimado desde MODIS' : 'Referencia observada'}</Text>
      <Text>{fmt(selected.anomaly_ratio)}× la {filters.reference === 'median' ? 'mediana' : 'media'} histórica.</Text>
      {filters.metric === 'count' && Number.isFinite(selected.count_harm_lo) && Number.isFinite(selected.count_harm_hi) && <Text type="supporting">Banda estimada: {fmt(selected.count_harm_lo)} a {fmt(selected.count_harm_hi)} detecciones.</Text>}
      <LoadState resource={detail}>
        <Text type="supporting">Retorno descriptivo del conteo: {fmt(detail.data?.period.return_period_years)} años · {fmt(detail.data?.period.n_reference_years)} años de referencia. No es una predicción de FRP ni de incendios.</Text>
        <Heading level={3}>Detecciones observadas por día</Heading>
        <Text type="supporting">Sin armonizar: la armonización es mensual. Los días sin registro no se rellenan como cero.</Text>
        <Rows label="Detalle diario observado" rows={days} columns={[{ key: 'date', header: 'Fecha', renderCell: row => row.date || row.day || '—' }, { key: 'count_raw', header: 'Detecciones', renderCell: row => fmt(row.count_raw ?? row.count_harm) }]} />
        <Metadata data={daily} />
      </LoadState>
    </Stack>}
    <Button href={csvUrl(area, filters)} target="_blank" rel="noopener" label="Exportar detecciones CSV" />
    <Text type="supporting">El CSV contiene detecciones observadas; no es una exportación de los totales mensuales armonizados.</Text>
  </Stack>;
}
