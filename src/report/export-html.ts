import type { ChangeRecord, X3DiffReport } from './schema';
import { coverageLines, describeCoverage, describeDiagnostic } from './coverage';
import {
  buildRegister,
  categoryNames,
  propertyLabel,
  summarizeChanges,
  valueText,
  type ChangeGroup,
  type SceneNameSources,
} from './presentation';

/** The key numbers of one analysis view, for the object measured, with that view's limits. */
export interface AnalysisFacts {
  view: string;
  /** Reader-facing name of the object the numbers belong to. */
  object?: string;
  rows: Array<[label: string, value: string]>;
  /** A sentence about what the numbers cover, such as how the object was chosen. */
  note?: string;
  /** Why the view has no numbers for this pair, when it was tried and could not be measured. */
  unavailable?: string;
  limits: string;
}
export interface HtmlReportOptions {
  /** When the report was written; shown in the reader's local time and in UTC. */
  generatedAt: Date;
  analyses?: AnalysisFacts[];
  /** Scene lookups for naming objects without a DEF, as the register does. */
  names?: SceneNameSources;
}

// Every piece of text that comes from the two files (file names, DEF names, strings, meta
// content) reaches the page through `esc`. The `safe` tag escapes each value it is given;
// only fragments it built itself (`Safe`) pass through unchanged. (It is not called `html`
// so that formatters leave the markup, and the white space inside value cells, alone.)
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const esc = (value: unknown) =>
  String(value)
    // Control characters have no place in a report and can upset an HTML parser.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '�')
    .replace(/[&<>"']/g, (c) => ENTITIES[c]);
class Safe {
  constructor(readonly markup: string) {}
}
const show = (value: unknown): string =>
  value instanceof Safe
    ? value.markup
    : Array.isArray(value)
      ? value.map(show).join('')
      : value === undefined || value === null || value === false
        ? ''
        : esc(value);
const safe = (strings: TemplateStringsArray, ...values: unknown[]) =>
  new Safe(strings.reduce((out, s, i) => out + s + (i < values.length ? show(values[i]) : ''), ''));

const STATUS: Record<X3DiffReport['summary']['status'], [label: string, meaning: string]> = {
  complete: [
    'Complete',
    'Everything in both files is inside the supported model and was compared.',
  ],
  completeWithWarnings: [
    'With notes',
    'Everything inside the supported model was compared. The notes below say what was read with a caveat.',
  ],
  incomplete: [
    'Incomplete',
    'Some content was not compared. The differences listed are real, but the skipped parts may hide more: this is not a full check.',
  ],
  failed: ['Failed', 'A file could not be read, so nothing was compared.'],
};
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const two = (n: number) => String(n).padStart(2, '0');
function localTime(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const zone = `UTC${offset < 0 ? '−' : '+'}${two(Math.floor(Math.abs(offset) / 60))}:${two(Math.abs(offset) % 60)}`;
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())} (${zone})`;
}
function size(bytes: number): string {
  const exact = `${bytes.toLocaleString('en-US')} bytes`;
  return bytes < 1024
    ? exact
    : `${bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 ** 2).toFixed(2)} MiB`} (${exact})`;
}
function swatch(change: ChangeRecord, side: 'before' | 'after'): Safe | '' {
  const value = change[side]?.value;
  if (
    !/color/i.test(change.field ?? '') ||
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
  )
    return '';
  // Numbers only: nothing from the file reaches the style attribute as text.
  const rgb = (value as number[]).map((v) => Math.round(v * 255)).join(',');
  return new Safe(`<span class="swatch" style="background:rgb(${rgb})"></span>`);
}

