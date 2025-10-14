import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

const stripHelpers = (code: string): string => {
  const helperIndex = code.indexOf("if (typeof googleSheetsEnhancedGetAccessToken !== 'function') {");
  return helperIndex === -1 ? code : code.slice(0, helperIndex).trimEnd();
};

describe('Apps Script Google Sheets Enhanced REAL_OPS', () => {
  it('builds action.google-sheets-enhanced:append_row', () => {
    expect(
      stripHelpers(
        REAL_OPS['action.google-sheets-enhanced:append_row']({
          spreadsheetId: 'sheet-123',
          sheet: 'Automation Log',
          values: ['{{stage}}', '{{result}}']
        })
      )
    ).toMatchSnapshot();
  });

  it('builds action.google-sheets-enhanced:get_values', () => {
    expect(
      stripHelpers(
        REAL_OPS['action.google-sheets-enhanced:get_values']({
          spreadsheetId: 'sheet-123',
          range: 'Automation Log!A1:B5'
        })
      )
    ).toMatchSnapshot();
  });

  it('builds action.google-sheets-enhanced:update_range', () => {
    expect(
      stripHelpers(
        REAL_OPS['action.google-sheets-enhanced:update_range']({
          spreadsheetId: 'sheet-123',
          range: 'Automation Log!A2:B3',
          values: [
            ['{{stage}}', '{{result}}'],
            ['Next', 'Pending']
          ]
        })
      )
    ).toMatchSnapshot();
  });

  it('builds action.google-sheets-enhanced:find_replace', () => {
    expect(
      stripHelpers(
        REAL_OPS['action.google-sheets-enhanced:find_replace']({
          spreadsheetId: 'sheet-123',
          find: 'Old',
          replacement: 'New',
          sheetId: 42
        })
      )
    ).toMatchSnapshot();
  });

  it('builds trigger.google-sheets-enhanced:row_added', () => {
    expect(stripHelpers(REAL_OPS['trigger.google-sheets-enhanced:row_added']({ spreadsheetId: 'sheet-123' }))).toMatchSnapshot();
  });

  it('builds trigger.google-sheets-enhanced:cell_updated', () => {
    expect(
      stripHelpers(
        REAL_OPS['trigger.google-sheets-enhanced:cell_updated']({
          spreadsheetId: 'sheet-123',
          range: 'Summary!A1:C10'
        })
      )
    ).toMatchSnapshot();
  });
});

describe('Apps Script Google Sheets Enhanced integration', () => {
  it('appends and reads rows via the Sheets Enhanced REST API', async () => {
    const result = await runSingleFixture('google-sheets-enhanced-append-read', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context?.googleSheetsEnhancedLastAppend?.rowNumber).toBe(5);
    expect(result.context?.googleSheetsEnhancedLastRead?.values).toEqual([
      ['Tier 0', 'Success']
    ]);
    expect(result.httpCalls).toHaveLength(2);
    expect(result.httpCalls[0].url).toContain('/values/Automation%20Log:append');
    expect(result.httpCalls[1].url).toContain('/values/Automation%20Log!5%3A5');
  });
});
