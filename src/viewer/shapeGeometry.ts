import {
  BoxGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { sanitizePreview } from './sanitize';

export type Primitive = { shape: Element; geometry: Element; path: string; def?: string };

function values(node: Element, name: string, fallback: number[]): number[] {
  const raw = node.getAttribute(name);
  if (!raw) return fallback;
  const result = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (result.length !== fallback.length || result.some((v) => !Number.isFinite(v)))
    throw new Error(`Invalid ${name} in solid region input.`);
  return result;
}

function vector(node: Element, name: string, fallback: number[]): Vector3 {
  const [x, y, z] = values(node, name, fallback);
  return new Vector3(x, y, z);
}

function rotation(node: Element, name: string): Matrix4 {
  const [x, y, z, angle] = values(node, name, [0, 0, 1, 0]);
  const axis = new Vector3(x, y, z);
  if (axis.lengthSq() < 1e-12) {
    if (Math.abs(angle) > 1e-12) throw new Error(`Invalid ${name} axis in solid region input.`);
    return new Matrix4();
  }
  return new Matrix4().makeRotationFromQuaternion(
    new Quaternion().setFromAxisAngle(axis.normalize(), angle),
  );
}

function transformMatrix(node: Element): Matrix4 {
  const t = new Matrix4().makeTranslation(vector(node, 'translation', [0, 0, 0]));
  const c = new Matrix4().makeTranslation(vector(node, 'center', [0, 0, 0]));
  const ci = c.clone().invert();
  const r = rotation(node, 'rotation');
  const so = rotation(node, 'scaleOrientation');
  const s = vector(node, 'scale', [1, 1, 1]);
  if (s.x <= 0 || s.y <= 0 || s.z <= 0)
    throw new Error('Solid regions require positive Transform scale.');
  return t
    .multiply(c)
    .multiply(r)
    .multiply(so)
    .multiply(new Matrix4().makeScale(s.x, s.y, s.z))
    .multiply(so.clone().invert())
    .multiply(ci);
}

export function worldMatrix(shape: Element): Matrix4 {
  const parents: Element[] = [];
  for (
    let node = shape.parentElement;
    node && node.localName !== 'Scene';
    node = node.parentElement
  ) {
    if (node.localName !== 'Transform' && node.localName !== 'Group')
      throw new Error(`Solid regions do not support ${node.localName} scene placement.`);
    parents.unshift(node);
  }
  const world = new Matrix4();
  for (const node of parents)
    if (node.localName === 'Transform') world.multiply(transformMatrix(node));
  return world;
}

export type VolumeResolution = 'low' | 'medium' | 'high';
export function primitiveGeometry(
  node: Element,
  resolution: VolumeResolution = 'medium',
): BufferGeometry {
  const segments =
    resolution === 'high' ? [64, 48, 64] : resolution === 'low' ? [16, 12, 16] : [28, 20, 32];
  if (node.hasAttribute('USE')) throw new Error('Solid regions require direct primitive geometry.');
  if (node.localName === 'Sphere') {
    const [radius] = values(node, 'radius', [1]);
    if (radius <= 0) throw new Error('Sphere radius must be positive for solid regions.');
    return new SphereGeometry(radius, segments[0], segments[1]);
  }
  if (node.localName === 'Box') {
    const [x, y, z] = values(node, 'size', [2, 2, 2]);
    if (x <= 0 || y <= 0 || z <= 0) throw new Error('Box size must be positive for solid regions.');
    return new BoxGeometry(x, y, z);
  }
  if (node.localName === 'Cylinder') {
    for (const part of ['side', 'top', 'bottom'])
      if (node.getAttribute(part)?.toLowerCase() === 'false')
        throw new Error('Open cylinders are not closed solids.');
    const [radius] = values(node, 'radius', [1]);
    const [height] = values(node, 'height', [2]);
    if (radius <= 0 || height <= 0)
      throw new Error('Cylinder dimensions must be positive for solid regions.');
    return new CylinderGeometry(radius, radius, height, segments[2]);
  }
  throw new Error(`Solid regions do not support ${node.localName} geometry.`);
}

export function parsePrimitives(xml: string): Primitive[] {
  const safe = sanitizePreview(xml);
  const doc = new DOMParser().parseFromString(safe.xml, 'application/xml');
  const shapePaths = new Map<string, string>();
  for (const [path, cue] of safe.pathToCue)
    if (/\/Shape\[\d+\]$/.test(path)) shapePaths.set(cue, path);
  const found: Primitive[] = [];
  for (const shape of Array.from(doc.getElementsByTagName('Shape'))) {
    const geometry = Array.from(shape.children).find((child) =>
      ['Sphere', 'Box', 'Cylinder', 'IndexedFaceSet'].includes(child.localName),
    );
    const cue = shape.getAttribute('DEF');
    if (geometry && cue && shapePaths.has(cue) && !shape.hasAttribute('USE')) {
      found.push({
        shape,
        geometry,
        path: shapePaths.get(cue)!,
        def: cue.startsWith('X3DIFF_CUE_') ? undefined : cue,
      });
    }
  }
  return found;
}

export function affectsShape(path: string, changePath?: string): boolean {
  return (
    !!changePath &&
    (changePath === path || changePath.startsWith(`${path}/`) || path.startsWith(`${changePath}/`))
  );
}
