import type { ChangeRecord } from './schema';
import type { SceneNames } from './sceneNames';

// Reader-facing names and groupings of change records. The register in the workbench and the
// printable report both read from here, so they list the same things under the same names.

export const categoryNames: Record<string, string> = {
  geometry: 'Geometry',
  material: 'Material',
  appearance: 'Appearance',
  transform: 'Transform',
  structure: 'Structure',
  metadata: 'Metadata',
  document: 'Document',
  behavior: 'Animation',
  // Every category the comparison engine emits needs a reader-facing name here.
  // No brackets in these names: the filter appends " · count" to each.
  identity: 'Identifiers',
  reference: 'References',
  texture: 'Texture',
  viewpoint: 'Viewpoint',
  lighting: 'Lighting',
  'external reference': 'External reference',
  field: 'Other fields',
};
/** Filter entry text, the same shape for every category: "Identifiers · 5". */
export function categoryLabel(category: string, count: number): string {
  const name = category === 'all' ? 'All categories' : (categoryNames[category] ?? category);
  return `${name} · ${count}`;
}
export const fieldNames: Record<string, string> = {
  parent: 'Parent',
  components: 'Component requirements',
  point: 'Coordinates',
  radius: 'Radius',
  diffuseColor: 'Diffuse color',
  emissiveColor: 'Emissive color',
  translation: 'Translation',
  rotation: 'Rotation',
  scale: 'Scale',
  size: 'Dimensions',
  title: 'Title',
  cycleInterval: 'Cycle duration (s)',
  height: 'Height',
  bottomRadius: 'Bottom radius',
  speed: 'Navigation speed',
  key: 'Key times',
  keyValue: 'Key values',
  spine: 'Spine',
  crossSection: 'Cross-section',
  image: 'Image pixels',
  // Lights.
  intensity: 'Light intensity',
  ambientIntensity: 'Ambient intensity',
  color: 'Color',
  location: 'Location',
  direction: 'Direction',
  on: 'Switched on',
  global: 'Lights the whole scene (global)',
  attenuation: 'Attenuation',
  beamWidth: 'Beam width (rad)',
  cutOffAngle: 'Cut-off angle (rad)',
  shadows: 'Casts shadows',
  shadowIntensity: 'Shadow intensity',
};
/** Light settings whose true/false reads better as a word in the value cells. */
const booleanWords: Record<string, [string, string]> = {
  on: ['on', 'off'],
  global: ['yes', 'no'],
  shadows: ['yes', 'no'],
};
/** Fields shown one axis per line, with the changed axes emphasised. */
export const AXIS_FIELDS = ['translation', 'scale', 'size', 'location', 'direction'];

export const number = (v: number) =>
  Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(5)));
export function compact(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'number') return number(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length > 9) return `${value.length} values`;
    return value
      .map((v) =>
        Array.isArray(v)
          ? v.map((n) => (typeof n === 'number' ? number(n) : String(n))).join(', ')
          : typeof v === 'number'
            ? number(v)
            : String(v),
      )
      .join(' · ');
  }
  return JSON.stringify(value);
}
const digits = (v: number, precision: number) =>
  Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(precision)));
/**
 * Two numbers as text. Five significant digits as everywhere else, unless that would write two
 * different numbers the same way ("2 → 2" for a change of 0.000004 reported at a tight
 * tolerance): then as many digits as it takes for the difference to show.
 */
export function numberPair(a: number, b: number): [string, string] {
  for (let precision = 5; precision <= 17; precision++) {
    const pair: [string, string] = [digits(a, precision), digits(b, precision)];
    if (a === b || pair[0] !== pair[1]) return pair;
  }
  return [String(a), String(b)];
}
/** `value` as `compact` writes it, with enough digits to differ visibly from the other side. */
export function compactAgainst(value: unknown, other: unknown): string {
  if (typeof value === 'number' && typeof other === 'number') return numberPair(value, other)[0];
  if (
    Array.isArray(value) &&
    Array.isArray(other) &&
    value.length === other.length &&
    value.length <= 9 &&
    value.every((v) => typeof v === 'number')
  )
    return value.map((v, i) => compactAgainst(v, other[i])).join(' · ');
  return compact(value);
}
/** The word a light's boolean setting is shown as ("on"/"off"), if it has one. */
export function booleanWord(change: ChangeRecord, value: unknown): string | undefined {
  const words = change.category === 'lighting' ? booleanWords[change.field ?? ''] : undefined;
  return words && typeof value === 'boolean' ? words[value ? 0 : 1] : undefined;
}

