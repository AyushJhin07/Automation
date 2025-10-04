import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';

import { executionQueueService } from '../ExecutionQueueService.js';
import { executionQuotaService, ExecutionQuotaExceededError } from '../ExecutionQuotaService.js';
import { WorkflowRepository } from '../../workflow/WorkflowRepository.js';
import { organizationService } from '../OrganizationService.js';

const baseWorkflowId = 'quota-test-workflow';

async function drainRunningSlots(organizationId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await executionQuotaService.releaseRunningSlot(organizationId);
  }
}

// Concurrency saturation scenario
{
  const organizationId = `org-quota-${randomUUID()}`;
  const workflowId = `${baseWorkflowId}-${randomUUID()}`;

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
