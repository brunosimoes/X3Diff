import { test, expect, type Page } from '@playwright/test';

/** A pallet carried along a rectangular route; `reach` and `lift` change the route. */
const carrier = (reach: number, lift: number, cycle: number) =>
  `<X3D profile="Immersive" version="3.3"><Scene>` +
  `<Shape><Box size="12 0.2 6"/></Shape>` +
  `<Transform DEF="Pallet" translation="-4 0.6 0"><Shape><Box size="1.4 1 1.4"/></Shape></Transform>` +
  `<TimeSensor DEF="PalletClock" cycleInterval="${cycle}" loop="true"/>` +
  `<PositionInterpolator DEF="PalletPath" key="0 0.25 0.5 0.75 1" keyValue="-4 0.6 0 -4 ${lift} 0 ${reach} ${lift} 0 ${reach} 0.6 0 -4 0.6 0"/>` +
  `<ROUTE fromNode="PalletClock" fromField="fraction_changed" toNode="PalletPath" toField="set_fraction"/>` +
  `<ROUTE fromNode="PalletPath" fromField="value_changed" toNode="Pallet" toField="set_translation"/>` +
  `</Scene></X3D>`;
const load = async (page: Page, before: string, after: string) => {
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
const painted = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.motion-3d canvas');
    return !!canvas && canvas.width > 100 && canvas.height > 100;
  });

test('Motion paths shows how a changed route differs, moment by moment', async ({ page }) => {
  await page.goto('app.html');
  await expect(page.locator('#global-status')).toHaveText('');
  // The register reports that the route's key values changed; the motion view shows how.
  await load(page, carrier(3, 3, 8), carrier(4.5, 4, 8));
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#incomplete-banner')).toBeHidden();
  await expect(page.locator('#changes')).toContainText('PalletPath');
  await page.locator('#analysis-tab-motion').click();

  const motion = page.locator('#motion-paths');
  await expect(motion.locator('.single-object-name')).toHaveText('Pallet');
  await expect(motion.locator('.motion-summary')).toContainText(
    'Pallet: the two revisions are up to 1.803 scene units apart, at 4 s.',
  );
  await expect(motion.locator('.motion-summary')).toContainText('Following its centre');
  await expect(motion.locator('.motion-max')).toHaveText('1.803 scene units');
  await expect(motion.locator('.motion-stats')).toContainText('18.8');
  await expect(motion.locator('.motion-stats')).toContainText('23.8');
  await expect(motion.locator('.motion-chart svg path')).toHaveCount(240);
  await expect.poll(() => painted(page)).toBe(true);

  // Scrubbing moves the readout: at the start both are at the same place, at 4 s furthest apart.
  await expect(motion.locator('.motion-now')).toHaveText('0 s · gap 0');
  await motion.locator('.motion-scrub').fill('120');
  await expect(motion.locator('.motion-now')).toHaveText('4 s · gap 1.803');
  await motion.locator('.motion-scrub').fill('60');
  await expect(motion.locator('.motion-now')).toHaveText('2 s · gap 1');

  // Play advances on its own and Pause stops it.
  await motion.locator('.motion-play').click();
  await expect(motion.locator('.motion-play')).toHaveText('Pause');
  await expect
    .poll(async () => Number(await motion.locator('.motion-scrub').inputValue()))
    .toBeGreaterThan(62);
  await motion.locator('.motion-play').click();
  await expect(motion.locator('.motion-play')).toHaveText('Play');

  // Phone width: no sideways scrolling.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(motion.locator('.motion-summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('a timing-only change reads as the same path at a different speed', async ({ page }) => {
  await page.goto('app.html?example=forgeworks');
  await expect(page.locator('#global-status')).toHaveText('');
  await page.locator('#analysis-tab-motion').click();
  const motion = page.locator('#motion-paths');
  await expect(motion.locator('.motion-object option')).toHaveText([
    'AssemblyRobotElbow',
    'AssemblyRobotShoulder',
  ]);
  await expect(motion.locator('.motion-summary')).toContainText('scene units apart');
  await expect(motion.locator('.motion-stats')).toContainText('6 s, repeating');
  await expect(motion.locator('.motion-stats')).toContainText('4 s, repeating');

  await motion.locator('.motion-mode').selectOption('phase');
  await expect(motion.locator('.motion-summary')).toContainText(
    'follows the same path in both files; only the timing differs',
  );
  await expect(motion.locator('.motion-max')).toHaveText('0 scene units');
  await motion.locator('.motion-object').selectOption({ label: 'AssemblyRobotShoulder' });
  await expect(motion.locator('.motion-summary')).toContainText('AssemblyRobotShoulder');
});

test('the tab is absent when nothing animated differs', async ({ page }) => {
  await page.goto('app.html?example=fitlab');
  await expect(page.locator('#global-status')).toHaveText('');
  await expect(page.locator('#analysis-tab-differences')).toBeVisible();
  await expect(page.locator('#analysis-tab-motion')).toHaveCount(0);
  // Same animation in both files, different static geometry.
  await load(page, carrier(3, 3, 8), carrier(3, 3, 8).replace('12 0.2 6', '14 0.2 6'));
  await expect(page.locator('#analysis-tab-differences')).toBeVisible();
  await expect(page.locator('#analysis-tab-motion')).toHaveCount(0);
});

test('a translating object still exposes a rotation change', async ({ page }) => {
  await page.goto('app.html');
  await expect(page.locator('#global-status')).toHaveText('');
  const rotate = (angle: number) =>
    carrier(3, 3, 8).replace(
      '</Scene>',
      `<OrientationInterpolator DEF="Turn" key="0 0.5 1" keyValue="0 1 0 0 0 1 0 ${angle} 0 1 0 0"/>` +
        '<ROUTE fromNode="PalletClock" fromField="fraction_changed" toNode="Turn" toField="set_fraction"/>' +
        '<ROUTE fromNode="Turn" fromField="value_changed" toNode="Pallet" toField="set_rotation"/></Scene>',
    );
  await load(page, rotate(0), rotate(Math.PI));
  await page.locator('#analysis-tab-motion').click();
  await expect(page.locator('.motion-summary')).toContainText('Following a corner of its bounds');
  await expect(page.locator('.motion-summary')).toContainText('scene units apart');
  await expect.poll(() => painted(page)).toBe(true);
});

test('a disabled clock remains disabled in the preview and static in motion analysis', async ({
  page,
}) => {
  await page.goto('app.html');
  await expect(page.locator('#global-status')).toHaveText('');
  const enabled = carrier(3, 3, 8);
  await load(page, enabled.replace('<TimeSensor ', '<TimeSensor enabled="false" '), enabled);
  for (const side of ['before', 'after'] as const) {
    await page.locator(`[data-view="${side}"]`).click();
    await expect
      .poll(() =>
        page.evaluate((side) => {
          const canvas = document.querySelector(`#viewer-${side} x3d-canvas`) as any;
          try {
            return canvas.browser.currentScene.getNamedNode('PalletClock').enabled;
          } catch {
            return undefined;
          }
        }, side),
      )
      .toBe(side === 'after');
  }
  await page.locator('#analysis-tab-motion').click();
  await expect(page.locator('.motion-stats')).toContainText('not animated');
  await expect(page.locator('.motion-summary')).toContainText('scene units apart');
});
