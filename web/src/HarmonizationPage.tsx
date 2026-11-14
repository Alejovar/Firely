import { useEffect, useMemo, useState } from 'react';
import { linePath, type SeriesPoint } from './harmonizationChart';
import { seriesColors } from './dataviz';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Text, Heading } from '@astryxdesign/core/Text';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table } from '@astryxdesign/core/Table';
import { Stepper, Step } from '@astryxdesign/core/Stepper';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Link } from '@astryxdesign/core/Link';

type Model = { label: string; annual_mape_pct: number; cell_rmse_improvement_pct: number; spearman: number; chosen: boolean };
type Country = { quality: { level: 'alta' | 'media' | 'baja'; reasons: string[] }; label: string; model_label: string; annual_error_pct: number; baseline_error_pct: number; error_reduction_pct: number; median_annual_error_pct: number; band_pct: number; peak_month_pm1_pct: number; spearman: number; terra_only_annual_error_pct: number; terra_only_baseline_pct: number; n_cells: number; models: Model[]; series: SeriesPoint[] };
type HarmonizationData = { methodology_version: string; data_cutoff: string; viirs_cutoff?: string; attribution: string; countries: Record<string, Country>; independent?: Independent };
type Break = { raw_jump_pct: number; raw_p: number; harmonized_jump_pct: number; harmonized_p: number; break_removed: boolean };
type Corr = { pearson_log: number; n_years: number };
type Independent = {
  breaks: Record<string, Break | Record<string, never>>;
  conafor_mexico?: { years: string; national: { conafor_n_fires: { harmonized: Corr; raw_concat: Corr; harmonized_2001_2011: Corr; raw_concat_2001_2011: Corr } };
    by_state?: { states_tested: number; median_spearman_harmonized: number; median_spearman_raw: number; share_states_better_harmonized: number } };
};
type CountryKey = string;
const number = (value: number, digits = 0) => value.toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (value: number, digits = 1) => `${number(value, digits)} %`;

