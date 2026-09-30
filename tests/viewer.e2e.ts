import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = readFileSync(
  new URL('../fixtures/security/external-resources.x3d', import.meta.url),
  'utf8',
);

test('all examples render, volume works, and canvases survive repeated comparisons', async ({
  page,
}) => {
  await page.goto('/app.html');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('x3d-canvas')).every((n) => (n as any).browser),
  );
  await page.evaluate(() => {
    (window as any).originalCanvases = Array.from(document.querySelectorAll('x3d-canvas'));
  });
  for (const demo of ['example', 'brickhaven', 'forgeworks', 'fitlab', 'dolphin']) {
    await page.locator('#demo-trigger').click();
    await page.locator('[data-demo="' + demo + '"]').click();
    await expect(page.locator('.review-workspace')).toBeVisible();
    await expect(page.locator('#global-status')).toHaveText('');
    await expect(page.locator('#global-status')).not.toHaveClass(/error/);
    await expect(
      page.locator('.viewer-state').filter({ hasText: 'Preview unavailable' }),
    ).toHaveCount(0);
    if (demo === 'fitlab') {
      await expect(page.locator('#scene-note')).toBeHidden();
      await page.locator('#analysis-tab-volume').click();
      await page.locator('[data-region="shared"]').click();
      await expect(page.locator('[data-region="shared"]')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('#analysis-tab-differences').click();
      await page.locator('.object-group .object-link').first().click();
      await expect(page.locator('.change-row.selected')).toHaveCount(1);
      await expect(page.locator('.group-heading.contains-selection')).toHaveCount(1);
      await expect(page.locator('.group-heading.selected')).toHaveCount(0);
      await page.locator('#analysis-tab-differences').click();
      await expect(page.locator('#region')).toBeHidden();
      await expect(page.locator('.contains-selection')).toHaveCount(1);
    }
  }
  for (let i = 0; i < 8; i++) {
    await page.locator('#settings-trigger').click();
    await page.locator('#apply-settings').click();
    await expect(page.locator('.review-workspace')).toBeVisible();
    await expect(page.locator('#global-status')).toHaveText('');
  }
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('x3d-canvas')).every(
        (n, i) =>
          n === (window as any).originalCanvases[i] &&
          !(n as any).browser.getContext().isContextLost(),
      ),
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/dolphin-review.png', fullPage: true });
});

test('sanitizes hostile XML before renderer import without content network requests', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/app.html');
  const result = await page.evaluate(async (xml) => {
    const path = '/src/viewer/sanitize.ts';
    const { sanitizePreview } = await import(path);
    const source = xml.replace(
      '</Scene>',
      '<Background backUrl="&quot;https://example.invalid/probe.png&quot;"/><Group xmlns:x="urn:foreign" x:url="https://example.invalid/probe" onclick="fetch(1)"/><Unknown url="https://example.invalid/probe"/></Scene>',
    );
    const safe = sanitizePreview(source);
    const panePath = '/src/viewer/X3DPane.ts';
    const { X3DPane } = await import(panePath);
    const pane = new X3DPane('Security test');
    document.body.append(pane.element);
    await pane.load(source);
    const doc = new DOMParser().parseFromString(safe.xml, 'application/xml');
    return {
      unsafe: Array.from(doc.getElementsByTagName('*')).flatMap((n) =>
        Array.from(n.attributes)
          .filter((a) => /url$|^src$|^href$|^on/i.test(a.localName))
          .map((a) => a.name),
      ),
      state: pane.element.querySelector('.viewer-state')?.textContent,
      notices: safe.notices,
    };
  }, fixture);
  expect(result.unsafe).toEqual([]);
  expect(result.notices.length).toBeGreaterThan(0);
  expect(result.state).toBe('');
  expect(
    requests.filter((url) => url.includes('example.invalid') || url.includes(':5175')),
  ).toEqual([]);
});

