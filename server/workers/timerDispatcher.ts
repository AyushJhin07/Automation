import { setTimeout as delay } from 'node:timers/promises';

import { and, eq, lte, sql } from 'drizzle-orm';

import { db, workflowTimers } from '../database/schema.js';
import { executionQueueService } from '../services/ExecutionQueueService.js';
import { getErrorMessage } from '../types/common.js';
import type { WorkflowTimerPayload } from '../types/workflowTimers';

const POLL_INTERVAL_MS = Math.max(500, Number.parseInt(process.env.WORKFLOW_TIMER_POLL_INTERVAL_MS ?? '1000', 10));
const DISPATCH_BATCH_SIZE = Math.max(1, Number.parseInt(process.env.WORKFLOW_TIMER_DISPATCH_BATCH ?? '25', 10));
const RETRY_DELAY_MS = Math.max(5000, Number.parseInt(process.env.WORKFLOW_TIMER_RETRY_DELAY_MS ?? '30000', 10));

interface ClaimedTimer {
  id: string;
  executionId: string;
  payload: WorkflowTimerPayload;
}

async function claimDueTimers(limit: number): Promise<ClaimedTimer[]> {
  if (!db) {
    return [];
  }

  const now = new Date();
  const dueTimers = await db
    .select({
      id: workflowTimers.id,
      executionId: workflowTimers.executionId,
      resumeAt: workflowTimers.resumeAt,
      payload: workflowTimers.payload,
      status: workflowTimers.status,
    })
    .from(workflowTimers)
    .where(and(eq(workflowTimers.status, 'pending'), lte(workflowTimers.resumeAt, now)))
    .orderBy(workflowTimers.resumeAt)
    .limit(limit);

  const claimed: ClaimedTimer[] = [];
  const claimTime = new Date();

  for (const timer of dueTimers) {
    const [updated] = await db
      .update(workflowTimers)
      .set({
        status: 'enqueued',
        updatedAt: claimTime,
        dispatchedAt: claimTime,
        attempts: sql`${workflowTimers.attempts} + 1`,
      })
      .where(and(eq(workflowTimers.id, timer.id), eq(workflowTimers.status, 'pending')))
      .returning({
        id: workflowTimers.id,
        executionId: workflowTimers.executionId,
        payload: workflowTimers.payload,
      });

    if (!updated) {
      continue;
    }

    claimed.push({
      id: updated.id,
      executionId: updated.executionId,
      payload: updated.payload as WorkflowTimerPayload,
    });
  }

  return claimed;
}

async function releaseTimer(timerId: string, errorMessage?: string): Promise<void> {
  if (!db) {
    return;
  }

  try {
    await db
      .update(workflowTimers)
      .set({
        status: 'pending',
        resumeAt: new Date(Date.now() + RETRY_DELAY_MS),
        updatedAt: new Date(),
        lastError: errorMessage ?? null,
      })
      .where(eq(workflowTimers.id, timerId));
  } catch (error) {
    console.error('Failed to release workflow timer:', getErrorMessage(error));
  }
}

function isValidPayload(payload: WorkflowTimerPayload | null | undefined): payload is WorkflowTimerPayload {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof payload.executionId === 'string' &&
    typeof payload.workflowId === 'string' &&
    payload.resumeState &&
    typeof payload.resumeState === 'object'
  );
}

async function dispatchTimer(timer: ClaimedTimer): Promise<void> {
  const payload = timer.payload;
  if (!isValidPayload(payload)) {
    console.warn(`Timer ${timer.id} has invalid payload; releasing for retry.`);
    await releaseTimer(timer.id, 'invalid_payload');
    return;
  }

  if (!payload.organizationId) {
    console.error(`Timer ${timer.id} is missing organizationId; cannot resume execution ${payload.executionId}.`);
    await releaseTimer(timer.id, 'missing_organization');
    return;
  }

  try {
    await executionQueueService.enqueueResume({
      timerId: timer.id,
      executionId: payload.executionId,
      workflowId: payload.workflowId,
      organizationId: payload.organizationId,
      userId: payload.userId,
      resumeState: payload.resumeState,
      initialData: payload.initialData,
      triggerType: payload.triggerType ?? 'timer',
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error(`Failed to enqueue resume job for timer ${timer.id}:`, errorMessage);
    await releaseTimer(timer.id, errorMessage);
  }
}

async function runDispatcher(): Promise<void> {
  if (!db) {
    console.warn('⚠️ Workflow timer dispatcher disabled: database connection unavailable.');
    return;
  }

  console.log('⏰ Starting workflow timer dispatcher');
  executionQueueService.start();

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`🛑 Received ${signal}, shutting down timer dispatcher...`);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  while (!shuttingDown) {
    try {
      const timers = await claimDueTimers(DISPATCH_BATCH_SIZE);
      if (timers.length === 0) {
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      for (const timer of timers) {
        await dispatchTimer(timer);
      }
    } catch (error) {
      console.error('Timer dispatcher encountered an error:', getErrorMessage(error));
      await delay(POLL_INTERVAL_MS);
    }
  }

  try {
    await executionQueueService.stop();
  } catch (error) {
    console.error('Failed to stop execution queue during dispatcher shutdown:', getErrorMessage(error));
  }

  console.log('✅ Workflow timer dispatcher stopped');
}

void runDispatcher().catch((error) => {
  console.error('Failed to start workflow timer dispatcher:', getErrorMessage(error));
  process.exit(1);
});
