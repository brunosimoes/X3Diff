import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const load = async (page: Page, before: string | Buffer, after: string | Buffer) => {
  await page.goto('app.html');
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Dolphin/);
  for (const [side, xml] of [
    ['before', before],
    ['after', after],
  ] as const)
    await page.locator(`#${side}-file`).setInputFiles({
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(xml),
    });
  await expect(page.locator('#load-after')).toHaveAttribute('title', /after\.x3d/);
  await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
};
/** Shapes X_ITE actually built for a pane, read from its live scene. */
const rendered = (page: Page, pane: string, def: string) =>
  page.evaluate(
    ([selector, name]) => {
      try {
        const scene = (document.querySelector(`${selector} x3d-canvas`) as any).browser
          .currentScene;
        return scene.getNamedNode(name).getNodeTypeName() as string;
      } catch {
        return '';
      }
    },
    [pane, def],
  );

test('newly catalogued nodes are compared and drawn, and navigation settings do not take over', async ({
  page,
}) => {
  const scene = (height: number, speed: number) =>
    `<X3D profile="Immersive" version="3.3"><Scene>` +
    // "NONE" would freeze the view if it were applied to the preview.
    `<NavigationInfo type='"NONE"' speed="${speed}"/>` +
    `<Transform DEF="Marker"><Shape><Appearance><Material diffuseColor="0.8 0.3 0.2"/></Appearance><Cone DEF="Tip" bottomRadius="1" height="${height}"/></Shape></Transform>` +
    `</Scene></X3D>`;
  await load(page, scene(2, 1), scene(3, 4));
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#incomplete-banner')).toBeHidden();
  await expect(page.locator('#report-status')).toHaveText('');
  await expect(page.locator('#change-count')).toHaveText('2');
  await expect(page.locator('#changes')).toContainText('Height');
  await expect(page.locator('#changes')).toContainText('Navigation speed');
  await expect(page.locator('#category option')).toHaveText([
    'All categories · 2',
    'Geometry · 1',
    'Viewpoint · 1',
  ]);

  // The cone is in the preview, and the pane says the navigation node was left out.
  await page.locator('[data-view="after"]').click();
  await expect.poll(() => rendered(page, '#viewer-after', 'Tip')).toBe('Cone');
  await expect(page.locator('#viewer-after .preview-notice')).toContainText(
    'Navigation settings are compared but not applied',
  );
  await expect(page.locator('#viewer-after .viewer-state')).toHaveText('');
});

test('an X3D 4.0 revision is compared with its 3.3 original', async ({ page }) => {
  const fixture = (name: string) =>
    readFileSync(new URL(`../fixtures/version/${name}`, import.meta.url));
  await load(page, fixture('before.x3d'), fixture('after.x3d'));
  // Complete, with notes: the version note and the external content that is not loaded.
  await expect(page.locator('#report-status')).toHaveText('With notes');
  await expect(page.locator('#incomplete-banner')).toBeHidden();
  await expect(page.locator('#change-count')).toHaveText('3');
  await expect(page.locator('#changes')).toContainText('X3D version');
  await expect(page.locator('#changes .revision-value.before')).toContainText(['3.3']);
  await expect(page.locator('#changes .revision-value.after')).toContainText(['4.0']);
  await expect(page.locator('#diagnostics')).toContainText(
    'X3D 4.0 file read with the X3D 3.3 catalog',
  );

  // A version the tool does not know is still refused, with the reason.
  await page.locator('#after-file').setInputFiles({
    name: 'future.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from(
      fixture('after.x3d').toString('utf8').replace("version='4.0'", "version='5.0'"),
    ),
  });
  await expect(page.locator('#global-status')).toContainText(
    'Only X3D 3.0 to 4.0 files are supported',
  );
  await expect(page.locator('.analysis-panel')).toBeHidden();
});
