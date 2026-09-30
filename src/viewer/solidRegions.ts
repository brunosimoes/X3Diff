import type { BufferGeometry } from 'three';
import { Brush, Evaluator, INTERSECTION, REVERSE_SUBTRACTION, SUBTRACTION } from 'three-bvh-csg';
import type { X3DiffReport } from '../report/schema';
import { buildMeshRegions } from './meshRegions';
import {
  parsePrimitives,
  worldMatrix,
  primitiveGeometry,
  affectsShape,
  type Primitive,
  type VolumeResolution,
} from './shapeGeometry';
import { buildDiffScene } from './diffScene';

export interface SolidRegionsResult {
  xml: string;
  pairPaths: { before: string; after: string };
  label: string;
  triangleCounts: { beforeOnly: number; shared: number; afterOnly: number };
  approximate?: boolean;
  cueByChangeId: Record<string, string>;
}

function makeBrush(item: Primitive, resolution: VolumeResolution): Brush {
  const geometry = primitiveGeometry(item.geometry, resolution);
  geometry.applyMatrix4(worldMatrix(item.shape));
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (
    !bounds ||
    [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].some(
      (v) => !Number.isFinite(v) || Math.abs(v) > 100_000,
    )
  ) {
    geometry.dispose();
    throw new Error('Primitive coordinates exceed the bounded solid preview range.');
  }
  geometry.clearGroups();
  const brush = new Brush(geometry);
  brush.updateMatrixWorld(true);
  return brush;
}

function formatted(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Non-finite Boolean geometry result.');
  return String(Number(value.toPrecision(7)));
}

function appendRegion(
  scene: Element,
  geometry: BufferGeometry,
  def: string,
  offset: number,
  color: string,
  glow: string,
  transparency = 0,
): number {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();
  if (!positions) throw new Error('Boolean result has no positions.');
  const triangleCount = (indices?.count ?? positions.count) / 3;
  if (!Number.isInteger(triangleCount) || triangleCount > 160_000)
    throw new Error('Boolean result exceeds the bounded preview limit.');
  if (triangleCount === 0) return 0;
  const doc = scene.ownerDocument;
  const stage = doc.createElement('Transform');
  stage.setAttribute('translation', '0 0 0');
  const shape = doc.createElement('Shape');
  shape.setAttribute('DEF', def);
  const appearance = doc.createElement('Appearance');
  const material = doc.createElement('Material');
  material.setAttribute('diffuseColor', color);
  material.setAttribute('emissiveColor', glow);
  material.setAttribute('specularColor', '0.75 0.75 0.75');
  material.setAttribute('shininess', '0.6');
  if (transparency) material.setAttribute('transparency', String(transparency));
  appearance.append(material);
  shape.append(appearance);
  const mesh = doc.createElement('IndexedFaceSet');
  mesh.setAttribute('creaseAngle', '1.05');
  const coords = doc.createElement('Coordinate');
  const points: string[] = [];
  for (let i = 0; i < positions.count; i++)
    points.push(
      `${formatted(positions.getX(i))} ${formatted(positions.getY(i))} ${formatted(positions.getZ(i))}`,
    );
  coords.setAttribute('point', points.join(' '));
  const faceIndices: string[] = [];
  for (let i = 0; i < triangleCount; i++) {
    const base = i * 3;
    faceIndices.push(
      `${indices ? indices.getX(base) : base} ${indices ? indices.getX(base + 1) : base + 1} ${indices ? indices.getX(base + 2) : base + 2} -1`,
    );
  }
  mesh.setAttribute('coordIndex', faceIndices.join(' '));
  mesh.append(coords);
  shape.append(mesh);
  stage.append(shape);
  const toggle = doc.createElement('Switch');
  toggle.setAttribute('DEF', `${def}_VISIBILITY`);
  toggle.setAttribute('whichChoice', def.includes('CONTEXT') ? '-1' : '0');
  toggle.append(stage);
  scene.append(toggle);
  return triangleCount;
}

