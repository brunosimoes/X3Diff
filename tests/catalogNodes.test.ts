import { describe, it, expect } from 'vitest';
import { compareX3D } from '../src/diff/compare';
import { catalog } from '../src/x3d/catalog';
import { typedValue } from '../src/x3d/parse';

const scene = (body: string) => `<X3D version="3.3"><Scene>${body}</Scene></X3D>`;
const diff = (before: string, after: string) => compareX3D(scene(before), scene(after));
const kinds = (r: ReturnType<typeof compareX3D>) =>
  r.changes.map((c) => `${c.category}:${c.kind}:${c.field ?? ''}`);

describe('catalogued node types', () => {
  it('covers 50 nodes, including the most common ones in real files', () => {
    expect(Object.keys(catalog)).toHaveLength(50);
    for (const name of [
      'Billboard',
      'Collision',
      'Color',
      'Cone',
      'Extrusion',
      'IndexedLineSet',
      'IntegerSequencer',
      'LOD',
      'NavigationInfo',
      'PixelTexture',
      'PositionInterpolator',
      'TextureTransform',
    ])
      expect(catalog).toHaveProperty(name);
  });

  it('compares a Cone as geometry', () => {
    const r = diff(
      '<Shape><Cone bottomRadius="1" height="2"/></Shape>',
      '<Shape><Cone bottomRadius="1" height="3"/></Shape>',
    );
    expect(r.summary.status).toBe('complete');
    expect(kinds(r)).toEqual(['geometry:geometryChanged:height']);
  });

  it('reports an edited position animation instead of skipping it', () => {
    const route = (reach: number) =>
      `<Transform DEF="T"/><TimeSensor DEF="C" loop="true"/>` +
      `<PositionInterpolator DEF="P" key="0 1" keyValue="0 0 0 ${reach} 0 0"/>` +
      `<ROUTE fromNode="C" fromField="fraction_changed" toNode="P" toField="set_fraction"/>` +
      `<ROUTE fromNode="P" fromField="value_changed" toNode="T" toField="set_translation"/>`;
    const r = diff(route(2), route(5));
    expect(r.summary.status).toBe('complete');
    expect(kinds(r)).toEqual(['behavior:animationConfigChanged:keyValue']);
  });

  it('files navigation, sequencer, texture and vertex-colour edits under readable categories', () => {
    expect(kinds(diff('<NavigationInfo speed="1"/>', '<NavigationInfo speed="4"/>'))).toEqual([
      'viewpoint:viewpointChanged:speed',
    ]);
    expect(
      kinds(
        diff(
          '<IntegerSequencer key="0 1" keyValue="0 1"/>',
          '<IntegerSequencer key="0 1" keyValue="0 2"/>',
        ),
      ),
    ).toEqual(['behavior:animationConfigChanged:keyValue']);
    const textured = (scale: string) =>
      `<Shape><Appearance><TextureTransform scale="${scale}"/></Appearance><Box/></Shape>`;
    expect(kinds(diff(textured('1 1'), textured('2 1')))).toEqual([
      'texture:appearanceChanged:scale',
    ]);
    const lines = (color: string) =>
      `<Shape><IndexedLineSet coordIndex="0 1 -1"><Coordinate point="0 0 0 1 0 0"/><Color color="${color}"/></IndexedLineSet></Shape>`;
    expect(kinds(diff(lines('1 0 0 0 1 0'), lines('1 0 0 0 0 1')))).toEqual([
      'appearance:appearanceChanged:color',
    ]);
  });

  it('reads Extrusion with the corrected field types', () => {
    const extrusion = (attrs: string) => `<Shape><Extrusion ${attrs}/></Shape>`;
    const same = diff(
      extrusion('creaseAngle="0.5" spine="0 0 0 0 1 0"'),
      extrusion('creaseAngle="5e-1" spine="0 0 0, 0 1 0"'),
    );
    expect(same.summary.status).toBe('complete');
    expect(same.changes).toHaveLength(0);
    // The defaults count: an omitted spine is the default spine.
    expect(
      diff(extrusion(''), extrusion('spine="0 0 0 0 1 0" beginCap="true"')).changes,
    ).toHaveLength(0);
    expect(kinds(diff(extrusion('spine="0 0 0 0 1 0"'), extrusion('spine="0 0 0 0 2 0"')))).toEqual(
      ['geometry:geometryChanged:spine'],
    );
  });

  it('reads lists of booleans', () => {
    expect(typedValue('true false, true', 'MFBool').value).toEqual([true, false, true]);
    expect(typedValue('', 'MFBool').value).toEqual([]);
    expect(() => typedValue('true FALSE', 'MFBool')).toThrow('MFBool');
    const flags = (value: string) =>
      `<WorldInfo><MetadataBoolean name="flags" value="${value}"/></WorldInfo>`;
    const r = diff(flags('true false'), flags('true true'));
    expect(r.summary.status).toBe('complete');
    expect(kinds(r)).toEqual(['metadata:metadataChanged:value']);
    expect(diff(flags('true false'), flags('true  false')).changes).toHaveLength(0);
  });

  it('reads embedded images and compares their pixels exactly', () => {
    expect(typedValue('2 1 3 0xFF0000 0x00FF00', 'SFImage').value).toEqual([
      2, 1, 3, 0xff0000, 0x00ff00,
    ]);
    expect(typedValue('0 0 0', 'SFImage').value).toEqual([0, 0, 0]);
    for (const bad of [
      '2 1 3 0xFF0000',
      '2 1',
      '1 1 7 0',
      '1 1 1 -1',
      '1 1 1 0.5',
      '1 1 0 0',
      '1 1 1 256',
      '1 1 2 65536',
      '1 1 3 16777216',
    ])
      expect(() => typedValue(bad, 'SFImage')).toThrow();
    const pixels = (image: string) =>
      `<Shape><Appearance><PixelTexture image="${image}"/></Appearance><Box/></Shape>`;
    // One step in one channel is a difference; number tolerances do not apply to pixels.
    const r = diff(pixels('2 1 3 0xFF0000 0x00FF00'), pixels('2 1 3 0xFF0001 0x00FF00'));
    expect(r.summary.status).toBe('complete');
    expect(kinds(r)).toEqual(['texture:appearanceChanged:image']);
    expect(
      diff(pixels('2 1 3 0xFF0000 0x00FF00'), pixels('2 1 3 16711680 65280')).changes,
    ).toHaveLength(0);
    expect(
      diff(pixels('2 1 3 0xFF0000'), pixels('2 1 3 0xFF0000')).diagnostics.map((d) => d.code),
    ).toEqual(['INVALID_FIELD', 'INVALID_FIELD']);
  });

  it('still marks what remains outside the catalog', () => {
    const r = diff('<Fog/><Cone/>', '<Fog/><Cone/>');
    expect(r.summary.status).toBe('incomplete');
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      'Fog is opaque',
      'Fog is opaque',
    ]);
  });
});
