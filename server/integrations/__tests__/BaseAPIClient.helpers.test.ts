import assert from 'node:assert/strict';

import { APIResponse, BaseAPIClient } from '../BaseAPIClient.js';
import type { JSONSchemaType } from 'ajv';

type SamplePayload = {
  name: string;
  value: number;
};

const SAMPLE_SCHEMA: JSONSchemaType<SamplePayload> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    value: { type: 'number' }
  },
  required: ['name', 'value'],
  additionalProperties: false
};

class TestAPIClient extends BaseAPIClient {
  public aliasInvocations = 0;
  public operationAttempts = 0;

  constructor() {
    super('https://example.com', {});

    this.registerHandlers({
      'base_action': params => this.baseAction(params)
    });

    this.registerAliasHandlers({
      alias_action: 'handleAlias'
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return { success: true };
  }

  private async baseAction(params: Record<string, any>): Promise<APIResponse<any>> {
    this.operationAttempts += 1;
    return { success: true, data: params };
  }

  private async handleAlias(params: Record<string, any>): Promise<APIResponse<any>> {
    this.aliasInvocations += 1;
    return this.baseAction({ ...params, alias: true });
  }

  public executeAlias(params: Record<string, any>): Promise<APIResponse<any>> {
    return this.execute('alias_action', params);
  }

  public async exerciseRetries(sequence: APIResponse<any>[]): Promise<APIResponse<any>> {
    let index = 0;
    return this.withRetries(
      async () => {
        const result = sequence[Math.min(index, sequence.length - 1)];
        index += 1;
        if (!result.success) {
          this.operationAttempts += 1;
        }
        return result;
      },
      { retries: sequence.length - 1, initialDelayMs: 0, maxDelayMs: 0 }
    );
  }

  public async collectAllPages(responses: APIResponse<{ items: string[]; next?: string | null }>[]): Promise<APIResponse<string[]>> {
    let index = 0;
    return this.collectCursorPaginated({
      fetchPage: async cursor => {
        assert.equal(cursor ?? null, index === 0 ? null : responses[index - 1].data?.next ?? null);
        const response = responses[Math.min(index, responses.length - 1)];
        index += 1;
        return response;
      },
      extractItems: data => data.items,
      extractCursor: data => data.next ?? null,
      maxPages: responses.length
    });
  }

  public validatePayloadStrict(payload: unknown): SamplePayload {
    return this.validatePayload(SAMPLE_SCHEMA, payload);
  }
}

const client = new TestAPIClient();

async function testAliasRegistration(): Promise<void> {
  const response = await client.executeAlias({ foo: 'bar' });
  assert.equal(response.success, true, 'alias execution should succeed');
  assert.deepEqual(response.data, { foo: 'bar', alias: true });
  assert.equal(client.aliasInvocations, 1, 'alias handler should run exactly once');
}

async function testRetryHelper(): Promise<void> {
  const sequence: APIResponse<any>[] = [
    { success: false, error: 'rate limited', statusCode: 429 },
    { success: true, data: { ok: true }, statusCode: 200 }
  ];

  const response = await client.exerciseRetries(sequence);
  assert.equal(response.success, true, 'retry helper should eventually succeed');
  assert.equal(client.operationAttempts >= 1, true, 'retry helper should retry failed operations');
}

async function testCursorPagination(): Promise<void> {
  const responses: APIResponse<{ items: string[]; next?: string | null }>[] = [
    { success: true, data: { items: ['a', 'b'], next: 'cursor-1' } },
    { success: true, data: { items: ['c'], next: null } }
  ];

  const result = await client.collectAllPages(responses);
  assert.equal(result.success, true, 'cursor pagination should succeed');
  assert.deepEqual(result.data, ['a', 'b', 'c']);
}

function testSchemaValidation(): void {
  const valid = client.validatePayloadStrict({ name: 'example', value: 42 });
  assert.deepEqual(valid, { name: 'example', value: 42 });

  assert.throws(
    () => client.validatePayloadStrict({ name: 'example' }),
    /Payload validation failed/,
    'invalid payload should throw a validation error'
  );
}

await testAliasRegistration();
await testRetryHelper();
await testCursorPagination();
testSchemaValidation();

console.log('BaseAPIClient helper utilities verified.');
