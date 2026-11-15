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
  await expect(page.getByRole('heading', { name: '¿Qué lugar quieres explorar?' })).toBeVisible();
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
