import type { AnalysisPair } from '../viewer/analysisGeometry';
import { SurfaceAnalysis } from './surfaceAnalysis';
import { AnalysisTabs } from './analysisTabs';
import { LinkedSections } from './linkedSections';
import { DEFAULT_TOLERANCE } from '../diff/tolerance';
import { ComparisonClient } from '../diff/workerClient';
import { readInput } from '../x3d/readInput';
import { exportReportJson } from '../report/export-json';
import type { X3DiffReport, ChangeRecord } from '../report/schema';
import type { SolidRegionsResult } from '../viewer/solidRegions';
import { X3DPane } from '../viewer/X3DPane';
import { buildDiffScene, type DiffSceneResult } from '../viewer/diffScene';
import { categoryNames, renderRegister } from './changeRegister';
import { readPreferences, savePreferences } from './preferences';
import './style.css';

const icon = {
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="m13 12-3 3 3 3m-3-3h8"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8V4Z"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5M4 15v5h5m11-5v5h-5M8 8l3 3m5-3-3 3m-5 5 3-3m5 3-3-3"/></svg>',
  focus:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
  split:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M15 9h3m-3 4h3"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4l.5 2.3 1.7.8 2.1-1.1 2.8 2.8-1.1 2.1.8 1.7L23 11v4l-2.3.5-.8 1.7 1.1 2.1-2.8 2.8-2.1-1.1-1.7.8L14 24h-4l-.5-2.3-1.7-.8-2.1 1.1-2.8-2.8 1.1-2.1-.8-1.7L1 15v-4l2.3-.5.8-1.7L3 6.7l2.8-2.8 2.1 1.1 1.7-.8L10 2Z" transform="translate(0 -1) scale(1 .92)"/><circle cx="12" cy="12" r="3"/></svg>',
};
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
<main class="shell">
  <header class="masthead">
    <div class="brand"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 11 20 3 34 11 34 29 20 37 6 29Z"/><path d="m6 11 14 8 14-8M20 19v18M13 7l14 8v9l-7 4-7-4v-9l14-8"/></svg><span>X3<span class="brand-light">Diff</span></span></div>
    <div class="header-tools"><a class="button quiet" href="./" aria-label="About X3Diff">About</a><div class="demo-picker"><button id="demo-trigger" class="button quiet" aria-haspopup="menu" aria-controls="demo-menu" aria-expanded="false">Examples <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button><div id="demo-menu" role="menu" hidden><button role="menuitem" data-demo="brickhaven">Brickhaven <small>Animated town</small></button><button role="menuitem" data-demo="forgeworks">Forgeworks <small>Vehicle assembly</small></button><button role="menuitem" data-demo="fitlab">Fit Lab <small>Volume comparison</small></button><button role="menuitem" data-demo="example">Objects <small>Simple revisions</small></button><button role="menuitem" data-demo="dolphin">Dolphin <small>Mesh deformation</small></button></div></div><button id="theme" class="button quiet" aria-label="Dark mode" aria-pressed="false">Dark mode</button></div>
  </header>
  <div id="global-status" class="status" role="status"></div>
  <section class="review-workspace" aria-label="Revision review">
    <section class="scene-panel" aria-label="3D comparison">
      <div class="viewer-toolbar">
        <div class="revision-tabs" role="group" aria-label="Revision view"><span class="revision-slot"><button data-view="before" aria-pressed="false">Before</button><button id="load-before" class="revision-load" type="button" data-state="missing" aria-label="Load before model" title="Load before model">${icon.file}</button><input id="before-file" type="file" accept=".x3d,.xml,application/xml,text/xml" hidden/></span><button data-view="diff" aria-pressed="true" hidden>Differences</button><span class="revision-slot"><button data-view="after" aria-pressed="false">After</button><button id="load-after" class="revision-load" type="button" data-state="missing" aria-label="Load after model" title="Load after model">${icon.file}</button><input id="after-file" type="file" accept=".x3d,.xml,application/xml,text/xml" hidden/></span></div>
        <div class="scene-actions"><button id="compare" class="viewer-action" hidden>Cancel</button>
          <button id="fit" class="viewer-action" title="Fit scene to view" aria-label="Fit scene to view">${icon.fit}<span>Fit</span></button>
          <button id="motion" class="viewer-action" hidden>${icon.pause}<span>Pause</span></button><button id="expand" class="viewer-action" aria-pressed="false" title="Focus on the scene" aria-label="Focus on the scene" hidden>${icon.focus}<span>Focus</span></button>
          <div class="settings-anchor"><button id="settings-trigger" class="viewer-action" title="Scene settings" aria-label="Scene settings" aria-expanded="false" aria-controls="settings-panel" aria-haspopup="dialog">${icon.settings}<span>Settings</span></button><section id="settings-panel" role="dialog" aria-label="Scene settings" hidden><div class="settings-head"><strong>Settings</strong><button id="settings-close" type="button" aria-label="Close settings">×</button></div><label for="tolerance">Point tolerance</label><div class="settings-input"><input id="tolerance" type="number" min="0" step="0.000001" value="0.00001"/><button id="apply-settings" class="button primary" disabled>Apply</button></div><p>Sets the threshold for moved coordinates.</p><label for="volume-resolution">Volume resolution</label><select id="volume-resolution" aria-describedby="volume-resolution-help"><option value="low">Low · faster</option><option value="medium">Medium</option><option value="high">High · smoother</option></select><p id="volume-resolution-help">Applies to Volume differences: curved-primitive detail and mesh sampling grid. High halves the mesh cell size versus Medium. Finer grids take longer; the main overlay keeps the original mesh.</p></section></div>
        </div>
      </div>
      <div class="viewers"><div id="viewer-before" hidden></div><div id="viewer-diff"></div><div id="viewer-after" hidden></div></div>
      <div class="scene-footer"><div id="legend" class="legend" aria-label="Scene legend"></div><span class="navigation-hint">Drag to rotate · Scroll to zoom</span></div>
      <p id="scene-note" class="scene-note"></p>
    </section>
    <aside class="analysis-panel" aria-label="Analysis" hidden>
      <div id="analysis-heading"></div>
      <section class="report-panel" aria-label="Change register" hidden>
      <div class="register-heading"><div><h2>File differences <span id="change-count">—</span></h2></div><label class="category-control"><span class="sr-only">Category</span><select id="category" disabled><option value="all">All categories</option></select></label><span id="report-status" class="report-status"></span><button id="export" class="button quiet" disabled>Export ↗</button></div>
      <div id="summary" class="summary-metrics"></div>
      <div id="changes" class="register-content"><div class="empty-state"><p>Choose two files or load an example.</p></div></div>
      <div id="selection" class="selection-note" aria-live="polite"></div>
      </section>
      <section id="linked-sections" hidden aria-label="Slice & measure"></section>
      <section id="surface-deviation" hidden></section>
      <section id="volume-overlap" hidden><div class="volume-controls"><div id="region" class="segmented-control" role="group" aria-label="Volume regions"><button data-region="before">Before only</button><button data-region="shared">Shared</button><button data-region="after">After only</button></div><button id="volume-fit" class="button quiet">Fit</button></div><p id="volume-status" role="status"></p><div id="volume-viewer"></div></section>
    </aside>
  </section>
  <section class="comparison-notes"><div id="diagnostics" aria-live="polite"></div></section>

