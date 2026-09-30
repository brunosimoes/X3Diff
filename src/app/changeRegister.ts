import type { ChangeRecord, X3DiffReport } from '../report/schema';

export const categoryNames: Record<string, string> = {
  geometry: 'Geometry',
  material: 'Material',
  appearance: 'Appearance',
  transform: 'Transform',
  structure: 'Structure',
  metadata: 'Metadata',
  document: 'Document',
  animation: 'Animation',
  behavior: 'Animation',
  interaction: 'Interaction',
};
const fieldNames: Record<string, string> = {
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
};
function objectPath(change: ChangeRecord): string | undefined {
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
function objectLabel(path: string, changes: ChangeRecord[]): string {
  const owner = changes
    .flatMap((change) => [change.afterNode, change.beforeNode])
    .find((node) => node?.path === path && node.defName);
  if (owner?.defName) return owner.defName;
  const part = path.split('/').at(-1) ?? 'Scene';
  return part.replace(/\[(\d+)\]/, ' $1');
}
const number = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(5))));
function compact(value: unknown): string {
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
function valueCell(change: ChangeRecord, side: 'before' | 'after'): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = `revision-value ${side}`;
  const value = change[side]?.value;
  if (
    change.category === 'document' &&
    Array.isArray(value) &&
    value.every((v) => typeof v === 'string' && v.includes('\0'))
  ) {
    const other = change[side === 'before' ? 'after' : 'before']?.value;
    const unchanged = new Set(Array.isArray(other) ? other : []);
    for (const entry of value.filter((v) => !unchanged.has(v))) {
      const [key, content] = entry.split('\0');
      const line = document.createElement('span');
      line.className = 'metadata-value';
      const name = document.createElement('small');
      name.textContent = key;
      const text = document.createElement('span');
      text.textContent = /^https?:/.test(content) ? content.split('/').at(-1)! : content;
      text.title = content;
      line.append(name, text);
      td.append(line);
    }
    if (!td.childNodes.length) td.textContent = 'Unchanged';
    return td;
  }
  let label = compact(value);
  if (change.kind === 'nodeAdded') label = side === 'before' ? 'Absent' : 'Added';
  if (change.kind === 'nodeRemoved') label = side === 'before' ? 'Present' : 'Removed';
  if (change.field === 'point' && change.totalPoints)
    label = side === 'before' ? `${change.totalPoints} points` : `${change.movedPoints} moved`;
  if (change.kind === 'nodeRenamed')
    label = (side === 'before' ? change.beforeNode?.defName : change.afterNode?.defName) ?? label;
  if (
    /color/i.test(change.field ?? '') &&
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
  ) {
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = `rgb(${value.map((v) => Math.round(v * 255)).join(' ')})`;
    td.append(swatch);
  }
  const text = document.createElement('span');
  text.textContent = label;
  text.title = label;
  td.append(text);
  if (typeof value === 'number' && side === 'after' && typeof change.before?.value === 'number') {
    const delta = value - change.before.value;
    const tag = document.createElement('small');
    tag.className = 'value-delta';
    tag.textContent = `${delta > 0 ? '+' : ''}${number(delta)}`;
    td.append(tag);
  }
  return td;
}
export function renderRegister(
  container: HTMLElement,
  report: X3DiffReport,
  category: string,
  select: (change: ChangeRecord, group?: ChangeRecord[], label?: string) => void,
): void {
  container.replaceChildren();
  const records = report.changes
    .filter((c) => category === 'all' || c.category === category)
    .slice()
    .sort(
      (a, b) =>
        Number(['metadata', 'document'].includes(a.category)) -
        Number(['metadata', 'document'].includes(b.category)),
    );
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = report.changes.length
      ? 'No changes in this category.'
      : report.summary.status === 'complete'
        ? 'No supported differences at the current tolerances.'
        : 'No differences reported. Review the comparison limitations.';
    container.append(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'change-table';
  table.innerHTML =
    '<caption class="sr-only">Before and after values. Select an object to highlight it in the scene.</caption><thead><tr><th scope="col">Object / property</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>';
  const groups = new Map<string, ChangeRecord[]>();
  for (const change of records) {
    const node = change.afterNode ?? change.beforeNode;
    const key = node ? `${node.scopePath}|${objectPath(change)}` : 'scene';
    const group = groups.get(key) ?? [];
    group.push(change);
    groups.set(key, group);
  }
  const collapseLargeReport = groups.size > 12;
  const markSelected = (
    table: HTMLTableElement,
    row: HTMLTableRowElement,
    button?: HTMLButtonElement,
  ) => {
    for (const other of Array.from(table.querySelectorAll('tr.selected, tr.contains-selection')))
      other.classList.remove('selected', 'contains-selection');
    for (const other of Array.from(table.querySelectorAll('button.object-link[aria-pressed=true]')))
      other.setAttribute('aria-pressed', 'false');
    row.classList.add('selected');
    const parent = row.closest('tbody')?.querySelector('.group-heading');
    if (parent && parent !== row) parent.classList.add('contains-selection');
    button?.setAttribute('aria-pressed', 'true');
  };
  let index = 0;
  for (const [key, changes] of groups) {
    const body = document.createElement('tbody');
    if (changes.length > 1) {
      body.className = 'object-group';
      const path = key.slice(key.indexOf('|') + 1);
      const name = objectLabel(path, changes);
      const header = document.createElement('tr');
      header.className = 'group-heading';
      const cell = document.createElement('th');
      cell.colSpan = 3;
      cell.scope = 'rowgroup';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'group-toggle';
      toggle.title = `Highlight ${name} in the scene and expand or collapse its differences`;
      toggle.setAttribute('aria-expanded', String(!collapseLargeReport));
      const title = document.createElement('strong');
      title.textContent = name;
      toggle.append(title);
      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = `${changes.length} differences`;
      const chevron = document.createElement('span');
      chevron.className = 'group-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      const selectionHint = document.createElement('span');
      selectionHint.className = 'group-selection-hint';
      selectionHint.textContent = 'Selected child';
      toggle.append(count, selectionHint, chevron);
      toggle.addEventListener('click', () => {
        markSelected(table, header);
        select(changes[0], changes, name);
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded));
        for (const row of Array.from(body.querySelectorAll('tr:not(.group-heading)')))
          (row as HTMLTableRowElement).hidden = !expanded;
      });
      cell.append(toggle);
      header.append(cell);
      body.append(header);
    }
    const mixedNodes =
      new Set(changes.map((change) => (change.afterNode ?? change.beforeNode)?.nodeType)).size > 1;
    for (const change of changes) {
      const row = document.createElement('tr');
      row.className = 'change-row';
      row.dataset.category = change.category;
      row.hidden = changes.length > 1 && collapseLargeReport;
      const heading = document.createElement('th');
      heading.scope = 'row';
      const button = document.createElement('button');
      button.className = 'object-link';
      const node = change.afterNode ?? change.beforeNode;
      const object = document.createElement('strong');
      object.textContent = changes.length > 1 ? '' : (node?.defName ?? node?.nodeType ?? 'Scene');
      const property = document.createElement('span');
      property.textContent =
        change.kind === 'nodeAdded'
          ? 'Object added'
          : change.kind === 'nodeRemoved'
            ? 'Object removed'
            : change.kind === 'nodeRenamed'
              ? 'Identifier'
              : change.message === 'Profile changed'
                ? 'Profile'
                : change.message === 'Document META changed'
                  ? 'Metadata fields'
                  : (fieldNames[change.field ?? ''] ??
                    change.field ??
                    categoryNames[change.category] ??
                    change.category);
      if (changes.length > 1 && mixedNodes)
        property.textContent = `${node?.nodeType ?? 'Scene'} · ${property.textContent}`;
      const sequence = document.createElement('span');
      sequence.className = 'row-index';
      sequence.textContent = String(++index).padStart(2, '0');
      const words = document.createElement('span');
      words.append(object, property);
      button.append(sequence, words);
      button.title = `Highlight ${node?.defName ?? node?.nodeType ?? 'Scene'} in the scene`;
      const selectRow = () => {
        markSelected(table, row, button);
        select(change);
      };
      // Button activation bubbles here too, preserving keyboard access without
      // invoking selection twice when its text is clicked.
      row.addEventListener('click', selectRow);
      button.setAttribute('aria-pressed', 'false');
      heading.append(button);
      row.append(heading, valueCell(change, 'before'), valueCell(change, 'after'));
      body.append(row);
      if (change.field === 'point' && change.totalPoints) {
        const detail = document.createElement('tr');
        detail.className = 'coordinate-detail';
        detail.addEventListener('click', selectRow);
        detail.hidden = row.hidden;
        const cell = document.createElement('td');
        cell.colSpan = 3;
        const track = document.createElement('div');
        track.className = 'coordinate-track';
        const fill = document.createElement('span');
        fill.style.width = `${((change.movedPoints ?? 0) / change.totalPoints) * 100}%`;
        track.append(fill);
        const description = document.createElement('p');
        description.textContent = `${Math.round(((change.movedPoints ?? 0) / change.totalPoints) * 100)}% of indexed points moved · ${change.totalPoints - (change.movedPoints ?? 0)} unchanged · threshold ${change.toleranceApplied ?? report.config.vectorAbs}`;
        cell.append(track, description);
        detail.append(cell);
        body.append(detail);
      }
    }
    table.append(body);
  }
  container.append(table);
}
