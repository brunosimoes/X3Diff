import { Box3 } from 'three';
import { gatherAnalysisFacts } from '../report/analysisFacts';
import { volumeMethod } from '../report/volumeMethod';
import { SURFACE_LIMITS, VOLUME_LIMITS } from '../report/limits';
import { readAnalysisGeometry, type AnalysisPair } from '../viewer/analysisGeometry';
import {
  affectsShape,
  parsePrimitives,
  shapeLabel,
  type VolumeResolution,
} from '../viewer/shapeGeometry';
import type { SolidRegionsResult } from '../viewer/solidRegions';
import { sampleSurface, summarizeSurface, type SurfaceSample } from '../viewer/surfaceDeviation';
import { hasMeasurableVolumes, summarizeVolumes } from '../viewer/volumeMetrics';
import { COLORS } from './calmScene';
import { sliceTab } from './sliceTab';
import {
  captionText,
  CONTEXT,
  ghostScene,
  chip,
  emptyScene,
  facts,
  icon,
  keepFocus,
  n,
  signed,
  field,
  make,
  measurementLimits,
  matte,
  select,
  serialize,
  viewpoint,
  type Tab,
  type Workbench,
} from './ui';

/** Matched objects whose outline changed: the same rule the workbench uses for these views. */
function findPairs(wb: Workbench): AnalysisPair[] {
  const before = parsePrimitives(wb.texts[0]),
    after = parsePrimitives(wb.texts[1]);
  const byDef = new Map(after.filter((item) => item.def).map((item) => [item.def!, item]));
  const byPath = new Map(after.map((item) => [item.path, item]));
  const pairs: AnalysisPair[] = [];
  for (const item of before) {
    const match = item.def ? byDef.get(item.def) : byPath.get(item.path);
    if (!match) continue;
    if (!item.def && (match.def || match.geometry.localName !== item.geometry.localName)) continue;
    const related = wb.report.changes.filter(
      (c) =>
        affectsShape(item.path, c.beforeNode?.path) || affectsShape(match.path, c.afterNode?.path),
    );
    const outline = related.some(
      (c) =>
        c.confidence !== 'low' &&
        (['geometry', 'transform'].includes(c.category) || c.kind === 'nodeMoved'),
    );
    const unsure = related.some(
      (c) =>
        c.confidence === 'low' || ['nodeAdded', 'nodeRemoved', 'nodeReplaced'].includes(c.kind),
    );
    if (!outline || unsure) continue;
    if (!item.def && related.some((c) => c.category === 'structure')) continue;
    try {
      for (const shape of [item, match]) readAnalysisGeometry(shape).dispose();
    } catch {
      continue;
    }
    pairs.push({ before: item, after: match, label: shapeLabel(item) });
  }
  return pairs;
}

const REGIONS = [
  ['BEFORE_ONLY', 'A ∖ B', 'removed', 'Space only the original fills'],
  ['SHARED', 'A ∩ B', 'unchanged', 'Space both fill'],
  ['AFTER_ONLY', 'B ∖ A', 'added', 'Space only the revised fills'],
] as const;
type Region = (typeof REGIONS)[number][0];

