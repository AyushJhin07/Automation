import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Airtable REAL_OPS', () => {
  it('builds action.airtable:create_record', () => {
    const config = {
      baseId: '{{airtableBase}}',
      tableId: 'Contacts',
      fields: {
        Name: '{{fullName}}',
        Email: '{{email}}',
        Status: 'New'
      },
      typecast: true
    };

    expect(REAL_OPS['action.airtable:create_record'](config)).toMatchSnapshot();
  });

  it('builds action.airtable:list_records', () => {
    const config = {
      baseId: '{{airtableBase}}',
      tableId: 'Tasks',
      fields: ['Name', 'Status'],
      filterByFormula: "FIND('Critical', {Tags})",
      sort: [{ field: 'Status', direction: 'asc' }],
      maxRecords: 3,
      pageSize: 2,
      view: 'All tasks'
    };

    expect(REAL_OPS['action.airtable:list_records'](config)).toMatchSnapshot();
  });
});

describe('Apps Script Airtable integration', () => {
  it('creates a record via the Airtable REST API', async () => {
    const result = await runSingleFixture('airtable-create-record', fixturesDir);

    expect(result.success).toBe(true);
    expect(result.context.airtableRecordId).toBe('rec001');
    expect(result.context.airtableCreateRecordResponse).toMatchObject({
      status: 200,
      requestId: 'req-airtable-create-1'
    });
    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0].url).toBe('https://api.airtable.com/v0/appBase123/Contacts');
  });

  it('lists records with pagination and cursor persistence', async () => {
    const result = await runSingleFixture('airtable-list-records', fixturesDir);

    expect(result.success).toBe(true);
    expect(result.context.airtableListRecordsStats.processed).toBe(3);
    expect(result.context.airtableListRecordsMeta).toHaveLength(2);
    expect(result.context.airtableListCursor).toBeNull();
    expect(result.httpCalls.map(call => call.url)).toEqual([
      'https://api.airtable.com/v0/appBase123/Tasks?fields%5B%5D=Name&fields%5B%5D=Status&filterByFormula=FIND%28%27Critical%27%2C%20%7BTags%7D%29&pageSize=2&view=All%20tasks&sort%5B0%5D%5Bfield%5D=Status&sort%5B0%5D%5Bdirection%5D=asc',
      'https://api.airtable.com/v0/appBase123/Tasks?fields%5B%5D=Name&fields%5B%5D=Status&filterByFormula=FIND%28%27Critical%27%2C%20%7BTags%7D%29&pageSize=2&view=All%20tasks&sort%5B0%5D%5Bfield%5D=Status&sort%5B0%5D%5Bdirection%5D=asc&offset=itrNext'
    ]);
  });
});
