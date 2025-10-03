import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';

import {
  db,
  users,
  workflows,
  workflowExecutions,
  type workflows as workflowsTable,
  type workflowExecutions as workflowExecutionsTable,
} from '../database/schema.js';
import { ensureDatabaseReady, isDatabaseAvailable } from '../database/status.js';

void ensureDatabaseReady();

type WorkflowRow = typeof workflowsTable.$inferSelect;
type WorkflowInsert = typeof workflowsTable.$inferInsert;
type WorkflowExecutionRow = typeof workflowExecutionsTable.$inferSelect;
type WorkflowExecutionInsert = typeof workflowExecutionsTable.$inferInsert;

export interface SaveWorkflowGraphInput {
  id?: string;
  userId?: string;
  organizationId: string;
  name?: string;
  description?: string | null;
  graph: Record<string, any>;
  metadata?: Record<string, any> | null;
  category?: string | null;
  tags?: string[] | null;
}

export interface ListWorkflowOptions {
  userId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  organizationId: string;
}

export interface CreateWorkflowExecutionInput {
  id?: string;
  workflowId: string;
  userId?: string;
  organizationId: string;
  status?: string;
  triggerType?: string;
  triggerData?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  startedAt?: Date;
  nodeResults?: Record<string, any> | null;
}

export interface UpdateWorkflowExecutionInput {
  status?: string;
  completedAt?: Date | null;
  startedAt?: Date | null;
  duration?: number | null;
  nodeResults?: Record<string, any> | null;
  errorDetails?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  triggerData?: Record<string, any> | null;
}

interface MemoryWorkflowRecord extends WorkflowRow {
  graph: Record<string, any>;
}

interface MemoryExecutionRecord extends WorkflowExecutionRow {}

