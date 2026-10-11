import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

/**
 * Motion of animated Transforms, read from declarations only: a TimeSensor drives a
 * PositionInterpolator or OrientationInterpolator, whose value is routed to a Transform.
 * Every enabled routed clock is assumed to start at time 0 and run for a loop or one cycle;
 * sensors, scripts and other triggers are not evaluated.
 *
 * The readers use only `getElementsByTagName`, `getAttribute` and `parentNode`, so the same
 * code runs on a browser Document and in unit tests.
 */

type Field = 'translation' | 'rotation' | 'scale';
interface Channel {
  field: Field;
  key: number[];
  values: number[][];
  cycle: number;
  loop: boolean;
  clock: string;
}
interface ShapeBox {
  shape: Element;
  box: Box3;
}
export interface MotionScene {
  /** DEF names of Transforms that receive animation, in file order. */
  animated: string[];
  transforms: Map<string, Element>;
  channels: Map<Element, Channel[]>;
  shapes: ShapeBox[];
}

const numbers = (raw: string | null): number[] =>
  (raw ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
const attribute = (node: Element, name: string, fallback: number[]): number[] => {
  const value = numbers(node.getAttribute(name));
  return value.length === fallback.length && value.every(Number.isFinite) ? value : fallback;
};
const elements = (root: Document | Element, name: string): Element[] =>
  Array.from(root.getElementsByTagName('*') as unknown as ArrayLike<Element>).filter(
    (node) =>
      (!node.namespaceURI ||
        node.namespaceURI === 'http://www.web3d.org/specifications/x3d-namespace') &&
      (name === '*' || node.localName === name),
  );
const parentOf = (node: Element): Element | null => {
  const parent = node.parentNode as Element | null;
  return parent && parent.nodeType === 1 ? parent : null;
};

/** Only Scene placements we can evaluate; prototype bodies have their own DEF scope. */
const placedInScene = (node: Element): boolean => {
  for (let at = parentOf(node); at; at = parentOf(at)) {
    if (at.localName === 'Scene') return true;
    if (!['Group', 'Transform'].includes(at.localName) || at.getAttribute('USE')) return false;
    if (at.namespaceURI && at.namespaceURI !== 'http://www.web3d.org/specifications/x3d-namespace')
      return false;
  }
  return false;
};

const INTERPOLATORS: Record<string, number> = {
  PositionInterpolator: 3,
  OrientationInterpolator: 4,
};
const TARGETS: Record<string, Field> = {
  translation: 'translation',
  set_translation: 'translation',
  rotation: 'rotation',
  set_rotation: 'rotation',
  scale: 'scale',
  set_scale: 'scale',
};

/** Extent of one geometry node in its Shape's coordinates, when it can be told from attributes. */
function geometryBox(shape: Element): Box3 | undefined {
  const first = (name: string) => elements(shape, name).find((node) => !node.getAttribute('USE'));
  const box = first('Box');
  if (box) {
    const [x, y, z] = attribute(box, 'size', [2, 2, 2]);
    return new Box3(new Vector3(-x / 2, -y / 2, -z / 2), new Vector3(x / 2, y / 2, z / 2));
  }
  const sphere = first('Sphere');
  if (sphere) {
    const [r] = attribute(sphere, 'radius', [1]);
    return new Box3(new Vector3(-r, -r, -r), new Vector3(r, r, r));
  }
  const round = first('Cylinder') ?? first('Cone');
  if (round) {
    const [r] = attribute(round, round.localName === 'Cone' ? 'bottomRadius' : 'radius', [1]);
    const [h] = attribute(round, 'height', [2]);
    return new Box3(new Vector3(-r, -h / 2, -r), new Vector3(r, h / 2, r));
  }
  const coordinate = first('Coordinate');
  if (coordinate) {
    const points = numbers(coordinate.getAttribute('point'));
    if (points.length >= 3 && points.length <= 3_000_000 && points.every(Number.isFinite)) {
      const result = new Box3();
      for (let i = 0; i + 2 < points.length; i += 3)
        result.expandByPoint(new Vector3(points[i], points[i + 1], points[i + 2]));
      return result;
    }
  }
  return undefined;
}

export function readMotionScene(doc: Document): MotionScene {
  const byDef = new Map<string, Element>();
  for (const node of elements(doc, '*')) {
    if (!placedInScene(node)) continue;
    const def = node.getAttribute('DEF');
    if (def && !byDef.has(def)) byDef.set(def, node);
  }
  const routes = elements(doc, 'ROUTE')
    .filter(placedInScene)
    .map((route) => ({
      from: route.getAttribute('fromNode') ?? '',
      fromField: route.getAttribute('fromField') ?? '',
      to: route.getAttribute('toNode') ?? '',
      toField: route.getAttribute('toField') ?? '',
    }));
  const channels = new Map<Element, Channel[]>();
  const animated: string[] = [];
  const drives = new Map<string, (typeof routes)[number]>();
  for (const route of routes)
    if (
      route.toField === 'set_fraction' &&
      route.fromField === 'fraction_changed' &&
      byDef.get(route.from)?.localName === 'TimeSensor' &&
      !drives.has(route.to)
    )
      drives.set(route.to, route);
  for (const route of routes) {
    const interpolator = byDef.get(route.from),
      target = byDef.get(route.to),
      field = TARGETS[route.toField];
    if (!interpolator || !target || !field || target.localName !== 'Transform') continue;
    const arity = INTERPOLATORS[interpolator.localName];
    if (!arity || route.fromField !== 'value_changed') continue;
    if ((field === 'rotation') !== (arity === 4)) continue;
    const key = numbers(interpolator.getAttribute('key'));
    const flat = numbers(interpolator.getAttribute('keyValue'));
    if (
      !key.length ||
      flat.length !== key.length * arity ||
      ![...key, ...flat].every(Number.isFinite) ||
      key.some((value, i) => value < 0 || value > 1 || (i > 0 && value < key[i - 1]))
    )
      continue;
    // The clock that drives this interpolator.
    const drive = drives.get(route.from);
    if (!drive) continue;
    const clock = byDef.get(drive.from)!;
    if (clock.getAttribute('enabled') === 'false') continue;
    const [cycle] = attribute(clock, 'cycleInterval', [1]);
    if (!(cycle > 0)) continue;
    const list = channels.get(target) ?? [];
    if (!list.length) animated.push(route.to);
    // A later route to the same field replaces the earlier one, as at run time.
    const next = list.filter((channel) => channel.field !== field);
    next.push({
      field,
      key,
      values: key.map((_, i) => flat.slice(i * arity, (i + 1) * arity)),
      cycle,
      loop: (clock.getAttribute('loop') ?? 'false').toLowerCase() === 'true',
      clock: drive.from,
    });
    channels.set(target, next);
  }
  const transforms = new Map<string, Element>();
  for (const [def, node] of byDef) if (node.localName === 'Transform') transforms.set(def, node);
  const shapes: ShapeBox[] = [];
  for (const shape of elements(doc, 'Shape')) {
    if (!placedInScene(shape) || shape.getAttribute('USE')) continue;
    const box = geometryBox(shape);
    if (box && !box.isEmpty()) shapes.push({ shape, box });
  }
  return { animated, transforms, channels, shapes };
}

const quaternion = ([x, y, z, angle]: number[]) => {
  const axis = new Vector3(x, y, z);
  return axis.lengthSq() < 1e-12
    ? new Quaternion()
    : new Quaternion().setFromAxisAngle(axis.normalize(), angle);
};

function sample(channel: Channel, time: number): number[] | Quaternion {
  const turns = time / channel.cycle;
  const fraction = channel.loop ? turns - Math.floor(turns) : Math.min(Math.max(turns, 0), 1);
  const { key, values } = channel;
  // Last key at or before this fraction, including duplicate keys. Binary search
  // keeps long authored key sequences from doing linear work at every sample.
  let low = 0,
    high = key.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (fraction >= key[middle]) low = middle + 1;
    else high = middle;
  }
  const i = Math.max(0, low - 1);
  const j = Math.min(i + 1, key.length - 1);
  const span = key[j] - key[i];
  const u = fraction <= key[0] || span <= 0 ? 0 : Math.min(1, (fraction - key[i]) / span);
  if (channel.field === 'rotation') return quaternion(values[i]).slerp(quaternion(values[j]), u);
  return values[i].map((v, n) => v + (values[j][n] - v) * u);
}

