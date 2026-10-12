import { acceptsFile, planDrop, type Side } from './dropFiles';
import { initialTheme, readSettings, saveSettings, type Theme } from './preferences';
import { DEFAULT_TOLERANCE } from '../diff/tolerance';
import type { VolumeResolution } from '../viewer/shapeGeometry';
import { ComparisonClient } from '../diff/workerClient';
import { coverageLines, describeCoverage, describeDiagnostic } from '../report/coverage';
import { exportReportHtml } from '../report/export-html';
import { exportReportJson } from '../report/export-json';
import { exportFileName } from '../report/fileNames';
import type { X3DiffReport } from '../report/schema';
import { sceneNames } from '../report/sceneNames';
import { X3DPane } from '../viewer/X3DPane';
import { readInput } from '../x3d/readInput';
import { buildCalmScene } from './calmScene';
import { differencesTab } from './differences';
import { geometryTabs } from './geometry';
import { motionTab } from './motionTab';
import { resizableSide } from './splitter';
import { Selection } from './selection';
import { captionText, make, type Tab, type Workbench } from './ui';
import './style.css';

// The workbench: two X3D revisions, A (original) and B (revised), compared in the browser.
// Every view draws on the same stage and keeps its controls and figures in the side panel.

interface Input {
  name: string;
  text: string;
}
const THEME_KEY = 'x3diff-theme';

const fetched = (before: string, after: string) => () =>
  Promise.all(
    [before, after].map((file) =>
      fetch(`${import.meta.env.BASE_URL}examples/${file}`).then((response) => {
        if (!response.ok) throw new Error('Example files are unavailable.');
        return response.text();
      }),
    ),
  );
const EXAMPLES: Record<string, { label: string; load: () => Promise<string[]> }> = {
  brickhaven: {
    label: 'Brickhaven',
    load: fetched('brickhaven/before.x3d', 'brickhaven/after.x3d'),
  },
  forgeworks: {
    label: 'Forgeworks',
    load: fetched('forgeworks/before.x3d', 'forgeworks/after.x3d'),
  },
  fitlab: { label: 'Fit Lab', load: fetched('fitlab/before.x3d', 'fitlab/after.x3d') },
  example: { label: 'Objects', load: fetched('HelloWorld.x3d', 'HelloWorld-edited.x3d') },
  dolphin: {
    label: 'Dolphin',
    load: async () =>
      (
        await Promise.all([
          import('../../fixtures/dolphin/before.x3d?raw'),
          import('../../fixtures/dolphin/after.x3d?raw'),
        ])
      ).map((file) => file.default),
  },
};
const DEFAULT_EXAMPLE = 'brickhaven';
const el = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main class="shell">
  <header class="bar">
    <a class="brand" href="./" title="About X3Diff">X3Diff</a>
    <select class="quiet" id="example" aria-label="Open an example">
      <option value="">Examples</option>${Object.entries(EXAMPLES)
        .map(([id, example]) => `<option value="${id}">${example.label}</option>`)
        .join('')}</select>
    <span class="pair"><span class="file"><button class="quiet" id="open-before" type="button" title="Choose the original file"><b>A</b> <span id="name-before">Original…</span></button><input id="file-before" type="file" accept=".x3d,.xml,application/xml,text/xml" hidden /></span>
    <button class="swap" id="swap" type="button" title="Swap A and B" aria-label="Swap A and B">⇄</button>
    <span class="file"><button class="quiet" id="open-after" type="button" title="Choose the revised file"><b>B</b> <span id="name-after">Revised…</span></button><input id="file-after" type="file" accept=".x3d,.xml,application/xml,text/xml" hidden /></span></span>
    <span class="spacer"></span>
    <button class="quiet" id="more" type="button" aria-expanded="false" aria-controls="actions" aria-label="More actions" title="More actions">⋯</button>
    <span class="actions" id="actions"><a class="quiet coverage" href="./coverage.html" target="_blank" rel="noopener">Coverage</a>
    <button class="quiet" id="settings" type="button" aria-haspopup="dialog">Settings</button>
    <select class="quiet" id="export" aria-label="Export" disabled>
      <option value="">Export</option>
      <option value="html">Report (HTML)</option>
      <option value="json">Data (JSON)</option>
    </select>
    <button class="quiet" id="theme" type="button">Dark theme</button></span>
  </header>
  <dialog id="settings-dialog" aria-labelledby="settings-title">
    <form id="settings-form">
      <div class="settings-head"><h2 id="settings-title">Settings</h2><button class="quiet" id="settings-close" type="button" aria-label="Close settings">×</button></div>
      <label for="point-tolerance">Point tolerance</label>
      <input id="point-tolerance" type="number" min="0" step="any" required aria-describedby="point-tolerance-help" />
      <p id="point-tolerance-help">Distance threshold for moved coordinates, in scene units. Apply to compare the files again.</p>
      <label for="volume-resolution">Volume resolution</label>
      <select id="volume-resolution" aria-describedby="volume-resolution-help"><option value="low">Low · faster</option><option value="medium">Medium</option><option value="high">High · finer</option></select>
      <p id="volume-resolution-help">Controls curved-solid detail and mesh sampling. Finer grids take longer; volumes remain approximate.</p>
      <button class="quiet" type="submit">Apply settings</button>
    </form>
  </dialog>
  <details class="notices" id="notices" hidden><summary id="notices-title"></summary><ul id="notices-list"></ul></details>
  <section class="workspace" aria-busy="true">
    <div class="tabs" id="tabs" role="tablist" aria-label="Analysis views"></div>
    <div class="scene">
      <div class="caption"><div class="tools" id="tools"></div></div>
      <div class="stage" id="stage"><div class="flat" id="flat" hidden></div><p class="note" id="note" role="status"><b id="caption">Comparing…</b><span id="detail"></span></p><div class="drop" id="drop" hidden>Drop one or two .x3d files</div></div>
      <div class="chips" id="footer"></div>
    </div>
    <div class="splitter" id="splitter" role="separator" aria-orientation="vertical" aria-label="Resize the side panel" title="Drag to resize · Double-click to reset" tabindex="0"></div>
    <div class="sheet" id="sheet"><button class="grip" id="grip" type="button" aria-expanded="false" aria-controls="side" aria-label="Expand the panel"></button><div class="list" id="side" role="tabpanel"></div></div>
  </section>
