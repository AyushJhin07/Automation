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
  },
  dropbox: {
    credentials: { accessToken: 'dropbox-test-token' }
  },
  github: {
    credentials: { accessToken: 'ghp_test_token' }
  },
  'google-calendar': {
    credentials: { accessToken: 'ya29.google-calendar-token' }
  },
  'google-drive': {
    credentials: { accessToken: 'ya29.google-drive-token' }
  },
  hubspot: {
    credentials: { accessToken: 'hubspot-test-token' }
  },
  stripe: {
    credentials: { apiKey: 'sk_test_123' }
  },
  trello: {
    credentials: { apiKey: 'trello-key', apiToken: 'trello-token' }
  },
  zendesk: {
    credentials: { subdomain: 'example', email: 'agent@example.com', apiToken: 'secret' }
  },
  'asana-enhanced': {
    credentials: { accessToken: 'asana-test-token', workspaceGid: '12345' }
  },
  mailchimp: {
    credentials: { apiKey: 'test-us1', dataCenter: 'us1' }
  },
  twilio: {
    credentials: { accountSid: 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', authToken: 'auth-token' }
  }
};

assert(
  supportedApps.length > 20,
  `Expected a broad catalog of supported apps, got ${supportedApps.length}`
);

const createClient = (manager as any).createAPIClient.bind(manager) as (
  appKey: string,
  credentials: APICredentials,
  additionalConfig?: Record<string, any>
) => unknown;

for (const [appId, fixture] of Object.entries(credentialFixtures)) {
  assert(
    IMPLEMENTED_CONNECTOR_IDS.includes(appId),
    `Fixture app ${appId} should be present in implemented connectors`
  );

  const client = createClient(appId, fixture.credentials, fixture.additionalConfig);
  assert.notEqual(client, null, `Expected createAPIClient to return a client for ${appId}`);
}

console.log(
  `IntegrationManager exposes ${IMPLEMENTED_CONNECTOR_IDS.length} implemented connectors`
);
