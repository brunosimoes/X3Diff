import type { AnalysisPair } from '../viewer/analysisGeometry';
import { SurfaceAnalysis } from './surfaceAnalysis';
import { MotionAnalysis } from './motionAnalysis';
import { AnalysisTabs } from './analysisTabs';
import { LinkedSections } from './linkedSections';
import { DEFAULT_TOLERANCE } from '../diff/tolerance';
import { LIGHTS } from '../x3d/lights';
import { ComparisonClient } from '../diff/workerClient';
import { readInput } from '../x3d/readInput';
import { exportReportJson } from '../report/export-json';
import {
  coverageLines,
  describeCoverage,
  describeDiagnostic,
  type Coverage,
} from '../report/coverage';
import { exportReportHtml } from '../report/export-html';
import { exportFileName } from '../report/fileNames';
import { VOLUME_LIMITS, VOLUME_SHORT, limitsMarkup } from '../report/limits';
import { gatherAnalysisFacts } from './analysisFacts';
import type { X3DiffReport, ChangeRecord } from '../report/schema';
import type { SolidRegionsResult } from '../viewer/solidRegions';
import { X3DPane } from '../viewer/X3DPane';
import { buildDiffScene, type DiffSceneResult } from '../viewer/diffScene';
import { categoryLabel, renderRegister } from './changeRegister';
import { summarizeChanges, type SceneNameSources } from '../report/presentation';
import { sceneNames } from '../report/sceneNames';
import { prescan } from '../x3d/prescan';
import { initialTheme, readPreferences, savePreferences } from './preferences';
import { updateObjectChoice } from './objectChoice';
import { renderVolumeSummary, volumeMethod } from './volumeSummary';
import { affectsShape } from '../viewer/shapeGeometry';
import { planDrop, type Side } from './dropFiles';
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
/** One row per bundled example: menu entry, files and input names. */
interface Demo {
  label: string;
  hint: string;
  names: [string, string];
  load: () => Promise<string[]>;
  /** Animated showcase: the Before and After views get a play/pause control. */
  showcase?: boolean;
}
const examplePair = (before: string, after: string) => async () => {
  const responses = await Promise.all(
    [before, after].map((file) => fetch(`${import.meta.env.BASE_URL}examples/${file}`)),
  );
  if (responses.some((r) => !r.ok)) throw new Error('Example files are unavailable.');
  return Promise.all(responses.map((r) => r.text()));
};
const showcaseDemo = (id: string, label: string, hint: string): Demo => ({
  label,
  hint,
  names: [`${label} · original`, `${label} · revised`],
  load: examplePair(`${id}/before.x3d`, `${id}/after.x3d`),
  showcase: true,
});
const demos: Record<string, Demo> = {
  brickhaven: showcaseDemo('brickhaven', 'Brickhaven', 'Animated town'),
  forgeworks: showcaseDemo('forgeworks', 'Forgeworks', 'Vehicle assembly'),
  fitlab: showcaseDemo('fitlab', 'Fit Lab', 'Volume comparison'),
  example: {
    label: 'Objects',
    hint: 'Simple revisions',
    names: ['Objects · original', 'Objects · revised'],
    load: examplePair('HelloWorld.x3d', 'HelloWorld-edited.x3d'),
  },
  dolphin: {
    label: 'Dolphin',
    hint: 'Mesh deformation',
    names: ['Dolphin · neutral pose', 'Dolphin · curved pose'],
    load: async () =>
      (
        await Promise.all([
          import('../../fixtures/dolphin/before.x3d?raw'),
          import('../../fixtures/dolphin/after.x3d?raw'),
        ])
      ).map((file) => file.default),
  },
};
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
<main class="shell">
  <header class="masthead">
    <div class="brand"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 11 20 3 34 11 34 29 20 37 6 29Z"/><path d="m6 11 14 8 14-8M20 19v18M13 7l14 8v9l-7 4-7-4v-9l14-8"/></svg><span>X3<span class="brand-light">Diff</span></span></div>
    <div class="header-tools"><a class="button quiet" href="./" aria-label="About X3Diff">About</a><div class="demo-picker"><button id="demo-trigger" class="button quiet" aria-haspopup="menu" aria-controls="demo-menu" aria-expanded="false">Examples <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button><div id="demo-menu" role="menu" hidden>${Object.entries(
      demos,
    )
      .map(
        ([id, demo]) =>
          `<button role="menuitem" data-demo="${id}">${demo.label} <small>${demo.hint}</small></button>`,
      )
      .join(
        '',
      )}</div></div><button id="theme" class="button quiet" aria-label="Dark mode" aria-pressed="false">Dark mode</button></div>
  </header>
  <div id="global-status" class="status" role="status"></div>
  <section class="review-workspace" aria-label="Revision review">
    <section class="scene-panel" aria-label="3D comparison">
      <div class="viewer-toolbar">
        <div class="revision-tabs" role="group" aria-label="Revision view"><span class="revision-slot"><button data-view="before" aria-pressed="false">Before</button><button id="load-before" class="revision-load" type="button" data-state="missing" aria-label="Load before model" title="Load before model">${icon.file}</button><input id="before-file" type="file" accept=".x3d,.xml,application/xml,text/xml" hidden/></span><button data-view="diff" aria-pressed="true" hidden>Differences</button><span class="revision-slot"><button data-view="after" aria-pressed="false">After</button><button id="load-after" class="revision-load" type="button" data-state="missing" aria-label="Load after model" title="Load after model">${icon.file}</button><input id="after-file" type="file" accept=".x3d,.xml,application/xml,text/xml" hidden/></span></div>
        <div class="scene-actions"><button id="compare" class="viewer-action" hidden>Cancel</button>
          <button id="fit" class="viewer-action" title="Fit scene to view" aria-label="Fit scene to view">${icon.fit}<span>Fit</span></button>
          <button id="motion" class="viewer-action" hidden>${icon.pause}<span>Pause</span></button><button id="expand" class="viewer-action" aria-pressed="false" title="Focus on the scene" aria-label="Focus on the scene" hidden>${icon.focus}<span>Focus</span></button>
          <div class="settings-anchor"><button id="settings-trigger" class="viewer-action" title="Scene settings" aria-label="Scene settings" aria-expanded="false" aria-controls="settings-panel" aria-haspopup="dialog">${icon.settings}<span>Settings</span></button><section id="settings-panel" role="dialog" aria-label="Scene settings" hidden><div class="settings-head"><strong>Settings</strong><button id="settings-close" type="button" aria-label="Close settings">×</button></div><label for="tolerance">Point tolerance</label><div class="settings-input"><input id="tolerance" type="number" min="0" step="any" value="${DEFAULT_TOLERANCE.vectorAbs}"/><button id="apply-settings" class="button primary">Apply</button></div><p>Sets the threshold for moved coordinates.</p><label for="volume-resolution">Volume resolution</label><select id="volume-resolution" aria-describedby="volume-resolution-help"><option value="low">Low · faster</option><option value="medium">Medium</option><option value="high">High · smoother</option></select><p id="volume-resolution-help">Applies to Volume differences: curved-primitive detail and mesh sampling grid. High halves the mesh cell size versus Medium. Finer grids take longer; the main overlay keeps the original mesh.</p></section></div>
        </div>
      </div>
      <div class="viewers"><div id="stage-empty" class="stage-empty"><div><h2>Compare two X3D revisions</h2><p>Choose the original and the revised <code>.x3d</code> file, or drag them onto this area. Both are read in your browser; nothing is uploaded.</p><div class="stage-actions"><button type="button" class="stage-cta" data-load="before">Choose Before file…</button><button type="button" class="stage-cta" data-load="after">Choose After file…</button></div><p>No files to hand? <button type="button" class="stage-link" data-example="example">Open a small example</button></p></div></div><div id="stage-next" class="stage-next" hidden><p></p><button type="button" class="stage-cta" data-load="after">Choose After file…</button></div><div id="stage-busy" class="stage-busy" aria-hidden="true" hidden><i></i><span></span></div><div id="stage-drop" class="stage-drop" aria-hidden="true" hidden><div><strong>Drop .x3d files here</strong><span id="stage-drop-hint"></span></div></div><div id="viewer-before" hidden></div><div id="viewer-diff"></div><div id="viewer-after" hidden></div></div>
      <div class="scene-footer"><div id="legend" class="legend" aria-label="Scene legend"></div><span class="navigation-hint">Drag to rotate · Scroll to zoom</span></div>
      <p id="scene-note" class="scene-note"></p>
    </section>
    <aside class="analysis-panel" aria-label="Analysis" hidden>
      <section id="incomplete-banner" class="incomplete-banner" role="note" aria-label="Incomplete comparison" hidden><strong>Incomplete comparison: some content was not compared</strong><p>The differences shown are real, but the parts listed here were skipped and may hide more. This is not a full check.</p><details open><summary>What was not compared</summary><ul id="incomplete-list"></ul></details></section>
      <div id="analysis-heading"></div>
      <section class="report-panel" aria-label="Change register" hidden>
      <div class="register-heading"><div><h2>File differences <span id="change-count">—</span></h2></div><label class="category-control"><span class="sr-only">Category</span><select id="category" disabled><option value="all">All categories</option></select></label><div class="export-picker"><button id="export" class="button quiet" type="button" aria-haspopup="menu" aria-controls="export-menu" aria-expanded="false" disabled>Export <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button><div id="export-menu" role="menu" aria-label="Export" hidden><button type="button" role="menuitem" data-export="html">Report (HTML) <small>Readable page to print or attach</small></button><button type="button" role="menuitem" data-export="json">Data (JSON) <small>Every value, for tools</small></button></div></div></div>
      <p class="coverage-line"><span id="report-status" class="report-status"></span><a id="coverage-link" class="coverage-link" href="${import.meta.env.BASE_URL}coverage.html" target="_blank" rel="noopener" title="Opens the list of compared node types in a new tab"></a></p>
      <p id="register-summary" class="register-summary"></p>
      <div id="summary" class="summary-metrics"></div>
      <div id="changes" class="register-content"><div class="empty-state"><p>Choose two files or load an example.</p></div></div>
      <div class="selection-tools"><div id="selection" class="selection-note" aria-live="polite"></div><button id="focus-selection" class="button quiet" disabled>Focus selected</button></div>
      </section>
      <section id="linked-sections" hidden aria-label="Slice & measure"></section>
      <section id="surface-deviation" hidden></section>
      <section id="motion-paths" hidden aria-label="Motion paths"></section>
      <section id="volume-overlap" hidden>
        <div class="volume-object-controls"><label>Object <select id="volume-object" aria-label="Volume object"></select></label><label>Resolution <select id="volume-detail" aria-label="Volume detail"><option value="low">Low · faster</option><option value="medium">Medium</option><option value="high">High · finer</option></select></label></div>
        <div class="volume-controls"><div id="region" class="segmented-control" role="group" aria-label="Volume regions"><button data-region="all">Combined</button><button data-region="before">Before only</button><button data-region="shared">Shared</button><button data-region="after">After only</button></div><button id="volume-fit" class="button quiet">Fit</button></div>
        <p id="volume-status" role="status"></p><p id="volume-selection-notice" role="status" hidden></p>
        <div id="volume-summary" aria-label="Volume measurements" hidden></div>
        <div class="volume-context-control"><label><input id="volume-context" type="checkbox" checked/> Show transparent object context</label><span>Volumes in scene units³</span></div>
        <div class="volume-frame"><div id="volume-viewer"></div><p id="volume-empty" role="status" hidden></p></div>
        ${limitsMarkup(VOLUME_SHORT, VOLUME_LIMITS, '<p id="volume-method"></p>')}
      </section>
    </aside>
  </section>
  <section class="comparison-notes"><div id="diagnostics" aria-live="polite"></div></section>

