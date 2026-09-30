import { test, expect } from '@playwright/test';

test('landing page is responsive and opens a working example', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/X3Diff — Understand/);
  await expect(page.locator('#abstract')).toContainText('What problem does this tool solve?');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: /Try a comparison/ }).click();
  await expect(page).toHaveURL(/app.html\?example=example/);
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#analysis-tab-differences')).toBeVisible();
  await expect(page.locator('#viewer-diff x3d-canvas')).toBeVisible();
  await page.getByRole('link', { name: 'About X3Diff' }).click();
  await expect(page.locator('h1')).toContainText('Decide with evidence');
  expect(errors).toEqual([]);
});
