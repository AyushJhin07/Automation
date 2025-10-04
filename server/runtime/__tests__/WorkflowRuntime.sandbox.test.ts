import assert from 'node:assert/strict';

import { WorkflowRuntime } from '../../core/WorkflowRuntime.js';
import { connectionService } from '../../services/ConnectionService.js';

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
  const networkGraph = {
    id: 'sandbox-graph-network',
    name: 'Sandbox Graph Network Policy',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-network',
        type: 'action.sandbox.network',
        label: 'Sandbox Network',
        params: {},
        data: {
          label: 'Sandbox Network',
          runtime: {
            entryPoint: 'run',
            code: `export async function run({ fetch }) {
  await fetch('https://blocked.example.com/data');
  return { ok: true };
}`,
          },
        },
      },
    ],
    edges: [],
    scopes: [],
    secrets: [],
  };

  const originalPolicy = connectionService.getOrganizationNetworkPolicy.bind(connectionService);
  connectionService.getOrganizationNetworkPolicy = async () => ({
    allowlist: {
      domains: ['allowed.example.com'],
      ipRanges: [],
    },
    denylist: {
      domains: [],
      ipRanges: [],
    },
  });

  try {
    const result = await runtime.executeWorkflow(networkGraph as any, {}, 'sandbox-user', {
      organizationId: 'org-policy',
    });

    assert.equal(result.success, false, 'network policy violation should fail execution');
    assert.ok(result.error && result.error.includes('Network request blocked'), 'error should indicate network block');
  } finally {
    connectionService.getOrganizationNetworkPolicy = originalPolicy;
  }
}

{
  const networkGraph = {
    id: 'sandbox-graph-platform-network',
    name: 'Sandbox Graph Platform Network Policy',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-platform-network',
        type: 'action.sandbox.network',
        label: 'Sandbox Platform Network',
        params: {},
        data: {
          label: 'Sandbox Network',
          runtime: {
            entryPoint: 'run',
            code: `export async function run({ fetch }) {
  await fetch('https://blocked-platform.example.com/data');
  return { ok: true };
}`,
          },
        },
      },
    ],
    edges: [],
    scopes: [],
    secrets: [],
  };

  connectionService.setPlatformNetworkPolicyForTesting({
    allowlist: {
      domains: ['allowed-platform.example.com'],
      ipRanges: [],
    },
    denylist: {
      domains: [],
      ipRanges: [],
    },
  });

  try {
    const result = await runtime.executeWorkflow(networkGraph as any, {}, 'sandbox-user', {
      organizationId: 'org-default-policy',
    });

    assert.equal(result.success, false, 'platform network policy violation should fail execution');
    assert.ok(result.error && result.error.includes('Network request blocked'), 'error should indicate network block');
  } finally {
    connectionService.setPlatformNetworkPolicyForTesting(null);
  }
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

{
  const crashGraph = {
    id: 'sandbox-graph-crash',
    name: 'Sandbox Graph Crash',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-crash',
        type: 'action.sandbox.crash',
        label: 'Sandbox Crash',
        params: {},
        data: {
          label: 'Sandbox Crash',
          runtime: {
            entryPoint: 'run',
            timeoutMs: 500,
            code: `export async function run() {
  setTimeout(() => {
    throw new Error('Simulated crash');
  }, 10);
  await new Promise(() => {});
  return { unreachable: true };
}`
          }
        }
      }
    ],
    edges: [],
    scopes: [],
    secrets: []
  };

  const crashResult = await runtime.executeWorkflow(crashGraph as any, {}, 'sandbox-user');

  assert.equal(crashResult.success, false, 'crash should surface as a sandbox failure');
  assert.ok(
    crashResult.error && /Sandbox (process|worker) exited/i.test(crashResult.error),
    'crash error should indicate the sandbox runtime exited'
  );

  const recoveryGraph = {
    id: 'sandbox-graph-recovery',
    name: 'Sandbox Graph Recovery',
    version: 1,
    nodes: [
      {
        id: 'sandbox-node-recovery',
        type: 'action.sandbox.echo',
        label: 'Sandbox Echo',
        params: {},
        data: {
          label: 'Sandbox Echo',
          runtime: {
            entryPoint: 'run',
            code: `export async function run() {
  return { ok: true };
}`
          }
        }
      }
    ],
    edges: [],
    scopes: [],
    secrets: []
  };

  const recoveryResult = await runtime.executeWorkflow(recoveryGraph as any, {}, 'sandbox-user');

  assert.equal(recoveryResult.success, true, 'subsequent sandbox execution should still succeed');
  assert.equal(recoveryResult.data.ok, true);
}