/** Slice, volume and surface views of one matched object. They share the object choice. */
export function geometryTabs(wb: Workbench): Tab[] {
  const pairs = findPairs(wb);
  let index = 0;
  let seenSelection = -1;
  let selectionNote = '';
  const syncSelection = () => {
    if (seenSelection === wb.selection.version) return;
    seenSelection = wb.selection.version;
    selectionNote = '';
    if (!wb.selection.label) return;
    const next = wb.selection.pairIndex(pairs);
    if (next >= 0) index = next;
    else
      selectionNote = `“${wb.selection.label}” does not identify one measurable object pair. Showing ${pairs[index]?.label ?? 'the selected object'}; choose an Object below.`;
  };
  const pair = () => pairs[index];
  const related = () =>
    wb.report.changes.filter(
      (change) =>
        affectsShape(pair().before.path, change.beforeNode?.path) ||
        affectsShape(pair().after.path, change.afterNode?.path),
    );
  const picker = (again: () => void) =>
    (() => {
      syncSelection();
      const control = field(
        'Object',
        select(
          pairs.map((item) => item.label),
          index,
          (next) => {
            index = next;
            wb.selection.selectPair(pair(), related());
            seenSelection = wb.selection.version;
            selectionNote = '';
            again();
          },
        ),
      );
      if (!selectionNote) return control;
      const group = make('div');
      const note = make('p', 'selection-note', selectionNote);
      note.setAttribute('role', 'status');
      group.append(note, control);
      return group;
    })();
  const geometries = () => [
    readAnalysisGeometry(pair().before),
    readAnalysisGeometry(pair().after),
  ];
  const frame = () => {
    const both = geometries();
    const box = new Box3().union(both[0].boundingBox!).union(both[1].boundingBox!);
    for (const geometry of both) geometry.dispose();
    return box;
  };
  // One object on its own loses its place in the scene: keep the scene around it as a ghost.
  let surroundings = true;
  const ghost = (doc: Document) =>
    ghostScene(wb, doc, [`A_${pair().after.shape.getAttribute('DEF')}`]);
  const applySurroundings = () => {
    try {
      wb.scene().getNamedNode(CONTEXT).whichChoice = surroundings ? 0 : -1;
    } catch {}
  };
  const surroundingsChip = (redraw: () => void) =>
    chip(
      'unchanged',
      'Scene',
      surroundings,
      () => {
        surroundings = !surroundings;
        keepFocus(wb.footer, redraw);
        applySurroundings();
      },
      'The rest of the scene, as a ghost',
    );
  const views = (again: () => void) => [
    icon('focus', 'Zoom to object', again),
    icon('fit', 'Fit scene', () => wb.pane.refreshView(true)),
  ];

  const slice = sliceTab(wb, { pairs, pair, picker, syncSelection });

  // Volume differences: lost, shared and gained space, in the colours of removed and added.
  const solids = new Map<string, SolidRegionsResult | null>();
  const solidKey = () => `${index}:${wb.volumeResolution}`;
  const resolutions: VolumeResolution[] = ['low', 'medium', 'high'];
  /** Unset follows the measurement: on for a mesh on a grid, off for exact solids. */
  let wholeObject: boolean | undefined;
  const regionShown: Record<Region, boolean> = {
    BEFORE_ONLY: true,
    SHARED: true,
    AFTER_ONLY: true,
  };
  const volume: Tab = {
    id: 'volume',
    label: 'Volume differences',
    short: 'Volume',
    available: () => pairs.length > 0,
    facts: () => {
      syncSelection();
      return gatherAnalysisFacts({
        before: wb.texts[0],
        after: wb.texts[1],
        report: wb.report,
        pairs,
        pair: pair(),
        resolution: wb.volumeResolution,
        solid: solids.get(solidKey()) ?? undefined,
        motion: { facts: () => [] },
      });
    },
    async show(alive) {
      syncSelection();
      wb.setFlat(false);
      wb.tools.replaceChildren(...views(() => void volume.show(alive)));
      if (!solids.has(solidKey())) {
        const key = solidKey();
        captionText(wb.caption, pair().label, 'Measuring…');
        const { buildSolidRegions } = await import('../viewer/solidRegions');
        if (!alive() || key !== solidKey()) return;
        let built: SolidRegionsResult | null = null;
        try {
          built = buildSolidRegions(wb.texts[0], wb.texts[1], wb.report, wb.volumeResolution, {
            before: pair().before.path,
            after: pair().after.path,
          });
          // An open surface encloses nothing: zero volume is "cannot be measured", not a result.
          if (built && !hasMeasurableVolumes(built.volumes)) built = null;
        } catch {
          built = null;
        }
        solids.set(solidKey(), built);
      }
      const result = solids.get(solidKey());
      wb.side.replaceChildren(
        make('h2', '', 'Volume'),
        picker(() => void volume.show(alive)),
        field(
          'Resolution',
          select(
            ['Low · faster', 'Medium', 'High · finer'],
            resolutions.indexOf(wb.volumeResolution),
            (next) => {
              wb.setVolumeResolution(resolutions[next]);
            },
          ),
        ),
      );
      if (!result) {
        captionText(wb.caption, pair().label, 'No closed solid to measure');
        wb.footer.replaceChildren();
        wb.pane.clear();
        return;
      }
      const palette = COLORS[wb.theme];
      // A mesh is measured on a grid of blocks: keep the shared blocks see-through so the
      // real surfaces behind them stay readable.
      const blocks = result.method === 'voxel';
      // On exact solids the object's surfaces coincide with the regions and only add noise.
      const mesh = () => wholeObject ?? blocks;
      const looks: Record<string, [string, number]> = {
        X3DIFF_BEFORE_ONLY: [palette.removed.diffuse, 0],
        X3DIFF_SHARED: [palette.unchanged.diffuse, blocks ? 0.7 : 0],
        X3DIFF_AFTER_ONLY: [palette.added.diffuse, 0],
        X3DIFF_BEFORE_CONTEXT: [
          wb.theme === 'dark' ? '0.62 0.67 0.73' : '0.36 0.41 0.47',
          blocks ? 0.45 : 0.7,
        ],
        X3DIFF_AFTER_CONTEXT: [palette.changed.diffuse, blocks ? 0.5 : 0.74],
      };
      const source = new DOMParser().parseFromString(result.xml, 'application/xml');
      const { doc, scene } = emptyScene();
      const group = doc.importNode(
        source.querySelector('[DEF="X3DIFF_VOLUME_PAIR"]')!,
        true,
      ) as Element;
      for (const shape of Array.from(group.getElementsByTagName('Shape'))) {
        const look = looks[shape.getAttribute('DEF') ?? ''] ?? [palette.unchanged.diffuse, 0.85];
        shape.getElementsByTagName('Appearance')[0]?.replaceWith(matte(doc, ...look));
      }
      scene.append(viewpoint(doc, frame()), ghost(doc), group);
      const totals = summarizeVolumes(result.volumes);
      captionText(
        wb.caption,
        pair().label,
        totals.retained === null
          ? `V ${n(totals.before)} → ${n(totals.after)}`
          : `A ∩ B / A = ${n(totals.retained)} %`,
      );
      wb.side.append(
        make('h2', '', 'Regions · units³'),
        facts([
          ['A ∖ B', n(result.volumes.beforeOnly), 'removed', 'Space only the original fills'],
          ['A ∩ B', n(result.volumes.shared), 'unchanged', 'Space both fill'],
          ['B ∖ A', n(result.volumes.afterOnly), 'added', 'Space only the revised fills'],
        ]),
        make('h2', '', 'Volume'),
        facts([
          ['V(A)', n(totals.before), '', 'Volume of the original'],
          ['V(B)', n(totals.after), '', 'Volume of the revised'],
          ['ΔV', signed(totals.net), '', 'Net change in volume'],
        ]),
        make(
          'p',
          'foot',
          result.method === 'voxel'
            ? '≈ sampled on a grid'
            : result.approximate
              ? '≈ curved surfaces as flat facets'
              : '= exact solids',
        ),
        make('p', 'foot', volumeMethod(result)),
        measurementLimits(VOLUME_LIMITS),
      );
      const apply = () => {
        for (const [name] of REGIONS)
          try {
            wb.scene().getNamedNode(`X3DIFF_${name}_VISIBILITY`).whichChoice = regionShown[name]
              ? 0
              : -1;
          } catch {}
        // The object's own surfaces, faint, so the regions are read against the real shape.
        for (const name of ['BEFORE_CONTEXT', 'AFTER_CONTEXT'])
          try {
            wb.scene().getNamedNode(`X3DIFF_${name}_VISIBILITY`).whichChoice = mesh() ? 0 : -1;
          } catch {}
      };
      const legend = () =>
        wb.footer.replaceChildren(
          ...REGIONS.map(([name, label, kind, title]) =>
            chip(
              kind,
              label,
              regionShown[name],
              () => {
                regionShown[name] = !regionShown[name];
                keepFocus(wb.footer, legend);
                apply();
              },
              title,
            ),
          ),
          chip(
            'outline',
            'Mesh',
            mesh(),
            () => {
              wholeObject = !mesh();
              keepFocus(wb.footer, legend);
              apply();
            },
            'The surfaces of the object itself, behind the regions',
          ),
          surroundingsChip(legend),
        );
      legend();
      await wb.pane.load(serialize(doc));
      if (!alive()) return;
      apply();
      applySurroundings();
    },
  };

  // Surface deviation: one hue from "no gap" to "largest gap", not a rainbow.
  let direction = 0,
    measuring = 0;
  const samples = new Map<string, SurfaceSample[]>();
  const deviation: Tab = {
    id: 'deviation',
    label: 'Surface deviation',
    short: 'Surface',
    available: () => pairs.length > 0,
    async show(alive) {
      syncSelection();
      // Choosing another object while one is being measured starts a second run: only the
      // latest may write to the stage and the panel.
      const mine = ++measuring;
      wb.setFlat(false);
      const again = () => void deviation.show(alive);
      wb.tools.replaceChildren(...views(again));
      wb.side.replaceChildren(
        make('h2', '', 'Surface'),
        picker(again),
        field(
          'From',
          select(['A → B', 'B → A'], direction, (next) => {
            direction = next;
            again();
          }),
        ),
      );
      const key = `${index}:${direction}`;
      if (!samples.has(key)) {
        captionText(wb.caption, pair().label, 'Measuring…');
        const [before, after] = geometries();
        try {
          samples.set(
            key,
            await sampleSurface(direction ? after : before, direction ? before : after),
          );
        } finally {
          before.dispose();
          after.dispose();
        }
        if (!alive() || mine !== measuring) return;
      }
      const measured = samples.get(key)!;
      const stats = summarizeSurface(measured);
      const numbers = (text: string) => text.split(' ').map(Number);
      const stops = [
        numbers(COLORS[wb.theme].unchanged.diffuse),
        numbers(COLORS[wb.theme].changed.diffuse),
        wb.theme === 'dark' ? [0.86, 0.93, 1] : [0.04, 0.16, 0.4],
      ];
      const ramp = (t: number) => {
        const [from, to] = t < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
        const mix = t < 0.5 ? t * 2 : t * 2 - 1;
        return from.map((value, i) => value + (to[i] - value) * mix);
      };
      const points: string[] = [],
        colors: string[] = [],
        faces: string[] = [];
      measured.forEach((sample, i) => {
        const color = ramp(stats.max > 0 ? sample.distance / stats.max : 0)
          .map((value) => value.toFixed(3))
          .join(' ');
        for (const vertex of sample.vertices) {
          points.push(
            vertex
              .toArray()
              .map((value) => +value.toFixed(5))
              .join(' '),
          );
          colors.push(color);
        }
        faces.push(`${i * 3} ${i * 3 + 1} ${i * 3 + 2} -1`);
      });
      const { doc, scene } = emptyScene();
      const shape = doc.createElement('Shape');
      const mesh = doc.createElement('IndexedFaceSet');
      mesh.setAttribute('solid', 'false');
      mesh.setAttribute('coordIndex', faces.join(' '));
      const coordinate = doc.createElement('Coordinate');
      coordinate.setAttribute('point', points.join(' '));
      const color = doc.createElement('Color');
      color.setAttribute('color', colors.join(' '));
      mesh.append(coordinate, color);
      shape.append(matte(doc, '1 1 1'), mesh);
      scene.append(viewpoint(doc, frame()), ghost(doc), shape);
      captionText(wb.caption, pair().label, `max d ≈ ${n(stats.max)}, sampled`);
      wb.side.append(
        make('h2', '', 'Distance d · units'),
        facts([
          ['max d', n(stats.max), '', 'Largest sampled distance between the surfaces'],
          ['mean d', n(stats.mean), '', 'Area-weighted average distance'],
          ['RMS d', n(stats.rms), '', 'Area-weighted root mean square distance'],
        ]),
        make('p', 'foot', `n = ${measured.length} · 1 per triangle, so max d is a lower bound`),
        measurementLimits(SURFACE_LIMITS),
      );
      const scale = make('span', 'scale');
      const rgb = (value: number[]) =>
        `rgb(${value.map((part) => Math.round(part * 255)).join(' ')})`;
      scale.style.background = `linear-gradient(to right, ${stops.map(rgb).join(', ')})`;
      const legend = (): void =>
        wb.footer.replaceChildren('d = 0', scale, n(stats.max), surroundingsChip(legend));
      legend();
      await wb.pane.load(serialize(doc));
      if (alive()) applySurroundings();
    },
  };
  return [slice, volume, deviation];
}
