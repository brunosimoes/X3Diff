import { describe, it, expect } from 'vitest';
import { diffWords, trimShared, type TextRun } from '../src/app/textDiff';

const side = (runs: TextRun[], other: 'in' | 'out') =>
  runs
    .filter((run) => run.kind !== other)
    .map((run) => run.text)
    .join('');

describe('diffWords', () => {
  it('marks only the words that differ', () => {
    expect(diffWords('Fit Lab original', 'Fit Lab revised')).toEqual([
      { kind: 'same', text: 'Fit Lab ' },
      { kind: 'out', text: 'original' },
      { kind: 'in', text: 'revised' },
    ]);
  });

  it('finds several separate changes in one sentence', () => {
    const runs = diffWords(
      'First pose for bottlenose dolphin is neutral position, exported from Maya.',
      'Second pose for bottlenose dolphin is curved upward, exported from Maya.',
    );
    expect(runs.filter((run) => run.kind === 'out').map((run) => run.text)).toEqual([
      'First',
      'neutral',
      'position',
    ]);
    expect(runs.filter((run) => run.kind === 'in').map((run) => run.text)).toEqual([
      'Second',
      'curved',
      'upward',
    ]);
  });

  it('splits a number out of the word it is attached to', () => {
    const runs = diffWords('DolphinPose01.x3d', 'DolphinPose02.x3d');
    expect(runs).toEqual([
      { kind: 'same', text: 'DolphinPose' },
      { kind: 'out', text: '01' },
      { kind: 'in', text: '02' },
      { kind: 'same', text: '.x3d' },
    ]);
  });

  it('gives both texts back, whatever they are', () => {
    for (const [from, to] of [
      ['', ''],
      ['', 'added'],
      ['removed', ''],
      ['same text', 'same text'],
      ['a  b\tc', 'a b c'],
      ['nothing in common', '完全に 別の 文'],
    ]) {
      const runs = diffWords(from, to);
      expect(side(runs, 'in')).toBe(from);
      expect(side(runs, 'out')).toBe(to);
    }
  });

  it('reports an unchanged text as one shared run', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ kind: 'same', text: 'same text' }]);
  });

  it('replaces whole texts that are too long to align', () => {
    const from = Array.from({ length: 400 }, (_, i) => `x${i}y`).join(' ');
    const to = Array.from({ length: 400 }, (_, i) => `p${i}q`).join(' ');
    expect(diffWords(from, to)).toEqual([
      { kind: 'out', text: from },
      { kind: 'in', text: to },
    ]);
  });
});

describe('diffWords on long texts', () => {
  it('still finds one changed word in a text of hundreds', () => {
    const body = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
    const runs = diffWords(`${body} before end`, `${body} after end`);
    expect(runs.filter((run) => run.kind !== 'same')).toEqual([
      { kind: 'out', text: 'before' },
      { kind: 'in', text: 'after' },
    ]);
    expect(side(runs, 'in')).toBe(`${body} before end`);
    expect(side(runs, 'out')).toBe(`${body} after end`);
  });
});

describe('trimShared', () => {
  it('keeps a few words beside each change and drops the rest', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve';
    const runs = trimShared(diffWords(`${long} OLD ${long}`, `${long} NEW ${long}`));
    expect(runs.map((run) => run.kind)).toEqual(['same', 'out', 'in', 'same']);
    expect(runs[0].text).toMatch(/^… .*twelve $/);
    expect(runs[0].text.length).toBeLessThan(long.length);
    expect(runs[3].text).toMatch(/^ one .* …\s*$/);
  });

  it('leaves short shared text and unchanged texts alone', () => {
    expect(trimShared(diffWords('Fit Lab original', 'Fit Lab revised'))[0].text).toBe('Fit Lab ');
    const whole = 'a text that did not change at all, however long it happens to be';
    expect(trimShared(diffWords(whole, whole))).toEqual([{ kind: 'same', text: whole }]);
  });
});
