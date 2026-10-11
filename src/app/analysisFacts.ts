import { Vector3 } from 'three';
import type { AnalysisFacts } from '../report/export-html';
import { SECTION_LIMITS, SURFACE_LIMITS, VOLUME_LIMITS } from '../report/limits';
import type { X3DiffReport } from '../report/schema';
import { readAnalysisGeometry, type AnalysisPair } from '../viewer/analysisGeometry';
import type { VolumeResolution } from '../viewer/shapeGeometry';
import type { SolidRegionsResult } from '../viewer/solidRegions';
import { sampleSurface, summarizeSurface } from '../viewer/surfaceDeviation';
import { summarizeVolumes } from '../viewer/volumeMetrics';
import type { MotionAnalysis } from './motionAnalysis';
import { volumeMethod } from './volumeSummary';

const fmt = (v: number) => Number(v.toPrecision(5)).toString();
const reason = (error: unknown) =>
  error instanceof Error ? error.message : 'the measurement failed';

export interface FactsRequest {
  before: string;
  after: string;
  report: X3DiffReport;
  /** Every object pair the geometry views can measure. */
  pairs: readonly AnalysisPair[];
  /** The pair selected in the workbench; the geometry numbers are for this one. */
  pair?: AnalysisPair;
  resolution: VolumeResolution;
  /** Volume regions already computed for the selected pair, if the tab has been opened. */
  solid?: SolidRegionsResult;
  motion: MotionAnalysis;
}

/**
 * The key numbers of the analysis views that are available for this pair, for the printable
 * report. Geometry views measure one object at a time, so the numbers are for the object
 * selected in the workbench; Motion paths lists every object whose motion differs.
 */
export async function gatherAnalysisFacts(request: FactsRequest): Promise<AnalysisFacts[]> {
  const facts: AnalysisFacts[] = [];
  const { pair } = request;
  if (pair) {
    const others = request.pairs.length - 1;
    const note =
      others > 0
        ? `Measured for the object selected in the workbench. ${others} other changed object${others === 1 ? '' : 's'} can be measured there.`
        : 'This is the one changed object these views can measure.';

    // Slice & measure: the overall extents of the two outlines' source geometry.
    try {
      const size = (item: AnalysisPair['before']) => {
        const geometry = readAnalysisGeometry(item);
        try {
          return geometry.boundingBox!.getSize(new Vector3());
        } finally {
          geometry.dispose();
        }
      };
      const a = size(pair.before),
        b = size(pair.after);
      const triple = (v: Vector3) => `${fmt(v.x)} × ${fmt(v.y)} × ${fmt(v.z)}`;
      const delta = (n: number) => `${n > 0 ? '+' : ''}${fmt(Math.abs(n) < 1e-9 ? 0 : n)}`;
      facts.push({
        view: 'Slice & measure',
        object: pair.label,
        note,
        rows: [
          ['Before extents along X × Y × Z (scene units)', triple(a)],
          ['After extents along X × Y × Z (scene units)', triple(b)],
          ['Change in extents', `${delta(b.x - a.x)} × ${delta(b.y - a.y)} × ${delta(b.z - a.z)}`],
        ],
        limits: `${SECTION_LIMITS} These are the extents of the whole object along the world axes; the view measures any cross-section interactively.`,
      });
    } catch (error) {
      facts.push({
        view: 'Slice & measure',
        object: pair.label,
        rows: [],
        unavailable: reason(error),
        limits: SECTION_LIMITS,
      });
    }

    // Surface deviation: both directions, as the view samples them.
    const geometries = [];
    try {
      geometries.push(readAnalysisGeometry(pair.before), readAnalysisGeometry(pair.after));
      const forward = summarizeSurface(await sampleSurface(geometries[0], geometries[1]));
      const backward = summarizeSurface(await sampleSurface(geometries[1], geometries[0]));
      const line = (s: typeof forward) =>
        `mean ${fmt(s.mean)} · RMS ${fmt(s.rms)} · sampled max ${fmt(s.max)}`;
      facts.push({
        view: 'Surface deviation',
        object: pair.label,
        note,
        rows: [
          ['Before → after (scene units)', line(forward)],
          ['After → before (scene units)', line(backward)],
        ],
        limits: SURFACE_LIMITS,
      });
    } catch (error) {
      facts.push({
        view: 'Surface deviation',
        object: pair.label,
        rows: [],
        unavailable: reason(error),
        limits: SURFACE_LIMITS,
      });
    } finally {
      geometries.forEach((geometry) => geometry.dispose());
    }

    // Volume differences: reuse the regions on screen, or compute them for this pair.
    try {
      let solid =
        request.solid?.pairPaths.before === pair.before.path &&
        request.solid.pairPaths.after === pair.after.path
          ? request.solid
          : undefined;
      if (!solid) {
        const { buildSolidRegions } = await import('../viewer/solidRegions');
        solid =
          buildSolidRegions(request.before, request.after, request.report, request.resolution, {
            before: pair.before.path,
            after: pair.after.path,
          }) ?? undefined;
      }
      if (!solid) throw new Error('no supported matched geometry pair for a volume comparison');
      const summary = summarizeVolumes(solid.volumes);
      facts.push({
        view: 'Volume differences',
        object: pair.label,
        note,
        rows: [
          ['Before only (scene units³)', fmt(solid.volumes.beforeOnly)],
          ['Shared', fmt(solid.volumes.shared)],
          ['After only', fmt(solid.volumes.afterOnly)],
          ['Before volume → after volume', `${fmt(summary.before)} → ${fmt(summary.after)}`],
          ['Net change', `${summary.net > 0 ? '+' : ''}${fmt(summary.net)}`],
          ['Changed space', fmt(summary.changed)],
          [
            'Original volume retained',
            summary.retained === null ? 'unavailable' : `${fmt(summary.retained)}%`,
          ],
          ['Method', `${volumeMethod(solid)} Resolution: ${request.resolution}.`],
        ],
        limits: VOLUME_LIMITS,
      });
    } catch (error) {
      facts.push({
        view: 'Volume differences',
        object: pair.label,
        rows: [],
        unavailable: reason(error),
        limits: VOLUME_LIMITS,
      });
    }
  }
  facts.push(...request.motion.facts());
  return facts;
}
