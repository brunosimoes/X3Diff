import type { SolidRegionsResult } from '../viewer/solidRegions';
import { summarizeVolumes } from '../viewer/volumeMetrics';

const number = (value: number) =>
  value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e7)
    ? value.toExponential(3)
    : Number(value.toPrecision(5)).toLocaleString('en-US', { maximumSignificantDigits: 5 });

export function renderVolumeSummary(host: HTMLElement, result: SolidRegionsResult): void {
  const summary = summarizeVolumes(result.volumes);
  host.replaceChildren();
  for (const [label, value, region] of [
    ['Before only', result.volumes.beforeOnly, 'before'],
    ['Shared', result.volumes.shared, 'shared'],
    ['After only', result.volumes.afterOnly, 'after'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `volume-metric ${region}`;
    button.dataset.volumeRegion = region;
    button.title = `Isolate ${label.toLowerCase()} volume`;
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = number(value);
    button.append(name, amount);
    host.append(button);
  }
  const totals = document.createElement('p');
  totals.className = 'volume-totals';
  const net =
    summary.net === 0
      ? '0'
      : Math.abs(summary.net) < Math.max(summary.before, summary.after) * 1e-6
        ? '≈0'
        : `${summary.net > 0 ? '+' : '−'}${number(Math.abs(summary.net))}`;
  totals.textContent = `Before ${number(summary.before)} → After ${number(summary.after)} · Net ${net} · Changed space ${number(summary.changed)}`;
  const retained = document.createElement('p');
  retained.className = 'volume-retained';
  retained.textContent =
    summary.retained === null
      ? 'Original volume retained: unavailable (zero estimated before volume).'
      : `${number(summary.retained)}% of original volume retained`;
  host.append(totals, retained);
}

export function volumeMethod(result: SolidRegionsResult): string {
  if (result.method === 'voxel')
    return `Estimated occupancy grid · Cell size ${number(result.cellSize!)} scene units. Open meshes are filled between paired ray intersections and can affect the estimate.`;
  return result.approximate
    ? 'Approximate tessellated Boolean geometry · Curved surfaces depend on resolution.'
    : 'Boolean geometry · Closed box surfaces.';
}
