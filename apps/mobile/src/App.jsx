import React, { Fragment, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Terrain } from './Terrain';
import { months, monthlyValue, points, years } from './mock-data';

const pages = { mapa: 'Mapa', calendario: 'Calendario', analisis: 'Análisis', asistente: 'Asistente' };
const currentPage = () => Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'mapa';
const notice = 'Un punto de calor es una detección satelital, no un incendio confirmado. Este prototipo no muestra actividad real.';
const panelStyle = { border: 'solid var(--color-border)', borderWidth: 'thin', borderRadius: 'var(--radius-container)' };

export function App() {
  const [page, setPage] = useState(currentPage);
  const [hours, setHours] = useState(24);
  const [selected, setSelected] = useState(0);
  const [showArea, setShowArea] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [month, setMonth] = useState(null);
  const [answer, setAnswer] = useState(false);
  const [status, setStatus] = useState('');
  const heading = useRef(null);
  const pageRef = useRef(page);
  const dialogRef = useRef(dialog);
  pageRef.current = page;
  dialogRef.current = dialog;

  useEffect(() => {
    const navigate = () => {
      setPage(currentPage());
      window.scrollTo(0, 0);
      requestAnimationFrame(() => heading.current?.focus());
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (dialogRef.current) setDialog(null);
      else if (pageRef.current !== 'mapa') location.hash = 'mapa';
      else NativeApp.exitApp();
    });
    return () => { listener.then(handle => handle.remove()); };
  }, []);

  function filter(value) {
    setHours(value);
    if (points[selected].age > value) setSelected(0);
  }

  const point = points[selected];
  const pointName = `Punto de ejemplo ${String(selected + 1).padStart(2, '0')}`;

  return (
    <Stack minHeight="100dvh" style={{ background: 'var(--color-background-body)', color: 'var(--color-text-primary)' }}>
      <Stack as="header" direction="horizontal" hAlign="between" vAlign="center" padding={4}
        style={{ paddingTop: 'max(var(--spacing-4), env(safe-area-inset-top))', borderBottom: 'thin solid var(--color-border)' }}>
        <Button href="#mapa" label="firely." variant="ghost" />
        <Text type="supporting">PROTOTIPO · DATOS SIMULADOS</Text>
        <Button label="Información" size="sm" onClick={() => setDialog({ title: 'Una primera mirada a Firely', body: 'Prototipo visual con información ficticia. El mapa es ilustrativo y no tiene precisión geográfica. No hay conexión a NASA FIRMS, backend ni inteligencia artificial.' })} />
      </Stack>

      <Stack as="main" gap={5} padding={4} width="100%" maxWidth="48rem"
        style={{ marginInline: 'auto', flex: 1 }}>
        <Stack gap={2} ref={heading} tabIndex={-1} style={{ outline: 'none' }}>
          <Text type="supporting">COAHUILA, MX · SIERRA DE ARTEAGA</Text>
          <Heading level={1}>{page === 'mapa' ? 'Explora el territorio.' : pages[page]}</Heading>
        </Stack>

        {page === 'mapa' && <>
          <Button href="#asistente" label="Busca un lugar o haz una pregunta" width="100%" />
          <Stack gap={3}>
            <Text type="supporting">MAPA ILUSTRATIVO · SIN UBICACIONES REALES</Text>
            <Terrain points={points} hours={hours} selected={selected} onSelect={setSelected} showArea={showArea} />
            <Stack direction="horizontal" gap={2} wrap="wrap">
              <Button label="Límite ilustrativo" aria-pressed={showArea} variant={showArea ? 'primary' : 'secondary'} onClick={() => setShowArea(value => !value)} />
              <Button label="Centrar mapa" onClick={() => { setSelected(0); setStatus('Vista ilustrativa restablecida · sin usar tu ubicación'); }} />
            </Stack>
          </Stack>
          <Stack direction="horizontal" gap={2} wrap="wrap" role="group" aria-label="Antigüedad de las detecciones">
            {[24, 48].map(value => <Button key={value} label={`Últimas ${value} h`} aria-pressed={hours === value}
              variant={hours === value ? 'primary' : 'secondary'} onClick={() => filter(value)} />)}
            <Button href="#calendario" label="Elegir fecha" />
          </Stack>
          <Text type="large" hasTabularNumbers>{points.filter(item => item.age <= hours).length} puntos · Detecciones de ejemplo · VIIRS</Text>
          <Stack gap={2} padding={4} style={panelStyle}>
            <Heading level={2}>{pointName}</Heading>
            <Text>Hace {point.age} h ficticias</Text>
            <Button label="Ver ficha de ejemplo" onClick={() => setDialog({ title: pointName, body: `DATOS SIMULADOS. Sensor del escenario: VIIRS. Antigüedad ficticia: ${point.age} horas. FRP de ejemplo: ${point.frp} MW. Este punto no corresponde a una detección real. Una detección no confirma un incendio.` })} />
          </Stack>
          <Text type="supporting">{notice}</Text>
          <Stack role="status"><Text type="supporting">{status}</Text></Stack>
        </>}

        {page === 'calendario' && <>
          <Heading level={2}>Actividad mensual simulada</Heading>
          <Text type="supporting">Valores ficticios para evaluar el diseño. No son resultados armonizados.</Text>
          <Stack isScrollable style={{ ...panelStyle }} padding={3}>
            <Stack style={{ display: 'grid', gridTemplateColumns: '3rem repeat(12, minmax(2.75rem, 1fr))', gap: 'var(--spacing-1)', minWidth: '39rem' }}>
              <Text type="supporting">Año</Text>
              {months.map(label => <Text key={label} type="supporting" justify="center">{label}</Text>)}
              {years.map(year => <Fragment key={year}>
                <Text type="supporting">{year}</Text>
                {months.map((label, index) => {
                  const value = monthlyValue(year, index);
                  const active = month?.year === year && month?.index === index;
                  return <Button key={label} label={`${label} ${year}: ${value} puntos ficticios`} size="sm" aria-pressed={active}
                    variant={active ? 'primary' : 'secondary'} onClick={() => setMonth({ year, index, value })}>{value}</Button>;
                })}
              </Fragment>)}
            </Stack>
          </Stack>
          <Text type="supporting">Desliza la tabla horizontalmente para ver todos los meses.</Text>
          <Stack role="status"><Text>{month ? `${months[month.index]} ${month.year} · ${month.value} puntos ficticios. Selección de prueba; no modifica el mapa ilustrativo.` : 'Toca un mes para consultar el ejemplo.'}</Text></Stack>
        </>}

        {page === 'analisis' && <>
          <Text type="supporting">VISTA PREVIA</Text>
          <Heading level={2}>¿Cómo se compara esta temporada?</Heading>
          <Text>Este espacio mostrará la actividad actual frente al historial armonizado, con su incertidumbre y fuentes.</Text>
          <svg viewBox="0 0 400 160" width="100%" aria-hidden="true">
            {[28, 40, 32, 65, 47, 85, 60, 75].map((value, index) => <rect key={index} x={index * 50 + 8} y={150 - value * 1.5} width="30" height={value * 1.5} rx="4" fill="var(--color-accent)" />)}
          </svg>
          <Text type="supporting">Gráfica decorativa · sin resultados científicos. La integración con el análisis del equipo está pendiente.</Text>
        </>}

        {page === 'asistente' && <>
          <Heading level={2}>Tu territorio, en tus palabras.</Heading>
          <Text>Explora cómo será consultar Firely.</Text>
          <Button label="¿Qué pasa en la Sierra de Arteaga?" onClick={() => setAnswer(true)} />
          {answer && <Stack role="status" padding={4} style={panelStyle}><Text>Esta es una demostración de la interfaz. Cuando conectemos la API, podrás elegir un área y consultar sus datos verificados. Por ahora no hay un modelo de IA conectado.</Text></Stack>}
          <Text type="supporting">Asistente de demostración · sin conexión a IA</Text>
        </>}
      </Stack>

      <Stack as="nav" aria-label="Navegación principal" direction="horizontal" gap={1} hAlign="center" padding={2}
        style={{ position: 'sticky', bottom: 0, background: 'var(--color-background-body)', borderTop: 'thin solid var(--color-border)', paddingBottom: 'max(var(--spacing-2), env(safe-area-inset-bottom))', zIndex: 1 }}>
        {Object.entries(pages).map(([key, label]) => <Button key={key} href={`#${key}`} label={label} size="sm"
          aria-current={page === key ? 'page' : undefined} variant={page === key ? 'primary' : 'ghost'} />)}
      </Stack>

      <Dialog isOpen={Boolean(dialog)} onOpenChange={open => { if (!open) setDialog(null); }} padding={4}>
        <DialogHeader title={dialog?.title || 'Firely'} onOpenChange={() => setDialog(null)} />
        <Stack gap={4} paddingBlockStart={4}>
          <Text>{dialog?.body}</Text>
          <Button label="Entendido" variant="primary" onClick={() => setDialog(null)} />
        </Stack>
      </Dialog>
    </Stack>
  );
}
