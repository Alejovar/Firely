import { test, expect } from '@playwright/test';

// Deliberate API fixtures, never imported by the app or used as production fallback.
const envelope = { methodology_version: 'test-fixture', data_cutoff: '2021-04-30', attribution: 'NASA FIRMS', mock: true };
const fixtureRows = [
  { year: 2021, month: 3, count_harm: 42, count_harm_lo: 40, count_harm_hi: 45, frp_harm: 120, anomaly_ratio: 1.5, percentile: .8, return_period_years: 5, is_estimated: false },
  { year: 2021, month: 4, count_harm: 84, count_harm_lo: 80, count_harm_hi: 90, frp_harm: 240, anomaly_ratio: 2.2, percentile: .9, return_period_years: 10, is_estimated: false },
];
async function fixtures(page, { empty = false } = {}) {
  const calls = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return url.origin.includes('127.0.0.1:4173') ? route.continue() : route.abort();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = url.pathname.slice(4);
    calls.push({ path, query: url.searchParams, body: route.request().postDataJSON() });
    const send = body => route.fulfill({ headers, json: { ...envelope, ...body } });
    if (path === '/calendar') return send({ mock: !empty, rows: empty ? [] : fixtureRows.filter(row => {
      const month = `${row.year}-${String(row.month).padStart(2, '0')}`;
      return month >= (url.searchParams.get('from') || '').slice(0, 7) && month <= (url.searchParams.get('to') || '9999').slice(0, 7);
    }) });
    if (path === '/calendar/daily') return send({ rows: [{ date: '2021-03-03', count_raw: 6, count_harm: null }] });
    if (path === '/return-period') return send({ return_period_years: 5, n_reference_years: 20 });
    if (path === '/resolve-area') return send({ source: 'rules', intent: { source: 'rules', date_from: '2021-03-01', date_to: '2021-03-31' }, candidates: [{ label: 'Arteaga, Coahuila', bbox: [-100.9, 25.2, -100.2, 25.7] }, { label: 'Arteaga, Michoacán', bbox: '-102.4,18.2,-102.0,18.5' }] });
    if (path === '/describe') return send({ text: 'La API devuelve 42 detecciones para marzo de 2021.' });
    if (path === '/recent') {
      if (url.searchParams.get('hours') === '24') return route.fulfill({ status: 503, headers, json: { detail: { code: 'firms_map_key_missing' } } });
      return send({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-100.55, 25.35] }, properties: { platform: 'NOAA20', ts_utc: '2026-11-14T12:00:00Z', frp_mw: 9.8, confidence_h: 'alta' } }] });
    }
    if (path === '/season') return send({ rows: [{ year: 2021, onset: '2021-02-01', peak: '2021-04-01', end: '2021-06-01', annual_count_harm: 126, is_estimated: false }], summary_es: 'Temporada consultada desde la API.' });
    if (path === '/analogs') return send({ date: '2021-04-30', confidence: 'low', projection: null, analogs: [{ year: 2020, similarity: .9, year_end_count_harm: 150, is_estimated: false }] });
    if (path === '/context') return send({ rows: [{ year: 2021, month: 3, oni: -.8, enso_phase: 'La Niña', fwi_mean: 20, fwi_anom: 2 }], coverage: 'Cobertura de prueba' });
    if (path === '/events') return send({ rows: [{ start_date: '2021-03-01', end_date: '2021-03-04', duration_days: 4, n_hotspots_harm: 12, frp_total: 90, area_approx_km2: 3 }] });
    if (path === '/admin/search') return send({ candidates: [{ name: 'Coahuila', country: 'Mexico', code: 'MX-COA', bbox: [-103, 25, -100, 29] }] });
    if (path === '/reported') return send({ rows: [{ year: 2021, month: 3, reported_fires: 4, reported_area_ha: 10 }], coverage: 'CONAFOR de prueba' });
    if (path === '/weekday') return send({ counts_monday_first: [1, 2, 3, 4, 5, 6, 7], summary_es: 'Patrón semanal de prueba' });
    if (path === '/night') return send({ rows: [{ year: 2021, night_detections: 20, total_detections: 100, night_ratio: .2 }] });
    return route.fulfill({ status: 404, json: { detail: 'Unmocked test endpoint' } });
  });
  return calls;
}
async function option(page, label, value) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

