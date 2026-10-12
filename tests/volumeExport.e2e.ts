import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const scene = (geometry: string) =>
  `<X3D version="3.3"><Scene><Shape DEF="Part">${geometry}</Shape></Scene></X3D>`;
const plate = (width: number) =>
  scene(
    `<IndexedFaceSet coordIndex="0 1 2 -1"><Coordinate point="0 0 0 ${width} 0 0 0 1 0"/></IndexedFaceSet>`,
  );
const load = async (page: Page, before: string, after: string) => {
  await page.goto('app.html');
  for (const [side, xml] of [
    ['before', before],
    ['after', after],
  ] as const) {
    await page.setInputFiles(`#file-${side}`, {
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(xml),
    });
  }
  await expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('tab', { name: 'Volume differences' })).toBeVisible();
};
const exportedVolume = async (page: Page) => {
  const downloaded = page.waitForEvent('download');
  await page.selectOption('#export', 'html');
  const download = await downloaded;
  const html = await readFile((await download.path())!, 'utf8');
  const volume = html.match(/<section[^>]*>\s*<h3>Volume differences[\s\S]*?<\/section>/)?.[0];
  expect(volume).toBeDefined();
  return volume!;
};

for (const opened of [false, true]) {
  test(`an open mesh exports unavailable volume ${opened ? 'after opening' : 'without opening'} the volume view`, async ({
    page,
  }) => {
    await load(page, plate(1), plate(2));
    if (opened) {
      await page.getByRole('tab', { name: 'Volume differences' }).click();
      await expect(page.locator('#detail')).toHaveText('No closed solid to measure');
    }
    const volume = await exportedVolume(page);
    expect(volume).toContain('Not measured: no closed solid to measure');
    expect(volume).not.toContain('<table');
    expect(volume).not.toContain('Net change');
    expect(volume).not.toContain('Changed space');
  });
}

test('closed solids still export measured volumes including a valid zero region', async ({
  page,
}) => {
  await load(page, scene('<Box size="1 1 1"/>'), scene('<Box size="2 1 1"/>'));
  await page.getByRole('tab', { name: 'Volume differences' }).click();
  await expect(page.locator('#detail')).toHaveText('A ∩ B / A = 100 %');
  const volume = await exportedVolume(page);
  expect(volume).not.toContain('Not measured');
  expect(volume).toContain('Before only (scene units³)</th><td>0</td>');
  expect(volume).toContain('Before volume → after volume</th><td>1 → 2</td>');
  expect(volume).toContain('Net change</th><td>+1</td>');
});
