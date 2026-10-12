import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const settled = (page: Page) =>
  expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
const file = (name: string, text: string) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(text),
});
async function pair(page: Page, before: string, after: string) {
  await page.goto('app.html');
  await settled(page);
  await page.setInputFiles('#file-before', file('before.x3d', before));
  await page.setInputFiles('#file-after', file('after.x3d', after));
  await settled(page);
}
const mesh = (x: number) =>
  `<X3D version="3.3"><Scene><Shape DEF="Plate"><IndexedFaceSet coordIndex="0 1 2 -1"><Coordinate point="${x} 0 0 1 0 0 0 1 0"/></IndexedFaceSet></Shape></Scene></X3D>`;
async function tolerance(page: Page, value: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Point tolerance', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Apply settings' }).click();
}

test('point tolerance reruns the current inputs, is validated, saved and exported', async ({
  page,
}) => {
  await pair(page, mesh(0), mesh(0.000004));
  await expect(page.locator('#caption')).toHaveText('0 differences');
  await tolerance(page, '0.000001');
  await settled(page);
  await expect(page.locator('#caption')).toHaveText('1 difference');
  await expect(page.locator('.card')).toContainText('1 of 3');
  const downloaded = page.waitForEvent('download');
  await page.selectOption('#export', 'json');
  const report = JSON.parse(readFileSync((await (await downloaded).path())!, 'utf8'));
  expect(report.config.vectorAbs).toBe(0.000001);
  expect(report.changes[0].movedPoints).toBe(1);
  await tolerance(page, '-1');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page
      .locator('#point-tolerance')
      .evaluate((node: HTMLInputElement) => node.validity.rangeUnderflow),
  ).toBe(true);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.reload();
  await settled(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Point tolerance', { exact: true })).toHaveValue('0.000001');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('resolution rebuilds curved volumes, shares Settings and is saved and exported', async ({
  page,
}) => {
  const sphere = (radius: number) =>
    `<X3D version="3.3"><Scene><Shape DEF="Ball"><Sphere radius="${radius}"/></Shape></Scene></X3D>`;
  await pair(page, sphere(1), sphere(2));
  await page.getByRole('tab', { name: 'Volume differences' }).click();
  const resolution = page.getByLabel('Resolution', { exact: true });
  const metrics = page.locator('#side .facts').first().locator('dd');
  await expect(metrics).toHaveCount(3);
  const medium = await metrics.allTextContents();
  await resolution.selectOption({ label: 'Low · faster' });
  await expect(metrics).not.toHaveText(medium);
  const low = await metrics.allTextContents();
  await resolution.selectOption({ label: 'High · finer' });
  await expect(metrics).not.toHaveText(low);
  const downloaded = page.waitForEvent('download');
  await page.selectOption('#export', 'html');
  const html = readFileSync((await (await downloaded).path())!, 'utf8');
  expect(html).toContain('Resolution: high');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Volume resolution')).toHaveValue('high');
  await page.getByLabel('Volume resolution').selectOption('low');
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await expect(resolution).toHaveValue('0');
  await expect(metrics).toHaveText(low);
  await page.reload();
  await settled(page);
  await expect(resolution).toHaveValue('0');
});

const boxes = (a: number, b: number) =>
  `<X3D version="3.3"><Scene><Shape DEF="Alpha"><Box size="${a} 1 1"/></Shape><Transform translation="4 0 0"><Shape DEF="Beta"><Box size="${b} 1 1"/></Shape></Transform><Shape DEF="Extra"><Box/></Shape></Scene></X3D>`;

test('selection follows the chosen pair through geometry views and back to cards', async ({
  page,
}) => {
  await pair(page, boxes(1, 1), boxes(2, 3).replace('<Shape DEF="Extra">', '<Shape DEF="Added">'));
  const beta = page
    .locator('.card')
    .filter({ has: page.locator('.card-head b', { hasText: /^Beta$/ }) });
  await beta.click();
  for (const view of ['Slice and measure', 'Volume differences', 'Surface deviation']) {
    await page.getByRole('tab', { name: view }).click();
    await expect(page.getByLabel('Object', { exact: true })).toHaveValue('1');
    await expect(page.locator('.selection-note')).toHaveCount(0);
  }
  await page.getByLabel('Object', { exact: true }).selectOption('0');
  await page.getByRole('tab', { name: 'File differences' }).click();
  await expect(page.locator('.card[aria-pressed="true"]')).toContainText('Alpha');
  await page
    .locator('.card')
    .filter({ has: page.locator('.card-head b', { hasText: /^Added$/ }) })
    .click();
  await page.getByRole('tab', { name: 'Volume differences' }).click();
  await expect(page.getByLabel('Object', { exact: true })).toHaveValue('0');
  await expect(page.locator('.selection-note')).toContainText(
    'does not identify one measurable object pair',
  );
});

