import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { sampleSurface, summarizeSurface } from '../src/viewer/surfaceDeviation';

const triangle = (z: number) =>
  new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([-1, -1, z, 1, -1, z, 0, 1, z], 3),
  );
it('measures known nearest-surface distances in both directions', async () => {
  const a = triangle(0),
    b = triangle(2);
  for (const samples of [await sampleSurface(a, b), await sampleSurface(b, a)]) {
    expect(samples).toHaveLength(1);
    expect(samples[0].distance).toBeCloseTo(2);
    expect(summarizeSurface(samples)).toEqual({ area: 2, mean: 2, rms: 2, max: 2 });
  }
  expect((await sampleSurface(a, a))[0].distance).toBeCloseTo(0);
  a.dispose();
  b.dispose();
});
it('weights statistics by triangle area instead of vertex density', async () => {
  const a = triangle(0),
    b = triangle(1),
    [sample] = await sampleSurface(a, b);
  const stats = summarizeSurface([
    { ...sample, distance: 1, area: 1 },
    { ...sample, distance: 3, area: 3 },
  ]);
  expect(stats.mean).toBe(2.5);
  expect(stats.rms).toBeCloseTo(Math.sqrt(7));
  expect(stats.max).toBe(3);
  a.dispose();
  b.dispose();
});
it('stops cancelled analysis', async () => {
  const a = triangle(0),
    b = triangle(1),
    controller = new AbortController();
  controller.abort();
  await expect(sampleSurface(a, b, controller.signal)).rejects.toThrow();
  a.dispose();
  b.dispose();
});
