import { randomUUID } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { NodeGraph } from '../../shared/nodeGraphSchema';
import {
  db,
  workflowExecutionStepDependencies,
  workflowExecutionSteps,
  type WorkflowResumeState,
} from '../database/schema.js';

export type ExecutionStepStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed';

export type ExecutionStepRecord = typeof workflowExecutionSteps.$inferSelect;

export interface InitializedStepDescriptor {
  stepId: string;
  nodeId: string;
}

export interface InitializedSteps {
  stepIdByNodeId: Map<string, string>;
  readySteps: InitializedStepDescriptor[];
}

interface InitializeStepsParams {
  executionId: string;
  workflowId: string;
  organizationId: string;
  graph: NodeGraph;
  maxAttempts?: number | null;
}

interface MarkStepCompletedParams {
  stepId: string;
  output: any;
  deterministicKeys?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  logs?: unknown;
  diagnostics?: Record<string, any> | null;
}

interface MarkStepFailedParams {
  stepId: string;
  error: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  finalFailure?: boolean;
  logs?: unknown;
  diagnostics?: Record<string, any> | null;
}

interface MarkStepWaitingParams {
  stepId: string;
  waitUntil: Date | null;
  resumeState: WorkflowResumeState | null;
  metadata?: Record<string, any> | null;
}

export type StepStatusCounts = Record<ExecutionStepStatus, number> & Record<string, number>;

export class WorkflowExecutionStepRepository {
  public static async initialize(params: InitializeStepsParams): Promise<InitializedSteps> {
    if (!db) {
      throw new Error('WorkflowExecutionStepRepository requires a database connection');
    }

    const stepIdByNodeId = new Map<string, string>();
    const createdAt = new Date();
    const steps = params.graph.nodes.map((node) => {
      const id = randomUUID();
      stepIdByNodeId.set(node.id, id);
      return {
        id,
        executionId: params.executionId,
        workflowId: params.workflowId,
        organizationId: params.organizationId,
        nodeId: node.id,
        status: 'pending' as ExecutionStepStatus,
        attempts: 0,
        maxAttempts: params.maxAttempts ?? null,
        queuedAt: createdAt,
        updatedAt: createdAt,
        metadata: null,
        input: null,
        output: null,
        error: null,
        deterministicKeys: null,
        resumeState: null,
        waitUntil: null,
        startedAt: null,
        completedAt: null,
        logs: null,
        diagnostics: null,
      };
    });

    await db.insert(workflowExecutionSteps).values(steps);

    const dependencies: Array<typeof workflowExecutionStepDependencies.$inferInsert> = [];
    for (const edge of params.graph.edges) {
      const fromId = stepIdByNodeId.get(edge.from);
      const toId = stepIdByNodeId.get(edge.to);
      if (!fromId || !toId) {
        console.warn(
          '[WorkflowExecutionStepRepository] Skipping dependency with missing node references',
          {
            executionId: params.executionId,
            edge,
          }
        );
        continue;
      }
      dependencies.push({
        id: randomUUID(),
        executionId: params.executionId,
        stepId: toId,
        dependsOnStepId: fromId,
        createdAt,
      });
    }

    if (dependencies.length > 0) {
      await db.insert(workflowExecutionStepDependencies).values(dependencies);
    }

    const inboundCounts = new Map<string, number>();
    for (const dependency of dependencies) {
      inboundCounts.set(
        dependency.stepId,
        (inboundCounts.get(dependency.stepId) ?? 0) + 1
      );
    }

    const readySteps = steps
      .filter((step) => (inboundCounts.get(step.id) ?? 0) === 0)
      .map((step) => ({ stepId: step.id, nodeId: step.nodeId }));

    return { stepIdByNodeId, readySteps };
  }

  public static async isInitialized(executionId: string): Promise<boolean> {
    if (!db) {
      return false;
    }

    const [row] = await db
      .select({ value: sql<number>`count(*)` })
      .from(workflowExecutionSteps)
      .where(eq(workflowExecutionSteps.executionId, executionId))
      .limit(1);

    return (row?.value ?? 0) > 0;
  }

  public static async getReadySteps(executionId: string): Promise<InitializedStepDescriptor[]> {
    if (!db) {
      return [];
    }

    const pending = await db
      .select({ id: workflowExecutionSteps.id, nodeId: workflowExecutionSteps.nodeId })
      .from(workflowExecutionSteps)
      .where(
        and(
          eq(workflowExecutionSteps.executionId, executionId),
          eq(workflowExecutionSteps.status, 'pending')
        )
      );

    const ready: InitializedStepDescriptor[] = [];
    for (const step of pending) {
      const satisfied = await this.areDependenciesSatisfied(step.id);
      if (satisfied) {
        ready.push({ stepId: step.id, nodeId: step.nodeId });
      }
    }

    return ready;
  }

