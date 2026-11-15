import { test, expect } from '@playwright/test';

const api = 'https://firely-test.invalid/api';
const envelope = { attribution: 'NASA FIRMS', methodology_version: '1.2-fixture', data_cutoff: '2026-08-31' };
const candidate = { code: '05004', label: 'Arteaga, Coahuila', kind: 'mun', country: 'Mexico', bbox: [-100.9, 25.2, -100.2, 25.7] };
const calendar = { ...envelope, rows: [{ year: 2021, month: 3, count_harm: 42, anomaly_ratio: 2, percentile: .9, is_estimated: false }] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(base => localStorage.setItem('firely.mobile.backend.v1', base), api);
});

test('selects a place, shows one concise result and keeps the composer inside a narrow viewport', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route(`${api}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/openapi.json')) return route.fulfill({ json: { info: { title: 'Firely API (real)' }, paths: { '/calendar': {} } } });
    if (path.endsWith('/resolve-area')) return route.fulfill({ json: { ...envelope, intent: { place_text: 'Arteaga', date_from: '2021-03-01', date_to: '2021-03-31', source: 'rules' }, candidates: [candidate], ambiguous: true } });
    if (path.endsWith('/calendar')) return route.fulfill({ json: calendar });
    if (path.endsWith('/return-period')) return route.fulfill({ json: { ...envelope, n_reference_years: 25, return_period_years: 3, percentile: .9 } });
    if (path.endsWith('/territory')) return route.fulfill({ json: { ...envelope, localities: [{ name: 'Localidad de prueba', pop: 1200, lat: 25, lon: -100 }], protected_areas: { type: 'FeatureCollection', features: [] } } });
    return route.fulfill({ status: 503, json: {} });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#/asistente');
  await expect(page.getByText('Conectado a Firely', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Curioso', exact: true }).click();
  await page.getByText('Brigadista', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Escribe tu pregunta' })).toBeVisible();
  await page.screenshot({ path: '/tmp/firely-assistant-welcome.png', fullPage: true });
  await page.getByText('Revisar un incendio', { exact: true }).click();
  await page.getByText('Arteaga, Coahuila', { exact: true }).click();
  await expect(page.getByText('El máximo fue de 42 detecciones', { exact: false }).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ver evolución y cifras', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar consulta', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).boundingBox();
  expect(box.y + box.height).toBeLessThan(740);
  await page.screenshot({ path: '/tmp/firely-assistant-result.png', fullPage: true });
  await page.getByRole('button', { name: '¿A quién afecta?', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Localidad de prueba', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva conversación', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hola, soy Gotita bombera.', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('integrates all Gotita profiles and answers future dates without querying a future calendar', async ({ page }) => {
  const queries = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const historical = { ...envelope, rows: Array.from({ length: 12 }, (_, index) => ({ year: 2021, month: index + 1, count_harm: index === 2 ? 42 : 0, is_estimated: false })) };
  await page.route(`${api}/**`, async route => {
    const url = new URL(route.request().url()); queries.push(url);
    if (url.pathname.endsWith('/openapi.json')) return route.fulfill({ json: { info: { title: 'Firely API (real)' }, paths: { '/calendar': {}, '/forecast': {} } } });
    if (url.pathname.endsWith('/resolve-area')) return route.fulfill({ json: { ...envelope, intent: { place_text: 'Arteaga', date_from: '2027-03-01', date_to: '2027-03-31', source: 'rules' }, candidates: [candidate], ambiguous: false } });
    if (url.pathname.endsWith('/calendar')) return route.fulfill({ json: historical });
    if (url.pathname.endsWith('/forecast')) return route.fulfill({ json: { ...envelope, kind: 'forecast', note: '', empty_reason: null,
      forecasts: [{ country: 'Mexico', issue: '2026-10', target: '2027-01', horizon: 3, expected_detections: 8, normal_detections: 6, ratio_to_normal: 1.33, observed_detections: null, show: 'forecast', skill: { beats_climatology: true, skill_vs_climatology: .12 }, interval_10_90: [2, 12], probabilities: { below: .2, near: .5, above: .3 } }] } });
    return route.fulfill({ status: 503, json: {} });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#/asistente');
  await expect(page.getByRole('heading', { name: 'Hola, soy Gotita curiosa.', exact: true })).toBeVisible();
  const image = page.getByRole('img', { name: 'Gotita curiosa', exact: true }).last();
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Curioso', exact: true }).click();
  await page.getByText('Científico', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Hola, soy Gotita científica.', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('Arteaga, Coahuila en marzo de 2027');
  await page.getByRole('button', { name: 'Enviar consulta', exact: true }).click();
  await expect(page.getByText('fuera del horizonte', { exact: false }).filter({ visible: true })).toBeVisible();
  expect(queries.some(url => url.pathname.endsWith('/calendar') && url.searchParams.get('from') === '2027-03-01')).toBe(false);
  expect(queries.some(url => url.pathname.endsWith('/forecast'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/firely-integrated-future.png', fullPage: true });
  await page.getByRole('heading', { name: 'Perspectiva 1-3 meses', exact: true }).scrollIntoViewIfNeeded();
  const bars = await page.getByRole('img', { name: /normal \(promedio 2012-2025\)/ }).boundingBox();
  expect(bars.width).toBeGreaterThan(100);
  await page.screenshot({ path: '/tmp/firely-integrated-outlook.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('stops an in-flight request and offers retry when the API fails', async ({ page }) => {
  let hold = true;
  await page.route(`${api}/**`, async route => {
    if (route.request().url().endsWith('/openapi.json')) return route.fulfill({ json: { info: { title: 'Firely API (real)' }, paths: { '/calendar': {} } } });
    if (route.request().url().endsWith('/resolve-area') && hold) return;
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/#/asistente');
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('Arteaga marzo 2021');
  await page.getByRole('button', { name: 'Enviar consulta', exact: true }).click();
  await page.getByRole('button', { name: 'Detener consulta', exact: true }).click();
  await expect(page.getByText('Consulta detenida', { exact: true })).toBeVisible();
  hold = false;
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('Coahuila 2021');
  await page.getByRole('button', { name: 'Enviar consulta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reintentar consulta', exact: true })).toBeVisible();
});
