import assert from 'node:assert/strict';

import { WorkflowRuntimeService } from '../WorkflowRuntimeService.js';

type ExecutionContext = Parameters<WorkflowRuntimeService['executeNode']>[1];

type MockRequest = {
  method: string;
  url: string;
  response: any;
  status?: number;
  assertBody?: (body: any) => void;
};

const originalFetch = global.fetch;
const pendingRequests: MockRequest[] = [];

global.fetch = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
  const method = (init?.method || 'GET').toUpperCase();
  const url = typeof input === 'string' ? input : input.url;
  const index = pendingRequests.findIndex(req => req.method === method && req.url === url);

  if (index === -1) {
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }

  const request = pendingRequests.splice(index, 1)[0];
  if (request.assertBody && init?.body) {
    try {
      request.assertBody(JSON.parse(init.body as string));
    } catch {
      // ignore body parsing errors for non-JSON payloads
    }
  }

  const body = request.response !== undefined ? JSON.stringify(request.response) : '';
  return new Response(body, {
    status: request.status ?? 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

function queueRequest(method: string, url: string, response: any, options: Omit<MockRequest, 'method' | 'url' | 'response'> = {}): void {
  pendingRequests.push({ method: method.toUpperCase(), url, response, ...options });
}

async function testKubernetesDeploymentFlow(): Promise<void> {
  const runtime = new WorkflowRuntimeService();
  const context: ExecutionContext = {
    workflowId: 'wf-k8s',
    executionId: 'exec-k8s',
    nodeOutputs: {},
    timezone: 'UTC',
    organizationId: 'org'
  };

  queueRequest('GET', 'https://kube.test/api/v1/namespaces?limit=1', { items: [] });

  queueRequest('POST', 'https://kube.test/apis/apps/v1/namespaces/dev/deployments', { metadata: { name: 'demo' } }, {
    assertBody: body => {
      assert.equal(body.metadata.name, 'demo');
      assert.equal(body.spec.template.spec.containers[0].image, 'nginx:latest');
    }
  });

  const createNode = {
    id: 'kube-create',
    app: 'kubernetes',
    function: 'create_deployment',
    params: {
      name: 'demo',
      namespace: 'dev',
      image: 'nginx:latest',
      replicas: 2
    },
    data: {
      app: 'kubernetes',
      function: 'create_deployment',
      credentials: {
        api_server: 'https://kube.test',
        bearer_token: 'token',
        namespace: 'dev'
      }
    }
  };

  const createResult = await runtime.executeNode(createNode, context);
  assert.equal(createResult.success ?? true, true);
  assert.deepEqual(createResult.output, { metadata: { name: 'demo' } });

  queueRequest('GET', 'https://kube.test/apis/apps/v1/namespaces/dev/deployments', { items: [{ metadata: { name: 'demo' } }] });

  const listNode = {
    id: 'kube-list',
    app: 'kubernetes',
    function: 'list_deployments',
    params: {
      namespace: 'dev'
    },
    data: {
      app: 'kubernetes',
      function: 'list_deployments',
      credentials: {
        api_server: 'https://kube.test',
        bearer_token: 'token',
        namespace: 'dev'
      }
    }
  };

  const listResult = await runtime.executeNode(listNode, context);
  assert.deepEqual(listResult.output, { items: [{ metadata: { name: 'demo' } }] });

  queueRequest('DELETE', 'https://kube.test/apis/apps/v1/namespaces/dev/deployments/demo', { status: 'Success' });

  const deleteNode = {
    id: 'kube-delete',
    app: 'kubernetes',
    function: 'delete_deployment',
    params: {
      name: 'demo',
      namespace: 'dev'
    },
    data: {
      app: 'kubernetes',
      function: 'delete_deployment',
      credentials: {
        api_server: 'https://kube.test',
        bearer_token: 'token',
        namespace: 'dev'
      }
    }
  };

  const deleteResult = await runtime.executeNode(deleteNode, context);
  assert.deepEqual(deleteResult.output, { status: 'Success' });
}

async function testVaultSecretFlow(): Promise<void> {
  const runtime = new WorkflowRuntimeService();
  const context: ExecutionContext = {
    workflowId: 'wf-vault',
    executionId: 'exec-vault',
    nodeOutputs: {},
    timezone: 'UTC',
    organizationId: 'org'
  };

  queueRequest('GET', 'https://vault.test/v1/sys/health', { status: 'ok' });

  queueRequest('POST', 'https://vault.test/v1/secret/data/app', { data: { version: 1 } }, {
    assertBody: body => {
      assert.equal(body.data.apiKey, 'secret');
    }
  });

  const writeNode = {
    id: 'vault-write',
    app: 'hashicorp-vault',
    function: 'write_secret',
    params: {
      path: 'secret/data/app',
      data: { apiKey: 'secret' }
    },
    data: {
      app: 'hashicorp-vault',
      function: 'write_secret',
      credentials: {
        vault_url: 'https://vault.test/v1',
        vault_token: 'vault-token'
      }
    }
  };

  const writeResult = await runtime.executeNode(writeNode, context);
  assert.deepEqual(writeResult.output, { data: { version: 1 } });

  queueRequest('GET', 'https://vault.test/v1/secret/data/app', { data: { data: { apiKey: 'secret' } } });

  const readNode = {
    id: 'vault-read',
    app: 'hashicorp-vault',
    function: 'read_secret',
    params: {
      path: 'secret/data/app'
    },
    data: {
      app: 'hashicorp-vault',
      function: 'read_secret',
      credentials: {
        vault_url: 'https://vault.test/v1',
        vault_token: 'vault-token'
      }
    }
  };

  const readResult = await runtime.executeNode(readNode, context);
  assert.deepEqual(readResult.output, { data: { data: { apiKey: 'secret' } } });

  queueRequest('DELETE', 'https://vault.test/v1/secret/data/app', { status: 'deleted' });

  const deleteNode = {
    id: 'vault-delete',
    app: 'hashicorp-vault',
    function: 'delete_secret',
    params: {
      path: 'secret/data/app'
    },
    data: {
      app: 'hashicorp-vault',
      function: 'delete_secret',
      credentials: {
        vault_url: 'https://vault.test/v1',
        vault_token: 'vault-token'
      }
    }
  };

  const deleteResult = await runtime.executeNode(deleteNode, context);
  assert.deepEqual(deleteResult.output, { status: 'deleted' });
}

async function testAnsibleJobTemplateFlow(): Promise<void> {
  const runtime = new WorkflowRuntimeService();
  const context: ExecutionContext = {
    workflowId: 'wf-ansible',
    executionId: 'exec-ansible',
    nodeOutputs: {},
    timezone: 'UTC',
    organizationId: 'org'
  };

  queueRequest('GET', 'https://ansible.test/api/v2/me/', { username: 'automation' });

  queueRequest('POST', 'https://ansible.test/api/v2/job_templates/', { id: 42, name: 'Deploy' }, {
    assertBody: body => {
      assert.equal(body.name, 'Deploy');
      assert.equal(body.project, 7);
    }
  });

  const createNode = {
    id: 'ansible-create',
    app: 'ansible',
    function: 'create_job_template',
    params: {
      name: 'Deploy',
      inventory: 5,
      project: 7,
      playbook: 'site.yml'
    },
    data: {
      app: 'ansible',
      function: 'create_job_template',
      credentials: {
        base_url: 'https://ansible.test/api/v2',
        api_token: 'ansible-token'
      }
    }
  };

  const createResult = await runtime.executeNode(createNode, context);
  assert.deepEqual(createResult.output, { id: 42, name: 'Deploy' });

  queueRequest('GET', 'https://ansible.test/api/v2/job_templates/', { results: [{ id: 42, name: 'Deploy' }] });

  const listNode = {
    id: 'ansible-list',
    app: 'ansible',
    function: 'list_job_templates',
    params: {},
    data: {
      app: 'ansible',
      function: 'list_job_templates',
      credentials: {
        base_url: 'https://ansible.test/api/v2',
        api_token: 'ansible-token'
      }
    }
  };

  const listResult = await runtime.executeNode(listNode, context);
  assert.deepEqual(listResult.output, { results: [{ id: 42, name: 'Deploy' }] });

  queueRequest('DELETE', 'https://ansible.test/api/v2/job_templates/42/', { status: 'deleted' });

  const deleteNode = {
    id: 'ansible-delete',
    app: 'ansible',
    function: 'delete_job_template',
    params: {
      job_template_id: '42'
    },
    data: {
      app: 'ansible',
      function: 'delete_job_template',
      credentials: {
        base_url: 'https://ansible.test/api/v2',
        api_token: 'ansible-token'
      }
    }
  };

  const deleteResult = await runtime.executeNode(deleteNode, context);
  assert.deepEqual(deleteResult.output, { status: 'deleted' });
}

try {
  await testKubernetesDeploymentFlow();
  await testVaultSecretFlow();
  await testAnsibleJobTemplateFlow();

  assert.equal(pendingRequests.length, 0, 'All mocked HTTP requests should be consumed');
  console.log('DevOps integration runtime flows passed.');
  process.exit(0);
} catch (error) {
  console.error('DevOps integration runtime regression failed.', error);
  process.exit(1);
} finally {
  global.fetch = originalFetch;
}
