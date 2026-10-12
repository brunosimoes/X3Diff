import { prescan } from '../x3d/prescan';
import { catalog } from '../x3d/catalog';
import { LIGHTS } from '../x3d/lights';
export type SanitizedPreview = { xml: string; notices: string[]; pathToCue: Map<string, string> };

const URL_NODES = new Set([
  'ImageTexture',
  'MovieTexture',
  'AudioClip',
  'PixelTexture',
  'ShaderPart',
  'ShaderProgram',
]);

// One comparison sanitises the same two revisions up to eight times (previews,
// overlay, section and volume readers). Remember the latest few results.
const recent = new Map<string, SanitizedPreview>();
const RECENT_LIMIT = 4;

/** Creates a renderer-only copy. Never pass user XML directly to X_ITE. */
export function sanitizePreview(source: string): SanitizedPreview {
  let result = recent.get(source);
  if (!result) {
    result = sanitize(source);
    recent.set(source, result);
    if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value!);
  }
  // Callers own and may mutate what they receive.
  return { xml: result.xml, notices: [...result.notices], pathToCue: new Map(result.pathToCue) };
}

function sanitize(source: string): SanitizedPreview {
  const blocked = prescan(source, 'before');
  if (blocked.length) throw new Error(blocked.map((d) => d.message).join(' '));
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Preview XML is malformed.');
  const sourcePaths = new WeakMap<Element, string>();
  const scene = Array.from(doc.documentElement.children).find((node) => node.localName === 'Scene');
  const stamp = (node: Element, path: string) => {
    sourcePaths.set(node, path);
    const counts = new Map<string, number>();
    for (const child of Array.from(node.children)) {
      if (child.localName === 'ROUTE') continue;
      const n = (counts.get(child.localName) ?? 0) + 1;
      counts.set(child.localName, n);
      stamp(child, `${path}/${child.localName}[${n}]`);
    }
  };
  if (scene) {
    const counts = new Map<string, number>();
    for (const child of Array.from(scene.children)) {
      if (child.localName === 'ROUTE') continue;
      const n = (counts.get(child.localName) ?? 0) + 1;
      counts.set(child.localName, n);
      stamp(child, `/X3D/Scene/${child.localName}[${n}]`);
    }
  }
  const notices = new Set<string>();
  const allowed = new Set([
    'X3D',
    'Scene',
    'head',
    'meta',
    'component',
    'unit',
    'ROUTE',
    ...Object.keys(catalog),
  ]);
  // The first NavigationInfo is the one a browser binds. Its headlight switch is the only
  // navigation setting that changes how the scene is lit.
  const headlightOff =
    doc.getElementsByTagName('NavigationInfo')[0]?.getAttribute('headlight') === 'false';
  for (const node of Array.from(doc.getElementsByTagName('*'))) {
    const name = node.localName;
    if (name === 'Script') {
      node.remove();
      notices.add('Script nodes are disabled in the preview.');
    } else if (name === 'NavigationInfo') {
      // Compared, but not applied: the workbench keeps its own orbit navigation in every view.
      node.remove();
      notices.add('Navigation settings are compared but not applied in the preview.');
    } else if (name === 'Anchor') {
      node.remove();
      notices.add('Anchor navigation is disabled in the preview.');
    } else if (['Inline', 'ExternProtoDeclare', 'ProtoInstance', 'ProtoDeclare'].includes(name)) {
      node.remove();
      notices.add('Inline and prototype content is omitted from the preview.');
    } else if (URL_NODES.has(name)) {
      node.remove();
      notices.add('URL-backed media and shaders are omitted; no content URLs are fetched.');
    } else if (
      !allowed.has(name) ||
      (node.namespaceURI &&
        node.namespaceURI !== 'http://www.web3d.org/specifications/x3d-namespace')
    ) {
      node.remove();
      notices.add('Unsupported or foreign content is omitted from the preview.');
    } else {
      for (const attr of Array.from(node.attributes)) {
        if (
          /(?:url$|^src$|^href$)/i.test(attr.localName) ||
          (/^on/i.test(attr.localName) && !(LIGHTS.has(name) && attr.localName === 'on')) ||
          (attr.namespaceURI && attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/')
        ) {
          node.removeAttribute(attr.name);
          notices.add('External resources are omitted; no content URLs are fetched.');
        }
      }
    }
  }
  // Show the scene under its own lights when it turns the headlight off and brings a light
  // that is switched on. Without one the preview keeps the headlight, so it is never black.
  if (
    scene &&
    headlightOff &&
    Array.from(doc.getElementsByTagName('*')).some(
      (node) => LIGHTS.has(node.localName) && node.getAttribute('on') !== 'false',
    )
  ) {
    const navigation = doc.createElementNS(scene.namespaceURI, 'NavigationInfo');
    navigation.setAttribute('headlight', 'false');
    scene.prepend(navigation);
    notices.add('The headlight is off, as the file asks: the scene is lit by its own lights.');
  }
  const remainingDefs = new Set(
    Array.from(doc.getElementsByTagName('*'))
      .map((n) => n.getAttribute('DEF'))
      .filter(Boolean),
  );
  for (const route of Array.from(doc.getElementsByTagName('ROUTE'))) {
    if (
      !remainingDefs.has(route.getAttribute('fromNode')) ||
      !remainingDefs.has(route.getAttribute('toNode'))
    )
      route.remove();
  }
  const pathToCue = new Map<string, string>();
  const usedDefs = new Set(
    Array.from(doc.getElementsByTagName('*'))
      .map((node) => node.getAttribute('DEF'))
      .filter((v): v is string => !!v),
  );
  let cueNumber = 0;
  const visit = (node: Element, path: string, inheritedDef?: string) => {
    const sourcePath = sourcePaths.get(node) ?? path;
    let activeDef: string | undefined = inheritedDef;
    if (node.localName === 'Shape') {
      activeDef = node.getAttribute('DEF') || node.getAttribute('USE') || undefined;
      if (!activeDef) {
        do {
          activeDef = `X3DIFF_CUE_${++cueNumber}`;
        } while (usedDefs.has(activeDef));
        usedDefs.add(activeDef);
        node.setAttribute('DEF', activeDef);
      }
    }
    if (activeDef) pathToCue.set(sourcePath, activeDef);
    const counts = new Map<string, number>();
    for (const child of Array.from(node.children)) {
      if (child.localName === 'ROUTE') continue;
      const n = (counts.get(child.localName) ?? 0) + 1;
      counts.set(child.localName, n);
      visit(child, `${sourcePath}/${child.localName}[${n}]`, activeDef);
    }
  };
  if (scene) {
    const counts = new Map<string, number>();
    for (const child of Array.from(scene.children)) {
      if (child.localName === 'ROUTE') continue;
      const n = (counts.get(child.localName) ?? 0) + 1;
      counts.set(child.localName, n);
      visit(child, `/X3D/Scene/${child.localName}[${n}]`);
    }
  }
  return { xml: new XMLSerializer().serializeToString(doc), notices: [...notices], pathToCue };
}
