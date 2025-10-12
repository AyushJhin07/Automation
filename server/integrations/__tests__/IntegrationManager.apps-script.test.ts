import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/test-db';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? 'a'.repeat(32);
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const { connectorRegistry } = await import('../../ConnectorRegistry.js');
await connectorRegistry.init();

const { IntegrationManager } = await import('../IntegrationManager.js');

const manager = new IntegrationManager();

const azureDescriptor = manager.getAppsScriptCredentialDescriptor('azure-devops');
assert(azureDescriptor, 'Azure DevOps descriptor should be generated');
assert.equal(azureDescriptor.propertyPrefix, 'AZURE_DEVOPS');
const azureFields = Object.fromEntries(azureDescriptor.fields.map(field => [field.key, field]));
assert.equal(azureFields.organization?.propertyName, 'AZURE_DEVOPS_ORGANIZATION');
assert.equal(azureFields.organization?.type, 'string');
assert.equal(azureFields.organization?.required, true);
assert.equal(azureFields.personal_access_token?.propertyName, 'AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN');
assert.equal(azureFields.personal_access_token?.type, 'secret');
assert.equal(azureFields.personal_access_token?.required, true);
assert.equal(azureFields.project?.propertyName, 'AZURE_DEVOPS_PROJECT');
assert.equal(azureFields.project?.type, 'string');
assert.equal(azureFields.project?.required, true);

const slackDescriptor = manager.getAppsScriptCredentialDescriptor('slack');
assert(slackDescriptor, 'Slack descriptor should be generated');
assert.equal(slackDescriptor.scopes.includes('chat:write'), true, 'Slack scopes should include chat:write');
const slackFields = new Map(slackDescriptor.fields.map(field => [field.propertyName, field]));
assert.equal(slackFields.has('SLACK_ACCESS_TOKEN'), true);
assert.equal(slackFields.get('SLACK_ACCESS_TOKEN')?.type, 'secret');
assert.equal(slackFields.get('SLACK_ACCESS_TOKEN')?.required, true);
assert.equal(slackFields.get('SLACK_REFRESH_TOKEN')?.required, false);
assert.equal(slackFields.get('SLACK_CLIENT_ID')?.type, 'string');
assert.equal(slackFields.get('SLACK_CLIENT_SECRET')?.type, 'secret');

const airtableDescriptor = manager.getAppsScriptCredentialDescriptor('airtable');
assert(airtableDescriptor, 'Airtable descriptor should exist');
assert.equal(airtableDescriptor.fields.length >= 1, true);
const airtableApiKey = airtableDescriptor.fields.find(field => field.propertyName === 'AIRTABLE_API_KEY');
assert(airtableApiKey, 'Airtable should expose AIRTABLE_API_KEY');
assert.equal(airtableApiKey?.type, 'secret');
assert.equal(airtableApiKey?.required, true);

const driveDescriptor = manager.getAppsScriptCredentialDescriptor('google-drive-enhanced');
assert(driveDescriptor, 'Google Drive descriptor should exist for enhanced ID');
assert.equal(driveDescriptor?.appId, 'google-drive');
assert.equal(
  driveDescriptor.fields.some(field => field.propertyName === 'GOOGLE_DRIVE_ACCESS_TOKEN'),
  true,
  'Google Drive should expose GOOGLE_DRIVE_ACCESS_TOKEN'
);

const unknownDescriptor = manager.getAppsScriptCredentialDescriptor('not-a-real-app');
assert.equal(unknownDescriptor, null, 'Unknown connectors should return null descriptors');
