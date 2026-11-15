import React, { useEffect, useState } from 'react';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { fmt, errorMessage } from './data';

export function LoadState({ resource, empty, children }) {
  if (resource.loading) return <Text role="status" type="supporting">Consultando datos…</Text>;
  if (resource.error) return <Stack gap={3} role="alert"><Text>{errorMessage(resource.error)}</Text><Button label="Reintentar" onClick={resource.refresh} /></Stack>;
  if (empty) return <Text role="status">Sin datos disponibles para esta área y periodo.</Text>;
  return children;
}
export function Metadata({ data }) {
  if (!data) return null;
  return <Stack gap={1}>
    {data.mock && <Text color="accent" type="label">DATOS SIMULADOS DEL SERVIDOR</Text>}
    <Text type="supporting">{data.attribution || 'Fuente no disponible'} · {data.methodology_version || 'Versión no disponible'} · Corte: {data.data_cutoff || 'sin datos'}</Text>
  </Stack>;
}
export function Rows({ label, rows, columns }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  if (!rows?.length) return <Text type="supporting">Sin registros disponibles.</Text>;
  const first = Math.min(page * 20, Math.floor((rows.length - 1) / 20) * 20);
  return <Stack gap={3} width="100%">
    <Stack isScrollable width="100%"><Table aria-label={label} data={rows.slice(first, first + 20).map((row, index) => ({ ...row, _rowId: String(first + index) }))} idKey="_rowId" columns={columns} density="compact" /></Stack>
    {rows.length > 20 && <Stack direction="horizontal" gap={2} wrap="wrap" vAlign="center">
      <Button label="Filas anteriores" isDisabled={first === 0} onClick={() => setPage(value => Math.max(0, value - 1))} />
      <Text type="supporting">{first + 1}–{Math.min(first + 20, rows.length)} de {rows.length}</Text>
      <Button label="Filas siguientes" isDisabled={first + 20 >= rows.length} onClick={() => setPage(value => value + 1)} />
    </Stack>}
  </Stack>;
}
export const numberColumn = (key, header) => ({ key, header, renderCell: row => fmt(row[key]) });
export function Sparkline({ rows, value, label, height = '3rem' }) {
  const values = rows.map(row => value(row));
  const finite = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return null;
  const min = Math.min(0, ...finite), max = Math.max(...finite), span = max - min || 1;
  const points = values.map((v, i) => typeof v === 'number' && Number.isFinite(v) ? [values.length === 1 ? 75 : i / (values.length - 1) * 148 + 1, 45 - (v - min) / span * 40] : null);
  let drawing = '';
  let connected = false;
  for (const point of points) {
    if (!point) { connected = false; continue; }
    drawing += `${connected ? 'L' : 'M'}${point[0]} ${point[1]} `; connected = true;
  }
  return <svg viewBox="0 0 150 50" width="100%" height={height} role="img" aria-label={label} preserveAspectRatio="none">
    <path d={drawing} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
    {finite.length === 1 && points.filter(Boolean).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="var(--color-accent)" />)}
  </svg>;
}
