import { test, expect, type Page } from '@playwright/test';

const settled = (page: Page) =>
  expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
/** The 3D stage reports a scene it could not show in words; an empty state means it drew. */
const drawn = (page: Page) => expect(page.locator('.viewer-state')).toHaveText('');
/** Transparency of a named Material in the scene on the stage. */
const transparency = (page: Page, name: string) =>
  page.evaluate(
    (node) =>
      (document.querySelector('x3d-canvas') as any).browser.currentScene.getNamedNode(node)
        .transparency as number,
    name,
  );
const card = (page: Page, name: string) =>
  page.locator('.card').filter({ has: page.locator('.card-head b', { hasText: name }) });

test('an example opens with every view on the one stage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('app.html?example=brickhaven');
  await settled(page);
  await expect(page.getByRole('tab')).toHaveText([
    'File differences',
    'Slice and measure',
    'Volume differences',
    'Surface deviation',
    'Motion paths',
  ]);
  await expect(page.locator('#caption')).toHaveText('67 differences');
  await expect(page.locator('.card')).toHaveCount(6);
  await expect(page.locator('#name-before')).toHaveText('Brickhaven · original');
  await expect(page.locator('#notices')).toBeHidden();

  // A card says its change in numbers; selecting it names it on the stage.
  await expect(page.getByRole('button', { name: 'Deselect' })).toBeHidden();
  const bench = card(page, 'ParkBench');
  await expect(bench).toContainText('(1, 0.6, 0.9) → (1.5, 0.6, 0.9)');
  await drawn(page);
  expect(await transparency(page, 'A_NewPostbox__X3DIFF_MATERIAL')).toBe(0);
  await bench.click();
  await expect(bench).toHaveAttribute('aria-pressed', 'true');
  // Selecting a card fades every part it is not about, and only those.
  expect(await transparency(page, 'A_ParkBench__X3DIFF_MATERIAL')).toBe(0);
  expect(await transparency(page, 'A_NewPostbox__X3DIFF_MATERIAL')).toBeGreaterThan(0.8);
  await expect(page.locator('#caption')).toHaveText('ParkBench');
  await expect(page.locator('#detail')).toContainText('Δx +0.5');
  await page.getByRole('button', { name: 'Deselect' }).click();
  await expect(page.locator('#caption')).toHaveText('67 differences');
  expect(await transparency(page, 'A_NewPostbox__X3DIFF_MATERIAL')).toBe(0);

  // The legend hides a kind of part, and keeps keyboard focus where it was.
  const added = page.locator('#footer .chip', { hasText: '+ 1' });
  await added.focus();
  await page.keyboard.press('Enter');
  await expect(added).toHaveAttribute('aria-pressed', 'false');
  await expect(added).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        (document.querySelector('x3d-canvas') as any).browser.currentScene.getNamedNode(
          'A_NewPostbox',
        ).visible,
    ),
  ).toBe(false);
  await page.keyboard.press('Enter');

  // B shows the revised file as authored, and Δ brings the overlay back.
  await page.getByRole('button', { name: 'B · After' }).click();
  await expect(page.locator('#caption')).toHaveText('B · revised');
  await drawn(page);
  await page.getByRole('button', { name: 'Δ · Differences' }).click();
  await expect(page.locator('#caption')).toHaveText('67 differences');
  await drawn(page);

  // Whole objects are worded, repeated changes are one card, text is a text diff.
  await expect(card(page, 'OldCrate')).toContainText('Removed · Box');
  await expect(card(page, 'NewPostbox')).toContainText('Added · Cylinder');
  await expect(card(page, 'Parts')).toContainText('× 28');
  const title = card(page, 'Scene');
  await expect(title.locator('del')).toHaveText('original');
  await expect(title.locator('ins')).toHaveText('revised');

  // Slice: both views, the outline sizes, and the layout button.
  await page.getByRole('tab', { name: 'Slice and measure' }).click();
  await expect(page.locator('#flat')).toHaveClass(/split/);
  await expect(page.locator('svg.section path.after')).toHaveCount(1);
  await expect(page.locator('#side .facts')).toContainText('1.5 × 0.6');
  await expect(page.locator('#side .facts')).toContainText('+0.5 × 0');
  const stacked = await page.locator('#flat').evaluate((node) => node.classList.contains('rows'));
  await page.getByRole('button', { name: stacked ? 'Side by side' : 'Stack views' }).click();
  await expect(page.locator('#flat')).toHaveClass(stacked ? /^(?!.*rows)/ : /rows/);

  await page.getByRole('tab', { name: 'Volume differences' }).click();
  await expect(page.locator('#detail')).toHaveText('A ∩ B / A = 100 %');
  await expect(page.locator('#side .facts').first()).toContainText('0.27');
  await expect(page.locator('#side')).toContainText('= exact solids');
  await drawn(page);

  await page.getByRole('tab', { name: 'Surface deviation' }).click();
  await expect(page.locator('#detail')).toHaveText('max d ≈ 0.2, sampled');
  await drawn(page);

  await page.getByRole('tab', { name: 'Motion paths' }).click();
  await expect(page.locator('#caption')).toHaveText('Railway');
  await expect(page.locator('#detail')).toContainText('max d ≈ 11.89');
  await expect(page.locator('.gap-chart text.pass')).toHaveText('T(B)');
  await drawn(page);
  // The chart is a scrubber: pressing on it moves the time.
  const before = await page.locator('.readout').textContent();
  const box = (await page.locator('.gap-chart').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect(page.locator('.readout')).not.toHaveText(before!);
  expect(errors).toEqual([]);
});

