import { test, expect } from '@playwright/test';

test('el prototipo funciona sin API y conserva filtros, fichas y navegación', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4173/') ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByText('8 puntos ·')).toBeVisible();
  await page.getByRole('button', { name: 'Últimas 48 h', exact: true }).click();
  await expect(page.getByText('12 puntos ·')).toBeVisible();
  const lastPoint = page.getByRole('button', { name: 'Seleccionar detección simulada 12', exact: true });
  await lastPoint.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Punto de ejemplo 12' })).toBeVisible();
  await expect(lastPoint).toBeFocused();
  await page.getByRole('button', { name: 'Ver ficha de ejemplo' }).click();
  await expect(page.getByRole('dialog')).toContainText('46 horas');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Últimas 24 h', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Punto de ejemplo 01' })).toBeVisible();
  await page.getByRole('button', { name: 'Límite ilustrativo' }).click();
  await expect(page.getByTestId('area-outline')).toHaveCount(0);
  await page.getByRole('link', { name: 'Calendario', exact: true }).click();
  await page.getByRole('button', { name: 'Mar 2021:', exact: false }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mar 2021' })).toContainText('Selección de prueba');
  await page.getByRole('link', { name: 'Análisis', exact: true }).click();
  await expect(page.getByText('Gráfica decorativa', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Asistente', exact: true }).click();
  await page.getByRole('button', { name: '¿Qué pasa en la Sierra de Arteaga?' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'no hay un modelo de IA conectado' })).toBeVisible();
  await page.goto('/#desconocida');
  await expect(page.getByRole('heading', { name: 'Explora el territorio.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('la app se adapta a móvil estrecho y escritorio sin desbordar la página', async ({ page }) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Calendario', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/firely-mobile.png', fullPage: true });
});