</main>`;

const pane = new X3DPane('Scene');
pane.setAnimationEnabled(false);
el('#stage').prepend(pane.element);
const workspace = el('.workspace');
resizableSide(workspace, el('#splitter'), el('#side'));

const client = new ComparisonClient();
const inputs: Partial<Record<Side, Input>> = {};
const settings = readSettings();
let theme: Theme = 'light';
let tabs: Tab[] = [];
let current: Tab | undefined;
/** Bumped whenever the stage is handed to another view, so late results know they are stale. */
let ticket = 0;
/** Bumped for every new pair of files. */
let revision = 0;
/** File reads supersede requests for the same side; opposite sides can finish independently. */
const reads: Record<Side, number> = { before: 0, after: 0 };
let wb: Workbench | undefined;

function open(tab: Tab): void {
  const mine = ++ticket;
  current?.hide?.();
  current = tab;
  history.replaceState(null, '', `${location.pathname}${location.search}#${tab.id}`);
  for (const node of Array.from(el('#tabs').children) as HTMLElement[]) {
    const selected = node.dataset.tab === tab.id;
    node.setAttribute('aria-selected', String(selected));
    node.tabIndex = selected ? 0 : -1;
  }
  el('#side').setAttribute('aria-labelledby', `tab-${tab.id}`);
  tab
    .show(() => mine === ticket)
    .catch((error) => {
      if (mine === ticket)
        captionText(
          el('#caption'),
          error instanceof Error ? error.message : 'This view could not open.',
        );
    });
}

function setTheme(next: Theme, remember = false): void {
  theme = next;
  document.documentElement.dataset.theme = theme;
  el('#theme').textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
  pane.setTheme(theme);
  if (remember)
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* The theme still applies for this visit. */
    }
  if (!wb) return;
  wb.theme = theme;
  wb.calm = buildCalmScene(wb.texts[0], wb.texts[1], wb.report, theme);
  if (current) open(current);
}