</main>`;
const el = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const linkedSections = new LinkedSections(el('#linked-sections'), selectAnalysisPair);
const surfaceAnalysis = new SurfaceAnalysis(el('#surface-deviation'), selectAnalysisPair);
const analysisTabs = new AnalysisTabs(el('.analysis-panel'), el('#analysis-heading'));
analysisTabs.register({
  id: 'differences',
  label: 'File differences',
  description: 'Inspect semantic changes and before/after values.',
  panel: el('.report-panel'),
  required: true,
  available: () => !!report?.changes.length,
});
analysisTabs.register({
  id: 'sections',
  label: 'Slice & measure',
  description: 'Explore supported shape changes in a shared 3D/2D slice.',
  panel: el('#linked-sections'),
  available: () => linkedSections.hasData,
  activate: () => linkedSections.activate(),
});
analysisTabs.register({
  id: 'volume',
  label: 'Volume differences',
  description: 'Inspect before-only, shared, and after-only volume for one matched pair.',
  panel: el('#volume-overlap'),
  available: () => linkedSections.hasData,
  activate: () => showVolume(),
});
analysisTabs.register({
  id: 'deviation',
  label: 'Surface deviation',
  description: 'Sampled nearest-surface distance heatmap and statistics.',
  panel: el('#surface-deviation'),
  available: () => surfaceAnalysis.hasData,
  activate: () => surfaceAnalysis.activate(),
});

const beforePane = new X3DPane('Before revision'),
  afterPane = new X3DPane('After revision'),
  diffPane = new X3DPane('Revision comparison');
const volumePane = new X3DPane('Volume differences');
el('#volume-viewer').append(volumePane.element);
el('#volume-fit').addEventListener('click', () => volumePane.refreshView(true));
el('#viewer-before').append(beforePane.element);
el('#viewer-after').append(afterPane.element);
el('#viewer-diff').append(diffPane.element);
let theme: 'light' | 'dark' = 'dark';
try {
  const saved = localStorage.getItem('x3diff-theme');
  if (saved === 'light' || saved === 'dark') theme = saved;
} catch {}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  el('#theme').textContent = theme === 'dark' ? '☀ Light mode' : '☾ Dark mode';
  el('#theme').setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
  );
  el('#theme').setAttribute('aria-pressed', String(theme === 'dark'));
  for (const pane of [beforePane, afterPane, diffPane, volumePane]) pane.setTheme(theme);
}
el('#theme').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  try {
    localStorage.setItem('x3diff-theme', theme);
  } catch {}
});
applyTheme();

type Input = { name: string; text: string };
let before: Input | undefined, after: Input | undefined, report: X3DiffReport | undefined;
let visual: DiffSceneResult | undefined, solid: SolidRegionsResult | undefined;
let revision = 0,
  view: 'before' | 'after' | 'diff' = 'diff',
  volumeRevision = 0;
const preferences = readPreferences();
const volumeResolution = el<HTMLSelectElement>('#volume-resolution');
volumeResolution.value = preferences.volumeResolution ?? 'medium';
volumeResolution.addEventListener('change', () => {
  preferences.volumeResolution = volumeResolution.value as 'low' | 'medium' | 'high';
  savePreferences(preferences);
  solid = undefined;
  if (!el('#volume-overlap').hidden) void showVolume();
});
let region = ['before', 'shared', 'after'].includes(preferences.region ?? '')
  ? preferences.region!
  : 'shared';
const comparisons = new ComparisonClient();
let comparing = false;
let tolerance = { ...DEFAULT_TOLERANCE };
let showcase = false,
  motion = true;
const fileRevisions = { before: 0, after: 0 };
let demoRevision = 0;
const status = (text: string, error = false) => {
  el('#global-status').textContent = text;
  el('#global-status').classList.toggle('error', error);
};
function updateReady() {
  el<HTMLButtonElement>('#apply-settings').disabled = !(before && after);
  for (const side of ['before', 'after'] as const) {
    const input = side === 'before' ? before : after;
    const button = el<HTMLButtonElement>(`#load-${side}`);
    button.dataset.state = input ? 'loaded' : 'missing';
    button.title = input ? `Replace ${side} model · ${input.name}` : `Load ${side} model`;
    button.setAttribute(
      'aria-label',
      input ? `Replace ${side} model: ${input.name}` : `Load ${side} model (missing)`,
    );
    el<HTMLButtonElement>(`[data-view="${side}"]`).disabled = !input;
  }
}
const settingsTrigger = el<HTMLButtonElement>('#settings-trigger'),
  settingsPanel = el<HTMLElement>('#settings-panel');