</main>`;
const el = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const linkedSections = new LinkedSections(el('#linked-sections'), selectAnalysisPair);
const surfaceAnalysis = new SurfaceAnalysis(el('#surface-deviation'), selectAnalysisPair);
const motionAnalysis = new MotionAnalysis(el('#motion-paths'));
const analysisTabs = new AnalysisTabs(el('.analysis-panel'), el('#analysis-heading'));
analysisTabs.register({
  id: 'differences',
  label: 'File differences',
  description: 'Inspect semantic changes and before/after values.',
  panel: el('.report-panel'),
  required: true,
  // An incomplete result still opens the register, so "nothing found" is never
  // shown without the list of what was skipped.
  available: () => !!report && (report.changes.length > 0 || partialResult()),
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
  description: 'Measure changed space and inspect regions for a selected object pair.',
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
analysisTabs.register({
  id: 'motion',
  label: 'Motion paths',
  description: 'See where animated objects travel in each revision and how far apart they are.',
  panel: el('#motion-paths'),
  available: () => motionAnalysis.hasData,
  activate: () => motionAnalysis.activate(),
  deactivate: () => motionAnalysis.deactivate(),
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
// A first visit opens in the theme the landing page showed, so arriving from it is no jolt.
let savedTheme: string | null = null;
try {
  savedTheme = localStorage.getItem('x3diff-theme');
} catch {}
let theme = initialTheme(
  savedTheme,
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
);
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  el('#theme').innerHTML =
    `<span aria-hidden="true">${theme === 'dark' ? '☀' : '☾'}</span><span class="theme-label"> ${theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>`;
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
let coverage: Coverage | undefined;
// Names for objects without a DEF, read from the two scenes of the current comparison.
let objectNames: SceneNameSources = {};
function readObjectNames(text: string) {
  try {
    // The same guard the preview applies before any XML reaches a parser.
    if (prescan(text, 'before').length) return undefined;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return doc.querySelector('parsererror') ? undefined : sceneNames(doc);
  } catch {
    return undefined;
  }
}
/** Some content was compared and some was not: results are shown, marked as partial. */
function partialResult() {
  return !!coverage?.partial && !coverage.comparedNothing;
}
let revision = 0,
  view: 'before' | 'after' | 'diff' = 'diff',
  volumeRevision = 0;
const preferences = readPreferences();
const volumeResolution = el<HTMLSelectElement>('#volume-resolution');
volumeResolution.value = preferences.volumeResolution ?? 'medium';
const volumeDetail = el<HTMLSelectElement>('#volume-detail');
volumeDetail.value = volumeResolution.value;
function setVolumeResolution(value: string) {
  volumeResolution.value = volumeDetail.value = value;
  preferences.volumeResolution = value as 'low' | 'medium' | 'high';
  savePreferences(preferences);
  solid = undefined;
  if (!el('#volume-overlap').hidden) void showVolume();
}
volumeResolution.addEventListener('change', () => setVolumeResolution(volumeResolution.value));
volumeDetail.addEventListener('change', () => setVolumeResolution(volumeDetail.value));
let region = preferences.region ?? 'all';
const comparisons = new ComparisonClient();
let comparing = false;
let tolerance = { ...DEFAULT_TOLERANCE };
// True while the loaded pair is a bundled example rather than the reviewer's own files.
let fromExample = false;
let showcase = false,
  motion = true;
const fileRevisions = { before: 0, after: 0 };
let demoRevision = 0,
  demoPending = false;
const status = (text: string, error = false) => {
  el('#global-status').textContent = text;
  el('#global-status').classList.toggle('error', error);
};
/** Centre-stage progress; the status line above carries the same text for assistive tech. */
function stageBusy(text = '') {
  el('#stage-busy').hidden = !text;
  el('#stage-busy span').textContent = text;
}
function updateReady() {
  // The stage invites a first action until something is loaded or loading.
  const empty = !before && !after && !demoPending;
  el('#stage-empty').hidden = !empty;
  el('.scene-footer').hidden = empty;
  // With one side loaded, the next step sits on the stage, not only in the status line.
  const missing = before && !after ? 'after' : after && !before ? 'before' : undefined;
  el('#stage-next').hidden = !missing || demoPending;
  if (missing) {
    const [have, want] = missing === 'after' ? ['Before', 'After'] : ['After', 'Before'];
    el('#stage-next p').textContent =
      `${have} is loaded (${(before ?? after)!.name}). Next, choose the ${want} file, or drop it here.`;
    const button = el<HTMLButtonElement>('#stage-next button');
    button.dataset.load = missing;
    button.textContent = `Choose ${want} file…`;
  }
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
  // A partial result keeps the panel open even when nothing was found.
  const showPanel = hasDifferences || partialResult();
  el('.review-workspace').hidden = false;
  el('.review-workspace').classList.toggle('no-diff', !showPanel);
  if (showPanel) analysisTabs.refresh();
  else analysisTabs.clear();
  el<HTMLButtonElement>('button[data-view="diff"]').hidden = false;

  el('#expand').hidden = !showPanel;
  if (!showPanel) {
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
    ['context', partialResult() ? 'No difference found' : 'Unchanged'],
  ];
  el('#legend').replaceChildren();
  if (view !== 'diff' || !visual) return;
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
  el<HTMLButtonElement>('#focus-selection').disabled = true;
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
el('#focus-selection').addEventListener('click', async () => {
  const pane = activePane();
  const focused = await pane.focusSelection().catch(() => false);
  if (!focused)
    el('#selection').textContent =
      'The selection is highlighted, but has no supported static geometry to focus.';
});
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
  for (const button of Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-region], [data-volume-region]'),
  ))
    button.setAttribute(
      'aria-pressed',
      String((button.dataset.region ?? button.dataset.volumeRegion) === region),
    );
}
function setVolumeRegion(next: typeof region) {
  region = next;
  preferences.region = region;
  savePreferences(preferences);
  updateAnalysisControls();
  updateVolumeView();
}
function updateVolumeView() {
  volumePane.setRegions(region, el<HTMLInputElement>('#volume-context').checked);
  const counts = solid?.triangleCounts;
  const empty =
    counts &&
    (region === 'all'
      ? Object.values(counts).every((count) => count === 0)
      : counts[region === 'before' ? 'beforeOnly' : region === 'after' ? 'afterOnly' : 'shared'] ===
        0);
  el('#volume-empty').hidden = !empty;
  el('#volume-empty').textContent = empty
    ? `No ${region === 'all' ? 'occupied' : region === 'shared' ? 'shared' : region === 'before' ? 'before-only' : 'after-only'} volume at this resolution.`
    : '';
}
for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-region]')))
  button.addEventListener('click', () => setVolumeRegion(button.dataset.region as typeof region));
el('#volume-context').addEventListener('change', updateVolumeView);
el('#volume-summary').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-volume-region]');
  if (button) setVolumeRegion(button.dataset.volumeRegion as typeof region);
});
el('#volume-object').addEventListener('change', () => {
  const pair = linkedSections.getPairs()[Number(el<HTMLSelectElement>('#volume-object').value)];
  if (pair) selectAnalysisPair(pair);
});
async function showVolume() {
  if (!(before && after && report && visual)) return;
  const pairs = linkedSections.getPairs();
  const pair =
    selectedAnalysisPair ??
    pairs[Number(el<HTMLSelectElement>('#volume-object').value)] ??
    pairs[0];
  if (!pair) return;
  selectAnalysisPair(pair, false);
  const current = revision,
    request = ++volumeRevision;
  el('#volume-status').textContent = 'Preparing volume overlap…';
  el('#volume-summary').hidden = true;
  el('#volume-empty').hidden = true;
  el('#volume-method').textContent = '';
  updateAnalysisControls();
  try {
    if (!solid) {
      const { buildSolidRegions } = await import('../viewer/solidRegions');
      if (current !== revision || request !== volumeRevision) return;
      solid =
        buildSolidRegions(before.text, after.text, report, preferences.volumeResolution, {
          before: pair.before.path,
          after: pair.after.path,
        }) ?? undefined;
    }
    if (!solid)
      throw new Error('No supported matched geometry pair is available for volume comparison.');
    const doc = new DOMParser().parseFromString(solid.xml, 'application/xml');
    const scene = doc.getElementsByTagName('Scene')[0];
    const volume = doc.querySelector('[DEF="X3DIFF_VOLUME_PAIR"]')!;
    scene.replaceChildren(volume);
    await volumePane.load(new XMLSerializer().serializeToString(doc));
    if (current !== revision || request !== volumeRevision) return;
    renderVolumeSummary(el('#volume-summary'), solid);
    el('#volume-summary').hidden = false;
    el('#volume-method').textContent = volumeMethod(solid);
    updateAnalysisControls();
    updateVolumeView();
    volumePane.refreshView(true);
    el('#volume-status').textContent = pair.label;
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
  motionAnalysis.clear();
  comparisons.cancel();
  comparing = false;
  el('#compare').hidden = true;
  el('.review-workspace').setAttribute('aria-busy', 'false');
  stageBusy();
  revision++;
  volumeRevision++;
  report = undefined;
  coverage = undefined;
  el('#incomplete-banner').hidden = true;
  visual = undefined;
  solid = undefined;
  el('#volume-summary').hidden = true;
  el('#volume-empty').hidden = true;
  el('#volume-method').textContent = '';
  el('#volume-selection-notice').hidden = true;
  el('#volume-object').replaceChildren();
  el<HTMLButtonElement>('#focus-selection').disabled = true;

  closeSettings();
  closeExportMenu();
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
  el('#coverage-link').textContent = '';
  el('#changes').innerHTML = '<p class="empty-state">Ready to compare.</p>';
  el('#summary').replaceChildren();
  el('#register-summary').textContent = '';
  objectNames = {};
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
  fromExample = false;
  demoRevision++;
  demoPending = false;
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
    if (before && after) await runCompare();
    else {
      status(
        side === 'before'
          ? 'Before is loaded. Choose the After file to compare.'
          : 'After is loaded. Choose the Before file to compare.',
      );
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
    if (!file) return;
    // Like a drop: a file chosen while an example is on screen starts the reviewer's own
    // pair. It is never compared with the other half of the example.
    if (fromExample) before = after = undefined;
    void readFile(file, side);
  });
/** Two dropped files replace both sides and are compared once. */
async function readPair(entries: ReadonlyArray<readonly [File, Side]>, note: string) {
  showcase = false;
  fromExample = false;
  demoRevision++;
  demoPending = false;
  const tickets = entries.map(([, side]) => ++fileRevisions[side]);
  const current = () => entries.every(([, side], i) => tickets[i] === fileRevisions[side]);
  invalidate();
  before = undefined;
  after = undefined;
  updateReady();
  status('Reading both revisions…');
  const results = await Promise.allSettled(
    entries.map(async ([file]) => ({ name: file.name, text: await readInput(file) })),
  );
  if (!current()) return;
  let failure = '';
  const read: Partial<Record<Side, Input>> = {};
  results.forEach((result, i) => {
    const [file, side] = entries[i];
    if (result.status === 'fulfilled') read[side] = result.value;
    else
      failure ||= `${file.name}: ${result.reason instanceof Error ? result.reason.message : 'File could not be read.'}`;
  });
  before = read.before;
  after = read.after;
  updateReady();
  if (read.before && read.after) {
    await runCompare();
    // A complete comparison leaves the status line empty: say which file went where.
    if (current() && !el('#global-status').textContent) status(note);
    return;
  }
  // One of the pair could not be read: keep the other on screen and name the failure.
  const loaded = read.before ? 'before' : read.after ? 'after' : undefined;
  if (loaded) {
    setView(loaded);
    void (loaded === 'before' ? beforePane : afterPane).load(read[loaded]!.text);
  }
  status(failure, true);
}
// Drag and drop onto the stage: the same validation and reading as the file buttons.
// An example on screen counts as empty: a dropped file starts the reviewer's own pair
// instead of being compared with half of the example.
const ownFiles = () => ({ before: !!before && !fromExample, after: !!after && !fromExample });
const stageDrop = el('#stage-drop');
const carriesFiles = (event: DragEvent) =>
  !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');
const overStage = (event: DragEvent) => el('.viewers').contains(event.target as Node);
let dragDepth = 0;
function showDropTarget(visible: boolean) {
  stageDrop.hidden = !visible;
  if (!visible) stageDrop.classList.remove('over');
  else
    el('#stage-drop-hint').textContent =
      `One file ${!ownFiles().before ? 'loads as Before' : ownFiles().after ? 'replaces After' : 'loads as After'}. Two files load as Before and After in file-name order, unless their names say before or after.`;
}
document.addEventListener('dragenter', (event) => {
  if (!carriesFiles(event)) return;
  if (dragDepth++ === 0) showDropTarget(true);
});
document.addEventListener('dragleave', (event) => {
  if (!carriesFiles(event)) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    showDropTarget(false);
  }
});
document.addEventListener('dragover', (event) => {
  if (!carriesFiles(event)) return;
  // Also off the stage, so a near miss does not make the browser open the file.
  event.preventDefault();
  if (stageDrop.hidden) showDropTarget(true);
  stageDrop.classList.toggle('over', overStage(event));
  event.dataTransfer!.dropEffect = overStage(event) ? 'copy' : 'none';
});
document.addEventListener('drop', (event) => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  showDropTarget(false);
  if (!overStage(event)) return;
  const files = Array.from(event.dataTransfer!.files);
  const plan = planDrop(files, ownFiles());
  if ('error' in plan) {
    status(plan.error, true);
    return;
  }
  if (files.length === 1) {
    if (fromExample) before = after = undefined;
    void readFile(files[0], plan.sides[0]);
    return;
  }
  const name = (side: Side) => files[plan.sides.indexOf(side)].name;
  void readPair(
    files.map((file, i) => [file, plan.sides[i]] as const),
    `Loaded ${name('before')} as Before and ${name('after')} as After (${plan.rule}).`,
  );
});
function selectAnalysisPair(pair: AnalysisPair, refreshVolume = true) {
  const changedVolumePair =
    solid?.pairPaths.before !== pair.before.path || solid?.pairPaths.after !== pair.after.path;
  const previousPair = selectedAnalysisPair;
  clearSelection();
  selectedAnalysisPair = pair;
  linkedSections.selectPair(pair);
  surfaceAnalysis.selectPair(pair);
  const index = linkedSections.getPairs().indexOf(pair);
  if (index >= 0) el<HTMLSelectElement>('#volume-object').value = String(index);
  if (refreshVolume) el('#volume-selection-notice').hidden = true;
  if (changedVolumePair) solid = undefined;
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
  el<HTMLButtonElement>('#focus-selection').disabled = !ok;
  if (refreshVolume && changedVolumePair && previousPair !== pair && !el('#volume-overlap').hidden)
    void showVolume();
}
function selectChange(change: ChangeRecord, group?: ChangeRecord[], label?: string) {
  selectedAnalysisPair = undefined;
  for (const pane of [beforePane, afterPane, diffPane]) pane.clearCue();
  const changes = group ?? [change];
  linkedSections.select(changes);
  surfaceAnalysis.select(changes);
  const pairIndex = linkedSections
    .getPairs()
    .findIndex((pair) =>
      changes.some(
        (item) =>
          affectsShape(pair.before.path, item.beforeNode?.path) ||
          affectsShape(pair.after.path, item.afterNode?.path),
      ),
    );
  if (pairIndex >= 0) {
    selectedAnalysisPair = linkedSections.getPairs()[pairIndex];
    el<HTMLSelectElement>('#volume-object').value = String(pairIndex);
    if (
      solid?.pairPaths.before !== selectedAnalysisPair.before.path ||
      solid?.pairPaths.after !== selectedAnalysisPair.after.path
    )
      solid = undefined;
    el('#volume-selection-notice').hidden = true;
  } else {
    el('#volume-selection-notice').textContent =
      'This file difference has no supported volume pair. The object selected above remains displayed.';
    el('#volume-selection-notice').hidden = false;
  }
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
  // A light has no shape of its own: its evidence is the register entry and the two revisions.
  const light =
    !ok && changes.every((item) => LIGHTS.has((item.afterNode ?? item.beforeNode)?.nodeType ?? ''));
  el('#selection').textContent =
    `${label ?? node?.defName ?? node?.nodeType ?? 'Scene'} · ${ok ? 'Highlighted in scene' : light ? 'A light has no shape to highlight. Compare the Before and After views to see its effect; the Differences view uses its own neutral lighting.' : 'No visible object in this view'}`;
  el<HTMLButtonElement>('#focus-selection').disabled = !ok;
}
function renderReport(value: X3DiffReport) {
  report = value;
  coverage = describeCoverage(value);
  const partial = partialResult();
  el('#incomplete-banner').hidden = !partial;
  // On a phone the list starts folded so the sticky notice leaves room for the register.
  el<HTMLDetailsElement>('#incomplete-banner details').open = window.innerWidth > 540;
  el('#incomplete-list').replaceChildren(
    ...coverageLines(coverage, {
      before: value.inputs.before.name,
      after: value.inputs.after.name,
    }).map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }),
  );
  el('#change-count').textContent = `${value.changes.length}${partial ? ' · partial' : ''}`;
  el('#report-status').textContent = {
    complete: '',
    completeWithWarnings: 'With notes',
    incomplete: 'Incomplete',
    failed: 'Failed',
  }[value.summary.status];
  el('#report-status').dataset.status = value.summary.status;
  // The status only speaks for the catalogued node types: say how many, and link the list.
  el('#coverage-link').textContent =
    `Compares ${value.catalog.supportedNodes.length} X3D node types — see the list`;
  const counts = new Map<string, number>();
  for (const c of value.changes) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  objectNames = value.changes.length
    ? { before: readObjectNames(before?.text ?? ''), after: readObjectNames(after?.text ?? '') }
    : {};
  el('#register-summary').textContent = summarizeChanges(value.changes);
  const summary = el('#summary');
  summary.replaceChildren();
  if (partial) {
    const note = document.createElement('p');
    note.className = 'partial-note';
    note.textContent = 'Partial counts: only the content that was compared is counted.';
    summary.append(note);
  }
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
    // Everything else (animation, lighting, viewpoints, names, document), so the four add up.
    [
      'Other',
      value.changes.filter(
        (c) =>
          !['geometry', 'transform', 'material', 'appearance', 'structure'].includes(c.category),
      ).length,
    ],
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
  category.replaceChildren();
  category.disabled = false;
  for (const [name, count] of [['all', value.changes.length] as const, ...counts]) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = categoryLabel(name, count);
    category.append(option);
  }
  renderRegister(el('#changes'), value, 'all', selectChange, objectNames);
  const notes = el('#diagnostics');
  notes.replaceChildren();
  const unique = new Map<string, number>();
  for (const d of value.diagnostics) {
    const message = describeDiagnostic(d);
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
    renderRegister(
      el('#changes'),
      report,
      el<HTMLSelectElement>('#category').value,
      selectChange,
      objectNames,
    );
  }
});
async function runCompare(defaults: { view?: string } = {}) {
  if (!(before && after)) return;
  const a = before,
    b = after;

  const desiredExpanded =
    preferences.expanded ?? el('.review-workspace').classList.contains('expanded');
  invalidate();
  const current = revision;
  comparing = true;
  el('#compare').hidden = false;
  el('.review-workspace').setAttribute('aria-busy', 'true');
  status('Comparing…');
  stageBusy('Comparing revisions…');
  try {
    const result = await comparisons.compare({
      before: a.text,
      after: b.text,
      config: tolerance,
      names: { before: a.name, after: b.name },
    });
    if (current !== revision) return;
    renderReport(result);
    const cause =
      result.diagnostics.find((d) => d.severity === 'error') ??
      result.diagnostics.find((d) => d.code.startsWith('UNSUPPORTED'));
    const reason = cause
      ? describeDiagnostic(cause, { before: a.name, after: b.name })
      : 'Some objects could not be matched between the files with confidence';
    // Replaces the empty "all clear" status whenever the result is partial.
    const settled = (text = '') =>
      status(
        [
          partialResult()
            ? `Incomplete comparison: some content was not compared. ${reason}.`
            : text,
          motionAnalysis.notice,
        ]
          .filter(Boolean)
          .join(' '),
        partialResult(),
      );
    // Motion is read from the two files directly, so it is available even when the
    // comparison is incomplete.
    if (!coverage?.comparedNothing) motionAnalysis.load(a.text, b.text);
    if (coverage?.comparedNothing) {
      // Nothing in the scenes was compared (unreadable file or version boundary):
      // there is no register to show, only the reason.
      status(
        (result.summary.status === 'failed' ? 'Comparison failed: ' : 'Comparison incomplete: ') +
          reason,
        true,
      );
      // Keep the revisions on screen: content the engine cannot vouch for should
      // not leave the reviewer looking at an empty stage.
      const shown = cause?.side === 'after' ? 'before' : 'after';
      const previews = {
        before: () => beforePane.load(a.text),
        after: () => afterPane.load(b.text),
      };
      void previews[shown]().then(() => {
        if (current === revision) return previews[shown === 'after' ? 'before' : 'after']();
      });
      showResult(false);
      setView(shown);
      return;
    }
    if (!result.changes.length) {
      void beforePane.load(a.text).then(() => {
        if (current === revision && view === 'before' && selectedAnalysisPair)
          selectAnalysisPair(selectedAnalysisPair);
      });
      void afterPane.load(b.text);
      visual = buildDiffScene(a.text, b.text, result);
      await diffPane.load(visual.xml);
      if (current !== revision) return;
      showResult(false);
      setView('diff');
      settled('No differences found.');
      return;
    }
    linkedSections.load(a.text, b.text, result);
    el('#volume-object').replaceChildren(
      ...linkedSections.getPairs().map((pair, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = pair.label;
        return option;
      }),
    );
    updateObjectChoice(el<HTMLSelectElement>('#volume-object'));
    surfaceAnalysis.load(linkedSections.getPairs());
    visual = buildDiffScene(a.text, b.text, result);
    const overlay = visual.xml;
    const reselect = (side: 'before' | 'after') => () => {
      if (current === revision && view === side && selectedAnalysisPair)
        selectAnalysisPair(selectedAnalysisPair);
    };
    const loaders = {
      before: () => beforePane.load(a.text).then(reselect('before')),
      after: () => afterPane.load(b.text).then(reselect('after')),
      diff: () => diffPane.load(overlay),
    };
    // Importing three scenes at once makes all of them slow. Load the Differences
    // view the reviewer lands on, show it, then fill the other two behind it.
    await loaders.diff();
    if (current !== revision) return;
    void (async () => {
      for (const side of ['after', 'before'] as const) {
        if (current !== revision) return;
        await loaders[side]();
      }
    })();
    showResult(true);
    // A link may ask for one analysis view; anything else keeps the usual one.
    if (defaults.view) analysisTabs.open(defaults.view);
    updateAnalysisControls();
    el('#scene-note').textContent = '';
    el('.review-workspace').classList.toggle('expanded', desiredExpanded);
    updateLayoutButton(desiredExpanded);
    setView('diff');

    if (current !== revision) return;
    settled();
  } catch (error) {
    if (current === revision)
      status(error instanceof Error ? error.message : 'Comparison failed.', true);
  } finally {
    if (current === revision) {
      comparing = false;
      el('#compare').hidden = true;
      el('.review-workspace').setAttribute('aria-busy', 'false');
      stageBusy();
    }
  }
}
el('#compare').addEventListener('click', () => {
  if (comparing) {
    invalidate();
    status('Comparison cancelled.');
  }
});
// The threshold is kept even when no pair is loaded yet, so the value shown in
// Settings is always the one the next comparison uses.
function applyTolerance() {
  const input = el<HTMLInputElement>('#tolerance');
  const v = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(v) || v < 0) {
    status('Enter a non-negative coordinate threshold.', true);
    return;
  }
  tolerance = { ...tolerance, vectorAbs: v };
  closeSettings();
  if (before && after) void runCompare();
}
el('#apply-settings').addEventListener('click', applyTolerance);
el('#tolerance').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') applyTolerance();
});
function download(text: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** A button that opens a small menu: arrow keys move, Escape and outside clicks close. */
function menuButton(picker: HTMLElement, trigger: HTMLButtonElement, menu: HTMLElement) {
  const close = () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  trigger.addEventListener('click', () => {
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) menu.querySelector<HTMLButtonElement>('button')?.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!picker.contains(event.target as Node)) close();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
      trigger.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  });
  picker.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !picker.contains(event.relatedTarget as Node)) close();
  });
  return close;
}
const exportTrigger = el<HTMLButtonElement>('#export');
const closeExportMenu = menuButton(el('.export-picker'), exportTrigger, el('#export-menu'));
let exporting = false;
/** The readable report quotes the analysis views, so it measures the selected object first. */
async function exportHtml() {
  if (!report || !before || !after || exporting) return;
  const value = report,
    current = revision,
    was = el('#global-status').textContent ?? '',
    wasError = el('#global-status').classList.contains('error');
  exporting = true;
  status('Preparing the report…');
  try {
    // Let the status paint before the measurements run.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const pairs = linkedSections.getPairs();
    const analyses = coverage?.comparedNothing
      ? []
      : await gatherAnalysisFacts({
          before: before.text,
          after: after.text,
          report: value,
          pairs,
          pair:
            selectedAnalysisPair ??
            pairs[Number(el<HTMLSelectElement>('#volume-object').value)] ??
            pairs[0],
          resolution: preferences.volumeResolution ?? 'medium',
          solid,
          motion: motionAnalysis,
        });
    if (current !== revision) return;
    download(
      exportReportHtml(value, { generatedAt: new Date(), analyses, names: objectNames }),
      'text/html',
      exportFileName(value, 'html'),
    );
  } finally {
    exporting = false;
    if (current === revision) status(was, wasError);
  }
}
el('#export-menu').addEventListener('click', (event) => {
  const kind = (event.target as HTMLElement).closest<HTMLElement>('[data-export]')?.dataset.export;
  if (!kind || !report) return;
  closeExportMenu();
  exportTrigger.focus();
  if (kind === 'json')
    download(exportReportJson(report), 'application/json', exportFileName(report, 'json'));
  else
    void exportHtml().catch((error) =>
      status(error instanceof Error ? error.message : 'The report could not be written.', true),
    );
});
const demoTrigger = el<HTMLButtonElement>('#demo-trigger'),
  demoMenu = el<HTMLElement>('#demo-menu');
const closeDemoMenu = menuButton(el('.demo-picker'), demoTrigger, demoMenu);
async function loadDemo(id: string, view?: string) {
  if (!Object.hasOwn(demos, id)) return;
  const demo = demos[id];
  closeDemoMenu();
  const ticket = ++demoRevision;
  fileRevisions.before++;
  fileRevisions.after++;
  invalidate();
  before = undefined;
  after = undefined;
  demoPending = true;
  updateReady();
  status('Loading…');
  stageBusy('Loading example…');
  try {
    const [a, b] = await demo.load();
    if (ticket !== demoRevision) return;
    demoPending = false;
    showcase = !!demo.showcase;
    fromExample = true;
    before = { name: demo.names[0], text: a };
    after = { name: demo.names[1], text: b };
    updateReady();
    motion = true;
    beforePane.setAnimationEnabled(true);
    afterPane.setAnimationEnabled(true);
    updateMotionButton();
    // Every example opens side by side, the register beside the scene, unless the reviewer
    // chose the focused layout before.
    await runCompare({ view });
  } catch (error) {
    if (ticket === demoRevision) {
      demoPending = false;
      stageBusy();
      updateReady();
      // The technical reason (a failed fetch or import) helps nobody choose what to do next.
      status('The example could not be loaded. Choose or drop your own files instead.', true);
    }
  }
}
for (const button of Array.from(demoMenu.querySelectorAll<HTMLButtonElement>('button[data-demo]')))
  button.addEventListener('click', () => void loadDemo(button.dataset.demo!));
updateLegend();

for (const side of ['before', 'after'] as const)
  el(`#load-${side}`).addEventListener('click', () =>
    el<HTMLInputElement>(`#${side}-file`).click(),
  );
for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('.viewers [data-load]')))
  button.addEventListener('click', () =>
    el<HTMLInputElement>(`#${button.dataset.load}-file`).click(),
  );
el('#stage-empty [data-example]').addEventListener('click', () => void loadDemo('example'));
invalidate();
updateReady();
// app.html?example=brickhaven&view=motion opens an example on one analysis view. Unknown
// examples fall back to the Dolphin, and an unknown or unavailable view to the usual tab.
const query = new URLSearchParams(location.search);
const initialExample = query.get('example');
const initialView = query.get('view') ?? undefined;
void loadDemo(
  initialExample && Object.hasOwn(demos, initialExample) ? initialExample : 'dolphin',
  initialView && /^[a-z][a-z0-9-]{0,63}$/.test(initialView) ? initialView : undefined,
);
