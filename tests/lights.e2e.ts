import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
const load = async (page: Page, before: [string, Buffer], after: [string, Buffer]) => {
  await page.goto('app.html');
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Dolphin/);
  for (const [side, [name, buffer]] of [
    ['before', before],
    ['after', after],
  ] as const)
    await page
      .locator(`#${side}-file`)
      .setInputFiles({ name, mimeType: 'application/xml', buffer });
  await expect(page.locator('#load-after')).toHaveAttribute('title', new RegExp(after[0]));
  await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
};
/** What X_ITE built for a named node in a pane, read from its live scene. */
const live = (page: Page, pane: string, def: string, field?: string) =>
  page.evaluate(
    ([selector, name, key]) => {
      try {
        const node = (
          document.querySelector(`${selector} x3d-canvas`) as any
        ).browser.currentScene.getNamedNode(name);
        return key ? String(node[key]) : (node.getNodeTypeName() as string);
      } catch {
        return '';
      }
    },
    [pane, def, field ?? ''],
  );

test('the Web3D textbook file PointLightColor.x3d is compared completely, light included', async ({
  page,
}) => {
  const original = fixture('official/PointLightColor.x3d');
  const edited = Buffer.from(
    original
      .toString('utf8')
      .replace(
        "<PointLight DEF='Lamp' color='1 1 0' location='0 0 12' radius='15'/>",
        "<PointLight DEF='Lamp' color='1 0.5 0' intensity='0.6' location='0 0 9' radius='15'/>",
      ),
  );
  expect(edited.equals(original)).toBe(false);

  // Unchanged against itself: a complete result with nothing skipped.
  await load(page, ['PointLightColor.x3d', original], ['PointLightColor-copy.x3d', original]);
  await expect(page.locator('#global-status')).toHaveText('No differences found.');
  await expect(page.locator('#global-status')).not.toHaveClass(/error/);
  await expect(page.locator('#incomplete-banner')).toBeHidden();
  await expect(page.locator('#diagnostics')).not.toContainText('PointLight');

  await page.locator('#after-file').setInputFiles({
    name: 'PointLightColor-edited.x3d',
    mimeType: 'application/xml',
    buffer: edited,
  });
  await expect(page.locator('#change-count')).toHaveText('3');
  await expect(page.locator('#report-status')).not.toHaveText('Incomplete');
  await expect(page.locator('#report-status')).toHaveText('');
  await expect(page.locator('#incomplete-banner')).toBeHidden();
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#category option')).toHaveText(['All categories · 3', 'Lighting · 3']);
  const row = (name: string) => page.locator('#changes .change-row', { hasText: name });
  await expect(row('Light intensity').locator('.revision-value.before')).toHaveText('1');
  await expect(row('Light intensity').locator('.revision-value.after')).toContainText('0.6');
  await expect(row('Color').locator('.color-swatch')).toHaveCount(2);
  await expect(row('Location').locator('.revision-value.before')).toContainText('Z 12');
  await expect(row('Location').locator('.revision-value.after')).toContainText('Z 9');
  await expect(page.locator('#changes .group-heading')).toContainText('Lamp');

  // A light is register evidence: the tool says so instead of "no visible object".
  await row('Light intensity').click();
  await expect(page.locator('#selection')).toContainText('A light has no shape to highlight');
  await expect(page.locator('#focus-selection')).toBeDisabled();

  // Each revision is drawn with its own light, under the file's own "headlight off".
  await page.locator('[data-view="after"]').click();
  await expect.poll(() => live(page, '#viewer-after', 'Lamp')).toBe('PointLight');
  await expect.poll(() => live(page, '#viewer-after', 'Lamp', 'intensity')).toMatch(/^0\.6/);
  await expect(page.locator('#viewer-after .viewer-state')).toHaveText('');
  await expect(page.locator('#viewer-after .preview-notice')).toContainText(
    'The headlight is off, as the file asks',
  );
  await page.locator('[data-view="before"]').click();
  await expect.poll(() => live(page, '#viewer-before', 'Lamp', 'intensity')).toBe('1');
  // The overlay keeps its neutral lighting, so its colour code never depends on the scene.
  await page.locator('[data-view="diff"]').click();
  await expect(page.locator('#viewer-diff .viewer-state')).toHaveText('');
  expect(await live(page, '#viewer-diff', 'A_Lamp')).toBe('');
  expect(await live(page, '#viewer-diff', 'B_Lamp')).toBe('');
});

test('a pair with changed lights lists each setting in words', async ({ page }) => {
  await load(
    page,
    ['studio-v1.x3d', fixture('lights/before.x3d')],
    ['studio-v2.x3d', fixture('lights/after.x3d')],
  );
  await expect(page.locator('#report-status')).toHaveText('');
  await expect(page.locator('#incomplete-banner')).toBeHidden();
  await expect(page.locator('#change-count')).toHaveText('6');
  await expect(page.locator('#category option')).toHaveText([
    'All categories · 6',
    'Lighting · 5',
    'References · 1',
  ]);
  await page.locator('#category').selectOption('lighting');
  const rows = page.locator('#changes .change-row');
  await expect(rows).toHaveCount(5);
  const row = (name: string) => rows.filter({ hasText: name });
  await expect(row('Light intensity').locator('.revision-value.after')).toContainText('0.6');
  await expect(row('Switched on').locator('.revision-value.before')).toHaveText('on');
  await expect(row('Switched on').locator('.revision-value.after')).toHaveText('off');
  await expect(row('Direction').locator('.revision-value.after')).toContainText('X 0.3');
  await expect(row('Location').locator('.revision-value.after')).toContainText('Y 4');
  // Phone width: the lighting rows fit without sideways scrolling.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(rows).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('an orthographic viewpoint is compared and drawn', async ({ page }) => {
  const scene = (extent: number) =>
    `<X3D profile="Immersive" version="3.3"><Scene>` +
    `<OrthoViewpoint DEF="Plan" description="Plan" position="0 0 10" fieldOfView="-${extent} -${extent} ${extent} ${extent}"/>` +
    `<Background skyColor="0.1 0.1 0.2"/><WorldInfo title="plan"/>` +
    `<Shape DEF="Slab"><Appearance><Material/></Appearance><Box size="2 1 1"/></Shape>` +
    `</Scene></X3D>`;
  await load(page, ['plan-v1.x3d', Buffer.from(scene(2))], ['plan-v2.x3d', Buffer.from(scene(4))]);
  await expect(page.locator('#report-status')).toHaveText('');
  await expect(page.locator('#incomplete-banner')).toBeHidden();
  await expect(page.locator('#category option')).toHaveText([
    'All categories · 1',
    'Viewpoint · 1',
  ]);
  await expect(page.locator('#changes .change-row')).toContainText('fieldOfView');
  await page.locator('[data-view="after"]').click();
  await expect.poll(() => live(page, '#viewer-after', 'Plan')).toBe('OrthoViewpoint');
  await expect.poll(() => live(page, '#viewer-after', 'Slab')).toBe('Shape');
  await expect(page.locator('#viewer-after .viewer-state')).toHaveText('');
});
