import { Vector3, type BufferGeometry } from 'three';

export interface RegionVolumes {
  beforeOnly: number;
  shared: number;
  afterOnly: number;
}

/** Signed tetrahedra for a closed, consistently wound surface. Use a nearby
 * origin so translating a small object far from zero does not lose precision. */
export function enclosedVolume(geometry: BufferGeometry): number {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!positions || positions.count === 0) return 0;
  const count = index?.count ?? positions.count;
  if (count % 3) throw new Error('Volume requires triangulated geometry.');
  const origin = new Vector3().fromBufferAttribute(positions, 0);
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  let sum = 0,
    correction = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(i) : i).sub(origin);
    b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1).sub(origin);
    c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2).sub(origin);
    const term = a.dot(b.cross(c)) / 6 - correction;
    const next = sum + term;
    correction = next - sum - term;
    sum = next;
  }
  if (!Number.isFinite(sum)) throw new Error('Volume result is not finite.');
  return Math.abs(sum);
}

export function summarizeVolumes(volumes: RegionVolumes) {
  const before = volumes.beforeOnly + volumes.shared;
  const after = volumes.afterOnly + volumes.shared;
  return {
    before,
    after,
    net: volumes.afterOnly - volumes.beforeOnly,
    changed: volumes.beforeOnly + volumes.afterOnly,
    retained: before > 0 ? (volumes.shared / before) * 100 : null,
  };
}
