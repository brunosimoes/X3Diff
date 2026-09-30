import { expect, test, type Page } from '@playwright/test';

async function highlighted(page: Page, node: string, pane = 'diff') {
  return page.evaluate(
    ({ node, pane }) => {
      const scene = (document.querySelector(`#viewer-${pane} x3d-canvas`) as any)?.browser
        ?.currentScene;
      try {
        return !!scene.getNamedNode(node).getField('bboxDisplay').getValue().valueOf();
      } catch {
        return false;
      }
    },
    { node, pane },
  );
}

test('analysis object selectors highlight the matching scene object across views and volume mode', async ({
  page,
}) => {
  await page.goto('/app.html');
  for (const [side, size] of [
    ['before', 2],
    ['after', 3],
  ] as const) {
    const xml = `<X3D version="3.3"><Scene><Transform translation="-3 0 0"><Shape DEF="First"><Box size="${size} 2 2"/></Shape></Transform><Transform translation="3 0 0"><Shape DEF="Second"><Box size="${size} 2 2"/></Shape></Transform></Scene></X3D>`;
    await page.locator(`#${side}-file`).setInputFiles({
      name: side + '.x3d',
      mimeType: 'application/xml',
      buffer: Buffer.from(xml),
    });
  }
  await expect(page.locator('#global-status')).toHaveText('');
  await page.locator('#analysis-tab-sections').click();
  await expect.poll(() => highlighted(page, 'A_First')).toBe(true);
  await page.locator('#section-object').selectOption({ label: 'Second' });
  await expect.poll(() => highlighted(page, 'A_Second')).toBe(true);
  await expect.poll(() => highlighted(page, 'B_Second')).toBe(true);
  await expect.poll(() => highlighted(page, 'A_First')).toBe(false);
  await page.locator('[data-view="before"]').click();
  await expect.poll(() => highlighted(page, 'Second', 'before')).toBe(true);
  await page.locator('[data-view="diff"]').click();
  await expect.poll(() => highlighted(page, 'A_Second')).toBe(true);
  await page.locator('#analysis-tab-deviation').click();
  await page.locator('#surface-deviation .surface-object').selectOption({ label: 'Second' });
  await expect.poll(() => highlighted(page, 'A_Second')).toBe(true);
  await page.locator('#analysis-tab-sections').click();
  await expect(page.locator('#section-object')).toHaveValue('1');
  await expect.poll(() => highlighted(page, 'A_Second')).toBe(true);
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#volume-status')).toHaveText('First');
  await expect.poll(() => highlighted(page, 'A_First')).toBe(true);
  await expect.poll(() => highlighted(page, 'B_First')).toBe(true);
  await expect.poll(() => highlighted(page, 'A_Second')).toBe(false);
  await page.locator('[data-view="after"]').click();
  await expect.poll(() => highlighted(page, 'First', 'after')).toBe(true);
});
