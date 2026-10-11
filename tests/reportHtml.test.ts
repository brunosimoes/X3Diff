import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareX3D } from '../src/diff/compare';
import { exportReportHtml, type AnalysisFacts } from '../src/report/export-html';
import { exportFileName, safeNamePart } from '../src/report/fileNames';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${p}`, import.meta.url)), 'utf8');
const scene = (body: string, head = '') =>
  `<X3D version="3.3" profile="Immersive"><head>${head}</head><Scene>${body}</Scene></X3D>`;
const at = new Date('2026-10-11T15:04:05Z');
const text = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
/** Every element name in the page, so nothing a file contains can add one. */
const tags = (html: string) =>
  new Set(Array.from(html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g), (m) => m[1].toLowerCase()));
const ALLOWED = new Set(
  'html head meta title style body main h1 h2 h3 p span table thead tbody tr th td time div ul li section small strong footer'.split(
    ' ',
  ),
);

describe('printable HTML report', () => {
  const names = { before: 'part-v1.x3d', after: 'part-v2.x3d' };
  const before = scene(
    '<Transform DEF="Bracket" translation="0 0 0"><Shape><Appearance><Material diffuseColor="0.2 0.5 0.9"/></Appearance><Box size="2 1 1"/></Shape></Transform>',
  );
  const after = scene(
    '<Transform DEF="Bracket" translation="0 0.25 0"><Shape><Appearance><Material diffuseColor="0.9 0.2 0.2"/></Appearance><Box size="2.4 1 1"/></Shape></Transform><Shape DEF="Washer"><Sphere/></Shape>',
  );
  const report = compareX3D(before, after, {}, names);
  const page = exportReportHtml(report, { generatedAt: at });

  it('names both files with their sizes and versions, the time, the tool and the tolerances', () => {
    const body = text(page);
    expect(body).toContain('part-v1.x3d');
    expect(body).toContain('part-v2.x3d');
    expect(body).toContain(`${report.inputs.before.byteLength} bytes`);
    expect(body).toContain(`${report.inputs.after.byteLength} bytes`);
    expect(body).toMatch(/X3D version 3\.3 3\.3/);
    expect(body).toContain('Immersive');
    expect(page).toContain('<time datetime="2026-10-11T15:04:05.000Z">');
    expect(body).toMatch(/Report written 2026-10-1[12] \d\d:\d\d \(UTC[+−]\d\d:\d\d\)/);
    expect(body).toContain(`X3Diff ${report.toolVersion}, report format 1.0`);
    expect(body).toContain('50 node types');
    expect(body).toContain('0.00001 scene units');
    expect(body).toContain('0.000001 absolute + 0.000001 relative');
    expect(body).toContain('0.0001 per channel');
    expect(page).toContain('<title>X3Diff report: part-v1.x3d → part-v2.x3d</title>');
  });

  it('lists every difference once, grouped by object, with before and after values', () => {
    expect(page.match(/data-change="/g)).toHaveLength(report.changes.length);
    for (const change of report.changes) expect(page).toContain(`data-change="${change.id}"`);
    const body = text(page);
    expect(body).toContain('Complete');
    expect(body).toContain(`${report.changes.length} differences found.`);
    expect(body).toMatch(/Bracket 3 differences/);
    expect(body).toMatch(/Box · Dimensions X 2 · Y 1 · Z 1 X 2\.4 · Y 1 · Z 1 Geometry/);
    expect(body).toMatch(/Translation X 0 · Y 0 · Z 0 X 0 · Y 0\.25 · Z 0 Transform/);
    expect(body).toMatch(/Object added absent present Structure/);
    expect(page).toContain('style="background:rgb(51,128,230)"');
    expect(page).toContain('style="background:rgb(230,51,51)"');
    // The category counts add up to the total shown.
    const counts = Array.from(
      page.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>(\d+)<\/td><\/tr>/g),
      (m) => [m[1], Number(m[2])] as const,
    );
    const total = counts.find(([label]) => label === 'Total')![1];
    expect(total).toBe(report.changes.length);
    expect(
      counts.filter(([label]) => label !== 'Total').reduce((sum, [, count]) => sum + count, 0),
    ).toBe(total);
  });

  it('is one self-contained page: no script, no external address, a locked-down policy', () => {
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">`,
    );
    expect([...tags(page)].filter((tag) => !ALLOWED.has(tag))).toEqual([]);
    expect(page).not.toMatch(/https?:|\/\/[a-z]|url\(|@import|<link|<script|<iframe|<img|<a\s/i);
    expect(page).not.toMatch(/\son[a-z]+\s*=/i);
    expect(page).toContain('color-scheme:light');
    expect(page).toContain('background:#fff');
    expect(page).toContain('@page{');
  });

  it('says exactly what was skipped when the comparison is incomplete', () => {
    const incomplete = compareX3D(
      read('incomplete/before.x3d'),
      read('incomplete/after.x3d'),
      {},
      { before: 'pump-v1.x3d', after: 'pump-v2.x3d' },
    );
    const body = text(exportReportHtml(incomplete, { generatedAt: at }));
    expect(body).toContain('Incomplete');
    expect(body).toContain('This comparison is incomplete.');
    expect(body).toContain('Before file (pump-v1.x3d): 1 element of unsupported type (Fog × 1)');
    expect(body).toContain('After file (pump-v2.x3d): 1 element of unsupported type (Fog × 1)');
    expect(body).toContain(
      '10 differences found in the content that was compared (partial count).',
    );
    expect(body).toContain('Fog nodes are outside the supported catalog and were not compared');
  });

  it('covers the other statuses and an empty result', () => {
    const same = text(exportReportHtml(compareX3D(before, before, {}, names), { generatedAt: at }));
    expect(same).toContain('0 differences found.');
    expect(same).toContain('No differences were found at these tolerances');
    const notes = text(
      exportReportHtml(compareX3D(read('version/before.x3d'), read('version/after.x3d')), {
        generatedAt: at,
      }),
    );
    expect(notes).toContain('With notes');
    expect(notes).toContain('Notes from reading the files');
    expect(notes).toContain('X3D 4.0 file read with the X3D 3.3 catalog');
    expect(notes).toMatch(/X3D version 3\.3 4\.0/);
    expect(notes).toContain('(no name)');
    const failed = text(
      exportReportHtml(compareX3D(scene('<Shape>'), before, {}, names), { generatedAt: at }),
    );
    expect(failed).toContain('Failed');
    expect(failed).toContain('Nothing was compared.');
    expect(failed).toContain('not well-formed XML');
    // One broken file is one note, without a count of "declarations".
    expect(failed).not.toContain('declarations)');
  });

  it('quotes the analysis numbers it is given, each with its limits', () => {
    const analyses: AnalysisFacts[] = [
      {
        view: 'Volume differences',
        object: 'Bracket <b>',
        note: 'Measured for the selected object.',
        rows: [['Net change', '+0.4']],
        limits: 'World coordinates.',
      },
      { view: 'Surface deviation', rows: [], unavailable: 'too <small>', limits: 'Sampled.' },
    ];
    const withNumbers = exportReportHtml(report, { generatedAt: at, analyses });
    const body = text(withNumbers);
    expect(body).toContain('Measurements');
    expect(body).toMatch(/Volume differences Bracket <b>/);
    expect(body).toMatch(/Net change \+0\.4/);
    expect(body).toMatch(/Limits of this measurement\. World coordinates\./);
    expect(body).toMatch(/Not measured: too <small>/);
    expect(withNumbers).not.toContain('<b>');
    expect(text(page)).not.toContain('Measurements');
  });

  it('escapes every piece of text that comes from the files', () => {
    const attack = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
    const xml = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const hostile = (title: string, size: number) =>
      scene(
        `<WorldInfo DEF="${xml(attack)}" title="${xml(title)}" info='"${xml('</td></table><script>x()</script>')}"'/>` +
          `<Transform DEF="${xml("T'</style><script>y()</script>")}"><Shape DEF="${xml('S<svg onload=z()>')}"><Box size="${size} 1 1"/></Shape></Transform>` +
          `<Fog DEF="${xml(attack)}"/>`,
        `<meta name="${xml('<b>name</b>')}" content="${xml(title + '</title><script>m()</script>')}"/>`,
      );
    const evil = compareX3D(
      hostile('</title><script>a()</script>', 1),
      hostile('<iframe src="javascript:alert(3)">', 2),
      {},
      { before: `${attack}.x3d`, after: `<svg/onload=alert(4)>' & "after".x3d` },
    );
    expect(evil.changes.length).toBeGreaterThanOrEqual(3);
    const out = exportReportHtml(evil, {
      generatedAt: at,
      analyses: [
        { view: attack, object: attack, note: attack, rows: [[attack, attack]], limits: attack },
      ],
    });
    // Nothing from the files became markup: the page has only the report's own elements,
    // no event handler and no script.
    expect([...tags(out)].filter((tag) => !ALLOWED.has(tag))).toEqual([]);
    expect(out).not.toMatch(/<script|<img|<svg|<iframe|<b>/i);
    expect(out).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out.match(/<\/style>/g)).toHaveLength(1);
    expect(out.match(/<table/g)!.length).toBe(out.match(/<\/table>/g)!.length);
    // The text itself is all there, readable, as text.
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('&lt;svg/onload=alert(4)&gt;&#39; &amp; &quot;after&quot;.x3d');
    const body = text(out);
    expect(body).toContain(attack);
    expect(body).toContain('<iframe src="javascript:alert(3)">');
    expect(body).toContain('Title </title><script>a()</script>');
    expect(body).toContain('Duplicate DEF ' + attack);
    // Control characters cannot reach the page either.
    const control = compareX3D(before, after, {}, { before: 'a\u0000b\u001b[31m.x3d', after: 'c' });
    expect(exportReportHtml(control, { generatedAt: at })).not.toMatch(/[\u0000\u001b]/);
  });
});

