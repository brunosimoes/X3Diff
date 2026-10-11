import { test, expect } from '@playwright/test';

test('landing page is responsive and opens a working example', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page).toHaveTitle(/X3Diff — Understand/);
  await expect(page.locator('#abstract')).toContainText('What problem does this tool solve?');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: /Try a comparison/ }).click();
  await expect(page).toHaveURL(/app.html\?example=example/);
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#analysis-tab-differences')).toBeVisible();
  await expect(page.locator('#viewer-diff x3d-canvas')).toBeVisible();
  await page.getByRole('link', { name: 'About X3Diff' }).click();
  await expect(page.locator('h1')).toContainText('Decide with evidence');
  expect(errors).toEqual([]);
});

test('the landing page links the 2021 thread, carries share tags and opens the motion example', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
  // The origin sentence is a quotation with its source, not a claim about other tools.
  const origin = page.locator('.origin');
  await expect(origin).toContainText('geometric diffing for X3D models');
  await expect(origin).not.toContainText(/nothing else|only tool|first tool/i);
  await expect(origin.getByRole('link')).toHaveAttribute(
    'href',
    'https://web3d.org/pipermail/x3d-public_web3d.org/2021-June/015276.html',
  );
  // Link previews need absolute addresses of the published site.
  const meta = (property: string) =>
    page.locator(`meta[property="${property}"]`).getAttribute('content');
  expect(await meta('og:title')).toContain('X3Diff');
  expect((await meta('og:description'))!.length).toBeGreaterThan(40);
  expect(await meta('og:image')).toBe(
    'https://brunosimoes.github.io/X3Diff/media/x3diff-motion-paths.jpg',
  );
  expect(await meta('og:url')).toBe('https://brunosimoes.github.io/X3Diff/');

  // The animation example sits with the other three and shows a picture from the tool.
  await expect(page.locator('.example-grid > a')).toHaveCount(4);
  const card = page.locator('.example-grid > a.example-wide');
  await expect(card).toContainText('Did it get faster, or go somewhere else?');
  await card.scrollIntoViewIfNeeded();
  const picture = card.locator('img');
  await expect(picture).toHaveAttribute('alt', /Motion paths/);
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(1200);
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(630);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(picture).toBeVisible();
  }
  // Keyboard: the card is a link like the others.
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/app\.html\?example=brickhaven&view=motion$/);
  await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Brickhaven/);
  await expect(page.locator('#analysis-tab-motion')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#motion-paths')).toBeVisible();
  await expect(page.locator('.motion-summary')).toContainText('scene units apart');
  await expect(page.locator('.motion-3d canvas')).toBeVisible();
  expect(failures).toEqual([]);
});

test('a requested view opens when it exists and falls back safely when it does not', async ({
  page,
}) => {
  const selected = () => page.locator('[role="tab"][aria-selected="true"]');
  const open = async (query: string) => {
    await page.goto(`app.html?${query}`);
    await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#global-status')).toHaveText('');
  };
  await open('example=fitlab&view=volume');
  await expect(selected()).toHaveText('Volume differences');
  await expect(page.locator('#volume-summary')).toBeVisible();
  // Unknown, malformed or hostile values, and a view this pair does not have: the usual tab.
  for (const query of [
    'example=fitlab&view=nonsense',
    'example=fitlab&view=',
    'example=fitlab&view=MOTION',
    `example=fitlab&view=${encodeURIComponent('"><img src=x onerror=alert(1)>')}`,
    'example=dolphin&view=motion',
    'example=unknown&view=motion',
  ]) {
    await open(query);
    await expect(selected()).toHaveText('File differences');
    await expect(page.locator('#changes .change-row').first()).toBeVisible();
  }
  // The link does not overwrite the tab the reviewer chose before.
  await open('example=fitlab');
  await page.locator('#analysis-tab-deviation').click();
  await open('example=fitlab&view=volume');
  await expect(selected()).toHaveText('Volume differences');
  await open('example=fitlab');
  await expect(selected()).toHaveText('Surface deviation');
});
