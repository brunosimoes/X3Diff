import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildMeshRegions } from '../src/viewer/meshRegions';

const read = (pose: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/dolphin/${pose}.x3d`, import.meta.url)), 'utf8');
const geometry = (pose: string): Element => {
  const mesh = new DOMParser()
    .parseFromString(read(pose), 'application/xml')
    .getElementsByTagName('IndexedFaceSet')[0];
  const coordinate = mesh.getElementsByTagName('Coordinate')[0];
  return {
    hasAttribute: (name: string) => mesh.hasAttribute(name),
    getAttribute: (name: string) => mesh.getAttribute(name),
    children: [coordinate],
  } as unknown as Element;
};
const matrix = new Matrix4()
  .makeTranslation(0.12, -0.22, 0)
  .multiply(new Matrix4().makeRotationY(1.57))
  .multiply(new Matrix4().makeScale(0.1, 0.1, 0.1));

it('measures occupied cell volume against an analytic translated cube', () => {
  const mesh = new DOMParser().parseFromString(
    '<IndexedFaceSet coordIndex="0 3 2 1 -1 4 5 6 7 -1 0 4 7 3 -1 1 2 6 5 -1 0 1 5 4 -1 3 7 6 2 -1"><Coordinate point="-1 -1 -1 1 -1 -1 1 1 -1 -1 1 -1 -1 -1 1 1 -1 1 1 1 1 -1 1 1"/></IndexedFaceSet>',
    'application/xml',
  ).documentElement!;
  const element = {
    hasAttribute: (name: string) => mesh.hasAttribute(name),
    getAttribute: (name: string) => mesh.getAttribute(name),
    children: [mesh.getElementsByTagName('Coordinate')[0]],
  } as unknown as Element;
  const regions = buildMeshRegions(
    element,
    element,
    new Matrix4(),
    new Matrix4().makeTranslation(1, 0, 0),
    'low',
  );
  try {
    expect(regions.slice(0, 3).map((region) => region.userData.occupiedVolume)).toEqual([4, 4, 4]);
  } finally {
    regions.forEach((region) => region.dispose());
  }
});

describe('open Dolphin volume preview', () => {
  it('produces nonempty exclusive and shared regions from both poses', () => {
    const regions = buildMeshRegions(geometry('before'), geometry('after'), matrix, matrix);
    try {
      const counts = regions.slice(0, 3).map((region) => region.getIndex()!.count / 3);
      expect(counts.every((count) => count > 0 && count <= 40_000)).toBe(true);
      expect(counts[1]).toBeGreaterThan(counts[0]);
      expect(counts[1]).toBeGreaterThan(counts[2]);
      for (const region of regions.slice(0, 3)) {
        expect(region.userData.occupiedVolume).toBeGreaterThan(0);
        expect(region.userData.occupiedVolume / region.userData.voxelSize ** 3).toBeCloseTo(
          Math.round(region.userData.occupiedVolume / region.userData.voxelSize ** 3),
          5,
        );
      }
    } finally {
      for (const region of regions) region.dispose();
    }
  });
});

it('high mesh resolution halves voxel size and retains all three dolphin regions', () => {
  const medium = buildMeshRegions(geometry('before'), geometry('after'), matrix, matrix, 'medium');
  const high = buildMeshRegions(geometry('before'), geometry('after'), matrix, matrix, 'high');
  try {
    expect(high[0].userData.voxelSize).toBeCloseTo(medium[0].userData.voxelSize / 2, 10);
    for (let i = 0; i < 3; i++) {
      expect(high[i].getIndex()!.count).toBeGreaterThan(medium[i].getIndex()!.count);
      expect(high[i].getIndex()!.count / 3).toBeLessThanOrEqual(160_000);
    }
  } finally {
    for (const geometry of [...medium, ...high]) geometry.dispose();
  }
});
