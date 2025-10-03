import assert from 'node:assert/strict';

import { WorkflowRuntimeService } from '../WorkflowRuntimeService.js';
import { integrationManager } from '../../integrations/IntegrationManager.js';

type ExecutionContext = Parameters<WorkflowRuntimeService['executeNode']>[1];

async function runSheetsAndTimeRegression(): Promise<void> {
  const runtime = new WorkflowRuntimeService();

  const context: ExecutionContext = {
    workflowId: 'workflow-sheets-time',
    executionId: 'exec-1',
    nodeOutputs: {},
    timezone: 'UTC',
    organizationId: 'org-inline'
  };

  const sheetsNode = {
    id: 'sheets-node',
    app: 'sheets',
    function: 'append_row',
    params: {
      spreadsheetId: 'spreadsheet-1',
      sheetName: 'Log',
      values: ['alpha', 'beta', 'gamma']
    },
    data: {
      app: 'sheets',
      function: 'append_row',
      credentials: { local: true }
    }
  };

  const sheetsResult = await runtime.executeNode(sheetsNode, context);

  assert.equal(sheetsResult.summary.includes('sheets'), true, 'Sheets execution summary should mention app');
  assert.deepEqual(
    sheetsResult.output,
    {
      spreadsheetId: 'spreadsheet-1',
      sheetName: 'Log',
      rowIndex: 0,
      values: ['alpha', 'beta', 'gamma']
    },
    'Sheets append_row should return the appended row metadata'
  );

  assert.ok(context.nodeOutputs['sheets-node'], 'Sheets node output should be stored in execution context');
  assert.ok(sheetsResult.metadataSnapshot, 'Action execution should include metadata snapshot');
  assert.ok(
    sheetsResult.metadataSnapshot?.outputs?.columns?.includes('sheetName'),
    'Metadata snapshot should include sheetName column'
  );

  const timeNode = {
    id: 'time-node',
    app: 'time',
    function: 'delay',
    params: {
      hours: 0.0001
    },
    data: {
      app: 'time',
      function: 'delay',
      credentials: { local: true }
    }
  };

  const timeResult = await runtime.executeNode(timeNode, context);

  assert.equal(timeResult.summary.includes('time.delay'), true, 'Time delay summary should mention function');
  assert.ok(timeResult.output);
  assert.equal(typeof timeResult.output.delayedMs, 'number', 'Delay response should include milliseconds delayed');
  assert.ok(
    timeResult.output.delayedMs >= 0,
    'Delay response should report a non-negative delay duration'
  );

  assert.ok(context.nodeOutputs['time-node'], 'Time node output should be stored in execution context');
  assert.ok(timeResult.metadataSnapshot, 'Delay node should emit metadata snapshot');
  assert.ok(
    timeResult.metadataSnapshot?.outputs?.columns?.some((column) => column.toLowerCase().includes('delay')),
    'Delay metadata should describe delay columns'
  );
}

async function runConnectionIdAuthRegression(): Promise<void> {
  const runtime = new WorkflowRuntimeService();

  const context: ExecutionContext = {
    workflowId: 'workflow-auth-connection',
    executionId: 'exec-2',
    nodeOutputs: {},
    timezone: 'UTC',
    userId: 'user-auth',
    organizationId: 'org-auth'
  };

  let getFreshCalled = 0;
  const baseConnection = {
    id: 'conn-auth-1',
    userId: 'user-auth',
    organizationId: 'org-auth',
    name: 'Auth Connection',
    provider: 'sheets',
    type: 'saas',
    credentials: { local: true, accessToken: 'refreshed-access-token' },
    metadata: { additionalConfig: { sandbox: true }, expiresAt: new Date(Date.now() + 3600000).toISOString() },
    iv: 'iv',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockConnectionService = {
    async prepareConnectionForClient({ connectionId, userId, organizationId }: { connectionId?: string; userId: string; organizationId: string; }) {
      getFreshCalled++;
      assert.equal(connectionId, 'conn-auth-1', 'Runtime should request the configured connection id');
      assert.equal(userId, 'user-auth', 'Runtime should request connection for current user');
      assert.equal(organizationId, 'org-auth', 'Runtime should include organization when resolving connection');
      return {
        connection: { ...baseConnection },
        credentials: { ...baseConnection.credentials, onTokenRefreshed: async () => {} }
      };
    },
    async getConnectionWithFreshTokens(connectionId: string, userId: string, organizationId: string) {
      const context = await this.prepareConnectionForClient({ connectionId, userId, organizationId });
      return context?.connection ?? null;
    }
  };

  (runtime as any).getConnectionService = async () => mockConnectionService;

  const originalExecuteFunction = integrationManager.executeFunction;
  let receivedCredentials: any = null;

  integrationManager.executeFunction = async (params) => {
    receivedCredentials = params.credentials;
    return {
      success: true,
      data: {
        spreadsheetId: 'spreadsheet-auth',
        sheetName: 'Logs',
        rowIndex: 0,
        values: ['delta', 'epsilon']
      },
      executionTime: 42
    } as any;
  };

  const actionNode = {
    id: 'sheets-connection-node',
    app: 'sheets',
    function: 'append_row',
    params: {
      spreadsheetId: 'spreadsheet-auth',
      sheetName: 'Logs',
      values: ['delta', 'epsilon']
    },
    data: {
      app: 'sheets',
      function: 'append_row',
      auth: { connectionId: 'conn-auth-1' },
      parameters: {
        spreadsheetId: 'spreadsheet-auth',
        sheetName: 'Logs',
        values: ['delta', 'epsilon']
      }
    }
  };

  const result = await runtime.executeNode(actionNode, context);

  assert.equal(result.summary, 'Executed sheets.append_row', 'Action node should execute successfully');
  try {
    assert.deepEqual(
      result.output,
      {
        spreadsheetId: 'spreadsheet-auth',
        sheetName: 'Logs',
        rowIndex: 0,
        values: ['delta', 'epsilon']
      },
      'Action node should return append_row metadata when using stored connection'
    );

    assert.equal(getFreshCalled, 1, 'Runtime should resolve connection credentials once');
    assert.equal(
      receivedCredentials?.accessToken,
      'refreshed-access-token',
      'Integration manager should receive updated OAuth tokens'
    );
    assert.equal(
      typeof receivedCredentials?.onTokenRefreshed,
      'function',
      'Integration manager should receive token refresh hook'
    );
  } finally {
    integrationManager.executeFunction = originalExecuteFunction;
  }

  assert.ok(
    context.nodeOutputs['sheets-connection-node'],
    'Node output should be stored when connection is resolved from data.auth'
  );
  assert.ok(result.metadataSnapshot, 'Connection-backed execution should include metadata snapshot');
  assert.ok(
    result.metadataSnapshot?.outputs?.columns?.includes('sheetName'),
    'Snapshot should include spreadsheet columns for connection-based run'
  );
}

try {
  await runSheetsAndTimeRegression();
  await runConnectionIdAuthRegression();
  console.log('WorkflowRuntimeService regressions passed.');
  process.exit(0);
} catch (error) {
  console.error('WorkflowRuntimeService regression failed.', error);
  process.exit(1);
}
