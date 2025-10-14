import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

function stripHelpers(code: string): string {
  return code.replace(/\nif \(typeof googleSheetsEnhancedParseSpreadsheetId !== 'function'\)[\s\S]*$/, '\n/* googleSheetsEnhancedHelpersBlock omitted in snapshot */');
}

describe('Apps Script Google Sheets Enhanced REAL_OPS', () => {
  it('builds action.google-sheets-enhanced:test_connection', () => {
    expect(
      stripHelpers(
        REAL_OPS['action.google-sheets-enhanced:test_connection']({
          spreadsheetId: 'sheet-123'
        })
      )
    ).toMatchSnapshot();
  });

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

  it('builds action.google-sheets-enhanced:format_cells', () => {
    expect(
      stripHelpers(
        REAL_OPS['action.google-sheets-enhanced:format_cells']({
          spreadsheetId: 'sheet-123',
          range: 'Automation Log!A1:D1',
          format: {
            backgroundColor: { red: 0.1, green: 0.5, blue: 0.9 },
            textFormat: { bold: true }
          }
        })
      )
    ).toMatchSnapshot();
  });

  it('builds trigger.google-sheets-enhanced:row_added', () => {
    expect(
      stripHelpers(
        REAL_OPS['trigger.google-sheets-enhanced:row_added']({
          spreadsheetId: 'sheet-123',
          sheetName: 'Automation Log'
        })
      )
    ).toMatchSnapshot();
  });

  it('builds trigger.google-sheets-enhanced:cell_updated', () => {
    expect(
      stripHelpers(
        REAL_OPS['trigger.google-sheets-enhanced:cell_updated']({
          spreadsheetId: 'sheet-123',
          sheetName: 'Automation Log'
        })
      )
    ).toMatchSnapshot();
  });
});

describe('Apps Script Google Sheets Enhanced integration', () => {
  it('appends and reads rows via the Sheets REST API', async () => {
    const result = await runSingleFixture('google-sheets-enhanced-append-read', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.googleSheetsEnhancedAppendRow).toBeDefined();
    expect(result.context.googleSheetsEnhancedAppendRow?.rowNumber).toBe(5);
    expect(result.context.googleSheetsEnhancedGetValues?.values).toEqual([
      ['Tier 0', 'Success']
    ]);
    expect(result.httpCalls).toHaveLength(2);
    expect(result.httpCalls[0].url).toContain('/values/Automation%20Log:append');
    expect(result.httpCalls[1].url).toContain('/values/Automation%20Log!5%3A5');
  });
});