function closeSettings() {
  settingsPanel.hidden = true;
  settingsTrigger.setAttribute('aria-expanded', 'false');
}
settingsTrigger.addEventListener('click', () => {
  const opening = settingsPanel.hidden;
  settingsPanel.hidden = !opening;
  settingsTrigger.setAttribute('aria-expanded', String(opening));
  if (opening) el<HTMLInputElement>('#tolerance').focus();
});
el('#settings-close').addEventListener('click', () => {
  closeSettings();
  settingsTrigger.focus();
});
settingsPanel.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSettings();
    settingsTrigger.focus();
  }
});
settingsPanel.addEventListener('focusout', (event) => {
  if (event.relatedTarget && !el('.settings-anchor').contains(event.relatedTarget as Node))
    closeSettings();
});
document.addEventListener('pointerdown', (event) => {
  if (!el('.settings-anchor').contains(event.target as Node)) closeSettings();
});
function showResult(hasDifferences: boolean) {
  el('.review-workspace').hidden = false;
  el('.review-workspace').classList.toggle('no-diff', !hasDifferences);
  if (hasDifferences) analysisTabs.refresh();
  else analysisTabs.clear();
  el<HTMLButtonElement>('button[data-view="diff"]').hidden = !hasDifferences;

  el('#expand').hidden = !hasDifferences;
  if (!hasDifferences) {
    el('.review-workspace').classList.remove('expanded');
    updateLayoutButton(false);
  }
}
function updateLegend() {
  const entries = [
    ['removed', 'Removed'],
    ['added', 'Added'],
    ['before', 'Changed · before'],
    ['after', 'Changed · after'],
    ['context', 'Unchanged'],
  ];
  el('#legend').replaceChildren();
  if (view !== 'diff') return;
  for (const [kind, label] of entries) {
    const item = document.createElement('span');
    item.className = `key-${kind}`;
    item.textContent = label;
    el('#legend').append(item);
  }
}
function activePane() {
  return view === 'diff' ? diffPane : view === 'before' ? beforePane : afterPane;
}
let selectedAnalysisPair: AnalysisPair | undefined;
function clearSelection() {
  selectedAnalysisPair = undefined;
  for (const pane of [beforePane, afterPane, diffPane]) pane.clearCue();
  for (const row of Array.from(
    root.querySelectorAll(
      '.change-row.selected, .group-heading.selected, .group-heading.contains-selection',
    ),
  ))
    row.classList.remove('selected', 'contains-selection');
  for (const button of Array.from(
    root.querySelectorAll<HTMLButtonElement>('.object-link[aria-pressed=true]'),
  ))
    button.setAttribute('aria-pressed', 'false');
  el('#selection').textContent = '';
}
function setView(next: typeof view) {
  const pair = selectedAnalysisPair;
  if (next !== view) clearSelection();
  view = next;
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-view]')))
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  for (const side of ['before', 'diff', 'after']) el(`#viewer-${side}`).hidden = side !== view;
  updateAnalysisControls();
  updateLegend();
  requestAnimationFrame(() => activePane().refreshView());
  el('#motion').hidden = !showcase || view === 'diff';
  el('#scene-note').textContent = '';
  if (pair) selectAnalysisPair(pair);
}
for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-view]')))
  button.addEventListener('click', () => setView(button.dataset.view as typeof view));
