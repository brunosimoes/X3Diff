import { BufferGeometry, Vector3 } from 'three';

export type Axis = 0 | 1 | 2;
export type Segment = [Vector3, Vector3];
export const planeAxes = (axis: Axis): [Axis, Axis] =>
  axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];

/** Triangle/plane intersections in world coordinates. Coplanar triangles are omitted. */
export function sliceGeometry(
  geometry: BufferGeometry,
  axis: Axis,
  level: number,
  epsilon = 1e-7,
): Segment[] {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();
  const result: Segment[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
    const vertices = [0, 1, 2].map((j) =>
      new Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j),
    );
    const distances = vertices.map((p) => p.getComponent(axis) - level);
    if (distances.every((d) => Math.abs(d) <= epsilon)) continue;
    const points: Vector3[] = [];
    const add = (point: Vector3) => {
      point.setComponent(axis, level);
      if (!points.some((p) => p.distanceToSquared(point) <= epsilon * epsilon)) points.push(point);
    };
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3;
      if (Math.abs(distances[j]) <= epsilon) add(vertices[j].clone());
      if (
        (distances[j] < -epsilon && distances[k] > epsilon) ||
        (distances[j] > epsilon && distances[k] < -epsilon)
      ) {
        add(vertices[j].clone().lerp(vertices[k], distances[j] / (distances[j] - distances[k])));
      }
    }
    if (points.length !== 2 || points[0].distanceToSquared(points[1]) <= epsilon * epsilon)
      continue;
    const key = points
      .map((p) =>
        p
          .toArray()
          .map((n) => Math.round(n / epsilon))
          .join(','),
      )
      .sort()
      .join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push([points[0], points[1]]);
    }
  }
  return result;
}

export function closestOnSection(point: Vector3, segments: Segment[]): Vector3 | undefined {
  let nearest: Vector3 | undefined,
    distance = Infinity;
  for (const [a, b] of segments) {
    const direction = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(direction) / direction.lengthSq()));
    const candidate = a.clone().addScaledVector(direction, t);
    const d = candidate.distanceToSquared(point);
    if (d < distance) {
      nearest = candidate;
      distance = d;
    }
  }
  return nearest;
}
