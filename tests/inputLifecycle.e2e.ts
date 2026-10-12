import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const settled = (page: Page) =>
  expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
const scene = (radius: number) =>
  `<X3D version="3.3"><Scene><Shape DEF="Ball"><Sphere radius="${radius}"/></Shape></Scene></X3D>`;
const input = (name: string, text = scene(1)) => ({
  name,
  mimeType: 'application/xml',
  buffer: Buffer.from(text),
});

/** Hold one file read until the test releases it, independent of machine timing. */
async function holdRead(page: Page) {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    (window as any).readWaiting = false;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'slow.x3d') {
        (window as any).readWaiting = true;
        await new Promise<void>((resolve) => ((window as any).releaseRead = resolve));
      }
      return original.call(this);
    };
  });
  await page.setInputFiles('#file-before', input('slow.x3d'));
  await expect.poll(() => page.evaluate(() => (window as any).readWaiting)).toBe(true);
}

test('a late read cannot overwrite a newer file on the same side', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  await holdRead(page);
  await page.setInputFiles('#file-before', input('latest.x3d'));
  await page.setInputFiles('#file-after', input('after.x3d', scene(2)));
  await settled(page);
  await page.evaluate(() => (window as any).releaseRead());
  // The obsolete continuation would start another comparison before this poll.
  await expect(page.locator('#name-before')).toHaveText('latest.x3d');
  await settled(page);
  await expect(page.locator('#name-before')).toHaveText('latest.x3d');
});

test('the A and B buttons open their own file pickers and finish the pair', async ({ page }) => {
  await page.goto('app.html?example=example');
  await settled(page);
  for (const side of ['before', 'after'] as const) {
    const picker = page.waitForEvent('filechooser');
    await page.locator(`#open-${side}`).click();
    await (await picker).setFiles(input(`${side}.x3d`, scene(side === 'before' ? 1 : 2)));
  }
  await settled(page);
  await expect(page.locator('#caption')).toHaveText('1 difference');
});

test('choosing an example cancels pending personal file reads', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  await holdRead(page);
  await page.selectOption('#example', 'example');
  await settled(page);
  await expect(page.locator('#caption')).toHaveText('7 differences');
  await page.evaluate(() => (window as any).releaseRead());
  await expect(page.locator('#name-before')).toHaveText('Objects · original');
  await expect(page.locator('#caption')).toHaveText('7 differences');
});

test('reads of opposite sides can finish in either order', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  await holdRead(page);
  await page.setInputFiles('#file-after', input('after.x3d', scene(2)));
  await expect(page.locator('#caption')).toHaveText('Choose the original file');
  await page.evaluate(() => (window as any).releaseRead());
  await expect(page.locator('#caption')).toHaveText('1 difference');
  await settled(page);
  await expect(page.locator('#name-before')).toHaveText('slow.x3d');
  await expect(page.locator('#name-after')).toHaveText('after.x3d');
});

test('a rejected replacement cannot silently restore an earlier input', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  await page.setInputFiles('#file-before', input('before.x3d'));
  await page.setInputFiles('#file-after', input('after.x3d', scene(2)));
  await settled(page);
  await page.setInputFiles('#file-before', {
    name: 'invalid.x3d',
    mimeType: 'application/xml',
    buffer: Buffer.from([0xff]),
  });
  await expect(page.locator('#caption')).toHaveText('That file could not be read');
  await page.setInputFiles('#file-after', input('new-after.x3d', scene(3)));
  await expect(page.locator('#caption')).toHaveText('Choose the original file');
  await expect(page.locator('#export')).toBeDisabled();
});

test('curved solid measurements disclose approximation and export analyses', async ({ page }) => {
  await page.goto('app.html');
  await settled(page);
  await page.setInputFiles('#file-before', input('before.x3d'));
  await page.setInputFiles('#file-after', input('after.x3d', scene(2)));
  await settled(page);
  await page.getByRole('tab', { name: 'Volume differences' }).click();
  await expect(page.locator('#side')).toContainText('Approximate tessellated Boolean geometry');
  await expect(page.locator('#side .limits')).toContainText('World coordinates');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.selectOption('#export', 'html'),
  ]);
  const html = readFileSync((await download.path())!, 'utf8');
  expect(html).toContain('Original volume retained');
  expect(html).toContain('Surface deviation');
  expect(html).toContain('Curved surfaces depend on resolution');
});

test('discarding a comparison releases its slice observer and WebGL context', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeObserver = ResizeObserver;
    const active = new Set<Element>();
    (window as any).activeSliceObservers = () => active.size;
    window.ResizeObserver = class extends NativeObserver {
      private targets = new Set<Element>();
      observe(target: Element, options?: ResizeObserverOptions) {
        if (target.classList.contains('slice-3d')) {
          active.add(target);
          this.targets.add(target);
        }
        super.observe(target, options);
      }
      disconnect() {
        this.targets.forEach((target) => active.delete(target));
        this.targets.clear();
        super.disconnect();
      }
    };
    (window as any).lostSliceContexts = 0;
  });
  await page.goto('app.html?example=example');
  await settled(page);
  await page.getByRole('tab', { name: 'Slice and measure' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).activeSliceObservers())).toBe(1);
  // Context loss is asynchronous: the canvas may be detached before its event fires.
  await page.locator('.slice-3d canvas').evaluate((canvas) => {
    canvas.addEventListener('webglcontextlost', () => (window as any).lostSliceContexts++);
  });
  await page.selectOption('#example', 'brickhaven');
  await settled(page);
  await expect.poll(() => page.evaluate(() => (window as any).activeSliceObservers())).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as any).lostSliceContexts)).toBe(1);
});
