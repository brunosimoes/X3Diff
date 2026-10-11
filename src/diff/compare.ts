import { catalog, catalogProvenance } from '../x3d/catalog';
import { parseX3D, supportedFieldTypes, type ParsedNode, type ParsedScene } from '../x3d/parse';
import type {
  ChangeKind,
  ChangeRecord,
  Diagnostic,
  NodeRef,
  Severity,
  ToleranceConfig,
  ValueSnapshot,
  X3DiffReport,
} from '../report/schema';

import { DEFAULT_TOLERANCE } from './tolerance';
import { LIGHTS } from '../x3d/lights';
import { version as toolVersion } from '../../package.json';
function flatten(nodes: ParsedNode[]): ParsedNode[] {
  const result: ParsedNode[] = [],
    stack = [...nodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    result.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return result;
}

/** Intern exact subtree descriptions bottom-up. Child IDs avoid nested JSON
 * escaping and keep each subtree's representation proportional to its own fields. */
function structuralIndex(nodes: ParsedNode[]) {
  const intern = new Map<string, number>(),
    ids = new Map<ParsedNode, number>(),
    known = new Map<ParsedNode, boolean>();
  for (const node of [...nodes].reverse()) {
    const key = JSON.stringify([
      node.type,
      Object.entries(node.attrs)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v.value]),
      node.children.map((c) => ids.get(c)),
    ]);
    let id = intern.get(key);
    if (id === undefined) {
      id = intern.size;
      intern.set(key, id);
    }
    ids.set(node, id);
    known.set(node, !node.opaque && node.children.every((c) => known.get(c)));
  }
  return {
    signature: (n: ParsedNode) => ids.get(n)!,
    fullyKnown: (n: ParsedNode) => known.get(n)!,
  };
}
function ref(n: ParsedNode): NodeRef {
  return {
    nodeType: n.type,
    defName: n.def,
    scopePath: '/',
    path: n.path,
    source: { elementPath: n.path },
  };
}
function category(
  n: ParsedNode,
  field: string,
): { kind: ChangeKind; category: string; severity: Severity } {
  if (n.type === 'Transform')
    return { kind: 'transformChanged', category: 'transform', severity: 'high' };
  if (
    n.type === 'Coordinate' ||
    [
      'Box',
      'Sphere',
      'Cylinder',
      'Cone',
      'Extrusion',
      'IndexedFaceSet',
      'IndexedLineSet',
      'Text',
    ].includes(n.type)
  )
    return { kind: 'geometryChanged', category: 'geometry', severity: 'high' };
  if (n.type === 'Material')
    return { kind: 'materialChanged', category: 'material', severity: 'high' };
  if (n.type === 'PixelTexture' || n.type === 'TextureTransform')
    return { kind: 'appearanceChanged', category: 'texture', severity: 'medium' };
  // Per-vertex colours are how the geometry looks, not what shape it is.
  if (n.type === 'Color')
    return { kind: 'appearanceChanged', category: 'appearance', severity: 'medium' };
  if (n.type === 'IntegerSequencer')
    return { kind: 'animationConfigChanged', category: 'behavior', severity: 'medium' };
  if (n.type === 'NavigationInfo')
    return { kind: 'viewpointChanged', category: 'viewpoint', severity: 'medium' };
  if (field === 'url' && n.type === 'ImageTexture')
    return { kind: 'textureReferenceChanged', category: 'texture', severity: 'medium' };
  if (n.type === 'Appearance')
    return { kind: 'appearanceChanged', category: 'appearance', severity: 'high' };
  if (n.type === 'TimeSensor')
    return { kind: 'timeConfigChanged', category: 'behavior', severity: 'medium' };
  if (n.type.includes('Interpolator'))
    return { kind: 'animationConfigChanged', category: 'behavior', severity: 'medium' };
  if (n.type.includes('Metadata') || n.type === 'WorldInfo')
    return { kind: 'metadataChanged', category: 'metadata', severity: 'low' };
  if (n.type === 'Viewpoint' || n.type === 'OrthoViewpoint')
    return { kind: 'viewpointChanged', category: 'viewpoint', severity: 'medium' };
  // Lights change how every lit surface looks, without changing any object.
  if (LIGHTS.has(n.type)) return { kind: 'lightChanged', category: 'lighting', severity: 'medium' };
  if (n.type === 'Inline')
    return { kind: 'fieldChanged', category: 'external reference', severity: 'medium' };
  return { kind: 'fieldChanged', category: 'field', severity: 'medium' };
}
function quaternion(v: number[]): number[] {
  const [x, y, z, a] = v;
  if (Math.abs(a) < 1e-14) return [0, 0, 0, 1];
  const norm = Math.hypot(x, y, z);
  if (!norm) return [NaN, NaN, NaN, NaN];
  const s = Math.sin(a / 2) / norm;
  return [x * s, y * s, z * s, Math.cos(a / 2)];
}
function numberEqual(a: number, b: number, t: ToleranceConfig): boolean {
  return Math.abs(a - b) <= t.floatAbs + t.floatRel * Math.max(Math.abs(a), Math.abs(b));
}
/** Integers and image pixels are compared exactly; tolerances are for measured quantities. */
const exact = (type: string) => type.includes('Int') || type.includes('Image');
function valuesEqual(
  a: ValueSnapshot | undefined,
  b: ValueSnapshot | undefined,
  t: ToleranceConfig,
  field: string,
): boolean {
  if (!a || !b) return a === b;
  const av = a.value,
    bv = b.value,
    type = a.fieldType || b.fieldType || '';
  if (typeof av === 'number' && typeof bv === 'number')
    return exact(type) ? av === bv : numberEqual(av, bv, t);
  if (Array.isArray(av) && Array.isArray(bv)) {
    if (av.length !== bv.length) return false;
    if (type === 'SFRotation') {
      const q = quaternion(av as number[]),
        r = quaternion(bv as number[]);
      if (q.some(Number.isNaN) || r.some(Number.isNaN)) return false;
      return (
        2 * Math.acos(Math.min(1, Math.abs(q.reduce((sum, v, i) => sum + v * r[i], 0)))) <=
        t.rotationRadians
      );
    }
    if (type === 'SFColor' || type === 'SFColorRGBA')
      return Math.max(...av.map((v, i) => Math.abs(Number(v) - Number(bv[i])))) <= t.colorAbs;
    // A light's direction is a direction: its length does not change the light.
    if (type === 'SFVec3f' && field === 'direction') {
      const la = Math.hypot(...(av as number[])),
        lb = Math.hypot(...(bv as number[]));
      if (la > 0 && lb > 0)
        return Math.hypot(...av.map((v, i) => Number(v) / la - Number(bv[i]) / lb)) <= t.vectorAbs;
    }
    if (type.startsWith('SFVec'))
      return Math.hypot(...av.map((v, i) => Number(v) - Number(bv[i]))) <= t.vectorAbs;
    if (type === 'MFVec3f' && field === 'point')
      return av.every(
        (v, i) =>
          Array.isArray(v) &&
          Array.isArray(bv[i]) &&
          Math.hypot(...v.map((x, j) => Number(x) - Number((bv[i] as number[])[j]))) <= t.vectorAbs,
      );
    return av.every((v, i) =>
      Array.isArray(v)
        ? valuesEqual(
            { fieldType: `S${type.slice(1)}`, value: v },
            { fieldType: `S${type.slice(1)}`, value: bv[i] },
            t,
            field,
          )
        : typeof v === 'number' && typeof bv[i] === 'number' && !exact(type)
          ? numberEqual(v, bv[i] as number, t)
          : v === bv[i],
    );
  }
  return av === bv;
}
function pointCount(
  a: ValueSnapshot,
  b: ValueSnapshot,
  t: ToleranceConfig,
): { moved: number; total: number } | undefined {
  const x = a.value,
    y = b.value;
  if (
    !Array.isArray(x) ||
    !Array.isArray(y) ||
    x.length !== y.length ||
    !x.every(Array.isArray) ||
    !y.every(Array.isArray)
  )
    return;
  let moved = 0;
  for (let i = 0; i < x.length; i++)
    if (Math.hypot(...(x[i] as number[]).map((v, j) => v - (y[i] as number[])[j])) > t.vectorAbs)
      moved++;
  return { moved, total: x.length };
}
/**
 * Versions read with the X3D 3.3 catalog. 3.0 to 3.2 declare the catalogued nodes with the
 * same fields, types and defaults. 4.0 keeps every one of those and adds fields. The catalog
 * generator checks each default against the official X3DUOM 4.0 and records the one that
 * changed (SpotLight.beamWidth); the 4.0 light fields `shadows` and `shadowIntensity` are in
 * the catalog, and every other 4.0 addition is reported as an unsupported setting rather
 * than misread.
 */
