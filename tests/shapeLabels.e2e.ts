import { test, expect } from '@playwright/test';

const tetrahedron = (peak: number) =>
  `<Shape><IndexedFaceSet coordIndex="0 2 1 -1 0 1 3 -1 1 2 3 -1 0 3 2 -1"><Coordinate point="0 0 0 1 0 0 0 1 0 0 0 ${peak}"/></IndexedFaceSet></Shape>`;
// Four unnamed meshes: one alone in a named group, two sharing a named group, one loose.
const scene = (peak: number) =>
  `<X3D version="3.3"><Scene>` +
  `<Transform DEF="Bracket" translation="-2 0 0">${tetrahedron(peak)}</Transform>` +
  `<Transform DEF="Rack" translation="2 0 0">${tetrahedron(1)}${tetrahedron(peak)}</Transform>` +
  `<Transform translation="0 2 0">${tetrahedron(peak)}</Transform>` +
  `<Shape DEF="Named"><Box size="${peak} 1 1"/></Shape>` +
  `</Scene></X3D>`;

test('unnamed shapes get labels that tell them apart in every analysis view', async ({ page }) => {
  await page.goto('app.html');
  for (const [side, peak] of [
    ['before', 1],
    ['after', 1.7],
  ] as const)
    await page.locator(`#${side}-file`).setInputFiles({
      name: `${side}.x3d`,
      mimeType: 'application/xml',
      buffer: Buffer.from(scene(peak)),
    });
  await expect(page.locator('#global-status')).toHaveText('');

  const labels = [
    'IndexedFaceSet in Bracket',
    'IndexedFaceSet · shape 2 of 2 in Rack',
    'IndexedFaceSet · shape 4 of 5 in the file',
    'Named',
  ];
  await page.locator('#analysis-tab-sections').click();
  await expect(page.locator('#section-object option')).toHaveText(labels);
  await page.locator('#analysis-tab-deviation').click();
  await expect(page.locator('#surface-deviation .surface-object option')).toHaveText(labels);

  // The volume view names the pair it shows, not just its geometry type.
  await page.locator('#analysis-tab-volume').click();
  await expect(page.locator('#volume-status')).toHaveText('IndexedFaceSet in Bracket');
});
