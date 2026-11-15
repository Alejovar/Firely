// Platform tools wired to the API: read-only SQL (§11.2), weekly bulletin (vigía), CAP drafts with human approval
// (§10.2), official-report extraction (§11.2) and training scenarios from real events (§11.2, simulacros).
import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import {
  ApiError, API_URL, approveCapDraft, createCapDraft, extractReport, getBulletin, getDrill, listCapDrafts, runSql,
  type Area, type BulletinResponse, type CapDraft, type DrillResponse, type ReportExtractResponse, type SqlResponse,
} from '../../api/client';

const sx = stylex.create({
  mono: { fontFamily: 'var(--font-family-code)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '20rem', overflow: 'auto', backgroundColor: 'var(--color-background-muted)', padding: 'var(--spacing-4)', borderRadius: 'var(--radius-2)' },
  row: { borderTop: '1px solid var(--color-border-subtle)', paddingBlock: 'var(--spacing-3)' },
  scroll: { overflowX: 'auto', width: '100%' },
});
const errText = (e: unknown) => e instanceof ApiError ? `${e.status}${e.code ? `, ${e.code}` : ''}` : String(e);
function download(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cell = (v: unknown) => v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v);

// ------------------------------------------------------------------ SQL
const SQL_EXAMPLES = [
  { label: 'Actividad anual armonizada', query: 'SELECT year, round(sum(count_harm), 1) AS detecciones, bool_or(is_estimated) AS estimado\nFROM cell_month_harmonized\nGROUP BY year ORDER BY year' },
  { label: 'Meses con más fuego', query: 'SELECT year, month, round(sum(count_harm), 1) AS n\nFROM cell_month_harmonized\nGROUP BY year, month ORDER BY n DESC LIMIT 20' },
  { label: 'Eventos más largos', query: 'SELECT event_id, start_date, duration_days, round(n_hotspots_harm) AS puntos, round(night_ratio, 2) AS nocturno\nFROM events WHERE n_hotspots_harm >= 3\nORDER BY duration_days DESC LIMIT 20' },
];

export function SqlSection() {
  const [query, setQuery] = useState(SQL_EXAMPLES[0].query);
  const [result, setResult] = useState<SqlResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await runSql(query)); }
    catch (e) { setError(e instanceof ApiError && e.status === 400 ? `Consulta rechazada por las reglas de solo lectura (${errText(e)}).` : errText(e)); }
    finally { setBusy(false); }
  };
  const rows = (result?.rows ?? []).slice(0, 200).map((r, i) => ({ id: String(i), ...Object.fromEntries((result?.columns ?? []).map((c, j) => [c, cell(r[j])])) }));
  return <Card padding={5}><VStack gap={3}>
    <HStack gap={2} wrap="wrap"><Badge label="Solo lectura" variant="success" /><Badge label="máx. 1000 filas, 15 s" variant="neutral" /></HStack>
    <Selector label="Ejemplos" value="" placeholder="Elegir un ejemplo…" onChange={v => { const ex = SQL_EXAMPLES.find(e => e.label === v); if (ex) setQuery(ex.query); }} options={SQL_EXAMPLES.map(e => ({ value: e.label, label: e.label }))} />
    <TextArea label="Consulta SQL (DuckDB)" description="Vistas: cell_month_harmonized, events, climatology. Una sola sentencia SELECT, sin ';' ni comentarios." value={query} onChange={setQuery} rows={6} />
    <HStack gap={2}><Button label="Revisar y ejecutar" variant="primary" onClick={run} isLoading={busy} /></HStack>
    {error && <Banner status="error" title="No se ejecutó" description={error} />}
    {result && <VStack gap={2}>
      <Text type="supporting">{result.n_rows} filas{result.truncated ? ` (truncado a ${result.max_rows})` : ''} · {result.attribution} · v{result.methodology_version}</Text>
      <VStack xstyle={sx.scroll}>{rows.length ? <Table density="compact" idKey="id" data={rows} columns={result.columns.map(c => ({ key: c, header: c }))} /> : <EmptyState title="Sin filas" />}</VStack>
      <HStack gap={2}><Button label="Descargar CSV" size="sm" onClick={() => download('firely-sql.csv', [result.columns.join(','), ...result.rows.map(r => r.map(v => v == null ? '' : JSON.stringify(v)).join(','))].join('\n'), 'text/csv')} /></HStack>
      <Text type="supporting" color="secondary">{result.note}</Text>
    </VStack>}
  </VStack></Card>;
}