/** The path of the object a change belongs to: its Transform, or else its Shape. */
export function objectPath(change: ChangeRecord): string | undefined {
  const path = change.afterNode?.path ?? change.beforeNode?.path;
  if (!path) return undefined;
  const parts = path.split('/');
  // A Transform owns its visual descendants. Without one, the nearest Shape
  // owns the geometry and appearance changes beneath it.
  for (const type of ['Transform', 'Shape']) {
    for (let index = parts.length - 1; index >= 0; index--) {
      if (parts[index].startsWith(`${type}[`)) return parts.slice(0, index + 1).join('/');
    }
  }
  return path;
}
function objectLabel(path: string, changes: ChangeRecord[], named?: string): string {
  const owner = changes
    .flatMap((change) => [change.afterNode, change.beforeNode])
    .find((node) => node?.path === path && node.defName);
  if (owner?.defName) return owner.defName;
  if (named) return named;
  const part = path.split('/').at(-1) ?? 'Scene';
  return part.replace(/\[(\d+)\]/, ' $1');
}

/** Scene lookups that name an object without a DEF by what it contains and where it sits. */
export interface SceneNameSources {
  before?: SceneNames;
  after?: SceneNames;
}

/** The differences of one object, in register order. */
export interface ChangeGroup {
  kind: 'group';
  key: string;
  /** Reader-facing name of the object. */
  label: string;
  changes: ChangeRecord[];
  /** True when rows must name their own node type, because the label does not. */
  nameNodes: boolean;
}
/** Several objects that changed in exactly the same way, shown as one expandable line. */
export interface ChangeBundle {
  kind: 'bundle';
  key: string;
  /** "28 materials changed the same way". */
  label: string;
  /** "Diffuse color 0.8, 0.1, 0.1 → 0.2, 0.3, 0.8 · Emissive color …". */
  description: string;
  /** One group per object; every one has the same changes with the same values. */
  groups: ChangeGroup[];
  /** Every individual change of every object in the bundle. */
  changes: ChangeRecord[];
}
export type RegisterEntry = ChangeGroup | ChangeBundle;

/** Group changes by object, document and metadata changes last, as the register lists them. */
export function groupChanges(
  changes: readonly ChangeRecord[],
  names: SceneNameSources = {},
): ChangeGroup[] {
  const records = changes
    .slice()
    .sort(
      (a, b) =>
        Number(['metadata', 'document'].includes(a.category)) -
        Number(['metadata', 'document'].includes(b.category)),
    );
  const groups = new Map<string, ChangeRecord[]>();
  for (const change of records) {
    const node = change.afterNode ?? change.beforeNode;
    const key = node ? `${node.scopePath}|${objectPath(change)}` : 'scene';
    const group = groups.get(key) ?? [];
    group.push(change);
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => {
    const node = group[0].afterNode ?? group[0].beforeNode;
    const path = key.slice(key.indexOf('|') + 1);
    // The object is looked up in the revision that has it: After, or Before once removed.
    const named = node ? (group[0].afterNode ? names.after : names.before)?.(path) : undefined;
    if (group.length > 1)
      return {
        kind: 'group',
        key,
        label: objectLabel(path, group, named),
        changes: group,
        // Rows say which node they are about unless every change is on the object itself.
        nameNodes:
          new Set(group.map((c) => (c.afterNode ?? c.beforeNode)?.nodeType)).size > 1 ||
          group.some((c) => (c.afterNode ?? c.beforeNode)?.path !== path),
      };
    const type = node?.nodeType ?? 'Scene';
    const label = node?.defName ?? named ?? type;
    return {
      kind: 'group',
      key,
      label,
      changes: group,
      nameNodes: !node?.defName && label !== type && !label.startsWith(`${type} `),
    };
  });
}

