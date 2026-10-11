import { test, expect, type Page } from '@playwright/test';

const scene = (size: number) =>
  `<X3D version="3.3"><Scene><Shape DEF="Block"><Box size="${size} 2 2"/></Shape></Scene></X3D>`;
const file = (name: string, size: number) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(scene(size)),
});
/** Drop one file on the stage, as a drag from the desktop would. */
async function drop(page: Page, name: string, text: string) {
  const data = await page.evaluateHandle(
    ([fileName, body]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([body], fileName));
      return transfer;
    },
    [name, text],
  );
  for (const step of ['dragenter', 'dragover', 'drop'])
    await page.dispatchEvent('.viewers', step, { dataTransfer: data });
}
const dolphinLoaded = async (page: Page) => {
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Dolphin/);
  await expect(page.locator('#global-status')).toHaveText('');
};

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['phone', { width: 375, height: 812 }],
] as const)
  test(`with one file loaded the stage asks for the other (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('app.html');
    const next = page.locator('#stage-next');
    // The workbench opens on the Dolphin example, with both sides loaded.
    await dolphinLoaded(page);
    await expect(next).toBeHidden();

    // Dropping one file on an example starts the reviewer's own pair.
    await drop(page, 'original.x3d', scene(2));
    await expect(next).toBeVisible();
    await expect(next).toContainText(
      'Before is loaded (original.x3d). Next, choose the After file, or drop it here.',
    );
    await expect(next.getByRole('button')).toHaveText('Choose After file…');
    await expect(page.locator('#load-after')).toHaveAttribute('data-state', 'missing');
    // The loaded revision stays visible behind the prompt, and the prompt fits the stage.
    await expect(page.locator('#viewer-before x3d-canvas')).toBeVisible();
    expect(
      await page.evaluate(() => {
        const stage = document.querySelector('.viewers')!.getBoundingClientRect();
        const box = document.querySelector('#stage-next')!.getBoundingClientRect();
        return (
          box.left >= stage.left &&
          box.right <= stage.right &&
          box.top >= stage.top &&
          box.bottom <= stage.bottom &&
          box.height < stage.height / 2 &&
          document.documentElement.scrollWidth <= innerWidth + 1
        );
      }),
    ).toBe(true);

    // Its button opens the picker for the missing side.
    const chooser = page.waitForEvent('filechooser');
    await next.getByRole('button').click();
    await (await chooser).setFiles(file('revision.x3d', 4));
    await expect(page.locator('#load-after')).toHaveAttribute('title', /revision\.x3d/);
    await expect(page.locator('#global-status')).toHaveText('');
    await expect(next).toBeHidden();
    await expect(page.locator('#changes')).toContainText('4');
  });

test('the prompt asks for Before when only After is left, and hides for examples', async ({
  page,
}) => {
  await page.goto('app.html');
  await dolphinLoaded(page);
  await page.locator('#before-file').setInputFiles(file('original.x3d', 2));
  await page.locator('#after-file').setInputFiles(file('revision.x3d', 4));
  await expect(page.locator('#changes')).toContainText('4');
  // An unreadable Before leaves only After loaded.
  await page.locator('#before-file').setInputFiles({
    name: 'wrong.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from([0xff, 0xff]),
  });
  const next = page.locator('#stage-next');
  await expect(next).toContainText('After is loaded (revision.x3d). Next, choose the Before file');
  await expect(next.getByRole('button')).toHaveText('Choose Before file…');
  await page.locator('#demo-trigger').click();
  await page.locator('[data-demo="example"]').click();
  await expect(next).toBeHidden();
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(next).toBeHidden();
});