function StarChart({ country, theme }: { country: Country; theme: 'light' | 'dark' }) {
  const [view, setView] = useState<'raw' | 'harmonized'>('harmonized');
  const [active, setActive] = useState<number | null>(null);
  const series = country.series;
  const first = series[0].year;
  const last = series[series.length - 1].year;
  const viirsStart = series.find((point) => point.viirs_raw != null)?.year ?? last;
  const max = Math.max(...series.flatMap((point) => [point.modis_raw, point.viirs_raw ?? 0, point.harmonized]));
  const top = Math.ceil(max / 100000) * 100000;
  const x = (year: number) => 62 + (year - first) / (last - first) * 900;
  const y = (value: number) => 316 - value / top * 272;
  const selected = series.find((point) => point.year === active);
  const ticks = Array.from({ length: 5 }, (_, i) => top * i / 4);
  const years = series.filter((point, index) => index === 0 || index === series.length - 1 || point.year === viirsStart || (point.year - first) % 4 === 0);
  const colors = seriesColors[theme];
  return <Card><VStack gap={4}>
    <HStack hAlign="between" vAlign="center" wrap="wrap"><VStack gap={1}><Text type="label" color="accent">GRÁFICA ESTRELLA · {country.label.toUpperCase()}</Text><Heading level={3}>El salto que creó el sensor</Heading><Text type="supporting">Puntos de calor por año en todo el país</Text></VStack>
      <SegmentedControl label="Vista de la gráfica" value={view} onChange={(value) => setView(value as 'raw' | 'harmonized')}><SegmentedControlItem value="raw" label="Ver sin armonizar" /><SegmentedControlItem value="harmonized" label="Ver armonizado" /></SegmentedControl>
    </HStack>
    <svg viewBox="0 0 1000 365" style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Serie anual de ${country.label}: MODIS sin armonizar, VIIRS todos los satélites y FIRELY armonizado, de ${first} a ${last}. Años anteriores a ${viirsStart} estimados.`}>
      <rect x="62" y="44" width={Math.max(0, x(viirsStart) - 62)} height="272" fill="var(--color-background-muted)" />
      {ticks.map((tick) => <g key={tick}><line x1="62" y1={y(tick)} x2="962" y2={y(tick)} stroke="var(--color-border)" /><text x="52" y={y(tick) + 4} textAnchor="end" fill="var(--color-text-secondary)" fontSize="11">{number(tick / 1000)} mil</text></g>)}
      <line x1={x(viirsStart)} y1="34" x2={x(viirsStart)} y2="316" stroke="var(--color-text-secondary)" strokeDasharray="4 4" />
      <text x="74" y="59" fill="var(--color-text-secondary)" fontSize="11">AÑOS ESTIMADOS</text><text x={x(viirsStart) + 7} y="36" fill="var(--color-text-secondary)" fontSize="11">INICIO VIIRS · {viirsStart}</text>
      <path d={linePath(series, 'modis_raw', x, y)} fill="none" stroke={colors.modis} strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity={view === 'harmonized' ? 0.45 : 1} />
      <path d={linePath(series, 'harmonized', x, y)} fill="none" stroke={colors.firely} strokeWidth="2" strokeLinecap="round" opacity={view === 'raw' ? 0.45 : 1} />
      <path d={linePath(series, 'viirs_raw', x, y)} fill="none" stroke={colors.viirs} strokeWidth="2" strokeDasharray="10 5" strokeLinecap="round" opacity={view === 'harmonized' ? 0.45 : 1} />
      <circle cx={x(last)} cy={y(series[series.length - 1].modis_raw)} r="4" fill={colors.modis} />
      <circle cx={x(last)} cy={y(series[series.length - 1].harmonized)} r="4" fill={colors.firely} />
      {(() => { const lastViirs = [...series].reverse().find((point) => point.viirs_raw != null); return lastViirs ? <circle cx={x(lastViirs.year)} cy={y(lastViirs.viirs_raw!)} r="4" fill={colors.viirs} /> : null; })()}
      {years.map((point) => <text key={point.year} x={x(point.year)} y="345" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="11">{point.year}</text>)}
      {selected && <line x1={x(selected.year)} y1="44" x2={x(selected.year)} y2="316" stroke="var(--color-text-primary)" strokeDasharray="2 3" />}
      {series.map((point) => <rect key={point.year} x={x(point.year) - 900 / (last - first) / 2} y="44" width={900 / (last - first)} height="272" fill="transparent" stroke={active === point.year ? 'var(--color-accent)' : 'transparent'} strokeWidth="2" tabIndex={0} role="img" aria-label={`${point.year}: MODIS ${number(point.modis_raw)}, VIIRS ${point.viirs_raw == null ? 'sin datos' : number(point.viirs_raw)}, Firely ${number(point.harmonized, 1)}`} onMouseEnter={() => setActive(point.year)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(point.year)} onBlur={() => setActive(null)} />)}
    </svg>
    {selected && <Text role="status">{selected.year}{selected.year < viirsStart ? ' · estimado' : ''} · MODIS: {number(selected.modis_raw)} · VIIRS: {selected.viirs_raw == null ? 'sin datos' : number(selected.viirs_raw)} · FIRELY: {number(selected.harmonized, 1)}</Text>}
    <HStack gap={4} wrap="wrap"><Text type="supporting">··· MODIS sin armonizar</Text><Text type="supporting">━━ FIRELY armonizado</Text><Text type="supporting">– – VIIRS todos los satélites</Text></HStack>
    <Text type="supporting">VIIRS suma detecciones de más satélites con el tiempo. Firely mantiene como referencia un solo VIIRS, S-NPP; después de su retiro usa NOAA-20 calibrado.</Text>
    <details><summary>Ver datos de la gráfica en tabla</summary><Table data={series} idKey="year" density="compact" columns={[{ key: 'year', header: 'Año' }, { key: 'modis_raw', header: 'MODIS sin armonizar', renderCell: (row) => number(row.modis_raw) }, { key: 'viirs_raw', header: 'VIIRS todos los satélites', renderCell: (row) => row.viirs_raw == null ? 'Sin datos' : number(row.viirs_raw) }, { key: 'harmonized', header: 'FIRELY armonizado', renderCell: (row) => number(row.harmonized, 1) }]} /></details>
  </VStack></Card>;
}

function SatelliteTimeline({ data }: { data: HarmonizationData }) {
  const firstCountry = Object.values(data.countries)[0];
  const first = firstCountry.series[0].year;
  const last = Number(data.data_cutoff.slice(0, 4));
  const viirsStart = firstCountry.series.find((point) => point.viirs_raw != null)?.year ?? last;
  const satellites = [
    { label: 'Terra · MODIS', start: first, end: last }, { label: 'Aqua · MODIS', start: 2002, end: last },
    { label: 'S-NPP · VIIRS', start: viirsStart, end: 2026 }, { label: 'NOAA-20 · VIIRS', start: 2018, end: last },
    { label: 'NOAA-21 · VIIRS', start: 2023, end: last },
  ];
  return <VStack gap={2} aria-label={`Disponibilidad de satélites desde ${first} hasta ${last}`}>
    <Text type="supporting">Disponibilidad de satélites · {first}—{last}</Text>
    <svg viewBox="0 0 1000 190" style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Cronología de Terra, Aqua, S-NPP, NOAA-20 y NOAA-21 desde ${first} hasta ${last}`}>
      {satellites.map((satellite, index) => {
        const startX = 180 + (satellite.start - first) / (last + 1 - first) * 780;
        const endX = 180 + (satellite.end + 1 - first) / (last + 1 - first) * 780;
        const posY = 35 + index * 30;
        return <g key={satellite.label}>
          <text x="0" y={posY + 5} fill="var(--color-text-primary)" fontSize="13">{satellite.label}</text>
          <line x1="180" y1={posY} x2="960" y2={posY} stroke="var(--color-border)" strokeWidth="10" strokeLinecap="round" />
          <line x1={startX} y1={posY} x2={endX} y2={posY} stroke={satellite.label.startsWith('S-NPP') ? 'var(--color-accent)' : 'var(--color-text-secondary)'} strokeWidth="10" strokeLinecap="round" />
          {satellite.label.startsWith('S-NPP') && <line x1={endX} y1={posY - 10} x2={endX} y2={posY + 10} stroke="var(--color-accent)" strokeWidth="2" />}
        </g>;
      })}
      <text x="180" y="185" fill="var(--color-text-secondary)" fontSize="11">{first}</text><text x="960" y="185" textAnchor="end" fill="var(--color-text-secondary)" fontSize="11">{last}</text>
    </svg>
    <Table data={satellites} idKey="label" density="compact" columns={[{ key: 'label', header: 'Satélite' }, { key: 'start', header: 'Inicio' }, { key: 'end', header: 'Fin' }]} />
    <Text type="supporting">S-NPP termina el 2 de noviembre de {last}. Después, NOAA-20 ocupa su lugar tras calibrarse con el periodo en que ambos observaron.</Text>
  </VStack>;
}