  public static async getStepByNode(executionId: string, nodeId: string): Promise<ExecutionStepRecord | null> {
    if (!db) {
      return null;
    }

    const [row] = await db
      .select()
      .from(workflowExecutionSteps)
      .where(and(eq(workflowExecutionSteps.executionId, executionId), eq(workflowExecutionSteps.nodeId, nodeId)))
      .limit(1);

    return row ?? null;
  }

  public static async setQueued(stepId: string): Promise<void> {
    if (!db) {
      return;
    }

    await db
      .update(workflowExecutionSteps)
      .set({
        status: 'queued',
        queuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowExecutionSteps.id, stepId));
  }

  public static async markRunning(stepId: string): Promise<ExecutionStepRecord | null> {
    if (!db) {
      return null;
    }

    const [row] = await db
      .update(workflowExecutionSteps)
      .set({
        status: 'running',
        attempts: sql`${workflowExecutionSteps.attempts} + 1`,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowExecutionSteps.id, stepId))
      .returning();

    return row ?? null;
  }

  public static async markCompleted(params: MarkStepCompletedParams): Promise<void> {
    if (!db) {
      return;
    }

    await db
      .update(workflowExecutionSteps)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        output: params.output ?? null,
        deterministicKeys: params.deterministicKeys ?? null,
        metadata: params.metadata ?? null,
        logs: params.logs ?? null,
        diagnostics: params.diagnostics ?? null,
        error: null,
        waitUntil: null,
        resumeState: null,
      })
      .where(eq(workflowExecutionSteps.id, params.stepId));
  }

  public static async markFailed(params: MarkStepFailedParams): Promise<void> {
    if (!db) {
      return;
    }

    await db
      .update(workflowExecutionSteps)
      .set({
        status: params.finalFailure ? 'failed' : 'pending',
        updatedAt: new Date(),
        error: params.error ?? null,
        metadata: params.metadata ?? null,
        logs: params.logs ?? null,
        diagnostics: params.diagnostics ?? null,
        waitUntil: null,
        resumeState: null,
      })
      .where(eq(workflowExecutionSteps.id, params.stepId));
  }

  public static async markWaiting(params: MarkStepWaitingParams): Promise<void> {
    if (!db) {
      return;
    }

    await db
      .update(workflowExecutionSteps)
      .set({
        status: 'waiting',
        waitUntil: params.waitUntil,
        resumeState: params.resumeState ?? null,
        metadata: params.metadata ?? null,
        updatedAt: new Date(),
      })
      .where(eq(workflowExecutionSteps.id, params.stepId));
  }

  public static async updateResumeState(
    stepId: string,
    resumeState: WorkflowResumeState | null
  ): Promise<void> {
    if (!db) {
      return;
    }

    await db
      .update(workflowExecutionSteps)
      .set({ resumeState: resumeState ?? null, updatedAt: new Date() })
      .where(eq(workflowExecutionSteps.id, stepId));
  }

  public static async resetForRetry(stepId: string): Promise<void> {
    if (!db) {
      return;
    }

    await db
      .update(workflowExecutionSteps)
      .set({
        status: 'pending',
        startedAt: null,
        completedAt: null,
        waitUntil: null,
        resumeState: null,
        logs: null,
        diagnostics: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowExecutionSteps.id, stepId));
  }

  public static async getDependents(stepId: string): Promise<ExecutionStepRecord[]> {
    if (!db) {
      return [];
    }

    const dependents = await db
      .select({ stepId: workflowExecutionStepDependencies.stepId })
      .from(workflowExecutionStepDependencies)
      .where(eq(workflowExecutionStepDependencies.dependsOnStepId, stepId));

    if (dependents.length === 0) {
      return [];
    }

    const ids = dependents.map((row) => row.stepId);
    if (ids.length === 0) {
      return [];
    }

    return db
      .select()
      .from(workflowExecutionSteps)
      .where(inArray(workflowExecutionSteps.id, ids));
  }

  public static async areDependenciesSatisfied(stepId: string): Promise<boolean> {
    if (!db) {
      return false;
    }

    const dependencyIds = await db
      .select({ dependsOnStepId: workflowExecutionStepDependencies.dependsOnStepId })
      .from(workflowExecutionStepDependencies)
      .where(eq(workflowExecutionStepDependencies.stepId, stepId));

    if (dependencyIds.length === 0) {
      return true;
    }

    const rows = await db
      .select({ status: workflowExecutionSteps.status })
      .from(workflowExecutionSteps)
      .where(inArray(workflowExecutionSteps.id, dependencyIds.map((row) => row.dependsOnStepId)));

    if (rows.length === 0) {
      return false;
    }

    return rows.every((row) => row.status === 'completed');
  }

  public static async allStepsCompleted(executionId: string): Promise<boolean> {
    if (!db) {
      return false;
    }

    const [{ total, completed } = { total: 0, completed: 0 }] = await db
      .select({
        total: sql<number>`count(*)`,
        completed: sql<number>`count(*) filter (where ${workflowExecutionSteps.status} = 'completed')`,
      })
      .from(workflowExecutionSteps)
      .where(eq(workflowExecutionSteps.executionId, executionId));

    return total > 0 && total === completed;
  }

  public static async getSteps(executionId: string): Promise<ExecutionStepRecord[]> {
    if (!db) {
      return [];
    }

    return db
      .select()
      .from(workflowExecutionSteps)
      .where(eq(workflowExecutionSteps.executionId, executionId));
  }

  public static async getStatusCounts(executionId: string): Promise<StepStatusCounts> {
    if (!db) {
      return {
        pending: 0,
        queued: 0,
        running: 0,
        waiting: 0,
        completed: 0,
        failed: 0,
      } as StepStatusCounts;
    }

    const rows = await db
      .select({
        status: workflowExecutionSteps.status,
        count: sql<number>`count(*)`,
      })
      .from(workflowExecutionSteps)
      .where(eq(workflowExecutionSteps.executionId, executionId))
      .groupBy(workflowExecutionSteps.status);

    const counts: StepStatusCounts = {
      pending: 0,
      queued: 0,
      running: 0,
      waiting: 0,
      completed: 0,
      failed: 0,
    } as StepStatusCounts;

    for (const row of rows) {
      if (row.status) {
        counts[row.status as ExecutionStepStatus] = row.count;
      }
    }

    return counts;
  }

  public static async getNodeOutputs(executionId: string): Promise<Record<string, any>> {
    if (!db) {
      return {};
    }

    const rows = await db
      .select({ nodeId: workflowExecutionSteps.nodeId, output: workflowExecutionSteps.output })
      .from(workflowExecutionSteps)
      .where(eq(workflowExecutionSteps.executionId, executionId));

    const outputs: Record<string, any> = {};
    for (const row of rows) {
      if (row.output !== null && row.output !== undefined) {
        outputs[row.nodeId] = row.output;
      }
    }
    return outputs;
  }

  public static async getDeterministicKeys(executionId: string): Promise<{
    idempotency: Record<string, string>;
    request: Record<string, string>;
  }> {
    if (!db) {
      return { idempotency: {}, request: {} };
    }

    const rows = await db
      .select({ nodeId: workflowExecutionSteps.nodeId, keys: workflowExecutionSteps.deterministicKeys })
      .from(workflowExecutionSteps)
      .where(eq(workflowExecutionSteps.executionId, executionId));

    const idempotency: Record<string, string> = {};
    const request: Record<string, string> = {};

    for (const row of rows) {
      if (!row.keys || typeof row.keys !== 'object') {
        continue;
      }
      const value = row.keys as {
        idempotency?: Record<string, string> | null;
        request?: Record<string, string> | null;
      };

      if (value.idempotency) {
        for (const [key, val] of Object.entries(value.idempotency)) {
          if (typeof val === 'string' && val) {
            idempotency[key] = val;
          }
        }
      }

      if (value.request) {
        for (const [key, val] of Object.entries(value.request)) {
          if (typeof val === 'string' && val) {
            request[key] = val;
          }
        }
      }
    }

    return { idempotency, request };
  }

  public static async getResumeState(stepId: string): Promise<WorkflowResumeState | null> {
    if (!db) {
      return null;
    }

    const [row] = await db
      .select({ resumeState: workflowExecutionSteps.resumeState })
      .from(workflowExecutionSteps)
      .where(eq(workflowExecutionSteps.id, stepId))
      .limit(1);

    return (row?.resumeState as WorkflowResumeState | null) ?? null;
  }

  public static async clearResumeState(stepId: string): Promise<void> {
    if (!db) {
      return;
    }

    await db
      .update(workflowExecutionSteps)
      .set({ resumeState: null, waitUntil: null, updatedAt: new Date() })
      .where(eq(workflowExecutionSteps.id, stepId));
  }
}
