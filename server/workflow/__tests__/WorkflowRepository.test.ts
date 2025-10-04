import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

const schemaModule = await import('../../database/schema.js');
const { workflows, users, setDatabaseClientForTests } = schemaModule;
const {
  setDatabaseAvailabilityForTests,
  resetDatabaseAvailabilityOverrideForTests,
} = await import('../../database/status.js');

type TableType = typeof workflows | typeof users;

interface WhereCondition {
  column: string;
  value: unknown;
}

class FakeDb {
  private tables = new Map<string, any[]>();
  public readonly operationLog: string[] = [];

  public insert(table: TableType) {
    return new InsertBuilder(this, table);
  }

  public select(columns?: Record<string, any>) {
    return new SelectBuilder(this, columns);
  }

  public getTableRows(tableName: string) {
    return this.tables.get(tableName) ?? [];
  }

  public getOrCreateTable(tableName: string) {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, []);
    }
    return this.tables.get(tableName)!;
  }

  public resolveTableName(table: TableType): string {
    const symbol = Object.getOwnPropertySymbols(table).find((sym) => sym.description === 'drizzle:Name');
    if (!symbol) {
      throw new Error('Unable to resolve table name for fake database');
    }
    return table[symbol] as string;
  }

  public resolveColumnName(column: any): string {
    if (column && typeof column === 'object' && 'name' in column) {
      return this.normalizeColumnKey(column.name as string);
    }
    throw new Error('Unable to resolve column name for fake database');
  }

  private normalizeColumnKey(name: string): string {
    const raw = name.includes('.') ? name.split('.').pop()! : name;
    if (!raw.includes('_')) {
      return raw;
    }

    return raw
      .split('_')
      .map((segment, index) =>
        index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1)
      )
      .join('');
  }

  public logOperation(operation: string): void {
    this.operationLog.push(operation);
  }

  public prepareInsertRecord(tableName: string, values: Record<string, any>): Record<string, any> {
    const record = structuredClone(values);
    const now = new Date();

    if (!record.id) {
      record.id = randomUUID();
    }

    if (tableName === this.resolveTableName(users)) {
      record.createdAt ??= now;
      record.updatedAt ??= now;
      record.role ??= 'user';
      record.plan ??= 'free';
      record.planType ??= 'free';
    }

    if (tableName === this.resolveTableName(workflows)) {
      record.createdAt ??= now;
      record.updatedAt ??= now;
      record.isActive ??= true;
      record.executionCount ??= 0;
      record.totalRuns ??= 0;
      record.successfulRuns ??= 0;
    }

    return record;
  }

  public applyUpdateRecord(
    tableName: string,
    existing: Record<string, any>,
    setValues: Record<string, any> | undefined,
  ): Record<string, any> {
    const updated = structuredClone(existing);
    if (setValues) {
      for (const [key, value] of Object.entries(setValues)) {
        updated[key] = value;
      }
    }

    if (tableName === this.resolveTableName(workflows)) {
      updated.updatedAt ??= new Date();
    }

    return updated;
  }

  public parseWhere(condition: any): WhereCondition[] {
    if (!condition) {
      return [];
    }

    if (Array.isArray(condition.conditions)) {
      return condition.conditions.flatMap((cond) => this.parseWhere(cond));
    }

    const chunks: any[] = Array.isArray(condition.queryChunks) ? condition.queryChunks : [];
    const nestedFilters = chunks
      .filter((chunk) => chunk && typeof chunk === 'object' && Array.isArray(chunk.queryChunks))
      .flatMap((chunk) => this.parseWhere(chunk));
    const columnChunks = chunks.filter((chunk) => chunk && typeof chunk === 'object' && 'name' in chunk);
    const paramChunks = chunks.filter((chunk) => chunk && typeof chunk === 'object' && 'brand' in chunk && 'value' in chunk);

    if (columnChunks.length !== paramChunks.length) {
      if (nestedFilters.length > 0 && columnChunks.length === 0 && paramChunks.length === 0) {
        return nestedFilters;
      }
      throw new Error('Unsupported where clause for fake database');
    }

    const currentFilters = columnChunks.map((columnChunk, index) => ({
      column: this.resolveColumnName(columnChunk),
      value: paramChunks[index]?.value,
    }));

    return [...nestedFilters, ...currentFilters];
  }

  public projectRow(row: Record<string, any>, columns?: Record<string, any>): Record<string, any> {
    if (!columns) {
      return structuredClone(row);
    }

    const result: Record<string, any> = {};
    for (const [alias, column] of Object.entries(columns)) {
      if (column && typeof column === 'object' && 'name' in column) {
        result[alias] = row[this.resolveColumnName(column)];
      } else {
        result[alias] = row[alias];
      }
    }
    return result;
  }
}