function ModelBars({ country }: { country: Country }) {
  const max = Math.max(...country.models.map((model) => model.annual_mape_pct));
  return <Card><VStack gap={3}><Heading level={3}>Cuatro configuraciones probadas · {country.label}</Heading><Text type="supporting">Menor error anual es mejor. La elegida se señala con una estrella.</Text>
    {country.models.map((model) => <VStack gap={1} key={model.label}><HStack hAlign="between" wrap="wrap"><Text>{model.chosen ? '★ ' : ''}{model.label}{model.chosen ? ' · elegida' : ''}</Text><Text>{percent(model.annual_mape_pct, 2)}</Text></HStack><ProgressBar isLabelHidden label={`${model.label}: ${percent(model.annual_mape_pct, 2)}`} value={model.annual_mape_pct} max={max} variant={model.chosen ? 'accent' : 'neutral'} /></VStack>)}
    <Text type="supporting">Las barras muestran el error del total anual del país. El resultado por celda puede diferir.</Text>
  </VStack></Card>;
}

export default function HarmonizationPage({ theme }: { theme: 'light' | 'dark' }) {
  const [data, setData] = useState<HarmonizationData | null>(null);
  const [error, setError] = useState('');
  const [pickedCountry, setCountryKey] = useState<CountryKey | null>(null);
  const countryKey: CountryKey = pickedCountry && data?.countries[pickedCountry] ? pickedCountry : Object.keys(data?.countries ?? {})[0] ?? '';
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/harmonization.json`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<HarmonizationData>; })
      .then(setData)
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error desconocido'); });
    return () => controller.abort();
  }, []);
  const country = data?.countries[countryKey];
  const startYear = useMemo(() => country?.series[0]?.year, [country]);
  if (error) return <VStack padding={4}><Text role="alert">No se pudieron cargar los datos de armonización: {error}.</Text></VStack>;
  if (!data || !country) return <VStack padding={4}><Text role="status">Cargando metodología…</Text></VStack>;
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cutoff = fmt(data.data_cutoff);
  const viirsCutoff = data.viirs_cutoff ? fmt(data.viirs_cutoff) : null;
  const limits = [
    'Los años anteriores a VIIRS no se pueden validar directamente. Suponemos que la relación aprendida después también valía antes.',
    'La deriva de órbita de Terra y Aqua (su hora de paso cambia desde ~2020) se mitiga calibrando solo con los años estables, 2012–2021, pero no se modela de forma explícita.',
    'Un punto de calor no equivale a un incendio ni a superficie quemada. Un incendio grande puede producir muchos puntos.',
    'Usamos los biomas de 2020 para toda la serie; los cambios de cobertura anteriores no se reflejan.',
    'La configuración elegida se seleccionó con los mismos datos de validación; su resultado puede ser ligeramente optimista.',
    `Países procesados: ${Object.values(data.countries).map((c) => c.label).join(', ')}.`,
    `La serie armonizada llega hasta el ${cutoff}${viirsCutoff && viirsCutoff !== cutoff ? `. VIIRS termina el ${viirsCutoff}: los meses siguientes se estiman desde MODIS y se marcan como estimados` : ''}. Los datos posteriores aún no están incorporados.`,
  ];
  return <VStack gap={8} padding={4} maxWidth="74rem">
    <VStack gap={3} as="header"><Text type="label" color="accent">CÓMO ARMONIZAMOS · METODOLOGÍA {data.methodology_version}</Text><Heading level={1} type="display-2">En 2012 el fuego no aumentó de golpe. Cambió el satélite.</Heading><Text type="large" color="secondary">MODIS es como una cámara de baja resolución; VIIRS, como un celular nuevo que ve fuegos más pequeños. Si juntamos sus cifras sin corregirlas, parece que el fuego se disparó. FIRELY traduce las observaciones antiguas para poder comparar años distintos.</Text></VStack>
    <VStack gap={4} as="section" aria-labelledby="hm-problem"><HStack hAlign="between" wrap="wrap"><VStack gap={1}><Text type="label" color="accent">01 · EL PROBLEMA</Text><Heading level={2} id="hm-problem">Dos ojos, una historia del fuego</Heading></VStack><SegmentedControl label="País de la gráfica" value={countryKey} onChange={(value) => setCountryKey(value as CountryKey)}>{Object.entries(data.countries).map(([key, item]) => <SegmentedControlItem key={key} value={key} label={item.label} />)}</SegmentedControl></HStack><StarChart key={countryKey} country={country} theme={theme} /></VStack>
    <VStack gap={2} as="section" aria-labelledby="hm-output"><Text type="label" color="accent">02 · QUÉ PRODUCIMOS</Text><Heading level={2} id="hm-output">Una serie que sí se puede comparar</Heading><Text>Una cifra mensual de puntos de calor y otra de potencia radiativa (FRP, en MW), para cada celda de unas 36 km² desde {startYear}.</Text><Text>Todas se expresan como si las hubiera observado un mismo VIIRS S-NPP. Así podemos comparar un mes antiguo con uno reciente.</Text><Text>Los años reconstruidos se marcan como estimados y llevan una banda de incertidumbre.</Text></VStack>
    <VStack gap={4} as="section" aria-labelledby="hm-method"><Text type="label" color="accent">03 · EL MÉTODO</Text><Heading level={2} id="hm-method">Cuatro pasos, del dato crudo a la serie</Heading><Stepper activeStep={3} orientation="vertical" label="Pasos de armonización">
      <Step step={0} label="Limpiar las detecciones"><VStack gap={1}><Text>Quitamos volcanes, fuentes fijas, detecciones de baja confianza y duplicados. Queda el fuego de vegetación.</Text><Text type="supporting">FIRMS: type = 0; MODIS confianza ≥ 30; VIIRS sin confianza baja.</Text></VStack></Step>
      <Step step={1} label="Elegir la referencia de cada época"><VStack gap={2}><Text>Antes de VIIRS usamos MODIS para estimar. Desde que llega S-NPP, sus observaciones son la regla. Tras su retiro, NOAA-20 calibrado toma el relevo.</Text><SatelliteTimeline data={data} /></VStack></Step>
      <Step step={2} label="Estimar el VIIRS de los primeros años"><VStack gap={1}><Text>Aprendemos la relación MODIS → VIIRS en los años en que ambos miraron la misma zona. La aplicamos mes a mes a los años antiguos y repartimos el total entre las celdas, incluso donde MODIS no detectó un fuego pequeño.</Text><Text type="supporting">La banda relativa de incertidumbre para {country.label} es ±{percent(country.band_pct)}; procede del error de validación.</Text></VStack></Step>
      <Step step={3} label="Agrupar celdas según el fuego"><VStack gap={1}><Text>Probamos un factor simple, regímenes de fuego, biomas y una combinación de ambos. Para {country.label} elegimos {country.model_label}, la configuración con menor error anual validado.</Text><Text type="supporting">{number(country.n_cells)} celdas evaluadas. Los regímenes se describen solo con MODIS para poder aplicarlos antes de VIIRS.</Text></VStack></Step>
    </Stepper></VStack>
    <VStack gap={4} as="section" aria-labelledby="hm-validation"><Text type="label" color="accent">04 · VALIDACIÓN</Text><Heading level={2} id="hm-validation">¿Qué tan bien funciona?</Heading><Text>Escondemos un año completo, aprendemos con los demás e intentamos predecir lo que VIIRS vio ese año. Repetimos la prueba con cada año y comparamos con una corrección simple de factor fijo.</Text>
      <Grid columns={{ minWidth: 280, repeat: 'fit' }} gap={4}>{(Object.keys(data.countries) as CountryKey[]).map((key) => { const item = data.countries[key]; return <Card key={key}><VStack gap={3}><HStack gap={2} vAlign="center" wrap="wrap"><Heading level={3}>{item.label}</Heading><Badge label={`Confiabilidad ${item.quality.level}`} variant={item.quality.level === 'alta' ? 'success' : item.quality.level === 'media' ? 'warning' : 'error'} /></HStack>{item.quality.reasons.length > 0 && <Text type="supporting">{item.quality.reasons.join('; ')}.</Text>}<Heading level={2} color="accent">{percent(item.error_reduction_pct, 1)} menos error</Heading><HStack gap={4} wrap="wrap"><Text>FIRELY: {percent(item.annual_error_pct, 2)}</Text><Text>Factor fijo: {percent(item.baseline_error_pct, 2)}</Text></HStack><Text type="supporting">Error medio del total anual. Banda estimada: ±{percent(item.band_pct)}. Mes de mayor actividad acertado con margen de un mes: {percent(item.peak_month_pm1_pct, 0)}.</Text></VStack></Card>; })}</Grid>
      <ModelBars country={country} /><Text type="supporting">Para el tramo en que solo Terra observaba, {country.label} obtuvo {percent(country.terra_only_annual_error_pct, 2)} de error anual frente a {percent(country.terra_only_baseline_pct, 2)} con el factor fijo. La correlación mensual de Spearman del modelo elegido es {number(country.spearman, 4)}.</Text>
    </VStack>
    {data.independent && <VStack gap={4} as="section" aria-labelledby="hm-independent"><Text type="label" color="accent">05 · VALIDACIÓN INDEPENDIENTE</Text><Heading level={2} id="hm-independent">¿Desapareció de verdad el salto de 2012?</Heading>
      <Text>Estas pruebas no usan los datos con los que se calibró el método. Primero, un ajuste estadístico que mide el salto en 2012 de la serie cruda y de la armonizada; después, los incendios reportados en campo por CONAFOR, que no dependen de ningún satélite.</Text>
      <Card><VStack gap={3}><Heading level={3}>Salto en 2012 (2003–2025)</Heading><Table data={Object.entries(data.independent.breaks).filter(([, b]) => 'raw_jump_pct' in b).map(([key, b]) => ({ key, label: data.countries[key]?.label ?? key, ...(b as Break) }))} idKey="key" density="compact" columns={[
        { key: 'label', header: 'País' },
        { key: 'raw_jump_pct', header: 'Serie cruda', renderCell: (row) => `${row.raw_jump_pct > 0 ? '+' : ''}${row.raw_jump_pct.toFixed(0)} % (p ${row.raw_p < 0.001 ? '< 0.001' : '= ' + row.raw_p.toFixed(3)})` },
        { key: 'harmonized_jump_pct', header: 'Serie armonizada', renderCell: (row) => `${row.harmonized_jump_pct > 0 ? '+' : ''}${row.harmonized_jump_pct.toFixed(0)} % (p = ${row.harmonized_p.toFixed(2)})` },
        { key: 'break_removed', header: '¿Salto eliminado?', renderCell: (row) => <Badge label={row.break_removed ? 'Sí' : 'No'} variant={row.break_removed ? 'success' : 'error'} /> },
      ]} /><Text type="supporting">Un salto crudo grande con p muy pequeño es el sensor, no el fuego. La armonización funciona si el salto armonizado no se distingue de cero.</Text></VStack></Card>
      {data.independent.conafor_mexico && (() => { const c = data.independent.conafor_mexico; const n = c.national.conafor_n_fires; return <Card><VStack gap={3}><Heading level={3}>México frente a CONAFOR ({c.years})</Heading>
        <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
          <VStack gap={1}><Text type="supporting">Correlación con la serie armonizada</Text><Heading level={2} color="accent">{n.harmonized.pearson_log.toFixed(2)}</Heading></VStack>
          <VStack gap={1}><Text type="supporting">Correlación con la serie cruda pegada</Text><Heading level={2}>{n.raw_concat.pearson_log.toFixed(2)}</Heading></VStack>
          {c.by_state && <VStack gap={1}><Text type="supporting">Estados que correlacionan mejor con la armonizada</Text><Heading level={2} color="accent">{(100 * c.by_state.share_states_better_harmonized).toFixed(0)} %</Heading></VStack>}
        </Grid>
        <Text type="supporting">Número de incendios reportados por año, {n.harmonized.n_years} años (correlación en logaritmos). Para la superficie quemada el resultado es más matizado y se detalla en la metodología.</Text></VStack></Card>; })()}
    </VStack>}
    <VStack gap={3} as="section" aria-labelledby="hm-limits"><Text type="label" color="accent">06 · LIMITACIONES</Text><Heading level={2} id="hm-limits">Lo que aún no sabemos</Heading><ol>{limits.map((limit) => <li key={limit}><Text>{limit}</Text></li>)}</ol></VStack>
    <Card><VStack gap={3} as="footer"><Text type="label" color="accent">07 · DATOS Y REPRODUCCIÓN</Text><Heading level={2}>Repetir el análisis</Heading><Text>Fuente: {data.attribution}. Metodología: {data.methodology_version}. Corte de datos: {cutoff}.</Text><Link href={`${import.meta.env.BASE_URL}data/harmonization.json`} download>Descargar datos de esta página (JSON)</Link><Text type="supporting">Para Argentina, cambia Mexico por Argentina en los comandos de reproducción.</Text><pre><code>{`source .venv/bin/activate.fish\npython -m pipeline.ingest --country Mexico --years 2001-2026\npython -m pipeline.h3_cells --country Mexico --years 2001-2026\npython -m pipeline.landcover --country Mexico\npython -m pipeline.harmonize --country Mexico\npython -m pipeline.methodology_doc`}</code></pre></VStack></Card>
  </VStack>;
}
