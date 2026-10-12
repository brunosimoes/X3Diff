import type { Vector3 } from 'three';
import { MOTION_LIMITS } from '../report/limits';
import { motionFacts } from '../report/motionFacts';
import { compareMotion, readMotionScene, type MotionPair } from '../viewer/motion';
import { prescan } from '../x3d/prescan';
import { affectsShape, parsePrimitives } from '../viewer/shapeGeometry';
import { COLORS } from './calmScene';
import {
  captionText,
  chip,
  facts,
  icon,
  n,
  signed,
  field,
  make,
  measurementLimits,
  matte,
  select,
  setIcon,
  serialize,
  svg,
  type Tab,
  type Workbench,
} from './ui';

const CHART = { width: 300, height: 132, left: 40, right: 12, top: 18, bottom: 20 };

function readPairs(wb: Workbench): MotionPair[] {
  try {
    const read = (xml: string) => {
      if (prescan(xml, 'before').length) throw new Error('blocked');
      return readMotionScene(new DOMParser().parseFromString(xml, 'application/xml'));
    };
    return compareMotion(read(wb.texts[0]), read(wb.texts[1])).filter((pair) => pair.changed);
  } catch {
    return [];
  }
}

/** Motion paths drawn into the scene itself, with the gap over time beside it. */
export function motionTab(wb: Workbench): Tab {
  const pairs = readPairs(wb);
  const sources = wb.texts.map((xml) => new DOMParser().parseFromString(xml, 'application/xml'));
  const dependencies = pairs.map((pair) => {
    const names = new Set<string>([pair.def]);
    for (const doc of sources) {
      const transform = Array.from(doc.getElementsByTagName('Transform')).find(
        (node) => node.getAttribute('DEF') === pair.def,
      );
      for (let at = transform?.parentElement; at; at = at.parentElement) {
        const name = at.getAttribute('DEF');
        if (name) names.add(name);
      }
      const routes = Array.from(doc.getElementsByTagName('ROUTE'));
      let changed = true;
      while (changed) {
        changed = false;
        for (const route of routes) {
          const from = route.getAttribute('fromNode'),
            to = route.getAttribute('toNode');
          if (from && to && names.has(to) && !names.has(from)) {
            names.add(from);
            changed = true;
          }
        }
      }
    }
    return names;
  });
  const primitives = wb.texts.map(parsePrimitives);
  const selectedNames = () => {
    const names = new Set(
      wb.selection.changes.flatMap((change) =>
        [change.beforeNode?.defName, change.afterNode?.defName].filter(
          (name): name is string => !!name,
        ),
      ),
    );
    primitives.forEach((items, side) => {
      for (const item of items) {
        const matches = wb.selection.paths
          ? item.path === (side ? wb.selection.paths.after : wb.selection.paths.before)
          : wb.selection.changes.some((change) =>
              affectsShape(item.path, (side ? change.afterNode : change.beforeNode)?.path),
            );
        if (!matches) continue;
        for (let at: Element | null = item.shape; at; at = at.parentElement) {
          const name = at.getAttribute('DEF');
          if (name && pairs.some((pair) => pair.def === name)) {
            names.add(name);
            break;
          }
        }
      }
    });
    return names;
  };
  let index = 0,
    step = 0,
    timer = 0;
  let mode: 'time' | 'phase' = 'time';
  let seenSelection = -1;
  let selectionNote = '';
  const stop = () => {
    cancelAnimationFrame(timer);
    timer = 0;
  };

  const tab: Tab = {
    id: 'motion',
    label: 'Motion paths',
    short: 'Motion',
    available: () => pairs.length > 0,
    facts: () => motionFacts(pairs),
    hide: stop,
    async show(alive) {
      stop();
      if (seenSelection !== wb.selection.version) {
        seenSelection = wb.selection.version;
        selectionNote = '';
        if (wb.selection.label) {
          const names = selectedNames();
          const matches = pairs.flatMap((item, i) =>
            (
              wb.selection.motion
                ? item.def === wb.selection.motion
                : [...names].some((name) => dependencies[i].has(name))
            )
              ? [i]
              : [],
          );
          if (matches.length === 1) {
            index = matches[0];
            step = 0;
            wb.selection.motion = pairs[index].def;
            seenSelection = ++wb.selection.version;
          } else
            selectionNote = `“${wb.selection.label}” does not identify one changed motion path. Showing ${pairs[index].def}; choose an Object below.`;
        }
      }
      wb.setFlat(false);
      const pair = pairs[index];
      const palette = COLORS[wb.theme];
      const rawGaps = mode === 'time' ? pair.gapByTime : pair.gapByPhase;
      const gaps =
        rawGaps.length && Math.max(...rawGaps) <= pair.size * 1e-6 ? rawGaps.map(() => 0) : rawGaps;
      const largest = gaps.length ? Math.max(...gaps) : 0;
      const sameRoute =
        !!pair.gapByPhase.length && Math.max(...pair.gapByPhase) <= pair.size * 1e-3;
      const pathPoints = (path: NonNullable<MotionPair['before']>) =>
        mode === 'time' ? path.byTime : path.byPhase;
      const last = Math.max(pathPoints((pair.after ?? pair.before)!).length - 1, 1);
      const atLabel = (fraction: number) =>
        mode === 'time' ? `t = ${n(fraction * pair.window)} s` : `cycle = ${n(fraction * 100)} %`;
      step = Math.min(step, last);

      // The revised scene as quiet context, with the paths and two markers added to it.
      const doc = new DOMParser().parseFromString(wb.calm.xml, 'application/xml');
      const scene = doc.getElementsByTagName('Scene')[0];
      scene.querySelector(':scope > Group')?.remove();
      for (const material of Array.from(doc.getElementsByTagName('Material'))) {
        material.setAttribute('diffuseColor', palette.unchanged.diffuse);
        material.setAttribute('transparency', wb.theme === 'dark' ? '0.55' : '0.7');
      }
      const radius = Math.max(pair.size * 0.03, 1e-4);
      const tube = (points: Vector3[], color: string, scale: number) => {
        const spine = points.filter((point, i) => !i || point.distanceTo(points[i - 1]) > 1e-6);
        if (spine.length < 2) return;
        const shape = doc.createElement('Shape');
        const extrusion = doc.createElement('Extrusion');
        const ring = Array.from({ length: 9 }, (_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          return `${(Math.cos(angle) * radius * scale).toFixed(5)} ${(Math.sin(angle) * radius * scale).toFixed(5)}`;
        });
        extrusion.setAttribute('crossSection', ring.join(' '));
        extrusion.setAttribute(
          'spine',
          spine
            .map((p) =>
              p
                .toArray()
                .map((v) => +v.toFixed(5))
                .join(' '),
            )
            .join(' '),
        );
        extrusion.setAttribute('solid', 'false');
        extrusion.setAttribute('creaseAngle', '3');
        shape.append(matte(doc, color), extrusion);
        scene.append(shape);
      };
      const marker = (name: string, color: string) => {
        const transform = doc.createElement('Transform');
        transform.setAttribute('DEF', name);
        const shape = doc.createElement('Shape');
        const sphere = doc.createElement('Sphere');
        sphere.setAttribute('radius', String(radius * 2.8));
        shape.append(matte(doc, color), sphere);
        transform.append(shape);
        scene.append(transform);
      };
      const context = wb.theme === 'dark' ? '0.95 0.97 1' : '0.36 0.41 0.47';
      // A shared path is quieter than the two markers that ride on it.
      const shared = wb.theme === 'dark' ? '0.78 0.83 0.88' : '0.58 0.63 0.68';
      if (sameRoute) tube(pair.after!.byPhase, shared, 0.6);
      else {
        if (pair.before) tube(pathPoints(pair.before), context, 0.6);
        if (pair.after) tube(pathPoints(pair.after), palette.changed.diffuse, 0.6);
      }
      if (pair.before) marker('X3DIFF_BEFORE_MARK', context);
      if (pair.after) marker('X3DIFF_AFTER_MARK', palette.changed.diffuse);

      // Gap chart: the distance over the shared window, with what a reviewer reads off it
      // drawn in: the scale, the mean, the largest gap, and where each file starts a new pass.
      const chart = svg('svg', {
        viewBox: `0 0 ${CHART.width} ${CHART.height}`,
        class: 'gap-chart',
        role: 'img',
      });
      chart.setAttribute(
        'aria-label',
        mode === 'time'
          ? 'Distance between the two positions over time'
          : 'Distance between the two positions over the cycle',
      );
      const wide = CHART.width - CHART.left - CHART.right,
        tall = CHART.height - CHART.top - CHART.bottom;
      const floor = CHART.top + tall;
      const x = (i: number) => CHART.left + (i / last) * wide;
      const y = (gap: number) => floor - (largest ? (gap / largest) * tall : 0);
      const write = (text: string, px: number, py: number, anchor = 'start', kind = '') => {
        const node = svg('text', { x: px, y: py, 'text-anchor': anchor, class: kind });
        node.textContent = text;
        chart.append(node);
      };
      const rule = (x1: number, y1: number, x2: number, y2: number, kind: string) =>
        chart.append(svg('line', { x1, y1, x2, y2, class: kind }));
      const mean = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
      const peak = gaps.indexOf(largest);
      rule(CHART.left, floor, CHART.left + wide, floor, 'axis');
      rule(CHART.left, CHART.top, CHART.left, floor, 'axis');
      write('0', CHART.left - 4, floor + 3, 'end');
      write('0', CHART.left, CHART.height - 4, 'middle');
      write(
        mode === 'time' ? n(pair.window / 2) : '50',
        CHART.left + wide / 2,
        CHART.height - 4,
        'middle',
      );
      write(
        mode === 'time' ? `${n(pair.window)} s` : '100 %',
        CHART.left + wide,
        CHART.height - 4,
        'end',
      );
      if (gaps.length) {
        // A file whose pass is shorter than the window starts over inside it.
        for (const [path, kind, name] of [
          [pair.before, 'pass a', 'T(A)'],
          [pair.after, 'pass b', 'T(B)'],
        ] as const) {
          if (mode === 'phase' || !path || !(path.cycle > 0)) continue;
          for (let t = path.cycle, k = 1; t < pair.window - 1e-9; t += path.cycle, k++) {
            const px = CHART.left + (t / pair.window) * wide;
            rule(px, CHART.top, px, floor, kind);
            write(k > 1 ? `${k}${name}` : name, px, CHART.top - 4, 'middle', kind);
          }
        }
        const trace = gaps.map((gap, i) => `${x(i).toFixed(1)} ${y(gap).toFixed(1)}`).join(' L');
        chart.append(
          svg('path', {
            d: `M${CHART.left} ${floor} L${trace} L${CHART.left + wide} ${floor} Z`,
            class: 'area',
          }),
          svg('path', { d: `M${trace}`, class: 'trace' }),
        );
        write(n(largest), CHART.left - 4, y(largest) + 3, 'end');
        if (y(mean) - y(largest) > 10 && floor - y(mean) > 10) {
          rule(CHART.left, y(mean), CHART.left + wide, y(mean), 'mean');
          write(n(mean), CHART.left - 4, y(mean) + 3, 'end');
          write('mean', CHART.left + wide, y(mean) - 3, 'end');
        }
        chart.append(svg('circle', { cx: x(peak), cy: y(largest), r: 3, class: 'peak' }));
        write(
          'max',
          Math.min(Math.max(x(peak), CHART.left + 10), CHART.left + wide - 10),
          y(largest) - 5,
          'middle',
        );
      }
      const cursor = svg('line', { y1: CHART.top, y2: floor, class: 'cursor' });
      const here = svg('circle', { r: 3.5, class: 'here' });
      chart.append(cursor, here);
      // The chart is also the scrubber: press or drag on it to go to that moment.
      const scrub = (event: PointerEvent) => {
        const box = chart.getBoundingClientRect();
        const at = ((event.clientX - box.left) / box.width) * CHART.width;
        step = Math.round(Math.min(1, Math.max(0, (at - CHART.left) / wide)) * last);
        place();
      };
      chart.addEventListener('pointerdown', (event) => {
        scrub(event);
        const stopScrub = () => chart.removeEventListener('pointermove', scrub);
        chart.addEventListener('pointermove', scrub);
        addEventListener('pointerup', stopScrub, { once: true });
        addEventListener('pointercancel', stopScrub, { once: true });
      });
      const readout = make('p', 'readout');
      const slider = make('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(last);
      slider.step = '1';
      slider.setAttribute('aria-label', mode === 'time' ? 'Time' : 'Cycle position');
      const place = () => {
        slider.value = String(step);
        cursor.setAttribute('x1', String(x(step)));
        cursor.setAttribute('x2', String(x(step)));
        here.setAttribute('cx', String(x(step)));
        here.setAttribute('cy', String(y(gaps[step] ?? 0)));
        readout.textContent = gaps.length
          ? `${atLabel(step / last)} · d = ${n(gaps[step] ?? 0)}`
          : atLabel(step / last);
        for (const [name, path] of [
          ['X3DIFF_BEFORE_MARK', pair.before],
          ['X3DIFF_AFTER_MARK', pair.after],
        ] as const) {
          const point = path && pathPoints(path)[step];
          if (!point) continue;
          try {
            Object.assign(wb.scene().getNamedNode(name).translation, {
              x: point.x,
              y: point.y,
              z: point.z,
            });
          } catch {}
        }
      };
      slider.addEventListener('input', () => {
        step = Number(slider.value);
        place();
      });
      const play = icon('▶', 'Play', () => {
        if (timer) {
          stop();
          setIcon(play, '▶', 'Play');
          return;
        }
        setIcon(play, '❚❚', 'Pause');
        const started = performance.now() - (step / last) * pair.window * 1000;
        const tick = (now: number) => {
          if (!alive()) return stop();
          step = Math.round((((now - started) / 1000 / pair.window) % 1) * last);
          place();
          timer = requestAnimationFrame(tick);
        };
        timer = requestAnimationFrame(tick);
      });

      const at = gaps.indexOf(largest);
      captionText(
        wb.caption,
        pair.def,
        !gaps.length
          ? `Only in ${pair.before ? 'A' : 'B'}`
          : sameRoute
            ? `Path A = path B · max d ≈ ${n(largest)}`
            : `max d ≈ ${n(largest)} at ${atLabel(at / last)}`,
      );
      wb.tools.replaceChildren(
        play,
        icon('fit', 'Fit scene', () => wb.pane.refreshView(true)),
      );
      wb.footer.replaceChildren(
        ...(sameRoute
          ? [chip('outline', 'Path', true, undefined, 'The path, the same in both files')]
          : [
              ...(pair.before
                ? [chip('outline', 'Path A', true, undefined, 'Path in the original')]
                : []),
              ...(pair.after
                ? [chip('changed', 'Path B', true, undefined, 'Path in the revised')]
                : []),
            ]),
        ...(pair.before
          ? [
              chip(
                'outline round',
                mode === 'time' ? 'A(t)' : 'A(φ)',
                true,
                undefined,
                'Position in the original',
              ),
            ]
          : []),
        ...(pair.after
          ? [
              chip(
                'changed round',
                mode === 'time' ? 'B(t)' : 'B(φ)',
                true,
                undefined,
                'Position in the revised',
              ),
            ]
          : []),
      );
      const rows: Array<[string, string, string?, string?]> = [];
      if (gaps.length) {
        rows.push([
          'max d',
          n(largest),
          '',
          mode === 'time'
            ? 'Largest gap at the same moment'
            : 'Largest gap at the same point of the cycle',
        ]);
        rows.push([
          'mean d',
          n(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
          '',
          mode === 'time'
            ? 'Average gap at the same moment'
            : 'Average gap at the same point of the cycle',
        ]);
      }
      if (pair.before)
        rows.push(['T(A)', `${n(pair.before.cycle)} s`, '', 'One pass in the original']);
      if (pair.after)
        rows.push(['T(B)', `${n(pair.after.cycle)} s`, '', 'One pass in the revised']);
      if (pair.before && pair.after)
        rows.push([
          'ΔT',
          `${signed(pair.after.cycle - pair.before.cycle)} s`,
          '',
          'T(B) minus T(A)',
        ]);
      wb.side.replaceChildren(
        make('h2', '', 'Motion'),
        field(
          'Object',
          select(
            pairs.map((item) => item.def),
            index,
            (next) => {
              index = next;
              wb.selection.select(
                wb.report.changes.filter((change) =>
                  [change.beforeNode?.defName, change.afterNode?.defName].some(
                    (name) => name && dependencies[index].has(name),
                  ),
                ),
                pairs[index].def,
              );
              wb.selection.motion = pairs[index].def;
              seenSelection = wb.selection.version;
              selectionNote = '';
              step = 0;
              void tab.show(alive);
            },
          ),
        ),
        ...(selectionNote ? [make('p', 'selection-note', selectionNote)] : []),
        field(
          'Compare',
          select(
            ['At the same moment', 'At the same point of the cycle'],
            mode === 'time' ? 0 : 1,
            (next) => {
              mode = next ? 'phase' : 'time';
              step = 0;
              void tab.show(alive);
            },
          ),
        ),
        make('h2', '', mode === 'time' ? 'd(t) = |A(t) B(t)|' : 'd(φ) = |A(φ) B(φ)|'),
        chart,
        field(mode === 'time' ? 't' : 'Cycle', slider),
        readout,
        facts(rows),
        make(
          'p',
          'foot',
          `Tracked point: ${pair.point === 'centre' ? 'centre' : 'corner of the bounds'}`,
        ),
        measurementLimits(MOTION_LIMITS),
      );
      await wb.pane.load(serialize(doc));
      if (alive()) place();
    },
  };
  return tab;
}
