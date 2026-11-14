import React, { Fragment, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Terrain } from './Terrain';
import { months, monthlyValue, points, years } from './mock-data';
import { FirelyIcon } from './FirelyIcon';
import { glass } from './glass';

const pages = { mapa: 'Mapa', calendario: 'Calendario', analisis: 'Análisis', asistente: 'Asistente' };
const currentPage = () => Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'mapa';
const notice = 'Un punto de calor es una detección satelital, no un incendio confirmado. Este prototipo no muestra actividad real.';
const panelStyle = { ...glass, borderRadius: 'var(--radius-container)' };

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
    <Stack minHeight="100dvh" style={{ position: 'relative', isolation: 'isolate', background: 'var(--color-background-body)', color: 'var(--color-text-primary)', overflow: 'clip' }}>
      {page === 'mapa' && <Stack aria-label="Escenario de demostración" style={{ position: 'absolute', inset: 0, zIndex: -1 }}>
        <Terrain points={points} hours={hours} selected={selected} onSelect={setSelected} showArea={showArea} />
      </Stack>}
      <Stack as="header" direction="horizontal" hAlign="between" vAlign="center" padding={4}
        style={{ paddingTop: 'max(var(--spacing-5), env(safe-area-inset-top))', width: '100%', maxWidth: '48rem', marginInline: 'auto' }}>
        <Button href="#mapa" label="Firely, inicio" variant="ghost" icon={<FirelyIcon name="flame" size="lg" color="orange" />}><Text type="large" weight="bold">Firely</Text></Button>
        <Stack direction="horizontal" gap={2}>
          <IconButton href="#asistente" label="Buscar" tooltip="Buscar un lugar" icon={<FirelyIcon name="search" />} />
          <IconButton label="Información" tooltip="Acerca del prototipo" icon={<FirelyIcon name="bell" />} onClick={() => setDialog({ title: 'Una primera mirada a Firely', body: 'Prototipo con datos ficticios. El fondo es una imagen histórica NASA Blue Marble de diciembre de 2004, no una imagen en tiempo real. Los puntos son simulados. No hay conexión a NASA FIRMS, backend ni inteligencia artificial.' })} />
        </Stack>
      </Stack>

      <Stack as="main" gap={page === 'mapa' ? 3 : 5} padding={4} width="100%" maxWidth="48rem"
        style={{ marginInline: 'auto', flex: 1, pointerEvents: page === 'mapa' ? 'none' : 'auto' }}>
        {page !== 'mapa' && <Stack gap={2} ref={heading} tabIndex={-1} style={{ outline: 'none' }}>
          <Text type="supporting">COAHUILA, MX · DATOS SIMULADOS</Text>
          <Heading level={1}>{pages[page]}</Heading>
        </Stack>}

        {page === 'mapa' && <>
          <Stack direction="horizontal" hAlign="between" vAlign="start" gap={2} style={{ pointerEvents: 'auto' }}>
            <Button label="Filtros" icon={<FirelyIcon name="layers" />} onClick={() => setDialog({ title: 'Filtros', filters: true })}>MODIS + VIIRS <FirelyIcon name="chevronDown" size="sm" /></Button>
            <Stack gap={2}>
              <IconButton label="Límite ilustrativo" tooltip="Mostrar límite ilustrativo" icon={<FirelyIcon name="layers" />} aria-pressed={showArea} onClick={() => setShowArea(value => !value)} />
              <IconButton label="Centrar mapa" tooltip="Restablecer selección" icon={<FirelyIcon name="target" />} onClick={() => { setSelected(0); setStatus('Vista ilustrativa restablecida · sin usar tu ubicación'); }} />
            </Stack>
          </Stack>
          <Stack height="clamp(7rem, 18dvh, 20rem)" style={{ pointerEvents: 'none' }} />
          <Stack gap={3} padding={4} style={{ ...glass, marginTop: 'auto', pointerEvents: 'auto' }}>
            <Stack width="2.5rem" height=".2rem" style={{ background: 'var(--color-glass-edge)', borderRadius: 'var(--radius-full)', marginInline: 'auto' }} />
            <Stack direction="horizontal" hAlign="between" gap={2} vAlign="center">
              <Stack gap={1}>
                <Text type="supporting">Actividad en la región</Text>
                <Heading level={1}>Coahuila, MX</Heading>
              </Stack>
              <Text type="supporting" weight="semibold" color="accent">SIMULADA</Text>
            </Stack>
            <Stack direction="horizontal" hAlign="between" gap={4} vAlign="center">
              <Stack gap={1}>
                <Text type="supporting">Últimas {hours} h · ejemplo</Text>
                <Text type="large" weight="bold" hasTabularNumbers>{points.filter(item => item.age <= hours).length} puntos · VIIRS</Text>
              </Stack>
              <svg viewBox="0 0 140 48" width="36%" aria-hidden="true">
                <defs><linearGradient id="trend-fill" x2="0" y2="1"><stop stopColor="var(--color-accent)" stopOpacity=".5" /><stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 42 14 32 27 34 40 25 54 27 68 15 82 18 96 7 110 2 124 9 140 4V48H0Z" fill="url(#trend-fill)" />
                <path d="M0 42 14 32 27 34 40 25 54 27 68 15 82 18 96 7 110 2 124 9 140 4" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
              </svg>
            </Stack>
            <Text type="supporting">Tendencia ilustrativa · sin resultados científicos</Text>
            <Stack direction="horizontal" hAlign="between" gap={2} vAlign="center">
              <Heading level={2}>{pointName}</Heading>
              <Text type="supporting">Hace {point.age} h ficticias</Text>
            </Stack>
            <Button label="Ver ficha de ejemplo" width="100%" onClick={() => setDialog({ title: pointName, body: `DATOS SIMULADOS. Sensor del escenario: VIIRS. Antigüedad ficticia: ${point.age} horas. FRP de ejemplo: ${point.frp} MW. Este punto no corresponde a una detección real. Una detección no confirma un incendio.` })} />
            <Button href="#analisis" label="Ver análisis completo" variant="ghost" endContent={<FirelyIcon name="chevronRight" />} />
            <Text type="supporting">{notice}</Text>
          </Stack>
          <Text type="supporting">Fondo: NASA Blue Marble · diciembre 2004</Text>
          {status && <Stack role="status"><Text type="supporting">{status}</Text></Stack>}
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

      <Stack as="nav" aria-label="Navegación principal" direction="horizontal" gap={1} hAlign="between" padding={2}
        style={{ ...glass, position: 'sticky', bottom: 'max(var(--spacing-3), env(safe-area-inset-bottom))', width: 'calc(100% - var(--spacing-6))', maxWidth: '45rem', marginInline: 'auto', marginBottom: 'max(var(--spacing-3), env(safe-area-inset-bottom))', zIndex: 1 }}>
        {Object.entries(pages).map(([key, label]) => <Button key={key} href={`#${key}`} label={label} size="sm"
          aria-current={page === key ? 'page' : undefined} variant="ghost" width="25%">
          <Stack gap={1} hAlign="center" style={{ color: page === key ? 'var(--color-text-accent)' : 'var(--color-text-primary)', filter: page === key ? 'drop-shadow(var(--shadow-fire))' : 'none' }}>
            <FirelyIcon name={key === 'mapa' ? 'map' : key === 'calendario' ? 'calendar' : key === 'analisis' ? 'chart' : 'spark'} size="lg" />
            <Text type="supporting" color="inherit">{label}</Text>
          </Stack>
        </Button>)}
      </Stack>

      <Dialog isOpen={Boolean(dialog)} onOpenChange={open => { if (!open) setDialog(null); }} padding={4}>
        <DialogHeader title={dialog?.title || 'Firely'} onOpenChange={() => setDialog(null)} />
        <Stack gap={4} paddingBlockStart={4}>
          {dialog?.filters ? <Stack gap={4}>
            <Text>Sensor del escenario ficticio: VIIRS. Los filtros no consultan datos reales.</Text>
            <Stack direction="horizontal" gap={2} wrap="wrap" role="group" aria-label="Antigüedad de las detecciones">
              {[24, 48].map(value => <Button key={value} label={`Últimas ${value} h`} aria-pressed={hours === value} variant={hours === value ? 'primary' : 'secondary'} onClick={() => filter(value)} />)}
            </Stack>
            <Button href="#calendario" label="Elegir fecha" onClick={() => setDialog(null)} />
          </Stack> : <Text>{dialog?.body}</Text>}
          <Button label="Entendido" variant="primary" onClick={() => setDialog(null)} />
        </Stack>
      </Dialog>
    </Stack>
  );
}
