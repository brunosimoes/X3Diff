import { BufferGeometry, Triangle, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export type SurfaceSample = {
  triangle: number;
  vertices: [Vector3, Vector3, Vector3];
  center: Vector3;
  nearest: Vector3;
  distance: number;
  area: number;
};
export type SurfaceStats = { mean: number; rms: number; max: number; area: number };
export function summarizeSurface(samples: SurfaceSample[]): SurfaceStats {
  const area = samples.reduce((sum, p) => sum + p.area, 0);
  return {
    area,
    mean: area ? samples.reduce((sum, p) => sum + p.area * p.distance, 0) / area : 0,
    rms: area ? Math.sqrt(samples.reduce((sum, p) => sum + p.area * p.distance ** 2, 0) / area) : 0,
    max: samples.reduce((max, p) => Math.max(max, p.distance), 0),
  };
}

/** One nearest-surface sample per nondegenerate triangle, at its centroid. */
export async function sampleSurface(
  source: BufferGeometry,
  target: BufferGeometry,
  signal?: AbortSignal,
): Promise<SurfaceSample[]> {
  const bvh = new MeshBVH(target, { indirect: true });
  const positions = source.getAttribute('position'),
    indices = source.getIndex();
  const samples: SurfaceSample[] = [];
  for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
    if (i % 768 === 0) {
      signal?.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const vertices = [0, 1, 2].map((j) =>
      new Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j),
    ) as [Vector3, Vector3, Vector3];
    const tri = new Triangle(...vertices),
      area = tri.getArea();
    if (!(area > 0)) continue;
    const center = tri.getMidpoint(new Vector3()),
      nearest = bvh.closestPointToPoint(center);
    if (!nearest || !Number.isFinite(nearest.distance))
      throw new Error('Could not measure this surface.');
    samples.push({
      triangle: i / 3,
      vertices,
      center,
      nearest: nearest.point.clone(),
      distance: nearest.distance,
      area,
    });
  }
  signal?.throwIfAborted();
  if (!samples.length) throw new Error('No nondegenerate surface triangles are available.');
  return samples;
}
