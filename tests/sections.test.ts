import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { closestOnSection, sliceGeometry } from '../src/viewer/sections';

describe('world-coordinate sections', () => {
  it('cuts a translated box in the correct plane with physical extents', () => {
    const box = new BoxGeometry(2, 4, 6).translate(10, 20, 30);
    const segments = sliceGeometry(box, 2, 30);
    const points = segments.flat();
    expect(segments).toHaveLength(8);
    expect(points.every((p) => p.z === 30)).toBe(true);
    expect(Math.min(...points.map((p) => p.x))).toBe(9);
    expect(Math.max(...points.map((p) => p.x))).toBe(11);
    expect(Math.min(...points.map((p) => p.y))).toBe(18);
    expect(Math.max(...points.map((p) => p.y))).toBe(22);
    expect(sliceGeometry(box, 2, 40)).toEqual([]);
    box.dispose();
  });
  it('handles a plane through vertices without zero-length segments', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 2], 3));
    const segments = sliceGeometry(geometry, 2, 0);
    expect(segments).toHaveLength(1);
    expect(segments[0][0].distanceTo(segments[0][1])).toBe(2);
    expect(sliceGeometry(geometry, 2, 2)).toEqual([]);
    geometry.dispose();
  });
  it('does not fill a coplanar triangle with spurious diagonals', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
    expect(sliceGeometry(geometry, 2, 0)).toEqual([]);
    geometry.dispose();
  });
  it('snaps a ruler point to the segment interior, not only vertices', () => {
    const point = closestOnSection(new Vector3(1, 3, 0), [
      [new Vector3(0, 0, 0), new Vector3(4, 0, 0)],
    ]);
    expect(point?.toArray()).toEqual([1, 0, 0]);
    expect(closestOnSection(new Vector3(), [])).toBeUndefined();
  });
});
