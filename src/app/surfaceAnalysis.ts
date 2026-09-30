import { updateObjectChoice } from './objectChoice';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { readAnalysisGeometry, type AnalysisPair } from '../viewer/analysisGeometry';
import { affectsShape } from '../viewer/shapeGeometry';
import { sampleSurface, summarizeSurface, type SurfaceSample } from '../viewer/surfaceDeviation';
import type { ChangeRecord } from '../report/schema';

const fmt = (v: number) => Number(v.toPrecision(5)).toString();
const color = (value: number, max: number) =>
  new THREE.Color().setHSL((1 - Math.min(1, max ? value / max : 0)) * 0.66, 0.85, 0.52);

/** Surface distances share one measured-pair cache and an on-demand renderer. */
export class SurfaceAnalysis {
  private pairs: readonly AnalysisPair[] = [];
  private index = 0;
  private cached = -1;
  private samples: SurfaceSample[][] = [];
  private direction = 0;
  private controller?: AbortController;
  private pending?: Promise<void>;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private scene = new THREE.Scene();
  private model = new THREE.Group();
  private markers = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.001, 1e7);
  private span = 1;
  private selected?: number;
  private range = 0;
  private observer: ResizeObserver;
  get hasData() {
    return this.pairs.length > 0;
  }
  private host() {
    return this.heat;
  }
  private q<T extends Element = HTMLElement>(selector: string) {
    return this.heat.querySelector<T>(selector)!;
  }
  constructor(
    private heat: HTMLElement,
    private onSelectPair: (pair: AnalysisPair) => void = () => {},
  ) {
    heat.innerHTML = `<div class="surface-controls"><label>Object <select class="surface-object" aria-label="Surface object"></select></label><label>Surface <select class="surface-direction"><option value="0">Before → after</option><option value="1">After → before</option></select></label><button class="button quiet surface-fit">Fit</button></div>
      <div class="surface-body" hidden><div class="surface-views"><div class="surface-frame"><div class="surface-3d" aria-label="Surface deviation 3D view"></div><div class="surface-hud"><p class="surface-status" role="status"></p><div class="surface-scale"><span>0</span><i></i><span class="surface-max"></span><span>scene units</span></div><div class="surface-stats"></div></div></div></div><p class="surface-pick" aria-live="polite"></p><p class="surface-note">Unsigned nearest-surface distance sampled once per triangle, at its centre. Each face has one colour. Mean and RMS are area-weighted; maximum is sampled, not an exact worst case. Inspect both directions. World coordinates; no automatic alignment.</p></div>`;
    this.q('.surface-object').addEventListener('change', () => {
      this.index = Number(this.q<HTMLSelectElement>('.surface-object').value);
      this.cached = -1;
      this.controller?.abort();
      this.pending = undefined;
      this.onSelectPair(this.pairs[this.index]);
      void this.activate();
    });
    this.q('.surface-object').addEventListener('focus', () => {
      if (this.pairs[this.index]) this.onSelectPair(this.pairs[this.index]);
    });
    this.q('.surface-fit').addEventListener('click', () => this.fit());
    this.q('.surface-direction').addEventListener('change', () => {
      this.direction = Number(this.q<HTMLSelectElement>('.surface-direction').value);
      this.draw();
    });
    heat.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.selected = undefined;
        this.preview();
      }
    });
    this.scene.background = new THREE.Color('#101c29');
    this.scene.add(this.model, this.markers);
    this.observer = new ResizeObserver(() => requestAnimationFrame(() => this.resize()));
    this.observer.observe(this.q('.surface-3d'));
  }

  load(pairs: readonly AnalysisPair[]) {
    this.clear();
    this.pairs = pairs;
    this.q('.surface-object').replaceChildren(
      ...pairs.map((pair, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = pair.label;
        return option;
      }),
    );
    updateObjectChoice(this.q<HTMLSelectElement>('.surface-object'));
  }
  clear() {
    this.controller?.abort();
    this.pending = undefined;
    this.pairs = [];
    this.cached = -1;
    this.index = 0;
    this.samples = [];
    this.selected = undefined;
    this.dispose(this.model);
    this.dispose(this.markers);
    this.q<HTMLElement>('.surface-body').hidden = true;
    this.q('.surface-status').textContent = '';
  }
  selectPair(pair: AnalysisPair) {
    const index = this.pairs.indexOf(pair);
    if (index < 0 || index === this.index) return;
    this.index = index;
    this.cached = -1;
    this.controller?.abort();
    this.pending = undefined;
    this.q<HTMLSelectElement>('.surface-object').value = String(index);
  }
  select(changes: ChangeRecord[]) {
    const index = this.pairs.findIndex((pair) =>
      changes.some(
        (c) =>
          affectsShape(pair.before.path, c.beforeNode?.path) ||
          affectsShape(pair.after.path, c.afterNode?.path),
      ),
    );
    if (index >= 0 && index !== this.index) {
      this.index = index;
      this.cached = -1;
      this.controller?.abort();
      this.pending = undefined;
    }
  }
  async activate() {
    if (!this.hasData) return;
    this.onSelectPair(this.pairs[this.index]);
    this.q<HTMLSelectElement>('.surface-object').value = String(this.index);
    if (this.cached !== this.index) {
      this.q<HTMLElement>('.surface-body').hidden = false;
      this.q('.surface-status').textContent = 'Sampling both surfaces…';
      if (!this.pending) this.pending = this.measure();
      const pending = this.pending;
      try {
        await pending;
      } catch (error) {
        if (this.pending !== pending) return;
        this.q('.surface-status').textContent =
          error instanceof Error ? error.message : 'Surface analysis is unavailable.';
        this.pending = undefined;
        return;
      }
      if (this.pending !== pending) return;
      this.pending = undefined;
    }
    if (this.host().hidden || this.cached !== this.index) return;
    this.q('.surface-status').textContent =
      'Hover to inspect a face. Click to pin; Escape to clear.';
    this.q<HTMLElement>('.surface-body').hidden = false;
    try {
      this.ensureRenderer();
      this.q('.surface-3d').append(this.renderer!.domElement);
      this.draw();
      requestAnimationFrame(() => this.fit());
    } catch (error) {
      this.q('.surface-status').textContent =
        error instanceof Error ? error.message : '3D view unavailable.';
    }
  }
  private async measure() {
    const index = this.index,
      controller = new AbortController();
    this.controller = controller;
    const geometries: THREE.BufferGeometry[] = [];
    try {
      geometries.push(readAnalysisGeometry(this.pairs[index].before));
      geometries.push(readAnalysisGeometry(this.pairs[index].after));
      const before = await sampleSurface(geometries[0], geometries[1], controller.signal);
      const after = await sampleSurface(geometries[1], geometries[0], controller.signal);
      controller.signal.throwIfAborted();
      this.samples = [before, after];
      this.cached = index;
      this.selected = undefined;
      this.range = Math.max(summarizeSurface(before).max, summarizeSurface(after).max);
    } finally {
      geometries.forEach((g) => g.dispose());
    }
  }
  private source() {
    return this.samples[this.direction] ?? [];
  }
  private draw() {
    this.dispose(this.model);
    this.dispose(this.markers);
    this.selected = undefined;
    const samples = this.source();
    if (!samples.length) return;
    const positions = samples.flatMap((s) => s.vertices.flatMap((v) => v.toArray()));
    const colors = samples.flatMap((s) => {
      const rgb = color(s.distance, this.range).toArray();
      return [...rgb, ...rgb, ...rgb];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.model.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      ),
    );
    const stats = summarizeSurface(samples);
    this.q('.surface-max').textContent = fmt(this.range);
    this.q('.surface-stats').textContent =
      `Mean ${fmt(stats.mean)} · RMS ${fmt(stats.rms)} · Sampled max ${fmt(stats.max)} · ${samples.length} triangle samples`;
    this.q('.surface-pick').textContent = '';
    this.render();
  }
  private restoreSelection() {
    this.preview(this.source().find((s) => s.triangle === this.selected));
  }
  private preview(sample?: SurfaceSample) {
    this.dispose(this.markers);
    const host = this.q<HTMLElement>('.surface-3d');
    if (sample) host.dataset.highlightedTriangle = String(sample.triangle);
    else delete host.dataset.highlightedTriangle;
    if (sample) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([...sample.vertices, sample.vertices[0]]),
        new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
      );
      line.renderOrder = 5;
      this.markers.add(line);
      const gap = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([sample.center, sample.nearest]),
        new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
      );
      gap.renderOrder = 5;
      this.markers.add(gap);
    }
    this.q('.surface-pick').textContent = sample
      ? 'Triangle ' +
        (sample.triangle + 1) +
        ' · Sampled gap ' +
        fmt(sample.distance) +
        ' scene units · Face area ' +
        fmt(sample.area) +
        ' squared scene units' +
        (sample.triangle === this.selected ? ' · Pinned' : '')
      : '';
    this.render();
  }
  private pick(sample: SurfaceSample) {
    this.selected = sample.triangle;
    this.preview(sample);
  }
  private hitAt(event: PointerEvent) {
    const bounds = this.renderer!.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = ray.intersectObjects(this.model.children)[0];
    return hit?.faceIndex != null ? this.source()[hit.faceIndex] : undefined;
  }
  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.render());
    let down = [0, 0];
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      down = [e.clientX, e.clientY];
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (e.button || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      const sample = this.hitAt(e);
      if (sample) this.pick(sample);
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') return;
      const sample = this.hitAt(e);
      if (sample) this.preview(sample);
      else this.restoreSelection();
    });
    this.renderer.domElement.addEventListener('pointerleave', () => this.restoreSelection());
  }

  private fit() {
    if (!this.controls || !this.model.children.length || this.host().hidden) return;
    this.resize();
    const bounds = new THREE.Box3().setFromObject(this.model),
      center = bounds.getCenter(new THREE.Vector3());
    this.span = bounds.getSize(new THREE.Vector3()).length();
    this.camera.near = Math.max(this.span / 10000, 1e-10);
    this.camera.far = this.span * 100;
    this.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(0.8, 0.6, 1.2)
          .normalize()
          .multiplyScalar((this.span * 1.7) / Math.min(1, this.camera.aspect)),
      );
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.render();
  }
  private resize() {
    if (!this.renderer || this.host().hidden) return;
    const host = this.q<HTMLElement>('.surface-3d'),
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
    if (this.renderer && !this.host().hidden) this.renderer.render(this.scene, this.camera);
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
