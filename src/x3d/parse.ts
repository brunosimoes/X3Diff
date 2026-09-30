import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { catalog } from './catalog';
import { prescan } from './prescan';
import type { Diagnostic, InputSummary, ValueSnapshot } from '../report/schema';

export interface ParsedNode {
  type: string;
  def?: string;
  use?: string;
  path: string;
  parentPath: string;
  field: string;
  ordinal: number;
  attrs: Record<string, ValueSnapshot>;
  children: ParsedNode[];
  opaque: boolean;
}
export interface Route {
  fromDEF: string;
  fromField: string;
  toDEF: string;
  toField: string;
}
export interface ParsedScene {
  summary: InputSummary;
  nodes: ParsedNode[];
  routes: Route[];
  meta: string[];
  diagnostics: Diagnostic[];
  fatal: boolean;
  defs: Map<string, ParsedNode>;
  uses: Map<string, number>;
}
const nodeNames = new Set(Object.keys(catalog));
const supportedTypes = new Set([
  'SFBool',
  'SFInt32',
  'SFFloat',
  'SFDouble',
  'SFTime',
  'SFColor',
  'SFColorRGBA',
  'SFVec2f',
  'SFVec2d',
  'SFVec3f',
  'SFVec3d',
  'SFVec4f',
  'SFRotation',
  'SFString',
  'MFString',
  'MFFloat',
  'MFDouble',
  'MFTime',
  'MFInt32',
  'MFVec2f',
  'MFVec2d',
  'MFVec3f',
  'MFVec3d',
  'MFColor',
  'MFColorRGBA',
  'MFRotation',
  'SFNode',
  'MFNode',
]);
export const supportedFieldTypes = [...supportedTypes].sort();
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
function annotation(a: {
  namespaceURI: string | null;
  localName: string | null;
  name: string;
}): boolean {
  return (
    a.namespaceURI === XMLNS ||
    a.name === 'xmlns' ||
    a.name.startsWith('xmlns:') ||
    (a.namespaceURI === XSI &&
      ['schemaLocation', 'noNamespaceSchemaLocation'].includes(a.localName || ''))
  );
}
function local(e: Element): string {
  const name = e.localName || e.tagName.split(':').pop()!;
  return e.namespaceURI && e.namespaceURI !== 'http://www.web3d.org/specifications/x3d-namespace'
    ? '{' + e.namespaceURI + '}' + name
    : name;
}
function elementChildren(e: Element): Element[] {
  return Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
}
function numeric(raw: string, arity: number, multi: boolean, integer = false): unknown {
  const tokens = raw.trim() ? raw.trim().split(/[\s,]+/) : [];
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const integerToken = /^[+-]?(?:\d+|0[xX][0-9a-fA-F]+)$/;
  if (tokens.some((v) => !(integer ? integerToken : decimal).test(v)))
    throw new Error('Invalid numeric token');
  const nums = tokens.map((v) =>
    integer && /^[+-]?0x/i.test(v)
      ? (v.startsWith('-') ? -1 : 1) * Number(v.replace(/^[+-]/, ''))
      : Number(v),
  );
  if (
    nums.some((v) => !Number.isFinite(v)) ||
    (multi ? nums.length % arity !== 0 : nums.length !== arity)
  )
    throw new Error(`Invalid numeric ${multi ? 'array' : 'tuple'}: ${raw.slice(0, 80)}`);
  return arity === 1
    ? multi
      ? nums
      : nums[0]
    : multi
      ? Array.from({ length: nums.length / arity }, (_, i) =>
          nums.slice(i * arity, (i + 1) * arity),
        )
      : nums;
}
function mfString(raw: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < raw.length) {
    while (/\s/.test(raw[i] || '') && i < raw.length) i++;
    if (i >= raw.length) break;
    if (raw[i++] !== '"') throw new Error('MFString items must be quoted');
    let s = '',
      closed = false;
    while (i < raw.length) {
      const ch = raw[i++];
      if (ch === '"') {
        closed = true;
        break;
      }
      if (ch === '\\') {
        if (i >= raw.length) throw new Error('Incomplete MFString escape');
        s += raw[i++];
      } else s += ch;
    }
    if (!closed) throw new Error('Unclosed MFString item');
    out.push(s);
  }
  return out;
}
export function typedValue(raw: string, type: string): ValueSnapshot {
  let value: unknown;
  if (type === 'SFString') value = raw;
  else if (type === 'MFString') value = mfString(raw);
  else if (type === 'SFBool') {
    if (raw !== 'true' && raw !== 'false') throw new Error(`Invalid SFBool ${raw}`);
    value = raw === 'true';
  } else if (type === 'SFNode' || type === 'MFNode') value = raw;
  else {
    const multi = type.startsWith('MF');
    const arity = type.includes('Vec2')
      ? 2
      : type.includes('Vec3') || (type.includes('Color') && !type.includes('RGBA'))
        ? 3
        : type.includes('Vec4') || type.includes('RGBA') || type.includes('Rotation')
          ? 4
          : 1;
    value = numeric(raw, arity, multi, type.includes('Int32'));
    if (
      type.includes('Int32') &&
      (Array.isArray(value) ? value : [value]).some(
        (v) => !Number.isInteger(v) || Number(v) < -2147483648 || Number(v) > 2147483647,
      )
    )
      throw new Error('Expected signed 32-bit integer');
    if (type.includes('Rotation')) {
      const rotations = (multi ? value : [value]) as number[][];
      if (rotations.some((v) => Math.hypot(v[0], v[1], v[2]) === 0))
        throw new Error('Rotation axis must be nonzero');
    }
  }
  return { fieldType: type, value, lexicalValue: raw };
}
export function parseX3D(text: string, side: 'before' | 'after', name?: string): ParsedScene {
  const diagnostics = prescan(text, side);
  const summary: InputSummary = {
    name,
    byteLength: new TextEncoder().encode(text).length,
    components: [],
    parsedNodeCount: 0,
  };
  const empty = (): ParsedScene => ({
    summary,
    nodes: [],
    routes: [],
    meta: [],
    diagnostics,
    fatal: true,
    defs: new Map(),
    uses: new Map(),
  });
  if (diagnostics.some((d) => d.severity === 'error')) return empty();
  const errors: string[] = [];
  let doc: Document;
  try {
    doc = new DOMParser({
      errorHandler: (level, msg) => {
        if (level !== 'warning') errors.push(msg);
      },
    }).parseFromString(text, 'application/xml');
  } catch (err) {
    errors.push((err as Error).message);
    diagnostics.push(
      ...errors.map((message) => ({
        code: 'XML_PARSE',
        severity: 'error' as const,
        side,
        message,
      })),
    );
    return empty();
  }
  if (errors.length) {
    diagnostics.push(
      ...errors.map((message) => ({
        code: 'XML_PARSE',
        severity: 'error' as const,
        side,
        message,
      })),
    );
    return empty();
  }
  const root = doc.documentElement;
  if (!root || local(root) !== 'X3D') {
    diagnostics.push({
      code: 'ROOT_INVALID',
      severity: 'error',
      side,
      message: 'Expected X3D document root',
    });
    return empty();
  }
  summary.x3dVersion = root.getAttribute('version') || undefined;
  summary.profile = root.getAttribute('profile') || undefined;
  const scene = elementChildren(root).find((e) => local(e) === 'Scene');
  if (!scene) {
    diagnostics.push({
      code: 'SCENE_MISSING',
      severity: 'error',
      side,
      message: 'Expected Scene element',
    });
    return empty();
  }
  const defs = new Map<string, ParsedNode>(),
    uses = new Map<string, number>(),
    routes: Route[] = [],
    meta: string[] = [],
    nodes: ParsedNode[] = [];
  let numericScalars = 0;
  for (const e of elementChildren(root)) {
    if (local(e) === 'head')
      for (const m of elementChildren(e)) {
        if (local(m) === 'meta')
          meta.push(`${m.getAttribute('name') || ''}\u0000${m.getAttribute('content') || ''}`);
        if (local(m) === 'component')
          summary.components.push({
            name: m.getAttribute('name') || '',
            level: Number(m.getAttribute('level')) || 0,
          });
      }
  }
  const visit = (e: Element, parentPath: string, ordinal: number): ParsedNode | null => {
    const type = local(e),
      path = `${parentPath}/${type}[${ordinal}]`;
    if (type === 'ROUTE') {
      routes.push({
        fromDEF: e.getAttribute('fromNode') || '',
        fromField: e.getAttribute('fromField') || '',
        toDEF: e.getAttribute('toNode') || '',
        toField: e.getAttribute('toField') || '',
      });
      return null;
    }
    const known = nodeNames.has(type),
      def = e.getAttribute('DEF') || undefined,
      use = e.getAttribute('USE') || undefined;
    const cf =
      e.getAttribute('containerField') ||
      (known ? catalog[type as keyof typeof catalog].containerField : '?');
    const node: ParsedNode = {
      type,
      def,
      use,
      path,
      parentPath,
      field: cf,
      ordinal,
      attrs: {},
      children: [],
      opaque: !known,
    };
    summary.parsedNodeCount++;
    if (summary.parsedNodeCount > 50000) throw new Error('NODE_LIMIT');
    if (!known)
      diagnostics.push({
        code: 'UNSUPPORTED_NODE',
        severity: 'warning',
        side,
        message: `${type} is opaque`,
        path,
      });
    if (['Inline', 'ImageTexture', 'Anchor'].includes(type))
      diagnostics.push({
        code: 'EXTERNAL_CONTENT_NOT_LOADED',
        severity: 'warning',
        side,
        message: `${type} external content is not loaded; only its declaration is compared`,
        path,
      });
    if (use) {
      uses.set(use, (uses.get(use) || 0) + 1);
      if (
        def ||
        Array.from({ length: e.attributes.length }, (_, i) => e.attributes.item(i)!).some(
          (a) => !annotation(a) && !['USE', 'containerField'].includes(a.name),
        )
      )
        diagnostics.push({
          code: 'INVALID_USE',
          severity: 'error',
          side,
          message: 'USE may only carry USE and containerField',
          path,
        });
    }
    if (def) {
      if (defs.has(def))
        diagnostics.push({
          code: 'DUPLICATE_DEF',
          severity: 'error',
          side,
          message: `Duplicate DEF ${def}`,
          path,
        });
      else defs.set(def, node);
    }
    const fieldCatalog = known
      ? (catalog[type as keyof typeof catalog].fields as Record<
          string,
          { type: string; default?: string }
        >)
      : {};
    for (let i = 0; i < e.attributes.length; i++) {
      const a = e.attributes.item(i)!;
      const key = a.name;
      if (annotation(a) || (!a.namespaceURI && ['DEF', 'USE', 'containerField'].includes(key)))
        continue;
      const field = a.namespaceURI ? undefined : fieldCatalog[key];
      if (!field || !supportedTypes.has(field.type)) {
        node.opaque = true;
        diagnostics.push({
          code: 'UNSUPPORTED_FIELD',
          severity: 'warning',
          side,
          message: `${type}.${key} is opaque`,
          path,
        });
        continue;
      }
      try {
        node.attrs[key] = typedValue(a.value, field.type);
        if (
          !field.type.includes('String') &&
          !field.type.includes('Node') &&
          field.type !== 'SFBool'
        ) {
          numericScalars += (a.value.match(/[^\s,]+/g) || []).length;
          if (numericScalars > 5000000) throw new Error('SCALAR_LIMIT');
        }
      } catch (err) {
        if ((err as Error).message === 'SCALAR_LIMIT') throw err;
        node.opaque = true;
        node.attrs[key] = { fieldType: 'invalid', value: a.value, lexicalValue: a.value };
        diagnostics.push({
          code: 'INVALID_FIELD',
          severity: 'error',
          side,
          message: `${type}.${key}: ${(err as Error).message}`,
          path,
        });
      }
    }
    if (known && !use)
      for (const [key, field] of Object.entries(fieldCatalog))
        if (
          !(key in node.attrs) &&
          field.default !== undefined &&
          supportedTypes.has(field.type) &&
          !['SFNode', 'MFNode'].includes(field.type)
        ) {
          try {
            node.attrs[key] = typedValue(field.default, field.type);
          } catch {
            diagnostics.push({
              code: 'INVALID_CATALOG_DEFAULT',
              severity: 'warning',
              side,
              message: `Could not parse ${type}.${key} catalog default`,
              path,
            });
          }
        }
    const counts = new Map<string, number>();
    for (const child of elementChildren(e)) {
      const childType = local(child);
      if (childType === 'ROUTE') {
        visit(child, path, 0);
        continue;
      }
      const n = (counts.get(childType) || 0) + 1;
      counts.set(childType, n);
      const parsed = visit(child, path, n);
      if (parsed) node.children.push(parsed);
    }
    return node;
  };
  try {
    const counts = new Map<string, number>();
    for (const e of elementChildren(scene)) {
      const type = local(e);
      if (type === 'ROUTE') {
        visit(e, '/X3D/Scene', 0);
        continue;
      }
      const n = (counts.get(type) || 0) + 1;
      counts.set(type, n);
      const p = visit(e, '/X3D/Scene', n);
      if (p) nodes.push(p);
    }
  } catch (err) {
    const code = (err as Error).message;
    if (code === 'NODE_LIMIT' || code === 'SCALAR_LIMIT') {
      diagnostics.push({
        code,
        severity: 'error',
        side,
        message:
          code === 'NODE_LIMIT'
            ? '50,000 node limit exceeded'
            : '5 million numeric scalar limit exceeded',
      });
      return empty();
    }
    throw err;
  }
  for (const [ref] of uses)
    if (!defs.has(ref))
      diagnostics.push({
        code: 'UNRESOLVED_USE',
        severity: 'error',
        side,
        message: `Unresolved USE ${ref}`,
      });
  for (const r of routes)
    for (const ref of [r.fromDEF, r.toDEF])
      if (!defs.has(ref))
        diagnostics.push({
          code: 'UNRESOLVED_ROUTE',
          severity: 'error',
          side,
          message: `Unresolved ROUTE endpoint ${ref}`,
        });
  return {
    summary,
    nodes,
    routes,
    meta: meta.sort(),
    diagnostics,
    fatal: diagnostics.some((d) =>
      ['NODE_LIMIT', 'XML_PARSE', 'ROOT_INVALID', 'SCENE_MISSING'].includes(d.code),
    ),
    defs,
    uses,
  };
}
