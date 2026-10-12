import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SECTION_LIMITS } from '../report/limits';
import { readAnalysisGeometry, type AnalysisPair } from '../viewer/analysisGeometry';
import {
  closestOnSection,
  planeAxes,
  sliceGeometry,
  type Axis,
  type Segment,
} from '../viewer/sections';
import {
  button,
  captionText,
  chip,
  facts,
  icon,
  n,
  signed,
  field,
  make,
  select,
  setIcon,
  svg,
  type Tab,
  type Workbench,
} from './ui';

const AXES: Array<[Axis, string]> = [
  [2, 'XY · Front'],
  [1, 'XZ · From below'],
  [0, 'ZY · Side'],
];
const cssColor = (name: string) =>
  new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());

/**
 * Slice and measure: where the cut sits on the object, and the outline it leaves, side by side.
 * Place the cut on a surface, sweep it, and measure between two points.
 */
export function sliceTab(
  wb: Workbench,
  objects: {
    pairs: AnalysisPair[];
    pair(): AnalysisPair;
    picker(again: () => void): HTMLElement;
    syncSelection(): void;
  },
): Tab {
  let axis: Axis = 2,
    position = 0.5,
    level = 0,
    span = 1;
  let geometries: THREE.BufferGeometry[] = [];
  let sections: Segment[][] = [];
  let points: THREE.Vector3[] = [];
  const bounds = new THREE.Box3();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 1e7);
  const models = new THREE.Group(),
    guides = new THREE.Group();
  scene.add(models, guides);
  let renderer: THREE.WebGLRenderer | undefined;
  let controls: OrbitControls | undefined;
  let observer: ResizeObserver | undefined;
  const where = make('div', 'slice-3d');
  const drawing = svg('svg', { class: 'section', role: 'img' }) as SVGSVGElement;
  drawing.setAttribute('aria-label', 'Before and after cross-section outlines');
  const slider = make('input');
  slider.type = 'range';
  slider.min = '0.001';
  slider.max = '0.999';
  slider.step = '0.001';
  const sizes = make('div'),
    ruler = make('p', 'readout'),
    levelOut = make('p', 'readout');
  // Side by side on a wide stage, one above the other on a narrow one; the reviewer can flip it.
  let stacked = matchMedia('(max-width: 900px)').matches;
  const clearRuler = button('× d', () => {
    points = [];
    draw();
  });

  const render = () => renderer?.render(scene, camera);
  const empty = (group: THREE.Group, keepGeometry = false) => {
    for (const child of [...group.children]) {
      const mesh = child as THREE.Mesh;
      if (!keepGeometry) mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
      group.remove(child);
    }
  };
  function resize(): void {
    if (!renderer || !where.clientWidth || !where.clientHeight) return;
    renderer.setSize(where.clientWidth, where.clientHeight);
    camera.aspect = where.clientWidth / where.clientHeight;
    camera.updateProjectionMatrix();
    render();
  }
  function fit(): void {
    if (!controls) return;
    resize();
    const centre = bounds.getCenter(new THREE.Vector3());
    camera.near = Math.max(span / 10000, 1e-10);
    camera.far = span * 100;
    // Stand back just far enough that every corner of the pair is inside the view. A long
    // object in a wide pane then fills its width, instead of being sized to the pane's height.
    const towards = new THREE.Vector3(0.9, 0.65, 1.2).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), towards).normalize();
    const up = new THREE.Vector3().crossVectors(towards, right);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new THREE.Vector3(x, y, z).sub(centre);
          const depth = corner.dot(towards);
          distance = Math.max(
            distance,
            depth + Math.abs(corner.dot(up)) / tangent,
            depth + Math.abs(corner.dot(right)) / (tangent * camera.aspect),
          );
        }
    camera.position.copy(centre).addScaledVector(towards, distance * 1.18);
    camera.updateProjectionMatrix();
    controls.target.copy(centre);
    controls.update();
    render();
  }
  function ensureRenderer(): void {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', 'Where the cut sits on the object');
    where.append(canvas);
    controls = new OrbitControls(camera, canvas);
    controls.addEventListener('change', render);
    let down = { x: 0, y: 0 };
    canvas.addEventListener(
      'pointerdown',
      (event) => (down = { x: event.clientX, y: event.clientY }),
    );
    // A click, not a drag, on a surface moves the cut there and starts the ruler at that point.
    canvas.addEventListener('pointerup', (event) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4 || event.button !== 0)
        return;
      const rect = canvas.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(models.children)[0];
      const extent = bounds.max.getComponent(axis) - bounds.min.getComponent(axis);
      if (!hit || extent <= 0) return;
      position = Math.max(
        0.001,
        Math.min(0.999, (hit.point.getComponent(axis) - bounds.min.getComponent(axis)) / extent),
      );
      slider.value = String(position);
      cut();
      const nearest = closestOnSection(hit.point, sections.flat());
      if (nearest) {
        points = [nearest];
        draw();
      }
    });
    observer = new ResizeObserver(() => requestAnimationFrame(resize));
    observer.observe(where);
  }

  function cut(): void {
    points = [];
    level = THREE.MathUtils.lerp(
      bounds.min.getComponent(axis),
      bounds.max.getComponent(axis),
      position,
    );
    sections = geometries.map((geometry) =>
      sliceGeometry(geometry, axis, level, Math.max(span * 1e-8, 1e-12)),
    );
    draw();
  }

  function draw(): void {
    if (geometries.length !== 2) return;
    empty(guides);
    const colors = [cssColor('--outline'), cssColor('--changed')];
    const rulerColor = cssColor('--ruler');
    const [u, v] = planeAxes(axis);
    const size = bounds.getSize(new THREE.Vector3());
    const margin = Math.max(size.getComponent(u), size.getComponent(v), span * 0.05) * 0.08;
    const width = size.getComponent(u) + 2 * margin,
      height = size.getComponent(v) + 2 * margin;
    const left = bounds.min.getComponent(u) - margin,
      top = -bounds.max.getComponent(v) - margin;
    drawing.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
    drawing.replaceChildren();
    const line3D = (segments: Segment[], color: THREE.Color) => {
      if (!segments.length) return;
      guides.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(segments.flat()),
          new THREE.LineBasicMaterial({ color, depthTest: false }),
        ),
      );
    };
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: cssColor('--accent'),
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const centre = bounds.getCenter(new THREE.Vector3()).setComponent(axis, level);
    plane.position.copy(centre);
    if (axis === 0) plane.rotation.y = Math.PI / 2;
    if (axis === 1) plane.rotation.x = -Math.PI / 2;
    guides.add(plane);
    const path = (segments: Segment[]) =>
      segments
        .map(
          ([a, b]) =>
            `M${a.getComponent(u)},${-a.getComponent(v)}L${b.getComponent(u)},${-b.getComponent(v)}`,
        )
        .join('');
    sections.forEach((segments, side) => {
      drawing.append(svg('path', { d: path(segments), class: side ? 'after' : 'before' }));
      line3D(segments, colors[side]);
    });
    const font = Math.max(width, height) / 38;
    const label = (text: string, x: number, y: number, anchor = 'start') => {
      const node = svg('text', { x, y, 'font-size': font, 'text-anchor': anchor });
      node.textContent = text;
      drawing.append(node);
    };
    label(`${'XYZ'[u]} →  ·  ${'XYZ'[v]} ↑`, left + margin / 3, top + height - margin / 3);
    if (!sections.flat().length)
      label(
        'No intersection at this position',
        centre.getComponent(u),
        -centre.getComponent(v),
        'middle',
      );
    points.forEach((point, i) => {
      drawing.append(
        svg('circle', {
          cx: point.getComponent(u),
          cy: -point.getComponent(v),
          r: font / 4,
          class: 'ruler-point',
        }),
      );
      label(String(i + 1), point.getComponent(u) + font / 3, -point.getComponent(v) - font / 3);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(span / 100, 12, 8),
        new THREE.MeshBasicMaterial({ color: rulerColor, depthTest: false }),
      );
      marker.position.copy(point);
      marker.renderOrder = 10;
      guides.add(marker);
    });
    if (points.length === 2) {
      drawing.append(svg('path', { d: path([[points[0], points[1]]]), class: 'ruler' }));
      line3D([[points[0], points[1]]], rulerColor);
    }
    const extent = (segments: Segment[]) => {
      if (!segments.length) return undefined;
      const box = new THREE.Box3().setFromPoints(segments.flat()).getSize(new THREE.Vector3());
      return [box.getComponent(u), box.getComponent(v)];
    };
    const [a, b] = sections.map(extent);
    const sizeOf = (value?: number[]) => (value ? `${n(value[0])} × ${n(value[1])}` : '∅');
    const rows: Array<[string, string, string?, string?]> = [
      ['A', sizeOf(a), 'outline', 'Outline of the original at this cut'],
      ['B', sizeOf(b), 'changed', 'Outline of the revised at this cut'],
    ];
    if (a && b)
      rows.push(['Δ', `${signed(b[0] - a[0])} × ${signed(b[1] - a[1])}`, '', 'B minus A']);
    sizes.replaceChildren(facts(rows));
    ruler.textContent =
      points.length === 2
        ? `d = |P₁P₂| = ${n(points[0].distanceTo(points[1]))}`
        : points.length
          ? `P₁ (${points[0].toArray().map(n).join(', ')}) → P₂ ?`
          : 'P₁ → P₂ : click two outline points';
    clearRuler.hidden = !points.length;
    captionText(wb.caption, objects.pair().label);
    levelOut.textContent = `${'xyz'[axis]} = ${n(level)}`;
    render();
  }

  drawing.addEventListener('click', (event) => {
    const matrix = drawing.getScreenCTM();
    if (!matrix || geometries.length !== 2) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const [u, v] = planeAxes(axis);
    const point = new THREE.Vector3();
    point.setComponent(axis, level).setComponent(u, p.x).setComponent(v, -p.y);
    const nearest = closestOnSection(point, sections.flat());
    if (!nearest) return;
    if (points.length === 2) points = [];
    points.push(nearest);
    draw();
  });
  slider.addEventListener('input', () => {
    position = Number(slider.value);
    cut();
  });

  const tab: Tab = {
    id: 'sections',
    label: 'Slice and measure',
    short: 'Slice',
    available: () => objects.pairs.length > 0,
    hide() {
      empty(models);
      empty(guides);
      geometries = [];
      wb.flat.replaceChildren();
      wb.flat.classList.remove('split');
    },
    // A browser keeps only so many WebGL contexts: hand this one back with the comparison.
    dispose() {
      observer?.disconnect();
      controls?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
      renderer = controls = observer = undefined;
    },
    async show() {
      objects.syncSelection();
      const again = () => void tab.show(() => true);
      wb.setFlat(true);
      empty(models);
      empty(guides);
      geometries = [objects.pair().before, objects.pair().after].map(readAnalysisGeometry);
      bounds.copy(geometries[0].boundingBox!).union(geometries[1].boundingBox!);
      span = bounds.getSize(new THREE.Vector3()).length();
      const colors = [cssColor('--outline'), cssColor('--changed')];
      geometries.forEach((geometry, side) =>
        models.add(
          new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: colors[side],
              transparent: true,
              opacity: 0.2,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          ),
        ),
      );
      const pane = (node: Element, title: string, hint: string) => {
        const card = make('div', 'slice-pane');
        const heading = make('p', 'slice-title', title);
        heading.title = hint;
        card.append(heading, node);
        return card;
      };
      wb.flat.classList.add('split');
      wb.flat.classList.toggle('rows', stacked);
      wb.flat.replaceChildren(
        pane(where, '3D', 'Drag to orbit. Click a surface to place the cut.'),
        pane(drawing, '2D', 'Click two outline points to measure.'),
      );
      ensureRenderer();
      slider.value = String(position);
      const layout = icon(stacked ? '▥' : '▤', '', () => {
        stacked = !stacked;
        wb.flat.classList.toggle('rows', stacked);
        label();
      });
      const label = () => {
        setIcon(layout, stacked ? '▥' : '▤', stacked ? 'Side by side' : 'Stack views');
      };
      label();
      wb.tools.replaceChildren(layout, icon('focus', 'Zoom to object', fit));
      wb.footer.replaceChildren(
        chip('outline', 'A', true, undefined, 'Original outline'),
        chip('changed', 'B', true, undefined, 'Revised outline'),
        chip('ruler', 'd', true, undefined, 'Ruler'),
      );
      const limits = make('details', 'limits');
      limits.append(make('summary', '', 'ⓘ How this is measured'), make('p', '', SECTION_LIMITS));
      wb.side.replaceChildren(
        make('h2', '', 'Slice'),
        objects.picker(again),
        field(
          'Plane',
          select(
            AXES.map(([, label]) => label),
            AXES.findIndex(([value]) => value === axis),
            (next) => {
              axis = AXES[next][0];
              position = 0.5;
              again();
            },
          ),
        ),
        field('Cut', slider),
        levelOut,
        make('h2', '', 'Outline · w × h'),
        sizes,
        make('h2', '', 'Ruler · d'),
        ruler,
        clearRuler,
        limits,
      );
      cut();
      requestAnimationFrame(fit);
    },
  };
  return tab;
}
