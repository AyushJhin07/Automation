import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const originalEnv: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  ALLOW_FILE_CONNECTION_STORE: process.env.ALLOW_FILE_CONNECTION_STORE,
  CONNECTION_STORE_PATH: process.env.CONNECTION_STORE_PATH,
  CONNECTOR_SIMULATOR_ENABLED: process.env.CONNECTOR_SIMULATOR_ENABLED,
  CONNECTOR_SIMULATOR_FIXTURES_DIR: process.env.CONNECTOR_SIMULATOR_FIXTURES_DIR,
};

const connectionStorePath = path.resolve(
  process.cwd(),
  '.data',
  'workflow-runtime-gmail-integration-connections.json'
);

await fs.mkdir(path.dirname(connectionStorePath), { recursive: true });
await fs.rm(connectionStorePath, { force: true });

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '01234567890123456789012345678901';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'workflow-runtime-gmail-test';
process.env.ALLOW_FILE_CONNECTION_STORE = 'true';
process.env.CONNECTION_STORE_PATH = connectionStorePath;
process.env.CONNECTOR_SIMULATOR_ENABLED = 'true';
process.env.CONNECTOR_SIMULATOR_FIXTURES_DIR =
  process.env.CONNECTOR_SIMULATOR_FIXTURES_DIR ?? path.join('server', 'testing', 'fixtures');

try {
  const { connectionService } = await import('../../services/ConnectionService.js');
  const { WorkflowRuntimeService } = await import('../WorkflowRuntimeService.js');

  const userId = 'gmail-workflow-user';
  const organizationId = 'gmail-workflow-org';

  const connectionId = await connectionService.storeConnection(
    userId,
    organizationId,
    'gmail',
    {
      accessToken: 'simulated-gmail-access-token',
      refreshToken: 'simulated-gmail-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      scope: 'https://www.googleapis.com/auth/gmail.send',
    },
    {
      id: 'gmail-user-id',
      email: 'automation-tester@example.com',
      name: 'Automation Tester',
    },
    {
      name: 'Gmail Simulator Connection',
      type: 'saas',
    }
  );

  const runtime = new WorkflowRuntimeService();

  const executionContext = {
    workflowId: 'workflow-gmail-send',
    executionId: 'exec-gmail-send-1',
    userId,
    organizationId,
    nodeOutputs: {},
    timezone: 'UTC',
  };

  const gmailNode = {
    id: 'gmail-send-node',
    type: 'action.gmail.send_email',
    data: {
      app: 'gmail',
      function: 'send_email',
      auth: { connectionId },
      label: 'Send Gmail message',
    },
    params: {
      to: 'recipient@example.com',
      subject: 'Automation pipeline sanity check',
      body: 'This Gmail send_email action was executed by the workflow runtime integration test.',
    },
  };

  const result = await runtime.executeNode(gmailNode, executionContext);

  assert.equal(result.summary, 'Executed gmail.send_email', 'Execution summary should mention gmail send_email');
  assert.equal(
    result.diagnostics?.credentialsSource,
    'connection',
    'Workflow runtime should resolve Gmail credentials from stored connection'
  );
  assert.ok(result.output, 'Execution should return a payload from the connector');
  assert.equal(
    result.output?.id,
    'simulated-message-id',
    'Simulator-backed Gmail execution should return the fixture message id'
  );
  assert.equal(result.output?.status, 'sent', 'Gmail simulator response should indicate a sent status');
  assert.deepEqual(
    executionContext.nodeOutputs['gmail-send-node']?.output ?? executionContext.nodeOutputs['gmail-send-node'],
    result.output,
    'Workflow runtime should store connector output in the execution context'
  );
  assert.equal(
    result.parameters.to,
    'recipient@example.com',
    'Resolved parameters should preserve the recipient address'
  );

  console.log('✅ Workflow runtime Gmail send_email integration test passed.');
} finally {
  await fs.rm(connectionStorePath, { force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
