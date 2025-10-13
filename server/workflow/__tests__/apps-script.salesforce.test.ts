import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Salesforce REAL_OPS', () => {
  it('builds action.salesforce:create_record', () => {
    expect(
      REAL_OPS['action.salesforce:create_record']({
        sobjectType: 'Account',
        fields: { Name: '{{account_name}}', Phone: '{{phone}}' },
      })
    ).toMatchSnapshot();
  });

  it('builds action.salesforce:update_record', () => {
    expect(
      REAL_OPS['action.salesforce:update_record']({
        sobjectType: 'Contact',
        recordId: '{{contact_id}}',
        fields: { Title: 'VP of Engineering', Email: '{{email}}' },
      })
    ).toMatchSnapshot();
  });

  it('builds action.salesforce:get_record', () => {
    expect(
      REAL_OPS['action.salesforce:get_record']({
        sobjectType: 'Lead',
        recordId: '{{lead_id}}',
        fields: ['Id', 'Status', 'Company'],
      })
    ).toMatchSnapshot();
  });

  it('builds action.salesforce:query_records', () => {
    expect(
      REAL_OPS['action.salesforce:query_records']({
        query: "SELECT Id, Name FROM Account WHERE Industry = 'Technology' LIMIT 5",
      })
    ).toMatchSnapshot();
  });

  it('builds action.salesforce:test_connection', () => {
    expect(REAL_OPS['action.salesforce:test_connection']({})).toMatchSnapshot();
  });

  it('builds action.salesforce:create_lead', () => {
    expect(
      REAL_OPS['action.salesforce:create_lead']({
        firstName: '{{first_name}}',
        lastName: '{{last_name}}',
        email: '{{email}}',
        company: 'Escalation Holding',
        status: 'Working - Contacted',
      })
    ).toMatchSnapshot();
  });
});

describe('Apps Script Salesforce integration', () => {
  it('creates a Salesforce lead via REST API', async () => {
    const result = await runSingleFixture('salesforce-create-lead', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.salesforceLeadId).toBe('00Qxx0000000001EAA');
    expect(result.context.salesforceLeadCreated).toBe(true);
    expect(result.context.leadId).toBe('00Qxx0000000001EAA');
    expect(result.context.salesforceLead).toEqual({ id: '00Qxx0000000001EAA' });
    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0].url).toBe(
      'https://example.my.salesforce.com/services/data/v58.0/sobjects/Lead/'
    );
  });

  it('surfaces Salesforce API validation errors', async () => {
    const result = await runSingleFixture('salesforce-create-record-error', fixturesDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Salesforce create_record failed for sObject Account');
    expect(result.error).toContain('REQUIRED_FIELD_MISSING');
    expect(result.error).toContain('fields Name');
  });
});