/** Empty the workbench and say why: while comparing, when a file is missing, or on an error. */
function reset(message: string, detail = ''): void {
  ticket++;
  current?.hide?.();
  current = undefined;
  wb = undefined;
  for (const tab of tabs) tab.dispose?.();
  tabs = [];
  pane.clear();
  for (const id of ['#tabs', '#tools', '#footer', '#side']) el(id).replaceChildren();
  el('#flat').hidden = true;
  el('#notices').hidden = true;
  el<HTMLSelectElement>('#export').disabled = true;
  captionText(el('#caption'), message, detail);
}

function showNames(): void {
  el('#name-before').textContent = inputs.before?.name ?? 'Original…';
  el('#name-after').textContent = inputs.after?.name ?? 'Revised…';
}

/** What the comparison could not read or compare, above the workbench where it cannot be missed. */
function showNotices(report: X3DiffReport): void {
  const names = { before: inputs.before?.name, after: inputs.after?.name };
  const coverage = describeCoverage(report);
  const lines = coverage.partial
    ? coverageLines(coverage, names)
    : report.diagnostics.map((item) => describeDiagnostic(item, names));
  const notices = el<HTMLDetailsElement>('#notices');
  notices.hidden = !lines.length;
  notices.open = coverage.partial;
  notices.classList.toggle('partial', coverage.partial);
  el('#notices-title').textContent = coverage.partial
    ? 'Incomplete comparison: some content was not compared'
    : `${lines.length} ${lines.length === 1 ? 'note' : 'notes'} about these files`;
  el('#notices-list').replaceChildren(...lines.map((line) => make('li', '', line)));
}

async function compare(preserveSelection = false): Promise<void> {
  const selectedTab = preserveSelection ? current?.id : undefined;
  const selection = preserveSelection && wb ? wb.selection : new Selection();
  const mine = ++revision;
  const { before, after } = inputs;
  showNames();
  if (!before || !after) {
    client.cancel();
    workspace.setAttribute('aria-busy', 'false');
    reset(
      before || after ? `Choose the ${before ? 'revised' : 'original'} file` : 'Choose two files',
      'Use the A and B buttons above, or drop .x3d files here. Nothing is uploaded.',
    );
    return;
  }
  workspace.setAttribute('aria-busy', 'true');
  reset('Comparing…');
  try {
    const report = await client.compare({
      before: before.text,
      after: after.text,
      config: { ...DEFAULT_TOLERANCE, vectorAbs: settings.pointTolerance },
      names: { before: before.name, after: after.name },
    });
    if (mine !== revision) return;
    showNotices(report);
    if (report.summary.status === 'failed') {
      captionText(el('#caption'), 'These files could not be compared', 'See the notes above.');
      return;
    }
    const texts: [string, string] = [before.text, after.text];
    const flat = el('#flat');
    wb = {
      pane,
      scene: () => (pane.element.querySelector('x3d-canvas') as any)?.browser?.currentScene,
      texts,
      report,
      theme,
      calm: buildCalmScene(texts[0], texts[1], report, theme),
      selection,
      volumeResolution: settings.volumeResolution,
      setVolumeResolution,
      caption: el('#caption'),
      tools: el('#tools'),
      footer: el('#footer'),
      side: el('#side'),
      flat,
      setFlat: (on) => (flat.hidden = !on),
    };
    tabs = [differencesTab(wb), ...geometryTabs(wb), motionTab(wb)].filter((tab) =>
      tab.available(),
    );
    el('#tabs').replaceChildren(
      ...tabs.map((tab) => {
        const node = make('button', '', tab.label);
        node.type = 'button';
        // A phone has room for one word per tab; the full name stays the accessible one.
        node.dataset.short = tab.short;
        node.setAttribute('aria-label', tab.label);
        node.id = `tab-${tab.id}`;
        node.dataset.tab = tab.id;
        node.setAttribute('role', 'tab');
        node.setAttribute('aria-controls', 'side');
        node.addEventListener('click', () => tab !== current && open(tab));
        return node;
      }),
    );
    el<HTMLSelectElement>('#export').disabled = false;
    const requestedTab =
      selectedTab ?? (location.hash.slice(1) || new URLSearchParams(location.search).get('view'));
    open(tabs.find((tab) => tab.id === requestedTab) ?? tabs[0]);
  } catch (error) {
    if (mine !== revision || (error instanceof DOMException && error.name === 'AbortError')) return;
    reset(
      'These files could not be compared',
      error instanceof Error ? error.message : 'The comparison failed.',
    );
  } finally {
    if (mine === revision) workspace.setAttribute('aria-busy', 'false');
  }
}

