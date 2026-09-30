import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { compareX3D } from '../src/diff/compare';
function median(a: string, b = a) {
  compareX3D(a, b);
  const times = Array.from({ length: 5 }, () => {
    const start = performance.now();
    compareX3D(a, b);
    return performance.now() - start;
  }).sort((x, y) => x - y);
  return Math.round(times[2]);
}
for (const count of [500, 1000, 2000, 5000]) {
  const xml =
    '<X3D version="3.3"><Scene><Group>' +
    '<Shape><Box/></Shape>'.repeat(count) +
    '</Group></Scene></X3D>';
  console.log(
    JSON.stringify({ scenario: 'anonymous same-path pairs', shapes: count, medianMs: median(xml) }),
  );
}
const scene = (side: string) =>
  readFileSync(new URL('../public/examples/brickhaven/' + side + '.x3d', import.meta.url), 'utf8');
console.log(
  JSON.stringify({
    scenario: 'Brickhaven revisions',
    medianMs: median(scene('before'), scene('after')),
  }),
);
