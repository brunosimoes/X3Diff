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
  await expect(page.locator('.viewer-state')).toHaveText('');
  await expect(page.locator('#tab-differences')).toBeVisible();
  await expect(page.locator('#stage x3d-canvas')).toBeVisible();
  await page.getByRole('link', { name: 'X3Diff', exact: true }).click();
  await expect(page.locator('h1')).toContainText('Decide with evidence');
  expect(errors).toEqual([]);
});

test('the landing page carries share tags and opens the motion example', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
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
  // A phone is given its own, closer picture of the same view.
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.currentSrc))
    .toContain('x3diff-motion-paths-mobile.jpg');
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1023);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Keyboard: the card is a link like the others.
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/app\.html\?example=brickhaven#motion$/);
  await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#name-after')).toHaveText(/Brickhaven/);
  await expect(page.locator('#tab-motion')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#caption')).toHaveText('Railway');
  await expect(page.locator('#detail')).toContainText('max d ≈');
  await expect(page.locator('.gap-chart')).toBeVisible();
  expect(failures).toEqual([]);
});

test('a requested view opens when it exists and falls back safely when it does not', async ({
  page,
}) => {
  const selected = () => page.locator('[role="tab"][aria-selected="true"]');
  const open = async (query: string) => {
    await page.goto(`app.html?${query}`);
    await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.viewer-state')).toHaveText('');
  };
  await open('example=fitlab&view=volume');
  await expect(selected()).toHaveText('Volume differences');
  await expect(page.locator('#side .facts').first()).toBeVisible();
  // Unknown, malformed or hostile values, and a view this pair does not have: the usual tab.
  for (const query of [
    'example=fitlab&view=nonsense',
    'example=fitlab&view=',
    'example=fitlab&view=MOTION',
    `example=fitlab&view=${encodeURIComponent('"><img src=x onerror=alert(1)>')}`,
    'example=dolphin&view=motion',
  ]) {
    await open(query);
    await expect(selected()).toHaveText('File differences');
    await expect(page.locator('.card').first()).toBeVisible();
  }
});

test('the demonstration video plays on the landing page, with captions', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
  await page.getByRole('link', { name: 'Video', exact: true }).click();
  const video = page.locator('#demo video');
  await expect(video).toBeVisible();
  await expect(video.locator('track[kind="captions"]')).toHaveAttribute('srclang', 'en');
  // The poster is a real picture, and the film starts when asked to.
  const poster = await video.getAttribute('poster');
  expect((await page.request.get(poster!)).ok()).toBe(true);
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(0);
  expect(await video.evaluate((element: HTMLVideoElement) => Math.round(element.duration))).toBe(
    163,
  );
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(failures).toEqual([]);
});
