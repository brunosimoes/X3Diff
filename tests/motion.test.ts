import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { motionFacts } from '../src/report/motionFacts';
import {
  compareMotion,
  readMotionScene,
  objectBox,
  MOTION_SAMPLES,
  MAX_MOTION_OBJECTS,
} from '../src/viewer/motion';

const parse = (xml: string) =>
  readMotionScene(new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document);
const scene = (body: string) => parse(`<X3D version="3.3"><Scene>${body}</Scene></X3D>`);
const example = (name: string, side: string) =>
  parse(
    readFileSync(
      fileURLToPath(new URL(`../public/examples/${name}/${side}.x3d`, import.meta.url)),
      'utf8',
    ),
  );

/** A box that slides along X and back, driven by a clock. */
const slider = (reach: number, cycle = 4, extra = '') =>
  `<Transform DEF="Slider"${extra}><Shape><Box size="1 1 1"/></Shape></Transform>` +
  `<TimeSensor DEF="Clock" cycleInterval="${cycle}" loop="true"/>` +
  `<PositionInterpolator DEF="Move" key="0 0.5 1" keyValue="0 0 0 ${reach} 0 0 0 0 0"/>` +
  `<ROUTE fromNode="Clock" fromField="fraction_changed" toNode="Move" toField="set_fraction"/>` +
  `<ROUTE fromNode="Move" fromField="value_changed" toNode="Slider" toField="set_translation"/>`;
/** A box turning about the Y axis, optionally offset from the axis by a parent arm. */
const spinner = (cycle: number, arm = 0) =>
  `<Transform DEF="Turntable"><Transform translation="${arm} 0 0"><Shape><Box size="2 1 1"/></Shape></Transform></Transform>` +
  `<TimeSensor DEF="Clock" cycleInterval="${cycle}" loop="true"/>` +
  `<OrientationInterpolator DEF="Turn" key="0 0.25 0.5 0.75 1" keyValue="0 1 0 0 0 1 0 1.5708 0 1 0 3.1416 0 1 0 4.7124 0 1 0 6.2832"/>` +
  `<ROUTE fromNode="Clock" fromField="fraction_changed" toNode="Turn" toField="set_fraction"/>` +
  `<ROUTE fromNode="Turn" fromField="value_changed" toNode="Turntable" toField="set_rotation"/>`;