/** Local matrix of one Transform at a moment: T · C · R · SR · S · SR⁻¹ · C⁻¹. */
function localMatrix(node: Element, channels: Channel[] | undefined, time: number): Matrix4 {
  const value = (field: Field, fallback: number[]) => {
    const channel = channels?.find((item) => item.field === field);
    return channel ? sample(channel, time) : attribute(node, field, fallback);
  };
  const t = value('translation', [0, 0, 0]) as number[];
  const r = value('rotation', [0, 0, 1, 0]);
  const s = value('scale', [1, 1, 1]) as number[];
  const c = attribute(node, 'center', [0, 0, 0]);
  const so = new Matrix4().makeRotationFromQuaternion(
    quaternion(attribute(node, 'scaleOrientation', [0, 0, 1, 0])),
  );
  return new Matrix4()
    .makeTranslation(t[0], t[1], t[2])
    .multiply(new Matrix4().makeTranslation(c[0], c[1], c[2]))
    .multiply(new Matrix4().makeRotationFromQuaternion(r instanceof Quaternion ? r : quaternion(r)))
    .multiply(so)
    .multiply(new Matrix4().makeScale(s[0], s[1], s[2]))
    .multiply(so.clone().invert())
    .multiply(new Matrix4().makeTranslation(-c[0], -c[1], -c[2]));
}

