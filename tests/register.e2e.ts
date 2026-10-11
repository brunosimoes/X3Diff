import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const settled = (page: Page) =>
  expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
/** The four figures under the summary line, as numbers. */
const metrics = (page: Page) =>
  page
    .locator('#summary > div strong')
    .allTextContents()
    .then((values) => values.map(Number));

for (const [id, objects, total, summary] of [
  [
    'brickhaven',
    28,
    67,
    '1 object resized, 28 recoloured, 1 added, 1 removed; 1 animation setting changed, 1 title or document detail changed.',
  ],
  [
    'forgeworks',
    31,
    72,
    '31 objects recoloured, 1 added, 1 removed; 2 animation settings changed, 2 title or document details changed.',
  ],
] as const)
  test(`${id}: repeated changes are one line, named objects, and the counts add up`, async ({
    page,
  }, testInfo) => {
    await page.goto(`app.html?example=${id}`);
    await settled(page);
    await expect(page.locator('#change-count')).toHaveText(String(total));
    await expect(page.locator('#register-summary')).toHaveText(summary);
    expect((await metrics(page)).reduce((sum, n) => sum + n, 0)).toBe(total);
    await expect(page.locator('#category option').first()).toHaveText(`All categories · ${total}`);

    // No group is called by a bare running number any more.
    const names = await page.locator('#changes strong').allTextContents();
    expect(names.filter((name) => /^(Transform|Shape|Group) \d+$/.test(name))).toEqual([]);

    // One closed line stands for the objects that changed the same way.
    const bundle = page.locator('#changes .change-bundle');
    await expect(bundle).toHaveCount(1);
    const toggle = bundle.locator('.bundle-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toContainText(`${objects} materials changed the same way`);
    await expect(toggle).toContainText(`${objects * 2} differences`);
    await expect(toggle).toContainText('Diffuse color');
    await expect(bundle.locator('.bundle-member:visible')).toHaveCount(0);
    // Listed rows plus the changes behind the bundle are every change.
    const rows = await page.locator('#changes .change-row').count();
    expect(rows + objects * 2).toBe(total);
    expect(rows).toBeLessThan(15);

    // Keyboard: the line opens with Enter and shows the shared values once, then each object.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(bundle.locator('.bundle-values')).toHaveCount(2);
    await expect(bundle.locator('.bundle-values').first()).toContainText(`each of ${objects}`);
    await expect(bundle.locator('.bundle-values .color-swatch')).toHaveCount(4);
    const members = bundle.locator('.bundle-member');
    await expect(members).toHaveCount(objects);
    await expect(members.first()).toBeVisible();
    await expect(members.first()).toContainText(
      /(Box|Cylinder|Sphere|Cone) · shape \d+ of \d+ in \w+/,
    );

    // Each object can still be selected and is highlighted in 3D.
    await page.keyboard.press('Tab');
    await expect(members.first().locator('button')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(members.first()).toHaveClass(/selected/);
    await expect(page.locator('#selection')).toContainText('Highlighted in scene');
    await members.nth(objects - 1).click();
    await expect(members.nth(objects - 1)).toHaveClass(/selected/);
    await expect(members.first()).not.toHaveClass(/selected/);
    await expect(page.locator('#selection')).toContainText('Highlighted in scene');
    await expect(page.locator('#focus-selection')).toBeEnabled();

    // The category filter keeps the bundle, and its counts still add up.
    await page.locator('#category').selectOption('material');
    await expect(page.locator('#changes .bundle-toggle')).toContainText(
      `${objects} materials changed the same way`,
    );
    await expect(page.locator('#changes .change-row')).toHaveCount(0);
    await page.locator('#category').selectOption('all');

    // Both exports hold every individual change.
    let download = page.waitForEvent('download');
    await page.locator('#export').click();
    await page.locator('[data-export="json"]').click();
    const data = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
    expect(data.changes).toHaveLength(total);
    download = page.waitForEvent('download');
    await page.locator('#export').click();
    await page.locator('[data-export="html"]').click();
    const path = testInfo.outputPath('report.html');
    await (await download).saveAs(path);
    const html = readFileSync(path, 'utf8');
    expect(html.match(/data-change="/g)).toHaveLength(total);
    for (const change of data.changes) expect(html).toContain(`data-change="${change.id}"`);
    expect(html).toContain(summary);
    expect(html).toContain(`${objects} materials changed the same way`);
    expect(html).toContain('<h3>Motion paths');

    // Phone width: the summary and the bundle fit.
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('#register-summary')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });

test('small pairs get the summary line and names, and list every change', async ({ page }) => {
  for (const [id, total, summary, heading] of [
    [
      'example',
      7,
      '1 object resized, 1 reshaped, 2 recoloured, 2 moved.',
      'Cylinder · shape 2 of 2 in the file',
    ],
    [
      'fitlab',
      12,
      '1 object moved, 1 rotated, 1 added, 1 removed; 2 title or document details changed.',
      'SupportSlot',
    ],
    [
      'dolphin',
      7,
      '1 object reshaped; 2 Inline removed, 1 Switch removed, 3 title or document details changed.',
      'scene',
    ],
  ] as const) {
    await page.goto(`app.html?example=${id}`);
    await settled(page);
    await expect(page.locator('#register-summary')).toHaveText(summary);
    await expect(page.locator('#change-count')).toHaveText(String(total));
    await expect(page.locator('#changes .change-row')).toHaveCount(total);
    await expect(page.locator('#changes .change-bundle')).toHaveCount(0);
    await expect(
      page.locator('#changes .group-heading strong').filter({ hasText: heading }),
    ).toHaveCount(1);
    expect((await metrics(page)).reduce((sum, n) => sum + n, 0)).toBe(total);
  }
  // A reviewer's own small pair, in the words of the review that asked for this line.
  const scene = (size: string, colour: string, y: number, extra = '') =>
    `<X3D version="3.3"><Scene><Transform DEF="Bracket" translation="0 ${y} 0"><Shape><Appearance><Material diffuseColor="${colour}"/></Appearance><Box size="${size}"/></Shape></Transform>${extra}</Scene></X3D>`;
  const upload = (name: string, text: string) => ({
    name,
    mimeType: 'application/xml',
    buffer: Buffer.from(text),
  });
  await page
    .locator('#before-file')
    .setInputFiles(upload('part-v1.x3d', scene('2 1 1', '0 0 1', 0)));
  await page
    .locator('#after-file')
    .setInputFiles(
      upload(
        'part-v2.x3d',
        scene(
          '2.4 1 1',
          '1 0 0',
          0.25,
          '<Transform DEF="Washer"><Shape><Sphere/></Shape></Transform>',
        ),
      ),
    );
  await settled(page);
  await expect(page.locator('#register-summary')).toHaveText(
    '1 object resized, 1 recoloured, 1 moved, 1 added.',
  );
  // The summary goes when the comparison does.
  await page.locator('#after-file').setInputFiles(upload('same.x3d', scene('2 1 1', '0 0 1', 0)));
  await expect(page.locator('#global-status')).toHaveText('No differences found.');
  await expect(page.locator('#register-summary')).toBeHidden();
});

test('identical changes inside one object are one line, with every change behind it', async ({
  page,
}, testInfo) => {
  const rack = (colour: string, lid: number) =>
    `<X3D version="3.3"><Scene><Transform DEF="Rack">${Array.from(
      { length: 24 },
      (_, i) =>
        `<Shape><Appearance><Material diffuseColor="${colour}"/></Appearance><Box size="${1 + (i % 3)} 1 1"/></Shape>`,
    ).join(
      '',
    )}</Transform><Transform DEF="Lid" translation="0 ${lid} 0"><Shape><Sphere/></Shape></Transform></Scene></X3D>`;
  const upload = (name: string, text: string) => ({
    name,
    mimeType: 'application/xml',
    buffer: Buffer.from(text),
  });
  await page.goto('app.html?example=example');
  await settled(page);
  await page.locator('#before-file').setInputFiles(upload('rack-v1.x3d', rack('1 0 0', 1)));
  await page.locator('#after-file').setInputFiles(upload('rack-v2.x3d', rack('0 0 1', 2)));
  await expect(page.locator('#change-count')).toHaveText('25');
  await settled(page);
  expect((await metrics(page)).reduce((sum, n) => sum + n, 0)).toBe(25);

  // One closed line stands for the 24 identical changes; the group still counts them all.
  const group = page.locator('#changes .object-group').filter({ hasText: 'Rack' });
  await expect(group.locator('.group-heading .group-count')).toHaveText('24 differences');
  const toggle = group.locator('.fold-toggle');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toContainText('24 materials changed the same way');
  await expect(toggle).toContainText('24 differences');
  await expect(toggle).toContainText('Diffuse color 1 · 0 · 0 → 0 · 0 · 1');
  const members = group.locator('.change-row');
  await expect(members).toHaveCount(24);
  await expect(group.locator('.change-row:visible')).toHaveCount(0);
  await expect(page.locator('#changes .change-row:visible')).toHaveCount(1);

  // Keyboard: Enter opens it; every change is a row of its own, named by its shape.
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(group.locator('.change-row:visible')).toHaveCount(24);
  await expect(members.first()).toContainText('Box · shape 1 of 24 in Rack · Diffuse color');
  await expect(members.nth(23)).toContainText('Box · shape 24 of 24 in Rack · Diffuse color');
  await expect(members.nth(23).locator('.row-index')).toHaveText('24');
  await page.keyboard.press('Tab');
  await expect(members.first().locator('button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(members.first()).toHaveClass(/selected/);
  await expect(page.locator('#selection')).toContainText('Highlighted in scene');
  await members.nth(23).click();
  await expect(members.nth(23)).toHaveClass(/selected/);
  await expect(members.first()).not.toHaveClass(/selected/);
  await expect(page.locator('#selection')).toContainText('Highlighted in scene');

  // Closing the object hides everything; reopening it keeps the line as it was left.
  const expand = group.locator('.group-expand');
  await expand.click();
  await expect(group.locator('tr:visible')).toHaveCount(1);
  await expand.click();
  await expect(toggle).toBeVisible();
  await expect(group.locator('.change-row:visible')).toHaveCount(24);
  await toggle.click();
  await expect(group.locator('.change-row:visible')).toHaveCount(0);
  await expand.click();
  await expand.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(group.locator('.change-row:visible')).toHaveCount(0);

  // The category filter keeps the line and its count.
  await page.locator('#category').selectOption('material');
  await expect(page.locator('#category option:checked')).toHaveText('Material · 24');
  await expect(page.locator('#changes .fold-toggle')).toContainText(
    '24 materials changed the same way',
  );
  await expect(page.locator('#changes .change-row')).toHaveCount(24);
  await page.locator('#category').selectOption('all');

  // Both exports hold every individual change.
  let download = page.waitForEvent('download');
  await page.locator('#export').click();
  await page.locator('[data-export="json"]').click();
  const data = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(data.changes).toHaveLength(25);
  download = page.waitForEvent('download');
  await page.locator('#export').click();
  await page.locator('[data-export="html"]').click();
  const path = testInfo.outputPath('report.html');
  await (await download).saveAs(path);
  const html = readFileSync(path, 'utf8');
  expect(html.match(/data-change="/g)).toHaveLength(25);
  for (const change of data.changes) expect(html).toContain(`data-change="${change.id}"`);

  // Phone width: the line fits, open and closed.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#changes .fold-toggle').click();
  await expect(page.locator('#changes .change-row:visible')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('a tiny change at a tight tolerance shows two values that differ', async ({ page }) => {
  const part = (x: string) =>
    `<X3D version="3.3"><Scene><Transform DEF="Part" translation="${x} 0 0"><Shape><Box size="${x} 1 1"/></Shape></Transform><Shape><Sphere radius="${x}"/></Shape></Scene></X3D>`;
  const upload = (name: string, text: string) => ({
    name,
    mimeType: 'application/xml',
    buffer: Buffer.from(text),
  });
  await page.goto('app.html?example=example');
  await settled(page);
  await page.locator('#settings-trigger').click();
  await page.locator('#tolerance').fill('0.000001');
  await page.locator('#apply-settings').click();
  await page.locator('#before-file').setInputFiles(upload('part-v1.x3d', part('2')));
  await page.locator('#after-file').setInputFiles(upload('part-v2.x3d', part('2.000004')));
  await expect(page.locator('#change-count')).toHaveText('3');
  await settled(page);
  const rows = page.locator('#changes .change-row');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const before = (await rows.nth(i).locator('.revision-value.before').innerText()).trim();
    const after = (await rows.nth(i).locator('.revision-value.after').innerText()).trim();
    // Not "X 2 → X 2 (+0.000004)": the after value itself reads 2.000004.
    expect(before.split('\n')[0]).toMatch(/^(X )?2$/);
    expect(after.split('\n')[0]).toMatch(/^(X )?2\.000004( \(\+0\.000004\))?$/);
  }
  await expect(page.locator('#changes')).toContainText('+0.000004');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
