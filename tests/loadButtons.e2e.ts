import { test, expect, type Page } from '@playwright/test';

const scene = (size: number) =>
  `<X3D version="3.3"><Scene><Shape DEF="Block"><Box size="${size} 2 2"/></Shape></Scene></X3D>`;
const file = (name: string, size: number) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(scene(size)),
});
type Side = 'before' | 'after';
const other = (side: Side): Side => (side === 'before' ? 'after' : 'before');
const title = (side: Side) => (side === 'before' ? 'Before' : 'After');
/** Click a load button and answer the file picker it opens, as a person would. */
async function choose(page: Page, button: string, upload: ReturnType<typeof file>) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(button).click();
  await (await chooser).setFiles(upload);
}
const settled = (page: Page) =>
  expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');

// An example on screen counts as empty for the load buttons, exactly as it does for a drop:
// the reviewer's file is never compared with the other half of the example.
for (const first of ['before', 'after'] as const)
  for (const [where, url, example] of [
    ['the default example', 'app.html', /Dolphin/],
    ['an ?example= deep link', 'app.html?example=fitlab', /Fit Lab/],
  ] as const)
    test(`choosing ${title(first)} over ${where} starts the reviewer's own pair`, async ({
      page,
    }) => {
      const second = other(first);
      await page.goto(url);
      await expect(page.locator(`#load-${second}`)).toHaveAttribute('title', example);
      await settled(page);
      await expect(page.locator('#changes .change-row').first()).toBeVisible();

      await choose(page, `#load-${first}`, file(`mine-${first}.x3d`, 2));
      // The example is gone from both sides; nothing was compared.
      await expect(page.locator(`#load-${first}`)).toHaveAttribute(
        'title',
        new RegExp(`mine-${first}\\.x3d`),
      );
      await expect(page.locator(`#load-${second}`)).toHaveAttribute('data-state', 'missing');
      await expect(page.locator(`#load-${second}`)).toHaveAttribute(
        'title',
        `Load ${second} model`,
      );
      await expect(page.locator(`[data-view="${second}"]`)).toBeDisabled();
      await expect(page.locator('.analysis-panel')).toBeHidden();
      await expect(page.locator('#changes .change-row')).toHaveCount(0);
      await expect(page.locator('[data-view="diff"]')).toBeHidden();
      await expect(page.locator('#global-status')).toHaveText(
        `${title(first)} is loaded. Choose the ${title(second)} file to compare.`,
      );
      // The stage asks for the other side and shows the file that was chosen.
      const next = page.locator('#stage-next');
      await expect(next).toBeVisible();
      await expect(next).toContainText(
        `${title(first)} is loaded (mine-${first}.x3d). Next, choose the ${title(second)} file, or drop it here.`,
      );
      await expect(next.getByRole('button')).toHaveText(`Choose ${title(second)} file…`);
      await expect(page.locator(`[data-view="${first}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`#viewer-${first} .viewer-state`)).toHaveText('');
      await expect(page.locator('#legend')).not.toContainText('Changed');

      // The other load button completes the pair, and only the two chosen files are compared.
      await choose(page, `#load-${second}`, file(`mine-${second}.x3d`, 4));
      await settled(page);
      await expect(next).toBeHidden();
      await expect(page.locator('#global-status')).toHaveText('');
      await expect(page.locator('#change-count')).toHaveText('1');
      await expect(page.locator('#changes .change-row')).toHaveCount(1);
      await expect(page.locator('#changes')).toContainText('Dimensions');
      for (const side of [first, second])
        await expect(page.locator(`#load-${side}`)).toHaveAttribute(
          'title',
          new RegExp(`Replace ${side} model · mine-${side}\\.x3d`),
        );
      const download = page.waitForEvent('download');
      await page.locator('#export').click();
      await page.locator('[data-export="json"]').click();
      const { readFileSync } = await import('node:fs');
      const report = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
      expect([report.inputs.before.name, report.inputs.after.name]).toEqual([
        'mine-before.x3d',
        'mine-after.x3d',
      ]);
    });

test('with both sides the reviewer’s own, each load button is a plain replace', async ({
  page,
}) => {
  await page.goto('app.html');
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Dolphin/);
  await choose(page, '#load-before', file('v1.x3d', 2));
  await choose(page, '#load-after', file('v2.x3d', 4));
  await settled(page);
  await expect(page.locator('#change-count')).toHaveText('1');
  const before = page.locator('#changes .revision-value.before');
  const after = page.locator('#changes .revision-value.after');
  await expect(before).toContainText('X 2');
  await expect(after).toContainText('X 4');

  // Replacing After keeps Before and compares at once, with no prompt in between.
  await choose(page, '#load-after', file('v3.x3d', 6));
  await settled(page);
  await expect(page.locator('#stage-next')).toBeHidden();
  await expect(page.locator('#load-before')).toHaveAttribute('title', /v1\.x3d/);
  await expect(page.locator('#load-after')).toHaveAttribute('title', /v3\.x3d/);
  await expect(before).toContainText('X 2');
  await expect(after).toContainText('X 6');

  // Replacing Before keeps After.
  await choose(page, '#load-before', file('v0.x3d', 1));
  await settled(page);
  await expect(page.locator('#stage-next')).toBeHidden();
  await expect(page.locator('#load-before')).toHaveAttribute('title', /v0\.x3d/);
  await expect(page.locator('#load-after')).toHaveAttribute('title', /v3\.x3d/);
  await expect(before).toContainText('X 1');
  await expect(after).toContainText('X 6');
  await expect(page.locator('#global-status')).toHaveText('');

  // Going back to an example and choosing a file starts over again.
  await page.locator('#demo-trigger').click();
  await page.locator('[data-demo="example"]').click();
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Objects/);
  await settled(page);
  await choose(page, '#load-after', file('fresh.x3d', 3));
  await expect(page.locator('#load-before')).toHaveAttribute('data-state', 'missing');
  await expect(page.locator('#stage-next')).toContainText(
    'After is loaded (fresh.x3d). Next, choose the Before file, or drop it here.',
  );
  await expect(page.locator('#changes .change-row')).toHaveCount(0);
});

test('the stage prompt completes a pair started with a load button, at phone width too', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('app.html?example=example');
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Objects/);
  await settled(page);
  await choose(page, '#load-before', file('part-v1.x3d', 2));
  const next = page.locator('#stage-next');
  await expect(next).toContainText('Before is loaded (part-v1.x3d). Next, choose the After file');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await choose(page, '#stage-next button', file('part-v2.x3d', 4));
  await settled(page);
  await expect(next).toBeHidden();
  await expect(page.locator('#change-count')).toHaveText('1');
  await expect(page.locator('#load-after')).toHaveAttribute('title', /part-v2\.x3d/);
});
