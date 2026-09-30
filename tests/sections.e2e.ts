import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('linked sections measure outlines, update plane and survive new examples', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/app.html');
  await page.locator('#demo-trigger').click();
  await page.locator('[data-demo="dolphin"]').click();
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#analysis-tab-sections')).toBeVisible();
  await expect(page.locator('#section-3d canvas')).toHaveCount(0);
  await page.locator('#analysis-tab-sections').click();
  await expect(page.locator('#linked-sections')).toBeVisible();
  await expect(page.locator('#section-3d canvas')).toBeVisible();
  await expect(page.locator('[data-outline="before"]')).toHaveAttribute('d', /M/);
  await expect(page.locator('[data-outline="after"]')).toHaveAttribute('d', /M/);
  await page.locator('#section-2d').click({ position: { x: 100, y: 140 } });
  await page.locator('#section-2d').click({ position: { x: 230, y: 180 } });
  await expect(page.locator('#section-measure')).toContainText('Ruler:');
  await page.locator('#section-axis').selectOption('1');
  await expect(page.locator('#section-level')).toContainText('Y =');
  await expect(page.locator('#section-measure')).not.toContainText('Ruler:');
  await page.locator('#section-position').fill('700');
  const level = await page.locator('#section-level').textContent();
  await page.locator('#section-position').fill('300');
  await expect(page.locator('#section-level')).not.toHaveText(level!);
  await page.locator('#analysis-tab-differences').click();
  await expect(page.locator('#linked-sections')).toBeHidden();
  await page.locator('#analysis-tab-sections').click();
  await expect(page.locator('#section-3d canvas')).toBeVisible();
  await page.locator('#demo-trigger').click();
  await page.locator('[data-demo="fitlab"]').click();
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#section-size')).toContainText('scene units');
  await expect(page.locator('#scene-note')).toBeHidden();
  await expect(page.locator('#section-3d canvas')).toHaveCount(1);
  mkdirSync('release', { recursive: true });
  await page.locator('#linked-sections').screenshot({ path: 'release/linked-sections.png' });
  await page.locator('.analysis-panel').screenshot({ path: 'release/analysis-tabs.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#linked-sections').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('known box dimensions and 3D picking update the linked slice', async ({ page }) => {
  await page.goto('/app.html');
  const xml = (size: number) =>
    `<X3D version="3.3" profile="Interchange"><Scene><Shape DEF="Block"><Box size="${size} 2 2"/></Shape></Scene></X3D>`;
  for (const [side, size] of [
    ['before', 2],
    ['after', 4],
  ] as const) {
    await page.locator(`#${side}-file`).setInputFiles({
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(xml(size)),
    });
  }
  await page.locator('#analysis-tab-sections').click();
  await expect(page.locator('#section-size')).toHaveText(
    'Before: 2 × 2  →  After: 4 × 2 scene units',
  );
  await expect(page.locator('#section-level')).toHaveText('Z = 0');
  await page.locator('#section-3d canvas').click();
  await expect(page.locator('#section-level')).not.toHaveText('Z = 0');
  await expect(page.locator('#section-measure')).toContainText('Point 1:');
  await page.locator('#section-axis').selectOption('0');
  await expect(page.locator('#section-size')).toHaveText(
    'Before: 2 × 2  →  After: 2 × 2 scene units',
  );
  await page.locator('#section-position').fill('900');
  await expect(page.locator('#section-size')).toContainText('Before: no intersection');
  await expect(page.locator('#section-size')).toContainText('After: 2 × 2');
});

test('unsupported concave faces do not offer a sections tab', async ({ page }) => {
  await page.goto('/app.html');
  const xml = (x: number) =>
    `<X3D version="3.3" profile="Interchange"><Scene><Shape DEF="Face"><IndexedFaceSet convex="false" coordIndex="0 1 2 -1"><Coordinate point="0 0 0 ${x} 0 0 0 2 0"/></IndexedFaceSet></Shape></Scene></X3D>`;
  for (const [side, x] of [
    ['before', 2],
    ['after', 3],
  ] as const) {
    await page.locator(`#${side}-file`).setInputFiles({
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(xml(x)),
    });
  }
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('.review-workspace')).toBeVisible();
  await expect(page.locator('#analysis-tab-sections')).toHaveCount(0);
  await expect(page.locator('#linked-sections')).toBeHidden();
  await expect(page.locator('#analysis-tab-differences')).toHaveAttribute('aria-selected', 'true');
});
