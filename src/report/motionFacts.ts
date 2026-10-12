import type { AnalysisFacts } from './export-html';
import { MOTION_LIMITS } from './limits';
import { MOTION_SAMPLES, type MotionPair } from '../viewer/motion';

const fmt = (value: number) => Number(value.toPrecision(4)).toString();
const gaps = (pair: MotionPair, mode: 'time' | 'phase') => {
  const values = mode === 'time' ? pair.gapByTime : pair.gapByPhase;
  return values.length && Math.max(...values) <= pair.size * 1e-6 ? values.map(() => 0) : values;
};

/** Key motion measurements, with the sampled scope and tracked point for each object. */
export function motionFacts(pairs: readonly MotionPair[], limit = 12): AnalysisFacts[] {
  const cycle = (side?: { cycle: number; loops: boolean }) =>
    side?.cycle ? `${fmt(side.cycle)} s${side.loops ? ', repeating' : ', once'}` : 'not animated';
  const largest = (pair: MotionPair, mode: 'time' | 'phase') => {
    const values = gaps(pair, mode);
    return values.length ? Math.max(...values) : 0;
  };
  const ranked = [...pairs].sort((a, b) => largest(b, 'time') - largest(a, 'time'));
  return ranked.slice(0, limit).map((pair, i) => {
    const rows: AnalysisFacts['rows'] = [
      ['Cycle, before → after', `${cycle(pair.before)} → ${cycle(pair.after)}`],
      [
        'Path length per cycle, before → after (scene units)',
        `${pair.before ? fmt(pair.before.length) : '—'} → ${pair.after ? fmt(pair.after.length) : '—'}`,
      ],
    ];
    const byTime = gaps(pair, 'time'),
      byPhase = gaps(pair, 'phase');
    if (byTime.length) {
      const max = Math.max(...byTime);
      rows.push(
        [
          'Largest gap at the same moment',
          max
            ? `${fmt(max)} scene units, at ${fmt((byTime.indexOf(max) / MOTION_SAMPLES) * pair.window)} s`
            : '0',
        ],
        [
          'Average gap at the same moment',
          fmt(byTime.reduce((sum, v) => sum + v, 0) / byTime.length),
        ],
      );
    }
    if (byPhase.length) {
      const max = Math.max(...byPhase);
      rows.push([
        'Largest gap at the same point of the cycle',
        max ? `${fmt(max)} scene units` : '0: the route is the same, only the timing differs',
      ]);
    }
    if (!pair.before || !pair.after)
      rows.push([
        'Present in',
        `the ${pair.before ? 'Before' : 'After'} file only: one path, no gap to measure`,
      ]);
    rows.push([
      'Point followed',
      pair.point === 'centre' ? 'centre of the object' : 'a corner of its bounds',
    ]);
    return {
      view: 'Motion paths',
      object: pair.def,
      note:
        i === 0 && pairs.length > 1
          ? `${pairs.length} animated objects move differently${pairs.length > limit ? `; the ${limit} with the largest gaps are listed` : ''}.`
          : undefined,
      rows,
      limits: MOTION_LIMITS,
    };
  });
}
