import React, { useState } from 'react';
import { Stack } from '@astryxdesign/core/Stack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { api, candidateArea, calendarPath, fmt, metricValue, periodLabel, useResource } from './data';
import { LoadState, Metadata } from './DataViews';
import { glass } from './glass';

export function AssistantView({ area, filters, calendar, onApply }) {
  const [text, setText] = useState('');
  const [submission, setSubmission] = useState({ text: '', id: 0 });
  const [picked, setPicked] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const [lang, setLang] = useState('es');
  const [profile, setProfile] = useState('brigadista');
  const resolution = useResource(`resolve:${submission.id}:${lang}`, signal => submission.text ? api.resolveArea(submission.text, lang, signal) : null);
  const description = useResource(`describe:${picked}:${calendar.loading}:${JSON.stringify(area.query)}:${JSON.stringify(filters)}:${lang}:${profile}:${calendar.data?.data_cutoff}`, signal => {
    if (!picked || calendar.loading || !calendar.data?.rows?.length) return null;
    return api.describe('calendar', { ...calendar.data, query: calendarPath(area, filters) }, lang, profile, signal);
  });
  function submit() {
    if (!text.trim()) return;
    setPicked(false); setSelectionError('');
    setSubmission(value => ({ text: text.trim(), id: value.id + 1 }));
  }
  function choose(candidate) {
    try {
      const nextArea = candidateArea(candidate);
      const intent = resolution.data?.intent || {};
      const next = { ...filters, from: intent.date_from || filters.from, to: intent.date_to || filters.to };
      if (next.from > next.to) throw new Error('La consulta devolvió un intervalo de fechas inválido.');
      onApply(next, nextArea); setPicked(true); setSelectionError('');
    } catch (error) { setSelectionError(error.message); }
  }
  const rows = calendar.data?.rows || [];
  const latest = rows.at(-1);
  return <Stack gap={4}>
    <Heading level={2}>Tu territorio, en tus palabras.</Heading>
    <Text>Describe un lugar y un periodo. El servidor interpreta la consulta y busca áreas verificadas; después elige la que necesitas.</Text>
    <TextInput label="Lugar o pregunta" type="search" value={text} onChange={setText} onEnter={submit} placeholder="Arteaga, Coahuila en marzo de 2021" width="100%" />
    <Button label="Buscar lugar y fechas" variant="primary" onClick={submit} isDisabled={!text.trim()} isLoading={resolution.loading && Boolean(submission.text)} />
    <Stack direction="horizontal" gap={3} wrap="wrap">
      <Selector label="Idioma de respuesta" value={lang} onChange={setLang} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }, { value: 'pt', label: 'Português' }]} />
      <Selector label="Perfil de explicación" value={profile} onChange={setProfile} options={[{ value: 'brigadista', label: 'Brigadista' }, { value: 'cientifico', label: 'Científico' }]} />
    </Stack>
    {submission.text && <LoadState resource={resolution} empty={!resolution.data?.candidates?.length}>
      <Text type="label">Elige un lugar</Text>
      <Text type="supporting">Interpretación: {resolution.data?.intent?.source === 'llm' || resolution.data?.source === 'llm' ? 'IA del servidor' : 'reglas locales'} · {resolution.data?.intent?.date_from || 'sin fecha inicial interpretada'} a {resolution.data?.intent?.date_to || 'sin fecha final interpretada'}</Text>
      {(resolution.data?.candidates || []).map((candidate, index) => <Button key={`${candidate.label}-${index}`} label={candidate.label || candidate.name || 'Área encontrada'} onClick={() => choose(candidate)} />)}
      <Metadata data={resolution.data} />
    </LoadState>}
    {selectionError && <Text role="alert">{selectionError}</Text>}
    {picked && <Stack gap={4} padding={4} style={{ ...glass, borderRadius: 'var(--radius-container)' }}>
      <Heading level={3}>{area.label}</Heading>
      <Text type="supporting">{filters.from} a {filters.to}</Text>
      <LoadState resource={calendar} empty={!rows.length}>
        <Text>{periodLabel(latest)}: {fmt(metricValue(latest, filters.metric))} {filters.metric === 'frp' ? 'MW de FRP' : 'detecciones armonizadas'}.</Text>
        <LoadState resource={description}>
          {description.data?.text && <Text role="status">{description.data.text}</Text>}
        </LoadState>
      </LoadState>
      <Metadata data={calendar.data} />
      <Button href="#mapa" label="Ver área en el mapa" />
      <Button href="#calendario" label="Abrir calendario consultado" />
    </Stack>}
    <Text type="supporting">La interpretación no confirma incendios ni calcula cifras nuevas. Los valores proceden de la API; sin llave de IA se utilizan reglas y descripciones locales.</Text>
  </Stack>;
}