const STYLE = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#15232d;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 28px 48px}
h1{font-size:24px;margin:0 0 4px;letter-spacing:-.4px}
h2{font-size:17px;margin:34px 0 10px;padding-bottom:6px;border-bottom:2px solid #15232d}
h3{font-size:14px;margin:20px 0 6px}
p{margin:6px 0}
.lede{color:#4a5e69;margin:0 0 18px}
.status{display:inline-block;padding:2px 10px;border:1.5px solid;border-radius:999px;font-weight:650;font-size:13px}
.status.complete{color:#0b6b4f}.status.completeWithWarnings{color:#7a5a00}.status.incomplete,.status.failed{color:#a3261d}
.summary{font-size:16px;font-weight:600;margin:10px 0}
table{width:100%;border-collapse:collapse;margin:8px 0 4px}
th,td{text-align:left;vertical-align:top;padding:6px 10px 6px 0;border-bottom:1px solid #d9e1e5;overflow-wrap:anywhere}
thead th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#4a5e69;border-bottom:1.5px solid #8fa1ab}
tbody th{font-weight:600;width:34%}
td.value{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12.5px;white-space:pre-wrap;width:26%}
td.category{color:#4a5e69;font-size:12px;width:14%}
.facts th{width:44%;font-weight:500}
.group{break-inside:avoid-page}
.group h3 small,.muted{color:#4a5e69;font-weight:400}
.swatch{display:inline-block;width:12px;height:12px;margin-right:6px;border:1px solid #15232d;vertical-align:-1px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.notice{border-left:4px solid #a3261d;padding:8px 14px;background:#fbf1ef;margin:10px 0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
ul{margin:6px 0;padding-left:20px}
.members{columns:2;column-gap:28px;font-size:13px}.members li{break-inside:avoid}.members small{color:#4a5e69;font-size:11px}
.limits{font-size:12.5px;color:#4a5e69;margin-top:6px}
footer{margin-top:40px;padding-top:10px;border-top:1px solid #d9e1e5;font-size:12px;color:#4a5e69}
@page{margin:16mm 14mm}
@media print{main{max-width:none;padding:0}h2{break-after:avoid-page}tr{break-inside:avoid}}
@media (max-width:560px){.members{columns:1}main{padding:20px 14px 32px}th,td{padding-right:6px}tbody th{width:auto}}
`;

const row = (label: string, value: unknown) =>
  safe`<tr><th scope="row">${label}</th><td>${value}</td></tr>\n`;

function differences(report: X3DiffReport, names: SceneNameSources = {}): Safe {
  const categories = new Map<string, number>();
  for (const change of report.changes)
    categories.set(change.category, (categories.get(change.category) ?? 0) + 1);
  const rowsOf = (group: ChangeGroup, repeated = 0) =>
    group.changes.map((change) => {
      const node = change.afterNode ?? change.beforeNode;
      const own = node?.defName && node.defName !== group.label ? node.defName : node?.nodeType;
      const subject = `${group.nameNodes ? `${own ?? 'Scene'} · ` : ''}${propertyLabel(change)}${repeated ? ` · each of ${repeated}` : ''}`;
      // In a bundle the values are listed once; every member lists its own change ids below.
      if (repeated)
        return safe`<tr><th scope="row">${subject}</th><td class="value">${swatch(change, 'before')}${valueText(change, 'before')}</td><td class="value">${swatch(change, 'after')}${valueText(change, 'after')}</td><td class="category">${categoryNames[change.category] ?? change.category}</td></tr>\n`;
      return safe`<tr data-change="${change.id}"><th scope="row">${subject}</th><td class="value">${swatch(change, 'before')}${valueText(change, 'before')}</td><td class="value">${swatch(change, 'after')}${valueText(change, 'after')}</td><td class="category">${categoryNames[change.category] ?? change.category}</td></tr>\n`;
    });
  const head = safe`<thead><tr><th scope="col">Property</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Category</th></tr></thead>`;
  const groups = buildRegister(report.changes, names).map((entry) =>
    entry.kind === 'group'
      ? safe`<section class="group">
<h3>${entry.label} <small>${plural(entry.changes.length, 'difference')}</small></h3>
<table>
${head}
<tbody>
${rowsOf(entry)}</tbody>
</table>
</section>
`
      : safe`<section class="group bundle">
<h3>${entry.label} <small>${plural(entry.changes.length, 'difference')}</small></h3>
<table>
${head}
<tbody>
${rowsOf(entry.groups[0], entry.groups.length)}</tbody>
</table>
<p class="muted">The ${entry.groups.length} objects, each with the ${plural(entry.groups[0].changes.length, 'difference')} above:</p>
<ul class="members">
${entry.groups.map(
  (group) =>
    safe`<li>${group.label} <small>${group.changes.map(
      (change, i) => safe`${i ? ', ' : ''}<span data-change="${change.id}">${change.id}</span>`,
    )}</small></li>\n`,
)}</ul>
</section>
`,
  );
  return safe`<table class="facts" id="categories">
<thead><tr><th scope="col">Category</th><th scope="col">Differences</th></tr></thead>
<tbody>
${[...categories].map(([category, count]) => row(categoryNames[category] ?? category, count))}${row('Total', report.changes.length)}</tbody>
</table>
<div id="differences">
${groups}</div>
<p class="muted">Lists of more than nine values are summarised by their length; the data export (JSON) holds every value.</p>`;
}

function measurements(analyses: AnalysisFacts[]): Safe {
  return safe`<h2>Measurements</h2>
<p class="muted">Key numbers from the analysis views available for this pair. They are exploratory measurements with stated limits, not certified metrology.</p>
${analyses.map(
  (facts) => safe`<section class="group analysis">
<h3>${facts.view}${facts.object ? safe` <small>${facts.object}</small>` : ''}</h3>
${facts.note ? safe`<p class="muted">${facts.note}</p>\n` : ''}${
    facts.unavailable
      ? safe`<p>Not measured: ${facts.unavailable}</p>`
      : safe`<table class="facts"><tbody>\n${facts.rows.map(([label, value]) => row(label, value))}</tbody></table>`
  }
<p class="limits"><strong>Limits of this measurement.</strong> ${facts.limits}</p>
</section>
`,
)}`;
}

/**
 * The comparison as one printable HTML page: no script, no external request, light background.
 * It says the same as the JSON export, in words; long value lists are summarised.
 */
export function exportReportHtml(report: X3DiffReport, options: HtmlReportOptions): string {
  const { before, after } = report.inputs;
  const [statusLabel, statusMeaning] = STATUS[report.summary.status];
  const coverage = describeCoverage(report);
  const skipped = coverageLines(coverage, { before: before.name, after: after.name });
  const notes = new Map<string, number>();
  for (const d of report.diagnostics) {
    const message = describeDiagnostic(d);
    notes.set(message, (notes.get(message) ?? 0) + 1);
  }
  const fileRow = (label: string, value: (side: typeof before) => unknown) =>
    safe`<tr><th scope="row">${label}</th><td>${value(before)}</td><td>${value(after)}</td></tr>\n`;
  const config = report.config;
  const count = coverage.comparedNothing
    ? 'Nothing was compared.'
    : `${plural(report.changes.length, 'difference')} found${coverage.partial ? ' in the content that was compared (partial count)' : ''}.`;
  const nothing = coverage.comparedNothing
    ? 'No differences are listed because nothing was compared.'
    : coverage.partial
      ? 'No differences were found in the content that was compared. This is not a full check: see what was not compared above.'
      : 'No differences were found at these tolerances, within the supported model.';

  return safe`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="generator" content="X3Diff ${report.toolVersion}">
<title>X3Diff report: ${before.name ?? 'Before'} → ${after.name ?? 'After'}</title>
<style>${new Safe(STYLE)}</style>
</head>
<body>
<main>
<h1>X3Diff comparison report</h1>
<p class="lede">What changed between two X3D files, as compared in the browser. Nothing was uploaded.</p>
<p><span class="status ${report.summary.status}" id="status">${statusLabel}</span> ${statusMeaning}</p>
<p class="summary" id="difference-count">${count}</p>

<h2>Files compared</h2>
<table id="files">
<thead><tr><th scope="col"></th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
<tbody>
${fileRow('File name', (side) => side.name ?? '(no name)')}${fileRow('Size', (side) => size(side.byteLength))}${fileRow('X3D version', (side) => side.x3dVersion ?? 'not declared')}${fileRow('Profile', (side) => side.profile ?? 'not declared')}${fileRow('Elements read', (side) => side.parsedNodeCount.toLocaleString('en-US'))}</tbody>
</table>

<h2>How it was compared</h2>
<table class="facts" id="method">
<tbody>
<tr><th scope="row">Report written</th><td><time datetime="${options.generatedAt.toISOString()}">${localTime(options.generatedAt)}</time></td></tr>
${row('Tool', `X3Diff ${report.toolVersion}, report format ${report.schemaVersion}`)}${row('Catalog', `X3D ${report.catalog.version}, ${report.catalog.supportedNodes.length} node types`)}${row('Point and vector tolerance', `${config.vectorAbs} scene units (distance)`)}${row('Number tolerance', `${config.floatAbs} absolute + ${config.floatRel} relative`)}${row('Rotation tolerance', `${config.rotationRadians} rad`)}${row('Colour tolerance', `${config.colorAbs} per channel`)}</tbody>
</table>
<p class="muted">Values that differ by less than these tolerances count as equal.</p>
${
  coverage.partial
    ? safe`
<h2>What was not compared</h2>
<div class="notice" id="not-compared">
<p><strong>${coverage.comparedNothing ? 'Nothing was compared.' : 'This comparison is incomplete.'}</strong> ${
        coverage.comparedNothing
          ? 'The reason is given below.'
          : 'The parts listed here were skipped and may hide more differences.'
      }</p>
${skipped.length ? safe`<ul>${skipped.map((line) => safe`<li>${line}</li>`)}</ul>` : ''}
</div>
`
    : ''
}${
    notes.size
      ? safe`
<h2>Notes from reading the files</h2>
<ul id="notes">${[...notes].map(
          ([message, times]) =>
            safe`<li>${message}${times > 1 ? ` (${times} declarations)` : ''}</li>`,
        )}</ul>
`
      : ''
  }
<h2>Differences</h2>
${
  report.changes.length
    ? safe`<p class="summary" id="summary-line">${summarizeChanges(report.changes)}</p>\n${differences(report, options.names)}`
    : safe`<p id="no-differences">${nothing}</p>`
}

${options.analyses?.length ? measurements(options.analyses) : ''}
<footer>
<p>Written by X3Diff ${report.toolVersion}, an open-source X3D comparison workbench. The comparison is deterministic and ran in the browser. A report over supported declarations is evidence for a review; it is not a certificate that two scenes are equivalent.</p>
</footer>
</main>
</body>
</html>
`.markup;
}
