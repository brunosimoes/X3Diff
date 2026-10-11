import { describe, it, expect } from 'vitest';
import { acceptsFile, planDrop } from '../src/app/dropFiles';

const file = (name: string, type = '') => ({ name, type });
const none = { before: false, after: false };

describe('dropped files', () => {
  it('accepts what the file buttons accept', () => {
    expect(acceptsFile(file('scene.x3d'))).toBe(true);
    expect(acceptsFile(file('SCENE.X3D'))).toBe(true);
    expect(acceptsFile(file('scene.xml'))).toBe(true);
    expect(acceptsFile(file('scene', 'application/xml'))).toBe(true);
    expect(acceptsFile(file('notes.txt', 'text/plain'))).toBe(false);
    expect(acceptsFile(file('scene.x3d.png', 'image/png'))).toBe(false);
  });

  it('puts one file on the next empty side, and replaces After when both are loaded', () => {
    expect(planDrop([file('a.x3d')], none)).toEqual({ sides: ['before'] });
    expect(planDrop([file('a.x3d')], { before: true, after: false })).toEqual({ sides: ['after'] });
    expect(planDrop([file('a.x3d')], { before: false, after: true })).toEqual({
      sides: ['before'],
    });
    expect(planDrop([file('a.x3d')], { before: true, after: true })).toEqual({ sides: ['after'] });
  });

  it('orders a pair by file name, whichever way round it was dropped', () => {
    for (const names of [
      ['part-v1.x3d', 'part-v2.x3d'],
      ['part-v2.x3d', 'part-v1.x3d'],
      ['part-v10.x3d', 'part-v9.x3d'],
    ]) {
      const plan = planDrop(names.map((name) => file(name)), none);
      if ('error' in plan) throw new Error(plan.error);
      expect(plan.rule).toBe('in file-name order');
      const before = names[plan.sides.indexOf('before')];
      expect(before).toBe(names.includes('part-v9.x3d') ? 'part-v9.x3d' : 'part-v1.x3d');
    }
  });

  it('lets before/after words in the names override alphabetical order', () => {
    for (const [names, expected] of [
      [['after.x3d', 'before.x3d'], ['after', 'before']],
      [['before.x3d', 'after.x3d'], ['before', 'after']],
      [['HelloWorld-edited.x3d', 'HelloWorld.x3d'], ['after', 'before']],
      [['pump.x3d', 'pump_original.x3d'], ['after', 'before']],
      [['old-pump.x3d', 'new-pump.x3d'], ['before', 'after']],
    ] as const)
      expect(planDrop(names.map((name) => file(name)), none)).toEqual({
        sides: expected,
        rule: 'from the words in the file names',
      });
    // "renewed" contains "new" but not as a word; both unhinted, so name order applies.
    expect(planDrop([file('renewed.x3d'), file('alpha.x3d')], none)).toEqual({
      sides: ['after', 'before'],
      rule: 'in file-name order',
    });
  });

  it('rejects other file types and more than two files', () => {
    expect(planDrop([file('notes.txt', 'text/plain')], none)).toEqual({
      error: 'Only .x3d or .xml files can be loaded here: notes.txt is not one.',
    });
    expect(planDrop([file('a.x3d'), file('photo.png', 'image/png')], none)).toHaveProperty(
      'error',
    );
    expect(planDrop([file('a.x3d'), file('b.x3d'), file('c.x3d')], none)).toEqual({
      error: 'Drop one or two files: a Before and an After revision.',
    });
    expect(planDrop([], none)).toHaveProperty('error');
  });
});