/** Boolean CSG of closed primitives and bounded, simply repairable IndexedFaceSet meshes. */
export function buildSolidRegions(
  beforeXML: string,
  afterXML: string,
  report: X3DiffReport,
  resolution: VolumeResolution = 'medium',
): SolidRegionsResult | null {
  if (report.summary.status !== 'complete' && report.summary.status !== 'completeWithWarnings')
    return null;
  const before = parsePrimitives(beforeXML);
  const after = parsePrimitives(afterXML);
  const sameObject = (b: Primitive, a: Primitive): boolean => {
    if (b.def && a.def && b.def === a.def) return true;
    if (a.path !== b.path || a.geometry.localName !== b.geometry.localName) return false;
    return !report.changes.some(
      (c) =>
        c.category === 'structure' &&
        (affectsShape(b.path, c.beforeNode?.path) || affectsShape(a.path, c.afterNode?.path)),
    );
  };
  const pair = before
    .map((b) => ({ b, a: after.find((a) => sameObject(b, a)) }))
    .find(
      ({ b, a }) =>
        a &&
        report.changes.some(
          (c) =>
            c.confidence !== 'low' &&
            ['geometry', 'transform'].includes(c.category) &&
            (affectsShape(b.path, c.beforeNode?.path) || affectsShape(a.path, c.afterNode?.path)),
        ) &&
        !report.changes.some(
          (c) =>
            (c.kind === 'nodeAdded' && affectsShape(a.path, c.afterNode?.path)) ||
            (c.kind === 'nodeRemoved' && affectsShape(b.path, c.beforeNode?.path)),
        ),
    );
  if (!pair?.a) return null;

  // Keep the complete change scene; replace only the selected pair's visible surfaces.
  const compose = (
    volumeDoc: Document,
  ): {
    xml: string;
    pairPaths: { before: string; after: string };
    cueByChangeId: Record<string, string>;
  } => {
    const context = buildDiffScene(beforeXML, afterXML, report);
    const doc = new DOMParser().parseFromString(context.xml, 'application/xml');
    const scene = doc.getElementsByTagName('Scene')[0];
    const replaced = new Set([
      `B_${pair.b.shape.getAttribute('DEF')}`,
      `A_${pair.a!.shape.getAttribute('DEF')}`,
    ]);
    for (const shape of Array.from(doc.getElementsByTagName('Shape'))) {
      if (!replaced.has(shape.getAttribute('DEF') ?? '')) continue;
      const hidden = doc.createElement('Switch');
      hidden.setAttribute('whichChoice', '-1');
      shape.replaceWith(hidden);
      hidden.append(shape);
    }
    const volume = doc.createElement('Group');
    volume.setAttribute('DEF', 'X3DIFF_VOLUME_PAIR');
    for (const child of Array.from(volumeDoc.getElementsByTagName('Scene')[0].children)) {
      if (child.localName !== 'Background') volume.append(doc.importNode(child, true));
    }
    scene.append(volume);
    const cues = { ...context.cueByChangeId };
    for (const [id, cue] of Object.entries(cues))
      if (replaced.has(cue)) cues[id] = 'X3DIFF_VOLUME_PAIR';
    return {
      xml: new XMLSerializer().serializeToString(doc),
      cueByChangeId: cues,
      pairPaths: { before: pair.b.path, after: pair.a!.path },
    };
  };

  if (
    pair.b.geometry.localName === 'IndexedFaceSet' &&
    pair.a.geometry.localName === 'IndexedFaceSet'
  ) {
    const results = buildMeshRegions(
      pair.b.geometry,
      pair.a.geometry,
      worldMatrix(pair.b.shape),
      worldMatrix(pair.a.shape),
      resolution,
    );
    try {
      const doc = new DOMParser().parseFromString(
        '<X3D version="3.3" profile="Immersive"><Scene><Background skyColor="0.018 0.026 0.058"/></Scene></X3D>',
        'application/xml',
      );
      const scene = doc.getElementsByTagName('Scene')[0];
      appendRegion(
        scene,
        results[3],
        'X3DIFF_BEFORE_CONTEXT',
        -3.15,
        '0.45 0.62 0.78',
        '0.03 0.05 0.08',
        0.82,
      );
      appendRegion(
        scene,
        results[4],
        'X3DIFF_AFTER_CONTEXT',
        3.15,
        '0.45 0.62 0.78',
        '0.03 0.05 0.08',
        0.82,
      );
      const triangleCounts = {
        beforeOnly: appendRegion(
          scene,
          results[0],
          'X3DIFF_BEFORE_ONLY',
          -3.15,
          '1 0.08 0.46',
          '0.30 0.01 0.12',
        ),
        shared: appendRegion(
          scene,
          results[1],
          'X3DIFF_SHARED',
          0,
          '1 0.72 0.12',
          '0.32 0.16 0.02',
        ),
        afterOnly: appendRegion(
          scene,
          results[2],
          'X3DIFF_AFTER_ONLY',
          3.15,
          '0.02 0.77 1',
          '0.01 0.17 0.30',
        ),
      };
      return {
        ...compose(doc),
        label: pair.b.def ?? 'IndexedFaceSet',
        triangleCounts,
        approximate: true,
      };
    } finally {
      for (const result of results) result.dispose();
    }
  }

  const brushBefore = makeBrush(pair.b, resolution);
  let brushAfter: Brush | undefined;
  const results: BufferGeometry[] = [];
  try {
    brushAfter = makeBrush(pair.a, resolution);
    const evaluator = new Evaluator();
    evaluator.attributes = ['position', 'normal'];
    evaluator.useGroups = false;
    const beforeOnly = evaluator.evaluate(brushBefore, brushAfter, SUBTRACTION).geometry;
    results.push(beforeOnly);
    const shared = evaluator.evaluate(brushBefore, brushAfter, INTERSECTION).geometry;
    results.push(shared);
    const afterOnly = evaluator.evaluate(brushBefore, brushAfter, REVERSE_SUBTRACTION).geometry;
    results.push(afterOnly);
    const doc = new DOMParser().parseFromString(
      '<X3D version="3.3" profile="Immersive"><Scene><Background skyColor="0.018 0.026 0.058"/></Scene></X3D>',
      'application/xml',
    );
    const scene = doc.getElementsByTagName('Scene')[0];
    const triangleCounts = {
      beforeOnly: appendRegion(
        scene,
        beforeOnly,
        'X3DIFF_BEFORE_ONLY',
        -3.15,
        '1 0.08 0.46',
        '0.30 0.01 0.12',
      ),
      shared: appendRegion(scene, shared, 'X3DIFF_SHARED', 0, '1 0.72 0.12', '0.32 0.16 0.02'),
      afterOnly: appendRegion(
        scene,
        afterOnly,
        'X3DIFF_AFTER_ONLY',
        3.15,
        '0.02 0.77 1',
        '0.01 0.17 0.30',
      ),
    };
    return { ...compose(doc), label: pair.b.def ?? pair.b.geometry.localName, triangleCounts };
  } finally {
    brushBefore.geometry.dispose();
    brushAfter?.geometry.dispose();
    for (const geometry of results) geometry.dispose();
  }
}
