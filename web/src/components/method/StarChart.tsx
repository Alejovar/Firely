import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { CartesianGrid, LabelList, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartInk, emphasisSeries } from '../../lib/dataviz';
import { rawSeries, type Country } from './data';

const sx = stylex.create({ rawKey: { width: 'var(--spacing-6)', flexShrink: 0, borderTopWidth: 'var(--spacing-0-5)', borderTopStyle: 'dashed', borderTopColor: 'var(--color-data-neutral)' }, harmonizedKey: { width: 'var(--spacing-6)', flexShrink: 0, borderTopWidth: 'var(--spacing-1)', borderTopStyle: 'solid', borderTopColor: 'var(--color-data-categorical-orange)' } });
const axisNumber = (value: number, lang: string) => value >= 1_000_000 ? `${fmt(value / 1_000_000, lang)} M` : value >= 1_000 ? `${fmt(value / 1_000, lang)} mil` : fmt(value, lang);
const fmt = (value: number, lang: string) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value);

export function StarChart({ country, mode, setMode, lang }: { country: Country; mode: string; setMode: (value: string) => void; lang: string }) {
  const rows = rawSeries(country.series.filter(row => row.year <= 2025));
  const last = rows.at(-1);
  const chartRows = rows.map(row => ({ ...row, rawEndLabel: row.year === last?.year ? 'Cruda' : null, harmonizedEndLabel: row.year === last?.year ? 'Armonizada' : null }));
  const showRaw = mode === 'raw' || mode === 'both';
  const showHarmonized = mode === 'harmonized' || mode === 'both';
  if (!rows.length) return <Card padding={6}><EmptyState title="No hay serie para este país" description="Seleccione otro país o revise el archivo de datos." /></Card>;
  return <Card padding={6}>
    <VStack gap={5}>
      <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
        <VStack gap={1}>
          <Heading level={3}>{lang === 'es' ? 'El salto que creó el sensor' : lang === 'pt' ? 'O salto criado pelo sensor' : 'The jump the sensor created'}</Heading>
          <Text type="supporting" color="secondary">{country.label}, {lang === 'es' ? 'puntos de calor anuales' : lang === 'pt' ? 'pontos de calor anuais' : 'annual hot spots'}</Text>
        </VStack>
        <SegmentedControl label={lang === 'es' ? 'Comparar series' : 'Compare series'} value={mode} onChange={setMode}>
          <SegmentedControlItem value="raw" label={lang === 'es' ? 'Cruda pegada' : lang === 'pt' ? 'Bruta unida' : 'Raw'} />
          <SegmentedControlItem value="harmonized" label={lang === 'es' ? 'Armonizada' : lang === 'pt' ? 'Harmonizada' : 'Harmonized'} />
          <SegmentedControlItem value="both" label={lang === 'en' ? 'Both' : 'Ambas'} />
        </SegmentedControl>
      </HStack>
      <Text type="supporting" color="secondary">{lang === 'es' ? 'Sombreado: años estimados 2001–2011. Línea vertical: inicio VIIRS en 2012. Las series crudas muestran sensores distintos; la armonizada conserva una sola escala.' : lang === 'pt' ? 'Sombreado: anos estimados. Linha vertical: início do VIIRS.' : 'Shading: estimated years. Vertical line: VIIRS starts.'}</Text>
      <VStack gap={1} role="img" aria-label={`${country.label}: ${lang === 'es' ? 'serie anual de MODIS, VIIRS y valores armonizados; los años anteriores a 2012 son estimados' : 'annual MODIS, VIIRS and harmonized series; pre-2012 years are estimated'}`}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartRows} margin={{ top: 24, right: 92, left: 0, bottom: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={chartInk.grid} />
            <XAxis dataKey="year" tick={chartInk.tick} ticks={rows.filter(row => row.year % 4 === 1).map(row => row.year)} axisLine={false} tickLine={false} />
            <YAxis tick={chartInk.tick} tickFormatter={(v: number) => axisNumber(v, lang)} width={64} axisLine={false} tickLine={false} />
            <ReferenceArea x1={2001} x2={2011} fill={chartInk.grid} fillOpacity={0.35} label={{ value: 'años estimados 2001–2011', fill: chartInk.axis, position: 'insideTopLeft' }} />
            <ReferenceLine x={2012} stroke={chartInk.axis} strokeDasharray="3 3" label={{ value: 'inicio VIIRS', fill: chartInk.axis, position: 'insideTopRight' }} />
            <Tooltip cursor={{ stroke: chartInk.axis, strokeDasharray: '3 3' }} content={({ active, payload, label }) => active && payload?.length ? <Card padding={3}><VStack gap={1}><Text type="label">{String(label ?? '')}</Text>{payload.map(entry => <Text type="supporting" key={String(entry.dataKey)}>{String(entry.name)}: {typeof entry.value === 'number' ? fmt(entry.value, lang) : String(entry.value ?? '')}</Text>)}</VStack></Card> : null} />
            {showRaw && <Line dataKey="raw_concat" name="Cruda, MODIS y luego VIIRS" stroke={emphasisSeries.modisRaw.stroke} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false}><LabelList dataKey="rawEndLabel" position="right" fill={emphasisSeries.modisRaw.stroke} /></Line>}
            {showHarmonized && <Line dataKey="harmonized" name="Firely armonizada" stroke={emphasisSeries.harmonized.stroke} strokeWidth={emphasisSeries.harmonized.strokeWidth} dot={false} activeDot={{ r: 5 }} isAnimationActive={false}><LabelList dataKey="harmonizedEndLabel" position="right" fill={emphasisSeries.harmonized.stroke} /></Line>}
          </LineChart>
        </ResponsiveContainer>
      </VStack>
      <HStack gap={4} wrap="wrap" aria-label="Leyenda y valores finales">
        {showRaw && <HStack gap={2} vAlign="center"><VStack xstyle={sx.rawKey}/><Text type="supporting">Cruda, MODIS y luego VIIRS, {last?.year}: {fmt(last?.raw_concat ?? 0, lang)}</Text></HStack>}
        {showHarmonized && <HStack gap={2} vAlign="center"><VStack xstyle={sx.harmonizedKey}/><Text type="supporting" color="accent">Firely armonizada, {last?.year}: {fmt(last?.harmonized ?? 0, lang)}</Text></HStack>}
      </HStack>
      <Collapsible trigger={lang === 'es' ? 'Ver tabla de datos del gráfico' : lang === 'pt' ? 'Ver tabela de dados' : 'View chart data table'} defaultIsOpen={false}>
        <Table aria-label={`${country.label}: MODIS, VIIRS y serie armonizada por año`} data={rows.map(row => ({ year: row.year, raw: row.raw_concat === null ? '—' : fmt(row.raw_concat, lang), modis: fmt(row.modis_raw, lang), viirs: row.viirs_raw === null ? '—' : fmt(row.viirs_raw, lang), harmonized: fmt(row.harmonized, lang) }))} columns={[{ key: 'year', header: 'Año' }, { key: 'raw', header: 'Cruda pegada' }, { key: 'modis', header: 'MODIS' }, { key: 'viirs', header: 'VIIRS' }, { key: 'harmonized', header: 'Firely' }]} idKey="year" density="compact" />
      </Collapsible>
    </VStack>
  </Card>;
}
