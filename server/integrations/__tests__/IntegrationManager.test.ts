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
  adyen: {
    credentials: { apiKey: 'test_adyen_api_key', merchantAccount: 'TestMerchant' }
  },
  airtable: {
    credentials: { apiKey: 'test-airtable-key' }
  },
  bamboohr: {
    credentials: { apiKey: 'test-bamboohr-key', companyDomain: 'example' }
  },
  bitbucket: {
    credentials: { accessToken: 'bitbucket-access-token' }
  },
  box: {
    credentials: { accessToken: 'box-access-token' }
  },
  calendly: {
    credentials: { accessToken: 'calendly-access-token' }
  },
  confluence: {
    credentials: {
      baseUrl: 'https://example.atlassian.net',
      accessToken: 'confluence-access-token'
    }
  },
  dropbox: {
    credentials: { accessToken: 'dropbox-access-token' }
  },
  dynamics365: {
    credentials: {
      accessToken: 'dynamics-access-token',
      organizationUrl: 'https://contoso.crm.dynamics.com'
    }
  },
  freshdesk: {
    credentials: { apiKey: 'freshdesk-api-key', domain: 'example' }
  },
  github: {
    credentials: { accessToken: 'github-personal-token' }
  },
  gitlab: {
    credentials: { accessToken: 'gitlab-personal-token' }
  },
  gmail: {
    credentials: { accessToken: 'ya29.test-token' }
  },
  'google-calendar': {
    credentials: { accessToken: 'ya29.google-calendar-token' }
  },
  'google-chat': {
    credentials: { accessToken: 'ya29.google-chat-token' }
  },
  'google-docs': {
    credentials: { accessToken: 'ya29.google-docs-token' }
  },
  'google-drive': {
    credentials: { accessToken: 'ya29.google-drive-token' }
  },
  'google-forms': {
    credentials: { accessToken: 'ya29.google-forms-token' }
  },
  'google-slides': {
    credentials: { accessToken: 'ya29.google-slides-token' }
  },
  hubspot: {
    credentials: { accessToken: 'hubspot-access-token' }
  },
  intercom: {
    credentials: { accessToken: 'intercom-access-token' }
  },
  'jira-service-management': {
    credentials: {
      baseUrl: 'https://example.atlassian.net',
      accessToken: 'jira-service-access-token'
    }
  },
  mailchimp: {
    credentials: { apiKey: 'test-us1', dataCenter: 'us1' }
  },
  mailgun: {
    credentials: { apiKey: 'mailgun-api-key', domain: 'example.com' }
  },
  'microsoft-teams': {
    credentials: { accessToken: 'microsoft-graph-token' }
  },
  monday: {
    credentials: { accessToken: 'monday-access-token' }
  },
  notion: {
    credentials: { integrationToken: 'secret_notion_token' }
  },
  onedrive: {
    credentials: { accessToken: 'microsoft-onedrive-token' }
  },
  outlook: {
    credentials: { accessToken: 'microsoft-outlook-token' }
  },
  pagerduty: {
    credentials: { apiKey: 'pagerduty-api-key', fromEmail: 'ops@example.com' }
  },
  pipedrive: {
    credentials: { apiToken: 'pipedrive-api-token', companyDomain: 'example' }
  },
  quickbooks: {
    credentials: {
      accessToken: 'quickbooks-access-token',
      realmId: '1234567890'
    }
  },
  salesforce: {
    credentials: {
      accessToken: '00Dxx0000000000!AQEAQEtTestToken',
      instanceUrl: 'https://example.my.salesforce.com'
    }
  },
  sendgrid: {
    credentials: { apiKey: 'sendgrid-api-key' }
  },
  servicenow: {
    credentials: {
      instanceUrl: 'https://example.service-now.com',
      accessToken: 'servicenow-access-token'
    }
  },
  sharepoint: {
    credentials: {
      accessToken: 'microsoft-sharepoint-token',
      siteId: 'contoso.sharepoint.com,123,456'
    }
  },
  shopify: {
    credentials: { accessToken: 'shpat_test_token' },
    additionalConfig: { shopDomain: 'demo-store' }
  },
  slack: {
    credentials: { botToken: 'xoxb-test-token' }
  },
  smartsheet: {
    credentials: { accessToken: 'smartsheet-access-token' }
  },
  stripe: {
    credentials: { apiKey: 'sk_test_51ExampleKey' }
  },
  trello: {
    credentials: { apiKey: 'trello-api-key', token: 'trello-access-token' }
  },
  twilio: {
    credentials: { accountSid: 'AC0000000000000000000000000000000', authToken: 'twilio-auth-token' }
  },
  typeform: {
    credentials: { accessToken: 'typeform-access-token' }
  },
  zendesk: {
    credentials: { subdomain: 'example', email: 'agent@example.com', apiToken: 'zendesk-api-token' }
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
