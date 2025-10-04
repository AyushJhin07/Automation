import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm';

import {
  db,
  users,
  workflows,
  workflowExecutions,
  workflowVersions,
  workflowDeployments,
  type workflows as workflowsTable,
  type workflowExecutions as workflowExecutionsTable,
  type workflowVersions as workflowVersionsTable,
  type workflowDeployments as workflowDeploymentsTable,
  type WorkflowVersionState,
  type WorkflowEnvironment,
} from '../database/schema.js';
import type {
  WorkflowBreakingChange,
  WorkflowMigrationMetadata,
} from '../../common/workflow-types.js';
import { ensureDatabaseReady, isDatabaseAvailable } from '../database/status.js';

void ensureDatabaseReady();

type WorkflowRow = typeof workflowsTable.$inferSelect;
type WorkflowInsert = typeof workflowsTable.$inferInsert;
type WorkflowExecutionRow = typeof workflowExecutionsTable.$inferSelect;
type WorkflowExecutionInsert = typeof workflowExecutionsTable.$inferInsert;
type WorkflowVersionRow = typeof workflowVersionsTable.$inferSelect;
type WorkflowVersionInsert = typeof workflowVersionsTable.$inferInsert;
type WorkflowDeploymentRow = typeof workflowDeploymentsTable.$inferSelect;
type WorkflowDeploymentInsert = typeof workflowDeploymentsTable.$inferInsert;

export interface WorkflowRecord extends WorkflowRow {
  latestVersionId: string;
  latestVersionNumber: number;
  latestVersionState: WorkflowVersionState;
}

export interface WorkflowDiffSummary {
  hasChanges: boolean;
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  metadataChanged: boolean;
  breakingChanges: WorkflowBreakingChange[];
  hasBreakingChanges: boolean;
}

export interface WorkflowMigrationDecision extends WorkflowMigrationMetadata {}

export interface WorkflowDiffResult {
  draftVersion?: WorkflowVersionRow | null;
  deployedVersion?: WorkflowVersionRow | null;
  deployment?: WorkflowDeploymentRow | null;
  summary: WorkflowDiffSummary;
}

export interface PublishWorkflowResult {
  deployment: WorkflowDeploymentRow;
  version: WorkflowVersionRow;
}

export interface WorkflowListResult {
  workflows: WorkflowRecord[];
  total: number;
  limit: number;
  offset: number;
}

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

interface MemoryWorkflowVersionRecord extends WorkflowVersionRow {
  graph: Record<string, any>;
}

interface MemoryWorkflowDeploymentRecord extends WorkflowDeploymentRow {}

