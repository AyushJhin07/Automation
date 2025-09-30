import assert from 'node:assert/strict';

import { getConnectorHealthReport } from '../ConnectorDiagnostics.js';

const report = getConnectorHealthReport();

const wiredIds = new Set(report.wired.map(connector => connector.id));
const expectedWired = [
  'gmail',
  'shopify',
  'slack',
  'notion',
  'airtable',
  'asana-enhanced',
  'mailchimp',
  'twilio',
  'dropbox',
  'github',
  'google-calendar',
  'google-drive',
  'hubspot',
  'stripe',
  'trello',
  'zendesk'
];

for (const id of expectedWired) {
  assert(
    wiredIds.has(id),
    `Expected connector ${id} to be classified as wired, but it was not. Wired connectors: ${Array.from(wiredIds).join(', ')}`
  );
}

assert.strictEqual(report.loadFailures.length, 0, 'Connector diagnostics should not report JSON load failures once catalog is fixed');

assert(
  report.wired.length >= expectedWired.length,
  `Expected at least ${expectedWired.length} wired connectors, got ${report.wired.length}`
);