async function loadExample(id: string): Promise<void> {
  reads.before++;
  reads.after++;
  const mine = ++revision;
  client.cancel();
  workspace.setAttribute('aria-busy', 'true');
  reset('Loading the example…');
  try {
    const [before, after] = await EXAMPLES[id].load();
    if (mine !== revision) return;
    const label = EXAMPLES[id].label;
    inputs.before = { name: `${label} · original`, text: before };
    inputs.after = { name: `${label} · revised`, text: after };
    await compare();
  } catch (error) {
    if (mine !== revision) return;
    workspace.setAttribute('aria-busy', 'false');
    reset('The example could not be loaded', error instanceof Error ? error.message : 'Try again.');
  }
}

/** Read the reviewer's own files into the sides given, then compare what is loaded. */
async function loadFiles(files: File[], sides: Side[]): Promise<void> {
  // Personal files form their own pair, including while the first read is still pending.
  if (el<HTMLSelectElement>('#example').value) {
    delete inputs.before;
    delete inputs.after;
    el<HTMLSelectElement>('#example').value = '';
    history.replaceState(null, '', location.pathname);
  }
  const requests = sides.map((side) => ({ side, token: ++reads[side] }));
  for (const side of sides) delete inputs[side];
  revision++;
  client.cancel();
  showNames();
  reset('Reading files…');
  workspace.setAttribute('aria-busy', 'true');
  const results = await Promise.allSettled(
    files.map((file) =>
      acceptsFile(file)
        ? readInput(file)
        : Promise.reject(new Error('Choose an .x3d or .xml file saved as UTF-8 XML.')),
    ),
  );
  let changed = false;
  const errors: string[] = [];
  results.forEach((result, i) => {
    const { side, token } = requests[i];
    if (reads[side] !== token) return;
    changed = true;
    if (result.status === 'fulfilled') inputs[side] = { name: files[i].name, text: result.value };
    else
      errors.push(
        result.reason instanceof Error
          ? result.reason.message
          : 'Choose an .x3d file saved as UTF-8 XML.',
      );
  });
  if (!changed) return;
  if (errors.length) {
    revision++;
    client.cancel();
    showNames();
    workspace.setAttribute('aria-busy', 'false');
    reset('That file could not be read', errors.join(' '));
  } else await compare();
}

for (const side of ['before', 'after'] as const) {
  const input = el<HTMLInputElement>(`#file-${side}`);
  el(`#open-${side}`).addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) void loadFiles([file], [side]);
  });
}

// Files dropped anywhere on the page: one fills the next empty side, two fill both.
let dragDepth = 0;
const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');
document.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  el('#drop').hidden = false;
});
document.addEventListener('dragover', (event) => {
  if (hasFiles(event)) event.preventDefault();
});
document.addEventListener('dragleave', (event) => {
  if (!hasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) el('#drop').hidden = true;
});
document.addEventListener('drop', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  el('#drop').hidden = true;
  const files = Array.from(event.dataTransfer?.files ?? []);
  const ownPair = !el<HTMLSelectElement>('#example').value;
  const plan = planDrop(files, {
    before: ownPair && !!inputs.before,
    after: ownPair && !!inputs.after,
  });
  if ('error' in plan) captionText(el('#caption'), 'Those files were not loaded', plan.error);
  else void loadFiles(files, plan.sides);
});

el<HTMLSelectElement>('#example').addEventListener('change', (event) => {
  const id = (event.target as HTMLSelectElement).value;
  if (!Object.hasOwn(EXAMPLES, id)) return;
  history.replaceState(null, '', `?example=${id}`);
  void loadExample(id);
});