test('overlay and solid-region builders retain added and removed geometry', async ({ page }) => {
  await page.goto('/app.html');
  const result = await page.evaluate(async () => {
    const cp = '/src/diff/compare.ts',
      dp = '/src/viewer/diffScene.ts',
      sp = '/src/viewer/solidRegions.ts';
    const { compareX3D } = await import(cp),
      { buildDiffScene } = await import(dp),
      { buildSolidRegions } = await import(sp);
    const [a, b] = await Promise.all(
      ['before', 'after'].map((side) =>
        fetch('/examples/fitlab/' + side + '.x3d').then((r) => r.text()),
      ),
    );
    const report = compareX3D(a, b),
      overlay = buildDiffScene(a, b, report),
      solid = buildSolidRegions(a, b, report);
    return {
      counts: overlay.shapeCounts,
      regions: solid?.triangleCounts,
      label: solid?.label,
      xml: solid?.xml,
    };
  });
  expect(result.counts.added).toBeGreaterThan(0);
  expect(result.counts.removed).toBeGreaterThan(0);
  expect(result.label).toBeTruthy();
  expect(result.xml).toContain('X3DIFF_BEFORE_ONLY_VISIBILITY');
  expect(Object.values(result.regions! as Record<string, number>).every((n) => n > 0)).toBe(true);
});

test('automatic comparisons can be cancelled while waiting for a worker', async ({ page }) => {
  // Keep the result pending deterministically; automatic dispatch can otherwise finish
  // before Playwright reaches Cancel. Engine cancellation is covered by workerClient tests.
  await page.route('**/src/diff/compare.worker.ts*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'self.onmessage = () => {};',
    }),
  );
  await page.goto('/app.html');
  const xml =
    '<X3D version="3.3"><Scene><Group>' + '<Shape><Box/></Shape>' + '</Group></Scene></X3D>';
  for (const side of ['before', 'after'])
    await page.locator('#' + side + '-file').setInputFiles({
      name: side + '.x3d',
      mimeType: 'application/xml',
      buffer: Buffer.from(xml),
    });
  await expect(page.locator('#compare')).toHaveText('Cancel');
  await page.locator('#theme').click();
  await page.locator('#compare').click();
  await expect(page.locator('#global-status')).toHaveText('Comparison cancelled.');
  await expect(page.locator('#compare')).toBeHidden();
});

test('preview rejects excessive nesting and preserves USE declarations', async ({ page }) => {
  await page.goto('/app.html');
  const result = await page.evaluate(async () => {
    const path = '/src/viewer/sanitize.ts';
    const { sanitizePreview } = await import(path);
    const x =
      '<X3D version="3.3"><Scene><Shape DEF="S"><Box/></Shape><Shape USE="S"/></Scene></X3D>';
    const safe = sanitizePreview(x);
    const doc = new DOMParser().parseFromString(safe.xml, 'application/xml');
    let depthError = '';
    try {
      sanitizePreview(
        '<X3D><Scene>' + '<Group>'.repeat(5000) + '</Group>'.repeat(5000) + '</Scene></X3D>',
      );
    } catch (e) {
      depthError = (e as Error).message;
    }
    return { both: !!doc.querySelector('Shape[USE][DEF]'), depthError };
  });
  expect(result.both).toBe(false);
  expect(result.depthError).toContain('nesting');
});

test('remembers display, region and layout across comparisons, examples and reloads', async ({
  page,
}) => {
  const load = async (demo: string) => {
    await page.locator('#demo-trigger').click();
    await page.locator(`[data-demo="${demo}"]`).click();
    await expect(page.locator('.review-workspace')).toBeVisible();
    await expect(page.locator('#global-status')).toHaveText('');
  };
  await page.goto('/app.html');
  await load('fitlab');
  await page.locator('#analysis-tab-differences').click();
  await page.locator('#expand').click();
  await page.locator('#settings-trigger').click();
  await page.locator('#apply-settings').click();
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#viewer-diff')).toBeVisible();
  await expect(page.locator('.review-workspace')).not.toHaveClass(/expanded/);
  await load('forgeworks');
  await page.locator('[data-view="diff"]').click();
  await expect(page.locator('#viewer-diff')).toBeVisible();
  await expect(page.locator('.review-workspace')).not.toHaveClass(/expanded/);
  await page.reload();
  await load('fitlab');
  await expect(page.locator('#viewer-diff')).toBeVisible();
  await expect(page.locator('.review-workspace')).not.toHaveClass(/expanded/);
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#region')).toBeVisible();
  await page.locator('[data-region="shared"]').click();
  await page.locator('#expand').click();
  await page.reload();
  await load('fitlab');

  await expect(page.locator('[data-region="shared"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.review-workspace')).toHaveClass(/expanded/);
});
