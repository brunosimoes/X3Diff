import type { VolumeResolution } from './shapeGeometry';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export function surfaceGeometry(node: Element, matrix: Matrix4): BufferGeometry {
  if (node.hasAttribute('USE') || node.getAttribute('ccw')?.toLowerCase() === 'false')
    throw new Error('Mesh regions need direct, CCW IndexedFaceSet geometry.');
  const coordinate = Array.from(node.children).find(
    (child) => child.localName === 'Coordinate' && !child.hasAttribute('USE'),
  );
  if (!coordinate) throw new Error('Mesh regions need direct Coordinate data.');
  const numbers = (value: string | null) =>
    (value ?? '')
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
  const points = numbers(coordinate.getAttribute('point'));
  const raw = numbers(node.getAttribute('coordIndex'));
  if (
    !points.length ||
    points.length % 3 ||
    points.length > 9000 ||
    !raw.length ||
    raw.length > 18_000 ||
    points.some((v) => !Number.isFinite(v)) ||
    raw.some((v) => !Number.isSafeInteger(v))
  )
    throw new Error('Mesh exceeds the bounded preview range.');
  const indices: number[] = [];
  let face: number[] = [];
  const flush = () => {
    if (!face.length) return;
    if (face.length < 3 || face.length > 16 || new Set(face).size !== face.length)
      throw new Error('Mesh has unsupported faces.');
    for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
    face = [];
  };
  for (const n of raw) {
    if (n === -1) flush();
    else {
      if (n < 0 || n >= points.length / 3) throw new Error('Mesh coordinate index is invalid.');
      face.push(n);
    }
  }
  flush();
  if (!indices.length || indices.length > 30_000)
    throw new Error('Mesh exceeds the bounded preview range.');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingBox();
  return geometry;
}

const faces = [
  {
    d: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    d: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    d: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    d: [0, 1, 0],
    corners: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    d: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
  {
    d: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
];

export function buildMeshRegions(
  beforeNode: Element,
  afterNode: Element,
  beforeMatrix: Matrix4,
  afterMatrix: Matrix4,
  resolution: VolumeResolution = 'medium',
): [BufferGeometry, BufferGeometry, BufferGeometry, BufferGeometry, BufferGeometry] {
  const before = surfaceGeometry(beforeNode, beforeMatrix);
  const after = surfaceGeometry(afterNode, afterMatrix);
  try {
    const bounds = before.boundingBox!.clone().union(after.boundingBox!);
    const size = bounds.getSize(new Vector3());
    if ([...bounds.min, ...bounds.max].some((v) => !Number.isFinite(v) || Math.abs(v) > 100_000))
      throw new Error('Mesh coordinates exceed the bounded preview range.');
    const divisions = resolution === 'high' ? 170 : resolution === 'low' ? 48 : 85;
    const step = Math.max(size.x, size.y, size.z) / divisions;
    if (step <= 0) throw new Error('Mesh bounds are degenerate.');
    bounds.expandByScalar(step);
    const nx = Math.ceil((bounds.max.x - bounds.min.x) / step);
    const ny = Math.ceil((bounds.max.y - bounds.min.y) / step);
    const nz = Math.ceil((bounds.max.z - bounds.min.z) / step);
    if (nx * ny * nz > 6_000_000)
      throw new Error('Mesh voxel grid exceeds the bounded preview range.');
    const at = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
    const occupancy = (geometry: BufferGeometry): Uint8Array => {
      const grid = new Uint8Array(nx * ny * nz);
      const bvh = new MeshBVH(geometry);
      const ray = new Ray(new Vector3(), new Vector3(0, 1, 0));
      for (let z = 0; z < nz; z++)
        for (let x = 0; x < nx; x++) {
          ray.origin.set(
            bounds.min.x + (x + 0.5) * step,
            bounds.min.y - step,
            bounds.min.z + (z + 0.5) * step,
          );
          const hits = bvh
            .raycast(ray, DoubleSide)
            .map((hit) => hit.point.y)
            .sort((a, b) => a - b);
          const cuts = hits.filter((v, i) => i === 0 || v - hits[i - 1] > step * 0.005);
          for (let i = 0; i + 1 < cuts.length; i += 2) {
            const lo = Math.max(0, Math.ceil((cuts[i] - bounds.min.y) / step - 0.5));
            const hi = Math.min(ny, Math.ceil((cuts[i + 1] - bounds.min.y) / step - 0.5));
            for (let y = lo; y < hi; y++) grid[at(x, y, z)] = 1;
          }
        }
      return grid;
    };
    const a = occupancy(before),
      b = occupancy(after);
    const category = new Uint8Array(a.length);
    for (let i = 0; i < category.length; i++)
      category[i] = a[i] && b[i] ? 2 : a[i] ? 1 : b[i] ? 3 : 0;
    const regions = ([1, 2, 3] as const).map((region) => {
      const vertices: number[] = [],
        indices: number[] = [],
        vertexMap = new Map<string, number>();
      const vertex = (x: number, y: number, z: number): number => {
        const key = `${x},${y},${z}`;
        const existing = vertexMap.get(key);
        if (existing !== undefined) return existing;
        const index = vertices.length / 3;
        vertices.push(bounds.min.x + x * step, bounds.min.y + y * step, bounds.min.z + z * step);
        vertexMap.set(key, index);
        return index;
      };
      for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
          for (let x = 0; x < nx; x++) {
            if (category[at(x, y, z)] !== region) continue;
            for (const face of faces) {
              const xx = x + face.d[0],
                yy = y + face.d[1],
                zz = z + face.d[2];
              if (
                xx >= 0 &&
                xx < nx &&
                yy >= 0 &&
                yy < ny &&
                zz >= 0 &&
                zz < nz &&
                category[at(xx, yy, zz)] === region
              )
                continue;
              const [v0, v1, v2, v3] = face.corners.map(([dx, dy, dz]) =>
                vertex(x + dx, y + dy, z + dz),
              );
              indices.push(v0, v1, v2, v0, v2, v3);
            }
          }
      const result = new BufferGeometry();
      result.setAttribute('position', new Float32BufferAttribute(vertices, 3));
      result.setIndex(indices);
      result.userData.voxelSize = step;
      result.computeVertexNormals();
      return result;
    }) as [BufferGeometry, BufferGeometry, BufferGeometry];
    return [...regions, before.clone(), after.clone()];
  } finally {
    before.dispose();
    after.dispose();
  }
}
