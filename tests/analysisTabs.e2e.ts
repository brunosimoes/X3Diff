import { expect, test, type Page } from '@playwright/test';

async function compare(page: Page, geometry = true) {
  for (const [side, n] of [
    ['before', 2],
    ['after', 4],
  ] as const) {
    const xml = `<X3D version="3.3" profile="Interchange"><Scene><Shape DEF="Block"><Appearance><Material diffuseColor="${n / 4} 0 0"/></Appearance><Box size="${geometry ? n : 2} 2 2"/></Shape></Scene></X3D>`;
    await page.locator(`#${side}-file`).setInputFiles({
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(xml),
    });
  }
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('.review-workspace')).toBeVisible();
  await expect(page.locator('#global-status')).toHaveText('');
}

test('tabs hide unavailable data and restore the preferred view when data returns', async ({
  page,
}) => {
  await page.goto('/app.html');
  await expect(page.locator('.analysis-panel')).toBeHidden();
  await compare(page);
  await expect(page.locator('#analysis-tab-differences')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab').nth(2)).toHaveText('Volume differences');
  await expect(page.locator('#section-3d canvas')).toHaveCount(0);
  await page.locator('#analysis-tab-differences').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#analysis-tab-sections')).toBeFocused();
  await expect(page.locator('#linked-sections')).toBeVisible();
  await expect(page.locator('.report-panel')).toBeHidden();
  await compare(page, false);
  await expect(page.locator('#analysis-tab-sections')).toHaveCount(0);
  await expect(page.locator('#linked-sections')).toBeHidden();
  await expect(page.locator('#analysis-tab-differences')).toHaveAttribute('aria-selected', 'true');
  await compare(page);
  await expect(page.locator('#analysis-tab-sections')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#section-3d canvas')).toHaveCount(1);
});

test('tab customization is persistent, resettable, and keyboard accessible', async ({ page }) => {
  await page.goto('/app.html');
  await compare(page);
  await page.locator('#analysis-customize').click();
  await expect(page.getByRole('checkbox', { name: 'Show File differences' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move Slice & measure earlier' }).click();
  await expect(page.getByRole('tab').first()).toHaveText('Slice & measure');
  await page.getByRole('checkbox', { name: 'Show Slice & measure' }).uncheck();
  await expect(page.locator('#analysis-tab-sections')).toHaveCount(0);
  await page.reload();
  await compare(page);
  await expect(page.locator('#analysis-tab-sections')).toHaveCount(0);
  await page.locator('#analysis-customize').click();
  await page.getByRole('checkbox', { name: 'Show Slice & measure' }).check();
  await expect(page.getByRole('tab').first()).toHaveText('Slice & measure');
  await page.locator('#analysis-reset').click();
  await expect(page.getByRole('tab').first()).toHaveText('File differences');
  await page.locator('#analysis-reset').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#analysis-options')).toBeHidden();
  await expect(page.locator('#analysis-customize')).toBeFocused();
  await page.locator('#analysis-tab-differences').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#analysis-tab-deviation')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('#analysis-tab-differences')).toBeFocused();
});

test('a registered extension is isolated when activation fails', async ({ page }) => {
  await page.goto('/app.html');
  await page.evaluate(async () => {
    const path = '/src/app/analysisTabs.ts';
    const { AnalysisTabs } = await import(path);
    const host = document.createElement('section'),
      heading = document.createElement('div');
    // Isolated shell exercises the public registry without changing the production registry.
    (document.querySelector('#app') as HTMLElement).hidden = true;
    host.id = 'extension-shell';
    document.body.append(host);
    host.append(heading);
    const registry = new AnalysisTabs(host, heading);
    for (const id of ['differences', 'extension']) {
      const panel = document.createElement('section');
      panel.textContent = id;
      host.append(panel);
      registry.register({
        id,
        label: id,
        description: id,
        panel,
        required: true,
        available: () => true,
        activate: () => {
          if (id === 'extension') throw new Error('Example failure');
        },
      });
    }
    registry.refresh();
  });
  await page.getByRole('tab', { name: 'extension' }).click();
  await expect(page.locator('#extension-shell .analysis-error')).toContainText('Example failure');
  await page.getByRole('tab', { name: 'differences' }).click();
  await expect(page.getByRole('tabpanel')).toBeVisible();
  await expect(page.locator('#extension-shell .analysis-error')).toBeHidden();
});
