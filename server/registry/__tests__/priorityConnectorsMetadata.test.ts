import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ConnectorDefinition {
  triggers?: Array<Record<string, any>>;
}

const loadConnectorDefinition = (connectorId: string): ConnectorDefinition => {
  const filePath = resolve(process.cwd(), 'connectors', connectorId, 'definition.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as ConnectorDefinition;
};

const findTrigger = (definition: ConnectorDefinition, triggerId: string) => {
  return definition.triggers?.find((trigger) => trigger.id === triggerId);
};

try {
  const gmail = loadConnectorDefinition('gmail');
  const gmailTrigger = findTrigger(gmail, 'new_email_received');
  assert(gmailTrigger, 'gmail.new_email_received trigger should be defined');
  assert.equal(gmailTrigger?.dedupeKey, 'id', 'Gmail trigger should dedupe on message id');
  assert.equal(gmailTrigger?.dedupe?.primaryKey, 'id', 'Gmail trigger dedupe primary key should be id');
  assert.equal(
    gmailTrigger?.outputSchema?.properties?.receivedAt?.format,
    'date-time',
    'Gmail schema should mark receivedAt as date-time'
  );
  assert.equal(
    gmailTrigger?.outputSchema?.properties?.from?.format,
    'email',
    'Gmail schema should mark from as email'
  );
  assert(gmailTrigger?.sample?._meta?.raw, 'Gmail sample should include raw metadata payload');
  const gmailSampleSize = Buffer.byteLength(JSON.stringify(gmailTrigger?.sample), 'utf-8');
  assert(gmailSampleSize < 2_048, 'Gmail sample should remain concise (<2KB)');

  const slack = loadConnectorDefinition('slack');
  const slackMessageTrigger = findTrigger(slack, 'message_received');
  assert(slackMessageTrigger, 'slack.message_received trigger should be defined');
  assert.equal(slackMessageTrigger?.dedupeKey, 'event_ts', 'Slack trigger should dedupe on event_ts');
  assert.equal(slackMessageTrigger?.dedupe?.primaryKey, 'event_ts', 'Slack dedupe primary key should be event_ts');
  assert.equal(
    slackMessageTrigger?.outputSchema?.properties?.eventTime?.format,
    'date-time',
    'Slack schema should expose ISO eventTime hint'
  );
  assert(slackMessageTrigger?.sample?._meta?.raw, 'Slack sample should include raw payload metadata');

  const sheets = loadConnectorDefinition('google-sheets-enhanced');
  const sheetsRowTrigger = findTrigger(sheets, 'row_added');
  assert(sheetsRowTrigger, 'sheets.row_added trigger should be defined');
  assert.equal(sheetsRowTrigger?.dedupeKey, 'rowId', 'Sheets row trigger should dedupe on rowId');
  assert.equal(
    sheetsRowTrigger?.outputSchema?.properties?.spreadsheetUrl?.format,
    'uri',
    'Sheets row schema should include spreadsheetUrl uri hint'
  );
  assert(sheetsRowTrigger?.sample?._meta?.raw, 'Sheets row sample should embed raw metadata');

  const sheetsCellTrigger = findTrigger(sheets, 'cell_updated');
  assert(sheetsCellTrigger, 'sheets.cell_updated trigger should be defined');
  assert.equal(sheetsCellTrigger?.dedupeKey, 'changeId', 'Sheets cell trigger should dedupe on changeId');
  assert.equal(
    sheetsCellTrigger?.outputSchema?.properties?.updatedBy?.format,
    'email',
    'Sheets cell schema should mark updatedBy as email'
  );
  assert(sheetsCellTrigger?.sample?._meta?.raw, 'Sheets cell sample should embed raw metadata');

  console.log('Priority connector metadata includes curated dedupe, schema hints, and raw payload samples.');
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
