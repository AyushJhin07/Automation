import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { llmRegistry } = await import('../../../llm/LLMProvider.js');
const { runLLMToolCall } = await import('../executeLLM.js');
const { retryManager } = await import('../../../core/RetryManager.js');

class MockToolProvider {
  private attempt = 0;
  public lastMessages?: any[];

  constructor(private readonly providerId: string, private readonly responses: any[]) {}

  public get id() {
    return this.providerId;
  }

  supportsJSON(): boolean {
    return true;
  }

  async generate(params: any) {
    this.attempt++;
    this.lastMessages = params.messages;
    return this.responses[Math.min(this.attempt - 1, this.responses.length - 1)];
  }

  get callCount(): number {
    return this.attempt;
  }
}

const baseTools = [
  {
    name: 'lookup_user',
    description: 'Lookup a user by id',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', minLength: 1 },
        includeMetadata: { type: 'boolean' }
      },
      required: ['userId']
    }
  }
];

const baseContext = {
  userId: 'user-1',
  workflowId: 'workflow-123',
  organizationId: 'org-1',
  executionId: 'exec-1',
  nodeId: 'node-1'
};

retryManager.resetForTests();
retryManager.clearActionableErrors();

const provider = new MockToolProvider('test-tools-success', [
  { toolCalls: [{ name: 'lookup_user', arguments: { includeMetadata: 'yes' } }], usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
  { toolCalls: [{ name: 'lookup_user', arguments: { userId: '1234', includeMetadata: true } }], usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 } }
]);
llmRegistry.register(provider as any);

const result = await runLLMToolCall(
  {
    provider: provider.id,
    model: 'test:model',
    system: 'You are a function calling assistant',
    prompt: 'Call lookup_user with the right arguments',
    tools: baseTools
  },
  baseContext
);

assert.equal(provider.callCount, 2, 'LLM provider should be called twice due to auto-repair');
assert.equal(result.toolCalls.length, 1);
assert.equal(result.toolCalls[0].arguments.userId, '1234');
assert.equal(result.toolCalls[0].arguments.includeMetadata, true);

const actionableErrors = retryManager.getActionableErrors({ executionId: baseContext.executionId, nodeId: baseContext.nodeId });
assert.equal(actionableErrors.length, 1, 'Single validation error should be recorded for the failed attempt');
assert.equal(actionableErrors[0].code, 'LLM_TOOL_OUTPUT_SCHEMA_MISMATCH');

const repairMessage = provider.lastMessages?.at(-1)?.content ?? '';
assert.ok(
  typeof repairMessage === 'string' && repairMessage.includes('schema'),
  'Repair prompt should mention the schema requirements'
);

retryManager.resetForTests();
retryManager.clearActionableErrors();

const failingProvider = new MockToolProvider('test-tools-failure', [
  { toolCalls: [{ name: 'lookup_user', arguments: {} }] },
  { toolCalls: [{ name: 'lookup_user', arguments: { includeMetadata: 'maybe' } }] },
  { toolCalls: [{ name: 'lookup_user', arguments: { includeMetadata: 'still wrong' } }] }
]);
llmRegistry.register(failingProvider as any);

await assert.rejects(
  () => runLLMToolCall(
    {
      provider: failingProvider.id,
      model: 'test:model',
      system: 'You are a function calling assistant',
      prompt: 'Call lookup_user with the right arguments',
      tools: baseTools
    },
    { ...baseContext, executionId: 'exec-2' }
  ),
  /schema validation failed/i
);

assert.equal(failingProvider.callCount, 3, 'Max repair attempts should be exhausted');

const failureErrors = retryManager.getActionableErrors({ executionId: 'exec-2', nodeId: baseContext.nodeId });
assert.equal(failureErrors.length, 4, 'Three validation warnings and one final error should be recorded');
assert.equal(failureErrors.at(-1)?.code, 'LLM_TOOL_OUTPUT_SCHEMA_MISMATCH_FINAL');
