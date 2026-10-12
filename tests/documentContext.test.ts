import { describe, expect, it } from 'vitest';
import { compareX3D } from '../src/diff/compare';
import { propertyLabel, valueText } from '../src/report/presentation';

const scene = (body: string, head = '') =>
  `<X3D version="3.3" profile="Interchange"><head>${head}</head><Scene>${body}</Scene></X3D>`;
const part = '<Shape DEF="Part"><Box/></Shape>';

describe('scene hierarchy and document context', () => {
  it('reports a named object moving between parents with different placement', () => {
    const before = scene(
      `<Transform DEF="A" translation="10 0 0">${part}</Transform><Transform DEF="B"/>`,
    );
    const after = scene(
      `<Transform DEF="A" translation="10 0 0"/><Transform DEF="B">${part}</Transform>`,
    );
    for (const [a, b] of [
      [before, after],
      [after, before],
    ]) {
      const changes = compareX3D(a, b).changes;
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        kind: 'nodeMoved',
        field: 'parent',
        beforeNode: { defName: 'Part' },
      });
      expect(propertyLabel(changes[0])).toBe('Parent');
      expect(new Set([valueText(changes[0], 'before'), valueText(changes[0], 'after')])).toEqual(
        new Set(['A', 'B']),
      );
    }
  });

  it('keeps descendants with a reordered or renamed parent', () => {
    const before = scene(`<Group DEF="A">${part}</Group><Group DEF="B"/>`);
    const reordered = scene(`<Group DEF="B"/><Group DEF="A">${part}</Group>`);
    const renamed = scene(`<Group DEF="C">${part}</Group><Group DEF="B"/>`);
    expect(
      compareX3D(before, reordered).changes.filter((c) => c.kind === 'nodeMoved'),
    ).toHaveLength(0);
    expect(compareX3D(before, renamed).changes.map((c) => c.kind)).toEqual(['nodeRenamed']);
  });

  it('reports moving a named object to and from the scene root', () => {
    const nested = scene(`<Group DEF="A">${part}</Group>`);
    const root = scene(`<Group DEF="A"/>${part}`);
    for (const [a, b] of [
      [nested, root],
      [root, nested],
    ])
      expect(compareX3D(a, b).changes).toMatchObject([{ kind: 'nodeMoved', field: 'parent' }]);
  });

  it('does not call matching geometry inside removed and added objects a verified move', () => {
    const before = scene(
      '<Shape DEF="Removed"><Appearance><Material diffuseColor="1 0 0"/></Appearance><Box/></Shape>',
    );
    const after = scene(
      '<Group/><Shape DEF="Added"><Appearance><Material diffuseColor="0 1 0"/></Appearance><Box/></Shape>',
    );
    expect(compareX3D(before, after).changes.filter((c) => c.kind === 'nodeMoved')).toHaveLength(0);
  });

  it('compares component requirements regardless of declaration order or numeric spelling', () => {
    const a = '<component name="Geometry3D" level="1"/><component name="Rendering" level="3"/>';
    const equal =
      '<component name="Rendering" level="3"/><component name="Geometry3D" level="01"/>';
    const changed =
      '<component name="Rendering" level="3"/><component name="Geometry3D" level="4"/>';
    expect(compareX3D(scene(part, a), scene(part, equal)).changes).toHaveLength(0);
    const report = compareX3D(scene(part, a), scene(part, changed));
    expect(report.changes).toMatchObject([{ kind: 'documentContextChanged', field: 'components' }]);
    expect(valueText(report.changes[0], 'before')).toContain('Geometry3D: level 1');
    expect(valueText(report.changes[0], 'after')).toContain('Geometry3D: level 4');
  });

  it('diagnoses unsupported unit declarations rather than asserting a complete comparison', () => {
    const before = scene(part, '<unit category="length" name="metre" conversionFactor="1"/>');
    const after = scene(
      part,
      '<unit category="length" name="millimetre" conversionFactor="0.001"/>',
    );
    const report = compareX3D(before, after);
    expect(report.summary.status).toBe('incomplete');
    expect(report.summary.unsupportedCount).toBe(2);
    expect(report.diagnostics).toMatchObject([
      { code: 'UNSUPPORTED_NODE', side: 'before', path: '/X3D/head/unit[1]' },
      { code: 'UNSUPPORTED_NODE', side: 'after', path: '/X3D/head/unit[1]' },
    ]);
    expect(report.changes).toHaveLength(0);
  });
});