describe('export file names', () => {
  it('names the exports after the two inputs', () => {
    const report = compareX3D(
      scene(''),
      scene(''),
      {},
      { before: 'part-v1.x3d', after: 'part-v2.X3D' },
    );
    expect(exportFileName(report, 'html')).toBe('part-v1__part-v2.x3diff.html');
    expect(exportFileName(report, 'json')).toBe('part-v1__part-v2.x3diff.json');
    expect(exportFileName(compareX3D(scene(''), scene('')), 'json')).toBe(
      'before__after.x3diff.json',
    );
  });

  it('keeps only what is safe in a file name', () => {
    expect(safeNamePart('Dolphin · neutral pose', 'before')).toBe('Dolphin-neutral-pose');
    expect(safeNamePart('../../etc/passwd', 'x')).toBe('etc-passwd');
    expect(safeNamePart('C:\\Users\\me\\scene final (2).xml', 'x')).toBe(
      'C-Users-me-scene-final-2',
    );
    expect(safeNamePart('a<b>:"c"|d?e*.x3d', 'x')).toBe('a-b-c-d-e');
    expect(safeNamePart('.hidden..x3d', 'x')).toBe('hidden');
    expect(safeNamePart('part__v1.x3d', 'x')).toBe('part_v1');
    expect(safeNamePart('modèle-日本.x3d', 'x')).toBe('modèle-日本');
    expect(safeNamePart('evil\u202Egnp.x3d\u0000', 'x')).toBe('evil-gnp');
    expect(safeNamePart('', 'before')).toBe('before');
    expect(safeNamePart('///', 'after')).toBe('after');
    expect(safeNamePart(undefined, 'after')).toBe('after');
    expect(safeNamePart('x'.repeat(300) + '.x3d', 'x')).toHaveLength(60);
    for (const name of ['a/b', 'a\\b', 'CON.x3d', '%00', 'a\nb', '"; rm -rf', '<x>'])
      expect(safeNamePart(name, 'x')).toMatch(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u);
  });
});
