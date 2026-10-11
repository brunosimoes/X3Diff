import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = (name: string) => ({
  name,
  mimeType: 'application/xml',
  buffer: readFileSync(new URL(`../fixtures/refactor/${name}`, import.meta.url)),
});

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['phone', { width: 375, height: 812 }],
] as const)
  test(`category filter shows every count as "Name · n" (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('app.html');
    await page.locator('#before-file').setInputFiles(fixture('before.x3d'));
    await page.locator('#after-file').setInputFiles(fixture('after.x3d'));
    await expect(page.locator('#global-status')).toHaveText('');
    const options = page.locator('#category option');
    await expect(options).toHaveText(['All categories · 6', 'Document · 1', 'Identifiers · 5']);
    for (const text of await options.allTextContents()) expect(text).not.toMatch(/[()]/);

    await page.locator('#category').selectOption({ label: 'Identifiers · 5' });
    await expect(page.locator('#changes .change-row')).toHaveCount(5);
    // The chosen entry fits inside the control and the page does not scroll sideways.
    expect(
      await page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('#category')!;
        const probe = document.createElement('span');
        probe.style.cssText = `font:${getComputedStyle(select).font};visibility:hidden;position:absolute;white-space:nowrap`;
        probe.textContent = select.selectedOptions[0].textContent;
        document.body.append(probe);
        const fits =
          probe.getBoundingClientRect().width + 30 <= select.getBoundingClientRect().width;
        probe.remove();
        return fits && document.documentElement.scrollWidth <= innerWidth + 1;
      }),
    ).toBe(true);
  });
