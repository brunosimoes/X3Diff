import { test, expect } from '@playwright/test';

test('surface deviation supports both directions and reuses its renderer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/app.html');
  await page.locator('#demo-trigger').click();
  await page.locator('[data-demo="dolphin"]').click();
  await expect(page.locator('#analysis-tab-deviation')).toBeVisible();
  await expect(page.locator('#surface-deviation canvas')).toHaveCount(0);
  await page.locator('#analysis-tab-deviation').click();
  await expect(page.locator('#surface-deviation .surface-stats')).toContainText('Sampled max');
  await expect(page.locator('#surface-deviation canvas')).toBeVisible();
  const reference = await page.locator('#surface-deviation .surface-stats').textContent();
  await page.locator('#surface-deviation .surface-direction').selectOption('1');
  await expect(page.locator('#surface-deviation .surface-stats')).not.toHaveText(reference!);
  await expect(page.getByRole('tab')).toHaveText([
    'File differences',
    'Slice & measure',
    'Volume differences',
    'Surface deviation',
  ]);
  await page.locator('#analysis-tab-sections').click();
  await expect(page.locator('#section-measure')).toBeHidden();
  await expect(page.getByText('Click two outline points to measure', { exact: true })).toHaveCount(
    1,
  );
  await page.locator('#analysis-tab-deviation').click();
  await expect(page.locator('#surface-deviation canvas')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
