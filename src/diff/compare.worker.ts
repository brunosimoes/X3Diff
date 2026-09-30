import { compareX3D } from './compare';
import type { ComparisonRequest, ComparisonResponse } from './workerClient';
self.onmessage = (event: MessageEvent<ComparisonRequest>) => {
  const { before, after, config, names } = event.data;
  let response: ComparisonResponse;
  try {
    response = { report: compareX3D(before, after, config, names) };
  } catch (error) {
    response = { error: error instanceof Error ? error.message : 'Comparison failed' };
  }
  self.postMessage(response);
};
