import assert from 'node:assert/strict';

import { WorkflowRuntime } from '../../core/WorkflowRuntime.js';

const runtime = new WorkflowRuntime();

{
  const sandboxGraph = {
    id: 'sandbox-graph-success',
    name: 'Sandbox Graph Success',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-success',
        type: 'action.sandbox.echo',
        label: 'Sandbox Echo',
        params: {},
        data: {
          label: 'Sandbox Echo',
          parameters: {
            message: 'hello world'
          },
          credentials: {
            apiKey: 'secret-token-value'
          },
          runtime: {
            entryPoint: 'run',
            timeoutMs: 2000,
            code: `export async function run({ params, context }) {
  console.log('Received', params.message, context.credentials.apiKey);
  return {
    echoed: params.message.toUpperCase(),
    sawSecret: context.credentials.apiKey === 'secret-token-value',
    leaked: context.credentials.apiKey,
    timestamp: new Date('2024-01-02T03:04:05Z')
  };
}`
          }
        }
      }
    ],
    edges: [],
    scopes: [],
    secrets: []
  };

  const result = await runtime.executeWorkflow(sandboxGraph as any, {}, 'sandbox-user');

  assert.equal(result.success, true, 'sandbox execution should succeed');
  assert.equal(result.data.echoed, 'HELLO WORLD');
  assert.equal(result.data.sawSecret, true);
  assert.equal(result.data.leaked, '[REDACTED]');
  assert.equal(result.data.timestamp, '2024-01-02T03:04:05.000Z');
  assert.equal(result.nodeOutputs['sandbox-node-success'].leaked, '[REDACTED]');
  assert.equal(result.nodeOutputs['sandbox-node-success'].sawSecret, true);
}

{
  const timeoutGraph = {
    id: 'sandbox-graph-timeout',
    name: 'Sandbox Graph Timeout',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-timeout',
        type: 'action.sandbox.timeout',
        label: 'Sandbox Timeout',
        params: {},
        data: {
          label: 'Sandbox Timeout',
          parameters: {},
          runtime: {
            entryPoint: 'run',
            timeoutMs: 50,
            code: `export async function run({ signal }) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ finished: true }), 500);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted before completion'));
    }, { once: true });
  });
  return { finished: true };
}`
          }
        }
      }
    ],
    edges: [],
    scopes: [],
    secrets: []
  };

  const result = await runtime.executeWorkflow(timeoutGraph as any, {}, 'sandbox-user');

  assert.equal(result.success, false, 'timeout should mark execution as failed');
  assert.ok(result.error && /timed out/i.test(result.error), 'error message should include timeout');
}

{
  const failureGraph = {
    id: 'sandbox-graph-failure',
    name: 'Sandbox Graph Failure',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-failure',
        type: 'action.sandbox.failure',
        label: 'Sandbox Failure',
        params: {},
        data: {
          label: 'Sandbox Failure',
          credentials: {
            token: 'super-secret-token'
          },
          runtime: {
            entryPoint: 'run',
            code: `export async function run({ context }) {
  throw new Error('Failure with secret ' + context.credentials.token);
}`
          }
        }
      }
    ],
    edges: [],
    scopes: [],
    secrets: []
  };

  const result = await runtime.executeWorkflow(failureGraph as any, {}, 'sandbox-user');

  assert.equal(result.success, false, 'error should propagate from sandbox');
  assert.ok(result.error && result.error.includes('[REDACTED]'), 'error message should redact secrets');
  assert.ok(result.error && !result.error.includes('super-secret-token'), 'error message must not leak the secret');
}

{
  const importGraph = {
    id: 'sandbox-graph-import',
    name: 'Sandbox Graph Import',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-import',
        type: 'action.sandbox.import',
        label: 'Sandbox Import',
        params: {},
        data: {
          label: 'Sandbox Import',
          runtime: {
            entryPoint: 'run',
            code: `import fs from 'node:fs';

export async function run() {
  return { value: await fs.promises.readFile('/etc/hosts', 'utf8') };
}`
          }
        }
      }
    ],
    edges: [],
    scopes: [],
    secrets: []
  };

  const result = await runtime.executeWorkflow(importGraph as any, {}, 'sandbox-user');

  assert.equal(result.success, false, 'imports should be rejected in sandbox');
  assert.ok(
    result.error && result.error.includes('Imports are not allowed in sandboxed code'),
    'error should explain that imports are not allowed'
  );
}