class InsertBuilder {
  private readonly tableName: string;
  private insertValues: Record<string, any> | null = null;
  private conflict?: { target: any; set?: Record<string, any> };

  constructor(private readonly db: FakeDb, private readonly table: TableType) {
    this.tableName = db.resolveTableName(table);
  }

  public values(values: Record<string, any>) {
    this.insertValues = values;
    return this;
  }

  public onConflictDoUpdate(config: { target: any; set?: Record<string, any> }) {
    this.conflict = config;
    return this;
  }

  public returning() {
    return this.execute();
  }

  private async execute() {
    if (!this.insertValues) {
      throw new Error('Insert values must be provided before returning is called');
    }

    const table = this.db.getOrCreateTable(this.tableName);
    const record = this.db.prepareInsertRecord(this.tableName, this.insertValues);

    if (this.conflict) {
      const conflictTarget = this.conflict.target;
      const columnName = Array.isArray(conflictTarget)
        ? this.db.resolveColumnName(conflictTarget[0])
        : this.db.resolveColumnName(conflictTarget);

      const conflictValue = record[columnName];
      if (conflictValue !== undefined) {
        const existingIndex = table.findIndex((row) => row[columnName] === conflictValue);
        if (existingIndex >= 0) {
          const updated = this.db.applyUpdateRecord(this.tableName, table[existingIndex], this.conflict.set);
          table[existingIndex] = updated;
          this.db.logOperation(`update:${this.tableName}`);
          return [structuredClone(updated)];
        }
      }
    }

    table.push(record);
    this.db.logOperation(`insert:${this.tableName}`);
    return [structuredClone(record)];
  }
}

class SelectBuilder {
  private tableName: string | null = null;
  private whereClause: any = null;
  private limitValue: number | null = null;
  private offsetValue: number | null = null;

  constructor(private readonly db: FakeDb, private readonly columns?: Record<string, any>) {}

  public from(table: TableType) {
    this.tableName = this.db.resolveTableName(table);
    return this;
  }

  public where(condition: any) {
    this.whereClause = condition;
    return this;
  }

  public limit(value: number) {
    this.limitValue = value;
    return this;
  }

  public orderBy(): this {
    return this;
  }

  public offset(value: number): this {
    this.offsetValue = value;
    return this;
  }

