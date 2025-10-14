import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Gmail REAL_OPS', () => {
  it('builds trigger.gmail:new_email_received', () => {
    expect(REAL_OPS['trigger.gmail:new_email_received']({ query: 'is:unread', labelIds: ['INBOX'] })).toMatchSnapshot();
  });

  it('builds trigger.gmail:email_received_from', () => {
    expect(REAL_OPS['trigger.gmail:email_received_from']({ fromEmail: 'alerts@example.com', subject: 'Status' })).toMatchSnapshot();
  });

  it('builds trigger.gmail:email_with_attachment', () => {
    expect(REAL_OPS['trigger.gmail:email_with_attachment']({ fileTypes: ['pdf'], fromEmail: 'finance@example.com' })).toMatchSnapshot();
  });

  it('builds action.gmail:test_connection', () => {
    expect(REAL_OPS['action.gmail:test_connection']({})).toMatchSnapshot();
  });

  it('builds action.gmail:get_email', () => {
    expect(REAL_OPS['action.gmail:get_email']({ messageId: 'abc123', format: 'full' })).toMatchSnapshot();
  });

  it('builds action.gmail:send_email', () => {
    expect(REAL_OPS['action.gmail:send_email']({ to: 'user@example.com', subject: 'Hello', body: 'Hi there' })).toMatchSnapshot();
  });

  it('builds action.gmail:search_emails', () => {
    expect(REAL_OPS['action.gmail:search_emails']({ query: 'label:inbox', includeSpamTrash: false })).toMatchSnapshot();
  });

  it('builds action.gmail:mark_as_read', () => {
    expect(REAL_OPS['action.gmail:mark_as_read']({ messageIds: ['id-1', 'id-2'] })).toMatchSnapshot();
  });

  it('builds action.gmail:add_label', () => {
    expect(REAL_OPS['action.gmail:add_label']({ messageIds: ['id-9'], labelIds: ['IMPORTANT'] })).toMatchSnapshot();
  });

  it('builds action.gmail:send_reply', () => {
    expect(REAL_OPS['action.gmail:send_reply']({ messageId: 'abc123', body: 'Thanks!', replyAll: true })).toMatchSnapshot();
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
 
  it('tests Gmail connection profile', async () => {
    const result = await runSingleFixture('gmail-test-connection', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.gmailEmailAddress).toBe('user@example.com');
    expect(result.httpCalls[0].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  });

  it('searches Gmail messages', async () => {
    const result = await runSingleFixture('gmail-search-emails', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.gmailMessages).toHaveLength(2);
    expect(result.context.gmailNextPageToken).toBe('next-token');
  });

  it('retrieves a Gmail message', async () => {
    const result = await runSingleFixture('gmail-get-email', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.gmailMessageId).toBe('msg-42');
    expect(result.context.gmailAttachments).toHaveLength(1);
  });

  it('sends a Gmail reply', async () => {
    const result = await runSingleFixture('gmail-send-reply', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.gmailReplyRecipients).toEqual(['sender@example.com']);
    expect(result.httpCalls).toHaveLength(2);
    expect(result.httpCalls[1].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  });

  it('marks Gmail messages as read', async () => {
    const result = await runSingleFixture('gmail-mark-as-read', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.httpCalls[0].payload).toMatchObject({ removeLabelIds: ['UNREAD'] });
  });

  it('adds labels to Gmail messages', async () => {
    const result = await runSingleFixture('gmail-add-label', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.httpCalls[0].payload).toMatchObject({ addLabelIds: ['Label_123'] });
  });
});