/** A change as "which setting went from what to what", without the object it belongs to. */
function signature(change: ChangeRecord): string | undefined {
  // Only settings with a value on both sides can be "the same change". Long lists are
  // compared by identity: two meshes are never bundled.
  if (!change.field || !change.before || !change.after) return undefined;
  const values = [change.before.value, change.after.value];
  if (values.some((value) => Array.isArray(value) && value.length > 16)) return undefined;
  return JSON.stringify([
    (change.afterNode ?? change.beforeNode)?.nodeType,
    change.kind,
    change.field,
    ...values,
  ]);
}
/** Fewer than this many objects with the same change are listed one by one. */
export const BUNDLE_MINIMUM = 3;
const nouns: Record<string, string> = { Material: 'materials', Transform: 'placements' };

/**
 * The register as it is listed: one entry per object, except that objects whose changes are
 * identical, value for value, are folded into one bundle. Every change stays in exactly one
 * entry, so the entries always add up to the number of changes.
 */
export function buildRegister(
  changes: readonly ChangeRecord[],
  names: SceneNameSources = {},
): RegisterEntry[] {
  const groups = groupChanges(changes, names);
  const alike = new Map<string, ChangeGroup[]>();
  const keyOf = new Map<ChangeGroup, string>();
  for (const group of groups) {
    const parts = group.changes.map(signature);
    if (parts.some((part) => part === undefined)) continue;
    const key = (parts as string[]).sort().join('\n');
    keyOf.set(group, key);
    alike.set(key, [...(alike.get(key) ?? []), group]);
  }
  const entries: RegisterEntry[] = [];
  const done = new Set<string>();
  for (const group of groups) {
    const key = keyOf.get(group);
    const members = key === undefined ? undefined : alike.get(key);
    if (!key || !members || members.length < BUNDLE_MINIMUM) {
      entries.push(group);
      continue;
    }
    if (done.has(key)) continue;
    done.add(key);
    const types = new Set(group.changes.map((c) => (c.afterNode ?? c.beforeNode)?.nodeType));
    const noun = (types.size === 1 && nouns[[...types][0] ?? '']) || 'objects';
    const shown = group.changes.slice(0, 2).map((change) => {
      const text = (side: 'before' | 'after') => compact(change[side]?.value);
      return `${propertyLabel(change)} ${text('before')} → ${text('after')}`;
    });
    if (group.changes.length > 2) shown.push(`${group.changes.length - 2} more`);
    entries.push({
      kind: 'bundle',
      key: `bundle|${group.key}`,
      label: `${members.length} ${noun} changed the same way`,
      description: shown.join(' · '),
      groups: members,
      changes: members.flatMap((member) => member.changes),
    });
  }
  return entries;
}

/** Changes inside one object that are the same, value for value: one expandable line. */
export interface ChangeFold {
  kind: 'fold';
  /** "24 materials changed the same way". */
  label: string;
  /** "Diffuse color 1, 0, 0 → 0, 0, 1". */
  description: string;
  /** Every individual change behind the line, in file order. */
  changes: ChangeRecord[];
}
export type GroupItem = { kind: 'row'; change: ChangeRecord } | ChangeFold;

/**
 * The rows of one object as they are listed. Three or more of its changes that are the same
 * setting going from the same value to the same value become one fold, placed where the first
 * of them stood; everything else keeps its place. Every change is in exactly one item.
 */
