import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/test-db';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? 'a'.repeat(32);
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const { executionQueueService } = await import('../ExecutionQueueService.js');
const {
  executionQuotaService,
  ExecutionQuotaExceededError,
} = await import('../ExecutionQuotaService.js');
const { WorkflowRepository } = await import('../../workflow/WorkflowRepository.js');
const { organizationService } = await import('../OrganizationService.js');
const {
  connectorConcurrencyService,
  ConnectorConcurrencyExceededError,
} = await import('../ConnectorConcurrencyService.js');

const baseWorkflowId = 'quota-test-workflow';

async function drainRunningSlots(organizationId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await executionQuotaService.releaseRunningSlot(organizationId);
  }
}

async function ensureWorkflowWithConnector(
  workflowId: string,
  organizationId: string,
  connectorId = 'airtable'
): Promise<void> {
  await WorkflowRepository.saveWorkflowGraph({
    id: workflowId,
    organizationId,
    name: 'Connector Test Workflow',
    description: 'Used for connector concurrency tests',
    graph: {
      id: workflowId,
      name: 'Connector Graph',
      version: 1,
      nodes: [
        {
          id: 'node-1',
          type: `action.${connectorId}.noop`,
          label: 'Connector Node',
          params: {},
          data: { connectorId },
        },
      ],
      edges: [],
      scopes: [],
      secrets: [],
    },
    metadata: null,
  });
}

// Concurrency saturation scenario
{
  const organizationId = `org-quota-${randomUUID()}`;
  const workflowId = `${baseWorkflowId}-${randomUUID()}`;

  await ensureWorkflowWithConnector(workflowId, organizationId);

  const profile = await organizationService.getExecutionQuotaProfile(organizationId);
  const limit = profile.limits.maxConcurrentExecutions;
  const acquired: number[] = [];
  for (let i = 0; i < limit; i += 1) {
    const decision = await executionQuotaService.acquireRunningSlot(organizationId, {
      maxConcurrentExecutions: profile.limits.maxConcurrentExecutions,
    });
    assert(decision.allowed, 'expected running slot to be acquired');
    acquired.push(1);
  }

  let quotaError: ExecutionQuotaExceededError | null = null;
  try {
    await executionQueueService.enqueue({
      workflowId,
      organizationId,
      userId: 'test-user',
      triggerType: 'manual',
      triggerData: null,
    });
  } catch (error) {
    if (error instanceof ExecutionQuotaExceededError) {
      quotaError = error;
    } else {
      throw error;
    }
  } finally {
    await drainRunningSlots(organizationId, acquired.length);
  }

  assert(quotaError, 'expected enqueue to throw ExecutionQuotaExceededError');
  assert.equal(quotaError?.reason, 'concurrency');
  assert.equal(quotaError?.limit, limit);

  const executionId = quotaError?.executionId;
  assert(executionId, 'expected execution id on quota error');
  const executionRecord = await WorkflowRepository.getExecutionById(executionId!, organizationId);
  assert(executionRecord, 'execution record should be persisted');
  assert.equal(executionRecord?.status, 'failed');
  const quotaMetadata = (executionRecord?.metadata as any)?.quota;
  assert(quotaMetadata?.reason === 'concurrency');
}

// Throughput window exhaustion scenario
{
  const organizationId = `org-quota-throughput-${randomUUID()}`;
  const workflowId = `${baseWorkflowId}-${randomUUID()}`;

  await ensureWorkflowWithConnector(workflowId, organizationId);

  const profile = await organizationService.getExecutionQuotaProfile(organizationId);
  const limit = profile.limits.maxExecutionsPerMinute;

  let increments = 0;
  for (let i = 0; i < limit; i += 1) {
    const admission = await executionQuotaService.reserveAdmission(organizationId, {
      maxConcurrentExecutions: profile.limits.maxConcurrentExecutions,
      maxExecutionsPerMinute: profile.limits.maxExecutionsPerMinute,
    });
    if (!admission.allowed) {
      break;
    }
    increments += 1;
  }

  let quotaError: ExecutionQuotaExceededError | null = null;
  try {
    await executionQueueService.enqueue({
      workflowId,
      organizationId,
      userId: 'test-user',
      triggerType: 'manual',
      triggerData: null,
    });
  } catch (error) {
    if (error instanceof ExecutionQuotaExceededError) {
      quotaError = error;
    } else {
      throw error;
    }
  } finally {
    for (let i = 0; i < increments; i += 1) {
      await executionQuotaService.releaseAdmission(organizationId);
    }
  }

  assert(quotaError, 'expected throughput quota error');
  assert.equal(quotaError?.reason, 'throughput');
  assert.equal(quotaError?.limit, limit);
  const executionId = quotaError?.executionId;
  assert(executionId, 'expected execution id on throughput quota error');
  const record = await WorkflowRepository.getExecutionById(executionId!, organizationId);
  assert(record, 'expected execution record');
  const metadata = (record?.metadata as any)?.quota;
  assert(metadata?.reason === 'throughput');
}

// Connector concurrency saturation scenario
{
  const organizationId = `org-connector-${randomUUID()}`;
  const workflowId = `${baseWorkflowId}-${randomUUID()}`;

  await ensureWorkflowWithConnector(workflowId, organizationId);

  const existingExecutions = [`existing-${randomUUID()}`, `existing-${randomUUID()}`];

  try {
    for (const existing of existingExecutions) {
      await connectorConcurrencyService.registerExecution({
        executionId: existing,
        organizationId,
        connectors: ['airtable'],
      });
    }

    let concurrencyError: ConnectorConcurrencyExceededError | null = null;
    try {
      await executionQueueService.enqueue({
        workflowId,
        organizationId,
        userId: 'test-user',
        triggerType: 'manual',
        triggerData: null,
      });
    } catch (error) {
      if (error instanceof ConnectorConcurrencyExceededError) {
        concurrencyError = error;
      } else {
        throw error;
      }
    }

    assert(concurrencyError, 'expected connector concurrency error');
    assert.equal(concurrencyError?.connectorId, 'airtable');
    assert.equal(concurrencyError?.scope, 'organization');

    const failedExecutionId = concurrencyError?.executionId;
    assert(failedExecutionId, 'expected execution id when connector limit is hit');
    const failedRecord = await WorkflowRepository.getExecutionById(failedExecutionId!, organizationId);
    assert(failedRecord, 'expected a persisted execution record for connector saturation');
    assert.equal(failedRecord?.status, 'failed');
    const connectorMetadata = (failedRecord?.metadata as any)?.connectorConcurrency;
    assert.equal(connectorMetadata?.violation?.connectorId, 'airtable');
    assert.equal(connectorMetadata?.violation?.scope, 'organization');
  } finally {
    for (const existing of existingExecutions) {
      await connectorConcurrencyService.releaseExecution(existing).catch(() => {});
    }
  }

  const enqueueResult = await executionQueueService.enqueue({
    workflowId,
    organizationId,
    userId: 'test-user',
    triggerType: 'manual',
    triggerData: null,
  });

  assert(enqueueResult.executionId, 'expected successful enqueue after releasing connector slots');
  const successRecord = await WorkflowRepository.getExecutionById(enqueueResult.executionId, organizationId);
  assert(successRecord, 'expected execution record for successful enqueue');
  const connectorsMeta = (successRecord?.metadata as any)?.connectors;
  assert(Array.isArray(connectorsMeta) && connectorsMeta.includes('airtable'), 'metadata should include connector list');
}
