import assert from 'node:assert/strict';

import { authStore } from '@/store/authStore';
import {
  getConnectorDefinitions,
  invalidateConnectorDefinitionsCache,
} from '../connectorDefinitionsService';
import { functionLibraryService } from '../functionLibraryService';

const originalFetch = globalThis.fetch;
const { token: originalToken, activeOrganizationId: originalOrgId } = authStore.getState();

const setAuthStateForTest = () => {
  authStore.setState({ token: 'undefined', activeOrganizationId: 'org-dev' });
};

const createMockResponse = <T>(status: number, ok: boolean, payload: T): Response =>
  ({
    ok,
    status,
    json: async () => payload,
  } as unknown as Response);

try {
  await (async () => {
    invalidateConnectorDefinitionsCache();
    const recordedAuthHeaders: Array<string | null> = [];
    const recordedOrgHeaders: Array<string | null> = [];
    let callCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      recordedAuthHeaders.push(headers.get('Authorization'));
      recordedOrgHeaders.push(headers.get('X-Organization-Id'));
      callCount += 1;

      if (typeof input === 'string' && input.startsWith('/api/metadata/v1/connectors')) {
        return createMockResponse(500, false, {});
      }

      if (typeof input === 'string' && input.startsWith('/api/registry/catalog')) {
        return createMockResponse(200, true, {
          success: true,
          catalog: {
            connectors: {
              demo: { id: 'demo', name: 'Demo Connector', hasImplementation: true },
            },
          },
        });
      }

      throw new Error(`Unexpected fetch input: ${String(input)}`);
    }) as typeof fetch;

    try {
      setAuthStateForTest();
      const definitions = await getConnectorDefinitions(true);
      assert.equal(callCount, 2, 'should attempt metadata fetch and fallback catalog fetch');
      assert.deepEqual(
        recordedAuthHeaders,
        [null, null],
        'Authorization header should be omitted when stored token string equals "undefined"',
      );
      assert.deepEqual(
        recordedOrgHeaders,
        ['org-dev', 'org-dev'],
        'Organization header should still be forwarded for fallback requests',
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(definitions, 'demo'),
        'fallback connector response should be normalized',
      );
    } finally {
      globalThis.fetch = originalFetch;
      invalidateConnectorDefinitionsCache();
    }
  })();

  await (async () => {
    const recordedAuthHeaders: Array<string | null> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      recordedAuthHeaders.push(headers.get('Authorization'));

      if (typeof input === 'string' && input.startsWith('/api/registry/functions/')) {
        return createMockResponse(200, true, {
          success: true,
          functions: { actions: [], triggers: [] },
        });
      }

      throw new Error(`Unexpected fetch input: ${String(input)}`);
    }) as typeof fetch;

    try {
      setAuthStateForTest();
      (functionLibraryService as any).cache?.clear?.();
      (functionLibraryService as any).cacheExpiry?.clear?.();
      const functions = await functionLibraryService.getAppFunctions('demo', true);
      assert.deepEqual(
        recordedAuthHeaders,
        [null],
        'Function library requests should omit Authorization when token string equals "undefined"',
      );
      assert.deepEqual(functions, [], 'empty mock payload should map to an empty function list');
    } finally {
      globalThis.fetch = originalFetch;
    }
  })();
} finally {
  globalThis.fetch = originalFetch;
  authStore.setState({ token: originalToken, activeOrganizationId: originalOrgId });
  invalidateConnectorDefinitionsCache();
  (functionLibraryService as any).cache?.clear?.();
  (functionLibraryService as any).cacheExpiry?.clear?.();
}
