import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('published assets, video playback and the downloaded report work under the configured base', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('./');
  const video = page.locator('video');
  await video.scrollIntoViewIfNeeded();
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((element: HTMLVideoElement) => element.pause());

  await page.goto('app.html?example=example');
  await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#viewer-diff .viewer-state')).toHaveText('');
  const downloaded = page.waitForEvent('download');
  await page.locator('#export').click();
  await page.locator('[data-export="json"]').click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Objects-original__Objects-revised.x3diff.json');
  const report = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(report.schemaVersion).toBe('1.0');
  expect(report.summary.status).toBe('complete');
  expect(report.changes.length).toBeGreaterThan(0);

  // Check the worker and vendored renderer actually came from the project directory.
  const resourcePaths = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );
  const prefix = new URL('./', baseURL).href;
  expect(resourcePaths.some((url) => url.startsWith(prefix) && /compare\.worker/.test(url))).toBe(
    true,
  );
  expect(
    resourcePaths.some(
      (url) => url.startsWith(prefix) && /vendor\/x_ite\/x_ite\.min\.mjs/.test(url),
    ),
  ).toBe(true);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