export function foldGroup(group: ChangeGroup): GroupItem[] {
  const alike = new Map<string, ChangeRecord[]>();
  const keys = group.changes.map(signature);
  group.changes.forEach((change, i) => {
    const key = keys[i];
    if (key !== undefined) alike.set(key, [...(alike.get(key) ?? []), change]);
  });
  const items: GroupItem[] = [];
  const done = new Set<string>();
  group.changes.forEach((change, i) => {
    const key = keys[i];
    const members = key === undefined ? undefined : alike.get(key);
    if (key === undefined || !members || members.length < BUNDLE_MINIMUM) {
      items.push({ kind: 'row', change });
      return;
    }
    if (done.has(key)) return;
    done.add(key);
    const type = (change.afterNode ?? change.beforeNode)?.nodeType ?? 'Scene';
    items.push({
      kind: 'fold',
      label: `${members.length} ${nouns[type] ?? `${type} nodes`} changed the same way`,
      description: `${propertyLabel(change)} ${compact(change.before?.value)} → ${compact(change.after?.value)}`,
      // In file order (Shape 2 before Shape 10), whatever order the engine listed them in.
      changes: members
        .slice()
        .sort((a, b) => pathOf(a).localeCompare(pathOf(b), 'en', { numeric: true })),
    });
  });
  return items;
}
const pathOf = (change: ChangeRecord) => (change.afterNode ?? change.beforeNode)?.path ?? '';
/** The shape a change sits in, named as the register names objects: "Box · shape 3 of 24 in Rack". */
export function partLabel(change: ChangeRecord, names: SceneNameSources = {}): string | undefined {
  const parts = (change.afterNode ?? change.beforeNode)?.path.split('/') ?? [];
  for (let index = parts.length - 1; index >= 0; index--)
    if (parts[index].startsWith('Shape['))
      return (change.afterNode ? names.after : names.before)?.(parts.slice(0, index + 1).join('/'));
  return undefined;
}

const GEOMETRY_NODES =
  /^(Box|Sphere|Cylinder|Cone|Extrusion|IndexedFaceSet|IndexedLineSet|Text|Coordinate)$/;
const LOOK_NODES = /^(Appearance|Material|ImageTexture|PixelTexture|TextureTransform|Color)$/;
/** Words for what happened to objects, in the order the summary lists them. */
const OBJECT_WORDS = ['resized', 'reshaped', 'recoloured', 'moved', 'rotated', 'added', 'removed'];
const OTHER_WORDS: Record<string, string> = {
  lighting: 'light setting',
  viewpoint: 'view setting',
  metadata: 'title or document detail',
  document: 'title or document detail',
  identity: 'name',
  reference: 'reference',
  structure: 'arrangement',
};
/**
 * One plain sentence for the top of the register: "1 object resized, 1 recoloured, 1 moved,
 * 1 added." It counts objects, so one object can appear under more than one word; changes
 * that are not about an object (lights, animation, titles) follow after a semicolon.
 */
export function summarizeChanges(changes: readonly ChangeRecord[]): string {
  if (!changes.length) return '';
  const objects = new Map<string, number>();
  const others = new Map<string, number>();
  const bump = (bag: Map<string, number>, word: string) => bag.set(word, (bag.get(word) ?? 0) + 1);
  const typeOf = (c: ChangeRecord) => (c.afterNode ?? c.beforeNode)?.nodeType ?? '';
  for (const group of groupChanges(changes)) {
    const path = group.key.slice(group.key.indexOf('|') + 1);
    const isObject = /\/(Transform|Shape)\[\d+\]$/.test(path);
    const whole = (c: ChangeRecord) =>
      (c.afterNode ?? c.beforeNode)?.path === path || typeOf(c) === 'Shape';
    const adds = group.changes.filter((c) => c.kind === 'nodeAdded'),
      removes = group.changes.filter((c) => c.kind === 'nodeRemoved');
    const words = new Set<string>();
    if (isObject && adds.some(whole) && !removes.length) words.add('added');
    else if (isObject && removes.some(whole) && !adds.length) words.add('removed');
    else
      for (const c of [...adds, ...removes]) {
        // A part swapped inside an object that is still there changes its shape or its look.
        if (isObject && GEOMETRY_NODES.test(typeOf(c))) words.add('reshaped');
        else if (isObject && LOOK_NODES.test(typeOf(c))) words.add('recoloured');
        else bump(others, `${typeOf(c)} ${c.kind === 'nodeAdded' ? 'added' : 'removed'}`);
      }
    for (const c of group.changes) {
      if (c.kind === 'nodeAdded' || c.kind === 'nodeRemoved') continue;
      if (isObject && c.kind === 'nodeMoved') words.add('moved');
      else if (c.category === 'geometry')
        words.add(c.field === 'point' || c.field === 'coordIndex' ? 'reshaped' : 'resized');
      else if (['material', 'appearance', 'texture'].includes(c.category)) words.add('recoloured');
      else if (c.category === 'transform')
        words.add(
          c.field === 'scale'
            ? 'resized'
            : c.field === 'rotation' || c.field === 'scaleOrientation'
              ? 'rotated'
              : 'moved',
        );
      else if (c.category === 'behavior')
        bump(others, c.kind.startsWith('route') ? 'animation route' : 'animation setting');
      else bump(others, OTHER_WORDS[c.category] ?? 'other setting');
    }
    for (const word of words) bump(objects, word);
  }
  const parts: string[] = [];
  for (const word of OBJECT_WORDS) {
    const count = objects.get(word);
    if (!count) continue;
    parts.push(
      parts.length ? `${count} ${word}` : `${count} object${count === 1 ? '' : 's'} ${word}`,
    );
  }
  const extra = [...others].map(([phrase, count]) =>
    / (added|removed)$/.test(phrase)
      ? `${count} ${phrase}`
      : `${count} ${phrase}${count === 1 ? '' : 's'} changed`,
  );
  return [parts.join(', '), extra.join(', ')].filter(Boolean).join('; ') + '.';
}

