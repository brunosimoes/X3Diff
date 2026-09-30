import { describe, it, expect } from 'vitest';
import { compareX3D } from '../src/diff/compare';
import { parseX3D, typedValue } from '../src/x3d/parse';
import { prescan, MAX_XML_DEPTH } from '../src/x3d/prescan';
import { readInput } from '../src/x3d/readInput';
const scene = (body: string) => '<X3D version="3.3"><Scene>' + body + '</Scene></X3D>';
const route = (name: string) =>
  '<ROUTE fromNode="' +
  name +
  '" fromField="translation_changed" toNode="C" toField="set_translation"/>';
const named = (name: string, reference: string) =>
  scene(
    '<Transform DEF="' + name + '"/><Transform DEF="C" translation="1 0 0"/>' + route(reference),
  );
describe('reference identity', () => {
  it('preserves valid ROUTEs across a DEF rename', () => {
    for (const [a, b] of [
      [named('A', 'A'), named('B', 'B')],
      [named('B', 'B'), named('A', 'A')],
    ])
      expect(compareX3D(a, b).changes.map((c) => c.kind)).toEqual(['nodeRenamed']);
  });
  it('reports breaking and repairing a dangling ROUTE symmetrically using original names', () => {
    const a = named('A', 'A'),
      b = named('B', 'A');
    for (const [before, after] of [
      [a, b],
      [b, a],
    ]) {
      const r = compareX3D(before, after);
      expect(r.summary.status).toBe('incomplete');
      expect(r.changes.map((c) => c.kind).sort()).toEqual(
        ['nodeRenamed', 'routeAdded', 'routeRemoved'].sort(),
      );
      expect(r.changes.find((c) => c.kind === 'routeRemoved')?.before?.value).toEqual([
        'A',
        'translation_changed',
        'C',
        'set_translation',
      ]);
    }
  });
  it('also distinguishes dangling USE from a resolved reference', () => {
    const a = scene('<Group DEF="A"/><Group USE="A"/>'),
      b = scene('<Group DEF="B"/><Group USE="A"/>');
    for (const [x, y] of [
      [a, b],
      [b, a],
    ])
      expect(compareX3D(x, y).changes.some((c) => c.kind === 'defUseChanged')).toBe(true);
  });
});
describe('typed values and namespaces', () => {
  it('rejects invalid rotations without inventing a change on self comparison', () => {
    const x = scene('<Transform rotation="0 0 0 0.5"/>');
    const r = compareX3D(x, x);
    expect(r.changes).toHaveLength(0);
    expect(r.summary.status).toBe('incomplete');
    expect(r.diagnostics.every((d) => d.code === 'INVALID_FIELD')).toBe(true);
    expect(() => typedValue('0 0 0 0.5', 'MFRotation')).toThrow('axis');
    expect(compareX3D(x, scene('<Transform/>')).changes).toHaveLength(1);
  });
  it.each(['2147483648', '-2147483649', '4294967296', '1.5', '1e2', '0b10'])(
    'rejects Int32 %s',
    (raw) => {
      expect(() => typedValue(raw, 'SFInt32')).toThrow();
      expect(() => typedValue('0 ' + raw, 'MFInt32')).toThrow();
    },
  );
  it.each([
    ['2147483647', 2147483647],
    ['-2147483648', -2147483648],
    ['0x10', 16],
    ['-0x10', -16],
  ])('accepts Int32 %s', (raw, value) => {
    expect(typedValue(String(raw), 'SFInt32').value).toBe(value);
  });
  it.each(['0x10', '0b10', 'Infinity', 'NaN'])('rejects non-decimal float %s', (raw) =>
    expect(() => typedValue(raw, 'SFFloat')).toThrow(),
  );
  it('ignores namespace declarations and schema hints, including on USE', () => {
    const r = parseX3D(
      scene(
        '<Group DEF="G"/><Group USE="G" xmlns:x="urn:test" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="local.xsd"/>',
      ),
      'before',
    );
    expect(r.diagnostics).toEqual([]);
  });
  it('does not alias foreign fields to native fields', () => {
    const r = parseX3D(scene('<Box xmlns:x="urn:test" x:size="3 2 2"/>'), 'before');
    expect(r.nodes[0].attrs.size.value).toEqual([2, 2, 2]);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNSUPPORTED_FIELD']);
  });
});
it('does not treat foreign node names as native X3D nodes', () => {
  const r = parseX3D(scene('<x:Box xmlns:x="urn:foreign"/>'), 'before');
  expect(r.diagnostics.some((d) => d.code === 'UNSUPPORTED_NODE')).toBe(true);
});
describe('bounded XML scanning', () => {
  it('accepts inert declaration text and brackets after a valid DOCTYPE', () => {
    const x =
      '<!DOCTYPE X3D SYSTEM "local[1].dtd"><!-- [ <!ENTITY harmless -->' +
      scene('<WorldInfo title="[ ]"/>');
    expect(prescan(x, 'before')).toEqual([]);
    expect(prescan(scene('<![CDATA[<!ENTITY harmless [ ]>]]>'), 'before')).toEqual([]);
  });
  it.each([
    '<!ENTITY x SYSTEM "file:///secret">',
    '<!DOCTYPE X3D [<!ENTITY x "bad">]>',
    '<!DOCTYPE X3D [',
    '<!DOCTYPE X3D>',
  ])('blocks declaration %s', (header) => {
    expect(parseX3D(header + scene(''), 'before').fatal).toBe(true);
  });
  it('accepts the depth boundary and rejects deeper documents before parsing', () => {
    const nested = (depth: number) => scene('<Group>'.repeat(depth) + '</Group>'.repeat(depth));
    expect(parseX3D(nested(MAX_XML_DEPTH - 2), 'before').fatal).toBe(false);
    for (const depth of [MAX_XML_DEPTH - 1, 5000]) {
      const r = compareX3D(nested(depth), scene(''));
      expect(r.summary.status).toBe('failed');
      expect(r.diagnostics.some((d) => d.code === 'DEPTH_LIMIT')).toBe(true);
    }
  });
  it('matches deep renamed structures without repeatedly escaping serialized children', () => {
    const a = scene(
      '<Group DEF="A">' +
        '<Group>'.repeat(80) +
        '<Shape><Box/></Shape>' +
        '</Group>'.repeat(80) +
        '</Group>',
    );
    const b = a.replace('DEF="A"', 'DEF="B"');
    expect(compareX3D(a, b).changes.map((c) => c.kind)).toEqual(['nodeRenamed']);
  });
});
describe('input encoding', () => {
  it('accepts UTF-8 and rejects declared or actual incompatible encoding', async () => {
    expect(await readInput(new File([scene('')], 'ok.x3d'))).toBe(scene(''));
    await expect(
      readInput(new File(['<?xml version="1.0" encoding="ISO-8859-1"?>' + scene('')], 'latin.x3d')),
    ).rejects.toThrow('UTF-8');
    await expect(
      readInput(new File([new Uint8Array([255, 254, 0, 60])], 'utf16.x3d')),
    ).rejects.toThrow('UTF-8');
  });
});
