import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareX3D } from '../src/diff/compare';
import { exportReportJson } from '../src/report/export-json';
import { coverageLines, describeCoverage } from '../src/report/coverage';
import type { X3DiffReport } from '../src/report/schema';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${p}`, import.meta.url)), 'utf8');
const scene = (body: string) => `<X3D version="3.3"><Scene>${body}</Scene></X3D>`;
const names = { before: 'before.x3d', after: 'after.x3d' };

describe('incomplete comparisons keep what was compared and say what was not', () => {
  const report = compareX3D(read('incomplete/before.x3d'), read('incomplete/after.x3d'), {}, names);

  it('does not compare prototype internals or mix their DEF scope into the scene', () => {
    const body = (x: number) =>
      scene(
        `<ProtoDeclare name="Unused"><ProtoBody><Transform DEF="Shared" translation="${x} 0 0"/></ProtoBody></ProtoDeclare>` +
          '<Transform DEF="Shared" translation="3 0 0"/>',
      );
    const result = compareX3D(body(1), body(2));
    expect(result.summary.status).toBe('incomplete');
    expect(result.changes).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_DEF')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'UNSUPPORTED_NODE')).toBe(true);
  });

  it('reports supported changes beside an uncatalogued node', () => {
    expect(report.summary.status).toBe('incomplete');
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.changes.some((c) => c.field === 'translation')).toBe(true);
    expect(report.changes.some((c) => c.kind === 'nodeAdded')).toBe(true);
  });

  it('does not report the difference inside the uncatalogued node', () => {
    // Fog.visibilityRange differs between the two files and must not look compared.
    expect(JSON.stringify(report.changes)).not.toContain('Fog');
    // NavigationInfo is catalogued, so its edit is an ordinary difference.
    expect(report.changes.find((c) => c.field === 'speed')).toMatchObject({
      category: 'viewpoint',
      before: { value: 1 },
      after: { value: 4 },
    });
  });

  it('lists skipped node types per file, without repeating their settings', () => {
    const coverage = describeCoverage(report);
    expect(coverage).toMatchObject({ partial: true, comparedNothing: false });
    expect(coverage.items).toEqual([
      { side: 'before', kind: 'node', subject: 'Fog', count: 1 },
      { side: 'after', kind: 'node', subject: 'Fog', count: 1 },
    ]);
    expect(coverageLines(coverage, names)).toEqual([
      'Before file (before.x3d): 1 element of unsupported type (Fog × 1)',
      'After file (after.x3d): 1 element of unsupported type (Fog × 1)',
    ]);
  });

  it('carries the same status and list in the exported JSON, using schema 1.0 fields only', () => {
    const exported = JSON.parse(exportReportJson(report)) as X3DiffReport;
    expect(exported.schemaVersion).toBe('1.0');
    expect(Object.keys(exported).sort()).toEqual(
      [
        'catalog',
        'changes',
        'config',
        'diagnostics',
        'inputs',
        'schemaVersion',
        'summary',
        'toolVersion',
      ].sort(),
    );
    expect(Object.keys(exported.summary).sort()).toEqual(
      ['countsByKind', 'countsBySeverity', 'status', 'unsupportedCount'].sort(),
    );
    expect(exported.summary.status).toBe('incomplete');
    expect(exported.summary.unsupportedCount).toBeGreaterThan(0);
    expect(
      exported.diagnostics
        .filter((d) => d.code === 'UNSUPPORTED_NODE')
        .map((d) => [d.side, d.message, d.path]),
    ).toEqual([
      [
        'before',
        'Fog is opaque; its fields were not compared: color, visibilityRange',
        '/X3D/Scene/Fog[1]',
      ],
      [
        'after',
        'Fog is opaque; its fields were not compared: color, visibilityRange',
        '/X3D/Scene/Fog[1]',
      ],
    ]);
    expect(describeCoverage(exported)).toEqual(describeCoverage(report));
  });

  it('reports one skipped element as one diagnostic, with its fields inside', () => {
    const fog = scene('<Fog DEF="Mist" color="1 1 1" fogType="LINEAR" visibilityRange="30"/>');
    const result = compareX3D(fog, scene('<Fog/>'));
    expect(result.diagnostics).toEqual([
      {
        code: 'UNSUPPORTED_NODE',
        severity: 'warning',
        side: 'before',
        message: 'Fog is opaque; its fields were not compared: color, fogType, visibilityRange',
        path: '/X3D/Scene/Fog[1]',
      },
      {
        code: 'UNSUPPORTED_NODE',
        severity: 'warning',
        side: 'after',
        message: 'Fog is opaque',
        path: '/X3D/Scene/Fog[1]',
      },
    ]);
    expect(result.summary.unsupportedCount).toBe(2);
    expect(describeCoverage(result).items).toEqual([
      { side: 'before', kind: 'node', subject: 'Fog', count: 1 },
      { side: 'after', kind: 'node', subject: 'Fog', count: 1 },
    ]);
    // Settings of a skipped node do not count as additional coverage gaps.
    const overlapping = structuredClone(result);
    overlapping.diagnostics = [
      { code: 'UNSUPPORTED_NODE', severity: 'warning', side: 'before', message: 'Fog is opaque' },
      {
        code: 'UNSUPPORTED_FIELD',
        severity: 'warning',
        side: 'before',
        message: 'Fog.color is opaque',
      },
      { code: 'UNSUPPORTED_NODE', severity: 'warning', side: 'after', message: 'Fog is opaque' },
    ];
    expect(describeCoverage(overlapping)).toEqual(describeCoverage(result));
  });

  it('counts repeated elements and lists unsupported settings on known nodes', () => {
    const a = scene('<Fog/><Fog/><Box experimentalValue="one"/>');
    const coverage = describeCoverage(compareX3D(a, scene('<Box/>')));
    expect(coverage.items).toEqual([
      { side: 'before', kind: 'node', subject: 'Fog', count: 2 },
      { side: 'before', kind: 'field', subject: 'Box.experimentalValue', count: 1 },
    ]);
    expect(coverageLines(coverage)).toEqual([
      'Before file: 2 elements of unsupported type (Fog × 2); 1 unsupported setting (Box.experimentalValue × 1)',
    ]);
  });

  it('lists invalid declarations and uncertain matches', () => {
    const invalid = describeCoverage(
      compareX3D(scene('<Box solid="false"/>'), scene('<Box solid="FALSE"/>')),
    );
    expect(invalid.partial).toBe(true);
    expect(invalid.items).toHaveLength(1);
    expect(invalid.items[0]).toMatchObject({ side: 'after', kind: 'problem', count: 1 });

    const uncertain = describeCoverage(
      compareX3D(
        scene('<TimeSensor DEF="A"/><TimeSensor DEF="B"/>'),
        scene('<TimeSensor DEF="C"/><TimeSensor DEF="D"/>'),
      ),
    );
    expect(uncertain.items).toEqual([{ kind: 'uncertain', subject: 'identity', count: 2 }]);
    expect(coverageLines(uncertain)).toEqual([
      '2 objects could not be matched between the files with confidence',
    ]);
  });

  it('is not partial for a complete report', () => {
    const complete = compareX3D(scene('<Box size="1 1 1"/>'), scene('<Box size="2 1 1"/>'));
    expect(describeCoverage(complete)).toEqual({
      partial: false,
      comparedNothing: false,
      items: [],
    });
  });

  it('marks failed reads and version boundaries as nothing compared', () => {
    const failed = compareX3D(scene('<Shape>'), scene('<Shape/>'));
    expect(failed.changes).toHaveLength(0);
    expect(describeCoverage(failed)).toMatchObject({ partial: true, comparedNothing: true });
    const version = compareX3D(
      read('version/before.x3d'),
      read('version/after.x3d').replace("version='4.0'", "version='5.0'"),
    );
    expect(version.changes).toHaveLength(0);
    expect(describeCoverage(version)).toMatchObject({ partial: true, comparedNothing: true });
  });
});
