import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { compareX3D } from '../src/diff/compare';
import { exportReportHtml } from '../src/report/export-html';
import {
  buildRegister,
  compactAgainst,
  foldGroup,
  groupChanges,
  numberPair,
  partLabel,
  summarizeChanges,
  valueText,
} from '../src/report/presentation';
import { sceneNames } from '../src/report/sceneNames';

const file = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');
const scene = (body: string) => `<X3D version="3.3"><Scene>${body}</Scene></X3D>`;
const names = (xml: string) =>
  sceneNames(new DOMParser().parseFromString(xml, 'application/xml') as never);
function register(before: string, after: string) {
  const report = compareX3D(before, after, {}, { before: 'a.x3d', after: 'b.x3d' });
  const sources = { before: names(before), after: names(after) };
  return { report, sources, entries: buildRegister(report.changes, sources) };
}
// The showpiece scenes are large: compare each once and share the result between tests.
const examples = new Map<string, ReturnType<typeof register>>();
function example(id: string) {
  if (!examples.has(id))
    examples.set(
      id,
      register(file(`public/examples/${id}/before.x3d`), file(`public/examples/${id}/after.x3d`)),
    );
  return examples.get(id)!;
}
vi.setConfig({ testTimeout: 30_000 });

describe('names for objects without a DEF', () => {
  const xml = scene(
    '<Transform DEF="Rack"><Transform><Shape><Box/></Shape></Transform><Transform><Shape><Cone/></Shape></Transform>' +
      '<Transform><Shape><Box/></Shape><Shape><Sphere/></Shape></Transform></Transform>' +
      '<Transform DEF="Bracket"><Transform><Shape><IndexedFaceSet/></Shape></Transform></Transform>' +
      '<Transform><Shape><Appearance><Material/></Appearance><Text/></Shape></Transform>' +
      '<Group><PointLight/><PointLight/></Group><Transform DEF="Empty"><Transform/></Transform>' +
      '<Fog><Shape><Box/></Shape></Fog>',
  );
  const name = names(xml);
  it('says what the object contains and where it sits, in the words of the geometry views', () => {
    expect(name('/X3D/Scene/Transform[1]')).toBe('Rack');
    expect(name('/X3D/Scene/Transform[1]/Transform[1]')).toBe('Box · shape 1 of 4 in Rack');
    expect(name('/X3D/Scene/Transform[1]/Transform[2]')).toBe('Cone · shape 2 of 4 in Rack');
    expect(name('/X3D/Scene/Transform[1]/Transform[3]')).toBe(
      '2 shapes (Box, Sphere) · shapes 3 to 4 of 4 in Rack',
    );
    expect(name('/X3D/Scene/Transform[2]/Transform[1]')).toBe('IndexedFaceSet in Bracket');
    expect(name('/X3D/Scene/Transform[2]/Transform[1]/Shape[1]')).toBe('IndexedFaceSet in Bracket');
    // Shapes inside content the previews leave out are not counted, as in the geometry views.
    expect(name('/X3D/Scene/Transform[3]')).toBe('Text · shape 6 of 6 in the file');
    expect(name('/X3D/Scene/Group[1]/PointLight[2]')).toBe('PointLight 2 of 2 in the file');
    expect(name('/X3D/Scene/Transform[4]/Transform[1]')).toBe('Transform in Empty');
    expect(name('/X3D/Scene/Nowhere[1]')).toBeUndefined();
  });
});