const SYSTEM_USER_EMAIL = 'system@automation.local';
const SYSTEM_USER_NAME = 'Automation System User';
const MEMORY_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export class WorkflowRepository {
  private static memoryWorkflows = new Map<string, MemoryWorkflowRecord>();
  private static memoryExecutions = new Map<string, MemoryExecutionRecord>();
  private static cachedSystemUserId: string | null = null;

  private static isDatabaseEnabled(): boolean {
    return isDatabaseAvailable();
  }

  private static now(): Date {
    return new Date();
  }

  private static sanitizeLimit(value?: number): number {
    if (!value || Number.isNaN(value)) {
      return 20;
    }
    return Math.max(1, Math.min(100, Math.floor(value)));
  }

  private static sanitizeOffset(value?: number): number {
    if (!value || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(0, Math.floor(value));
  }

  private static async ensureSystemUserId(): Promise<string> {
    if (!this.isDatabaseEnabled()) {
      return MEMORY_SYSTEM_USER_ID;
    }

    if (this.cachedSystemUserId) {
      return this.cachedSystemUserId;
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, SYSTEM_USER_EMAIL))
      .limit(1);

    if (existing.length > 0) {
      this.cachedSystemUserId = existing[0].id;
      return existing[0].id;
    }

    const [created] = await db
      .insert(users)
      .values({
        email: SYSTEM_USER_EMAIL,
        passwordHash: 'system-user-placeholder',
        name: SYSTEM_USER_NAME,
        role: 'system',
        plan: 'enterprise',
        planType: 'enterprise',
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: SYSTEM_USER_NAME,
          updatedAt: this.now(),
        },
      })
      .returning({ id: users.id });

    this.cachedSystemUserId = created.id;
    return created.id;
  }

  private static async resolveUserId(requested?: string | null): Promise<string> {
    if (!this.isDatabaseEnabled()) {
      return requested ?? MEMORY_SYSTEM_USER_ID;
    }

    if (requested) {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, requested))
        .limit(1);

      if (existing.length > 0) {
        return requested;
      }
    }

    return this.ensureSystemUserId();
  }

  private static buildWorkflowInsert(
    input: SaveWorkflowGraphInput,
    userId: string,
  ): WorkflowInsert {
    const name = input.name ?? input.graph?.name ?? 'Untitled Workflow';
    const description = input.description ?? input.graph?.description ?? null;
    const metadata = input.metadata ?? (input.graph?.metadata as Record<string, any> | null) ?? null;
    const tags = input.tags ?? (Array.isArray(input.graph?.tags) ? input.graph.tags : null);
    const category = input.category ?? (input.graph?.category as string | undefined) ?? null;

    return {
      id: input.id,
      userId,
      organizationId: input.organizationId,
      name,
      description,
      graph: input.graph,
      metadata,
      tags: tags ?? undefined,
      category: category ?? undefined,
      updatedAt: this.now(),
    } as WorkflowInsert;
  }

  private static buildMemoryWorkflow(
    input: SaveWorkflowGraphInput,
    userId: string,
    existing?: MemoryWorkflowRecord,
  ): MemoryWorkflowRecord {
    const now = this.now();
    const base: MemoryWorkflowRecord = existing ?? {
      id: input.id ?? randomUUID(),
      userId,
      organizationId: input.organizationId,
      name: input.name ?? input.graph?.name ?? 'Untitled Workflow',
      description: input.description ?? input.graph?.description ?? null,
      graph: input.graph,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastExecuted: existing?.lastExecuted ?? null,
      executionCount: existing?.executionCount ?? 0,
      totalRuns: existing?.totalRuns ?? 0,
      successfulRuns: existing?.successfulRuns ?? 0,
      category: input.category ?? (input.graph?.category as string | undefined) ?? 'general',
      tags: input.tags ?? (Array.isArray(input.graph?.tags) ? input.graph.tags : null),
      containsPii: existing?.containsPii ?? false,
      piiElements: existing?.piiElements ?? null,
      securityReview: existing?.securityReview ?? false,
      securityReviewDate: existing?.securityReviewDate ?? null,
      riskLevel: existing?.riskLevel ?? 'low',
      complianceFlags: existing?.complianceFlags ?? null,
      dataRetentionDays: existing?.dataRetentionDays ?? 90,
      avgExecutionTime: existing?.avgExecutionTime ?? null,
      successRate: existing?.successRate ?? 100,
      metadata: input.metadata ?? (input.graph?.metadata as Record<string, any> | null) ?? existing?.metadata ?? null,
    } as MemoryWorkflowRecord;

    return {
      ...base,
      id: input.id ?? base.id,
      graph: input.graph,
      organizationId: input.organizationId,
      name: input.name ?? input.graph?.name ?? base.name,
      description: input.description ?? input.graph?.description ?? base.description,
      metadata: input.metadata ?? (input.graph?.metadata as Record<string, any> | null) ?? base.metadata,
      tags: input.tags ?? (Array.isArray(input.graph?.tags) ? input.graph.tags : base.tags),
      category: input.category ?? base.category,
      updatedAt: now,
    };
  }

  private static buildMemoryExecution(
    input: CreateWorkflowExecutionInput,
    userId: string,
  ): MemoryExecutionRecord {
    const id = input.id ?? randomUUID();
    const now = input.startedAt ?? this.now();

    return {
      id,
      workflowId: input.workflowId,
      userId,
      organizationId: input.organizationId,
      status: input.status ?? 'queued',
      startedAt: now,
      completedAt: null,
      duration: null,
      triggerType: input.triggerType ?? 'manual',
      triggerData: input.triggerData ?? null,
      nodeResults: input.nodeResults ?? null,
      errorDetails: null,
      processedPii: false,
      piiTypes: null,
      apiCallsMade: 0,
      tokensUsed: 0,
      dataProcessed: 0,
      cost: 0,
      metadata: input.metadata ?? null,
    } as MemoryExecutionRecord;
  }

  public static async saveWorkflowGraph(input: SaveWorkflowGraphInput): Promise<WorkflowRow> {
    const userId = await this.resolveUserId(input.userId);

    if (!this.isDatabaseEnabled()) {
      const existing = input.id ? this.memoryWorkflows.get(input.id) : undefined;
      const record = this.buildMemoryWorkflow(input, userId, existing);
      this.memoryWorkflows.set(record.id, record);
      return record;
    }

    const values = this.buildWorkflowInsert(input, userId);

    const query = db
      .insert(workflows)
      .values(values)
      .onConflictDoUpdate({
        target: workflows.id,
        set: {
          name: values.name,
          description: values.description,
          graph: values.graph,
          metadata: values.metadata,
          category: values.category,
          tags: values.tags,
          updatedAt: values.updatedAt ?? this.now(),
        },
      })
      .returning();

    const [stored] = await query;
    return stored;
  }

  public static async getWorkflowById(id: string, organizationId: string): Promise<WorkflowRow | null> {
    if (!id) {
      return null;
    }

    if (!this.isDatabaseEnabled()) {
      const record = this.memoryWorkflows.get(id);
      if (!record || record.organizationId !== organizationId) {
        return null;
      }
      return record;
    }

    const result = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  public static async listWorkflows(options: ListWorkflowOptions) {
    const limit = this.sanitizeLimit(options.limit);
    const offset = this.sanitizeOffset(options.offset);

    if (!this.isDatabaseEnabled()) {
      const all = Array.from(this.memoryWorkflows.values());
      const filteredByOrg = all.filter((workflow) => workflow.organizationId === options.organizationId);
      const filtered = options.search
        ? filteredByOrg.filter((workflow) =>
            workflow.name.toLowerCase().includes(options.search!.toLowerCase()) ||
            (workflow.description ?? '').toLowerCase().includes(options.search!.toLowerCase()),
          )
        : filteredByOrg;
      const paginated = filtered.slice(offset, offset + limit);

      return {
        workflows: paginated,
        total: filtered.length,
        limit,
        offset,
      };
    }

    const conditions: any[] = [eq(workflows.organizationId, options.organizationId)];

    if (options.userId) {
      conditions.push(eq(workflows.userId, options.userId));
    }

    if (options.search) {
      const term = `%${options.search}%`;
      conditions.push(ilike(workflows.name, term));
    }

    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(workflows)
        .where(whereClause)
        .orderBy(desc(workflows.updatedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(workflows)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.value ?? 0;

    return {
      workflows: items,
      total,
      limit,
      offset,
    };
  }

  public static async deleteWorkflow(id: string, organizationId: string): Promise<boolean> {
    if (!id) {
      return false;
    }

    if (!this.isDatabaseEnabled()) {
      const record = this.memoryWorkflows.get(id);
      if (!record || record.organizationId !== organizationId) {
        return false;
      }
      return this.memoryWorkflows.delete(id);
    }

    const result = await db
      .delete(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)))
      .returning({ id: workflows.id });
    return result.length > 0;
  }

  public static async countWorkflows(): Promise<number> {
    if (!this.isDatabaseEnabled()) {
      return this.memoryWorkflows.size;
    }

    const result = await db.select({ value: count() }).from(workflows);
    return result[0]?.value ?? 0;
  }

  public static async createWorkflowExecution(
    input: CreateWorkflowExecutionInput,
  ): Promise<WorkflowExecutionRow> {
    const userId = await this.resolveUserId(input.userId);

    if (!this.isDatabaseEnabled()) {
      const record = this.buildMemoryExecution(input, userId);
      this.memoryExecutions.set(record.id, record);
      return record;
    }

    const values: WorkflowExecutionInsert = {
      id: input.id,
      workflowId: input.workflowId,
      userId,
      organizationId: input.organizationId,
      status: input.status ?? 'queued',
      triggerType: input.triggerType ?? 'manual',
      triggerData: input.triggerData ?? null,
      metadata: input.metadata ?? null,
      startedAt: input.startedAt ?? this.now(),
      nodeResults: input.nodeResults ?? null,
    } as WorkflowExecutionInsert;

    const [stored] = await db.insert(workflowExecutions).values(values).returning();
    return stored;
  }

  public static async claimNextQueuedExecution(
    organizationId: string,
  ): Promise<WorkflowExecutionRow | null> {
    if (!this.isDatabaseEnabled()) {
      return null;
    }

    const now = this.now();

    const result = await db.execute(sql<WorkflowExecutionRow>`
      WITH next_execution AS (
        SELECT id
        FROM ${workflowExecutions}
        WHERE status = 'queued'
          AND ${workflowExecutions.organizationId} = ${organizationId}
          AND (
            ${workflowExecutions.metadata} ->> 'nextRetryAt' IS NULL
            OR (${workflowExecutions.metadata} ->> 'nextRetryAt')::timestamptz <= ${now.toISOString()}
          )
        ORDER BY ${workflowExecutions.startedAt} ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${workflowExecutions} AS executions
      SET status = 'running',
          started_at = ${now}
      FROM next_execution
      WHERE executions.id = next_execution.id
        AND executions.organization_id = ${organizationId}
      RETURNING executions.*;
    `);

    const claimed = result.rows[0] as WorkflowExecutionRow | undefined;
    return claimed ?? null;
  }

  public static async updateWorkflowExecution(
    id: string,
    updates: UpdateWorkflowExecutionInput,
    organizationId: string,
  ): Promise<WorkflowExecutionRow | null> {
    if (!id) {
      return null;
    }

    if (!this.isDatabaseEnabled()) {
      const existing = this.memoryExecutions.get(id);
      if (!existing || existing.organizationId !== organizationId) {
        return null;
      }

      const updated: MemoryExecutionRecord = {
        ...existing,
        status: updates.status ?? existing.status,
        completedAt: updates.completedAt ?? existing.completedAt,
        startedAt: updates.startedAt ?? existing.startedAt,
        duration: updates.duration ?? existing.duration,
        nodeResults: updates.nodeResults ?? existing.nodeResults,
        errorDetails: updates.errorDetails ?? existing.errorDetails,
        metadata: updates.metadata ?? existing.metadata,
        triggerData: updates.triggerData ?? existing.triggerData,
      };

      this.memoryExecutions.set(id, updated);
      return updated;
    }

    const updateSet: Partial<WorkflowExecutionInsert> = {};

    if (updates.status !== undefined) updateSet.status = updates.status;
    if (updates.completedAt !== undefined) updateSet.completedAt = updates.completedAt;
    if (updates.startedAt !== undefined) updateSet.startedAt = updates.startedAt;
    if (updates.duration !== undefined) updateSet.duration = updates.duration;
    if (updates.nodeResults !== undefined) updateSet.nodeResults = updates.nodeResults;
    if (updates.errorDetails !== undefined) updateSet.errorDetails = updates.errorDetails;
    if (updates.metadata !== undefined) updateSet.metadata = updates.metadata;
    if (updates.triggerData !== undefined) updateSet.triggerData = updates.triggerData;

    if (Object.keys(updateSet).length === 0) {
      const [existing] = await db
        .select()
        .from(workflowExecutions)
        .where(and(eq(workflowExecutions.id, id), eq(workflowExecutions.organizationId, organizationId)))
        .limit(1);
      return existing ?? null;
    }

    const [result] = await db
      .update(workflowExecutions)
      .set(updateSet)
      .where(and(eq(workflowExecutions.id, id), eq(workflowExecutions.organizationId, organizationId)))
      .returning();

    return result ?? null;
  }

  public static async getExecutionById(
    id: string,
    organizationId: string,
  ): Promise<WorkflowExecutionRow | null> {
    if (!id) {
      return null;
    }

    if (!this.isDatabaseEnabled()) {
      const record = this.memoryExecutions.get(id);
      if (!record || record.organizationId !== organizationId) {
        return null;
      }
      return record;
    }

    const result = await db
      .select()
      .from(workflowExecutions)
      .where(and(eq(workflowExecutions.id, id), eq(workflowExecutions.organizationId, organizationId)))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  public static async getWorkflowMetrics() {
    if (!this.isDatabaseEnabled()) {
      const workflows = Array.from(this.memoryWorkflows.values());
      const lastUpdated = workflows.reduce<Date | null>((latest, workflow) => {
        if (!latest) return workflow.updatedAt;
        return workflow.updatedAt > latest ? workflow.updatedAt : latest;
      }, null);

      return {
        total: workflows.length,
        lastUpdated,
      };
    }

    const [totalResult, lastUpdatedResult] = await Promise.all([
      db.select({ value: count() }).from(workflows),
      db
        .select({ lastUpdated: sql<Date>`max(${workflows.updatedAt})` })
        .from(workflows),
    ]);

    return {
      total: totalResult[0]?.value ?? 0,
      lastUpdated: lastUpdatedResult[0]?.lastUpdated ?? null,
    };
  }
}

export default WorkflowRepository;
