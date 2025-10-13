import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Gmail REAL_OPS', () => {
  it('builds trigger.gmail:email_received', () => {
    expect(REAL_OPS['trigger.gmail:email_received']({})).toMatchSnapshot();
  });

  it('builds action.gmail:send_email', () => {
    expect(REAL_OPS['action.gmail:send_email']({})).toMatchSnapshot();
  });

  it('builds action.gmail:search_emails', () => {
    expect(REAL_OPS['action.gmail:search_emails']({})).toMatchSnapshot();
  });
});

describe('Apps Script Gmail integration', () => {
  it('sends email via Gmail REST API', async () => {
    const result = await runSingleFixture('gmail-send-email', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.gmailMessageId).toBe('msg-123');
    expect(result.context.gmailThreadId).toBe('thread-001');
    expect(result.context.gmailLabelIds).toEqual(['SENT']);
    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  });
});
