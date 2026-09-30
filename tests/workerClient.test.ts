import { describe, it, expect } from 'vitest';
import { ComparisonClient } from '../src/diff/workerClient';
class FakeWorker {
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
}
const request = { before: 'a', after: 'b', config: {}, names: {} };
describe('comparison worker lifecycle', () => {
  it('terminates superseded work and ignores its late results', async () => {
    const workers: FakeWorker[] = [];
    const client = new ComparisonClient(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w as unknown as Worker;
    });
    const first = client.compare(request).catch((e) => e);
    const second = client.compare(request);
    expect((await first).name).toBe('AbortError');
    expect(workers[0].terminated).toBe(true);
    workers[0].onmessage?.({ data: { report: 'obsolete' } });
    workers[1].onmessage?.({ data: { report: 'latest' } });
    expect(await second).toBe('latest');
    expect(workers[1].terminated).toBe(true);
  });
  it('rejects and releases resources on worker failure', async () => {
    const w = new FakeWorker(),
      client = new ComparisonClient(() => w as unknown as Worker);
    const pending = client.compare(request);
    const result = expect(pending).rejects.toThrow('broken');
    w.onerror?.({ message: 'broken' });
    await result;
    expect(w.terminated).toBe(true);
  });
});
