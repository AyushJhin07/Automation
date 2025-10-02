import assert from 'node:assert/strict';
import { observabilityService } from '../ObservabilityService.js';

observabilityService.resetForTests();

observabilityService.recordQueueStart('exec-1', 'wf-1');
observabilityService.recordQueueRetry('exec-1', 'wf-1', 1, 1000, 'temporary error');
observabilityService.recordQueueFailure('exec-1', 'wf-1', 250, 'temporary error');

let metrics = observabilityService.getQueueMetrics();
assert.equal(metrics.started, 1);
assert.equal(metrics.retries, 1);
assert.equal(metrics.failed, 1);

observabilityService.resetForTests();
observabilityService.recordQueueStart('exec-2', 'wf-1');
observabilityService.recordQueueCompletion('exec-2', 'wf-1', 150, { nodeA: { ok: true } });

const snapshot = observabilityService.getSnapshot();
assert.equal(snapshot.queue.completed, 1);
assert.equal(snapshot.nodeLogs.length > 0, true);

observabilityService.resetForTests();

console.log('ObservabilityService captures queue stats and node logs.');
