import {
  buildRegister,
  numberPair,
  propertyLabel,
  valueText,
  type ChangeGroup,
  type RegisterEntry,
} from '../report/presentation';
import { sceneNames } from '../report/sceneNames';
import type { ChangeRecord } from '../report/schema';
import type { CalmShape } from './calmScene';
import { diffWords, trimShared } from './textDiff';
import {
  captionText,
  chip,
  icon,
  keepFocus,
  make,
  segmented,
  signed,
  type Tab,
  type Workbench,
} from './ui';

type Mode = 'diff' | 'before' | 'after';
type Kind = 'changed' | 'added' | 'removed' | 'unchanged';
const KINDS: Kind[] = ['changed', 'added', 'removed', 'unchanged'];
/** One symbol per kind of difference, the same in the cards and in the legend. */
const SYMBOL: Record<Kind | 'data', string> = {
  changed: 'Δ',
  added: '+',
  removed: '−',
  unchanged: '=',
  data: '≠',
};
const KIND_TITLE: Record<Kind, string> = {
  changed: 'Changed parts',
  added: 'Added parts',
  removed: 'Removed parts',
  unchanged: 'Parts that are the same in both files',
};
/** How far the parts outside a selection fade. A dark stage swallows a faint part sooner. */
const FADED = { light: 0.84, dark: 0.72 };
const AXES = ['x', 'y', 'z', 'w'];

type CardKind = Exclude<Kind, 'unchanged'> | 'data';
type Filter = 'all' | CardKind;
const FILTERS: Array<[Filter, string]> = [
  ['all', 'Every difference'],
  ['changed', 'Changed parts'],
  ['added', 'Added parts'],
  ['removed', 'Removed parts'],
  ['data', 'Timing, titles and other settings'],
];

interface Card {
  entry: RegisterEntry;
  ids: Set<string>;
  shapes: CalmShape[];
  kind: CardKind;
  title: string;
  /** The change as one line of plain text, for the note on the stage. */
  detail: string;
  /** Everything the card says, lower-cased, for the search box. */
  text: string;
  button: HTMLButtonElement;
  /** For a group of identical changes: the list that names each part. */
  parts?: HTMLElement;
  partButtons: Map<string, HTMLButtonElement>;
}
/** One part picked out of a group of identical changes. */
interface Part {
  key: string;
  label: string;
  ids: Set<string>;
  changes: ChangeRecord[];
}

const kindOf = (shape: CalmShape): Kind => (shape.state === 'ghost' ? 'changed' : shape.state);
const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 4 &&
  value.every((v) => typeof v === 'number');