el('#fit').addEventListener('click', () => activePane().refreshView(true));
function updateMotionButton() {
  el('#motion').setAttribute('aria-label', motion ? 'Pause animation' : 'Play animation');
  el('#motion').title = motion ? 'Pause animation' : 'Play animation';
  el('#motion').innerHTML =
    `${motion ? icon.pause : icon.play}<span>${motion ? 'Pause' : 'Play'}</span>`;
}
function updateLayoutButton(expanded: boolean) {
  el('#expand').innerHTML =
    `${expanded ? icon.split : icon.focus}<span>${expanded ? 'Split view' : 'Focus'}</span>`;
  el('#expand').setAttribute(
    'aria-label',
    expanded ? 'Return to split view' : 'Focus on the scene',
  );
  el('#expand').title = expanded ? 'Return to split view' : 'Focus on the scene';
  el('#expand').setAttribute('aria-pressed', String(expanded));
}
el('#motion').addEventListener('click', () => {
  motion = !motion;
  beforePane.setAnimationEnabled(motion);
  afterPane.setAnimationEnabled(motion);
  updateMotionButton();
});
el('#expand').addEventListener('click', () => {
  const expanded = el('.review-workspace').classList.toggle('expanded');
  preferences.expanded = expanded;
  savePreferences(preferences);
  updateLayoutButton(expanded);
  requestAnimationFrame(() => activePane().refreshView());
});
function updateAnalysisControls() {
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-region]')))
    button.setAttribute('aria-pressed', String(button.dataset.region === region));
}
for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-region]')))
  button.addEventListener('click', () => {
    region = button.dataset.region as typeof region;
    preferences.region = region;
    savePreferences(preferences);
    updateAnalysisControls();
    volumePane.setRegions(region);
  });
