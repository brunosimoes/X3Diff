import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const file = (name: string, size: number) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(
    `<X3D version="3.3"><Scene><Shape DEF="Block"><Box size="${size} 2 2"/></Shape></Scene></X3D>`,
  ),
});

test('revision icons open file pickers and automatically compare replacements', async ({
  page,
}) => {
  await page.goto('/app.html');
  await expect(page.locator('.inputs')).toHaveCount(0);
  await expect(page.locator('#load-before')).toHaveAttribute('data-state', 'missing');
  await expect(page.locator('#load-after')).toHaveAttribute('data-state', 'missing');
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0);
  const beforeChooser = page.waitForEvent('filechooser');
  await page.locator('#load-before').click();
  await (await beforeChooser).setFiles(file('original.x3d', 2));
  await expect(page.locator('#load-before')).toHaveAttribute('data-state', 'loaded');
  await expect(page.locator('#load-before')).toHaveAttribute('title', /original.x3d/);
  await expect(page.locator('[data-view="before"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.analysis-panel')).toBeHidden();
  const afterChooser = page.waitForEvent('filechooser');
  await page.locator('#load-after').click();
  await (await afterChooser).setFiles(file('revision.x3d', 4));
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#load-after')).toHaveAttribute('data-state', 'loaded');
  await expect(page.locator('.analysis-panel')).toBeVisible();
  await expect(page.locator('#changes')).toContainText('4');
  await page.locator('#after-file').setInputFiles(file('revision.x3d', 6));
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#changes')).toContainText('6');
  await page.locator('#after-file').setInputFiles(file('revision.x3d', 2));
  await expect(page.locator('#global-status')).toHaveText('No differences found.');
  await expect(page.locator('.analysis-panel')).toBeHidden();
  await expect(page.locator('#load-before')).toHaveAttribute('data-state', 'loaded');
  await page.setViewportSize({ width: 845, height: 698 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  mkdirSync('release', { recursive: true });
  await page.screenshot({ path: 'release/revision-loading.png' });
});

test('a failed read leaves its icon missing and replacement recovers automatically', async ({
  page,
}) => {
  await page.goto('/app.html');
  await page.locator('#after-file').setInputFiles(file('after.x3d', 4));
  await page.locator('#before-file').setInputFiles({
    name: 'wrong.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from([0xff, 0xff]),
  });
  await expect(page.locator('#global-status')).toHaveClass(/error/);
  await expect(page.locator('#load-before')).toHaveAttribute('data-state', 'missing');
  await expect(page.locator('#load-after')).toHaveAttribute('data-state', 'loaded');
  await expect(page.locator('#load-before')).toBeVisible();
  await page.locator('#before-file').setInputFiles(file('before.x3d', 2));
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('.analysis-panel')).toBeVisible();
});

test('a superseded file read cannot replace the latest automatic comparison', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (this.name !== 'slow.x3d') return read.call(this);
      return new Promise<ArrayBuffer>((resolve) => {
        (window as any).releaseSlowRead = () => read.call(this).then(resolve);
      });
    };
  });
  await page.goto('/app.html');
  await page.locator('#before-file').setInputFiles(file('before.x3d', 2));
  await page.locator('#after-file').setInputFiles(file('slow.x3d', 99));
  await page.waitForFunction(() => !!(window as any).releaseSlowRead);
  await page.locator('#after-file').setInputFiles(file('latest.x3d', 6));
  await expect(page.locator('#global-status')).toHaveText('');
  await page.evaluate(async () => {
    await (window as any).releaseSlowRead();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await expect(page.locator('#load-after')).toHaveAttribute('title', /latest.x3d/);
  await expect(page.locator('#changes')).toContainText('6');
  await expect(page.locator('#changes')).not.toContainText('99');
  await expect(page.locator('#global-status')).toHaveText('');
});
