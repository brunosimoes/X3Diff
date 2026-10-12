import type { ChangeRecord, X3DiffReport } from '../report/schema';
import { sanitizePreview } from '../viewer/sanitize';
import { affectsShape } from '../viewer/shapeGeometry';

// Differences use matte colours. A before ghost marks the position or size of changed outlines.

type Side = 'before' | 'after';
/** `ghost` is the former position or size of a part that is still there. */
export type ShapeState = 'unchanged' | 'changed' | 'added' | 'removed' | 'ghost';
export type Theme = 'light' | 'dark';
export interface CalmShape {
  /** DEF of the Shape in the overlay scene. */
  name: string;
  /** DEF of its Material, for fading at run time. */
  material: string;
  state: ShapeState;
  transparency: number;
  changeIds: string[];
}
export interface CalmScene {
  xml: string;
  shapes: CalmShape[];
}

export const COLORS: Record<
  Theme,
  Record<ShapeState, { diffuse: string; transparency: number }>
> = {
  light: {
    unchanged: { diffuse: '0.74 0.77 0.80', transparency: 0 },
    changed: { diffuse: '0.16 0.47 0.86', transparency: 0 },
    added: { diffuse: '0.27 0.60 0.16', transparency: 0 },
    removed: { diffuse: '0.85 0.23 0.23', transparency: 0.35 },
    ghost: { diffuse: '0.16 0.47 0.86', transparency: 0.72 },
  },
  dark: {
    // Lighter than the stage by a clear margin: on a dark stage a dim grey scene is a black one.
    unchanged: { diffuse: '0.50 0.55 0.61', transparency: 0 },
    changed: { diffuse: '0.26 0.58 0.93', transparency: 0 },
    added: { diffuse: '0.42 0.72 0.25', transparency: 0 },
    removed: { diffuse: '0.92 0.33 0.33', transparency: 0.35 },
    ghost: { diffuse: '0.26 0.58 0.93', transparency: 0.72 },
  },
};

const VISUAL_CATEGORIES = new Set([
  'geometry',
  'material',
  'appearance',
  'texture',
  'transform',
  'structure',
]);
const OUTLINE_CATEGORIES = new Set(['geometry', 'transform']);
const INERT_NODES = new Set([
  'DirectionalLight',
  'PointLight',
  'SpotLight',
  'ROUTE',
  'TimeSensor',
  'TouchSensor',
  'BooleanFilter',
  'BooleanTrigger',
  'IntegerTrigger',
  'TimeTrigger',
  'ColorInterpolator',
  'OrientationInterpolator',
  'ScalarInterpolator',
  'PositionInterpolator',
  'IntegerSequencer',
]);

const elements = (parent: Element) => Array.from(parent.children);
/** True when the change is about the shape as a whole: the shape itself or a group around it. */
const owns = (shapePath: string, changePath?: string) =>
  !!changePath && (changePath === shapePath || shapePath.startsWith(`${changePath}/`));

function classify(
  path: string,
  side: Side,
  changes: ChangeRecord[],
): { state: ShapeState | undefined; ids: string[] } {
  const ids: string[] = [];
  let changed = false,
    outline = false,
    whole: ShapeState | undefined;
  for (const change of changes) {
    if (change.confidence === 'low') continue;
    const target = side === 'before' ? change.beforeNode?.path : change.afterNode?.path;
    if (!affectsShape(path, target)) continue;
    ids.push(change.id);
    if (side === 'before' && change.kind === 'nodeRemoved' && owns(path, target)) whole = 'removed';
    if (side === 'after' && change.kind === 'nodeAdded' && owns(path, target)) whole = 'added';
    if (VISUAL_CATEGORIES.has(change.category)) changed = true;
    if (OUTLINE_CATEGORIES.has(change.category)) outline = true;
  }
  if (whole) return { state: whole, ids };
  if (side === 'after') return { state: changed ? 'changed' : 'unchanged', ids };
  // A recoloured part has the same outline in both files: one solid is enough.
  return { state: changed && outline ? 'ghost' : undefined, ids };
}

