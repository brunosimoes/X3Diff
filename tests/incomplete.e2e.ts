import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/incomplete/${name}`, import.meta.url));
const input = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/xml', buffer });
const loadPair = async (page: Page, before: Buffer, after: Buffer) => {
  await page.locator('#before-file').setInputFiles(input('pump-v1.x3d', before));
  await page.locator('#after-file').setInputFiles(input('pump-v2.x3d', after));
};
const banner = '#incomplete-banner';
const bannerInViewport = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('#incomplete-banner')!.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && box.height > 0;
  });

test('an incomplete comparison shows its differences under a persistent notice', async ({
  page,
}) => {
  await page.goto('app.html');
  await loadPair(page, fixture('before.x3d'), fixture('after.x3d'));

  await expect(page.locator(banner)).toBeVisible();
  await expect(page.locator(banner)).toContainText(
    'Incomplete comparison: some content was not compared',
  );
  await expect(page.locator('#incomplete-list li')).toHaveText([
    'Before file (pump-v1.x3d): 1 element of unsupported type (Fog × 1)',
    'After file (pump-v2.x3d): 1 element of unsupported type (Fog × 1)',
  ]);
  await expect(page.locator('#global-status')).toHaveClass(/error/);
  await expect(page.locator('#global-status')).toContainText('Incomplete comparison');
  await expect(page.locator('#report-status')).toHaveText('Incomplete');
  await expect(page.locator('#change-count')).toHaveText('10 · partial');
  await expect(page.locator('#summary .partial-note')).toContainText('Partial counts');
  await expect(page.locator('#changes .change-row')).toHaveCount(10);
  await expect(page.locator('#changes')).toContainText('Translation');
  await expect(page.locator('#legend')).toContainText('No difference found');
  await expect(page.locator('#legend')).not.toContainText('Unchanged');

  // The notice follows the reader down the register (a short window forces scrolling).
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('#changes .change-row')).at(-1)!.scrollIntoView(false),
  );
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect.poll(() => bannerInViewport(page)).toBe(true);

  // Analysis views stay available and keep the notice above them.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#volume-status')).toContainText('Box');
  await expect(page.locator(banner)).toBeVisible();
  await page.locator('#analysis-tab-differences').click();

  // The exported report says the same thing in schema 1.0 fields.
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  await page.locator('[data-export="json"]').click();
  const report = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
  expect(report.schemaVersion).toBe('1.0');
  expect(report.summary.status).toBe('incomplete');
  expect(report.summary.unsupportedCount).toBeGreaterThan(0);
  expect(report.changes).toHaveLength(10);
  expect(
    report.diagnostics
      .filter((d: { code: string }) => d.code === 'UNSUPPORTED_NODE')
      .map((d: { side: string; message: string }) => `${d.side}: ${d.message}`),
  ).toEqual([
    'before: Fog is opaque; its fields were not compared: color, visibilityRange',
    'after: Fog is opaque; its fields were not compared: color, visibilityRange',
  ]);
  // One skipped element in each file is one entry each, not one per setting.
  expect(report.summary.unsupportedCount).toBe(2);

  // Phone width: the notice still follows the register and nothing overflows sideways.
  await page.setViewportSize({ width: 375, height: 812 });
  await loadPair(page, fixture('before.x3d'), fixture('after.x3d'));
  await expect(page.locator(banner)).toBeVisible();
  await expect(page.locator('#change-count')).toHaveText('10 · partial');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('#changes .change-row')).at(-1)!.scrollIntoView(false),
  );
  await expect.poll(() => bannerInViewport(page)).toBe(true);
  expect(
    await page.evaluate(
      () => document.querySelector('#incomplete-banner')!.getBoundingClientRect().height,
    ),
  ).toBeLessThan(812 / 3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('nothing found in an incomplete comparison is not reported as "no differences"', async ({
  page,
}) => {
  await page.goto('app.html');
  // Only the uncatalogued node differs, so the engine finds nothing it can vouch for.
  const before = fixture('before.x3d');
  const after = Buffer.from(
    before.toString('utf8').replace('visibilityRange="40"', 'visibilityRange="12"'),
  );
  await loadPair(page, before, after);
  await expect(page.locator(banner)).toBeVisible();
  await expect(page.locator('#global-status')).toContainText('Incomplete comparison');
  await expect(page.locator('#global-status')).not.toContainText('No differences found');
  await expect(page.locator('#change-count')).toHaveText('0 · partial');
  await expect(page.locator('#changes')).toContainText(
    'No differences found in the content that was compared. This is not a full check',
  );
  await expect(page.locator('#legend')).toContainText('No difference found');
});

test('a failed comparison shows no register and no partial notice', async ({ page }) => {
  await page.goto('app.html');
  await loadPair(page, Buffer.from('<X3D version="3.3"><Scene><Shape>'), fixture('after.x3d'));
  await expect(page.locator('#global-status')).toHaveText(
    'Comparison failed: Before file (pump-v1.x3d): not well-formed XML (unclosed xml tag(s): X3D, Scene, Shape)',
  );
  // The one problem is noted once under the workspace, not as "(2 declarations)".
  await expect(page.locator('#diagnostics .diagnostic').first()).toHaveText(
    'Before: not well-formed XML (unclosed xml tag(s): X3D, Scene, Shape)',
  );
  await expect(page.locator('#diagnostics')).not.toContainText('declarations)');
  await expect(page.locator('.analysis-panel')).toBeHidden();
  await expect(page.locator(banner)).toBeHidden();
  await expect(page.locator('#changes .change-row')).toHaveCount(0);
});

test('a complete comparison carries no partial marking', async ({ page }) => {
  await page.goto('app.html?example=example');
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('.analysis-panel')).toBeVisible();
  await expect(page.locator(banner)).toBeHidden();
  await expect(page.locator('#change-count')).not.toContainText('partial');
  await expect(page.locator('#summary .partial-note')).toHaveCount(0);
  await expect(page.locator('#legend')).toContainText('Unchanged');
});