  public then<TResult1 = Record<string, any>[], TResult2 = never>(
    onfulfilled?: ((value: Record<string, any>[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (!this.tableName) {
      throw new Error('Select queries must specify a table with from(...)');
    }

    const table = this.db.getTableRows(this.tableName);
    const filters = this.db.parseWhere(this.whereClause);

    let rows = table.slice();

    for (const filter of filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    if (this.offsetValue !== null) {
      rows = rows.slice(this.offsetValue);
    }

    if (this.limitValue !== null) {
      rows = rows.slice(0, this.limitValue);
    }

    this.db.logOperation(`select:${this.tableName}`);
    return rows.map((row) => this.db.projectRow(row, this.columns));
  }
}

const fakeDb = new FakeDb();
setDatabaseClientForTests(fakeDb);
setDatabaseAvailabilityForTests(true);

const { WorkflowRepository } = await import('../WorkflowRepository.js');

async function runWorkflowPersistenceIntegration(): Promise<void> {
  const initialGraph = { nodes: [], edges: [] };
  const initialMetadata = { version: '1.0.0', createdBy: 'integration-test' };
  const organizationId = 'org-db-primary';
  const otherOrganizationId = 'org-db-secondary';

  const created = await WorkflowRepository.saveWorkflowGraph({
    organizationId,
    name: 'Integration Workflow',
    description: 'Ensures database branch works',
    graph: initialGraph,
    metadata: initialMetadata,
    tags: ['integration'],
  });

  assert.ok(created.id, 'Inserted workflow should include an id');
  assert.equal(created.name, 'Integration Workflow', 'Workflow name should be persisted through the database branch');
  assert.deepEqual(created.graph, initialGraph, 'Workflow graph should be stored and returned from the database');
  assert.equal(fakeDb.operationLog.filter((entry) => entry === 'insert:workflows').length, 1, 'Workflow insert should call the database path');

  const updatedGraph = { nodes: [{ id: 'node-1', type: 'trigger' }], edges: [] };
  const updated = await WorkflowRepository.saveWorkflowGraph({
    id: created.id,
    organizationId,
    name: 'Integration Workflow Updated',
    description: 'Updated description',
    graph: updatedGraph,
    metadata: { ...initialMetadata, version: '1.1.0' },
  });

  assert.equal(updated.id, created.id, 'Updating the workflow should preserve the id');
  assert.equal(updated.name, 'Integration Workflow Updated', 'Updated workflow name should be returned');
  assert.deepEqual(updated.graph, updatedGraph, 'Updated workflow graph should be stored');
  assert.ok(fakeDb.operationLog.includes('update:workflows'), 'Updating a workflow should use the database conflict branch');

  const retrieved = await WorkflowRepository.getWorkflowById(created.id, organizationId);
  assert.ok(retrieved, 'Saved workflow should be retrievable by id');
  assert.equal(retrieved?.name, 'Integration Workflow Updated', 'Retrieved workflow should include updated fields');
  assert.deepEqual(retrieved?.graph, updatedGraph, 'Retrieved workflow graph should match the most recent update');
  assert.ok(fakeDb.operationLog.filter((entry) => entry === 'select:workflows').length >= 1, 'Selecting a workflow should execute a database query');

  const crossOrgFetch = await WorkflowRepository.getWorkflowById(created.id, otherOrganizationId);
  assert.equal(crossOrgFetch, null, 'Workflows should not be visible to other organizations');

  const otherWorkflow = await WorkflowRepository.saveWorkflowGraph({
    organizationId: otherOrganizationId,
    name: 'Secondary DB Workflow',
    description: 'Belongs to another organization',
    graph: { nodes: [{ id: 'secondary', type: 'trigger' }], edges: [] },
    metadata: { ...initialMetadata, version: '2.0.0' },
    tags: ['integration', 'secondary'],
  });

  const primaryList = await WorkflowRepository.listWorkflows({ organizationId, limit: 10, offset: 0 });
  assert.equal(primaryList.workflows.length, 1, 'Primary organization should only see its workflows');
  assert.equal(primaryList.workflows[0].id, created.id, 'Primary organization should see the expected workflow');

  const secondaryList = await WorkflowRepository.listWorkflows({ organizationId: otherOrganizationId, limit: 10, offset: 0 });
  assert.equal(secondaryList.workflows.length, 1, 'Secondary organization should only see its workflows');
  assert.equal(secondaryList.workflows[0].id, otherWorkflow.id, 'Secondary organization should see its workflow');

  const systemUser = fakeDb.getTableRows(fakeDb.resolveTableName(users)).find((row) => row.email === 'system@automation.local');
  assert.ok(systemUser, 'System user should be created in the database when none is provided');
  assert.ok(systemUser?.id, 'System user created during the test should include an id');
}

async function runWorkflowBreakingChangeGuardTest(): Promise<void> {
  const organizationId = 'org-db-breaking';
  const userId = 'user-breaking-guard';

  const baseGraph = {
    nodes: [
      {
        id: 'step-1',
        type: 'action',
        data: {
          label: 'List rows',
          outputs: ['rows', 'count'],
          metadata: {
            columns: ['rows', 'count'],
            schema: {
              rows: { type: 'array' },
              count: { type: 'number' },
            },
          },
        },
      },
    ],
    edges: [],
  } as Record<string, any>;

  const stored = await WorkflowRepository.saveWorkflowGraph({
    organizationId,
    name: 'Breaking Change Workflow',
    graph: baseGraph,
    metadata: { version: '1.0.0' },
  });

  await WorkflowRepository.publishWorkflowVersion({
    workflowId: stored.id,
    organizationId,
    environment: 'prod',
    userId,
  });

  const breakingGraph = {
    nodes: [
      {
        id: 'step-1',
        type: 'action',
        data: {
          label: 'List rows (updated)',
          outputs: ['rows'],
          metadata: {
            columns: ['rows'],
            schema: {
              rows: { type: 'array' },
            },
          },
        },
      },
    ],
    edges: [],
  } as Record<string, any>;

  await WorkflowRepository.saveWorkflowGraph({
    id: stored.id,
    organizationId,
    name: 'Breaking Change Workflow',
    graph: breakingGraph,
    metadata: { version: '1.1.0' },
  });

  const diff = await WorkflowRepository.getWorkflowDiff({
    workflowId: stored.id,
    organizationId,
    environment: 'prod',
  });

  assert.equal(diff.summary.hasBreakingChanges, true, 'Diff should flag breaking changes for removed outputs');
  assert.equal(
    diff.summary.breakingChanges.some((change) => change.type === 'output-removed' && change.nodeId === 'step-1'),
    true,
    'Diff should include an output removal entry',
  );

  await assert.rejects(
    WorkflowRepository.publishWorkflowVersion({
      workflowId: stored.id,
      organizationId,
      environment: 'prod',
      userId,
    }),
    /requires migration metadata/i,
    'Publishing without migration metadata should be rejected when breaking changes exist',
  );

  const metadata = {
    migration: {
      freezeActiveRuns: true,
      scheduleRollForward: true,
      scheduleBackfill: false,
      notes: 'Nightly backfill planned',
    },
  } as Record<string, any>;

  const publishResult = await WorkflowRepository.publishWorkflowVersion({
    workflowId: stored.id,
    organizationId,
    environment: 'prod',
    userId,
    metadata,
  });

  const migrationMetadata = publishResult.deployment.metadata?.migration as Record<string, any> | undefined;
  assert.ok(migrationMetadata, 'Deployment metadata should include migration details after approving breaking changes');
  assert.equal(migrationMetadata?.required, true, 'Migration metadata should mark the plan as required');
  assert.equal(migrationMetadata?.freezeActiveRuns, true, 'freezeActiveRuns decision should be persisted');
  assert.equal(migrationMetadata?.scheduleRollForward, true, 'scheduleRollForward decision should be persisted');
  assert.equal(migrationMetadata?.scheduleBackfill, false, 'scheduleBackfill decision should be persisted');
  assert.equal(migrationMetadata?.notes, 'Nightly backfill planned', 'Notes should be trimmed and stored');
  assert.ok(Array.isArray(migrationMetadata?.breakingChanges), 'Breaking change details should be preserved for auditing');
  assert.ok(
    (migrationMetadata?.breakingChanges as any[]).length > 0,
    'Stored migration metadata should list the breaking changes that were approved',
  );
  assert.ok(typeof migrationMetadata?.assessedAt === 'string', 'Migration metadata should record when the plan was captured');
}

try {
  await runWorkflowPersistenceIntegration();
  await runWorkflowBreakingChangeGuardTest();
  console.log('WorkflowRepository database integration test passed.');
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(0);
} catch (error) {
  console.error('WorkflowRepository database integration test failed.', error);
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(1);
}
