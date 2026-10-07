import { expect, test, type Page } from '@playwright/test';

async function loadPair(page: Page, before: string, after: string) {
  await page.goto('/app.html');
  for (const [side, xml] of [
    ['before', before],
    ['after', after],
  ]) {
    await page.locator(`#${side}-file`).setInputFiles({
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(xml),
    });
  }
  await expect(page.locator('#global-status')).toHaveText('');
}
const scene = (body: string) => `<X3D version="3.3"><Scene>${body}</Scene></X3D>`;

test('selected volume pairs expose measured relocation, growth and empty regions', async ({
  page,
}, testInfo) => {
  await loadPair(
    page,
    scene(
      '<Transform DEF="Placement"><Shape DEF="Moved"><Box size="2 2 2"/></Shape></Transform><Transform translation="5 0 0"><Shape DEF="Grown"><Box size="2 2 2"/></Shape></Transform>',
    ),
    scene(
      '<Transform DEF="Placement" translation="1 0 0"><Shape DEF="Moved"><Box size="2 2 2"/></Shape></Transform><Transform translation="5 0 0"><Shape DEF="Grown"><Box size="4 2 2"/></Shape></Transform>',
    ),
  );
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#volume-status')).toHaveText('Moved');
  await expect(page.locator('[data-region="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#volume-summary .volume-metric strong')).toHaveText(['4', '4', '4']);
  await expect(page.locator('.volume-totals')).toContainText(
    'Before 8 → After 8 · Net 0 · Changed space 8',
  );
  await expect(page.locator('.volume-retained')).toHaveText('50% of original volume retained');
  await page.screenshot({ path: testInfo.outputPath('volume-review.png'), fullPage: true });
  await page.locator('[data-volume-region="after"]').click();
  await expect(page.locator('[data-region="after"]')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (document.querySelector('#volume-viewer x3d-canvas') as any).browser
          .currentScene;
        return ['BEFORE_ONLY', 'SHARED', 'AFTER_ONLY'].map((name) =>
          scene.getNamedNode(`X3DIFF_${name}_VISIBILITY`).whichChoice.valueOf(),
        );
      }),
    )
    .toEqual([-1, -1, 0]);
  await page.locator('#volume-context').uncheck();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (document.querySelector('#volume-viewer x3d-canvas') as any).browser.currentScene
          .getNamedNode('X3DIFF_BEFORE_CONTEXT_VISIBILITY')
          .whichChoice.valueOf(),
      ),
    )
    .toBe(-1);
  await page.locator('#volume-object').selectOption({ label: 'Grown' });
  await expect(page.locator('#volume-status')).toHaveText('Grown');
  await expect(page.locator('#volume-summary .volume-metric strong')).toHaveText(['0', '8', '8']);
  await expect(page.locator('.volume-totals')).toContainText('Net +8');
  await page.locator('[data-region="before"]').click();
  await expect(page.locator('#volume-empty')).toHaveText(
    'No before-only volume at this resolution.',
  );
  await page.locator('#volume-detail').selectOption('low');
  await page.locator('#settings-trigger').click();
  await expect(page.locator('#volume-resolution')).toHaveValue('low');
  await page.locator('#settings-close').click();
  await page.locator('#analysis-tab-sections').click();
  await expect(page.locator('#section-object')).toHaveValue('1');
  await page.locator('#analysis-tab-differences').click();
  await page
    .locator('.change-row')
    .filter({ hasText: 'Translation' })
    .locator('.object-link')
    .click();
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#volume-status')).toHaveText('Moved');
  await expect(page.locator('#volume-object')).toHaveValue('0');
});

test('file presence states, expansion, highlighting and focus are separate interactions', async ({
  page,
}, testInfo) => {
  await page.goto('/app.html?example=fitlab');
  await expect(page.locator('#global-status')).toHaveText('');
  await page.locator('#analysis-tab-differences').click();
  const removed = page.locator('.change-row').filter({ hasText: 'OldSupport' });
  const added = page.locator('.change-row').filter({ hasText: 'NewSensor' });
  await expect(removed.locator('.change-action')).toHaveText('− Removed');
  await expect(removed.getByRole('img', { name: 'Present before', exact: true })).toBeVisible();
  await expect(removed.getByRole('img', { name: 'Absent after', exact: true })).toBeVisible();
  await expect(added.getByRole('img', { name: 'Absent before', exact: true })).toBeVisible();
  await expect(added.getByRole('img', { name: 'Present after', exact: true })).toBeVisible();
  const group = page.locator('.object-group').filter({ has: removed });
  await group.locator('.group-toggle').click();
  await expect(group.locator('.group-heading')).toHaveClass(/selected/);
  await expect(group.locator('.group-expand')).toHaveAttribute('aria-expanded', 'true');
  await group.locator('.group-expand').click();
  await expect(removed).toBeHidden();
  await expect(group.locator('.group-heading')).toHaveClass(/selected/);
  await group.locator('.group-expand').press('Enter');
  await expect(removed).toBeVisible();
  await removed.locator('.object-link').click();
  await expect(page.locator('#focus-selection')).toBeEnabled();
  const position = () =>
    page.evaluate(() => {
      const browser = (document.querySelector('#viewer-diff x3d-canvas') as any).browser;
      const position = browser.getActiveLayer().getViewpoint().getUserPosition();
      return [position.x, position.y, position.z];
    });
  const initial = await position();
  await page.locator('#focus-selection').click();
  await expect(page.locator('#selection')).not.toContainText('no supported static geometry');
  await expect.poll(position).not.toEqual(initial);
  await expect(page.locator('.revision-value.after .component-changed')).toContainText('X 0.85');
  await page.screenshot({ path: testInfo.outputPath('file-review.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#volume-summary')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-volume-review.png'), fullPage: true });
});

test('long values expand in bounded pages without changing object selection', async ({ page }) => {
  const times = Array.from({ length: 205 }, (_, i) => i / 204).join(' ');
  const values = Array.from({ length: 205 }, (_, i) => i).join(' ');
  const revised = Array.from({ length: 205 }, (_, i) => i + 1).join(' ');
  await loadPair(
    page,
    scene(`<ScalarInterpolator DEF="Curve" key="${times}" keyValue="${values}"/>`),
    scene(`<ScalarInterpolator DEF="Curve" key="${times}" keyValue="${revised}"/>`),
  );
  const details = page.locator('.revision-value.after .value-details');
  await details.locator('summary').click();
  await expect(details.locator('.value-pages')).toContainText('1–100 of 205');
  await expect(page.locator('.change-row.selected')).toHaveCount(0);
  await details.getByRole('button', { name: 'Next' }).click();
  await expect(details.locator('.value-pages')).toContainText('101–200 of 205');
  await details.getByRole('button', { name: 'Next' }).click();
  await expect(details.locator('.value-pages')).toContainText('201–205 of 205');
  await expect(details.getByRole('button', { name: 'Next' })).toBeDisabled();
});