describe('register entries', () => {
  it('folds objects that changed the same way into one bundle, and loses no change', () => {
    for (const [id, objects, total] of [
      ['brickhaven', 28, 67],
      ['forgeworks', 31, 72],
    ] as const) {
      const { report, entries } = example(id);
      expect(report.changes).toHaveLength(total);
      const bundles = entries.filter((entry) => entry.kind === 'bundle');
      expect(bundles).toHaveLength(1);
      const [bundle] = bundles;
      expect(bundle.label).toBe(`${objects} materials changed the same way`);
      expect(bundle.description).toMatch(/^Diffuse color .+ → .+ · Emissive color .+ → .+$/);
      expect(bundle.groups).toHaveLength(objects);
      expect(bundle.changes).toHaveLength(objects * 2);
      // Every change is in exactly one entry, so the entries add up to the total.
      const listed = entries.flatMap((entry) => entry.changes.map((change) => change.id));
      expect(listed.slice().sort()).toEqual(report.changes.map((change) => change.id).sort());
      expect(entries.length).toBeLessThan(10);
      // No object is called by a bare running number.
      const labels = entries.flatMap((entry) =>
        entry.kind === 'bundle' ? entry.groups.map((group) => group.label) : [entry.label],
      );
      expect(labels.filter((label) => /^(Transform|Shape|Group) \d+$/.test(label))).toEqual([]);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels).toContain(id === 'brickhaven' ? 'Crate' : 'LegacyBinSlot');
    }
  });

  it('bundles only identical values, and only from three objects up', () => {
    const bricks = (colours: string[]) =>
      scene(
        colours
          .map(
            (colour) =>
              `<Transform><Shape><Appearance><Material diffuseColor="${colour}"/></Appearance><Box/></Shape></Transform>`,
          )
          .join(''),
      );
    const red = '1 0 0',
      blue = '0 0 1';
    const three = register(bricks([red, red, red, red]), bricks([blue, blue, blue, '0 1 0']));
    expect(three.entries.map((entry) => `${entry.kind}:${entry.changes.length}`)).toEqual([
      'bundle:3',
      'group:1',
    ]);
    expect(three.entries[0].label).toBe('3 materials changed the same way');
    expect(three.entries[1].label).toBe('Box · shape 4 of 4 in the file');
    const two = register(bricks([red, red, red]), bricks([blue, blue, red]));
    expect(two.entries.map((entry) => entry.kind)).toEqual(['group', 'group']);
    // Added and removed objects are never "the same change": their contents are not compared.
    const added = register(bricks([]), bricks([red, red, red]));
    expect(added.entries.every((entry) => entry.kind === 'group')).toBe(true);
  });

  it('keeps small pairs as they were, with better names', () => {
    const { entries } = example('fitlab');
    expect(entries.map((entry) => entry.label)).toEqual([
      'SupportSlot',
      'SensorSlot',
      'HousingPlacement',
      'Scene',
      'WorldInfo',
    ]);
    const objects = register(
      file('public/examples/HelloWorld.x3d'),
      file('public/examples/HelloWorld-edited.x3d'),
    );
    expect(objects.entries.map((entry) => entry.label)).toEqual([
      'DemoObject',
      'Cylinder · shape 2 of 2 in the file',
    ]);
    // Without scene data, labels use node types and ordinals.
    expect(groupChanges(objects.report.changes).map((group) => group.label)).toEqual([
      'DemoObject',
      'Transform 2',
    ]);
  });
});

describe('one-line summary', () => {
  const part = (size: string, colour: string, y: number, extra = '') =>
    scene(
      `<Transform DEF="Bracket" translation="0 ${y} 0"><Shape><Appearance><Material diffuseColor="${colour}"/></Appearance><Box size="${size}"/></Shape></Transform>${extra}`,
    );
  it('counts objects in plain words', () => {
    const washer = '<Transform DEF="Washer"><Shape><Sphere/></Shape></Transform>';
    expect(
      summarizeChanges(
        compareX3D(part('2 1 1', '0 0 1', 0), part('2.4 1 1', '1 0 0', 0.25, washer)).changes,
      ),
    ).toBe('1 object resized, 1 recoloured, 1 moved, 1 added.');
    expect(
      summarizeChanges(
        compareX3D(part('2 1 1', '0 0 1', 0, washer), part('2 1 1', '0 0 1', 0)).changes,
      ),
    ).toBe('1 object removed.');
    expect(summarizeChanges([])).toBe('');
  });
  it('covers the examples and what is not an object', () => {
    expect(summarizeChanges(example('brickhaven').report.changes)).toBe(
      '1 object resized, 28 recoloured, 1 added, 1 removed; 1 animation setting changed, 1 title or document detail changed.',
    );
    expect(summarizeChanges(example('forgeworks').report.changes)).toBe(
      '31 objects recoloured, 1 added, 1 removed; 2 animation settings changed, 2 title or document details changed.',
    );
    expect(summarizeChanges(example('fitlab').report.changes)).toBe(
      '1 object moved, 1 rotated, 1 added, 1 removed; 2 title or document details changed.',
    );
    expect(
      summarizeChanges(
        compareX3D(file('fixtures/lights/before.x3d'), file('fixtures/lights/after.x3d')).changes,
      ),
    ).toBe('5 light settings changed, 1 reference changed.');
    expect(
      summarizeChanges(
        compareX3D(file('fixtures/dolphin/before.x3d'), file('fixtures/dolphin/after.x3d')).changes,
      ),
    ).toBe(
      '1 object reshaped; 2 Inline removed, 1 Switch removed, 3 title or document details changed.',
    );
  });
});