/** World matrix of a node's coordinate system at a moment (the node's own Transform included). */
export function worldMatrixAt(scene: MotionScene, node: Element, time: number): Matrix4 {
  const chain: Element[] = [];
  for (let at: Element | null = node; at && at.localName !== 'Scene'; at = parentOf(at))
    if (at.localName === 'Transform') chain.unshift(at);
  const world = new Matrix4();
  for (const transform of chain)
    world.multiply(localMatrix(transform, scene.channels.get(transform), time));
  return world;
}

/** Clocks that move this Transform: its own and those of every Transform above it. */
function clocksOf(scene: MotionScene, node: Element): Channel[] {
  const result: Channel[] = [];
  for (let at: Element | null = node; at && at.localName !== 'Scene'; at = parentOf(at))
    result.push(...(scene.channels.get(at) ?? []));
  return result;
}

/** Bounds of the geometry under a Transform, in that Transform's own coordinates at rest. */
export function objectBox(scene: MotionScene, node: Element): Box3 {
  const box = new Box3();
  for (const item of scene.shapes) {
    const chain: Element[] = [];
    let at: Element | null = item.shape;
    for (; at && at !== node; at = parentOf(at))
      if (at.localName === 'Transform') chain.unshift(at);
    if (!at) continue;
    const relative = new Matrix4();
    for (const transform of chain)
      relative.multiply(localMatrix(transform, scene.channels.get(transform), 0));
    box.union(item.box.clone().applyMatrix4(relative));
  }
  if (box.isEmpty()) box.set(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
  return box;
}

export interface MotionPath {
  /** Rest bounds reused by the scrubber, in the tracked Transform's coordinates. */
  bounds: Box3;
  /** Seconds covered by one pass of this revision's own motion. */
  cycle: number;
  loops: boolean;
  /** World positions of the tracked point at each sample of the shared time window. */
  byTime: Vector3[];
  /** The same, sampled across this revision's own cycle (for same-phase comparison). */
  byPhase: Vector3[];
  length: number;
}
export interface MotionPair {
  def: string;
  /** Seconds shown when comparing at the same moment: the longer of the two cycles. */
  window: number;
  /** `centre` of the object's geometry, or an `edge` point that exposes a motion difference. */
  point: 'centre' | 'edge';
  before?: MotionPath;
  after?: MotionPath;
  /** Distance between the two tracked points at each sample; empty when one side is missing. */
  gapByTime: number[];
  gapByPhase: number[];
  /** Bounds diagonal of the object, for judging what is "the same". */
  size: number;
  changed: boolean;
}

const pathLength = (points: Vector3[]) =>
  points.reduce((sum, point, i) => (i ? sum + point.distanceTo(points[i - 1]) : 0), 0);

export const MOTION_SAMPLES = 240;
export const MAX_MOTION_OBJECTS = 128;

/** Compare the motion of every Transform animated in either revision, matched by DEF. */
export function compareMotion(
  before: MotionScene,
  after: MotionScene,
  samples = MOTION_SAMPLES,
): MotionPair[] {
  const names = [...new Set([...before.animated, ...after.animated])];
  if (names.length > MAX_MOTION_OBJECTS)
    throw new Error(
      `Motion paths were skipped: more than ${MAX_MOTION_OBJECTS} animated objects. The file differences remain available.`,
    );
  if (!Number.isInteger(samples) || samples < 1 || samples > 4096)
    throw new Error('Motion sampling requires between 1 and 4096 steps.');
  const pairs: MotionPair[] = [];
  for (const def of names) {
    const sides = [before, after].map((scene) => {
      const node = scene.transforms.get(def);
      if (!node) return undefined;
      const clocks = clocksOf(scene, node);
      return {
        scene,
        node,
        cycle: clocks.length ? Math.max(...clocks.map((clock) => clock.cycle)) : 0,
        loops: clocks.some((clock) => clock.loop),
        box: objectBox(scene, node),
      };
    });
    const present = sides.filter((side) => !!side);
    const window = Math.max(...present.map((side) => side.cycle));
    if (!(window > 0)) continue;
    const reference = (sides[1] ?? sides[0])!.box;
    const size = reference.getSize(new Vector3()).length() || 1;
    const tolerance = size * 1e-6;
    const steps = Array.from({ length: samples + 1 }, (_, i) => i / samples);
    // Reuse matrices while probing bounds corners: a centre can hide changes in rotation
    // or scale, and a single corner can lie on the rotation axis.
    const matrices = sides.map((side) => {
      if (!side) return undefined;
      const at = (time: number) => worldMatrixAt(side.scene, side.node, time);
      const own = side.cycle || window;
      return {
        byTime: steps.map((f) => at(f * window)),
        byPhase: steps.map((f) => at(side.loops ? Math.min(f * own, own * (1 - 1e-9)) : f * own)),
      };
    });
    const track = (local: Vector3) =>
      sides.map((side, index) => {
        if (!side) return undefined;
        const at = (matrix: Matrix4) => local.clone().applyMatrix4(matrix);
        const byTime = matrices[index]!.byTime.map(at);
        const byPhase = matrices[index]!.byPhase.map(at);
        return {
          bounds: side.box,
          cycle: side.cycle,
          loops: side.loops,
          byTime,
          byPhase,
          length: pathLength(byPhase),
        } satisfies MotionPath;
      });
    let point: MotionPair['point'] = 'centre';
    let paths = track(reference.getCenter(new Vector3()));
    const largestGap = ([b, a]: typeof paths) =>
      b && a
        ? Math.max(
            ...b.byTime.map((p, i) => p.distanceTo(a.byTime[i])),
            ...b.byPhase.map((p, i) => p.distanceTo(a.byPhase[i])),
          )
        : 0;
    const stationary = paths.every((path) => !path || path.length < tolerance);
    if (stationary || largestGap(paths) <= tolerance) {
      let best = largestGap(paths);
      let longest = 0;
      for (const x of [reference.max.x, reference.min.x])
        for (const y of [reference.max.y, reference.min.y])
          for (const z of [reference.max.z, reference.min.z]) {
            const candidate = track(new Vector3(x, y, z));
            const gap = largestGap(candidate);
            const length = Math.max(...candidate.map((path) => path?.length ?? 0));
            if (gap > best + tolerance || (stationary && best <= tolerance && length > longest)) {
              point = 'edge';
              paths = candidate;
              best = gap;
              longest = length;
            }
          }
    }
    const [b, a] = paths;
    const gap = (kind: 'byTime' | 'byPhase') =>
      b && a ? b[kind].map((position, i) => position.distanceTo(a[kind][i])) : [];
    const gapByTime = gap('byTime'),
      gapByPhase = gap('byPhase');
    pairs.push({
      def,
      window,
      point,
      before: b,
      after: a,
      gapByTime,
      gapByPhase,
      size,
      changed:
        !b ||
        !a ||
        Math.abs(b.cycle - a.cycle) > 1e-9 ||
        b.loops !== a.loops ||
        Math.max(...gapByTime, ...gapByPhase) > tolerance,
    });
  }
  return pairs;
}