test('the reviewer’s own files replace the example and can be exported', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  // One file of their own empties the other side: the pair shown is never half an example.
  await page.setInputFiles('#file-before', 'public/examples/HelloWorld.x3d');
  await settled(page);
  await expect(page.locator('#caption')).toHaveText('Choose the revised file');
  await expect(page.locator('#name-before')).toHaveText('HelloWorld.x3d');
  await expect(page.locator('#name-after')).toHaveText('Revised…');
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('.card')).toHaveCount(0);

  await page.setInputFiles('#file-after', 'public/examples/HelloWorld-edited.x3d');
  await settled(page);
  await expect(page.locator('#caption')).toHaveText('7 differences');
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('#export')).toBeEnabled();

  for (const kind of ['json', 'html'] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.selectOption('#export', kind),
    ]);
    expect(download.suggestedFilename()).toBe(`HelloWorld__HelloWorld-edited.x3diff.${kind}`);
    await expect(page.locator('#export')).toHaveValue('');
  }
});

test('an incomplete comparison is announced above the workbench', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  await page.setInputFiles('#file-before', 'fixtures/incomplete/before.x3d');
  await page.setInputFiles('#file-after', 'fixtures/incomplete/after.x3d');
  await settled(page);
  const notices = page.locator('#notices');
  await expect(notices).toBeVisible();
  await expect(notices).toHaveAttribute('open', '');
  await expect(notices.locator('summary')).toHaveText(
    'Incomplete comparison: some content was not compared',
  );
  expect(await notices.locator('li').count()).toBeGreaterThan(0);
});

test('a file that is not X3D is refused in words', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  await page.setInputFiles('#file-before', {
    name: 'before.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from('this is not xml'),
  });
  await page.setInputFiles('#file-after', {
    name: 'after.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from('<X3D version="3.3"><Scene/></X3D>'),
  });
  await settled(page);
  await expect(page.locator('#caption')).toHaveText('These files could not be compared');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('#export')).toBeDisabled();
});

test('at phone width nothing overflows and the panel sits under the stage', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('app.html?example=fitlab');
  await settled(page);
  await expect(page.locator('.card')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const stage = (await page.locator('#stage').boundingBox())!;
  const side = (await page.locator('#side').boundingBox())!;
  expect(side.y).toBeGreaterThan(stage.y + stage.height - 1);
  await expect(page.locator('#splitter')).toBeHidden();
});
