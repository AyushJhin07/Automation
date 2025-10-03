import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { IntegrationManager } from '../IntegrationManager.js';
import { APICredentials } from '../BaseAPIClient.js';
import { IMPLEMENTED_CONNECTOR_IDS } from '../supportedApps.js';
import { ConnectorSimulator } from '../../testing/ConnectorSimulator.js';

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
  'azure-devops': {
    credentials: {
      organization: 'example-org',
      personal_access_token: 'azure-devops-pat',
      project: 'sample-project'
    }
  },
  bitbucket: {
    credentials: { accessToken: 'bitbucket-access-token' }
  },
  brex: {
    credentials: { accessToken: 'brex-access-token' }
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
  freshdesk: {
    credentials: { apiKey: 'freshdesk-api-key', domain: 'example' }
  },
  circleci: {
    credentials: { apiKey: 'circleci-api-token' }
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
  netsuite: {
    credentials: { accessToken: 'netsuite-access-token', accountId: '123456' }
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
  iterable: {
    credentials: { apiKey: 'iterable-api-key' }
  },
  jenkins: {
    credentials: {
      instanceUrl: 'https://jenkins.example.com',
      username: 'automation',
      api_token: 'jenkins-api-token'
    }
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
  marketo: {
    credentials: {
      accessToken: 'marketo-access-token',
      refreshToken: 'marketo-refresh-token',
      clientId: 'marketo-client-id',
      clientSecret: 'marketo-client-secret',
      instanceUrl: 'https://123-abc-456.mktorest.com'
    }
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
  pardot: {
    credentials: {
      accessToken: 'pardot-access-token',
      refreshToken: 'pardot-refresh-token',
      clientId: 'pardot-client-id',
      clientSecret: 'pardot-client-secret',
      businessUnitId: '0UvXXXX0000'
    }
  },
  outlook: {
    credentials: { accessToken: 'microsoft-outlook-token' }
  },
  pagerduty: {
    credentials: { apiKey: 'pagerduty-api-key', fromEmail: 'ops@example.com' }
  },
  ramp: {
    credentials: { apiKey: 'ramp-api-key' }
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
  klaviyo: {
    credentials: { apiKey: 'klaviyo-api-key' }
  },
  razorpay: {
    credentials: { keyId: 'rzp_test_key', keySecret: 'rzp_test_secret' }
  },
  salesforce: {
    credentials: {
      accessToken: '00Dxx0000000000!AQEAQEtTestToken',
      instanceUrl: 'https://example.my.salesforce.com'
    }
  },
  sageintacct: {
    credentials: {
      userId: 'user',
      userPassword: 'password',
      companyId: 'company',
      senderId: 'sender',
      senderPassword: 'senderPassword'
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
  'zoho-books': {
    credentials: { accessToken: 'zoho-books-token', organizationId: '999999' }
  },
  zendesk: {
    credentials: { subdomain: 'example', email: 'agent@example.com', apiToken: 'zendesk-api-token' }
  },
  xero: {
    credentials: { accessToken: 'xero-access-token', tenantId: 'tenant-1' }
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

const simulator = new ConnectorSimulator({
  fixturesDir: resolve(process.cwd(), 'server', 'testing', 'fixtures'),
  enabled: true,
  strict: true,
});

const simulatedManager = new IntegrationManager({ simulator, useSimulator: true });

const simulatedInit = await simulatedManager.initializeIntegration({
  appName: 'gmail',
  credentials: { accessToken: 'ignored-in-simulator' },
});

assert.equal(simulatedInit.success, true, 'Simulator-backed initializeIntegration should succeed.');

const simulatedExecution = await simulatedManager.executeFunction({
  appName: 'gmail',
  functionId: 'send_email',
  parameters: {},
  credentials: { accessToken: 'ignored-in-simulator' },
});

assert.equal(simulatedExecution.success, true, 'Simulator-backed executeFunction should succeed.');
assert.equal(
  (simulatedExecution.data as any)?.id,
  'simulated-message-id',
  'Simulator should return fixture payload for Gmail send_email.'
);
