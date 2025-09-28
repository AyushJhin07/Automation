import assert from 'node:assert/strict';

import { IntegrationManager } from '../IntegrationManager.js';
import { APICredentials } from '../BaseAPIClient.js';
import { IMPLEMENTED_CONNECTOR_IDS } from '../supportedApps.js';

const manager = new IntegrationManager();

const supportedApps = manager.getSupportedApplications().sort();
const implementedApps = [...IMPLEMENTED_CONNECTOR_IDS].sort();

assert.deepEqual(
  supportedApps,
  implementedApps,
  'IntegrationManager supported apps should match the implemented connector list'
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
    credentials: {}
  },
  time: {
    credentials: {}
  }
};

const createClient = (manager as any).createAPIClient.bind(manager) as (
  appKey: string,
  credentials: APICredentials,
  additionalConfig?: Record<string, any>
) => unknown;

for (const appId of IMPLEMENTED_CONNECTOR_IDS) {
  const fixture = credentialFixtures[appId];
  assert.ok(fixture, `Missing credential fixture for supported app ${appId}`);

  const client = createClient(appId, fixture.credentials, fixture.additionalConfig);
  assert.notEqual(client, null, `Expected createAPIClient to return a client for ${appId}`);
}

console.log(
  'IntegrationManager createAPIClient returns concrete clients for:',
  IMPLEMENTED_CONNECTOR_IDS.join(', ')
);
