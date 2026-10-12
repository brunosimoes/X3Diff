import { Matrix4, Quaternion, Vector3, type Box3 } from 'three';
import type { X3DiffReport } from '../report/schema';
import type { AnalysisFacts } from '../report/export-html';
import type { X3DPane } from '../viewer/X3DPane';
import type { VolumeResolution } from '../viewer/shapeGeometry';
import type { Selection } from './selection';
import { COLORS, type CalmScene, type Theme } from './calmScene';

/** What every view of the workbench shares: one 3D stage, one side panel, one comparison. */
export interface Workbench {
  pane: X3DPane;
  /** The X_ITE scene on the stage, once a load has finished. */
  scene(): any;
  texts: [string, string];
  report: X3DiffReport;
  theme: Theme;
  calm: CalmScene;
  selection: Selection;
  volumeResolution: VolumeResolution;
  setVolumeResolution(value: VolumeResolution): void;
  caption: HTMLElement;
  tools: HTMLElement;
  footer: HTMLElement;
  side: HTMLElement;
  /** Drawing layer over the stage, for views that are flat. */
  flat: HTMLElement;
  setFlat(on: boolean): void;
}
export interface Tab {
  id: string;
  label: string;
  /** One word for the tab on a narrow screen. */
  short: string;
  available(): boolean;
  /** `alive` turns false once another tab or theme has taken over the stage. */
  show(alive: () => boolean): Promise<void>;
  hide?(): void;
  /** Release what outlives a view (a WebGL context) when the comparison is replaced. */
  dispose?(): void;
  /** Measurements and scope notes for the printable report. */
  facts?(): AnalysisFacts[] | Promise<AnalysisFacts[]>;
}

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
const SVG = 'http://www.w3.org/2000/svg';
export function svg(tag: string, attributes: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

export function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = make('button', 'quiet', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
const GLYPHS: Record<string, string> = {
  // Four corners pulling outwards: show everything.
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5M4 15v5h5m11-5v5h-5"/></svg>',
  // A frame closing on a dot: go to this one thing.
  focus:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="2.5"/></svg>',
};
/** Draw a button as a small mark followed by one or two plain words. */
export function setIcon(node: HTMLElement, symbol: string, label: string): void {
  const mark = make('span', 'glyph');
  if (GLYPHS[symbol]) mark.innerHTML = GLYPHS[symbol];
  else mark.textContent = symbol;
  // A phone shows the mark over the first word; the full label stays the accessible name.
  const word = make('span', 'word', label);
  word.dataset.short = label.split(' ')[0];
  node.setAttribute('aria-label', label);
  node.replaceChildren(mark, word);
}
/** Pair each action's mark with a readable label. */
export function icon(symbol: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = button('', onClick);
  node.classList.add('icon');
  setIcon(node, symbol, label);
  return node;
}

/** A keyboard-accessible disclosure of an analysis boundary. */
export function measurementLimits(text: string): HTMLDetailsElement {
  const node = make('details', 'limits');
  node.append(make('summary', '', 'Limits of this measurement'), make('p', '', text));
  return node;
}
/** Four significant digits: enough to compare, short enough to read. */
export const n = (value: number) => String(Number(value.toPrecision(4))).replace('-', '−');
export const signed = (value: number) => (value > 0 ? '+' : '') + n(value);
/**
 * Redraw a row of controls without dropping keyboard focus: the control at the same place
 * in the new row gets it back.
 */
export function keepFocus(host: HTMLElement, redraw: () => void): void {
  const index = Array.from(host.children).indexOf(document.activeElement as Element);
  redraw();
  if (index >= 0) (host.children[index] as HTMLElement | undefined)?.focus();
}
/** A legend entry that also switches its layer on and off. */
export function chip(
  kind: string,
  label: string,
  pressed: boolean,
  onToggle?: () => void,
  title = '',
) {
  const node = make(onToggle ? 'button' : 'span', 'chip');
  if (title) node.title = title;
  if (onToggle) {
    node.setAttribute('aria-pressed', String(pressed));
    node.addEventListener('click', onToggle);
  }
  node.append(make('span', `dot ${kind}`), label);
  return node;
}
export function field(label: string, control: HTMLElement): HTMLLabelElement {
  if (control instanceof HTMLSelectElement) control.setAttribute('aria-label', label);
  const node = make('label', 'field');
  node.append(make('span', '', label), control);
  return node;
}
export function select(options: string[], value: number, onChange: (index: number) => void) {
  const node = make('select');
  options.forEach((text, index) => {
    const option = make('option', '', text);
    option.value = String(index);
    node.append(option);
  });
  node.value = String(value);
  node.addEventListener('change', () => onChange(Number(node.value)));
  return node;
}
/** Label and value pairs, one per line. `kind` adds the legend dot of that colour. */
export function facts(
  rows: Array<[label: string, value: string, kind?: string, title?: string]>,
): HTMLElement {
  const list = make('dl', 'facts');
  for (const [label, value, kind, title] of rows) {
    const term = make('dt');
    if (title) term.title = title;
    if (kind) term.append(make('span', `dot ${kind}`));
    term.append(label);
    list.append(term, make('dd', '', value));
  }
  return list;
}
export function segmented<T extends string>(
  options: Array<[id: T, label: string, title?: string, short?: string]>,
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const group = make('div', 'segmented');
  group.setAttribute('role', 'group');
  for (const [id, label, title, short] of options) {
    const node = make('button', '', label);
    if (title) node.title = title;
    node.setAttribute('aria-label', label);
    node.dataset.short = short ?? label;
    node.type = 'button';
    node.setAttribute('aria-pressed', String(id === value));
    node.addEventListener('click', () => {
      if (node.getAttribute('aria-pressed') === 'true') return;
      for (const other of Array.from(group.children)) other.setAttribute('aria-pressed', 'false');
      node.setAttribute('aria-pressed', 'true');
      onChange(id);
    });
    group.append(node);
  }
  return group;
}
/**
 * Name what the stage shows, with an optional line of detail, in a note on the stage itself.
 * The bar above the stage is for buttons only: a narrow pane has no room there for words.
 */
export function captionText(host: HTMLElement, title: string, detail = ''): void {
  host.textContent = title;
  const line = document.querySelector<HTMLElement>('#detail');
  if (line) line.textContent = detail;
}
/** Document for a scene the workbench writes itself. */
export function emptyScene(): { doc: Document; scene: Element } {
  const doc = new DOMParser().parseFromString(
    '<X3D version="4.0" profile="Immersive"><Scene/></X3D>',
    'application/xml',
  );
  return { doc, scene: doc.getElementsByTagName('Scene')[0] };
}
export function matte(doc: Document, diffuse: string, transparency = 0): Element {
  const appearance = doc.createElement('Appearance');
  const material = doc.createElement('Material');
  material.setAttribute('diffuseColor', diffuse);
  material.setAttribute('emissiveColor', '0 0 0');
  material.setAttribute('specularColor', '0 0 0');
  material.setAttribute('transparency', String(transparency));
  appearance.append(material);
  return appearance;
}
/** A three-quarter view of the box, so a lone object never opens face-on. */
export function viewpoint(doc: Document, box: Box3): Element {
  const centre = box.getCenter(new Vector3());
  const radius = Math.max(box.getSize(new Vector3()).length() / 2, 1e-6);
  const eye = centre
    .clone()
    .add(new Vector3(1, 0.75, 1.25).normalize().multiplyScalar(radius * 2.5));
  const turn = new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(eye, centre, new Vector3(0, 1, 0)),
  );
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, turn.w)));
  const scale = Math.sqrt(Math.max(1 - turn.w * turn.w, 0));
  const axis = scale < 1e-6 ? [0, 1, 0] : [turn.x / scale, turn.y / scale, turn.z / scale];
  const node = doc.createElement('Viewpoint');
  node.setAttribute('position', eye.toArray().join(' '));
  node.setAttribute('orientation', [...axis, angle].join(' '));
  node.setAttribute('centerOfRotation', centre.toArray().join(' '));
  return node;
}
export const CONTEXT = 'X3DIFF_SCENE_CONTEXT';
/**
 * The rest of the revised scene as faint surroundings, so a view of one object still shows
 * where it sits. `without` names the shapes the view draws itself.
 */
export function ghostScene(wb: Workbench, doc: Document, without: string[] = []): Element {
  const source = new DOMParser().parseFromString(wb.calm.xml, 'application/xml');
  const groups = Array.from(source.getElementsByTagName('Scene')[0].children).filter(
    (child) => child.localName === 'Group',
  );
  const revised = doc.importNode(groups[groups.length - 1], true) as Element;
  for (const shape of Array.from(revised.getElementsByTagName('Shape')))
    if (without.includes(shape.getAttribute('DEF') ?? '')) shape.remove();
  for (const material of Array.from(revised.getElementsByTagName('Material'))) {
    material.setAttribute('diffuseColor', COLORS[wb.theme].unchanged.diffuse);
    material.setAttribute('transparency', wb.theme === 'dark' ? '0.8' : '0.9');
  }
  const toggle = doc.createElement('Switch');
  toggle.setAttribute('DEF', CONTEXT);
  toggle.setAttribute('whichChoice', '0');
  toggle.append(revised);
  return toggle;
}
export const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);
