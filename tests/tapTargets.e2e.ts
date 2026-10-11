import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const MINIMUM = 40;
const settled = async (page: Page) => {
  await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#stage-busy')).toBeHidden();
};
/**
 * Every visible control a finger can hit, with its smaller dimension. A checkbox is measured
 * by the label that wraps it, which is what is tapped.
 */
const tooSmall = (page: Page, minimum = MINIMUM) =>
  page.evaluate((min) => {
    const found: string[] = [];
    for (const control of Array.from(
      document.querySelectorAll<HTMLElement>(
        '#app button, #app a[href], #app select, #app summary, #app input, #app [role=tab]',
      ),
    )) {
      const input = control as HTMLInputElement;
      const target =
        control.tagName === 'INPUT' && (input.type === 'checkbox' || input.type === 'radio')
          ? (control.closest('label') ?? control)
          : control;
      if (!target.checkVisibility({ visibilityProperty: true })) continue;
      const box = target.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (Math.min(box.width, box.height) < min - 0.5)
        found.push(
          `${control.tagName.toLowerCase()}${control.id ? `#${control.id}` : ''}.${control.className} "${(control.getAttribute('aria-label') ?? control.textContent ?? '').trim().slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`,
        );
    }
    return found;
  }, minimum);
const fits = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const upload = (name: string, text: string) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(text),
});
const incomplete = (name: string) =>
  readFileSync(new URL(`../fixtures/incomplete/${name}`, import.meta.url), 'utf8');

for (const width of [375, 320])
  test(`every control is at least ${MINIMUM}px at ${width}px and nothing overflows sideways`, async ({
    page,
  }) => {
    const check = async (state: string) => {
      expect(await tooSmall(page), `controls under ${MINIMUM}px: ${state}`).toEqual([]);
      expect(await fits(page), `no sideways overflow: ${state}`).toBe(true);
    };
    await page.setViewportSize({ width, height: 812 });
    await page.goto('app.html?example=example');
    await settled(page);
    // The sizes the review measured: load icons 27×30, view buttons 28px high.
    for (const control of [
      '#load-before',
      '#load-after',
      '[data-view="before"]',
      '[data-view="diff"]',
      '[data-view="after"]',
    ]) {
      const box = (await page.locator(control).boundingBox())!;
      expect(Math.min(box.width, box.height), control).toBeGreaterThanOrEqual(MINIMUM);
    }
    await check('register');

    // Menus and panels opened from the header and the toolbar.
    await page.locator('#demo-trigger').click();
    await check('examples menu');
    await page.keyboard.press('Escape');
    await page.locator('#export').click();
    await check('export menu');
    await page.keyboard.press('Escape');
    await page.locator('#settings-trigger').click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    await check('settings');
    await page.locator('#settings-close').click();
    await page.locator('#analysis-customize').click();
    await check('customize tabs');
    await page.locator('#analysis-customize').click();

    // The other analysis views of a small pair.
    for (const tab of ['sections', 'volume', 'deviation']) {
      await page.locator(`#analysis-tab-${tab}`).click();
      await expect(page.locator(`#analysis-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
      await check(`${tab} view`);
    }
    await page.locator('#analysis-tab-differences').click();
    // The Before and After views of the scene.
    await page.locator('[data-view="before"]').click();
    await check('Before view');

    // An animated example: one more scene action, a folded line and the Motion paths view.
    await page.goto('app.html?example=brickhaven');
    await settled(page);
    await page.locator('#changes .bundle-toggle').click();
    await check('showcase register with an open bundle');
    await page.locator('[data-view="after"]').click();
    await expect(page.locator('#motion')).toBeVisible();
    await check('showcase After view');
    await page.locator('#analysis-tab-motion').click();
    await check('motion view');

    // The reviewer's own files: one side loaded, then an incomplete comparison.
    await page
      .locator('#before-file')
      .setInputFiles(upload('pump-v1.x3d', incomplete('before.x3d')));
    await expect(page.locator('#stage-next')).toBeVisible();
    await check('one file loaded');
    await page.locator('#after-file').setInputFiles(upload('pump-v2.x3d', incomplete('after.x3d')));
    await settled(page);
    await expect(page.locator('#incomplete-banner')).toBeVisible();
    await check('incomplete comparison');

    // A file that cannot be read leaves the empty stage with its two buttons.
    await page.goto('app.html?example=example');
    await settled(page);
    await page.locator('#before-file').setInputFiles({
      name: 'wrong.x3d',
      mimeType: 'application/xml',
      buffer: Buffer.from([0xff, 0xff]),
    });
    await expect(page.locator('#stage-empty')).toBeVisible();
    await check('empty stage');
  });

test('desktop controls keep their compact size', async ({ page }) => {
  await page.goto('app.html?example=example');
  await settled(page);
  const before = (await page.locator('[data-view="before"]').boundingBox())!;
  expect(before.height).toBeLessThan(MINIMUM);
  // One toolbar row: the view switch and the scene actions share it.
  const actions = (await page.locator('.scene-actions').boundingBox())!;
  expect(Math.abs(actions.y + actions.height / 2 - (before.y + before.height / 2))).toBeLessThan(8);
});
