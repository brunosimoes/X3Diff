import { test, expect, type Page } from '@playwright/test';

const settled = (page: Page) =>
  expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
const transparency = (page: Page, name: string) =>
  page.evaluate(
    (node) =>
      (document.querySelector('x3d-canvas') as any).browser.currentScene.getNamedNode(node)
        .transparency as number,
    name,
  );

test('cards can be filtered and searched, and one part picked out of a group', async ({ page }) => {
  await page.goto('app.html?example=brickhaven');
  await settled(page);
  const chips = page.locator('.filter-chip');
  await expect(chips).toHaveText(['All 6', 'Δ 2', '+ 1', '− 1', '≠ 2']);
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');

  // A filter keeps the cards of one kind; the search narrows them by what they say.
  await chips.filter({ hasText: '≠' }).click();
  await expect(page.locator('.card')).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Search the differences' }).fill('clock');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('RailwayClock');
  await page.getByRole('searchbox').fill('no such thing');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#side .empty')).toContainText('Nothing matches');
  await page.getByRole('searchbox').fill('');
  await chips.first().click();
  await expect(page.locator('.card')).toHaveCount(6);

  // The group of identical changes lists its parts; picking one fades the other 27.
  const parts = page.locator('details.parts');
  await expect(parts.locator('summary')).toHaveText('Show the 28 parts');
  await parts.locator('summary').click();
  await expect(parts.locator('.part')).toHaveCount(28);
  const group = page.locator('.card', { hasText: '× 28' });
  await group.click();
  await expect(group).toHaveAttribute('aria-pressed', 'true');
  const part = parts.locator('.part').nth(2);
  const label = (await part.textContent())!;
  await part.click();
  await expect(part).toHaveAttribute('aria-pressed', 'true');
  await expect(group).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#caption')).toHaveText(label);
  // The resized bench is not part of the group at all: it is faded with either selection.
  expect(await transparency(page, 'A_ParkBench__X3DIFF_MATERIAL')).toBeGreaterThan(0.8);
  await part.click();
  await expect(part).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#caption')).toHaveText('67 differences');
  expect(await transparency(page, 'A_ParkBench__X3DIFF_MATERIAL')).toBe(0);
});

test('A and B trade places with the swap button', async ({ page }) => {
  await page.goto('app.html?example=brickhaven');
  await settled(page);
  await expect(page.locator('.card', { hasText: 'OldCrate' })).toContainText('Removed');
  await page.getByRole('button', { name: 'Swap A and B' }).click();
  await settled(page);
  await expect(page.locator('#name-before')).toHaveText('Brickhaven · revised');
  await expect(page.locator('#name-after')).toHaveText('Brickhaven · original');
  // What was removed going one way was added going the other.
  await expect(page.locator('.card', { hasText: 'OldCrate' })).toContainText('Added');
  await expect(page.locator('.card', { hasText: 'NewPostbox' })).toContainText('Removed');
});

test('on a phone the header is two rows, every tab shows, and the panel is a sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('app.html?example=brickhaven');
  await settled(page);

  // Header: the occasional actions fold away; A and B share one row.
  const more = page.getByRole('button', { name: 'More actions' });
  await expect(page.locator('#export')).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#export')).toBeVisible();
  await more.click();
  await expect(page.locator('#export')).toBeHidden();
  const a = (await page.locator('#open-before').boundingBox())!;
  const b = (await page.locator('#open-after').boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);

  // Tabs: all five inside the screen, still named in full for assistive technology.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  for (const tab of await tabs.all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
  await expect(page.getByRole('tab', { name: 'Volume differences' })).toBeVisible();

  // Toolbar: one row.
  await page.locator('.card').first().click();
  const tools = await page.locator('#tools > *:visible').all();
  // Compared by their middles: the controls differ in height, and where the row starts
  // depends on the fonts of the machine.
  const middles = await Promise.all(
    tools.map(async (tool) => {
      const box = (await tool.boundingBox())!;
      return box.y + box.height / 2;
    }),
  );
  expect(Math.max(...middles) - Math.min(...middles)).toBeLessThan(12);

  // Sheet: over the bottom of the screen with the stage still in view, taller on demand.
  const sheet = page.locator('#sheet');
  const resting = (await sheet.boundingBox())!;
  const stage = (await page.locator('#stage').boundingBox())!;
  expect(resting.y + resting.height).toBeCloseTo(760, 0);
  expect(stage.y).toBeLessThan(resting.y);
  await page.getByRole('button', { name: 'Expand the panel' }).click();
  await expect
    .poll(async () => (await sheet.boundingBox())!.height)
    .toBeGreaterThan(resting.height + 200);
  await page.getByRole('button', { name: 'Shrink the panel' }).click();
  await expect
    .poll(async () => (await sheet.boundingBox())!.height)
    .toBeLessThan(resting.height + 5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
