import assert from 'node:assert/strict';

import {
  getFallbackHandler,
  type HttpClient,
} from '../fallbackRegistry.js';
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

type RunHandlerOptions = {
  httpClient?: HttpClient;
  credentials?: Record<string, any>;
  parameters?: Record<string, any>;
  additionalConfig?: Record<string, any>;
};

const runHandler = async (
  key: string,
  triggerOverrides: Partial<PollingTrigger>,
  cursor: Record<string, any> | null,
  options: RunHandlerOptions = {},
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
    ...(options.httpClient ? { httpClient: options.httpClient } : {}),
    ...(options.credentials ? { credentials: options.credentials } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.additionalConfig ? { additionalConfig: options.additionalConfig } : {}),
  });

  return { result: result ?? { items: [] }, logs, now };
};

{
  const requests: Array<{ url: string; init?: Record<string, any> }> = [];
  const httpClient: HttpClient = async (url, init) => {
    requests.push({ url, init });
    assert.ok(url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages'));
    assert.ok(init?.headers?.Authorization?.includes('test-token'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        messages: [
          { id: 'msg-1', threadId: 'thread-1' },
          { id: 'msg-2', threadId: 'thread-2' },
        ],
        nextPageToken: 'next-token',
        historyId: 'h-2',
      }),
    };
  };

  const { result, logs, now } = await runHandler(
    'gmail.messages.list',
    {
      metadata: { parameters: { labelIds: ['INBOX'] } },
    },
    { pageToken: 'prev-token', historyId: 'h-1' },
    {
      httpClient,
      credentials: { accessToken: 'test-token' },
      parameters: { maxResults: 2 },
    },
  );

  assert.equal(requests.length, 1, 'gmail fallback should issue a single HTTP request');
  assert.equal(result.items?.length, 2, 'gmail fallback should return provided results');
  assert.equal(result.items?.[0]?.payload.id, 'msg-1');
  assert.equal(result.items?.[1]?.dedupeToken, 'msg-2');
  assert.equal(result.cursor?.pageToken, 'next-token', 'cursor should include next page token');
  assert.equal(result.cursor?.historyId, 'h-2', 'cursor should advance to last history id');
  assert.equal(result.cursor?.lastPolledAt, now.toISOString(), 'cursor should record last poll timestamp');
  assert.equal(result.diagnostics?.handlerKey, 'gmail.messages.list');
  assert.equal(result.diagnostics?.mode, 'fallback');
  assert.ok(Array.isArray(logs) && logs.length > 0, 'gmail fallback should emit logs');

  assert.equal(
    getFallbackHandler('gmail.messages.list'),
    getFallbackHandler('gmail.polling.new_email'),
    'gmail handler aliases should resolve to the same implementation',
  );
}

{
  const requests: Array<{ url: string; init?: Record<string, any> }> = [];
  const httpClient: HttpClient = async (url, init) => {
    requests.push({ url, init });
    assert.ok(url.startsWith('https://www.googleapis.com/drive/v3/files'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        files: [
          { id: 'file-1', modifiedTime: '2024-02-01T01:02:03Z' },
          { id: 'file-2', modifiedTime: '2024-02-01T02:03:04Z' },
        ],
        nextPageToken: 'drive-next-token',
      }),
    };
  };

  const { result, logs, now } = await runHandler(
    'google_drive.files.watch',
    {
      appId: 'google_docs',
      triggerId: 'document_updated',
    },
    { pageToken: 'drive-prev-token', lastSyncToken: '2024-02-01T00:00:00Z' },
    {
      httpClient,
      credentials: { accessToken: 'drive-token' },
      parameters: { folderId: 'folder-1', pageSize: 25 },
    },
  );

  assert.equal(requests.length, 1, 'drive fallback should issue a single HTTP request');
  const docUrl = new URL(requests[0]!.url);
  const docQuery = docUrl.searchParams.get('q') ?? '';
  assert.ok(
    docQuery.includes("mimeType contains 'application/vnd.google-apps.document'"),
    'docs alias should default to Docs MIME filter when none provided',
  );
  assert.equal(result.items?.length, 2, 'drive fallback should return mock files');
  assert.equal(result.items?.[0]?.payload.id, 'file-1');
  assert.equal(result.cursor?.pageToken, 'drive-next-token');
  assert.equal(result.cursor?.lastSyncToken, '2024-02-01T02:03:04Z');
  assert.equal(result.cursor?.lastPolledAt, now.toISOString());
  assert.equal(result.diagnostics?.handlerKey, 'google_drive.files.watch');
  assert.equal(result.diagnostics?.mode, 'fallback');
  assert.ok(logs.length > 0, 'drive fallback should log activity');
}

{
  const requests: Array<{ url: string; init?: Record<string, any> }> = [];
  const httpClient: HttpClient = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [], nextPageToken: null }),
    };
  };

  await runHandler(
    'google_drive.files.watch',
    {
      appId: 'google_drive',
      triggerId: 'files.watch',
      metadata: { fallbackKey: 'google_drive.files.watch' },
    },
    null,
    {
      httpClient,
      credentials: { accessToken: 'drive-token' },
    },
  );

  assert.equal(requests.length, 1, 'drive polling should make exactly one request');
  const driveUrl = new URL(requests[0]!.url);
  const driveQuery = driveUrl.searchParams.get('q') ?? '';
  assert.equal(
    driveQuery.includes("mimeType contains 'application/vnd.google-apps.document'"),
    false,
    'drive fallback without MIME type should not filter to Docs by default',
  );
}

{
  const httpClient: HttpClient = async url => {
    assert.ok(url.startsWith('https://slack.com/api/conversations.history'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        messages: [
          { ts: '1706875200.000100', text: 'hello' },
          { ts: '1706875300.000200', text: 'world' },
        ],
        response_metadata: { next_cursor: 'cursor-2' },
      }),
    };
  };

  const { result, logs, now } = await runHandler(
    'slack.conversations.history',
    {
      appId: 'slack',
      triggerId: 'events',
      metadata: { parameters: { channel: 'C123' } },
    },
    { nextCursor: 'cursor-1', lastEventTs: '1706875100.000000' },
    {
      httpClient,
      credentials: { accessToken: 'slack-token' },
      parameters: { limit: 2 },
    },
  );

  assert.equal(result.items?.length, 2, 'slack fallback should return mock events');
  assert.equal(result.items?.[1]?.dedupeToken, '1706875300.000200');
  assert.equal(result.cursor?.nextCursor, 'cursor-2');
  assert.equal(result.cursor?.lastEventTs, '1706875300.000200');
  assert.equal(result.cursor?.lastPolledAt, now.toISOString());
  assert.equal(result.diagnostics?.handlerKey, 'slack.conversations.history');
  assert.equal(result.diagnostics?.mode, 'fallback');
  assert.ok(logs.length > 0, 'slack fallback should log activity');
}

{
  const handler = getFallbackHandler('unknown.handler.key');
  assert.equal(handler, undefined, 'unknown fallback handler should be undefined');
}

console.log('✅ fallbackRegistry handlers resolve and execute with mocked provider clients.');
