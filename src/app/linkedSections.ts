import { updateObjectChoice } from './objectChoice';
import { readAnalysisGeometry, type AnalysisPair } from '../viewer/analysisGeometry';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ChangeRecord, X3DiffReport } from '../report/schema';
import { parsePrimitives, affectsShape } from '../viewer/shapeGeometry';
import {
  sliceGeometry,
  closestOnSection,
  planeAxes,
  type Axis,
  type Segment,
} from '../viewer/sections';

type Pair = AnalysisPair;
const colors = [0xe34889, 0x00b8d4];
const number = (n: number) => Number(n.toPrecision(5)).toString();

export class LinkedSections {
  private pairs: Pair[] = [];
  private current = -1;
  private needsShow = true;
  getPairs(): readonly AnalysisPair[] {
    return this.pairs;
  }
  get hasData() {
    return this.pairs.length > 0;
  }
  activate() {
    if (!this.hasData) return;
    this.onSelectPair(this.pairs[Math.max(0, this.current)]);
    const firstShow = this.needsShow;
    if (firstShow) this.show(Math.max(0, this.current));
    requestAnimationFrame(() => (firstShow ? this.fit() : this.resize()));
  }
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.001, 1e7);
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private models = new THREE.Group();
  private guides = new THREE.Group();
  private bounds = new THREE.Box3();
  private geometries: THREE.BufferGeometry[] = [];
  private sections: Segment[][] = [];
  private points: THREE.Vector3[] = [];
  private axis: Axis = 2;
  private level = 0;
  private span = 1;
  private svgBox = { x: 0, y: 0, width: 1, height: 1 };
  private observer: ResizeObserver;
  private q<T extends Element = HTMLElement>(s: string): T {
    return this.host.querySelector<T>(s)!;
  }

  constructor(
    private host: HTMLElement,
    private onSelectPair: (pair: AnalysisPair) => void = () => {},
  ) {
    host.innerHTML = `<div class="linked-heading"><p>Move a shared slice through the revisions and measure their outlines.</p></div>
      <div id="sections-content"><div class="section-controls"><label>Object <select id="section-object"></select></label><label>Slice <select id="section-axis"><option value="2">XY · Front</option><option value="1">XZ · Top</option><option value="0">ZY · Side</option></select></label><label class="slice-slider">Position <input id="section-position" type="range" min="1" max="999" value="500" aria-label="Slice position"/></label><output id="section-level"></output><button class="button quiet" id="section-reset">Reset view</button></div>
      <p id="section-status" role="status"></p><div class="linked-views"><div class="linked-card"><div class="linked-card-title">3D location <small>Drag to orbit · Click a surface to place the slice</small></div><div id="section-3d" aria-label="Linked 3D object view"></div></div><div class="linked-card"><div class="linked-card-title">2D cross-section <small>Click two outline points to measure</small></div><svg id="section-2d" role="img" aria-label="Before and after cross-section outlines"></svg></div></div>
      <div class="section-results"><span class="section-key"><i></i>Before <i></i>After</span><span id="section-size"></span><button class="button quiet" id="section-clear">Clear ruler</button></div><p id="section-measure" aria-live="polite"></p><p class="section-footnote">World coordinates · Scene units · Static geometry · No automatic alignment. Curved primitives use tessellated surfaces. Section dimensions are extents, not surface distances.</p></div>`;
    this.scene.background = new THREE.Color('#101c29');
    this.scene.add(this.models, this.guides);
    this.q('#section-object').addEventListener('change', () => {
      this.show(Number(this.q<HTMLSelectElement>('#section-object').value));
      this.onSelectPair(this.pairs[this.current]);
    });
    this.q('#section-object').addEventListener('focus', () => {
      if (this.pairs[this.current]) this.onSelectPair(this.pairs[this.current]);
    });
    this.q('#section-axis').addEventListener('change', () => {
      this.axis = Number(this.q<HTMLSelectElement>('#section-axis').value) as Axis;
      this.q<HTMLInputElement>('#section-position').value = '500';
      this.update();
    });
    this.q('#section-position').addEventListener('input', () => this.update());
    this.q('#section-reset').addEventListener('click', () => this.fit());
    this.q('#section-clear').addEventListener('click', () => {
      this.points = [];
      this.draw();
    });
    this.q<SVGSVGElement>('#section-2d').addEventListener('click', (event) => {
      if (!this.geometries.length) return;
      const svg = this.q<SVGSVGElement>('#section-2d'),
        matrix = svg.getScreenCTM();
      if (!matrix) return;
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      const [u, v] = planeAxes(this.axis),
        point = new THREE.Vector3();
      point.setComponent(this.axis, this.level).setComponent(u, p.x).setComponent(v, -p.y);
      const nearest = closestOnSection(point, this.sections.flat());
      if (nearest) {
        if (this.points.length === 2) this.points = [];
        this.points.push(nearest);
        this.draw();
      }
    });
    this.observer = new ResizeObserver(() => requestAnimationFrame(() => this.resize()));
    this.observer.observe(this.q('#section-3d'));
  }

  clear() {
    this.host.hidden = true;
    this.pairs = [];
    this.current = -1;
    this.needsShow = true;
    this.points = [];
    this.sections = [];
    this.disposeGroup(this.models);
    this.disposeGroup(this.guides);
    this.geometries = [];
    this.q('#section-2d').replaceChildren();
    this.q('#section-object').replaceChildren();
  }

  load(before: string, after: string, report: X3DiffReport) {
    this.clear();
    try {
      const a = parsePrimitives(before),
        b = parsePrimitives(after);
      const byDef = new Map(b.filter((item) => item.def).map((item) => [item.def!, item]));
      const byPath = new Map(b.map((item) => [item.path, item]));
      for (const item of a) {
        const match = item.def ? byDef.get(item.def) : byPath.get(item.path);
        if (!match) continue;
        if (!item.def && (match.def || match.geometry.localName !== item.geometry.localName))
          continue;
        const related = report.changes.filter(
          (c) =>
            affectsShape(item.path, c.beforeNode?.path) ||
            affectsShape(match.path, c.afterNode?.path),
        );
        if (
          !related.some(
            (c) => c.confidence !== 'low' && ['geometry', 'transform'].includes(c.category),
          )
        )
          continue;
        if (
          related.some(
            (c) =>
              c.confidence === 'low' ||
              ['nodeAdded', 'nodeRemoved', 'nodeReplaced'].includes(c.kind),
          )
        )
          continue;
        if (!item.def && related.some((c) => c.category === 'structure')) continue;
        // Availability means the geometry can actually be read, not just that a pair exists.
        let valid = true;
        for (const shape of [item, match]) {
          let geometry: THREE.BufferGeometry | undefined;
          try {
            geometry = readAnalysisGeometry(shape);
          } catch {
            valid = false;
          } finally {
            geometry?.dispose();
          }
        }
        if (!valid) continue;
        this.pairs.push({
          before: item,
          after: match,
          label: item.def ?? `${item.geometry.localName} · ${item.path}`,
        });
      }
      this.q('#section-object').replaceChildren(
        ...this.pairs.map((pair, i) => {
          const option = document.createElement('option');
          option.value = String(i);
          option.textContent = pair.label;
          return option;
        }),
      );
      updateObjectChoice(this.q<HTMLSelectElement>('#section-object'));
      this.current = this.pairs.length ? 0 : -1;
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'Sections unavailable.');
    }
  }

  selectPair(pair: AnalysisPair) {
    const index = this.pairs.indexOf(pair);
    if (index < 0 || index === this.current) return;
    this.current = index;
    this.needsShow = true;
    this.q<HTMLSelectElement>('#section-object').value = String(index);
    if (!this.host.hidden) this.show(index);
  }
  select(changes: ChangeRecord[]) {
    if (!this.hasData) return;
    const index = this.pairs.findIndex((p) =>
      changes.some(
        (c) =>
          affectsShape(p.before.path, c.beforeNode?.path) ||
          affectsShape(p.after.path, c.afterNode?.path),
      ),
    );
    if (index >= 0 && index !== this.current) {
      this.current = index;
      this.needsShow = true;
      if (!this.host.hidden) this.show(index);
    } else if (index >= 0 && this.geometries.length === 2)
      this.q('#section-status').textContent = '';
    else if (index < 0)
      this.q('#section-status').textContent =
        this.geometries.length === 2
          ? 'This selection has no supported geometry pair. The object named above remains displayed.'
          : 'This selection has no supported geometry pair. Try another object or example.';
  }

  private message(text: string) {
    this.q('#section-status').textContent = text;
    const unavailable = this.geometries.length !== 2;
    this.q<HTMLElement>('.linked-views').hidden = unavailable;
    this.q<HTMLElement>('.section-results').hidden = unavailable;
    this.q<HTMLElement>('#section-measure').hidden = unavailable;
    for (const id of ['#section-axis', '#section-position', '#section-reset'])
      this.q<HTMLInputElement>(id).disabled = unavailable;
  }

  private show(index: number) {
    this.needsShow = false;
    this.current = index;
    this.q<HTMLSelectElement>('#section-object').value = String(index);
    this.disposeGroup(this.models);
    this.disposeGroup(this.guides);
    this.geometries = [];
    this.sections = [];
    this.points = [];
    this.q('#section-2d').replaceChildren();
    try {
      for (const item of [this.pairs[index].before, this.pairs[index].after]) {
        const geometry = readAnalysisGeometry(item);
        const material = new THREE.MeshBasicMaterial({
          color: colors[this.geometries.length],
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        this.geometries.push(geometry);
        this.models.add(new THREE.Mesh(geometry, material));
      }
      this.bounds.copy(this.geometries[0].boundingBox!).union(this.geometries[1].boundingBox!);
      this.span = this.bounds.getSize(new THREE.Vector3()).length();
      if (this.span < 1e-8) throw new Error('This object is too small for the section analysis.');
      this.ensureRenderer();
      this.message('');
      this.q<HTMLInputElement>('#section-position').value = '500';
      this.update();
      this.fit();
    } catch (error) {
      this.disposeGroup(this.models);
      this.disposeGroup(this.guides);
      this.geometries = [];
      this.message(error instanceof Error ? error.message : 'Sections unavailable.');
    }
  }

  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive section location');
    this.q('#section-3d').append(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.addEventListener('change', () => this.render());
    let down = { x: 0, y: 0 };
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
      const rect = canvas.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = ray.intersectObjects(this.models.children)[0];
      const extent =
        this.bounds.max.getComponent(this.axis) - this.bounds.min.getComponent(this.axis);
      if (!hit || extent <= 0) return;
      const fraction =
        (hit.point.getComponent(this.axis) - this.bounds.min.getComponent(this.axis)) / extent;
      this.q<HTMLInputElement>('#section-position').value = String(
        Math.max(1, Math.min(999, fraction * 1000)),
      );
      this.update();
      const nearest = closestOnSection(hit.point, this.sections.flat());
      if (nearest) {
        this.points = [nearest];
        this.draw();
      }
    });
  }

  private resize() {
    if (!this.renderer || this.host.hidden) return;
    const width = this.q('#section-3d').clientWidth,
      height = this.q('#section-3d').clientHeight;
    if (!width || !height) return;
    const rendered = this.renderer.getSize(new THREE.Vector2());
    if (rendered.x !== width || rendered.y !== height) this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }
  private fit() {
    if (!this.geometries.length || !this.controls) return;
    this.resize();
    const center = this.bounds.getCenter(new THREE.Vector3());
    this.camera.near = Math.max(this.span / 10000, 1e-10);
    this.camera.far = this.span * 100;
    this.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(0.9, 0.65, 1.2)
          .normalize()
          .multiplyScalar((this.span * 1.8) / Math.min(1, this.camera.aspect)),
      );
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.render();
  }
  private render() {
    if (this.renderer && !this.host.hidden) this.renderer.render(this.scene, this.camera);
  }
  private disposeGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material?.dispose();
      group.remove(child);
    }
  }

  private update() {
    if (this.geometries.length !== 2) return;
    this.points = [];
    this.level = THREE.MathUtils.lerp(
      this.bounds.min.getComponent(this.axis),
      this.bounds.max.getComponent(this.axis),
      Number(this.q<HTMLInputElement>('#section-position').value) / 1000,
    );
    this.q('#section-level').textContent = `${'XYZ'[this.axis]} = ${number(this.level)}`;
    this.sections = this.geometries.map((g) =>
      sliceGeometry(g, this.axis, this.level, Math.max(this.span * 1e-8, 1e-12)),
    );
    this.draw();
  }

  private draw() {
    if (this.geometries.length !== 2) return;
    this.disposeGroup(this.guides);
    const [u, v] = planeAxes(this.axis);
    const size = this.bounds.getSize(new THREE.Vector3());
    const margin = Math.max(size.getComponent(u), size.getComponent(v), this.span * 0.05) * 0.08;
    const width = size.getComponent(u) + 2 * margin,
      height = size.getComponent(v) + 2 * margin;
    this.svgBox = {
      x: this.bounds.min.getComponent(u) - margin,
      y: -this.bounds.max.getComponent(v) - margin,
      width,
      height,
    };
    const svg = this.q<SVGSVGElement>('#section-2d');
    svg.setAttribute('viewBox', `${this.svgBox.x} ${this.svgBox.y} ${width} ${height}`);
    svg.replaceChildren();
    const add = (name: string, attrs: Record<string, string>, text?: string) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (text) node.textContent = text;
      svg.append(node);
      return node;
    };
    const line3D = (segments: Segment[], color: number) => {
      if (!segments.length) return;
      const geometry = new THREE.BufferGeometry().setFromPoints(segments.flat());
      this.guides.add(
        new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, depthTest: false })),
      );
    };
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: 0xffd57a,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const center = this.bounds.getCenter(new THREE.Vector3()).setComponent(this.axis, this.level);
    plane.position.copy(center);
    if (this.axis === 0) plane.rotation.y = Math.PI / 2;
    if (this.axis === 1) plane.rotation.x = -Math.PI / 2;
    this.guides.add(plane);
    this.sections.forEach((segments, i) => {
      const path = segments
        .map(
          ([a, b]) =>
            `M${a.getComponent(u)},${-a.getComponent(v)}L${b.getComponent(u)},${-b.getComponent(v)}`,
        )
        .join('');
      add('path', {
        d: path,
        fill: 'none',
        stroke: `#${colors[i].toString(16).padStart(6, '0')}`,
        'stroke-width': '2',
        'vector-effect': 'non-scaling-stroke',
        'data-outline': i === 0 ? 'before' : 'after',
        ...(i === 0 ? { 'stroke-dasharray': '6 3' } : {}),
      });
      line3D(segments, colors[i]);
    });
    const font = Math.max(width, height) / 36;
    add(
      'text',
      {
        x: String(this.svgBox.x + margin / 3),
        y: String(this.svgBox.y + font),
        fill: 'currentColor',
        'font-size': String(font),
      },
      `${'XYZ'[u]} →  ·  ${'XYZ'[v]} ↑`,
    );
    if (!this.sections.flat().length)
      add(
        'text',
        {
          x: String(center.getComponent(u)),
          y: String(-center.getComponent(v)),
          fill: 'currentColor',
          'font-size': String(font),
          'text-anchor': 'middle',
        },
        'No intersection at this position',
      );
    this.points.forEach((point, i) => {
      add('circle', {
        cx: String(point.getComponent(u)),
        cy: String(-point.getComponent(v)),
        r: String(font / 5),
        fill: '#f2b544',
      });
      add(
        'text',
        {
          x: String(point.getComponent(u) + font / 3),
          y: String(-point.getComponent(v) - font / 3),
          fill: 'currentColor',
          'font-size': String(font),
        },
        String(i + 1),
      );
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(this.span / 100, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd57a, depthTest: false }),
      );
      marker.position.copy(point);
      marker.renderOrder = 10;
      this.guides.add(marker);
    });
    if (this.points.length === 2) {
      const [a, b] = this.points;
      add('path', {
        d: `M${a.getComponent(u)},${-a.getComponent(v)}L${b.getComponent(u)},${-b.getComponent(v)}`,
        fill: 'none',
        stroke: '#d29525',
        'stroke-width': '2',
        'vector-effect': 'non-scaling-stroke',
      });
      line3D([[a, b]], 0xffd57a);
    }
    this.q('#section-measure').textContent =
      this.points.length === 2
        ? `Ruler: ${number(this.points[0].distanceTo(this.points[1]))} scene units · Straight-line distance between your selected outline points.`
        : this.points.length
          ? `Point 1: (${this.points[0].toArray().map(number).join(', ')}) · Choose a second outline point.`
          : '';
    this.q('#section-size').textContent =
      this.sections
        .map((segments, i) => {
          if (!segments.length) return `${i ? 'After' : 'Before'}: no intersection`;
          const bounds = new THREE.Box3()
            .setFromPoints(segments.flat())
            .getSize(new THREE.Vector3());
          return `${i ? 'After' : 'Before'}: ${number(bounds.getComponent(u))} × ${number(bounds.getComponent(v))}`;
        })
        .join('  →  ') + ' scene units';
    this.render();
  }
}
