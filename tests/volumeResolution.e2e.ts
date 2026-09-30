import { test, expect } from '@playwright/test';

test('volume resolution rebuilds curved regions and persists after reload', async ({ page }) => {
  await page.goto('/app.html');
  for (const [side, radius] of [
    ['before', 1],
    ['after', 1.2],
  ] as const) {
    await page.locator(`#${side}-file`).setInputFiles({
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(
        `<X3D version="3.3"><Scene><Shape DEF="Sphere"><Sphere radius="${radius}"/></Shape></Scene></X3D>`,
      ),
    });
  }
  await expect(page.locator('#global-status')).toHaveText('');
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#region button')).toHaveText(['Before only', 'Shared', 'After only']);
  await expect(page.locator('[data-display]')).toHaveCount(0);
  const count = () =>
    page.evaluate(() => {
      try {
        const scene = (document.querySelector('#volume-viewer x3d-canvas') as any).browser
          .currentScene;
        return scene.getNamedNode('X3DIFF_SHARED').geometry.coord.point.length;
      } catch {
        return 0;
      }
    });
  await expect.poll(count).toBeGreaterThan(0);
  const medium = await count();
  for (const region of ['before', 'after', 'shared']) {
    await page.locator('[data-region="' + region + '"]').click();
    await expect(page.locator('[data-region="' + region + '"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await expect(page.locator('#viewer-diff')).toBeVisible();
  await page.locator('#settings-trigger').click();
  await page.locator('#volume-resolution').selectOption('high');
  await expect.poll(count).toBeGreaterThan(medium);
  await page.locator('#volume-resolution').selectOption('low');
  await expect.poll(count).toBeLessThan(medium);
  await expect.poll(count).toBeGreaterThan(0);
  await page.reload();
  await page.locator('#settings-trigger').click();
  await expect(page.locator('#volume-resolution')).toHaveValue('low');
});

test('dolphin mesh volume responds to the resolution setting', async ({ page }) => {
  await page.goto('/app.html?example=dolphin');
  await expect(page.locator('#global-status')).toHaveText('');
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#volume-status')).not.toHaveText('Preparing volume overlap…');
  const points = () =>
    page.evaluate(() => {
      try {
        return (
          document.querySelector('#volume-viewer x3d-canvas') as any
        ).browser.currentScene.getNamedNode('X3DIFF_SHARED').geometry.coord.point.length;
      } catch {
        return 0;
      }
    });
  await expect.poll(points).toBeGreaterThan(0);
  const medium = await points();
  await page.locator('#settings-trigger').click();
  await page.locator('#volume-resolution').selectOption('high');
  await expect.poll(points, { timeout: 30000 }).toBeGreaterThan(medium);
  await expect(page.locator('#volume-status')).not.toContainText('exceeds');
  await page.locator('#volume-resolution').selectOption('low');
  await expect.poll(points, { timeout: 30000 }).toBeLessThan(medium);
  await expect.poll(points).toBeGreaterThan(0);
});