async function showVolume() {
  if (!(before && after && report && visual)) return;
  const current = revision,
    request = ++volumeRevision;
  el('#volume-status').textContent = 'Preparing volume overlap…';
  updateAnalysisControls();
  try {
    if (!solid) {
      const { buildSolidRegions } = await import('../viewer/solidRegions');
      if (current !== revision || request !== volumeRevision) return;
      solid =
        buildSolidRegions(before.text, after.text, report, preferences.volumeResolution) ??
        undefined;
    }
    if (!solid)
      throw new Error('No supported matched geometry pair is available for volume comparison.');
    const pair = linkedSections
      .getPairs()
      .find(
        (item) =>
          item.before.path === solid!.pairPaths.before &&
          item.after.path === solid!.pairPaths.after,
      );
    if (pair && !el('#volume-overlap').hidden) selectAnalysisPair(pair);
    const doc = new DOMParser().parseFromString(solid.xml, 'application/xml');
    const scene = doc.getElementsByTagName('Scene')[0];
    const volume = doc.querySelector('[DEF="X3DIFF_VOLUME_PAIR"]')!;
    scene.replaceChildren(volume);
    for (const context of Array.from(scene.querySelectorAll('[DEF$="CONTEXT_VISIBILITY"]')))
      context.remove();
    await volumePane.load(new XMLSerializer().serializeToString(doc));
    if (current !== revision || request !== volumeRevision) return;
    volumePane.setRegions(region);
    volumePane.refreshView(true);
    el('#volume-status').textContent = solid.label;
  } catch (error) {
    if (current !== revision || request !== volumeRevision) return;
    volumePane.clear();
    el('#volume-status').textContent =
      error instanceof Error ? error.message : 'Volume differences is unavailable.';
  }
}
function invalidate() {
  selectedAnalysisPair = undefined;
  analysisTabs.clear();
  linkedSections.clear();
  surfaceAnalysis.clear();
  comparisons.cancel();
  comparing = false;
  el('#compare').hidden = true;
  el('.review-workspace').setAttribute('aria-busy', 'false');
  revision++;
  volumeRevision++;
  report = undefined;
  visual = undefined;
  solid = undefined;

  closeSettings();
  el('.review-workspace').hidden = false;
  el('.review-workspace').classList.add('no-diff');
  el('.report-panel').hidden = true;
  el<HTMLButtonElement>('button[data-view="diff"]').hidden = true;

  el('#expand').hidden = true;
  updateAnalysisControls();
  el<HTMLSelectElement>('#category').disabled = true;
  el<HTMLSelectElement>('#category').innerHTML = '<option value="all">All categories</option>';
  el<HTMLButtonElement>('#export').disabled = true;
  el('#change-count').textContent = '—';
  el('#report-status').textContent = '';
  el('#report-status').removeAttribute('data-status');
  el('#changes').innerHTML = '<p class="empty-state">Ready to compare.</p>';
  el('#summary').replaceChildren();
  el('#diagnostics').replaceChildren();
  el('#selection').textContent = '';
  el('#scene-note').textContent = '';
  beforePane.clear();
  afterPane.clear();
  diffPane.clear();
  volumePane.clear();
  setView('diff');
}
async function readFile(file: File, side: 'before' | 'after') {
  showcase = false;
  demoRevision++;
  const ticket = ++fileRevisions[side];
  invalidate();
  if (side === 'before') before = undefined;
  else after = undefined;
  updateReady();
  status(`Reading ${side} revision…`);
  try {
    const input = { name: file.name, text: await readInput(file) };
    if (ticket !== fileRevisions[side]) return;
    if (side === 'before') before = input;
    else after = input;
    updateReady();
    if (before && after) await runCompare({ view: 'diff' });
    else {
      status(`Load the ${side === 'before' ? 'after' : 'before'} model to compare.`);
      setView(side);
      void (side === 'before' ? beforePane : afterPane).load(input.text);
    }
  } catch (error) {
    if (ticket === fileRevisions[side])
      status(error instanceof Error ? error.message : 'File could not be read.', true);
  }
}
for (const side of ['before', 'after'] as const)
  el<HTMLInputElement>(`#${side}-file`).addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (file) void readFile(file, side);
  });