function download(text: string, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
let exporting = false;
el<HTMLSelectElement>('#export').addEventListener('change', async (event) => {
  const menu = event.target as HTMLSelectElement;
  const kind = menu.value;
  menu.value = '';
  if (!wb || exporting) return;
  if (kind === 'json')
    download(exportReportJson(wb.report), 'application/json', exportFileName(wb.report, 'json'));
  else if (kind === 'html') {
    const value = wb,
      mine = revision;
    exporting = true;
    menu.disabled = true;
    menu.setAttribute('aria-busy', 'true');
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    try {
      const analyses = (await Promise.all(tabs.map((tab) => tab.facts?.() ?? []))).flat();
      if (mine !== revision || wb !== value) return;
      download(
        exportReportHtml(value.report, {
          generatedAt: new Date(),
          analyses,
          names: {
            before: sceneNames(parse(value.texts[0])),
            after: sceneNames(parse(value.texts[1])),
          },
        }),
        'text/html',
        exportFileName(value.report, 'html'),
      );
    } catch (error) {
      if (mine === revision)
        captionText(
          el('#caption'),
          'The report could not be prepared',
          error instanceof Error ? error.message : 'Try again.',
        );
    } finally {
      exporting = false;
      menu.removeAttribute('aria-busy');
      if (mine === revision) menu.disabled = false;
    }
  }
});

// Arrow keys move along the tabs, as in any tab list.
el('#tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(el('#tabs').children) as HTMLElement[];
  const index = buttons.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].click();
  buttons[next].focus();
});

el('#theme').addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark', true));
// A and B trade places: what was the revision becomes the original, and the reverse.
el('#swap').addEventListener('click', () => {
  if (!inputs.before && !inputs.after) return;
  const { before, after } = inputs;
  delete inputs.before;
  delete inputs.after;
  if (after) inputs.before = after;
  if (before) inputs.after = before;
  // A file still being read was meant for the side it was chosen for, not the swapped one.
  reads.before++;
  reads.after++;
  void compare();
});
// On a phone the panel is a sheet over the bottom of the stage; its handle makes it taller.
el('#grip').addEventListener('click', () => {
  const open = el('#sheet').classList.toggle('open');
  el('#grip').setAttribute('aria-expanded', String(open));
  el('#grip').setAttribute('aria-label', open ? 'Shrink the panel' : 'Expand the panel');
});
// On a phone the less-used actions fold behind one button, so the header stays two rows.
el('#more').addEventListener('click', () => {
  const open = el('#actions').classList.toggle('open');
  el('#more').setAttribute('aria-expanded', String(open));
});

function setVolumeResolution(value: VolumeResolution): void {
  settings.volumeResolution = value;
  saveSettings(settings);
  if (!wb) return;
  wb.volumeResolution = value;
  if (current?.id === 'volume') open(current);
}

const settingsDialog = el<HTMLDialogElement>('#settings-dialog');
const pointTolerance = el<HTMLInputElement>('#point-tolerance');
const volumeResolution = el<HTMLSelectElement>('#volume-resolution');
el('#settings').addEventListener('click', () => {
  pointTolerance.value = String(settings.pointTolerance);
  pointTolerance.setCustomValidity('');
  volumeResolution.value = settings.volumeResolution;
  settingsDialog.showModal();
  pointTolerance.focus();
});
el('#settings-close').addEventListener('click', () => settingsDialog.close());
pointTolerance.addEventListener('input', () => pointTolerance.setCustomValidity(''));
el('#settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = pointTolerance.valueAsNumber;
  if (!Number.isFinite(value) || value < 0) {
    pointTolerance.setCustomValidity('Enter a finite, non-negative distance.');
    pointTolerance.reportValidity();
    return;
  }
  const changed = settings.pointTolerance !== value;
  settings.pointTolerance = value;
  settings.volumeResolution = volumeResolution.value as VolumeResolution;
  saveSettings(settings);
  settingsDialog.close();
  if (changed) void compare(true);
  else setVolumeResolution(settings.volumeResolution);
});

let savedTheme: string | null = null;
try {
  savedTheme = localStorage.getItem(THEME_KEY);
} catch {
  /* Optional storage. */
}
setTheme(initialTheme(savedTheme, matchMedia('(prefers-color-scheme: dark)').matches));
const requested = new URLSearchParams(location.search).get('example') ?? '';
const startWith = Object.hasOwn(EXAMPLES, requested) ? requested : DEFAULT_EXAMPLE;
el<HTMLSelectElement>('#example').value = startWith;
void loadExample(startWith);