function shapePaths(scene: Element): Array<{ node: Element; path: string }> {
  const found: Array<{ node: Element; path: string }> = [];
  const walk = (node: Element, path: string) => {
    if (node.localName === 'Shape') found.push({ node, path });
    const counts = new Map<string, number>();
    for (const child of elements(node)) {
      if (child.localName === 'ROUTE') continue;
      const n = (counts.get(child.localName) ?? 0) + 1;
      counts.set(child.localName, n);
      walk(child, `${path}/${child.localName}[${n}]`);
    }
  };
  walk(scene, '/X3D/Scene');
  return found;
}

export function buildCalmScene(
  beforeXML: string,
  afterXML: string,
  report: X3DiffReport,
  theme: Theme,
): CalmScene {
  const parser = new DOMParser();
  const result = parser.parseFromString(
    '<X3D version="4.0" profile="Immersive"><Scene/></X3D>',
    'application/xml',
  );
  const sceneOf = (doc: Document) =>
    elements(doc.documentElement).find((e) => e.localName === 'Scene');
  const targetScene = sceneOf(result)!;
  const shapes: CalmShape[] = [];
  const sides = [
    ['before', sanitizePreview(beforeXML)],
    ['after', sanitizePreview(afterXML)],
  ] as const;
  const viewpoint = sceneOf(
    parser.parseFromString(sides[1][1].xml, 'application/xml'),
  )?.querySelector(':scope > Viewpoint');
  if (viewpoint) targetScene.append(result.importNode(viewpoint, true));

  for (const [side, safe] of sides) {
    const source = sceneOf(parser.parseFromString(safe.xml, 'application/xml'));
    if (!source) throw new Error('The change scene needs two Scene elements.');
    const sourcePathByCue = new Map<string, string>();
    for (const [path, cue] of safe.pathToCue)
      // A shape that is USE'd later shares its cue: the first path is the one it was defined at.
      if (/\/Shape\[\d+\]$/.test(path) && !sourcePathByCue.has(cue)) sourcePathByCue.set(cue, path);
    const clone = result.importNode(source, true) as Element;
    const prefix = side === 'before' ? 'B_' : 'A_';
    for (const { node, path } of shapePaths(clone)) {
      const def = node.getAttribute('DEF');
      const { state, ids } = classify(sourcePathByCue.get(def ?? '') ?? path, side, report.changes);
      if (!state || !def) {
        if (!state) node.remove();
        continue;
      }
      for (const child of elements(node)) if (child.localName === 'Appearance') child.remove();
      const color = COLORS[theme][state];
      const appearance = result.createElement('Appearance');
      const material = result.createElement('Material');
      material.setAttribute('DEF', `${def}__X3DIFF_MATERIAL`);
      material.setAttribute('diffuseColor', color.diffuse);
      material.setAttribute('emissiveColor', '0 0 0');
      material.setAttribute('specularColor', '0 0 0');
      material.setAttribute('transparency', String(color.transparency));
      appearance.append(material);
      node.insertBefore(appearance, node.firstChild);
      shapes.push({
        name: `${prefix}${def}`,
        material: `${prefix}${def}__X3DIFF_MATERIAL`,
        state,
        transparency: color.transparency,
        changeIds: ids,
      });
    }
    for (const node of Array.from(clone.getElementsByTagName('*')))
      if (INERT_NODES.has(node.localName)) node.remove();
    for (const node of Array.from(clone.getElementsByTagName('*')))
      for (const key of ['DEF', 'USE']) {
        const value = node.getAttribute(key);
        if (value) node.setAttribute(key, `${prefix}${value}`);
      }
    const group = result.createElement('Group');
    for (const child of elements(clone)) {
      if (['Viewpoint', 'Background', 'WorldInfo', 'NavigationInfo'].includes(child.localName))
        continue;
      if (child.localName === 'Shape' || child.getElementsByTagName('Shape').length)
        group.append(child);
    }
    targetScene.append(group);
  }
  return { xml: new XMLSerializer().serializeToString(result), shapes };
}