describe('the printable report lists a bundle in full', () => {
  it('names every object and every change id, with the summary line', () => {
    const { report, sources } = example('brickhaven');
    const html = exportReportHtml(report, { generatedAt: new Date(0), names: sources });
    expect(html.match(/data-change="/g)).toHaveLength(report.changes.length);
    for (const change of report.changes) expect(html).toContain(`data-change="${change.id}"`);
    expect(html).toContain(
      '<p class="summary" id="summary-line">1 object resized, 28 recoloured, 1 added, 1 removed;',
    );
    expect(html).toContain(
      '<h3>28 materials changed the same way <small>56 differences</small></h3>',
    );
    expect(html).toContain('Material · Diffuse color · each of 28');
    expect(html.match(/<li>/g)).toHaveLength(28);
    expect(html).toContain('<li>Cylinder · shape 43 of 129 in Station <small>');
    expect(html).not.toMatch(/Transform \d+/);
  });
});

describe('identical changes inside one object', () => {
  const rack = (colours: string[], lid = 1) =>
    scene(
      `<Transform DEF="Rack">${colours
        .map(
          (colour, i) =>
            `<Shape><Appearance><Material diffuseColor="${colour}"/></Appearance><Box size="${1 + (i % 3)} 1 1"/></Shape>`,
        )
        .join(
          '',
        )}</Transform><Transform DEF="Lid" translation="0 ${lid} 0"><Shape><Sphere/></Shape></Transform>`,
    );
  const red = '1 0 0',
    blue = '0 0 1';
  const many = (colour: string, count = 24) => Array.from({ length: count }, () => colour);

  it('folds them into one line and keeps every change behind it', () => {
    const { report, sources, entries } = register(rack(many(red)), rack(many(blue), 2));
    expect(report.changes).toHaveLength(25);
    expect(entries.map((entry) => `${entry.kind}:${entry.label}:${entry.changes.length}`)).toEqual([
      'group:Rack:24',
      'group:Lid:1',
    ]);
    const [group] = entries;
    if (group.kind !== 'group') throw new Error('expected a group');
    const items = foldGroup(group);
    expect(items).toHaveLength(1);
    const [fold] = items;
    if (fold.kind !== 'fold') throw new Error('expected a fold');
    expect(fold.label).toBe('24 materials changed the same way');
    expect(fold.description).toBe('Diffuse color 1 · 0 · 0 → 0 · 0 · 1');
    // Every change is behind the line exactly once, and each names its own shape.
    expect(fold.changes.map((change) => change.id).sort()).toEqual(
      group.changes.map((change) => change.id).sort(),
    );
    expect(partLabel(fold.changes[2], sources)).toBe('Box · shape 3 of 24 in Rack');
    expect(new Set(fold.changes.map((change) => partLabel(change, sources))).size).toBe(24);
    // The printable report still lists each of them.
    const html = exportReportHtml(report, { generatedAt: new Date(0), names: sources });
    expect(html.match(/data-change="/g)).toHaveLength(25);
    for (const change of report.changes) expect(html).toContain(`data-change="${change.id}"`);
  });

  it('folds only identical values, from three up, and leaves the other rows in place', () => {
    const before = rack([red, red, red, red, red, '0 1 0']);
    const after = rack([blue, blue, '1 1 0', blue, '1 1 1', '0 1 1'], 2);
    const { entries } = register(before, after);
    const group = entries.find((entry) => entry.label === 'Rack');
    if (group?.kind !== 'group') throw new Error('expected a group');
    const items = foldGroup(group);
    expect(
      items.map((item) => (item.kind === 'fold' ? `fold:${item.changes.length}` : 'row')),
    ).toEqual(['fold:3', 'row', 'row', 'row']);
    expect(
      items
        .flatMap((item) => (item.kind === 'fold' ? item.changes : [item.change]))
        .map((c) => c.id)
        .sort(),
    ).toEqual(group.changes.map((change) => change.id).sort());
    // Two alike are listed one by one.
    const two = register(rack([red, red, '0 1 0']), rack([blue, blue, '0 1 1']));
    const pair = two.entries.find((entry) => entry.label === 'Rack');
    if (pair?.kind !== 'group') throw new Error('expected a group');
    expect(foldGroup(pair).every((item) => item.kind === 'row')).toBe(true);
  });

  it('changes nothing in the bundled examples', () => {
    const pairs = [
      example('brickhaven'),
      example('forgeworks'),
      example('fitlab'),
      register(
        file('public/examples/HelloWorld.x3d'),
        file('public/examples/HelloWorld-edited.x3d'),
      ),
      register(file('fixtures/dolphin/before.x3d'), file('fixtures/dolphin/after.x3d')),
    ];
    for (const { entries } of pairs)
      for (const entry of entries)
        if (entry.kind === 'group')
          expect(foldGroup(entry).every((item) => item.kind === 'row')).toBe(true);
  });
});

describe('small changes at a tight tolerance', () => {
  it('writes two different numbers with enough digits to differ', () => {
    expect(numberPair(2, 2.000004)).toEqual(['2', '2.000004']);
    expect(numberPair(0.1234561, 0.1234569)).toEqual(['0.123456', '0.123457']);
    expect(numberPair(1e-9, 2e-9)).toEqual(['1e-9', '2e-9']);
    // Five significant digits suffice for distinct values and equal pairs.
    expect(numberPair(0.8, 1)).toEqual(['0.8', '1']);
    expect(numberPair(1 / 3, 2 / 3)).toEqual(['0.33333', '0.66667']);
    expect(numberPair(1 / 3, 1 / 3)).toEqual(['0.33333', '0.33333']);
    expect(compactAgainst([1, 0.5, 2], [1, 0.5, 2.000004])).toBe('1 · 0.5 · 2');
    expect(compactAgainst([1, 0.5, 2.000004], [1, 0.5, 2])).toBe('1 · 0.5 · 2.000004');
    expect(compactAgainst('text', 3)).toBe('text');
    expect(compactAgainst(1 / 3, undefined)).toBe('0.33333');
  });

  it('shows them in the register values and the printable report', () => {
    const part = (x: string) =>
      scene(
        `<Transform DEF="Part" translation="${x} 0 0"><Shape><Box size="${x} 1 1"/></Shape></Transform><Shape><Sphere radius="${x}"/></Shape>`,
      );
    const report = compareX3D(part('2'), part('2.000004'), { vectorAbs: 1e-6 });
    expect(report.changes).toHaveLength(3);
    for (const change of report.changes) {
      const [before, after] = [valueText(change, 'before'), valueText(change, 'after')];
      expect(before).not.toBe(after);
      expect(before).toMatch(/^(X )?2( |$)/);
      expect(after).toMatch(/^(X )?2\.000004( |$)/);
    }
    const html = exportReportHtml(report, { generatedAt: new Date(0) });
    expect(html).toContain('X 2.000004 · Y 1 · Z 1');
    expect(html).toContain('2.000004 (+0.000004)');
  });
});
