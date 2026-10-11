import { test, expect } from '@playwright/test';

// Every analysis view keeps one short limit in sight and folds the full text away.
const views = [
  [
    'sections',
    '#linked-sections',
    'Outlines are cut where the objects sit in the file',
    'Section dimensions are extents, not surface distances.',
  ],
  [
    'volume',
    '#volume-overlap',
    'Volumes describe the space this one object occupies',
    'Equal lost and gained volume can indicate relocation.',
  ],
  [
    'deviation',
    '#surface-deviation',
    'Distances are sampled once per triangle',
    'maximum is sampled, not an exact worst case',
  ],
  [
    'motion',
    '#motion-paths',
    'Paths follow one point of the object through declared animation',
    'Each revision uses its longest contributing clock interval and 240 sampling intervals',
  ],
] as const;

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['phone', { width: 375, height: 812 }],
] as const)
  test(`limits are one line plus a closed, keyboard-operable disclosure (${label})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('app.html?example=brickhaven');
    await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
    for (const [tab, panel, short, full] of views) {
      await page.locator(`#analysis-tab-${tab}`).click();
      const view = page.locator(panel);
      await expect(view).toBeVisible();
      if (tab === 'deviation')
        await expect(view.locator('.surface-status')).toContainText('Hover to inspect');
      if (tab === 'volume') await expect(page.locator('#volume-summary')).toBeVisible();
      // One short line is in sight; the long text is there but folded.
      await expect(view.locator('.limit-line')).toHaveCount(1);
      await expect(view.locator('.limit-line')).toBeVisible();
      await expect(view.locator('.limit-line')).toContainText(short);
      expect((await view.locator('.limit-line').textContent())!.length).toBeLessThan(110);
      const details = view.locator('details.limits');
      const summary = details.locator('summary');
      await expect(details).toHaveCount(1);
      await expect(details).not.toHaveAttribute('open', '');
      await expect(summary).toHaveText('Limits of this measurement');
      await expect(details.locator('p').first()).toBeHidden();
      await expect(details).toContainText(full);
      // Keyboard: it takes focus, shows it, and opens and closes with Enter.
      await summary.focus();
      // Leave and come back with the keyboard, so the focus ring is the keyboard one.
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(summary).toBeFocused();
      expect(
        await summary.evaluate((element) => getComputedStyle(element).outlineStyle !== 'none'),
      ).toBe(true);
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await expect(details.locator('p').first()).toBeVisible();
      await expect(details.locator('p').first()).toContainText(full);
      if (tab === 'volume') await expect(page.locator('#volume-method')).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    }
  });
