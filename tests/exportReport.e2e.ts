import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const settled = (page: Page) =>
  expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

test('Export offers a readable report and the data, both named after the inputs', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('app.html?example=example');
  await settled(page);
  await expect(page.locator('#global-status')).toHaveText('');
  const trigger = page.locator('#export');
  const menu = page.locator('#export-menu');
  await expect(trigger).toBeEnabled();
  await expect(menu).toBeHidden();

  // Keyboard: Enter opens on the first item, arrows move, Escape closes and returns focus.
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menuitem')).toHaveText([/Report \(HTML\)/, /Data \(JSON\)/]);
  await expect(page.getByRole('menuitem', { name: /Report \(HTML\)/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: /Data \(JSON\)/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  // A click elsewhere closes it too.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.locator('h2', { hasText: 'File differences' }).click();
  await expect(menu).toBeHidden();

  // Data (JSON): the same schema 1.0 report as before, under the new name.
  let download = page.waitForEvent('download');
  await trigger.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const json = await download;
  expect(json.suggestedFilename()).toBe('Objects-original__Objects-revised.x3diff.json');
  const data = JSON.parse(readFileSync((await json.path())!, 'utf8'));
  expect(data.schemaVersion).toBe('1.0');
  expect(Object.keys(data).sort()).toEqual(
    [
      'catalog',
      'changes',
      'config',
      'diagnostics',
      'inputs',
      'schemaVersion',
      'summary',
      'toolVersion',
    ].sort(),
  );

  // Report (HTML): one file that opens offline without asking the network for anything.
  download = page.waitForEvent('download');
  await trigger.click();
  await page.getByRole('menuitem', { name: /Report \(HTML\)/ }).click();
  const html = await download;
  expect(html.suggestedFilename()).toBe('Objects-original__Objects-revised.x3diff.html');
  await expect(page.locator('#global-status')).toHaveText('');
  const path = testInfo.outputPath('report.html');
  await html.saveAs(path);
  const report = await context.newPage();
  const requests: string[] = [];
  const errors: string[] = [];
  report.on('request', (request) => requests.push(request.url()));
  report.on('pageerror', (error) => errors.push(error.message));
  report.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await report.goto(pathToFileURL(path).href);
  expect(requests.filter((url) => !url.startsWith('file:'))).toEqual([]);
  expect(errors).toEqual([]);
  await expect(report.locator('h1')).toHaveText('X3Diff comparison report');
  await expect(report.locator('#status')).toHaveText('Complete');
  await expect(report.locator('#files')).toContainText('Objects · original');
  await expect(report.locator('#files')).toContainText('Objects · revised');
  await expect(report.locator('#files')).toContainText('3.3');
  await expect(report.locator('#method')).toContainText(`X3Diff ${data.toolVersion}`);
  await expect(report.locator('#method')).toContainText('0.00001 scene units');
  await expect(report.locator('#method time')).toHaveAttribute('datetime', /^20\d\d-/);
  // Every difference of the data export is in the readable one, and the counts agree.
  await expect(report.locator('#differences tr[data-change]')).toHaveCount(data.changes.length);
  await expect(report.locator('#difference-count')).toContainText(
    `${data.changes.length} differences found`,
  );
  await expect(report.locator('#categories tr').last()).toContainText(String(data.changes.length));
  // The numbers of the analysis views available for this pair, each with its limits.
  await expect(report.locator('.analysis h3')).toContainText([
    'Slice & measure',
    'Surface deviation',
    'Volume differences',
  ]);
  await expect(report.locator('.analysis', { hasText: 'Volume differences' })).toContainText(
    'Original volume retained',
  );
  await expect(report.locator('.analysis .limits')).toHaveCount(3);
  await expect(report.locator('.analysis .limits').first()).toContainText(
    'Limits of this measurement.',
  );
  // Light background whatever the system theme, and it prints to A4 and Letter.
  await report.emulateMedia({ colorScheme: 'dark' });
  expect(await report.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  for (const format of ['A4', 'Letter'] as const)
    expect((await report.pdf({ format })).byteLength).toBeGreaterThan(10_000);
  await report.setViewportSize({ width: 375, height: 812 });
  expect(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('a hostile DEF name and file name stay text in the report and out of the file name', async ({
  page,
  context,
}, testInfo) => {
  const attack = '"><img src=x onerror="window.pwned=1"><script>window.pwned=2</script>';
  const scene = (size: number, title: string) =>
    `<X3D version="3.3"><Scene><WorldInfo title="${xml(title)}"/>` +
    `<Transform DEF="${xml(attack)}" translation="${size} 0 0"><Shape><Box size="${size} 1 1"/></Shape></Transform>` +
    `<Fog DEF="${xml('</style><script>window.pwned=3</script>')}"/></Scene></X3D>`;
  await page.goto('app.html');
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Dolphin/);
  await page.locator('#before-file').setInputFiles({
    name: `${attack}.x3d`,
    mimeType: 'application/xml',
    buffer: Buffer.from(scene(1, '<b>one</b>')),
  });
  await page.locator('#after-file').setInputFiles({
    name: '../..\\evil<svg onload=alert(1)>.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from(scene(2, '</title><script>window.pwned=4</script>')),
  });
  await settled(page);
  await expect(page.locator('#report-status')).toHaveText('Incomplete');
  // The workbench itself shows the names as text.
  expect(await page.evaluate(() => (window as any).pwned)).toBeUndefined();

  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  await page.getByRole('menuitem', { name: /Report \(HTML\)/ }).click();
  const html = await download;
  expect(html.suggestedFilename()).toMatch(/^[\p{L}\p{N}._-]+__[\p{L}\p{N}._-]+\.x3diff\.html$/u);
  expect(html.suggestedFilename()).toBe(
    'img-src-x-onerror-window.pwned-1-script-window.pwned-2-scrip__evil-svg-onload-alert-1.x3diff.html',
  );
  const path = testInfo.outputPath('hostile.html');
  await html.saveAs(path);
  const source = readFileSync(path, 'utf8');
  expect(source).not.toMatch(/<script|<img|<svg|<b>|onerror\s*=\s*"window/i);

  const report = await context.newPage();
  const dialogs: string[] = [];
  const requests: string[] = [];
  report.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  report.on('request', (request) => requests.push(request.url()));
  await report.goto(pathToFileURL(path).href);
  await expect(report.locator('#status')).toHaveText('Incomplete');
  expect(await report.evaluate(() => (window as any).pwned)).toBeUndefined();
  expect(await report.evaluate(() => document.querySelectorAll('script, img, svg, b').length)).toBe(
    0,
  );
  expect(dialogs).toEqual([]);
  expect(requests.filter((url) => !url.startsWith('file:'))).toEqual([]);
  // The names are there, readable, exactly as written in the files.
  await expect(report.locator('#files')).toContainText(`${attack}.x3d`);
  await expect(report.locator('#differences')).toContainText(attack);
  await expect(report.locator('#differences')).toContainText('<b>one</b>');
  await expect(report.locator('#not-compared')).toContainText('Fog × 1');
});
