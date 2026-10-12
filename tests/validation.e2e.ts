import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const scene = (body: string, head = '') =>
  `<X3D version="3.3"><head>${head}</head><Scene>${body}</Scene></X3D>`;
const file = (name: string, text: string) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(text),
});
async function load(page: Page, before: string, after: string) {
  await page.goto('app.html');
  await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
  await page.setInputFiles('#file-before', file('before.x3d', before));
  await page.setInputFiles('#file-after', file('after.x3d', after));
  await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
}
async function exported(page: Page) {
  const downloaded = page.waitForEvent('download');
  await page.selectOption('#export', 'json');
  return JSON.parse(readFileSync((await (await downloaded).path())!, 'utf8'));
}

test('document context and moved parents remain readable and exported', async ({ page }) => {
  const body = (moved: boolean) =>
    `<Transform DEF="Left"><Group>${moved ? '' : '<Shape DEF="Part"><Box/></Shape>'}</Group></Transform><Transform DEF="Right" translation="4 0 0">${moved ? '<Shape DEF="Part"><Box/></Shape>' : ''}</Transform>`;
  await load(
    page,
    scene(body(false), '<component name="Shape" level="1"/>'),
    scene(body(true), '<component name="Shape" level="2"/>'),
  );
  await expect(page.locator('#side')).toContainText('Parent');
  await expect(page.locator('#side')).toContainText('Component requirements');
  const report = await exported(page);
  expect(report.changes.some((change: any) => change.kind === 'nodeMoved')).toBe(true);
  expect(report.changes.some((change: any) => change.field === 'components')).toBe(true);
  await page.getByRole('tab', { name: 'Volume differences' }).click();
  await expect(page.locator('#side')).toContainText('Part');
});

test('incomplete zero counts stay partial and include per-file skipped content', async ({
  page,
}) => {
  await load(
    page,
    scene(
      '<Fog visibilityRange="1"/>',
      '<unit category="length" name="metre" conversionFactor="1"/>',
    ),
    scene('<Fog visibilityRange="2"/>'),
  );
  await expect(page.locator('#caption')).toHaveText('Partial · 0 differences');
  await expect(page.locator('#notices')).toBeVisible();
  await expect(page.locator('#notices')).toContainText('Fog');
  await expect(page.locator('#notices')).toContainText('unit');
  const report = await exported(page);
  expect(report.summary.status).toBe('incomplete');
  expect(
    report.diagnostics.filter((item: any) => item.code.startsWith('UNSUPPORTED_')).length,
  ).toBeGreaterThan(1);
});

test('unsupported versions fail without analysis or export', async ({ page }) => {
  await load(page, '<X3D version="5.0"><Scene/></X3D>', scene('<Shape><Box/></Shape>'));
  await expect(page.locator('#caption')).toHaveText('These files could not be compared');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('#notices')).toContainText('5.0');
});

test('sanitized authored previews preserve light switches and block external resources', async ({
  page,
}) => {
  const external: string[] = [];
  // Requests to the external origin declared by this scene must never occur.
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname === 'example.com')
      external.push(request.url());
  });
  const text = scene(
    '<NavigationInfo headlight="false"/><DirectionalLight DEF="Lamp" on="false" intensity="0.6" onclick="alert(1)"/><Shape><Box/></Shape><Inline url="&quot;https://example.com/scene.x3d&quot;"/><Script url="&quot;https://example.com/code.js&quot;"/>',
  );
  await load(page, text, text.replace('intensity="0.6"', 'intensity="0.7"'));
  await page.getByRole('button', { name: 'A · Before' }).click();
  await expect(page.locator('.viewer-state')).toHaveText('');
  const switchedOn = await page.evaluate(
    () =>
      (document.querySelector('x3d-canvas') as any).browser.currentScene.getNamedNode('Lamp').on,
  );
  expect(switchedOn).toBe(false);
  expect(external).toEqual([]);
});

test('drop ordering and file limits use the same input lifecycle as picked files', async ({
  page,
}) => {
  await page.goto('app.html');
  await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
  const before = scene('<Shape DEF="Part"><Box size="1 1 1"/></Shape>');
  const after = before.replace('1 1 1', '2 1 1');
  await page.evaluate(
    ({ before, after }) => {
      const data = new DataTransfer();
      data.items.add(new File([after], 'after.x3d', { type: 'application/xml' }));
      data.items.add(new File([before], 'before.x3d', { type: 'application/xml' }));
      document.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }));
    },
    { before, after },
  );
  await expect(page.locator('#caption')).toHaveText('1 difference');
  await expect(page.locator('#name-before')).toHaveText('before.x3d');
  await expect(page.locator('#name-after')).toHaveText('after.x3d');
  await page.setInputFiles('#file-before', {
    name: 'too-large.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 32),
  });
  await expect(page.locator('#caption')).toHaveText('That file could not be read');
  await expect(page.locator('#detail')).toContainText('20 MiB');
  await expect(page.locator('#export')).toBeDisabled();
});

test('all bundled examples draw and keep the same shared preview canvas', async ({ page }) => {
  await page.goto('app.html?example=example');
  await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.viewer-state')).toHaveText('');
  await page.evaluate(() => ((window as any).previewCanvas = document.querySelector('x3d-canvas')));
  for (const example of ['fitlab', 'forgeworks', 'dolphin', 'brickhaven']) {
    await page.selectOption('#example', example);
    await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.viewer-state')).toHaveText('');
    expect(
      await page.evaluate(
        () => (window as any).previewCanvas === document.querySelector('x3d-canvas'),
      ),
    ).toBe(true);
    for (const mode of ['A · Before', 'B · After']) {
      await page.getByRole('button', { name: mode }).click();
      await expect(page.locator('.viewer-state')).toHaveText('');
    }
  }
});

test('coverage opens its catalog without losing the comparison', async ({ page }) => {
  await page.goto('app.html?example=example');
  await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Coverage', exact: true }).click();
  const coverage = await opened;
  await expect(coverage.locator('.node-list li')).toHaveCount(50);
  await expect(page.locator('#caption')).toHaveText('7 differences');
  await coverage.getByRole('link', { name: /Open app/ }).click();
  await expect(coverage.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
});
