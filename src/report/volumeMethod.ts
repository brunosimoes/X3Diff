import type { SolidRegionsResult } from '../viewer/solidRegions';

const number = (value: number) =>
  value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e7)
    ? value.toExponential(3)
    : Number(value.toPrecision(5)).toLocaleString('en-US', { maximumSignificantDigits: 5 });

export function volumeMethod(result: SolidRegionsResult): string {
  if (result.method === 'voxel')
    return `Estimated occupancy grid · Cell size ${number(result.cellSize!)} scene units. Open meshes are filled between paired ray intersections and can affect the estimate.`;
  return result.approximate
    ? 'Approximate tessellated Boolean geometry · Curved surfaces depend on resolution.'
    : 'Boolean geometry · Closed box surfaces.';
}
