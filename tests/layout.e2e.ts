import { test, expect, type Page } from '@playwright/test';

const settled = async (page: Page) => {
  await expect(page.locator('.review-workspace')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#changes tbody tr').first()).toBeVisible();
};
/** Where the register sits: its heading and its first rows, against the window. */
const register = (page: Page) =>
  page.evaluate(() => {
    const heading = document.querySelector('.register-heading')!.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('#changes tbody tr'))
      .filter((row) => !(row as HTMLElement).hidden)
      .map((row) => row.getBoundingClientRect());
    return {
      headingBottom: heading.bottom,
      rowsInView: rows.filter((row) => row.top >= 0 && row.bottom <= innerHeight).length,
      scrolled: scrollY,
      window: innerHeight,
    };
  });
const EXAMPLES = ['fitlab', 'forgeworks', 'brickhaven', 'example', 'dolphin'] as const;

test('every example opens side by side, with the register in view at 1440×900', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const id of EXAMPLES) {
    await page.goto(`app.html?example=${id}`);
    await settled(page);
    await expect(page.locator('.review-workspace'), id).not.toHaveClass(/expanded/);
    await expect(page.locator('#expand'), id).toHaveAttribute('aria-pressed', 'false');
    const seen = await register(page);
    expect(seen.scrolled, id).toBe(0);
    expect(seen.headingBottom, id).toBeLessThan(seen.window / 3);
    expect(seen.rowsInView, id).toBeGreaterThanOrEqual(3);
    // The scene and the register share the row.
    const scene = (await page.locator('.scene-panel').boundingBox())!;
    const panel = (await page.locator('.analysis-panel').boundingBox())!;
    expect(panel.x, id).toBeGreaterThanOrEqual(scene.x + scene.width - 1);
    expect(Math.abs(panel.y - scene.y), id).toBeLessThan(2);
  }
  // The examples menu gives the same layout as the links.
  for (const id of ['brickhaven', 'dolphin']) {
    await page.locator('#demo-trigger').click();
    await page.locator(`[data-demo="${id}"]`).click();
    await expect(page.locator('#load-after')).toHaveAttribute(
      'title',
      id === 'dolphin' ? /Dolphin/ : /Brickhaven/,
    );
    await settled(page);
    await expect(page.locator('.review-workspace'), id).not.toHaveClass(/expanded/);
  }
});

test('a saved layout choice still decides how every example opens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('app.html?example=dolphin');
  await settled(page);
  // Focus on the scene: remembered for the animated examples and the small ones alike.
  await page.locator('#expand').click();
  await expect(page.locator('.review-workspace')).toHaveClass(/expanded/);
  for (const id of ['brickhaven', 'example']) {
    await page.goto(`app.html?example=${id}`);
    await settled(page);
    await expect(page.locator('.review-workspace'), id).toHaveClass(/expanded/);
    await expect(page.locator('#expand'), id).toHaveAttribute('aria-pressed', 'true');
  }
  // Back to the split view: remembered too.
  await page.locator('#expand').click();
  await expect(page.locator('.review-workspace')).not.toHaveClass(/expanded/);
  for (const id of ['forgeworks', 'dolphin']) {
    await page.goto(`app.html?example=${id}`);
    await settled(page);
    await expect(page.locator('.review-workspace'), id).not.toHaveClass(/expanded/);
  }
});