const SYSTEM_USER_EMAIL = 'system@automation.local';
const SYSTEM_USER_NAME = 'Automation System User';
const MEMORY_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export class WorkflowRepository {
  private static memoryWorkflows = new Map<string, MemoryWorkflowRecord>();
  private static memoryExecutions = new Map<string, MemoryExecutionRecord>();
  private static memoryWorkflowVersions = new Map<string, MemoryWorkflowVersionRecord[]>();
  private static memoryWorkflowDeployments = new Map<string, MemoryWorkflowDeploymentRecord[]>();
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

  private static findLatestMemoryVersion(workflowId: string): MemoryWorkflowVersionRecord | null {
    const versions = this.memoryWorkflowVersions.get(workflowId) ?? [];
    return versions.reduce<MemoryWorkflowVersionRecord | null>((current, candidate) => {
      if (!current) {
        return candidate;
      }
      return candidate.versionNumber > current.versionNumber ? candidate : current;
    }, null);
  }

  private static getMemoryVersionById(
    workflowId: string,
    versionId: string,
  ): MemoryWorkflowVersionRecord | null {
    const versions = this.memoryWorkflowVersions.get(workflowId) ?? [];
    return versions.find((version) => version.id === versionId) ?? null;
  }

  private static getMemoryDeployment(
    workflowId: string,
    organizationId: string,
    environment: WorkflowEnvironment,
  ): MemoryWorkflowDeploymentRecord | null {
    const deployments = this.memoryWorkflowDeployments.get(workflowId) ?? [];
    const matching = deployments
      .filter(
        (deployment) =>
          deployment.organizationId === organizationId &&
          deployment.environment === environment &&
          deployment.isActive,
      )
      .sort((a, b) => {
        const aTime = a.deployedAt instanceof Date ? a.deployedAt.getTime() : 0;
        const bTime = b.deployedAt instanceof Date ? b.deployedAt.getTime() : 0;
        return bTime - aTime;
      });

    return matching[0] ?? null;
  }

  private static normalizeEnvironment(environment: string): WorkflowEnvironment {
    const normalized = (environment ?? '').toLowerCase();
    if (normalized === 'dev' || normalized === 'development') {
      return 'dev';
    }
    if (normalized === 'stage' || normalized === 'staging' || normalized === 'stg') {
      return 'stage';
    }
    if (normalized === 'prod' || normalized === 'production') {
      return 'prod';
    }
    throw new Error(`Unsupported deployment environment: ${environment}`);
  }

  private static getItemIdentifier(item: any, index: number, prefix: string): string {
    const candidate = item?.id ?? item?.key ?? item?.uuid ?? null;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
    return `${prefix}-${index}`;
  }

  private static mapGraphItems(graph: any, key: 'nodes' | 'edges'): Map<string, string> {
    const items = Array.isArray(graph?.[key]) ? graph[key] : [];
    const result = new Map<string, string>();
    items.forEach((item: any, index: number) => {
      const identifier = this.getItemIdentifier(item, index, key.slice(0, -1));
      const serialized = JSON.stringify(item ?? {});
      result.set(identifier, serialized);
    });
    return result;
  }

  private static mapGraphNodes(graph: any): {
    serialized: Map<string, string>;
    objects: Map<string, any>;
  } {
    const serialized = this.mapGraphItems(graph, 'nodes');
    const objects = new Map<string, any>();
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    nodes.forEach((node: any, index: number) => {
      const identifier = this.getItemIdentifier(node, index, 'node');
      objects.set(identifier, node ?? null);
    });
    return { serialized, objects };
  }

  private static collectMetadataSources(node: any): Array<Record<string, any>> {
    const sources: Array<Record<string, any>> = [];
    const add = (value: any) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sources.push(value as Record<string, any>);
      }
    };

    if (!node || typeof node !== 'object') {
      return sources;
    }

    add((node as any).metadata);
    add((node as any).outputMetadata);

    const data = (node as any).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      add(data.metadata);
      add(data.outputMetadata);
    }

    return sources;
  }

  private static extractNodeOutputs(node: any): string[] {
    const outputs = new Set<string>();

    const addList = (value: unknown) => {
      if (!value) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (typeof entry === 'string' && entry.trim()) {
            outputs.add(entry);
          }
        });
        return;
      }
      if (typeof value === 'string' && value.trim()) {
        outputs.add(value);
      }
    };

    const addMetadataOutputs = (meta: Record<string, any>) => {
      addList(meta.outputs);
      addList(meta.columns);
      if (meta.schema && typeof meta.schema === 'object' && !Array.isArray(meta.schema)) {
        Object.keys(meta.schema as Record<string, any>).forEach((key) => {
          if (key) {
            outputs.add(key);
          }
        });
      }
    };

    if (!node || typeof node !== 'object') {
      return [];
    }

    addList((node as any).outputs);
    addList((node as any)?.data?.outputs);
    addList((node as any)?.data?.ports?.outputs);

    for (const source of this.collectMetadataSources(node)) {
      addMetadataOutputs(source);
    }

    return Array.from(outputs.values()).sort();
  }

  private static sortObjectKeys<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((entry) => this.sortObjectKeys(entry)) as unknown as T;
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, any>)
        .sort(([a], [b]) => {
          if (a === b) {
            return 0;
          }
          return a > b ? 1 : -1;
        })
        .reduce<Record<string, any>>((acc, [key, val]) => {
          acc[key] = this.sortObjectKeys(val);
          return acc;
        }, {});

      return entries as unknown as T;
    }

    return value;
  }

  private static extractSchemaObject(node: any): Record<string, any> | null {
    const sources = this.collectMetadataSources(node);
    const combined: Record<string, any> = {};
    let hasSchema = false;

    for (const source of sources) {
      const schema = source?.schema;
      if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
        hasSchema = true;
        for (const [key, value] of Object.entries(schema as Record<string, any>)) {
          combined[key] = this.sortObjectKeys(value);
        }
      }
    }

    if (!hasSchema) {
      return null;
    }

    return this.sortObjectKeys(combined);
  }

  private static detectRemovedOutputs(previousNode: any, nextNode: any): string[] {
    const previous = new Set(this.extractNodeOutputs(previousNode));
    const next = new Set(this.extractNodeOutputs(nextNode));
    const removed: string[] = [];

    previous.forEach((output) => {
      if (!next.has(output)) {
        removed.push(output);
      }
    });

    return removed;
  }

  private static detectSchemaChange(
    previousNode: any,
    nextNode: any,
  ): { previous: Record<string, any> | null; current: Record<string, any> | null } | null {
    const previous = this.extractSchemaObject(previousNode);
    const current = this.extractSchemaObject(nextNode);

    if (!previous && !current) {
      return null;
    }

    const previousSerialized = previous ? JSON.stringify(previous) : null;
    const currentSerialized = current ? JSON.stringify(current) : null;

    if (previousSerialized === currentSerialized) {
      return null;
    }

    return {
      previous: previous ?? null,
      current: current ?? null,
    };
  }

  private static computeDiffSummary(
    deployedGraph: Record<string, any> | null | undefined,
    draftGraph: Record<string, any> | null | undefined,
  ): WorkflowDiffSummary {
    const { serialized: deployedNodes, objects: deployedNodeObjects } = this.mapGraphNodes(deployedGraph);
    const { serialized: draftNodes, objects: draftNodeObjects } = this.mapGraphNodes(draftGraph);
    const deployedEdges = this.mapGraphItems(deployedGraph, 'edges');
    const draftEdges = this.mapGraphItems(draftGraph, 'edges');

    const addedNodes = Array.from(draftNodes.keys()).filter((id) => !deployedNodes.has(id));
    const removedNodes = Array.from(deployedNodes.keys()).filter((id) => !draftNodes.has(id));
    const modifiedNodes = Array.from(draftNodes.keys()).filter((id) => {
      if (!deployedNodes.has(id)) {
        return false;
      }
      return deployedNodes.get(id) !== draftNodes.get(id);
    });

    const addedEdges = Array.from(draftEdges.keys()).filter((id) => !deployedEdges.has(id));
    const removedEdges = Array.from(deployedEdges.keys()).filter((id) => !draftEdges.has(id));

    const metadataChanged = JSON.stringify(deployedGraph?.metadata ?? null) !== JSON.stringify(draftGraph?.metadata ?? null);

    const breakingChanges: WorkflowBreakingChange[] = [];

    removedNodes.forEach((nodeId) => {
      const node = deployedNodeObjects.get(nodeId);
      const label = node?.name ?? node?.data?.label ?? nodeId;
      breakingChanges.push({
        type: 'node-removed',
        nodeId,
        description: `Node "${label}" was removed from the workflow.`,
      });
    });

    const sharedNodeIds = Array.from(draftNodeObjects.keys()).filter((id) => deployedNodeObjects.has(id));
    sharedNodeIds.forEach((nodeId) => {
      const previousNode = deployedNodeObjects.get(nodeId);
      const nextNode = draftNodeObjects.get(nodeId);
      if (!previousNode || !nextNode) {
        return;
      }

      const removedOutputs = this.detectRemovedOutputs(previousNode, nextNode);
      if (removedOutputs.length > 0) {
        const label = nextNode?.name ?? nextNode?.data?.label ?? nodeId;
        breakingChanges.push({
          type: 'output-removed',
          nodeId,
          description: `Node "${label}" no longer exposes output(s): ${removedOutputs.join(', ')}`,
          removedOutputs,
        });
      }

      const schemaChange = this.detectSchemaChange(previousNode, nextNode);
      if (schemaChange) {
        const label = nextNode?.name ?? nextNode?.data?.label ?? nodeId;
        breakingChanges.push({
          type: 'schema-changed',
          nodeId,
          description: `Schema for node "${label}" has changed.`,
          field: 'schema',
          previousSchema: schemaChange.previous,
          currentSchema: schemaChange.current,
        });
      }
    });

    const hasChanges =
      addedNodes.length > 0 ||
      removedNodes.length > 0 ||
      modifiedNodes.length > 0 ||
      addedEdges.length > 0 ||
      removedEdges.length > 0 ||
      metadataChanged;

    return {
      hasChanges,
      addedNodes,
      removedNodes,
      modifiedNodes,
      addedEdges,
      removedEdges,
      metadataChanged,
      breakingChanges,
      hasBreakingChanges: breakingChanges.length > 0,
    };
  }

  private static prepareDeploymentMetadata(
    metadata: Record<string, any> | null | undefined,
    diffSummary: WorkflowDiffSummary,
  ): Record<string, any> | null {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : null;

    if (!diffSummary.hasBreakingChanges) {
      return base;
    }

    const migrationSource = (metadata as any)?.migration ?? (base as any)?.migration;
    if (!migrationSource || typeof migrationSource !== 'object') {
      throw new Error(
        'Publishing workflows with breaking changes requires migration metadata including freezeActiveRuns, scheduleRollForward, and scheduleBackfill decisions.',
      );
    }

    if (
      typeof migrationSource.freezeActiveRuns !== 'boolean' ||
      typeof migrationSource.scheduleRollForward !== 'boolean' ||
      typeof migrationSource.scheduleBackfill !== 'boolean'
    ) {
      throw new Error(
        'Migration metadata must include boolean freezeActiveRuns, scheduleRollForward, and scheduleBackfill fields.',
      );
    }

    const normalized: WorkflowMigrationDecision = {
      required: true,
      freezeActiveRuns: migrationSource.freezeActiveRuns,
      scheduleRollForward: migrationSource.scheduleRollForward,
      scheduleBackfill: migrationSource.scheduleBackfill,
      notes:
        typeof migrationSource.notes === 'string' && migrationSource.notes.trim().length > 0
          ? migrationSource.notes.trim()
          : null,
      assessedAt: new Date().toISOString(),
      breakingChanges: diffSummary.breakingChanges,
    };

    const sanitized: Record<string, any> = base ? { ...base } : {};
    sanitized.migration = normalized;

    return sanitized;
  }

  private static async getLatestVersionRecord(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowVersionRow | null> {
    if (!this.isDatabaseEnabled()) {
      return this.findLatestMemoryVersion(workflowId);
    }

    const result = await db
      .select()
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.workflowId, workflowId),
          eq(workflowVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(workflowVersions.versionNumber))
      .limit(1);

    return result[0] ?? null;
  }

  private static async getVersionRecordById(
    workflowId: string,
    versionId: string,
    organizationId: string,
  ): Promise<WorkflowVersionRow | null> {
    if (!this.isDatabaseEnabled()) {
      return this.getMemoryVersionById(workflowId, versionId);
    }

    const result = await db
      .select()
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.id, versionId),
          eq(workflowVersions.workflowId, workflowId),
          eq(workflowVersions.organizationId, organizationId),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  private static async getActiveDeploymentRecord(
    workflowId: string,
    organizationId: string,
    environment: WorkflowEnvironment,
  ): Promise<WorkflowDeploymentRow | null> {
    if (!this.isDatabaseEnabled()) {
      return this.getMemoryDeployment(workflowId, organizationId, environment);
    }

    const result = await db
      .select()
      .from(workflowDeployments)
      .where(
        and(
          eq(workflowDeployments.workflowId, workflowId),
          eq(workflowDeployments.organizationId, organizationId),
          eq(workflowDeployments.environment, environment),
          eq(workflowDeployments.isActive, true),
        ),
      )
      .orderBy(desc(workflowDeployments.deployedAt))
      .limit(1);

    return result[0] ?? null;
  }

  private static async getDeploymentRecordById(
    workflowId: string,
    organizationId: string,
    deploymentId: string,
  ): Promise<WorkflowDeploymentRow | null> {
    if (!this.isDatabaseEnabled()) {
      const deployments = this.memoryWorkflowDeployments.get(workflowId) ?? [];
      return (
        deployments.find(
          (deployment) =>
            deployment.id === deploymentId && deployment.organizationId === organizationId,
        ) ?? null
      );
    }

    const result = await db
      .select()
      .from(workflowDeployments)
      .where(
        and(
          eq(workflowDeployments.id, deploymentId),
          eq(workflowDeployments.workflowId, workflowId),
          eq(workflowDeployments.organizationId, organizationId),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  public static async saveWorkflowGraph(input: SaveWorkflowGraphInput): Promise<WorkflowRecord> {
    const userId = await this.resolveUserId(input.userId);
    const now = this.now();

    if (!this.isDatabaseEnabled()) {
      const existing = input.id ? this.memoryWorkflows.get(input.id) : undefined;
      const record = this.buildMemoryWorkflow(input, userId, existing);
      this.memoryWorkflows.set(record.id, record);

      const versions = this.memoryWorkflowVersions.get(record.id) ?? [];
      const nextVersionNumber = versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;

      const version: MemoryWorkflowVersionRecord = {
        id: randomUUID(),
        workflowId: record.id,
        organizationId: input.organizationId,
        versionNumber: nextVersionNumber,
        state: 'draft',
        graph: input.graph,
        metadata: record.metadata ?? null,
        name: record.name,
        description: record.description ?? null,
        createdAt: now,
        createdBy: userId,
        publishedAt: null,
        publishedBy: null,
      };

      this.memoryWorkflowVersions.set(record.id, [...versions, version]);

      return {
        ...record,
        graph: input.graph,
        latestVersionId: version.id,
        latestVersionNumber: version.versionNumber,
        latestVersionState: version.state as WorkflowVersionState,
      };
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
          updatedAt: values.updatedAt ?? now,
        },
      })
      .returning();

    const [stored] = await query;

    const [{ value: currentMaxVersion }] = await db
      .select({
        value: sql<number>`coalesce(max(${workflowVersions.versionNumber}), 0)`,
      })
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.workflowId, stored.id),
          eq(workflowVersions.organizationId, input.organizationId),
        ),
      );

    const versionNumber = Number(currentMaxVersion ?? 0) + 1;

    const versionValues: WorkflowVersionInsert = {
      workflowId: stored.id,
      organizationId: input.organizationId,
      versionNumber,
      state: 'draft',
      graph: input.graph,
      metadata: (values.metadata as Record<string, any> | null) ?? null,
      name: values.name,
      description: values.description ?? null,
      createdAt: now,
      createdBy: userId,
    };

    const [version] = await db.insert(workflowVersions).values(versionValues).returning();

    return {
      ...stored,
      graph: version.graph ?? stored.graph,
      name: version.name ?? stored.name,
      description: version.description ?? stored.description,
      metadata: (version.metadata as any) ?? stored.metadata,
      latestVersionId: version.id,
      latestVersionNumber: version.versionNumber,
      latestVersionState: version.state as WorkflowVersionState,
    };
  }

  public static async getWorkflowById(id: string, organizationId: string): Promise<WorkflowRecord | null> {
    if (!id) {
      return null;
    }

    if (!this.isDatabaseEnabled()) {
      const record = this.memoryWorkflows.get(id);
      if (!record || record.organizationId !== organizationId) {
        return null;
      }

      const versions = this.memoryWorkflowVersions.get(id) ?? [];
      const latest = versions.reduce<MemoryWorkflowVersionRecord | null>((current, candidate) => {
        if (!current) {
          return candidate;
        }
        return candidate.versionNumber > current.versionNumber ? candidate : current;
      }, null);

      return {
        ...record,
        graph: latest?.graph ?? record.graph,
        name: latest?.name ?? record.name,
        description: latest?.description ?? record.description,
        metadata: (latest?.metadata as any) ?? record.metadata,
        latestVersionId: latest?.id ?? record.id,
        latestVersionNumber: latest?.versionNumber ?? 1,
        latestVersionState: (latest?.state ?? 'draft') as WorkflowVersionState,
      };
    }

    const result = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const workflow = result[0];

    const versionResult = await db
      .select()
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.workflowId, id),
          eq(workflowVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(workflowVersions.versionNumber))
      .limit(1);

    const version = versionResult[0];

    return {
      ...workflow,
      graph: version?.graph ?? workflow.graph,
      name: version?.name ?? workflow.name,
      description: version?.description ?? workflow.description,
      metadata: (version?.metadata as any) ?? workflow.metadata,
      latestVersionId: version?.id ?? workflow.id,
      latestVersionNumber: version?.versionNumber ?? 1,
      latestVersionState: (version?.state ?? 'draft') as WorkflowVersionState,
    };
  }

  public static async listWorkflows(options: ListWorkflowOptions): Promise<WorkflowListResult> {
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

      const enriched = paginated.map((workflow) => {
        const versions = this.memoryWorkflowVersions.get(workflow.id) ?? [];
        const latest = versions.reduce<MemoryWorkflowVersionRecord | null>((current, candidate) => {
          if (!current) {
            return candidate;
          }
          return candidate.versionNumber > current.versionNumber ? candidate : current;
        }, null);

        return {
          ...workflow,
          graph: latest?.graph ?? workflow.graph,
          name: latest?.name ?? workflow.name,
          description: latest?.description ?? workflow.description,
          metadata: (latest?.metadata as any) ?? workflow.metadata,
          latestVersionId: latest?.id ?? workflow.id,
          latestVersionNumber: latest?.versionNumber ?? 1,
          latestVersionState: (latest?.state ?? 'draft') as WorkflowVersionState,
        };
      });

      return {
        workflows: enriched,
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

    const workflowIds = items.map((item) => item.id);
    const versionMap = new Map<string, WorkflowVersionRow>();

    if (workflowIds.length > 0) {
      const versionRows = await db
        .select()
        .from(workflowVersions)
        .where(
          and(
            inArray(workflowVersions.workflowId, workflowIds),
            eq(workflowVersions.organizationId, options.organizationId),
          ),
        )
        .orderBy(desc(workflowVersions.versionNumber));

      for (const version of versionRows) {
        if (!versionMap.has(version.workflowId)) {
          versionMap.set(version.workflowId, version);
        }
      }
    }

    const enriched = items.map((workflow) => {
      const version = versionMap.get(workflow.id);
      return {
        ...workflow,
        graph: version?.graph ?? workflow.graph,
        name: version?.name ?? workflow.name,
        description: version?.description ?? workflow.description,
        metadata: (version?.metadata as any) ?? workflow.metadata,
        latestVersionId: version?.id ?? workflow.id,
        latestVersionNumber: version?.versionNumber ?? 1,
        latestVersionState: (version?.state ?? 'draft') as WorkflowVersionState,
      };
    });

    return {
      workflows: enriched,
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
      this.memoryWorkflowVersions.delete(id);
      this.memoryWorkflowDeployments.delete(id);
      return this.memoryWorkflows.delete(id);
    }

    const result = await db
      .delete(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)))
      .returning({ id: workflows.id });
    return result.length > 0;
  }

  public static async publishWorkflowVersion(params: {
    workflowId: string;
    organizationId: string;
    environment: WorkflowEnvironment | string;
    userId?: string;
    versionId?: string;
    metadata?: Record<string, any> | null;
    rollbackOfDeploymentId?: string | null;
  }): Promise<PublishWorkflowResult> {
    const environment = this.normalizeEnvironment(params.environment);
    const userId = await this.resolveUserId(params.userId);
    const now = this.now();

    if (!this.isDatabaseEnabled()) {
      const workflow = this.memoryWorkflows.get(params.workflowId);
      if (!workflow || workflow.organizationId !== params.organizationId) {
        throw new Error('Workflow not found for organization');
      }

      let version: MemoryWorkflowVersionRecord | null = null;

      if (params.versionId) {
        version = this.getMemoryVersionById(params.workflowId, params.versionId);
      } else {
        version = this.findLatestMemoryVersion(params.workflowId);
      }

      if (!version) {
        throw new Error('No workflow version available to publish');
      }

      const updatedVersion: MemoryWorkflowVersionRecord = {
        ...version,
        state: 'published',
        publishedAt: now,
        publishedBy: userId,
      };

      const versions = (this.memoryWorkflowVersions.get(params.workflowId) ?? []).map((entry) =>
        entry.id === version!.id ? updatedVersion : entry,
      );
      this.memoryWorkflowVersions.set(params.workflowId, versions);

      const deployments = this.memoryWorkflowDeployments.get(params.workflowId) ?? [];
      const activeDeploymentRecord = deployments.find(
        (deployment) =>
          deployment.organizationId === params.organizationId &&
          deployment.environment === environment &&
          deployment.isActive,
      );

      const activeVersionGraph = activeDeploymentRecord
        ? this.getMemoryVersionById(params.workflowId, activeDeploymentRecord.versionId)?.graph ?? null
        : null;

      const diffSummary = this.computeDiffSummary(activeVersionGraph, updatedVersion.graph);
      const deploymentMetadata = this.prepareDeploymentMetadata(params.metadata ?? null, diffSummary);

      const deactivated = deployments.map((deployment) => {
        if (
          deployment.organizationId === params.organizationId &&
          deployment.environment === environment &&
          deployment.isActive
        ) {
          return { ...deployment, isActive: false };
        }
        return deployment;
      });

      const newDeployment: MemoryWorkflowDeploymentRecord = {
        id: randomUUID(),
        workflowId: params.workflowId,
        organizationId: params.organizationId,
        versionId: updatedVersion.id,
        environment,
        isActive: true,
        deployedAt: now,
        deployedBy: userId,
        metadata: deploymentMetadata ?? null,
        rollbackOf: params.rollbackOfDeploymentId ?? null,
      };

      this.memoryWorkflowDeployments.set(params.workflowId, [...deactivated, newDeployment]);

      return {
        deployment: newDeployment,
        version: updatedVersion,
      };
    }

    let version: WorkflowVersionRow | null = null;

    if (params.versionId) {
      version = await this.getVersionRecordById(params.workflowId, params.versionId, params.organizationId);
    } else {
      version = await this.getLatestVersionRecord(params.workflowId, params.organizationId);
    }

    if (!version) {
      throw new Error('No workflow version available to publish');
    }

    if (version.state !== 'published') {
      const [updated] = await db
        .update(workflowVersions)
        .set({ state: 'published', publishedAt: now, publishedBy: userId })
        .where(eq(workflowVersions.id, version.id))
        .returning();
      if (updated) {
        version = updated;
      }
    }

    const activeDeployment = await this.getActiveDeploymentRecord(
      params.workflowId,
      params.organizationId,
      environment,
    );

    let activeVersionGraph: Record<string, any> | null = null;
    if (activeDeployment) {
      const activeVersion = await this.getVersionRecordById(
        params.workflowId,
        activeDeployment.versionId,
        params.organizationId,
      );
      activeVersionGraph = activeVersion?.graph ?? null;
    }

    const diffSummary = this.computeDiffSummary(activeVersionGraph, version.graph);
    const deploymentMetadata = this.prepareDeploymentMetadata(params.metadata ?? null, diffSummary);

    if (activeDeployment) {
      await db
        .update(workflowDeployments)
        .set({ isActive: false })
        .where(eq(workflowDeployments.id, activeDeployment.id));
    }

    const deploymentValues: WorkflowDeploymentInsert = {
      workflowId: params.workflowId,
      organizationId: params.organizationId,
      versionId: version.id,
      environment,
      isActive: true,
      deployedAt: now,
      deployedBy: userId,
      metadata: deploymentMetadata ?? null,
      rollbackOf: params.rollbackOfDeploymentId ?? activeDeployment?.id ?? null,
    };

    const [deployment] = await db
      .insert(workflowDeployments)
      .values(deploymentValues)
      .returning();

    return {
      deployment,
      version,
    };
  }

  public static async getWorkflowDiff(params: {
    workflowId: string;
    organizationId: string;
    environment: WorkflowEnvironment | string;
  }): Promise<WorkflowDiffResult> {
    const environment = this.normalizeEnvironment(params.environment);

    const [draftVersion, activeDeployment] = await Promise.all([
      this.getLatestVersionRecord(params.workflowId, params.organizationId),
      this.getActiveDeploymentRecord(params.workflowId, params.organizationId, environment),
    ]);

    let deployedVersion: WorkflowVersionRow | null = null;
    if (activeDeployment) {
      deployedVersion = await this.getVersionRecordById(
        params.workflowId,
        activeDeployment.versionId,
        params.organizationId,
      );
    }

    return {
      draftVersion,
      deployedVersion,
      deployment: activeDeployment,
      summary: this.computeDiffSummary(deployedVersion?.graph, draftVersion?.graph),
    };
  }

  public static async rollbackDeployment(params: {
    workflowId: string;
    organizationId: string;
    environment: WorkflowEnvironment | string;
    userId?: string;
    deploymentId?: string;
    metadata?: Record<string, any> | null;
  }): Promise<PublishWorkflowResult | null> {
    const environment = this.normalizeEnvironment(params.environment);

    const activeDeployment = await this.getActiveDeploymentRecord(
      params.workflowId,
      params.organizationId,
      environment,
    );

    if (!activeDeployment) {
      return null;
    }

    let targetDeployment: WorkflowDeploymentRow | MemoryWorkflowDeploymentRecord | null = null;

    if (params.deploymentId) {
      targetDeployment = await this.getDeploymentRecordById(
        params.workflowId,
        params.organizationId,
        params.deploymentId,
      );
    } else if (!this.isDatabaseEnabled()) {
      const deployments = this.memoryWorkflowDeployments.get(params.workflowId) ?? [];
      const candidates = deployments
        .filter(
          (deployment) =>
            deployment.organizationId === params.organizationId &&
            deployment.environment === environment &&
            !deployment.isActive,
        )
        .sort((a, b) => {
          const aTime = a.deployedAt instanceof Date ? a.deployedAt.getTime() : 0;
          const bTime = b.deployedAt instanceof Date ? b.deployedAt.getTime() : 0;
          return bTime - aTime;
        });
      targetDeployment = candidates[0] ?? null;
    } else {
      const result = await db
        .select()
        .from(workflowDeployments)
        .where(
          and(
            eq(workflowDeployments.workflowId, params.workflowId),
            eq(workflowDeployments.organizationId, params.organizationId),
            eq(workflowDeployments.environment, environment),
            eq(workflowDeployments.isActive, false),
          ),
        )
        .orderBy(desc(workflowDeployments.deployedAt))
        .limit(1);
      targetDeployment = result[0] ?? null;
    }

    if (!targetDeployment) {
      return null;
    }

    return this.publishWorkflowVersion({
      workflowId: params.workflowId,
      organizationId: params.organizationId,
      environment,
      userId: params.userId,
      versionId: targetDeployment.versionId,
      metadata: params.metadata ?? null,
      rollbackOfDeploymentId: activeDeployment.id,
    });
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