// ------------------------------------------------------------------ bulletin
export function BulletinSection({ area, label }: { area: Area; label: string }) {
  const [data, setData] = useState<BulletinResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { setBusy(true); setError(''); try { setData(await getBulletin(area)); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  const text = data ? [data.title, '', ...data.sections.flatMap(s => [s.heading.toUpperCase(), s.text, ''])].join('\n') + `${data.attribution} · v${data.methodology_version} · datos hasta ${data.data_cutoff}` : '';
  return <Card padding={5}><VStack gap={3}>
    <Heading level={3}>Boletín del área actual</Heading>
    <Text type="supporting">{label}: semáforo de prioridad, último mes contra su mediana y unidades bajo vigilancia. Redacción por plantilla desde la serie armonizada.</Text>
    <HStack gap={2}><Button label="Generar boletín" onClick={load} isLoading={busy} />{data && <Button label="Copiar texto" variant="ghost" onClick={() => void navigator.clipboard?.writeText(text)} />}</HStack>
    {error && <Banner status="error" title="No se pudo generar" description={error} />}
    {data && <VStack gap={3}><Heading level={4}>{data.title}</Heading>{data.sections.map(s => <VStack key={s.heading} gap={1} xstyle={sx.row}>
      <HStack gap={2} wrap="wrap"><Text type="label">{s.heading}</Text>{s.level && <Badge label={s.level[0].toUpperCase() + s.level.slice(1)} variant={s.level === 'baja' ? 'success' : s.level === 'media' ? 'warning' : 'error'} />}</HStack>
      {s.items ? s.items.map(i => <Text key={i.name}><strong>{i.name}:</strong> {i.text}</Text>) : <Text>{s.text}</Text>}
    </VStack>)}<Text type="supporting" color="secondary">{data.generated_by} · {data.generated_at} · {data.attribution} · v{data.methodology_version}</Text></VStack>}
  </VStack></Card>;
}

// ------------------------------------------------------------------ CAP drafts with human approval
export function CapSection({ area, label, suggestedText }: { area: Area; label: string; suggestedText: string }) {
  const [text, setText] = useState(suggestedText);
  const [severity, setSeverity] = useState('Moderate');
  const [drafts, setDrafts] = useState<CapDraft[]>([]);
  const [current, setCurrent] = useState<CapDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(suggestedText), [suggestedText]);
  const refresh = () => listCapDrafts().then(r => setDrafts(r.drafts)).catch(() => undefined);
  useEffect(() => { refresh(); }, []);
  const create = async () => {
    setBusy(true); setError('');
    try { const r = await createCapDraft({ ...area, areaDesc: label }, text, severity); setCurrent(r.draft); refresh(); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const approve = async (id: string) => {
    setBusy(true); setError('');
    try { const r = await approveCapDraft(id); setCurrent(c => c?.id === id ? { ...c, ...r.draft } : c); refresh(); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return <Card padding={5}><VStack gap={3}>
    <HStack wrap="wrap" hAlign="between"><Heading level={3}>Borrador CAP 1.2 en el servidor</Heading><Badge label="Ejercicio, nunca real" variant="warning" /></HStack>
    <TextArea label="Texto de la alerta" value={text} onChange={setText} rows={3} maxLength={1000} />
    <Selector label="Severidad" value={severity} onChange={setSeverity} options={['Minor', 'Moderate', 'Severe', 'Extreme'].map(v => ({ value: v, label: v }))} />
    <HStack gap={2} wrap="wrap"><Button label="Crear borrador" onClick={create} isLoading={busy} isDisabled={!text.trim()} /><Button label="Feed CAP (aprobados)" variant="ghost" href={`${API_URL}/alerts/cap`} target="_blank" /></HStack>
    {error && <Banner status="error" title="Error" description={error} />}
    {current && <VStack gap={2}><Text type="label">Borrador {current.id.slice(0, 8)}, {current.approval}</Text>
      {current.xml && <pre {...stylex.props(sx.mono)}>{current.xml}</pre>}
      <HStack gap={2} wrap="wrap">
        <Button label={current.approved_at ? 'Aprobado para ejercicio' : 'Aprobar para ejercicio (revisión humana)'} variant="primary" isDisabled={!!current.approved_at} onClick={() => approve(current.id)} />
        {current.xml && <Button label="Descargar XML" onClick={() => download(`firely-cap-${current.id.slice(0, 8)}.xml`, current.xml ?? '', 'application/xml')} />}
      </HStack></VStack>}
    {drafts.length > 0 && <VStack gap={1}><Text type="label">Borradores recientes</Text>{drafts.slice(0, 6).map(d => <HStack key={d.id} gap={2} wrap="wrap" xstyle={sx.row} hAlign="between">
      <VStack gap={0}><Text>{d.text.slice(0, 90)}</Text><Text type="supporting">{d.area_desc}, {d.severity}, {d.created_at}</Text></VStack>
      {d.approved_at ? <Badge label="Aprobado (ejercicio)" variant="success" /> : <Button label="Aprobar" size="sm" variant="ghost" onClick={() => approve(d.id)} />}
    </HStack>)}</VStack>}
    <Text type="supporting" color="secondary">Aprobar no publica nada a la población: el borrador queda en el feed como ejercicio para que otros sistemas lo prueben.</Text>
  </VStack></Card>;
}

// ------------------------------------------------------------------ official report extraction
const SAMPLE_REPORT = `Estado\tMunicipio\tPeriodo\tNo. de incendios\tSuperficie (ha)\tCausa
Coahuila\tArteaga\tmarzo 2024\t12\t1,250.5\tAgrícola
Coahuila\tSaltillo\tabril 2024\t3\t80\tDesconocida
Total\t\t\t15\t1,330.5\t`;

export function ReportsSection() {
  const [text, setText] = useState('');
  const [data, setData] = useState<ReportExtractResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setError(''); setData(null); try { setData(await extractReport(text)); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  const rows = (data?.records ?? []).map((r, i) => ({ id: String(i), line: cell(r.source_line), state: cell(r.state), mun: cell(r.municipality), period: [r.year, r.month].filter(v => v != null).join('-') || '—', fires: cell(r.fires), area: cell(r.area_ha), review: r.needs_review ? r.issues.join('; ') : 'OK' }));
  return <Card padding={5}><VStack gap={3}>
    <Text>Pega el texto de un reporte oficial (copiado de un PDF o una hoja de cálculo). Firely extrae una fila por registro, valida tipos, rangos y que las sumas cuadren con la fila de total, y marca lo dudoso para revisión humana.</Text>
    <TextArea label="Texto del reporte" value={text} onChange={setText} rows={7} placeholder={SAMPLE_REPORT} description="El documento se trata como datos: cualquier instrucción dentro de él se ignora. Nada se guarda." />
    <HStack gap={2} wrap="wrap"><Button label="Extraer y validar" variant="primary" onClick={run} isLoading={busy} isDisabled={!text.trim()} /><Button label="Usar ejemplo" variant="ghost" onClick={() => setText(SAMPLE_REPORT)} /></HStack>
    {error && <Banner status="error" title="No se pudo extraer" description={error} />}
    {data && <VStack gap={3}>
      <HStack gap={2} wrap="wrap"><Badge label={data.source === 'llm' ? 'Extracción con LLM + validación' : 'Extracción por reglas'} variant="neutral" /><Badge label={`${data.n_records} registros`} variant="neutral" />{data.n_needs_review > 0 && <Badge label={`${data.n_needs_review} por revisar`} variant="warning" />}{data.all_checks_ok != null && <Badge label={data.all_checks_ok ? 'Totales cuadran' : 'Totales no cuadran'} variant={data.all_checks_ok ? 'success' : 'error'} />}</HStack>
      {data.warning && <Banner status="warning" title={data.warning} />}
      {rows.length > 0 && <VStack xstyle={sx.scroll}><Table density="compact" idKey="id" data={rows} columns={[{ key: 'line', header: 'Línea' }, { key: 'state', header: 'Entidad' }, { key: 'mun', header: 'Municipio' }, { key: 'period', header: 'Periodo' }, { key: 'fires', header: 'Incendios' }, { key: 'area', header: 'ha' }, { key: 'review', header: 'Revisión' }]} /></VStack>}
      {data.checks.map(c => <Text key={c.check} type="supporting">{c.ok ? '✓' : '✗'} {c.check}: esperado {c.expected}, calculado {c.computed}</Text>)}
      <HStack gap={2}><Button label="Descargar CSV para revisión" size="sm" onClick={() => download('firely-reporte-extraido.csv', data.csv, 'text/csv')} /></HStack>
      <Text type="supporting" color="secondary">{data.note}</Text>
    </VStack>}
  </VStack></Card>;
}

// ------------------------------------------------------------------ training scenarios
export function DrillSection({ area, label }: { area: Area; label: string }) {
  const [pick, setPick] = useState<'largest' | 'longest' | 'recent'>('largest');
  const [data, setData] = useState<DrillResponse | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true); setError(''); setData(null); setStep(0);
    try { setData(await getDrill(area, pick)); }
    catch (e) { setError(e instanceof ApiError && e.status === 404 ? 'No hay eventos históricos suficientemente grandes en esta área; prueba un área mayor.' : errText(e)); }
    finally { setBusy(false); }
  };
  const stage = data?.stages[step];
  return <Card padding={5}><VStack gap={3}>
    <Text>Un ejercicio por etapas con un incendio que sí ocurrió en {label}. Las cifras vienen del historial; las preguntas son para discutir en equipo y el desenlace se revela al final.</Text>
    <HStack gap={2} wrap="wrap" vAlign="end">
      <Selector label="Evento" value={pick} onChange={v => setPick(v as typeof pick)} options={[{ value: 'largest', label: 'El más grande' }, { value: 'longest', label: 'El más largo' }, { value: 'recent', label: 'El más reciente' }]} />
      <Button label="Iniciar ejercicio" variant="primary" onClick={start} isLoading={busy} />
    </HStack>
    {error && <Banner status="warning" title={error} />}
    {data && stage && <VStack gap={3}>
      <HStack gap={2} wrap="wrap"><Badge label={`Etapa ${step + 1} de ${data.stages.length}`} variant="neutral" />{stage.key === 'desenlace' && <Badge label="Lo que ocurrió" variant="warning" />}</HStack>
      <Heading level={3}>{stage.title}</Heading>
      <Text>{stage.situation}</Text>
      {stage.facts.map(f => <Text key={f} type="supporting">• {f}</Text>)}
      {stage.daily && stage.daily.length > 0 && stage.key === 'evolucion' && <Text type="supporting">{stage.daily.map(d => `${d.date.slice(5)}: ${d.detections}${d.night ? ` (${d.night} noct.)` : ''}`).join(', ')}</Text>}
      <Banner status="info" title="Para discutir" description={stage.question} />
      <HStack gap={2}><Button label="Anterior" variant="ghost" isDisabled={step === 0} onClick={() => setStep(s => s - 1)} /><Button label={step + 1 < data.stages.length ? 'Siguiente etapa' : 'Fin del ejercicio'} isDisabled={step + 1 >= data.stages.length} onClick={() => setStep(s => s + 1)} /></HStack>
      <Text type="supporting" color="secondary">{data.disclaimer} {data.attribution} · v{data.methodology_version}</Text>
    </VStack>}
  </VStack></Card>;
}
