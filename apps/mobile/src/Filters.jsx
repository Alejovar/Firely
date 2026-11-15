import React, { useState } from 'react';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { DateInput } from '@astryxdesign/core/DateInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DEFAULT_AREA } from './data';

export function Filters({ filters, area, liveHours, onApply, onLiveChange }) {
  const [draft, setDraft] = useState(filters);
  const [coordinateMode, setCoordinateMode] = useState(false);
  const [lat, setLat] = useState(String(area.query.lat ?? (area.bbox[1] + area.bbox[3]) / 2));
  const [lon, setLon] = useState(String(area.query.lon ?? (area.bbox[0] + area.bbox[2]) / 2));
  const [radius, setRadius] = useState(String(area.query.radius_km ?? 25));
  const [error, setError] = useState('');
  const [dateErrors, setDateErrors] = useState({});
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  function apply() {
    if (!draft.from || !draft.to || draft.from > draft.to || Object.values(dateErrors).some(Boolean)) { setError('Elige un intervalo de fechas válido.'); return; }
    let nextArea;
    if (coordinateMode) {
      const latitude = Number(lat), longitude = Number(lon), km = Number(radius);
      if (!lat.trim() || !lon.trim() || !radius.trim() || ![latitude, longitude, km].every(Number.isFinite) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180 || km < 1 || km > 500) { setError('Usa latitud entre −85 y 85, longitud entre −180 y 180 y un radio entre 1 y 500 km.'); return; }
      nextArea = { label: `Área seleccionada · ${latitude}, ${longitude}`, query: { lat: latitude, lon: longitude, radius_km: km }, bbox: [Math.max(-180, longitude - km / 90), Math.max(-85, latitude - km / 111), Math.min(180, longitude + km / 90), Math.min(85, latitude + km / 111)] };
    }
    onApply(draft, nextArea);
  }
  return <Stack gap={4}>
    <Text type="supporting">Serie histórica armonizada MODIS + VIIRS. El área y las fechas se aplican al calendario y a los análisis que admiten intervalo.</Text>
    <DateInput label="Desde" value={draft.from} onChange={value => change('from', value)} onEntryErrorChange={value => setDateErrors(current => ({ ...current, from: value }))} min="2001-01-01" />
    <DateInput label="Hasta" value={draft.to} onChange={value => change('to', value)} onEntryErrorChange={value => setDateErrors(current => ({ ...current, to: value }))} min={draft.from || '2001-01-01'} />
    <Selector label="Métrica" value={draft.metric} onChange={value => change('metric', value)} options={[{ value: 'count', label: 'Detecciones armonizadas' }, { value: 'frp', label: 'Potencia radiativa · FRP (MW)' }]} />
    <Selector label="Referencia histórica" value={draft.reference} onChange={value => change('reference', value)} options={[{ value: 'median', label: 'Mediana' }, { value: 'mean', label: 'Promedio' }]} />
    <Selector label="Vista del calendario" value={draft.mode} onChange={value => change('mode', value)} options={[{ value: 'count', label: 'Actividad' }, { value: 'anomaly', label: 'Anomalía frente a la referencia' }]} />
    <Text type="label">Detecciones recientes FIRMS</Text>
    <Stack direction="horizontal" gap={2} wrap="wrap">
      {[0, 24, 48].map(value => <Button key={value} label={value ? `Últimas ${value} h` : 'Apagadas'} aria-pressed={liveHours === value} variant={liveHours === value ? 'primary' : 'secondary'} onClick={() => onLiveChange(value)} />)}
    </Stack>
    <Text type="supporting">La capa reciente es independiente de la serie histórica y requiere una llave FIRMS en el servidor.</Text>
    <Button label="Elegir área por coordenadas" aria-pressed={coordinateMode} onClick={() => setCoordinateMode(value => !value)} />
    {coordinateMode && <Stack gap={3}>
      <TextInput label="Latitud" value={lat} onChange={setLat} inputMode="decimal" />
      <TextInput label="Longitud" value={lon} onChange={setLon} inputMode="decimal" />
      <TextInput label="Radio (km)" value={radius} onChange={setRadius} inputMode="decimal" />
    </Stack>}
    {error && <Text role="alert">{error}</Text>}
    <Button label="Aplicar filtros" variant="primary" onClick={apply} />
    <Button label="Restablecer área inicial" variant="ghost" onClick={() => onApply(filters, DEFAULT_AREA)} />
  </Stack>;
}