const css = (color: number[]) =>
  `#${color
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
/** A line of a card as plain text: a swatch reads as its colour code. */
const plain = (row: HTMLElement) =>
  Array.from(row.children.length ? row.childNodes : [row])
    .map((part) => part.textContent?.trim() || (part as HTMLElement).title || '')
    .filter(Boolean)
    .join(' ');
const clip = (text: string) => (text.length > 44 ? `${text.slice(0, 43)}…` : text);

/**
 * Text is shown as a text diff: what both files share stays plain, what was taken out is
 * struck through and what was put in is marked. Long shared stretches shrink to "…"; the
 * full values stay in the tooltip.
 */
function words(what: string, from: string, to: string): HTMLElement {
  const row = make('span', 'math pair');
  row.title = `${from} → ${to}`;
  const value = make('span', 'value');
  row.append(make('span', 'what', what), value);
  for (const run of trimShared(diffWords(from, to))) {
    if (run.kind === 'out') value.append(make('del', 'was', clip(run.text)));
    else if (run.kind === 'in') value.append(make('ins', 'now', clip(run.text)));
    else value.append(run.text);
  }
  return row;
}

/** One change as "property  a → b  Δ": numbers and symbols first, words only for the property. */
function line(change: ChangeRecord): HTMLElement | undefined {
  const row = make('span', 'math');
  const label = make('span', 'what', propertyLabel(change));
  const from = change.before?.value,
    to = change.after?.value;
  if (change.field === 'point' && change.totalPoints) {
    const moved = change.movedPoints ?? 0;
    label.textContent = 'Points moved';
    row.append(
      label,
      `${moved} of ${change.totalPoints}`,
      make('span', 'delta', `${Math.round((moved / change.totalPoints) * 100)} %`),
    );
    return row;
  }
  if (/color$/i.test(change.field ?? '') && isNumbers(from) && isNumbers(to)) {
    const a = make('span', 'swatch'),
      b = make('span', 'swatch');
    a.style.background = a.title = css(from);
    b.style.background = b.title = css(to);
    row.append(label, a, ' → ', b);
    return row;
  }
  if (typeof from === 'number' && typeof to === 'number') {
    const [a, b] = numberPair(from, to);
    row.append(label, `${a} → ${b}`, make('span', 'delta', `Δ ${signed(to - from)}`));
    return row;
  }
  if (isNumbers(from) && isNumbers(to) && from.length === to.length) {
    const deltas = from
      .map((value, i) => (to[i] === value ? '' : `Δ${AXES[i]} ${signed(to[i] - value)}`))
      .filter(Boolean);
    const values = from.map((value, i) => numberPair(value, to[i]));
    row.append(
      label,
      `(${values.map(([a]) => a).join(', ')}) → (${values.map(([, b]) => b).join(', ')})`,
    );
    if (deltas.length) row.append(make('span', 'delta', deltas.join('  ')));
    return row;
  }
  if (typeof from === 'string' && typeof to === 'string')
    return words(propertyLabel(change), from, to);
  if (typeof from === 'boolean' && typeof to === 'boolean') {
    row.append(label, `${from ? '1' : '0'} → ${to ? '1' : '0'}`);
    return row;
  }
  return undefined;
}

const text = (what: string, value: string) => {
  // A + or − is a mark in front of its list; any other label is a heading for its value.
  const row = make('span', /^[+−]$/.test(what) ? 'math pair sign' : 'math pair');
  row.append(make('span', 'what', what), value);
  return row;
};
/** Document metadata is a list of "name, value" pairs: one line per name that differs. */
function metadata(change: ChangeRecord): HTMLElement[] {
  const pairs = (value: unknown) =>
    new Map(
      (Array.isArray(value) ? value : [])
        .filter((item): item is string => typeof item === 'string' && item.includes('\0'))
        .map((item) => item.split('\0') as [string, string]),
    );
  const from = pairs(change.before?.value),
    to = pairs(change.after?.value);
  return [...new Set([...from.keys(), ...to.keys()])]
    .filter((name) => from.get(name) !== to.get(name))
    .map((name) => words(name, from.get(name) ?? '∅', to.get(name) ?? '∅'));
}
/**
 * Every change of one object, none left out: what can be written as numbers is, the rest is
 * listed with the values the report holds. Whole nodes that came or went are gathered into
 * one + line and one − line.
 */
function linesOf(
  changes: readonly ChangeRecord[],
  title: string,
  whole: boolean,
): { rows: HTMLElement[]; made: string[] } {
  const rows: HTMLElement[] = [];
  const came: string[] = [],
    went: string[] = [];
  for (const change of changes) {
    const node = change.afterNode ?? change.beforeNode;
    if (change.kind === 'nodeAdded') came.push(node?.defName ?? node?.nodeType ?? 'node');
    else if (change.kind === 'nodeRemoved') went.push(node?.defName ?? node?.nodeType ?? 'node');
    else {
      const meta = change.category === 'document' ? metadata(change) : [];
      const row = meta.length ? undefined : line(change);
      if (meta.length) rows.push(...meta);
      else if (row) rows.push(row);
      else if (change.before || change.after)
        rows.push(
          text(
            propertyLabel(change),
            `${valueText(change, 'before')} → ${valueText(change, 'after')}`,
          ),
        );
      else rows.push(text(propertyLabel(change), change.message));
    }
  }
  // The card already names the object, and a shape always brings its look along: list what
  // is left, which is the kind of geometry or the parts swapped inside an object.
  const worth = (names: string[]) =>
    names.filter(
      (name) =>
        name !== title &&
        !title.startsWith(`${name} `) &&
        !(whole && /^(Shape|Appearance|Material)$/.test(name)),
    );
  // A whole object that came or went is said in words on the card; these lines are for
  // parts swapped inside an object that is still there.
  if (whole) return { rows, made: worth([...went, ...came]) };
  if (worth(went).length) rows.push(text('−', worth(went).join(', ')));
  if (worth(came).length) rows.push(text('+', worth(came).join(', ')));
  return { rows, made: [] };
}

/** The file differences: one calm overlay, and a card per changed object that drives it. */
export function differencesTab(wb: Workbench): Tab {
  const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
  const entries = buildRegister(wb.report.changes, {
    before: sceneNames(parse(wb.texts[0])),
    after: sceneNames(parse(wb.texts[1])),
  });
  const shown: Record<Kind, boolean> = {
    changed: true,
    added: true,
    removed: true,
    unchanged: true,
  };
  let mode: Mode = 'diff';
  let cards: Card[] = [];
  let selectedKey: string | undefined;
  let part: Part | undefined;
  let filter: Filter = 'all';
  let query = '';
  let listHost = make('div');
  let seenSelection = -1;
  let zoom: HTMLButtonElement, clear: HTMLButtonElement;
  const selected = () => cards.find((card) => card.entry.key === selectedKey);

  /** Visibility and fading are fields of the loaded scene, so the camera never moves. */
  function applyScene(): void {
    const scene = wb.scene();
    if (!scene || mode !== 'diff') return;
    const ids = part?.ids ?? selected()?.ids;
    for (const shape of wb.calm.shapes) {
      const focused = !ids || shape.changeIds.some((id) => ids.has(id));
      try {
        scene.getNamedNode(shape.name).visible = shown[kindOf(shape)];
        scene.getNamedNode(shape.material).transparency = focused
          ? shape.transparency
          : Math.max(shape.transparency, FADED[wb.theme]);
      } catch {}
    }
  }

  function cueSelection(): void {
    wb.pane.clearCue();
    const focus = selected();
    if (!focus) return;
    const shapes = part
      ? focus.shapes.filter((shape) => shape.changeIds.some((id) => part!.ids.has(id)))
      : focus.shapes;
    if (mode === 'diff') {
      if (!wb.pane.cueMany(shapes.map((shape) => ({ defName: shape.name })))) return;
      // The cue only records what to frame; the fade already shows the selection.
      for (const shape of shapes)
        try {
          wb.scene().getNamedNode(shape.name).bboxDisplay = false;
        } catch {}
      return;
    }
    const side = mode === 'before' ? 'beforeNode' : 'afterNode';
    wb.pane.cueMany(
      (part?.changes ?? focus.entry.changes).map((change) => ({ path: change[side]?.path })),
    );
  }

  function renderCaption(): void {
    const focus = selected();
    if (focus) captionText(wb.caption, part?.label ?? focus.title, focus.detail);
    else if (mode === 'diff')
      captionText(
        wb.caption,
        `${wb.report.summary.status === 'incomplete' ? 'Partial · ' : ''}${wb.report.changes.length} ${wb.report.changes.length === 1 ? 'difference' : 'differences'}`,
      );
    else captionText(wb.caption, mode === 'before' ? 'A · original' : 'B · revised');
    zoom.hidden = !focus?.shapes.length;
    clear.hidden = !focus;
  }

  function renderFooter(): void {
    wb.footer.replaceChildren();
    if (mode !== 'diff') return;
    for (const kind of KINDS) {
      const count = wb.calm.shapes.filter((s) => kindOf(s) === kind && s.state !== 'ghost').length;
      if (!count) continue;
      wb.footer.append(
        chip(
          kind,
          `${SYMBOL[kind]} ${count}`,
          shown[kind],
          () => {
            shown[kind] = !shown[kind];
            keepFocus(wb.footer, renderFooter);
            applyScene();
          },
          KIND_TITLE[kind],
        ),
      );
    }
  }

  /** Publish the selection and bring the cards, the note and the scene in line with it. */
  function sync(): void {
    const active = selected();
    wb.selection.select(
      part?.changes ?? active?.entry.changes ?? [],
      part?.label ?? active?.title ?? '',
    );
    seenSelection = wb.selection.version;
    for (const item of cards) {
      item.button.setAttribute('aria-pressed', String(item.entry.key === selectedKey && !part));
      for (const [key, node] of item.partButtons)
        node.setAttribute('aria-pressed', String(key === part?.key));
    }
    renderCaption();
    applyScene();
    cueSelection();
  }
  function select(card?: Card): void {
    selectedKey = card && (card.entry.key !== selectedKey || part) ? card.entry.key : undefined;
    part = undefined;
    sync();
  }
  /** Pick one part out of a group of identical changes; picking it again lets go. */
  function selectPart(card: Card, member: ChangeGroup): void {
    const same = part?.key === member.key;
    selectedKey = same ? undefined : card.entry.key;
    part = same
      ? undefined
      : {
          key: member.key,
          label: member.label,
          ids: new Set(member.changes.map((change) => change.id)),
          changes: member.changes,
        };
    sync();
  }

  function build(entry: RegisterEntry): Card {
    const ids = new Set(entry.changes.map((change) => change.id));
    const shapes = wb.calm.shapes.filter((shape) => shape.changeIds.some((id) => ids.has(id)));
    const kinds = KINDS.filter((kind) => shapes.some((shape) => kindOf(shape) === kind));
    // Something with no shape can still be only in one file: say so with the same + and −.
    const only = (wanted: string) => entry.changes.every((change) => change.kind === wanted);
    const coloured = kinds.filter((item) => item !== 'unchanged');
    const kind: CardKind =
      coloured.length === 1
        ? coloured[0]
        : coloured.length
          ? 'changed'
          : only('nodeAdded')
            ? 'added'
            : only('nodeRemoved')
              ? 'removed'
              : 'data';
    // A bundle is the same change on many objects: show it once, with how many.
    const members = entry.kind === 'bundle' ? entry.groups : [entry];
    const names = new Set(shapes.map((item) => item.name.slice(2)));
    const own = names.size === 1 ? [...names][0] : '';
    const defined = entry.changes
      .flatMap((change) => [change.afterNode, change.beforeNode])
      .find((node) => node?.nodeType === 'Shape' && node.defName)?.defName;
    const title =
      entry.kind === 'bundle'
        ? 'Parts'
        : (defined ?? (own && !own.startsWith('X3DIFF_CUE_') ? own : entry.label));

    const node = make('button', 'card');
    node.type = 'button';
    node.setAttribute('aria-pressed', String(entry.key === selectedKey));
    const badge = make('span', `sym ${kind}`, SYMBOL[kind]);
    const head = make('span', 'card-head');
    // "Inline 2 of 2 in Rack" is a name and a place: the place goes on its own, quieter line.
    const [name, place] = title.split(/ in (?=\S+$)/);
    head.append(make('b', '', name));
    if (entry.kind === 'bundle') head.append(make('span', 'count', `× ${members.length}`));
    const body = make('span', 'card-body');
    body.append(head);
    const whole = kind === 'added' || kind === 'removed';
    const { rows: lines, made } = linesOf(members[0].changes, title, whole);
    // "Removed · Box, from Rack": what happened, what it was made of, where it sat.
    const status = whole
      ? [
          kind === 'added' ? 'Added' : 'Removed',
          made.length ? ` · ${made.join(', ')}` : '',
          place ? `${made.length ? ',' : ''} ${kind === 'added' ? 'to' : 'from'} ${place}` : '',
        ].join('')
      : place
        ? `in ${place}`
        : '';
    if (status) body.append(make('span', 'math where', status));
    // A closed card shows three lines; the selected card shows them all.
    lines.forEach((item, i) => {
      if (i >= 3) item.classList.add('extra');
      body.append(item);
    });
    if (lines.length > 3) body.append(make('span', 'math more', `+ ${lines.length - 3}`));
    node.append(badge, body);
    const detail = lines.length ? lines.slice(0, 2).map(plain).join(' · ') : status;
    const partButtons = new Map<string, HTMLButtonElement>();
    const card: Card = {
      entry,
      ids,
      shapes,
      kind,
      title,
      detail,
      text: [title, status, ...lines.map(plain), ...members.map((member) => member.label)]
        .join(' ')
        .toLowerCase(),
      button: node,
      partButtons,
    };
    node.addEventListener('click', () => select(card));
    if (entry.kind === 'bundle') {
      // The card stands for all of them; this names each one so a single part can be picked.
      const parts = make('details', 'parts');
      const list = make('div', 'part-list');
      for (const member of members) {
        const item = make('button', 'part', member.label);
        item.type = 'button';
        item.setAttribute('aria-pressed', 'false');
        item.addEventListener('click', () => selectPart(card, member));
        partButtons.set(member.key, item);
        list.append(item);
      }
      parts.append(make('summary', '', `Show the ${members.length} parts`), list);
      card.parts = parts;
    }
    return card;
  }

  /** The cards the filter and the search let through, under their two headings. */
  function renderCards(): void {
    const visible = cards.filter(
      (card) => (filter === 'all' || card.kind === filter) && (!query || card.text.includes(query)),
    );
    listHost.replaceChildren();
    const sections: Array<[string, string, Card[]]> = [
      ['Scene', 'Differences you can see in 3D', visible.filter((card) => card.shapes.length)],
      ['Data', 'Timing, titles and other settings', visible.filter((card) => !card.shapes.length)],
    ];
    for (const [heading, title, items] of sections) {
      if (!items.length) continue;
      const head = make('h2', '', `${heading} · ${items.length}`);
      head.title = title;
      const list = make('div', 'cards');
      for (const card of items) {
        list.append(card.button);
        if (card.parts) list.append(card.parts);
      }
      listHost.append(head, list);
    }
    if (!visible.length)
      listHost.append(make('p', 'empty', 'Nothing matches. Clear the filter or the search.'));
  }

  function renderList(): void {
    cards = entries.map(build);
    if (!cards.length) {
      wb.side.replaceChildren(
        make(
          'p',
          'empty',
          wb.report.summary.status === 'incomplete'
            ? 'No difference found in what was compared.'
            : 'No differences found.',
        ),
      );
      return;
    }
    // The filter doubles as a count of each kind of difference.
    const bar = make('div', 'filter');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Show');
    for (const [id, title] of FILTERS) {
      const count = id === 'all' ? cards.length : cards.filter((card) => card.kind === id).length;
      if (!count) continue;
      const node = make('button', 'filter-chip');
      node.type = 'button';
      node.title = title;
      node.setAttribute('aria-label', `${title}: ${count}`);
      node.setAttribute('aria-pressed', String(id === filter));
      if (id !== 'all' && id !== 'data') node.append(make('span', `dot ${id}`));
      node.append(id === 'all' ? `All ${count}` : `${SYMBOL[id]} ${count}`);
      node.addEventListener('click', () => {
        filter = id;
        for (const other of Array.from(bar.children)) other.setAttribute('aria-pressed', 'false');
        node.setAttribute('aria-pressed', 'true');
        renderCards();
      });
      bar.append(node);
    }
    const search = make('input', 'search');
    search.type = 'search';
    search.placeholder = 'Search names and values';
    search.setAttribute('aria-label', 'Search the differences');
    search.value = query;
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      renderCards();
    });
    listHost = make('div');
    wb.side.replaceChildren(bar, search, listHost);
    renderCards();
  }

  async function load(alive: () => boolean): Promise<void> {
    renderCaption();
    renderFooter();
    await wb.pane.load(mode === 'diff' ? wb.calm.xml : wb.texts[mode === 'before' ? 0 : 1]);
    if (!alive()) return;
    // An authored viewpoint is framed for its own window, not for this stage: fit what is shown.
    wb.pane.refreshView(true);
    applyScene();
    cueSelection();
  }

  return {
    id: 'differences',
    label: 'File differences',
    short: 'Differences',
    available: () => true,
    async show(alive) {
      if (seenSelection !== wb.selection.version) {
        seenSelection = wb.selection.version;
        const ids = new Set(wb.selection.changes.map((change) => change.id));
        selectedKey = entries.find((entry) =>
          entry.changes.some((change) => ids.has(change.id)),
        )?.key;
        part = undefined;
      }
      wb.setFlat(false);
      zoom = icon('focus', 'Zoom to selection', () => void wb.pane.focusSelection());
      clear = icon('×', 'Deselect', () => select());
      wb.tools.replaceChildren(
        zoom,
        clear,
        segmented<Mode>(
          [
            ['before', 'A · Before', 'Original file', 'A'],
            ['diff', 'Δ · Differences', 'Both files overlaid, differences in colour', 'Δ'],
            ['after', 'B · After', 'Revised file', 'B'],
          ],
          mode,
          (next) => {
            mode = next;
            void load(alive);
          },
        ),
        icon('fit', 'Fit scene', () => wb.pane.refreshView(true)),
      );
      renderList();
      await load(alive);
    },
  };
}