/** What changed, in words: "Light intensity", "Object added", "X3D version". */
export function propertyLabel(change: ChangeRecord): string {
  return change.kind === 'nodeAdded'
    ? 'Object added'
    : change.kind === 'nodeRemoved'
      ? 'Object removed'
      : change.kind === 'nodeRenamed'
        ? 'Identifier'
        : change.message === 'Profile changed'
          ? 'Profile'
          : change.message === 'X3D version changed'
            ? 'X3D version'
            : change.message === 'Document META changed'
              ? 'Metadata fields'
              : (fieldNames[change.field ?? ''] ??
                change.field ??
                categoryNames[change.category] ??
                change.category);
}

/** One side of a change as plain text, for the printable report. */
export function valueText(change: ChangeRecord, side: 'before' | 'after'): string {
  const value = change[side]?.value;
  if (change.kind === 'nodeAdded' || change.kind === 'nodeRemoved')
    return (change.kind === 'nodeAdded' ? side === 'after' : side === 'before')
      ? 'present'
      : 'absent';
  if (
    change.category === 'document' &&
    Array.isArray(value) &&
    value.every((v) => typeof v === 'string' && v.includes('\0'))
  ) {
    const other = change[side === 'before' ? 'after' : 'before']?.value;
    const unchanged = new Set(Array.isArray(other) ? other : []);
    const entries = (value as string[]).filter((v) => !unchanged.has(v));
    return entries.length
      ? entries.map((entry) => entry.split('\0').join(': ')).join('\n')
      : 'unchanged';
  }
  if (change.field === 'point' && change.totalPoints)
    return side === 'before' ? `${change.totalPoints} points` : `${change.movedPoints} moved`;
  if (change.kind === 'nodeRenamed')
    return (
      (side === 'before' ? change.beforeNode?.defName : change.afterNode?.defName) ?? compact(value)
    );
  const word = booleanWord(change, value);
  if (word) return word;
  const other = change[side === 'before' ? 'after' : 'before']?.value;
  if (AXIS_FIELDS.includes(change.field ?? '') && Array.isArray(value) && value.length === 3)
    return value
      .map(
        (component, i) =>
          `${['X', 'Y', 'Z'][i]} ${compactAgainst(component, Array.isArray(other) ? other[i] : undefined)}`,
      )
      .join(' · ');
  if (typeof value === 'number' && side === 'after' && typeof other === 'number') {
    const delta = value - other;
    return `${compactAgainst(value, other)} (${delta > 0 ? '+' : ''}${number(delta)})`;
  }
  return compactAgainst(value, other);
}
