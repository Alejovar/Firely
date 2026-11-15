import { test, expect } from '@playwright/test';

test('la web conectada recibe respuestas reales de la API', async ({ page, request }) => {
  const response = await request.get('/api/calendar?bbox=-100.9,25.2,-100.2,25.7&from=2021-03-01&to=2021-03-31');
  expect(response.ok()).toBe(true);
  const calendar = await response.json();
  expect(calendar.mock).not.toBe(true);
  expect(Array.isArray(calendar.rows)).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Calendario de actividad', exact: true })).toBeVisible();
});

test('cambiar el hash, volver y avanzar mantiene la pantalla sincronizada', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Calendario de actividad', exact: true })).toBeVisible();
  await page.evaluate(() => { location.hash = '/asistente'; });
  await expect(page.getByRole('heading', { name: 'Consulta los incendios con claridad' })).toBeVisible();
  await page.evaluate(() => { location.hash = '/metodo'; });
  await expect(page.getByRole('heading', { name: 'En 2012 el fuego no aumentó de golpe. Cambió el satélite.' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Consulta los incendios con claridad' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'En 2012 el fuego no aumentó de golpe. Cambió el satélite.' })).toBeVisible();
});

test('navegar desde el menú crea historial para el botón Atrás', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByText('Asistente', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Consulta los incendios con claridad' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Calendario de actividad', exact: true })).toBeVisible();
});
