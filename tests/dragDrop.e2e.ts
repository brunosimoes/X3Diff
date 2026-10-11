import { test, expect, type Page } from '@playwright/test';

const scene = (size: number) =>
  `<X3D version="3.3"><Scene><Shape DEF="Block"><Box size="${size} 2 2"/></Shape></Scene></X3D>`;
type Dropped = { name: string; text?: string; type?: string; bytes?: number[]; size?: number };

/** Dispatch the events a real file drag produces, on the stage or elsewhere. */
async function drag(page: Page, files: Dropped[], steps: string[], target = '.viewers') {
  const data = await page.evaluateHandle((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      const body = item.bytes ? new Uint8Array(item.bytes) : (item.text ?? '');
      const file = new File([body], item.name, { type: item.type ?? '' });
      if (item.size) Object.defineProperty(file, 'size', { value: item.size });
      transfer.items.add(file);
    }
    return transfer;
  }, files);
  for (const step of steps) await page.dispatchEvent(target, step, { dataTransfer: data });
}
const drop = (page: Page, files: Dropped[], target?: string) =>
  drag(page, files, ['dragenter', 'dragover', 'drop'], target);

test('dropping files on the stage loads them like the file buttons', async ({ page }) => {
  await page.goto('app.html');
  // The workbench opens on the Dolphin example. For drops that counts as empty:
  // the first dropped file starts the reviewer's own pair.
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Dolphin/);
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#stage-empty')).toContainText('drag them onto this area');

  // A visible target appears while dragging and goes away when the drag leaves.
  await expect(page.locator('#stage-drop')).toBeHidden();
  await drag(page, [{ name: 'a.x3d', text: scene(2) }], ['dragenter', 'dragover']);
  await expect(page.locator('#stage-drop')).toBeVisible();
  await expect(page.locator('#stage-drop')).toHaveClass(/over/);
  await expect(page.locator('#stage-drop')).toContainText('One file loads as Before');
  await drag(page, [{ name: 'a.x3d', text: scene(2) }], ['dragleave']);
  await expect(page.locator('#stage-drop')).toBeHidden();

  // One file fills the next empty side.
  await drop(page, [{ name: 'first.x3d', text: scene(2) }]);
  await expect(page.locator('#load-before')).toHaveAttribute('title', /first\.x3d/);
  await expect(page.locator('#load-after')).toHaveAttribute('data-state', 'missing');
  await expect(page.locator('#stage-drop')).toBeHidden();
  await drag(page, [{ name: 'b.x3d', text: scene(4) }], ['dragenter', 'dragover']);
  await expect(page.locator('#stage-drop')).toContainText('One file loads as After');
  await drop(page, [{ name: 'second.x3d', text: scene(4) }]);
  await expect(page.locator('#load-after')).toHaveAttribute('title', /second\.x3d/);
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#changes')).toContainText('4');

  // With both loaded, one more file replaces After.
  await drop(page, [{ name: 'third.x3d', text: scene(6) }]);
  await expect(page.locator('#load-after')).toHaveAttribute('title', /third\.x3d/);
  await expect(page.locator('#load-before')).toHaveAttribute('title', /first\.x3d/);
  await expect(page.locator('#changes')).toContainText('6');

  // Two files fill both sides in a stated order, whichever way round they arrive.
  await drop(page, [
    { name: 'bracket-v2.x3d', text: scene(8) },
    { name: 'bracket-v1.x3d', text: scene(3) },
  ]);
  await expect(page.locator('#global-status')).toHaveText(
    'Loaded bracket-v1.x3d as Before and bracket-v2.x3d as After (in file-name order).',
  );
  await expect(page.locator('#global-status')).not.toHaveClass(/error/);
  await expect(page.locator('#load-before')).toHaveAttribute('title', /bracket-v1\.x3d/);
  await expect(page.locator('#load-after')).toHaveAttribute('title', /bracket-v2\.x3d/);
  await expect(page.locator('#changes .revision-value.before')).toContainText('3');
  await expect(page.locator('#changes .revision-value.after')).toContainText('8');
  await drop(page, [
    { name: 'after.x3d', text: scene(5) },
    { name: 'before.x3d', text: scene(7) },
  ]);
  await expect(page.locator('#global-status')).toHaveText(
    'Loaded before.x3d as Before and after.x3d as After (from the words in the file names).',
  );
  await expect(page.locator('#changes .revision-value.before')).toContainText('7');

  // The file buttons still work afterwards.
  await page.locator('#after-file').setInputFiles({
    name: 'picked.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from(scene(9)),
  });
  await expect(page.locator('#load-after')).toHaveAttribute('title', /picked\.x3d/);
  await expect(page.locator('#changes')).toContainText('9');
});

test('dropped files get the same type and size checks as picked files', async ({ page }) => {
  await page.goto('app.html');
  // The workbench opens on the Dolphin example. For drops that counts as empty:
  // the first dropped file starts the reviewer's own pair.
  await expect(page.locator('#load-after')).toHaveAttribute('title', /Dolphin/);
  await expect(page.locator('#global-status')).toHaveText('');
  await drop(page, [{ name: 'notes.txt', text: 'hello', type: 'text/plain' }]);
  await expect(page.locator('#global-status')).toHaveClass(/error/);
  await expect(page.locator('#global-status')).toHaveText(
    'Only .x3d or .xml files can be loaded here: notes.txt is not one.',
  );
  await expect(page.locator('#load-before')).toHaveAttribute('title', /Dolphin/);

  await drop(page, [
    { name: 'a.x3d', text: scene(1) },
    { name: 'b.x3d', text: scene(2) },
    { name: 'c.x3d', text: scene(3) },
  ]);
  await expect(page.locator('#global-status')).toHaveText(
    'Drop one or two files: a Before and an After revision.',
  );

  await drop(page, [{ name: 'huge.x3d', text: scene(1), size: 21 * 1024 * 1024 }]);
  await expect(page.locator('#global-status')).toHaveText('Files must be at most 20 MiB.');
  await expect(page.locator('#load-before')).toHaveAttribute('data-state', 'missing');

  await drop(page, [{ name: 'latin1.x3d', bytes: [0xff, 0xff] }]);
  await expect(page.locator('#global-status')).toContainText('not UTF-8');

  // In a pair, the readable file still loads and the other is named in the error.
  await drop(page, [
    { name: 'good-v1.x3d', text: scene(2) },
    { name: 'good-v2.x3d', bytes: [0xff, 0xff] },
  ]);
  await expect(page.locator('#global-status')).toHaveClass(/error/);
  await expect(page.locator('#global-status')).toContainText('good-v2.x3d: This file is not UTF-8');
  await expect(page.locator('#load-before')).toHaveAttribute('title', /good-v1\.x3d/);
  await expect(page.locator('#load-after')).toHaveAttribute('data-state', 'missing');

  // A drop that misses the stage loads nothing (and must not navigate away).
  await drop(page, [{ name: 'missed.x3d', text: scene(5) }], '.masthead');
  await expect(page.locator('#load-after')).toHaveAttribute('data-state', 'missing');
  await expect(page).toHaveURL(/app\.html$/);
});
