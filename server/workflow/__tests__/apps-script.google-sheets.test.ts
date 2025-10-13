import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Google Sheets REAL_OPS', () => {
  it('builds trigger.sheets:onEdit', () => {
    expect(REAL_OPS['trigger.sheets:onEdit']({})).toMatchSnapshot();
  });

  it('builds action.sheets:getRow', () => {
    expect(REAL_OPS['action.sheets:getRow']({})).toMatchSnapshot();
  });

  it('builds action.sheets:append_row', () => {
    expect(REAL_OPS['action.sheets:append_row']({})).toMatchSnapshot();
  });
});

describe('Apps Script Google Sheets integration', () => {
  it('appends and reads rows via Google Sheets REST API', async () => {
    const result = await runSingleFixture('google-sheets-append-read', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.sheets.lastAppend).toEqual(
      expect.objectContaining({
        spreadsheetId: 'test-spreadsheet',
        sheet: 'Incidents',
        range: 'Incidents!A5:B5',
        updatedRows: 1,
        rowNumber: 5,
      })
    );
    expect(result.context.sheets.lastRead).toEqual(
      expect.objectContaining({
        spreadsheetId: 'test-spreadsheet',
        sheet: 'Incidents',
        range: 'Incidents!A5:B5',
        rowNumber: 5,
        values: ['INC-9000', 'Open'],
        record: {
          incidentId: 'INC-9000',
          status: 'Open',
        },
      })
    );
    expect(result.httpCalls).toHaveLength(2);
    expect(result.httpCalls[0].url).toContain('values/Incidents:append');
    expect(result.httpCalls[1].url).toContain('values/Incidents%21A5%3AB5');
  });
});
