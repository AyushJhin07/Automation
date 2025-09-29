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
      return column.name as string;
    }
    throw new Error('Unable to resolve column name for fake database');
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

    const chunks: any[] = Array.isArray(condition.queryChunks) ? condition.queryChunks : [];
    const columnChunk = chunks.find((chunk) => chunk && typeof chunk === 'object' && 'name' in chunk);
    const paramChunk = chunks.find((chunk) => chunk && typeof chunk === 'object' && 'brand' in chunk && 'value' in chunk);

    if (!columnChunk || !paramChunk) {
      throw new Error('Unsupported where clause for fake database');
    }

    return [
      {
        column: this.resolveColumnName(columnChunk),
        value: paramChunk.value,
      },
    ];
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
    return this.execute();
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

  const created = await WorkflowRepository.saveWorkflowGraph({
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
    name: 'Integration Workflow Updated',
    description: 'Updated description',
    graph: updatedGraph,
    metadata: { ...initialMetadata, version: '1.1.0' },
  });

  assert.equal(updated.id, created.id, 'Updating the workflow should preserve the id');
  assert.equal(updated.name, 'Integration Workflow Updated', 'Updated workflow name should be returned');
  assert.deepEqual(updated.graph, updatedGraph, 'Updated workflow graph should be stored');
  assert.ok(fakeDb.operationLog.includes('update:workflows'), 'Updating a workflow should use the database conflict branch');

  const retrieved = await WorkflowRepository.getWorkflowById(created.id);
  assert.ok(retrieved, 'Saved workflow should be retrievable by id');
  assert.equal(retrieved?.name, 'Integration Workflow Updated', 'Retrieved workflow should include updated fields');
  assert.deepEqual(retrieved?.graph, updatedGraph, 'Retrieved workflow graph should match the most recent update');
  assert.ok(fakeDb.operationLog.filter((entry) => entry === 'select:workflows').length >= 1, 'Selecting a workflow should execute a database query');

  const systemUser = fakeDb.getTableRows(fakeDb.resolveTableName(users)).find((row) => row.email === 'system@automation.local');
  assert.ok(systemUser, 'System user should be created in the database when none is provided');
  assert.ok(systemUser?.id, 'System user created during the test should include an id');
}

try {
  await runWorkflowPersistenceIntegration();
  console.log('WorkflowRepository database integration test passed.');
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(0);
} catch (error) {
  console.error('WorkflowRepository database integration test failed.', error);
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(1);
}
