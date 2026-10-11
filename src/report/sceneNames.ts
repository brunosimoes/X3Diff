import { catalog } from '../x3d/catalog';

// Names for objects that have no DEF of their own, from what they contain and where they sit.
// The wording is the one the geometry views use for their object selectors (shapeLabel in
// src/viewer/shapeGeometry.ts): "IndexedFaceSet in Bracket", "Box · shape 2 of 3 in Rack".

/** The few DOM members this module reads; satisfied by the browser DOM and by @xmldom. */
interface XmlElement {
  readonly nodeType: number;
  readonly localName: string | null;
  readonly childNodes: ArrayLike<unknown>;
  getAttribute(name: string): string | null;
}
interface SceneNode {
  type: string;
  def?: string;
  parent?: SceneNode;
  children: SceneNode[];
  /** False inside containers the previews leave out, so counts match the geometry views. */
  shown: boolean;
}
/** Looks up a reader-facing name for the element at a report path, if the scene has one. */
export type SceneNames = (path: string) => string | undefined;

const CONTAINERS = new Set(Object.keys(catalog));
const HIDDEN = new Set(['Anchor', 'Inline', 'NavigationInfo', 'ImageTexture', 'PixelTexture']);
const NOT_GEOMETRY = /^(Appearance|Metadata\w+)$/;

function collectShapes(node: SceneNode, out: SceneNode[]): SceneNode[] {
  if (node.type === 'Shape' && node.shown) out.push(node);
  for (const child of node.children) collectShapes(child, out);
  return out;
}
// A large scene asks for the shapes of the same owner once per listed object.
const shapeLists = new WeakMap<SceneNode, SceneNode[]>();
const shapePositions = new WeakMap<SceneNode[], Map<SceneNode, number>>();
function shapesUnder(node: SceneNode): SceneNode[] {
  let list = shapeLists.get(node);
  if (!list) shapeLists.set(node, (list = collectShapes(node, [])));
  return list;
}
/** Zero-based place of a shape in a list from `shapesUnder`. */
function placeIn(list: SceneNode[], shape: SceneNode): number {
  let places = shapePositions.get(list);
  if (!places) shapePositions.set(list, (places = new Map(list.map((item, i) => [item, i]))));
  return places.get(shape) ?? -1;
}
const geometryOf = (shape: SceneNode) =>
  shape.children.find((child) => !NOT_GEOMETRY.test(child.type))?.type ?? 'Shape';

/**
 * Index one parsed X3D document by the element paths the report uses
 * (`/X3D/Scene/Transform[2]/Shape[1]`).
 */
export function sceneNames(doc: { documentElement: unknown }): SceneNames {
  const byPath = new Map<string, SceneNode>();
  const elements = (e: XmlElement) =>
    Array.from(e.childNodes as ArrayLike<XmlElement>).filter((n) => n.nodeType === 1);
  const root = doc.documentElement as XmlElement | null;
  const scene = root && elements(root).find((e) => e.localName === 'Scene');
  const top: SceneNode = { type: 'Scene', children: [], shown: true };
  const visit = (e: XmlElement, parent: SceneNode, parentPath: string) => {
    const counts = new Map<string, number>();
    for (const child of elements(e)) {
      const type = child.localName ?? '';
      if (type === 'ROUTE') continue;
      const n = (counts.get(type) ?? 0) + 1;
      counts.set(type, n);
      const node: SceneNode = {
        type,
        def: child.getAttribute('DEF') || undefined,
        parent,
        children: [],
        shown: parent.shown && CONTAINERS.has(type) && !HIDDEN.has(type),
      };
      parent.children.push(node);
      const path = `${parentPath}/${type}[${n}]`;
      byPath.set(path, node);
      visit(child, node, path);
    }
  };
  if (scene) visit(scene, top, '/X3D/Scene');

  return (path) => {
    const node = byPath.get(path);
    if (!node) return undefined;
    if (node.def) return node.def;
    let owner = node.parent;
    while (owner && !owner.def && owner !== top) owner = owner.parent;
    const scope = owner ?? top;
    const where = scope === top ? 'in the file' : `in ${scope.def}`;
    const shapes = shapesUnder(node);
    const all = shapesUnder(scope);
    if (shapes.length === 1) {
      const type = geometryOf(shapes[0]);
      if (all.length === 1) return scope === top ? type : `${type} ${where}`;
      return `${type} · shape ${placeIn(all, shapes[0]) + 1} of ${all.length} ${where}`;
    }
    if (shapes.length > 1) {
      const types = [...new Set(shapes.map(geometryOf))];
      const list = types.length > 3 ? `${types.slice(0, 3).join(', ')}…` : types.join(', ');
      return `${shapes.length} shapes (${list}) · shapes ${placeIn(all, shapes[0]) + 1} to ${placeIn(all, shapes.at(-1)!) + 1} of ${all.length} ${where}`;
    }
    // Nothing drawable inside (a light, a clock, an empty group): say what it is and where.
    const peers: SceneNode[] = [];
    const collect = (n: SceneNode) => {
      if (n.type === node.type) peers.push(n);
      n.children.forEach(collect);
    };
    scope.children.forEach(collect);
    if (peers.length <= 1) return scope === top ? undefined : `${node.type} ${where}`;
    return `${node.type} ${peers.indexOf(node) + 1} of ${peers.length} ${where}`;
  };
}
