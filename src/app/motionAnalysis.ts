import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { prescan } from '../x3d/prescan';
import {
  compareMotion,
  readMotionScene,
  worldMatrixAt,
  MOTION_SAMPLES,
  type MotionPair,
  type MotionScene,
} from '../viewer/motion';
import { updateObjectChoice } from './objectChoice';
import type { AnalysisFacts } from '../report/export-html';
import { MOTION_LIMITS, MOTION_SHORT, limitsMarkup } from '../report/limits';

const fmt = (v: number) => Number(v.toPrecision(4)).toString();
// The same blue-to-red scale as Surface deviation.
const heat = (value: number, max: number) =>
  new THREE.Color().setHSL((1 - Math.min(1, max ? value / max : 0)) * 0.66, 0.85, 0.52);
const BEFORE = 0xec4899,
  AFTER = 0x12cce6;

type Mode = 'time' | 'phase';

/** Motion paths: where an animated object travels in each revision, and how far apart they are. */
export class MotionAnalysis {
  private scenes?: { before: MotionScene; after: MotionScene };
  private pairs: MotionPair[] = [];
  private index = 0;
  private mode: Mode = 'time';
  private step = 0;
  private timer = 0;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private scene = new THREE.Scene();
  private paths = new THREE.Group();
  private ghosts = new THREE.Group();
  private context = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.001, 1e7);
  private observer: ResizeObserver;
  notice = '';

  get hasData() {
    return this.pairs.length > 0;
  }
  private q<T extends Element = HTMLElement>(selector: string) {
    return this.host.querySelector<T>(selector)!;
  }

  constructor(private host: HTMLElement) {
    host.innerHTML = `<div class="motion-controls"><label>Animated object <select class="motion-object" aria-label="Animated object"></select></label><label>Compare <select class="motion-mode" aria-label="Compare motion"><option value="time">At the same moment</option><option value="phase">At the same point of the cycle</option></select></label><button type="button" class="button quiet motion-fit">Fit</button></div>
      <p class="motion-summary" role="status"></p>
      <div class="motion-frame"><div class="motion-3d" aria-label="Motion paths 3D view"></div><div class="motion-legend"><span class="motion-key before">Before path</span><span class="motion-key after">After path, coloured by gap</span><span class="motion-scale"><span>0</span><i></i><span class="motion-max"></span></span></div></div>
      <div class="motion-time"><button type="button" class="button quiet motion-play" aria-pressed="false">Play</button><input class="motion-scrub" type="range" min="0" max="${MOTION_SAMPLES}" step="1" value="0" aria-label="Moment in the animation"/><output class="motion-now"></output></div>
      <div class="motion-chart" aria-label="Gap between the two paths over time"></div>
      <dl class="motion-stats"></dl>
      ${limitsMarkup(MOTION_SHORT, MOTION_LIMITS)}`;
    this.scene.background = new THREE.Color('#101c29');
    this.scene.add(this.context, this.paths, this.ghosts);
    this.q('.motion-object').addEventListener('change', () => {
      this.index = Number(this.q<HTMLSelectElement>('.motion-object').value);
      this.show(true);
    });
    this.q('.motion-mode').addEventListener('change', () => {
      this.mode = this.q<HTMLSelectElement>('.motion-mode').value as Mode;
      this.show(false);
    });
    this.q('.motion-fit').addEventListener('click', () => this.fit());
    this.q('.motion-scrub').addEventListener('input', () => {
      this.step = Number(this.q<HTMLInputElement>('.motion-scrub').value);
      this.moment();
    });
    this.q('.motion-play').addEventListener('click', () => this.play(!this.timer));
    this.observer = new ResizeObserver(() => requestAnimationFrame(() => this.resize()));
    this.observer.observe(this.q('.motion-3d'));
  }

  load(beforeXml: string, afterXml: string) {
    this.clear();
    try {
      const read = (xml: string) => {
        // The same guard the preview applies before any XML reaches a parser.
        if (prescan(xml, 'before').length) throw new Error('blocked');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('malformed');
        return readMotionScene(doc);
      };
      this.scenes = { before: read(beforeXml), after: read(afterXml) };
      this.pairs = compareMotion(this.scenes.before, this.scenes.after).filter(
        (pair) => pair.changed,
      );
    } catch (error) {
      this.pairs = [];
      this.notice = error instanceof Error ? error.message : 'Motion paths could not be prepared.';
    }
    this.q('.motion-object').replaceChildren(
      ...this.pairs.map((pair, i) => {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = pair.def;
        return option;
      }),
    );
    updateObjectChoice(this.q<HTMLSelectElement>('.motion-object'));
  }

  clear() {
    this.play(false);
    this.pairs = [];
    this.scenes = undefined;
    this.notice = '';
    this.index = 0;
    this.step = 0;
    for (const group of [this.paths, this.ghosts, this.context]) this.dispose(group);
    this.q('.motion-object').replaceChildren();
  }

  /**
   * Key numbers for the printable report: one entry per object whose motion differs, the
   * largest gaps first. They do not depend on what the tab is showing.
   */
  facts(limit = 12): AnalysisFacts[] {
    const cycle = (side?: { cycle: number; loops: boolean }) =>
      side?.cycle ? `${fmt(side.cycle)} s${side.loops ? ', repeating' : ', once'}` : 'not animated';
    const largest = (pair: MotionPair, mode: Mode) => {
      const gaps = this.gaps(pair, mode);
      return gaps.length ? Math.max(...gaps) : 0;
    };
    const ranked = [...this.pairs].sort((a, b) => largest(b, 'time') - largest(a, 'time'));
    return ranked.slice(0, limit).map((pair, i) => {
      const rows: AnalysisFacts['rows'] = [
        ['Cycle, before → after', `${cycle(pair.before)} → ${cycle(pair.after)}`],
        [
          'Path length per cycle, before → after (scene units)',
          `${pair.before ? fmt(pair.before.length) : '—'} → ${pair.after ? fmt(pair.after.length) : '—'}`,
        ],
      ];
      const byTime = this.gaps(pair, 'time'),
        byPhase = this.gaps(pair, 'phase');
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
          i === 0 && this.pairs.length > 1
            ? `${this.pairs.length} animated objects move differently${this.pairs.length > limit ? `; the ${limit} with the largest gaps are listed` : ''}.`
            : undefined,
        rows,
        limits: MOTION_LIMITS,
      };
    });
  }

  activate() {
    if (!this.hasData) return;
    this.ensureRenderer();
    this.q('.motion-3d').append(this.renderer!.domElement);
    this.show(true);
  }
  deactivate() {
    this.play(false);
  }

  private gaps(pair: MotionPair, mode: Mode = this.mode) {
    const gaps = mode === 'time' ? pair.gapByTime : pair.gapByPhase;
    // Rounding noise on identical paths is "no gap", not a chart of spikes.
    return gaps.length && Math.max(...gaps) <= pair.size * 1e-6 ? gaps.map(() => 0) : gaps;
  }
  private points(pair: MotionPair, side: 'before' | 'after') {
    return pair[side]?.[this.mode === 'time' ? 'byTime' : 'byPhase'];
  }
  /** Seconds into one revision's animation at the current step. */
  private seconds(pair: MotionPair, side: 'before' | 'after') {
    const f = this.step / MOTION_SAMPLES;
    const cycle = pair[side]?.cycle || pair.window;
    return this.mode === 'time'
      ? f * pair.window
      : pair[side]?.loops
        ? Math.min(f * cycle, cycle * (1 - 1e-9))
        : f * cycle;
  }

  private show(refit: boolean) {
    const pair = this.pairs[this.index];
    if (!pair || !this.scenes) return;
    this.q<HTMLSelectElement>('.motion-object').value = String(this.index);
    this.dispose(this.paths);
    this.dispose(this.context);
    const gaps = this.gaps(pair),
      max = gaps.length ? Math.max(...gaps) : 0;
    const before = this.points(pair, 'before'),
      after = this.points(pair, 'after');
    if (before) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(before),
        new THREE.LineDashedMaterial({
          color: BEFORE,
          dashSize: pair.size * 0.06,
          gapSize: pair.size * 0.04,
        }),
      );
      line.computeLineDistances();
      this.paths.add(line);
    }
    if (after) {
      const geometry = new THREE.BufferGeometry().setFromPoints(after);
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(
          after.flatMap((_, i) =>
            (gaps.length ? heat(gaps[i], max) : new THREE.Color(AFTER)).toArray(),
          ),
          3,
        ),
      );
      this.paths.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true })));
    }
    // Faint boxes for the rest of the revised scene, so the paths have somewhere to be.
    const scene = this.scenes.after;
    for (const item of scene.shapes.slice(0, 400)) {
      const size = item.box.getSize(new THREE.Vector3());
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
        new THREE.LineBasicMaterial({ color: 0x4d6275, transparent: true, opacity: 0.45 }),
      );
      box.matrixAutoUpdate = false;
      box.matrix
        .copy(worldMatrixAt(scene, item.shape, 0))
        .multiply(new THREE.Matrix4().setPosition(item.box.getCenter(new THREE.Vector3())));
      this.context.add(box);
    }
    this.q('.motion-max').textContent = `${fmt(max)} scene units`;
    this.q<HTMLElement>('.motion-scale').hidden = !gaps.length;
    this.summary(pair, max);
    this.chart(pair, max);
    this.moment();
    if (refit) requestAnimationFrame(() => this.fit());
  }

  private summary(pair: MotionPair, max: number) {
    const gaps = this.gaps(pair);
    const cycle = (side?: { cycle: number; loops: boolean }) =>
      side?.cycle ? `${fmt(side.cycle)} s${side.loops ? ', repeating' : ', once'}` : 'not animated';
    const followed = pair.point === 'centre' ? 'its centre' : 'a corner of its bounds';
    let text: string;
    if (!pair.before || !pair.after)
      text = `${pair.def} exists only in the ${pair.before ? 'Before' : 'After'} file, so there is one path and no gap to measure.`;
    else if (max <= pair.size * 1e-6)
      text =
        this.mode === 'phase'
          ? `${pair.def} follows the same path in both files; only the timing differs (${cycle(pair.before)} before, ${cycle(pair.after)} after). Switch to "At the same moment" to see how far apart that puts them.`
          : `${pair.def}: the tracked point is in the same place at every sampled moment.`;
    else {
      const at = gaps.indexOf(max);
      text = `${pair.def}: the two revisions are up to ${fmt(max)} scene units apart, at ${fmt((at / MOTION_SAMPLES) * (this.mode === 'time' ? pair.window : 100))}${this.mode === 'time' ? ' s' : '% of the cycle'}.`;
    }
    this.q('.motion-summary').textContent = `${text} Following ${followed}.`;
    const mean = gaps.length ? gaps.reduce((sum, v) => sum + v, 0) / gaps.length : 0;
    const rows: Array<[string, string, string]> = [
      ['Cycle', cycle(pair.before), cycle(pair.after)],
      [
        'Path length per cycle',
        pair.before ? fmt(pair.before.length) : '—',
        pair.after ? fmt(pair.after.length) : '—',
      ],
    ];
    const stats = this.q('.motion-stats');
    stats.replaceChildren();
    const add = (label: string, value: string, className = '') => {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      dd.dataset.label = label;
      if (className) dd.className = className;
      stats.append(dt, dd);
    };
    for (const [label, b, a] of rows) {
      add(`${label} · before`, b, 'before');
      add(`${label} · after`, a, 'after');
    }
    if (gaps.length) {
      add('Largest gap', `${fmt(max)}`);
      add('Average gap', `${fmt(mean)}`);
    }
  }

  /** Gap against time as a small filled curve, in the colours of the path. */
  private chart(pair: MotionPair, max: number) {
    const host = this.q('.motion-chart');
    const gaps = this.gaps(pair);
    host.hidden = !gaps.length;
    if (!gaps.length) return;
    const width = 600,
      height = 90,
      top = 8;
    const x = (i: number) => (i / MOTION_SAMPLES) * width;
    const y = (v: number) => height - (max ? (v / max) * (height - top) : 0);
    const bars = gaps
      .slice(0, -1)
      .map(
        (v, i) =>
          `<path d="M${x(i)} ${height}L${x(i)} ${y(v)}L${x(i + 1)} ${y(gaps[i + 1])}L${x(i + 1)} ${height}Z" fill="#${heat(Math.max(v, gaps[i + 1]), max).getHexString()}"/>`,
      )
      .join('');
    host.innerHTML = `<svg viewBox="0 0 ${width} ${height + 16}" preserveAspectRatio="none" role="img" aria-label="Gap over ${this.mode === 'time' ? 'time' : 'the cycle'}; largest ${fmt(max)} scene units">${bars}<line class="motion-cursor" x1="0" x2="0" y1="0" y2="${height}"/></svg><div class="motion-axis"><span>0</span><span>${this.mode === 'time' ? 'seconds' : 'share of each cycle'}</span><span>${this.mode === 'time' ? `${fmt(pair.window)} s` : '100%'}</span></div>`;
  }

  /** Move the two ghosts, their markers and the readouts to the current step. */
  private moment() {
    const pair = this.pairs[this.index];
    if (!pair || !this.scenes) return;
    this.dispose(this.ghosts);
    this.q<HTMLInputElement>('.motion-scrub').value = String(this.step);
    const where: THREE.Vector3[] = [];
    for (const [side, color] of [
      ['before', BEFORE],
      ['after', AFTER],
    ] as const) {
      const scene = this.scenes[side],
        node = scene.transforms.get(pair.def),
        point = this.points(pair, side)?.[this.step];
      if (!node || !point) continue;
      where.push(point);
      const bounds = pair[side]!.bounds,
        size = bounds.getSize(new THREE.Vector3());
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
        new THREE.LineBasicMaterial({ color }),
      );
      box.matrixAutoUpdate = false;
      box.matrix
        .copy(worldMatrixAt(scene, node, this.seconds(pair, side)))
        .multiply(new THREE.Matrix4().setPosition(bounds.getCenter(new THREE.Vector3())));
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(pair.size * 0.035, 16, 12),
        new THREE.MeshBasicMaterial({ color }),
      );
      marker.position.copy(point);
      this.ghosts.add(box, marker);
    }
    if (where.length === 2) {
      const link = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(where),
        new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
      );
      link.renderOrder = 5;
      this.ghosts.add(link);
    }
    const gaps = this.gaps(pair);
    const f = this.step / MOTION_SAMPLES;
    const when =
      this.mode === 'time' ? `${fmt(f * pair.window)} s` : `${Math.round(f * 100)}% of the cycle`;
    this.q('.motion-now').textContent = gaps.length
      ? `${when} · gap ${fmt(gaps[this.step])}`
      : when;
    this.host.dataset.motionStep = String(this.step);
    this.q<SVGLineElement>('.motion-cursor')?.setAttribute('transform', `translate(${f * 600} 0)`);
    this.render();
  }

  private play(on: boolean) {
    window.clearInterval(this.timer);
    this.timer = 0;
    if (on && this.hasData)
      this.timer = window.setInterval(() => {
        this.step = (this.step + 1) % (MOTION_SAMPLES + 1);
        this.moment();
      }, 50);
    const button = this.q('.motion-play');
    button.textContent = this.timer ? 'Pause' : 'Play';
    button.setAttribute('aria-pressed', String(!!this.timer));
  }

  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.render());
  }
  private fit() {
    if (!this.controls || this.host.hidden) return;
    this.resize();
    // Frame the paths and the moving object, not the whole scene.
    const bounds = new THREE.Box3()
      .setFromObject(this.paths)
      .union(new THREE.Box3().setFromObject(this.ghosts));
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3()),
      span = bounds.getSize(new THREE.Vector3()).length() || 1;
    this.camera.near = Math.max(span / 10000, 1e-10);
    this.camera.far = span * 1000;
    this.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(0.8, 0.6, 1.2)
          .normalize()
          .multiplyScalar((span * 1.6) / Math.min(1, this.camera.aspect)),
      );
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.render();
  }
  private resize() {
    if (!this.renderer || this.host.hidden) return;
    const host = this.q<HTMLElement>('.motion-3d'),
      width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    const old = this.renderer.getSize(new THREE.Vector2());
    if (old.x !== width || old.y !== height) this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }
  private render() {
    if (this.renderer && !this.host.hidden) this.renderer.render(this.scene, this.camera);
  }
  private dispose(group: THREE.Group) {
    for (const object of [...group.children]) {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((m) => m?.dispose());
      group.remove(object);
    }
  }
}