test('Glass usa cifras de la API y conecta calendario, detalle diario y filtros', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await fixtures(page);
  await page.goto('/');
  await expect(page.getByText('84 detecciones', { exact: true })).toBeVisible();
  await expect(page.getByText('SIMULADA', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Calendario', exact: true }).click();
  await page.getByRole('button', { name: /^Mar 2021: 42/ }).click();
  await expect(page.getByRole('table', { name: 'Detalle diario observado' })).toContainText('2021-03-03');
  await expect(page.getByRole('table', { name: 'Detalle diario observado' })).toContainText('6');
  await expect(page.getByRole('link', { name: 'Exportar detecciones CSV' })).toHaveAttribute('href', /\/api\/hotspots.csv\?.*bbox=/);
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await option(page, 'Métrica', 'Potencia radiativa · FRP (MW)');
  await option(page, 'Referencia histórica', 'Promedio');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByRole('button', { name: /^Abr 2021: 240/ })).toBeVisible();
  expect(calls.some(call => call.path === '/calendar' && call.query.get('metric') === 'frp' && call.query.get('reference') === 'mean')).toBe(true);
  expect(errors).toEqual([]);
});

test('resolver lugares aplica las fechas y redacta solo el calendario consultado', async ({ page }) => {
  const calls = await fixtures(page);
  await page.goto('/#asistente');
  await page.getByRole('searchbox', { name: 'Lugar o pregunta' }).fill('Arteaga en marzo de 2021');
  await page.getByRole('button', { name: 'Buscar lugar y fechas' }).click();
  await page.getByRole('button', { name: 'Arteaga, Coahuila', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'La API devuelve 42 detecciones' })).toBeVisible();
  expect(calls.some(call => call.path === '/calendar' && call.query.get('from') === '2021-03-01' && call.query.get('to') === '2021-03-31')).toBe(true);
  const description = calls.find(call => call.path === '/describe');
  expect(description.body.payload.query).toContain('from=2021-03-01');
  expect(description.body.payload.rows).toHaveLength(1);
  await page.getByRole('link', { name: 'Ver área en el mapa' }).click();
  await expect(page.getByRole('heading', { name: 'Arteaga, Coahuila', exact: true })).toBeVisible();
});

test('datos ausentes y errores FIRMS no se sustituyen por puntos inventados', async ({ page }) => {
  await fixtures(page, { empty: true });
  await page.goto('/');
  await expect(page.getByText('Sin datos disponibles para esta área y periodo.')).toBeVisible();
  await expect(page.getByText('84 detecciones', { exact: true })).toHaveCount(0);
  await expect(page.getByText('SIMULADA', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Últimas 24 h', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByText('La capa reciente necesita una llave FIRMS configurada en el servidor.')).toBeVisible();
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Últimas 48 h', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await page.getByRole('button', { name: 'Ver detecciones recientes', exact: true }).click();
  await page.getByRole('button', { name: /^Detección 1 · NOAA20/ }).click();
  await expect(page.getByRole('dialog')).toContainText('9.8 MW');
  await expect(page.getByRole('dialog')).toContainText('2026-11-14T12:00:00Z');
});

test('las seis vistas de análisis consultan el mismo contrato y área', async ({ page }) => {
  const calls = await fixtures(page);
  await page.goto('/#analisis');
  await expect(page.getByText('Temporada consultada desde la API.')).toBeVisible();
  for (const [label, table] of [['Años análogos', 'Años análogos'], ['Contexto', 'Contexto por mes'], ['Eventos de fuego', 'Eventos de fuego'], ['Día y noche', 'Detecciones nocturnas']]) {
    await option(page, 'Tipo de análisis', label);
    await expect(page.getByRole('table', { name: table, exact: true })).toBeVisible();
  }
  await option(page, 'Tipo de análisis', 'Reportados CONAFOR');
  await page.getByRole('searchbox', { name: 'Estado o municipio de México' }).fill('Coahuila');
  await page.getByRole('button', { name: 'Buscar unidad administrativa' }).click();
  await page.getByRole('button', { name: 'Coahuila', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Reportes CONAFOR' })).toContainText('10');
  expect(calls.some(call => call.path === '/reported' && call.query.get('admin') === 'MX-COA')).toBe(true);
  for (const path of ['/season', '/analogs', '/context', '/events', '/weekday', '/night']) expect(calls.some(call => call.path === path)).toBe(true);
});

test('sin API muestra error y Glass se adapta a pantallas estrechas', async ({ page }) => {
  await page.route('**/api/**', route => route.abort());
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByText('No se pudo conectar con la API. Comprueba el servidor y el túnel USB.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Calendario', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('las coordenadas manuales actualizan el área consultada sin depender de las teselas', async ({ page }) => {
  const calls = await fixtures(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Elegir área por coordenadas' }).click();
  await page.getByRole('textbox', { name: 'Latitud', exact: true }).fill('25.5');
  await page.getByRole('textbox', { name: 'Longitud', exact: true }).fill('-100.5');
  await page.getByRole('textbox', { name: 'Radio (km)', exact: true }).fill('25');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByRole('heading', { name: 'Área seleccionada · 25.5, -100.5' })).toBeVisible();
  await expect.poll(() => calls.some(call => call.path === '/calendar' && call.query.get('lat') === '25.5' && call.query.get('lon') === '-100.5' && call.query.get('radius_km') === '25')).toBe(true);
});