function selectAnalysisPair(pair: AnalysisPair) {
  clearSelection();
  selectedAnalysisPair = pair;
  linkedSections.selectPair(pair);
  surfaceAnalysis.selectPair(pair);
  const target = view === 'before' ? pair.before : pair.after;
  const ok =
    view === 'diff'
      ? diffPane.cueMany([
          { defName: 'B_' + pair.before.shape.getAttribute('DEF') },
          { defName: 'A_' + pair.after.shape.getAttribute('DEF') },
        ])
      : activePane().cue(target.def, target.path);
  el('#selection').textContent =
    `${pair.label} · ${ok ? 'Highlighted in scene' : 'No visible object in this view'}`;
}
function selectChange(change: ChangeRecord, group?: ChangeRecord[], label?: string) {
  selectedAnalysisPair = undefined;
  for (const pane of [beforePane, afterPane, diffPane]) pane.clearCue();
  const changes = group ?? [change];
  linkedSections.select(changes);
  surfaceAnalysis.select(changes);
  const mapping = visual?.cueByChangeId;
  const ok =
    view === 'diff'
      ? diffPane.cue(
          changes
            .filter((item) => item.afterNode)
            .map((item) => mapping?.[item.id])
            .find(Boolean) ?? changes.map((item) => mapping?.[item.id]).find(Boolean),
        )
      : view === 'before'
        ? beforePane.cueMany(
            changes.map((item) => ({
              defName: item.beforeNode?.defName,
              path: item.beforeNode?.path,
            })),
          )
        : afterPane.cueMany(
            changes.map((item) => ({
              defName: item.afterNode?.defName,
              path: item.afterNode?.path,
            })),
          );
  const node = change.afterNode ?? change.beforeNode;
  el('#selection').textContent =
    `${label ?? node?.defName ?? node?.nodeType ?? 'Scene'} · ${ok ? 'Highlighted in scene' : 'No visible object in this view'}`;
}
function renderReport(value: X3DiffReport) {
  report = value;
  el('#change-count').textContent = String(value.changes.length);
  el('#report-status').textContent = {
    complete: '',
    completeWithWarnings: 'With notes',
    incomplete: 'Incomplete',
    failed: 'Failed',
  }[value.summary.status];
  el('#report-status').dataset.status = value.summary.status;
  const counts = new Map<string, number>();
  for (const c of value.changes) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  const summary = el('#summary');
  summary.replaceChildren();
  for (const [label, count] of [
    [
      'Geometry',
      value.changes.filter((c) => c.category === 'geometry' || c.category === 'transform').length,
    ],
    [
      'Appearance',
      value.changes.filter((c) => c.category === 'material' || c.category === 'appearance').length,
    ],
    ['Structure', value.changes.filter((c) => c.category === 'structure').length],
  ] as const) {
    const metric = document.createElement('div');
    const n = document.createElement('strong'),
      text = document.createElement('span');
    n.textContent = String(count);
    text.textContent = label;
    metric.append(n, text);
    summary.append(metric);
  }
  const category = el<HTMLSelectElement>('#category');
  category.innerHTML = '<option value="all">All categories</option>';
  category.disabled = false;
  for (const [name, count] of counts) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${categoryNames[name] ?? name} (${count})`;
    category.append(option);
  }
  renderRegister(el('#changes'), value, 'all', selectChange);
  const notes = el('#diagnostics');
  notes.replaceChildren();
  const unique = new Map<string, number>();
  for (const d of value.diagnostics) {
    const message = `${d.side ? `${d.side}: ` : ''}${d.message}`;
    unique.set(message, (unique.get(message) ?? 0) + 1);
  }
  for (const [message, count] of unique) {
    const p = document.createElement('p');
    p.className = 'diagnostic';
    p.textContent = `${message}${count > 1 ? ` (${count} declarations)` : ''}`;
    notes.append(p);
  }
  el<HTMLButtonElement>('#export').disabled = false;
}
el<HTMLSelectElement>('#category').addEventListener('change', () => {
  if (report) {
    clearSelection();
    renderRegister(el('#changes'), report, el<HTMLSelectElement>('#category').value, selectChange);
  }
});
async function runCompare(defaults: { expanded?: boolean; view?: typeof view } = {}) {
  if (!(before && after)) return;
  const a = before,
    b = after;

  const desiredExpanded =
    preferences.expanded ??
    defaults.expanded ??
    el('.review-workspace').classList.contains('expanded');
  const desiredView = defaults.view ?? view;
  invalidate();
  const current = revision;
  comparing = true;
  el('#compare').hidden = false;
  el('.review-workspace').setAttribute('aria-busy', 'true');
  status('Comparing…');
  try {
    const result = await comparisons.compare({
      before: a.text,
      after: b.text,
      config: tolerance,
      names: { before: a.name, after: b.name },
    });
    if (current !== revision) return;
    renderReport(result);
    if (!['complete', 'completeWithWarnings'].includes(result.summary.status)) {
      const reason =
        result.diagnostics.find((d) => d.severity === 'error')?.message ??
        result.diagnostics.find((d) => d.code.startsWith('UNSUPPORTED'))?.message ??
        'Some node identities could not be matched confidently.';
      status(
        (result.summary.status === 'failed' ? 'Comparison failed: ' : 'Comparison incomplete: ') +
          reason,
        true,
      );
      return;
    }
    if (!result.changes.length) {
      void beforePane.load(a.text).then(() => {
        if (current === revision && view === 'before' && selectedAnalysisPair)
          selectAnalysisPair(selectedAnalysisPair);
      });
      await afterPane.load(b.text);
      if (current !== revision) return;
      showResult(false);
      setView('after');
      status('No differences found.');
      return;
    }
    linkedSections.load(a.text, b.text, result);
    surfaceAnalysis.load(linkedSections.getPairs());
    visual = buildDiffScene(a.text, b.text, result);
    void beforePane.load(a.text).then(() => {
      if (current === revision && view === 'before' && selectedAnalysisPair)
        selectAnalysisPair(selectedAnalysisPair);
    });
    void afterPane.load(b.text).then(() => {
      if (current === revision && view === 'after' && selectedAnalysisPair)
        selectAnalysisPair(selectedAnalysisPair);
    });
    await diffPane.load(visual.xml);
    if (current !== revision) return;
    showResult(true);
    updateAnalysisControls();
    el('#scene-note').textContent = '';
    el('.review-workspace').classList.toggle('expanded', desiredExpanded);
    updateLayoutButton(desiredExpanded);
    setView(desiredView);

    if (current !== revision) return;
    status('');
  } catch (error) {
    if (current === revision)
      status(error instanceof Error ? error.message : 'Comparison failed.', true);
  } finally {
    if (current === revision) {
      comparing = false;
      el('#compare').hidden = true;
      el('.review-workspace').setAttribute('aria-busy', 'false');
    }
  }
}
el('#compare').addEventListener('click', () => {
  if (comparing) {
    invalidate();
    status('Comparison cancelled.');
  }
});
el('#apply-settings').addEventListener('click', () => {
  const v = Number(el<HTMLInputElement>('#tolerance').value);
  if (!Number.isFinite(v) || v < 0) {
    status('Enter a non-negative coordinate threshold.', true);
    return;
  }
  tolerance = { ...tolerance, vectorAbs: v };
  closeSettings();
  void runCompare();
});
el('#export').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(
    new Blob([exportReportJson(report)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'x3diff-report.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
});
const demoTrigger = el<HTMLButtonElement>('#demo-trigger'),
  demoMenu = el<HTMLElement>('#demo-menu');
function closeDemoMenu() {
  demoMenu.hidden = true;
  demoTrigger.setAttribute('aria-expanded', 'false');
}
demoTrigger.addEventListener('click', () => {
  const opening = demoMenu.hidden;
  demoMenu.hidden = !opening;
  demoTrigger.setAttribute('aria-expanded', String(opening));
  if (opening) demoMenu.querySelector<HTMLButtonElement>('button')?.focus();
});
document.addEventListener('pointerdown', (event) => {
  if (!el('.demo-picker').contains(event.target as Node)) closeDemoMenu();
});
demoMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDemoMenu();
    demoTrigger.focus();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const options = Array.from(demoMenu.querySelectorAll<HTMLButtonElement>('button'));
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[next]?.focus();
});
el('.demo-picker').addEventListener('focusout', (event) => {
  if (event.relatedTarget && !el('.demo-picker').contains(event.relatedTarget as Node))
    closeDemoMenu();
});
async function loadDemo(demo: string) {
  if (!demo) return;
  closeDemoMenu();
  const ticket = ++demoRevision;
  fileRevisions.before++;
  fileRevisions.after++;
  invalidate();
  before = undefined;
  after = undefined;
  updateReady();
  status('Loading…');
  try {
    let a: string, b: string;
    if (['brickhaven', 'forgeworks', 'fitlab'].includes(demo)) {
      const responses = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}examples/${demo}/before.x3d`),
        fetch(`${import.meta.env.BASE_URL}examples/${demo}/after.x3d`),
      ]);
      if (responses.some((r) => !r.ok)) throw new Error('Showcase files are unavailable.');
      [a, b] = await Promise.all(responses.map((r) => r.text()));
    } else if (demo === 'dolphin') {
      const files = await Promise.all([
        import('../../fixtures/dolphin/before.x3d?raw'),
        import('../../fixtures/dolphin/after.x3d?raw'),
      ]);
      [a, b] = files.map((f) => f.default);
    } else {
      const responses = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}examples/HelloWorld.x3d`),
        fetch(`${import.meta.env.BASE_URL}examples/HelloWorld-edited.x3d`),
      ]);
      if (responses.some((r) => !r.ok)) throw new Error('Example files are unavailable.');
      [a, b] = await Promise.all(responses.map((r) => r.text()));
    }
    if (ticket !== demoRevision) return;
    showcase = ['brickhaven', 'forgeworks', 'fitlab'].includes(demo);
    const demoName =
      demo === 'forgeworks' ? 'Forgeworks' : demo === 'fitlab' ? 'Fit Lab' : 'Brickhaven';
    before = {
      name: showcase
        ? `${demoName} · original`
        : demo === 'dolphin'
          ? 'Dolphin · neutral pose'
          : 'Objects · original',
      text: a,
    };
    after = {
      name: showcase
        ? `${demoName} · revised`
        : demo === 'dolphin'
          ? 'Dolphin · curved pose'
          : 'Objects · revised',
      text: b,
    };
    updateReady();
    motion = true;
    beforePane.setAnimationEnabled(true);
    afterPane.setAnimationEnabled(true);
    updateMotionButton();
    await runCompare({
      expanded: showcase,
      view: demo === 'fitlab' ? 'diff' : showcase ? 'after' : 'diff',
    });
  } catch (error) {
    if (ticket === demoRevision)
      status(error instanceof Error ? error.message : 'Example could not be loaded.', true);
  }
}
for (const button of Array.from(demoMenu.querySelectorAll<HTMLButtonElement>('button[data-demo]')))
  button.addEventListener('click', () => void loadDemo(button.dataset.demo!));
updateLegend();

for (const side of ['before', 'after'] as const)
  el(`#load-${side}`).addEventListener('click', () =>
    el<HTMLInputElement>(`#${side}-file`).click(),
  );
invalidate();
updateReady();
status('Load Before and After using their icons, or choose an example.');

const initialExample = new URLSearchParams(location.search).get('example');
if (
  initialExample &&
  ['example', 'dolphin', 'fitlab', 'brickhaven', 'forgeworks'].includes(initialExample)
)
  void loadDemo(initialExample);

