import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

const {
  ensureDatabaseReady,
  setDatabaseAvailabilityForTests,
  resetDatabaseAvailabilityOverrideForTests,
} = await import('../../database/status.js');

setDatabaseAvailabilityForTests(false);
await ensureDatabaseReady();

const { WorkflowRepository } = await import('../WorkflowRepository.js');

async function runWorkflowMemoryFallbackIntegration(): Promise<void> {
  const saved = await WorkflowRepository.saveWorkflowGraph({
    name: 'In-memory Workflow',
    description: 'Uses the fallback storage when the database schema is unavailable',
    graph: { nodes: [{ id: 'start', type: 'trigger' }], edges: [] },
    metadata: { createdBy: 'memory-test', version: '0.1.0' },
    category: 'tests',
    tags: ['memory'],
  });

  assert.ok(saved.id, 'fallback save should allocate an id');
  assert.equal(saved.name, 'In-memory Workflow');
  assert.equal(saved.category, 'tests');

  const retrieved = await WorkflowRepository.getWorkflowById(saved.id);
  assert.ok(retrieved, 'fallback storage should retrieve saved workflows');
  assert.equal(retrieved?.id, saved.id);
  assert.equal(retrieved?.name, 'In-memory Workflow');
  assert.deepEqual(retrieved?.graph, { nodes: [{ id: 'start', type: 'trigger' }], edges: [] });

  const execution = await WorkflowRepository.createWorkflowExecution({
    workflowId: saved.id,
    status: 'started',
    triggerType: 'manual',
    triggerData: { via: 'memory-fallback' },
  });

  assert.equal(execution.workflowId, saved.id);
  assert.equal(execution.status, 'started');

  const updatedExecution = await WorkflowRepository.updateWorkflowExecution(execution.id, {
    status: 'completed',
    completedAt: new Date(),
    duration: 1234,
    metadata: { note: 'finished' },
  });

  assert.ok(updatedExecution, 'fallback execution updates should succeed');
  assert.equal(updatedExecution?.status, 'completed');
  assert.equal(updatedExecution?.duration, 1234);

  const loadedExecution = await WorkflowRepository.getExecutionById(execution.id);
  assert.ok(loadedExecution, 'fallback storage should return executions by id');
  assert.equal(loadedExecution?.status, 'completed');

  const count = await WorkflowRepository.countWorkflows();
  assert.equal(count, 1, 'fallback storage should track workflow counts');

  const deleted = await WorkflowRepository.deleteWorkflow(saved.id);
  assert.equal(deleted, true, 'fallback storage should allow deleting workflows');

  const afterDelete = await WorkflowRepository.getWorkflowById(saved.id);
  assert.equal(afterDelete, null, 'deleted workflows should no longer be retrievable');
}

try {
  await runWorkflowMemoryFallbackIntegration();
  console.log('WorkflowRepository fallback integration test passed.');
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(0);
} catch (error) {
  console.error('WorkflowRepository fallback integration test failed.', error);
  resetDatabaseAvailabilityOverrideForTests();
  process.exit(1);
}