test('settings preserve the selected object and analysis tab', async ({ page }) => {
  await pair(page, boxes(1, 1), boxes(2, 3));
  await page.locator('.card').filter({ hasText: 'Beta' }).click();
  await page.getByRole('tab', { name: 'Volume differences' }).click();
  await tolerance(page, '0.001');
  await settled(page);
  await expect(page.getByRole('tab', { name: 'Volume differences' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Object', { exact: true })).toHaveValue('1');
});

const animation = (name: string, clock: string, cycle: number, reach: number) =>
  `<Transform DEF="${name}"><Shape><Box/></Shape></Transform><TimeSensor DEF="${clock}" cycleInterval="${cycle}" loop="true"/><PositionInterpolator DEF="${name}Move" key="0 0.5 1" keyValue="0 0 0 ${reach} 0 0 0 0 0"/><ROUTE fromNode="${clock}" fromField="fraction_changed" toNode="${name}Move" toField="set_fraction"/><ROUTE fromNode="${name}Move" fromField="value_changed" toNode="${name}" toField="set_translation"/>`;
const motion = (cycle: number, reach = 4) =>
  `<X3D version="3.3"><Scene>${animation('First', 'ClockOne', 4, 1)}${animation('Second', 'ClockTwo', cycle, reach)}</Scene></X3D>`;

test('a selected clock carries to its motion and cycle comparison removes a timing-only gap', async ({
  page,
}) => {
  await pair(page, motion(4).replace('cycleInterval="4"', 'cycleInterval="3"'), motion(2));
  await page.locator('.card').filter({ hasText: 'ClockTwo' }).click();
  await page.getByRole('tab', { name: 'Motion paths' }).click();
  await expect(page.getByLabel('Object', { exact: true })).toHaveValue('1');
  await expect(page.locator('#caption')).toHaveText('Second');
  await expect(page.locator('#side .facts')).not.toContainText('max d0');
  await page.getByLabel('Compare', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Cycle position')).toBeVisible();
  await expect(page.locator('.readout')).toHaveText('cycle = 0 % · d = 0');
  await expect(page.locator('.gap-chart')).toHaveAttribute('aria-label', /over the cycle/);
  await expect(page.locator('.gap-chart text.pass')).toHaveCount(0);
  await expect(page.locator('#side .facts')).toContainText('max d0');
  await page.getByLabel('Cycle position').evaluate((node: HTMLInputElement) => {
    node.value = '120';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.readout')).toHaveText('cycle = 50 % · d = 0');
  await page.getByLabel('Compare', { exact: true }).selectOption('0');
  await expect(page.getByRole('slider', { name: 'Time', exact: true })).toBeVisible();
  await page.getByLabel('Object', { exact: true }).selectOption('0');
  await page.getByRole('tab', { name: 'File differences' }).click();
  await expect(page.locator('.card[aria-pressed="true"]')).toContainText('ClockOne');
});

test('cycle comparison preserves a real path difference and uses each cycle for markers', async ({
  page,
}) => {
  await pair(page, motion(4), motion(2, 6));
  await page.getByRole('tab', { name: 'Motion paths' }).click();
  await page.getByLabel('Compare', { exact: true }).selectOption('1');
  await page.getByLabel('Cycle position').evaluate((node: HTMLInputElement) => {
    node.value = '120';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.readout')).toHaveText('cycle = 50 % · d = 2');
  await expect(page.locator('.viewer-state')).toHaveText('');
  const positions = await page.evaluate(() => {
    const scene = (document.querySelector('x3d-canvas') as any).browser.currentScene;
    return ['X3DIFF_BEFORE_MARK', 'X3DIFF_AFTER_MARK'].map(
      (name) => scene.getNamedNode(name).translation.x,
    );
  });
  expect(positions).toEqual([4, 6]);
});

test('geometry selection identifies one animation inside a shared parent and carries back', async ({
  page,
}) => {
  const original = `<X3D version="3.3"><Scene><Group DEF="Assembly">${animation('First', 'ClockOne', 4, 1)}${animation('Second', 'ClockTwo', 4, 4)}</Group></Scene></X3D>`;
  const revised = `<X3D version="3.3"><Scene><Group DEF="Assembly">${animation('First', 'ClockOne', 2, 1).replace('<Box/>', '<Box size="3 2 2"/>')}${animation('Second', 'ClockTwo', 2, 4).replace('<Box/>', '<Box size="4 2 2"/>')}</Group></Scene></X3D>`;
  await pair(page, original, revised);
  await page.getByRole('tab', { name: 'Volume differences' }).click();
  await page.getByLabel('Object', { exact: true }).selectOption('1');
  await page.getByRole('tab', { name: 'Motion paths' }).click();
  await expect(page.getByLabel('Object', { exact: true })).toHaveValue('1');
  await expect(page.locator('.selection-note')).toHaveCount(0);
  await page.getByLabel('Object', { exact: true }).selectOption('0');
  await page.getByRole('tab', { name: 'Surface deviation' }).click();
  await expect(page.getByLabel('Object', { exact: true })).toHaveValue('0');
  await expect(page.locator('.selection-note')).toHaveCount(0);
});
