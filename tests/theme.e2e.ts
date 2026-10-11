import { test, expect, type Page } from '@playwright/test';

const settled = (page: Page) =>
  expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
/** Light or dark, judged by the page background actually painted. */
const background = (page: Page) =>
  page.evaluate(() => {
    // The page colour is on the body in the workbench and on the root element in the landing page.
    const painted = [document.body, document.documentElement]
      .map((element) => getComputedStyle(element).backgroundColor)
      .find((colour) => !/, 0\)$|transparent/.test(colour))!;
    const [r, g, b] = painted.match(/\d+/g)!.map(Number);
    return (r + g + b) / 3 > 128 ? 'light' : 'dark';
  });

test('a first visit from the landing page opens the workbench in the same light theme', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  expect(await page.evaluate(() => localStorage.getItem('x3diff-theme'))).toBeNull();
  expect(await background(page)).toBe('light');
  await page.getByRole('link', { name: /Try a comparison/ }).click();
  await settled(page);
  expect(await theme(page)).toBe('light');
  expect(await background(page)).toBe('light');
  await expect(page.locator('#theme')).toHaveAttribute('aria-label', 'Switch to dark mode');
  await expect(page.locator('#theme')).toHaveAttribute('aria-pressed', 'false');
  // Opening it does not record a choice: the next visit still follows the system.
  expect(await page.evaluate(() => localStorage.getItem('x3diff-theme'))).toBeNull();
});

test('the system preference decides a first visit, and a saved choice outlasts it', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('app.html?example=example');
  await settled(page);
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('dark');
  await expect(page.locator('#theme')).toHaveAttribute('aria-pressed', 'true');

  // The theme button records a choice, by keyboard too, and it wins from then on.
  await page.locator('#theme').focus();
  await page.keyboard.press('Enter');
  expect(await theme(page)).toBe('light');
  await page.reload();
  await settled(page);
  expect(await theme(page)).toBe('light');
  expect(await background(page)).toBe('light');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#theme').click();
  expect(await theme(page)).toBe('dark');
  await page.goto('./');
  await page
    .getByRole('link', { name: /Open app/ })
    .first()
    .click();
  await settled(page);
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('dark');
});
