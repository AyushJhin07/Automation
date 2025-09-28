import assert from 'node:assert/strict';

import { BUILDER_CORE_APP_IDS, IntegrationManager } from '../IntegrationManager.js';
import { APICredentials } from '../BaseAPIClient.js';
import { IMPLEMENTED_CONNECTOR_IDS } from '../supportedApps.js';

const manager = new IntegrationManager();

const supportedApps = manager.getSupportedApplications().sort();
const expectedApps = [...new Set([...IMPLEMENTED_CONNECTOR_IDS, ...BUILDER_CORE_APP_IDS])].sort();

assert.deepEqual(
  supportedApps,
  expectedApps,
  'IntegrationManager supported apps should include implemented connectors and core builder apps'
);

const credentialFixtures: Record<string, { credentials: APICredentials; additionalConfig?: Record<string, any> }> = {
  airtable: {
    credentials: { apiKey: 'test-api-key' }
  },
  gmail: {
    credentials: { accessToken: 'ya29.test-token' }
  },
  notion: {
    credentials: { integrationToken: 'secret_notion_token' }
  },
  shopify: {
    credentials: { accessToken: 'shpat_test_token' },
    additionalConfig: { shopDomain: 'demo-store' }
  },
  slack: {
    credentials: { botToken: 'xoxb-test-token' }
  },
  sheets: {
    credentials: { mode: 'local' }
  },
  time: {
    credentials: { mode: 'local' }
  }
};

const createClient = (manager as any).createAPIClient.bind(manager) as (
  appKey: string,
  credentials: APICredentials,
  additionalConfig?: Record<string, any>
) => unknown;

for (const appId of expectedApps) {
  const fixture = credentialFixtures[appId];
  assert.ok(fixture, `Missing credential fixture for supported app ${appId}`);

  const client = createClient(appId, fixture.credentials, fixture.additionalConfig);
  assert.notEqual(client, null, `Expected createAPIClient to return a client for ${appId}`);
}

console.log(
  'IntegrationManager createAPIClient returns concrete clients for:',
  expectedApps.join(', ')
);
