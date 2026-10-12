import type { ChangeRecord } from '../report/schema';
import type { AnalysisPair } from '../viewer/analysisGeometry';
import { affectsShape } from '../viewer/shapeGeometry';

/** One selection shared by the declaration cards and analysis views. */
export class Selection {
  version = 0;
  changes: readonly ChangeRecord[] = [];
  label = '';
  paths?: { before: string; after: string };
  motion?: string;

  select(changes: readonly ChangeRecord[], label = ''): void {
    this.version++;
    this.changes = changes;
    this.label = label;
    this.paths = undefined;
    this.motion = undefined;
  }

  selectPair(pair: AnalysisPair, changes: readonly ChangeRecord[]): void {
    this.select(changes, pair.label);
    this.paths = { before: pair.before.path, after: pair.after.path };
  }

  pairIndex(pairs: readonly AnalysisPair[]): number {
    const animated = (pair: AnalysisPair) => {
      for (const shape of [pair.before.shape, pair.after.shape]) {
        for (let node: Element | null = shape; node; node = node.parentElement) {
          if (node.getAttribute('DEF') === this.motion) return true;
        }
      }
      return false;
    };
    const matches = pairs.flatMap((pair, index) => {
      const matched = this.paths
        ? this.paths.before === pair.before.path && this.paths.after === pair.after.path
        : this.motion
          ? animated(pair)
          : this.changes.some(
              (change) =>
                affectsShape(pair.before.path, change.beforeNode?.path) ||
                affectsShape(pair.after.path, change.afterNode?.path),
            );
      return matched ? [index] : [];
    });
    return matches.length === 1 ? matches[0] : -1;
  }
}
