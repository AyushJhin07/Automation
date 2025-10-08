import assert from 'node:assert/strict';

import { GmailAPIClient } from '../GmailAPIClient.js';
import { SlackAPIClient } from '../SlackAPIClient.js';
import { GoogleDocsAPIClient } from '../GoogleDocsAPIClient.js';
import { GoogleDriveAPIClient } from '../GoogleDriveAPIClient.js';
import { getRuntimeOpHandler } from '../../workflow/compiler/op-map.js';
import { replyWithJson, replyWithText, replyWithHtml } from '../../webhooks/replyHelpers.js';

interface MockResponse {
  body?: any;
  status?: number;
  headers?: Record<string, string>;
}

interface FetchCall {
  url: string;
  init?: any;
}

async function withMockedFetch<T>(
  responses: MockResponse[],
  fn: (calls: FetchCall[]) => Promise<T>
): Promise<T> {
  const queue = responses.length > 0 ? responses : [{ body: {} }];
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  let index = 0;

  (globalThis as any).fetch = async (input: any, init?: any) => {
    const current = queue[Math.min(index, queue.length - 1)] ?? { body: {} };
    index += 1;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    calls.push({ url, init });
    const body = current.body ?? {};
    const responseInit = {
      status: current.status ?? 200,
      headers: current.headers ?? { 'Content-Type': 'application/json' },
    };
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(payload, responseInit);
  };

  try {
    return await fn(calls);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
}

async function testGmailHandlers(): Promise<void> {
  await withMockedFetch(
    [
      { body: { id: 'abc123' } },
      { body: { id: 'runtime-456' } },
    ],
    async calls => {
      const client = new GmailAPIClient({ accessToken: 'token' });
      const result = await client.sendEmail({ to: 'user@example.com', subject: 'Hello', body: 'Greetings' });
      assert.equal(result.success, true, 'Gmail sendEmail should succeed');
      assert.equal(calls.length, 1, 'Expected one fetch call for direct client invocation');
      assert.ok(calls[0].url.includes('/users/me/messages/send'), 'Gmail request should target send endpoint');
      const payload = calls[0].init?.body ? JSON.parse(String(calls[0].init?.body)) : {};
      assert.ok(typeof payload.raw === 'string' && payload.raw.length > 0, 'Gmail payload should include raw message');

      const handler = getRuntimeOpHandler('action.gmail:send_email');
      assert.ok(handler, 'Runtime handler for Gmail send_email should be registered');
      const runtimeResult = await handler!(client, {
        to: 'runtime@example.com',
        subject: 'Runtime',
        body: 'From runtime',
      });
      assert.equal(runtimeResult.success, true, 'Runtime Gmail handler should succeed');
      assert.equal(calls.length, 2, 'Runtime handler should trigger additional fetch');
    }
  );
}

async function testSlackHandlers(): Promise<void> {
  await withMockedFetch(
    [
      { body: { ok: true, channel: 'C123', ts: '1.2' } },
      { body: { ok: true, channel: 'C123', ts: '3.4' } },
    ],
    async calls => {
      const client = new SlackAPIClient({ accessToken: 'xoxb-token' });
      const result = await client.sendMessage({ channel: 'C123', text: 'hello world' });
      assert.equal(result.success, true, 'Slack sendMessage should succeed');
      assert.equal(calls.length, 1, 'Expected single fetch call for Slack client');
      assert.ok(calls[0].url.endsWith('/chat.postMessage'), 'Slack request should target chat.postMessage');
      const payload = calls[0].init?.body ? JSON.parse(String(calls[0].init?.body)) : {};
      assert.equal(payload.channel, 'C123');
      assert.equal(payload.text, 'hello world');

      const handler = getRuntimeOpHandler('action.slack:send_message');
      assert.ok(handler, 'Runtime handler for Slack send_message should exist');
      const runtimeResult = await handler!(client, { channel: 'C123', text: 'runtime text' });
      assert.equal(runtimeResult.success, true, 'Runtime Slack handler should succeed');
      assert.equal(calls.length, 2, 'Runtime Slack handler should produce another request');
    }
  );
}

async function testGoogleDocsTriggers(): Promise<void> {
  await withMockedFetch(
    [
      { body: { files: [{ id: 'doc1', name: 'Doc', createdTime: '2024-01-02T00:00:00Z' }] } },
      { body: { files: [{ id: 'doc2', name: 'Doc2', modifiedTime: '2024-01-03T00:00:00Z' }] } },
    ],
    async calls => {
      const client = new GoogleDocsAPIClient({ accessToken: 'token' });
      const documents = await client.pollDocumentCreated({ since: '2024-01-01T00:00:00Z' });
      assert.equal(Array.isArray(documents), true, 'pollDocumentCreated should return array');
      assert.equal(documents.length, 1, 'Expected one created document');
      assert.ok(calls[0].url.includes('drive/v3/files'), 'Google Docs polling should call Drive files endpoint');
      assert.ok(
        decodeURIComponent(calls[0].url).includes("createdTime > '2024-01-01T00:00:00Z'"),
        'Created query should include since filter'
      );

      const handler = getRuntimeOpHandler('trigger.google-docs:document_created');
      assert.ok(handler, 'Runtime handler for google-docs document_created should exist');
      const runtimeResult = await handler!(client, { since: '2024-01-02T00:00:00Z' });
      assert.equal(runtimeResult.success, true, 'Runtime docs trigger should succeed');
      assert.equal(Array.isArray(runtimeResult.data), true, 'Runtime docs trigger should return data array');
    }
  );
}

async function testGoogleDriveTriggers(): Promise<void> {
  await withMockedFetch(
    [
      { body: { files: [{ id: 'file1', name: 'Quarterly Report', createdTime: '2024-01-04T00:00:00Z' }] } },
      { body: { files: [{ id: 'file2', name: 'Shared File', shared: true, modifiedTime: '2024-01-05T00:00:00Z' }] } },
      { body: { files: [{ id: 'file3', name: 'Runtime File', modifiedTime: '2024-01-06T00:00:00Z' }] } },
    ],
    async calls => {
      const client = new GoogleDriveAPIClient({ accessToken: 'token' });
      const created = await client.pollFileCreated({ folderId: 'root', since: '2024-01-01T00:00:00Z' });
      assert.equal(created.length, 1, 'pollFileCreated should return new files');
      assert.ok(calls[0].url.includes('drive/v3/files'), 'Drive polling should call files endpoint');
      assert.ok(
        decodeURIComponent(calls[0].url).includes("'root' in parents"),
        'File created query should include folder filter'
      );

      const shared = await client.pollFileShared({ since: '2024-01-01T00:00:00Z' });
      assert.equal(shared.length, 1, 'pollFileShared should return shared files');
      assert.ok(decodeURIComponent(calls[1].url).includes('sharedWithMe'), 'Shared query should include sharedWithMe');

      const handler = getRuntimeOpHandler('trigger.google-drive:file_updated');
      assert.ok(handler, 'Runtime handler for google-drive file_updated should exist');
      const runtimeResult = await handler!(client, { since: '2024-01-05T00:00:00Z' });
      assert.equal(runtimeResult.success, true, 'Runtime drive trigger should succeed');
      assert.equal(Array.isArray(runtimeResult.data), true, 'Runtime drive trigger should return array data');
    }
  );
}

async function testWebhookReplyHelpers(): Promise<void> {
  const json = await replyWithJson({ body: { ok: true }, statusCode: 201 });
  assert.equal(json.success, true, 'replyWithJson should succeed');
  assert.equal(json.data?.statusCode, 201);
  assert.equal(json.data?.headers['content-type'], 'application/json; charset=utf-8');

  const runtimeJson = getRuntimeOpHandler('action.webhook:reply_json');
  assert.ok(runtimeJson, 'Runtime webhook reply_json handler should exist');
  const runtimeResponse = await runtimeJson!(null as any, { body: { ack: true }, statusCode: 202 });
  assert.equal(runtimeResponse.success, true);
  assert.equal(runtimeResponse.data?.statusCode, 202);

  const text = await replyWithText({ body: 'pong', statusCode: 200 });
  assert.equal(text.data?.format, 'text');
  const html = await replyWithHtml({ body: '<strong>ok</strong>', headers: { 'x-extra': '1' } });
  assert.equal(html.data?.headers['x-extra'], '1');
}

await testGmailHandlers();
await testSlackHandlers();
await testGoogleDocsTriggers();
await testGoogleDriveTriggers();
await testWebhookReplyHelpers();

console.log('Communication API client runtime tests passed.');
