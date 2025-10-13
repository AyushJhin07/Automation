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
    expect(
      REAL_OPS['action.sheets:append_row']({
        values: ['{{email}}', '{{status}}'],
      }),
    ).toMatchSnapshot();
  });
});

describe('Apps Script Google Sheets integration', () => {
  it('appends and reads rows via the Sheets REST API', async () => {
    const result = await runSingleFixture('google-sheets-append-read', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.googleSheetsLastAppend).toBeDefined();
    expect(result.context.googleSheetsLastAppend?.rowNumber).toBe(5);
    expect(result.context.googleSheetsLastRead?.values).toEqual(['Tier 0', 'Success']);
    expect(result.httpCalls).toHaveLength(2);
    expect(result.httpCalls[0].url).toContain('/values/Automation%20Log:append');
    expect(result.httpCalls[1].url).toContain('/values/Automation%20Log!5%3A5');
  });
});
