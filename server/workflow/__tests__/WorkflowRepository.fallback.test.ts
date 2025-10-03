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
  const organizationId = 'org-memory-primary';
  const otherOrganizationId = 'org-memory-secondary';

  const saved = await WorkflowRepository.saveWorkflowGraph({
    organizationId,
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

  const otherWorkflow = await WorkflowRepository.saveWorkflowGraph({
    organizationId: otherOrganizationId,
    name: 'Secondary Workflow',
    description: 'Belongs to another organization',
    graph: { nodes: [{ id: 'secondary', type: 'trigger' }], edges: [] },
    metadata: { createdBy: 'memory-test', version: '0.2.0' },
    category: 'tests',
    tags: ['memory', 'secondary'],
  });

  const retrieved = await WorkflowRepository.getWorkflowById(saved.id, organizationId);
  assert.ok(retrieved, 'fallback storage should retrieve saved workflows');
  assert.equal(retrieved?.id, saved.id);
  assert.equal(retrieved?.name, 'In-memory Workflow');
  assert.deepEqual(retrieved?.graph, { nodes: [{ id: 'start', type: 'trigger' }], edges: [] });

  const crossOrgRetrieval = await WorkflowRepository.getWorkflowById(saved.id, otherOrganizationId);
  assert.equal(crossOrgRetrieval, null, 'workflows should not be visible across organizations');

  const primaryList = await WorkflowRepository.listWorkflows({ organizationId, limit: 10, offset: 0 });
  assert.equal(primaryList.workflows.length, 1, 'primary organization should see its workflow');
  assert.equal(primaryList.workflows[0].id, saved.id);

  const secondaryList = await WorkflowRepository.listWorkflows({ organizationId: otherOrganizationId, limit: 10, offset: 0 });
  assert.equal(secondaryList.workflows.length, 1, 'secondary organization should see only its workflow');
  assert.equal(secondaryList.workflows[0].id, otherWorkflow.id);

  const execution = await WorkflowRepository.createWorkflowExecution({
    workflowId: saved.id,
    organizationId,
    status: 'queued',
    triggerType: 'manual',
    triggerData: { via: 'memory-fallback' },
  });

  assert.equal(execution.workflowId, saved.id);
  assert.equal(execution.status, 'queued');

  const crossOrgExecution = await WorkflowRepository.getExecutionById(execution.id, otherOrganizationId);
  assert.equal(crossOrgExecution, null, 'executions should not be visible across organizations');

  const updatedExecution = await WorkflowRepository.updateWorkflowExecution(execution.id, {
    status: 'completed',
    completedAt: new Date(),
    duration: 1234,
    metadata: { note: 'finished' },
  }, organizationId);

  assert.ok(updatedExecution, 'fallback execution updates should succeed');
  assert.equal(updatedExecution?.status, 'completed');
  assert.equal(updatedExecution?.duration, 1234);

  const loadedExecution = await WorkflowRepository.getExecutionById(execution.id, organizationId);
  assert.ok(loadedExecution, 'fallback storage should return executions by id');
  assert.equal(loadedExecution?.status, 'completed');

  const count = await WorkflowRepository.countWorkflows();
  assert.equal(count, 2, 'fallback storage should include workflows from all organizations in totals');

  const wrongDelete = await WorkflowRepository.deleteWorkflow(saved.id, otherOrganizationId);
  assert.equal(wrongDelete, false, 'workflows should not delete from other organizations');

  const deleted = await WorkflowRepository.deleteWorkflow(saved.id, organizationId);
  assert.equal(deleted, true, 'fallback storage should allow deleting workflows');

  const afterDelete = await WorkflowRepository.getWorkflowById(saved.id, organizationId);
  assert.equal(afterDelete, null, 'deleted workflows should no longer be retrievable');

  const remaining = await WorkflowRepository.listWorkflows({ organizationId: otherOrganizationId, limit: 10, offset: 0 });
  assert.equal(remaining.workflows.length, 1, 'other organizations should retain their workflows');

  await WorkflowRepository.deleteWorkflow(otherWorkflow.id, otherOrganizationId);
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

