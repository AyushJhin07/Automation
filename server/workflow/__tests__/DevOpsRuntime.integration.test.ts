import assert from 'node:assert/strict';

import { WorkflowRuntimeService } from '../WorkflowRuntimeService.js';
import { integrationManager } from '../../integrations/IntegrationManager.js';

const originalFetch = globalThis.fetch;

type FetchAssertion = (input: RequestInfo | URL, init?: RequestInit) => void;

type MockResponseOptions = {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
};

interface QueuedFetch {
  assert: FetchAssertion;
  options: MockResponseOptions;
}

const fetchQueue: QueuedFetch[] = [];

function queueFetch(assertion: FetchAssertion, options: MockResponseOptions = {}): void {
  fetchQueue.push({ assert: assertion, options });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const next = fetchQueue.shift();
  if (!next) {
    throw new Error(`Unexpected fetch invocation: ${String(input)}`);
  }
  next.assert(input, init);
  const { status = 200, headers = { 'content-type': 'application/json' }, body = {} } = next.options;
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(payload, { status, headers });
}) as typeof fetch;

function expectNoPendingFetches(): void {
  assert.equal(fetchQueue.length, 0, 'All mocked fetch calls should be consumed');
}

async function runArgocdFlow(): Promise<void> {
  const runtime = new WorkflowRuntimeService();
  const context = {
    workflowId: 'devops-argo',
    executionId: 'exec-argo-1',
    nodeOutputs: {},
    timezone: 'UTC',
    organizationId: 'org-devops'
  } as const;

  queueFetch((url) => {
    assert.equal(String(url), 'https://argo.example.com/api/v1/version');
  }, { body: { version: 'v2.10.0' } });

  queueFetch((url, init) => {
    assert.equal(String(url), 'https://argo.example.com/api/v1/applications');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body ?? '{}'));
    assert.equal(body.metadata.name, 'demo-app');
    assert.equal(body.spec.source.repoURL, 'https://github.com/org/repo');
  }, { body: { metadata: { name: 'demo-app' } } });

  const createNode = {
    id: 'argocd-create',
    app: 'argocd',
    function: 'create_application',
    params: {
      name: 'demo-app',
      repo_url: 'https://github.com/org/repo'
    },
    data: {
      app: 'argocd',
      function: 'create_application',
      credentials: {
        server_url: 'https://argo.example.com/api/v1',
        auth_token: 'argo-token'
      }
    }
  };

  const createResult = await runtime.executeNode(createNode, { ...context });
  assert.equal(createResult.summary, 'Executed argocd.create_application');
  assert.deepEqual(createResult.output, { metadata: { name: 'demo-app' } });

  queueFetch((url) => {
    assert.equal(String(url), 'https://argo.example.com/api/v1/applications/demo-app');
  }, { body: { metadata: { name: 'demo-app' }, status: { sync: { status: 'Synced' } } } });

  const getNode = {
    id: 'argocd-get',
    app: 'argocd',
    function: 'get_application',
    params: { name: 'demo-app' },
    data: {
      app: 'argocd',
      function: 'get_application',
      credentials: {
        server_url: 'https://argo.example.com/api/v1',
        auth_token: 'argo-token'
      }
    }
  };

  const getResult = await runtime.executeNode(getNode, { ...context, nodeOutputs: createResult.output ? { 'argocd-create': createResult.output } : {} });
  assert.equal(getResult.summary, 'Executed argocd.get_application');
  assert.equal(getResult.output?.metadata?.name, 'demo-app');

  queueFetch((url, init) => {
    assert.equal(String(url), 'https://argo.example.com/api/v1/applications/demo-app?cascade=true');
    assert.equal(init?.method, 'DELETE');
  }, { body: { deleted: true } });

  const deleteNode = {
    id: 'argocd-delete',
    app: 'argocd',
    function: 'delete_application',
    params: { name: 'demo-app' },
    data: {
      app: 'argocd',
      function: 'delete_application',
      credentials: {
        server_url: 'https://argo.example.com/api/v1',
        auth_token: 'argo-token'
      }
    }
  };

  const deleteResult = await runtime.executeNode(deleteNode, { ...context });
  assert.equal(deleteResult.summary, 'Executed argocd.delete_application');
  assert.deepEqual(deleteResult.output, { deleted: true });

  expectNoPendingFetches();
  integrationManager.removeIntegration('argocd');
}

