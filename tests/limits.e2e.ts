import { test, expect } from '@playwright/test';

for (const width of [1440, 375])
  test(`measurement limits remain available with keyboard controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('app.html?example=brickhaven');
    await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
    for (const id of ['sections', 'volume', 'deviation', 'motion']) {
      await page.locator(`#tab-${id}`).click();
      const details = page.locator('#side details.limits');
      await expect(details).toHaveCount(1);
      await expect(details).not.toHaveAttribute('open', '');
      const summary = details.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await expect(details.locator('p')).toBeVisible();
      expect((await details.locator('p').innerText()).length).toBeGreaterThan(100);
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // On a phone Settings sits with the other occasional actions, behind one button.
    if (width < 900) await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  });
