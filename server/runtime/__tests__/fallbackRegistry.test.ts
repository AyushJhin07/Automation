import assert from 'node:assert/strict';

import { getFallbackHandler } from '../fallbackRegistry.js';
import type { PollingTrigger } from '../../webhooks/types.js';

const baseTrigger: PollingTrigger = {
  id: 'poll-1',
  appId: 'gmail',
  triggerId: 'new_email',
  workflowId: 'wf-1',
  interval: 300,
  lastPoll: new Date('2024-01-01T00:00:00Z'),
  nextPoll: new Date('2024-01-01T00:05:00Z'),
  nextPollAt: new Date('2024-01-01T00:05:00Z'),
  isActive: true,
  metadata: {},
};

const runHandler = async (
  key: string,
  triggerOverrides: Partial<PollingTrigger>,
  cursor: Record<string, any> | null,
) => {
  const handler = getFallbackHandler(key);
  assert.ok(handler, `Expected fallback handler for ${key}`);

  const logs: Array<{ message: string; details?: Record<string, any> }> = [];
  const now = new Date('2024-02-02T12:34:56Z');

  const trigger: PollingTrigger = {
    ...baseTrigger,
    ...triggerOverrides,
  };

  const result = await handler({
    trigger,
    cursor,
    now,
    log: (message, details) => {
      logs.push({ message, ...(details ? { details } : {}) });
    },
  });

  return { result: result ?? { items: [] }, logs, now };
};

{
  const { result, logs, now } = await runHandler(
    'gmail.polling.new_email',
    {
      metadata: {
        mockResults: [
          { id: 'msg-1', historyId: 'h-1' },
          { id: 'msg-2', historyId: 'h-2' },
        ],
      },
    },
    { historyId: 'h-0' },
  );

  assert.equal(result.items?.length, 2, 'gmail fallback should return provided results');
  assert.equal(result.items?.[0]?.payload.id, 'msg-1');
  assert.equal(result.items?.[1]?.dedupeToken, 'msg-2');
  assert.equal(result.cursor?.historyId, 'h-2', 'cursor should advance to last history id');
  assert.equal(result.cursor?.lastPolledAt, now.toISOString(), 'cursor should record last poll timestamp');
  assert.equal(result.diagnostics?.handlerKey, 'gmail.polling.new_email');
  assert.equal(result.diagnostics?.mode, 'fallback');
  assert.ok(Array.isArray(logs) && logs.length > 0, 'gmail fallback should emit logs');
}

{
  const { result, logs, now } = await runHandler(
    'google_drive.files.watch',
    {
      appId: 'google_drive',
      triggerId: 'watch_files',
      metadata: {
        mockFiles: [
          { id: 'file-1', modifiedTime: '2024-02-01T01:02:03Z' },
          { id: 'file-2', modifiedTime: '2024-02-01T02:03:04Z' },
        ],
      },
    },
    { lastSyncToken: '2023-12-31T23:59:59Z' },
  );

  assert.equal(result.items?.length, 2, 'drive fallback should return mock files');
  assert.equal(result.items?.[0]?.payload.id, 'file-1');
  assert.equal(result.cursor?.lastSyncToken, '2024-02-01T02:03:04Z');
  assert.equal(result.cursor?.lastPolledAt, now.toISOString());
  assert.equal(result.diagnostics?.handlerKey, 'google_drive.files.watch');
  assert.equal(result.diagnostics?.mode, 'fallback');
  assert.ok(logs.length > 0, 'drive fallback should log activity');
}

{
  const { result, logs, now } = await runHandler(
    'slack.api.poller',
    {
      appId: 'slack',
      triggerId: 'events',
      metadata: {
        mockEvents: [
          { id: 'evt-1', ts: '1706875200.000100' },
          { id: 'evt-2', ts: '1706875300.000200' },
        ],
      },
    },
    { lastEventTs: '1706875100.000000' },
  );

  assert.equal(result.items?.length, 2, 'slack fallback should return mock events');
  assert.equal(result.items?.[1]?.dedupeToken, '1706875300.000200');
  assert.equal(result.cursor?.lastEventTs, '1706875300.000200');
  assert.equal(result.cursor?.lastPolledAt, now.toISOString());
  assert.equal(result.diagnostics?.handlerKey, 'slack.api.poller');
  assert.equal(result.diagnostics?.mode, 'fallback');
  assert.ok(logs.length > 0, 'slack fallback should log activity');
}

{
  const handler = getFallbackHandler('unknown.handler.key');
  assert.equal(handler, undefined, 'unknown fallback handler should be undefined');
}

console.log('✅ fallbackRegistry handlers resolve and execute with mock contexts.');