async function runVaultFlow(): Promise<void> {
  const runtime = new WorkflowRuntimeService();
  const context = {
    workflowId: 'devops-vault',
    executionId: 'exec-vault-1',
    nodeOutputs: {},
    timezone: 'UTC',
    organizationId: 'org-devops'
  } as const;

  queueFetch((url) => {
    assert.equal(String(url), 'https://vault.example.com/v1/sys/health');
  }, { body: { initialized: true } });

  queueFetch((url, init) => {
    assert.equal(String(url), 'https://vault.example.com/v1/secret/data/app');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body ?? '{}'));
    assert.deepEqual(body.data, { key: 'value' });
  }, { body: { data: { key: 'value' } } });

  const writeNode = {
    id: 'vault-write',
    app: 'hashicorp-vault',
    function: 'write_secret',
    params: { path: 'secret/data/app', data: { key: 'value' } },
    data: {
      app: 'hashicorp-vault',
      function: 'write_secret',
      credentials: {
        vault_url: 'https://vault.example.com/v1',
        vault_token: 'vault-token'
      }
    }
  };

  const writeResult = await runtime.executeNode(writeNode, { ...context });
  assert.equal(writeResult.summary, 'Executed hashicorp-vault.write_secret');

  queueFetch((url) => {
    assert.equal(String(url), 'https://vault.example.com/v1/secret/data/app');
  }, { body: { data: { data: { key: 'value' } } } });

  const readNode = {
    id: 'vault-read',
    app: 'hashicorp-vault',
    function: 'read_secret',
    params: { path: 'secret/data/app' },
    data: {
      app: 'hashicorp-vault',
      function: 'read_secret',
      credentials: {
        vault_url: 'https://vault.example.com/v1',
        vault_token: 'vault-token'
      }
    }
  };

  const readResult = await runtime.executeNode(readNode, { ...context });
  assert.equal(readResult.summary, 'Executed hashicorp-vault.read_secret');
  assert.equal(readResult.output?.data?.data?.key, 'value');

  queueFetch((url, init) => {
    assert.equal(String(url), 'https://vault.example.com/v1/secret/data/app');
    assert.equal(init?.method, 'DELETE');
  }, { body: { deleted: true } });

  const deleteNode = {
    id: 'vault-delete',
    app: 'hashicorp-vault',
    function: 'delete_secret',
    params: { path: 'secret/data/app' },
    data: {
      app: 'hashicorp-vault',
      function: 'delete_secret',
      credentials: {
        vault_url: 'https://vault.example.com/v1',
        vault_token: 'vault-token'
      }
    }
  };

  const deleteResult = await runtime.executeNode(deleteNode, { ...context });
  assert.equal(deleteResult.summary, 'Executed hashicorp-vault.delete_secret');
  assert.deepEqual(deleteResult.output, { deleted: true });

  expectNoPendingFetches();
  integrationManager.removeIntegration('hashicorp-vault');
}

async function runAnsibleFlow(): Promise<void> {
  const runtime = new WorkflowRuntimeService();
  const context = {
    workflowId: 'devops-ansible',
    executionId: 'exec-ansible-1',
    nodeOutputs: {},
    timezone: 'UTC',
    organizationId: 'org-devops'
  } as const;

  queueFetch((url) => {
    assert.equal(String(url), 'https://ansible.example.com/api/v2/ping/');
  }, { body: { ping: 'pong' } });

  queueFetch((url, init) => {
    assert.equal(String(url), 'https://ansible.example.com/api/v2/job_templates/42/launch/');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body ?? '{}'));
    assert.equal(body.limit, 'web');
  }, { body: { job: 101 } });

  const launchNode = {
    id: 'ansible-launch',
    app: 'ansible',
    function: 'launch_job_template',
    params: { job_template_id: '42', limit: 'web' },
    data: {
      app: 'ansible',
      function: 'launch_job_template',
      credentials: {
        base_url: 'https://ansible.example.com/api/v2',
        api_token: 'ansible-token'
      }
    }
  };

  const launchResult = await runtime.executeNode(launchNode, { ...context });
  assert.equal(launchResult.summary, 'Executed ansible.launch_job_template');
  assert.deepEqual(launchResult.output, { job: 101 });

  queueFetch((url) => {
    assert.equal(String(url), 'https://ansible.example.com/api/v2/job_templates/');
  }, { body: { results: [{ id: 42, name: 'Deploy App' }] } });

  const listNode = {
    id: 'ansible-list',
    app: 'ansible',
    function: 'list_job_templates',
    params: {},
    data: {
      app: 'ansible',
      function: 'list_job_templates',
      credentials: {
        base_url: 'https://ansible.example.com/api/v2',
        api_token: 'ansible-token'
      }
    }
  };

  const listResult = await runtime.executeNode(listNode, { ...context });
  assert.equal(listResult.summary, 'Executed ansible.list_job_templates');
  assert.equal(listResult.output?.results?.[0]?.id, 42);

  queueFetch((url, init) => {
    assert.equal(String(url), 'https://ansible.example.com/api/v2/job_templates/42/');
    assert.equal(init?.method, 'DELETE');
  }, { body: { deleted: true } });

  const deleteNode = {
    id: 'ansible-delete',
    app: 'ansible',
    function: 'delete_job_template',
    params: { job_template_id: '42' },
    data: {
      app: 'ansible',
      function: 'delete_job_template',
      credentials: {
        base_url: 'https://ansible.example.com/api/v2',
        api_token: 'ansible-token'
      }
    }
  };

  const deleteResult = await runtime.executeNode(deleteNode, { ...context });
  assert.equal(deleteResult.summary, 'Executed ansible.delete_job_template');
  assert.deepEqual(deleteResult.output, { deleted: true });

  expectNoPendingFetches();
  integrationManager.removeIntegration('ansible');
}

let exitCode = 0;
try {
  await runArgocdFlow();
  await runVaultFlow();
  await runAnsibleFlow();
  console.log('DevOps workflow runtime integration tests passed.');
} catch (error) {
  console.error('DevOps workflow runtime integration tests failed.', error);
  exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  fetchQueue.length = 0;
  process.exit(exitCode);
}
