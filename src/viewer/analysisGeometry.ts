import * as THREE from 'three';
import { worldMatrix, primitiveGeometry, type Primitive } from './shapeGeometry';
import { surfaceGeometry } from './meshRegions';
export type AnalysisPair = { before: Primitive; after: Primitive; label: string };

export function readAnalysisGeometry(item: Primitive): THREE.BufferGeometry {
  if (item.geometry.getAttribute('convex')?.toLowerCase() === 'false')
    throw new Error('Concave polygon faces are not supported by this section analysis.');
  const geometry =
    item.geometry.localName === 'IndexedFaceSet'
      ? surfaceGeometry(item.geometry, worldMatrix(item.shape))
      : primitiveGeometry(item.geometry).applyMatrix4(worldMatrix(item.shape));
  geometry.computeBoundingBox();
  if (
    !geometry.boundingBox ||
    [...geometry.boundingBox.min, ...geometry.boundingBox.max].some(
      (n) => !Number.isFinite(n) || Math.abs(n) > 100_000,
    )
  ) {
    geometry.dispose();
    throw new Error('Geometry exceeds the bounded section range.');
  }
  if (geometry.boundingBox!.getSize(new THREE.Vector3()).length() < 1e-8) {
    geometry.dispose();
    throw new Error('This object is too small for the section analysis.');
  }
  return geometry;
}
