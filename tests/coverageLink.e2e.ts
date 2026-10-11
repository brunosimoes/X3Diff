import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const settled = (page: Page) =>
  expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
const fixture = (name: string) => ({
  name,
  mimeType: 'application/xml',
  buffer: readFileSync(new URL(`../fixtures/incomplete/${name}`, import.meta.url)),
});

test('the register says how many node types are compared and links the list', async ({ page }) => {
  await page.goto('app.html?example=example');
  await settled(page);
  const link = page.locator('#coverage-link');
  await expect(link).toHaveText(/^Compares \d+ X3D node types — see the list$/);
  const count = Number(/\d+/.exec((await link.textContent())!)![0]);

  // The number is the catalog's own: the exported report lists exactly that many node types.
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  await page.locator('[data-export="json"]').click();
  const report = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(report.catalog.supportedNodes).toHaveLength(count);
  expect(count).toBeGreaterThan(40);

  // Reachable from the keyboard, with a visible focus ring.
  await page.locator('#export').focus();
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  expect(await link.evaluate((a) => getComputedStyle(a).outlineStyle)).not.toBe('none');

  // It opens the coverage page of this site in a new tab, leaving the comparison in place.
  const opened = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const coverage = await opened;
  const errors: string[] = [];
  coverage.on('pageerror', (e) => errors.push(e.message));
  await coverage.waitForLoadState();
  expect(new URL(coverage.url()).pathname).toBe(
    new URL('coverage.html', new URL('app.html', page.url())).pathname,
  );
  await expect(coverage).toHaveTitle(/What is compared/);
  await expect(coverage.locator('#node-count')).toHaveText(String(count));
  await expect(coverage.locator('.node-list li')).toHaveCount(count);
  expect((await coverage.locator('.node-list li').allTextContents()).sort()).toEqual(
    [...report.catalog.supportedNodes].sort(),
  );
  await expect(coverage.locator('.node-list')).toContainText('DirectionalLight');
  await expect(coverage.locator('main')).not.toContainText('%X3D');
  await coverage.setViewportSize({ width: 375, height: 812 });
  expect(await coverage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await coverage.getByRole('link', { name: /Open app/ }).click();
  await expect(coverage).toHaveURL(/app\.html$/);
  expect(errors).toEqual([]);
  await expect(page.locator('#change-count')).toHaveText('7');
});

test('the link sits beside the status badge, at desktop and phone width', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('app.html');
    await page.locator('#before-file').setInputFiles(fixture('before.x3d'));
    await page.locator('#after-file').setInputFiles(fixture('after.x3d'));
    await settled(page);
    await expect(page.locator('#report-status')).toHaveText('Incomplete');
    await expect(page.locator('#coverage-link')).toBeVisible();
    const badge = (await page.locator('#report-status').boundingBox())!;
    const link = (await page.locator('#coverage-link').boundingBox())!;
    expect(link.x).toBeGreaterThan(badge.x + badge.width);
    expect(Math.abs(link.y + link.height / 2 - (badge.y + badge.height / 2))).toBeLessThan(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
});
