import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Gmail Enhanced REAL_OPS', () => {
  it('builds action.gmail-enhanced:test_connection', () => {
    const builder = REAL_OPS['action.gmail-enhanced:test_connection'];
    expect(builder).toBeDefined();
    const script = builder({ userId: 'me' });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:send_email', () => {
    const builder = REAL_OPS['action.gmail-enhanced:send_email'];
    expect(builder).toBeDefined();
    const script = builder({
      userId: 'me',
      to: ['alerts@example.com', 'ops@example.com'],
      cc: ['finance@example.com'],
      bcc: ['audit@example.com'],
      subject: 'Incident Report',
      body: 'Summary of the incident and remediation steps.',
      replyTo: 'noreply@example.com',
      isHtml: true,
      attachments: [
        { filename: 'report.pdf', data: 'UEsDBBQABgAIAAAAIQ==', mimeType: 'application/pdf' }
      ]
    });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:get_message', () => {
    const builder = REAL_OPS['action.gmail-enhanced:get_message'];
    expect(builder).toBeDefined();
    const script = builder({
      userId: 'me',
      id: 'abc123',
      format: 'full',
      metadataHeaders: ['From', 'Subject']
    });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:list_messages', () => {
    const builder = REAL_OPS['action.gmail-enhanced:list_messages'];
    expect(builder).toBeDefined();
    const script = builder({
      userId: 'me',
      q: 'label:inbox',
      labelIds: ['INBOX'],
      includeSpamTrash: false,
      maxResults: 50,
      pageToken: 'token-1'
    });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:modify_message', () => {
    const builder = REAL_OPS['action.gmail-enhanced:modify_message'];
    expect(builder).toBeDefined();
    const script = builder({
      userId: 'me',
      id: 'message-42',
      addLabelIds: ['STARRED'],
      removeLabelIds: ['UNREAD']
    });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:delete_message', () => {
    const builder = REAL_OPS['action.gmail-enhanced:delete_message'];
    expect(builder).toBeDefined();
    const script = builder({ userId: 'me', id: 'message-99' });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:create_draft', () => {
    const builder = REAL_OPS['action.gmail-enhanced:create_draft'];
    expect(builder).toBeDefined();
    const script = builder({
      userId: 'me',
      to: ['product@example.com'],
      subject: 'Product Launch Prep',
      body: '<p>Drafting launch checklist.</p>',
      isHtml: true
    });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:list_labels', () => {
    const builder = REAL_OPS['action.gmail-enhanced:list_labels'];
    expect(builder).toBeDefined();
    const script = builder({ userId: 'me' });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:create_label', () => {
    const builder = REAL_OPS['action.gmail-enhanced:create_label'];
    expect(builder).toBeDefined();
    const script = builder({
      userId: 'me',
      name: 'Projects/Automation',
      messageListVisibility: 'show',
      labelListVisibility: 'labelShowIfUnread',
      type: 'user',
      color: {
        textColor: '#000000',
        backgroundColor: '#33ff33'
      }
    });
    expect(script).toMatchSnapshot();
  });

  it('builds action.gmail-enhanced:search_messages', () => {
    const builder = REAL_OPS['action.gmail-enhanced:search_messages'];
    expect(builder).toBeDefined();
    const script = builder({
      userId: 'me',
      query: 'status update',
      from: 'alerts@example.com',
      to: 'ops@example.com',
      subject: 'Alert',
      hasAttachment: true,
      isUnread: true,
      dateAfter: '2024/01/01',
      dateBefore: '2024/02/01',
      maxResults: 25
    });
    expect(script).toMatchSnapshot();
  });
});

describe('Apps Script Gmail Enhanced triggers', () => {
  it('builds trigger.gmail-enhanced:new_email', () => {
    const builder = REAL_OPS['trigger.gmail-enhanced:new_email'];
    expect(builder).toBeDefined();
    const script = builder({
      labelIds: ['INBOX', 'IMPORTANT'],
      query: 'from:alerts@example.com'
    });
    expect(script).toMatchSnapshot();
  });

  it('builds trigger.gmail-enhanced:email_starred', () => {
    const builder = REAL_OPS['trigger.gmail-enhanced:email_starred'];
    expect(builder).toBeDefined();
    const script = builder({});
    expect(script).toMatchSnapshot();
  });
});
