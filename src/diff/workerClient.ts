import type { ToleranceConfig, X3DiffReport } from '../report/schema';
export interface ComparisonRequest {
  before: string;
  after: string;
  config: Partial<ToleranceConfig>;
  names: { before?: string; after?: string };
}
export type ComparisonResponse = { report: X3DiffReport } | { error: string };
/** One worker per request allows immediate cancellation of synchronous engine work. */
export class ComparisonClient {
  private stop?: () => void;
  constructor(
    private createWorker = () =>
      new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' }),
  ) {}
  cancel(): void {
    this.stop?.();
  }
  compare(request: ComparisonRequest): Promise<X3DiffReport> {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = this.createWorker();
      const cleanup = () => {
        worker.terminate();
        if (this.stop === cancel) this.stop = undefined;
      };
      const cancel = () => {
        cleanup();
        reject(new DOMException('Comparison cancelled', 'AbortError'));
      };
      this.stop = cancel;
      worker.onmessage = (event: MessageEvent<ComparisonResponse>) => {
        if (this.stop !== cancel) return;
        cleanup();
        if ('error' in event.data) reject(new Error(event.data.error));
        else resolve(event.data.report);
      };
      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message || 'Comparison worker failed'));
      };
      worker.onmessageerror = () => {
        cleanup();
        reject(new Error('Comparison result could not be read'));
      };
      try {
        worker.postMessage(request);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
}