describe('motion paths', () => {
  it('reports measured gaps with their time, tracking point and sampling boundary', () => {
    const pairs = compareMotion(scene(slider(2)), scene(slider(5)));
    const [facts] = motionFacts(pairs);
    expect(facts.object).toBe('Slider');
    expect(facts.rows).toContainEqual([
      'Path length per cycle, before → after (scene units)',
      '4 → 10',
    ]);
    expect(facts.rows).toContainEqual(['Largest gap at the same moment', '3 scene units, at 2 s']);
    expect(facts.rows).toContainEqual(['Point followed', 'centre of the object']);
    expect(facts.limits).toContain('240 sampling intervals');
    expect(motionFacts(pairs, 0)).toEqual([]);
  });

  it('does not export rounding noise as a motion difference', () => {
    const [pair] = compareMotion(scene(slider(2)), scene(slider(2)));
    pair.gapByTime = pair.gapByTime.map(() => pair.size * 1e-8);
    pair.gapByPhase = pair.gapByPhase.map(() => pair.size * 1e-8);
    const [facts] = motionFacts([pair]);
    expect(facts.rows).toContainEqual(['Largest gap at the same moment', '0']);
    expect(facts.rows).toContainEqual(['Average gap at the same moment', '0']);
    expect(facts.rows).toContainEqual([
      'Largest gap at the same point of the cycle',
      '0: the route is the same, only the timing differs',
    ]);
  });

  it('follows a PositionInterpolator and measures the gap between two reaches', () => {
    const [pair] = compareMotion(scene(slider(2)), scene(slider(5)));
    expect(pair.def).toBe('Slider');
    expect(pair.point).toBe('centre');
    expect(pair.changed).toBe(true);
    expect(pair.before!.cycle).toBe(4);
    expect(pair.before!.length).toBeCloseTo(4, 5); // out 2 and back 2
    expect(pair.after!.length).toBeCloseTo(10, 5);
    // Furthest apart at the turning point, half-way through: 5 − 2.
    const max = Math.max(...pair.gapByTime);
    expect(max).toBeCloseTo(3, 5);
    expect(pair.gapByTime.indexOf(max)).toBe(MOTION_SAMPLES / 2);
    expect(pair.gapByTime[0]).toBeCloseTo(0, 9);
    expect(pair.before!.byTime[MOTION_SAMPLES / 2].x).toBeCloseTo(2, 9);
  });

  it('reports identical animation as unchanged', () => {
    const [pair] = compareMotion(scene(slider(2)), scene(slider(2)));
    expect(pair.changed).toBe(false);
    expect(Math.max(...pair.gapByTime, ...pair.gapByPhase)).toBe(0);
  });

  it('preserves local bounds when a parent is scaled to zero at the start', () => {
    const model = scene(
      '<Transform DEF="Root" scale="0 0 0"><Transform translation="2 0 0"><Shape><Box size="4 2 2"/></Shape></Transform></Transform>',
    );
    const bounds = objectBox(model, model.transforms.get('Root')!);
    expect(bounds.min.toArray()).toEqual([0, -1, -1]);
    expect(bounds.max.toArray()).toEqual([4, 1, 1]);
  });

  it('detects rotation changes even when the centre also translates', () => {
    const moving = slider(2) + spinner(4).replaceAll('Turntable', 'Slider');
    // Share one Transform and clock between its translation and rotation channels.
    const body = moving
      .replace(/<Transform DEF="Slider"><Transform[\s\S]*?<\/Transform><\/Transform>/, '')
      .replace('<TimeSensor DEF="Clock" cycleInterval="4" loop="true"/>', '');
    const after = body.replaceAll('0 1 0 ', '1 0 0 ');
    const [pair] = compareMotion(scene(body), scene(after));
    expect(pair.changed).toBe(true);
    expect(Math.max(...pair.gapByTime)).toBeGreaterThan(0.1);
  });

  it('does not miss a rotation whose axis passes through the default bounds corner', () => {
    const before = spinner(4).replaceAll('0 1 0 ', '1 0.5 0.5 ');
    const after = before.replace('1.5708', '0.3');
    const [pair] = compareMotion(scene(before), scene(after));
    expect(pair.changed).toBe(true);
    expect(Math.max(...pair.gapByTime)).toBeGreaterThan(0.1);
  });

  it('keeps a disabled clock static', () => {
    const disabled = slider(2).replace('<TimeSensor ', '<TimeSensor enabled="false" ');
    const [pair] = compareMotion(scene(disabled), scene(slider(2)));
    expect(pair.before!.cycle).toBe(0);
    expect(pair.before!.length).toBe(0);
    expect(pair.changed).toBe(true);
  });

  it('does not treat declarations inside an uninstantiated prototype as scene motion', () => {
    const prototype = (reach: number) =>
      `<ProtoDeclare name="Unused"><ProtoBody>${slider(reach)}</ProtoBody></ProtoDeclare>`;
    expect(compareMotion(scene(prototype(1)), scene(prototype(3)))).toHaveLength(0);
  });

  it('bounds motion work instead of freezing on a large animation scene', () => {
    const body = Array.from({ length: MAX_MOTION_OBJECTS + 1 }, (_, i) =>
      slider(2)
        .replaceAll('Slider', `Slider${i}`)
        .replaceAll('Clock', `Clock${i}`)
        .replaceAll('Move', `Move${i}`),
    ).join('');
    expect(() => compareMotion(scene(body), scene(body))).toThrow(/more than 128/);
    for (const samples of [0, -1, 0.5, Infinity, 4097])
      expect(() => compareMotion(scene(slider(2)), scene(slider(2)), samples)).toThrow(/sampling/);
  });

  it('reads native prefixed nodes and ignores foreign scene placements', () => {
    const native = (reach: number) =>
      parse(
        `<x:X3D xmlns:x="http://www.web3d.org/specifications/x3d-namespace" version="3.3"><x:Scene>` +
          slider(reach).replaceAll('<', '<x:').replaceAll('<x:/', '</x:') +
          '</x:Scene></x:X3D>',
      );
    expect(compareMotion(native(2), native(3))[0].changed).toBe(true);
    expect(
      compareMotion(scene(`<Other xmlns="urn:foreign">${slider(2)}</Other>`), scene('')),
    ).toHaveLength(0);
  });

  it('separates a timing change from a change of path', () => {
    const [pair] = compareMotion(scene(slider(2, 6)), scene(slider(2, 4)));
    expect(pair.changed).toBe(true);
    expect(pair.window).toBe(6);
    // Same route, so nothing apart at the same point of each cycle…
    expect(Math.max(...pair.gapByPhase)).toBeCloseTo(0, 9);
    // …but at the same moment the faster one is somewhere else.
    expect(Math.max(...pair.gapByTime)).toBeGreaterThan(1);
    expect(pair.before!.length).toBeCloseTo(pair.after!.length, 6);
  });

  it('follows an edge point when the object turns about its own centre', () => {
    const [still] = compareMotion(scene(spinner(4)), scene(spinner(2)));
    expect(still.point).toBe('edge');
    expect(still.changed).toBe(true);
    // The corner of a 2 × 1 × 1 box is √(1² + 0.5²) from the Y axis: one turn is 2πr.
    expect(still.before!.length).toBeCloseTo(2 * Math.PI * Math.hypot(1, 0.5), 1);

    const [swung] = compareMotion(scene(spinner(4, 3)), scene(spinner(4, 3)));
    expect(swung.point).toBe('centre');
    expect(swung.before!.length).toBeCloseTo(2 * Math.PI * 3, 1);
    expect(swung.changed).toBe(false);
  });

  it('includes the motion of animated Transforms above the object', () => {
    const nested = (reach: number) =>
      `<Transform DEF="Carriage">${slider(1)}</Transform>` +
      `<TimeSensor DEF="CarriageClock" cycleInterval="4" loop="true"/>` +
      `<PositionInterpolator DEF="CarriageMove" key="0 1" keyValue="0 0 0 0 ${reach} 0"/>` +
      `<ROUTE fromNode="CarriageClock" fromField="fraction_changed" toNode="CarriageMove" toField="set_fraction"/>` +
      `<ROUTE fromNode="CarriageMove" fromField="value_changed" toNode="Carriage" toField="set_translation"/>`;
    const pairs = compareMotion(scene(nested(2)), scene(nested(6)));
    expect(pairs.map((pair) => pair.def).sort()).toEqual(['Carriage', 'Slider']);
    // The slider's own animation is unchanged, but it rides on the carriage.
    const slide = pairs.find((pair) => pair.def === 'Slider')!;
    expect(slide.changed).toBe(true);
    expect(Math.max(...slide.gapByTime)).toBeCloseTo(4, 1);
  });

  it('lists an object animated in only one file, and one that exists in only one file', () => {
    const still = scene(
      '<Transform DEF="Slider" translation="1 0 0"><Shape><Box/></Shape></Transform>',
    );
    const [gained] = compareMotion(still, scene(slider(2)));
    expect(gained.changed).toBe(true);
    expect(gained.before!.cycle).toBe(0);
    expect(gained.before!.length).toBe(0);
    expect(gained.gapByTime[0]).toBeCloseTo(1, 9);

    const [added] = compareMotion(scene('<Shape><Box/></Shape>'), scene(slider(2)));
    expect(added.before).toBeUndefined();
    expect(added.gapByTime).toEqual([]);
    expect(added.changed).toBe(true);
  });

  it('ignores animation it cannot follow', () => {
    // No clock, a mismatched keyValue count, a non-Transform target, a zero cycle.
    const body =
      '<Transform DEF="A"/><Material DEF="M"/>' +
      '<PositionInterpolator DEF="P" key="0 1" keyValue="0 0 0 1 0 0"/>' +
      '<ROUTE fromNode="P" fromField="value_changed" toNode="A" toField="set_translation"/>' +
      '<PositionInterpolator DEF="Q" key="0 1" keyValue="0 0 0"/>' +
      '<TimeSensor DEF="C" cycleInterval="0" loop="true"/>' +
      '<ROUTE fromNode="C" fromField="fraction_changed" toNode="Q" toField="set_fraction"/>' +
      '<ROUTE fromNode="Q" fromField="value_changed" toNode="A" toField="set_translation"/>' +
      '<ROUTE fromNode="P" fromField="value_changed" toNode="M" toField="set_diffuseColor"/>';
    expect(compareMotion(scene(body), scene(body))).toEqual([]);
  });

  it('finds the two retimed robot joints in Forgeworks and nothing else', () => {
    const pairs = compareMotion(example('forgeworks', 'before'), example('forgeworks', 'after'));
    expect(pairs.length).toBeGreaterThanOrEqual(36);
    const changed = pairs.filter((pair) => pair.changed);
    for (const pair of changed) {
      expect([pair.before!.cycle, pair.after!.cycle]).toEqual([6, 4]);
      expect(Math.max(...pair.gapByPhase)).toBeLessThan(pair.size * 1e-6);
      expect(Math.max(...pair.gapByTime)).toBeGreaterThan(0);
    }
    expect(changed.length).toBeGreaterThanOrEqual(2);
  });
});