export const READABLE_VERSIONS = ['3.0', '3.1', '3.2', '3.3', '4.0'];
export function compareX3D(
  beforeText: string,
  afterText: string,
  config: Partial<ToleranceConfig> = {},
  names: { before?: string; after?: string } = {},
): X3DiffReport {
  const t = { ...DEFAULT_TOLERANCE, ...config };
  const before = parseX3D(beforeText, 'before', names.before),
    after = parseX3D(afterText, 'after', names.after);
  const diagnostics: Diagnostic[] = [...before.diagnostics, ...after.diagnostics],
    changes: ChangeRecord[] = [];
  const add = (c: Omit<ChangeRecord, 'id'>) =>
    changes.push({ id: `c${String(changes.length + 1).padStart(5, '0')}`, ...c });
  const versions = [before.summary.x3dVersion, after.summary.x3dVersion];
  const versionOK = versions.every((v) => !!v && READABLE_VERSIONS.includes(v));
  // An unreadable file has no version; its parse error is the only useful message.
  if (!versionOK && !before.fatal && !after.fatal)
    diagnostics.push({
      code: 'VERSION_UNSUPPORTED',
      severity: 'error',
      message: `Only X3D 3.0 to 4.0 files are supported (received ${before.summary.x3dVersion || '?'} and ${after.summary.x3dVersion || '?'})`,
    });
  if (versionOK)
    for (const side of ['before', 'after'] as const) {
      const version = (side === 'before' ? before : after).summary.x3dVersion;
      if (version !== '3.3')
        diagnostics.push({
          code: 'VERSION_READ_AS_3_3',
          severity: 'warning',
          side,
          message:
            version === '4.0'
              ? 'X3D 4.0 file read with the X3D 3.3 catalog; apart from the light shadow settings, settings and nodes new in 4.0 are not compared'
              : `X3D ${version} file read with the X3D 3.3 catalog`,
        });
    }
  if (!before.fatal && !after.fatal && versionOK) {
    const allBefore = flatten(before.nodes),
      allAfter = flatten(after.nodes);
    const aa = allBefore.filter((n) => !n.use),
      bb = allAfter.filter((n) => !n.use);
    const paired = new Map<ParsedNode, ParsedNode>(),
      used = new Set<ParsedNode>();
    const pair = (a: ParsedNode, b: ParsedNode) => {
      paired.set(a, b);
      used.add(b);
    };
    for (const a of aa)
      if (a.def) {
        const b = after.defs.get(a.def);
        if (b && !used.has(b) && b.type === a.type) pair(a, b);
      }
    const { signature, fullyKnown } = structuralIndex([...allBefore, ...allAfter]);
    const byPath = new Map(bb.map((n) => [n.path, n]));
    for (const a of aa)
      if (!paired.has(a)) {
        const b = byPath.get(a.path);
        if (b && !used.has(b) && b.type === a.type) {
          if (!a.def || !b.def || a.def === b.def || signature(a) === signature(b)) pair(a, b);
          else
            add({
              kind: 'matchUncertain',
              severity: 'medium',
              confidence: 'low',
              category: 'identity',
              message: `Cannot verify whether DEF ${a.def} and ${b.def} identify the same node`,
              beforePath: a.path,
              afterPath: b.path,
              beforeNode: ref(a),
              afterNode: ref(b),
            });
        }
      }
    const available = new Map<number, Set<ParsedNode>>();
    const counts = (nodes: ParsedNode[]) => {
      const result = new Map<number, number>();
      for (const n of nodes) result.set(signature(n), (result.get(signature(n)) || 0) + 1);
      return result;
    };
    const countsA = counts(aa),
      countsB = counts(bb);
    for (const b of bb)
      if (!used.has(b) && fullyKnown(b)) {
        const key = signature(b);
        if (!available.has(key)) available.set(key, new Set());
        available.get(key)!.add(b);
      }
    for (const a of aa)
      if (!paired.has(a) && fullyKnown(a)) {
        const candidates = available.get(signature(a));
        if (candidates?.size === 1) {
          const b = candidates.values().next().value!;
          pair(a, b);
          candidates.delete(b);
        }
      }
    const renames = new Map<string, string>();
    for (const [a, b] of paired)
      if (a.def && b.def && a.def !== b.def) {
        const uniqueA = countsA.get(signature(a)) === 1,
          uniqueB = countsB.get(signature(b)) === 1;
        if (fullyKnown(a) && fullyKnown(b) && signature(a) === signature(b) && uniqueA && uniqueB) {
          renames.set(a.def, b.def);
          add({
            kind: 'nodeRenamed',
            severity: 'medium',
            confidence: 'high',
            category: 'identity',
            message: `DEF ${a.def} renamed to ${b.def}`,
            before: { value: a.def },
            after: { value: b.def },
            beforePath: a.path,
            afterPath: b.path,
            beforeNode: ref(a),
            afterNode: ref(b),
          });
        } else
          add({
            kind: 'matchUncertain',
            severity: 'medium',
            confidence: 'low',
            category: 'identity',
            message: `DEF identity changed from ${a.def} to ${b.def}; structural identity is uncertain`,
            beforePath: a.path,
            afterPath: b.path,
            beforeNode: ref(a),
            afterNode: ref(b),
          });
      }
    for (const [a, b] of paired) {
      if (a.field !== b.field)
        add({
          kind: 'nodeMoved',
          severity: 'high',
          confidence: 'high',
          category: 'structure',
          message: `${a.type} containerField changed from ${a.field} to ${b.field}`,
          beforePath: a.path,
          afterPath: b.path,
          beforeNode: ref(a),
          afterNode: ref(b),
          before: { value: a.field },
          after: { value: b.field },
        });
      const keys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
      for (const key of [...keys].sort()) {
        const av = a.attrs[key],
          bv = b.attrs[key];
        if (valuesEqual(av, bv, t, key)) continue;
        const cat = category(a, key);
        const points =
          a.type === 'Coordinate' && key === 'point' && av && bv
            ? pointCount(av, bv, t)
            : undefined;
        add({
          ...cat,
          confidence: 'high',
          message: points
            ? `${points.moved} of ${points.total} indexed Coordinate points moved beyond ${t.vectorAbs}`
            : `${a.type}.${key} changed`,
          before: av,
          after: bv,
          beforePath: a.path,
          afterPath: b.path,
          beforeNode: ref(a),
          afterNode: ref(b),
          field: key,
          ...(points
            ? {
                movedPoints: points.moved,
                totalPoints: points.total,
                toleranceApplied: t.vectorAbs,
              }
            : {}),
          affectedUseCount: a.def ? before.uses.get(a.def) : undefined,
        });
      }
    }
    for (const [a, b] of paired) {
      for (const field of new Set(a.children.map((c) => c.field))) {
        const key = (c: ParsedNode) =>
          c.def ? `D:${c.def}` : c.use ? `U:${c.use}` : `P:${c.type}:${c.ordinal}`;
        const beforeSeq = a.children.filter((c) => c.field === field).map(key);
        const afterSeq = b.children.filter((c) => c.field === field).map(key);
        const mapped = beforeSeq.map((s) =>
          s.startsWith('D:')
            ? `D:${renames.get(s.slice(2)) || s.slice(2)}`
            : s.startsWith('U:')
              ? `U:${renames.get(s.slice(2)) || s.slice(2)}`
              : s,
        );
        if (
          mapped.length === afterSeq.length &&
          JSON.stringify([...mapped].sort()) === JSON.stringify([...afterSeq].sort()) &&
          JSON.stringify(mapped) !== JSON.stringify(afterSeq)
        )
          add({
            kind: 'childOrderChanged',
            severity: 'medium',
            confidence: 'high',
            category: 'structure',
            message: `Child order changed in ${a.type}.${field}`,
            beforePath: a.path,
            afterPath: b.path,
            beforeNode: ref(a),
            afterNode: ref(b),
          });
      }
    }
    for (const a of aa)
      if (!paired.has(a))
        add({
          kind: 'nodeRemoved',
          severity: 'high',
          confidence: 'high',
          category: 'structure',
          message: `${a.type}${a.def ? ` DEF ${a.def}` : ''} removed`,
          beforePath: a.path,
          beforeNode: ref(a),
        });
    for (const b of bb)
      if (!used.has(b))
        add({
          kind: 'nodeAdded',
          severity: 'high',
          confidence: 'high',
          category: 'structure',
          message: `${b.type}${b.def ? ` DEF ${b.def}` : ''} added`,
          afterPath: b.path,
          afterNode: ref(b),
        });
    // Compare references by resolved identity, never by rewriting dangling names.
    const identityBefore = new Map<ParsedNode, string>(),
      identityAfter = new Map<ParsedNode, string>();
    for (const [a, b] of paired) {
      if (a.def && b.def && a.def !== b.def && renames.get(a.def) !== b.def) continue;
      const id = 'pair:' + identityBefore.size;
      identityBefore.set(a, id);
      identityAfter.set(b, id);
    }
    const endpoint = (
      name: string,
      scene: ParsedScene,
      ids: Map<ParsedNode, string>,
      side: string,
    ) => {
      const node = scene.defs.get(name);
      return node ? ids.get(node) || side + ':' + node.path : 'unresolved:' + name;
    };
    const beforeEndpoint = (name: string) => endpoint(name, before, identityBefore, 'before');
    const afterEndpoint = (name: string) => endpoint(name, after, identityAfter, 'after');
    const beforeUses = allBefore.filter((n) => n.use),
      afterUses = allAfter.filter((n) => n.use);
    const afterUsesByPath = new Map(afterUses.map((n) => [n.path, n]));
    for (const a of beforeUses) {
      const b = afterUsesByPath.get(a.path);
      if (!b || beforeEndpoint(a.use!) !== afterEndpoint(b.use!))
        add({
          kind: 'defUseChanged',
          severity: 'high',
          confidence: b ? 'high' : 'medium',
          category: 'reference',
          message: b ? `USE target changed from ${a.use} to ${b.use}` : `USE ${a.use} removed`,
          beforePath: a.path,
          afterPath: b?.path,
          beforeNode: ref(a),
          afterNode: b ? ref(b) : undefined,
          before: { value: a.use },
          after: b ? { value: b.use } : undefined,
        });
    }
    const beforeUsePaths = new Set(beforeUses.map((n) => n.path));
    for (const b of afterUses)
      if (!beforeUsePaths.has(b.path))
        add({
          kind: 'defUseChanged',
          severity: 'high',
          confidence: 'medium',
          category: 'reference',
          message: `USE ${b.use} added`,
          afterPath: b.path,
          afterNode: ref(b),
          after: { value: b.use },
        });
    const routes = (scene: ParsedScene, resolve: (name: string) => string) =>
      new Map(
        scene.routes.map((r) => [
          JSON.stringify([resolve(r.fromDEF), r.fromField, resolve(r.toDEF), r.toField]),
          [r.fromDEF, r.fromField, r.toDEF, r.toField],
        ]),
      );
    const ra = routes(before, beforeEndpoint),
      rb = routes(after, afterEndpoint);
    for (const [k, value] of [...ra].sort())
      if (!rb.has(k))
        add({
          kind: 'routeRemoved',
          severity: 'high',
          confidence: 'high',
          category: 'behavior',
          message: 'ROUTE removed: ' + value.join(' → '),
          before: { value },
        });
    for (const [k, value] of [...rb].sort())
      if (!ra.has(k))
        add({
          kind: 'routeAdded',
          severity: 'high',
          confidence: 'high',
          category: 'behavior',
          message: 'ROUTE added: ' + value.join(' → '),
          after: { value },
        });
    if (JSON.stringify(before.meta) !== JSON.stringify(after.meta))
      add({
        kind: 'documentContextChanged',
        severity: 'low',
        confidence: 'high',
        category: 'document',
        message: 'Document META changed',
        before: { value: before.meta },
        after: { value: after.meta },
      });
    if (before.summary.x3dVersion !== after.summary.x3dVersion)
      add({
        kind: 'documentContextChanged',
        severity: 'low',
        confidence: 'high',
        category: 'document',
        message: 'X3D version changed',
        before: { value: before.summary.x3dVersion },
        after: { value: after.summary.x3dVersion },
      });
    if (before.summary.profile !== after.summary.profile)
      add({
        kind: 'documentContextChanged',
        severity: 'low',
        confidence: 'high',
        category: 'document',
        message: 'Profile changed',
        before: { value: before.summary.profile },
        after: { value: after.summary.profile },
      });
  }
  changes.sort((a, b) =>
    [a.category, a.beforePath || a.afterPath || '', a.kind, a.field || '']
      .join('|')
      .localeCompare(
        [b.category, b.beforePath || b.afterPath || '', b.kind, b.field || ''].join('|'),
      ),
  );
  changes.forEach((c, i) => (c.id = `c${String(i + 1).padStart(5, '0')}`));
  const countsByKind: Record<string, number> = {},
    countsBySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
  for (const c of changes) {
    countsByKind[c.kind] = (countsByKind[c.kind] || 0) + 1;
    countsBySeverity[c.severity]++;
  }
  const unsupportedCount = diagnostics.filter((d) => d.code.startsWith('UNSUPPORTED')).length;
  const status =
    before.fatal || after.fatal
      ? 'failed'
      : !versionOK ||
          diagnostics.some((d) => d.severity === 'error') ||
          unsupportedCount ||
          changes.some((c) => c.kind === 'matchUncertain')
        ? 'incomplete'
        : diagnostics.length
          ? 'completeWithWarnings'
          : 'complete';
  return {
    schemaVersion: '1.0',
    toolVersion,
    inputs: { before: before.summary, after: after.summary },
    config: { ...t, enabledCategories: ['all'] },
    summary: { status, countsByKind, countsBySeverity, unsupportedCount },
    changes,
    diagnostics,
    catalog: {
      version: '3.3',
      modelSha256: catalogProvenance.modelSha256,
      schemaSha256: catalogProvenance.schemaSha256,
      supportedNodes: Object.keys(catalog),
      supportedFieldTypes,
    },
  };
}
