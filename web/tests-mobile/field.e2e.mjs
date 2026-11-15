import { test, expect } from '@playwright/test';

// Controlled API responses are test fixtures, never part of the app bundle.
const api = 'https://firely-test.invalid/api';
const calendar = {
  attribution: 'NASA FIRMS', methodology_version: '1.2-fixture', data_cutoff: '2021-12-31',
  reference: 'median', mock: false,
  rows: [{ year: 2021, month: 3, count_harm: 42, frp_harm: 21, anomaly_ratio: 2, percentile: .9, is_estimated: false }],
};
async function connect(page) {
  await page.goto('/#/campo?from=2021-01-01&to=2021-12-31');
  await page.getByLabel('Dirección pública de la API').fill(api);
  await page.getByRole('button', { name: 'Comprobar y conectar', exact: true }).click();
  await expect(page.getByText(`API activa: ${api}`, { exact: true })).toBeVisible();
}

test('checks remote connection, persists a download across reload, opens it offline and deletes it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let offline = false;
  await page.route(`${api}/**`, async route => {
    if (offline) return route.abort('internetdisconnected');
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/openapi.json')) return route.fulfill({ json: { info: { title: 'Firely API (real)' }, paths: { '/calendar': {} } } });
    if (url.pathname.endsWith('/calendar')) return route.fulfill({ json: calendar });
    return route.fulfill({ status: 503, json: { detail: { code: 'fixture_unavailable' } } });
  });
  await connect(page);
  await page.getByRole('button', { name: 'Guardar área para campo', exact: true }).click();
  await expect(page.getByText('Área guardada. Puedes consultar sus datos sin señal.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir área', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir área', exact: true })).toBeVisible();
  offline = true;
  await page.getByRole('button', { name: 'Abrir área', exact: true }).click();
  await expect(page.getByText('Datos de campo · no son condiciones actuales', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/firely-main-mobile-explorer.png', fullPage: true });
  await page.getByRole('button', { name: 'Campo', exact: true }).click();
  await expect(page.getByText('NASA FIRMS · v1.2-fixture · Datos hasta: 2021-12-31', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/firely-main-mobile-field.png', fullPage: true });
  await page.getByRole('button', { name: 'Borrar descarga', exact: true }).click();
  await page.getByRole('button', { name: 'Borrar descarga?', exact: true }).click();
  await expect(page.getByText('Todavía no tienes áreas descargadas.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('rejects a simulated backend and retains the configuration screen', async ({ page }) => {
  await page.route(`${api}/**`, route => route.fulfill({ json: { info: { title: 'Firely API (mock)' }, paths: { '/calendar': {} } } }));
  await page.goto('/#/campo');
  await page.getByLabel('Dirección pública de la API').fill(api);
  await page.getByRole('button', { name: 'Comprobar y conectar', exact: true }).click();
  await expect(page.getByText('La API está en modo simulado.', { exact: false })).toBeVisible();
  await expect(page.getByText('API activa: —', { exact: true })).toBeVisible();
});
