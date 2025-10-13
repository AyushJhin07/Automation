import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Google Docs REAL_OPS', () => {
  it('builds action.google-docs:test_connection', () => {
    expect(REAL_OPS['action.google-docs:test_connection']({})).toMatchSnapshot();
  });

  it('builds action.google-docs:create_document', () => {
    expect(
      REAL_OPS['action.google-docs:create_document']({
        title: 'Quarterly Planning Doc',
        content: 'Agenda\n- Kickoff\n- Milestones',
      }),
    ).toMatchSnapshot();
  });

  it('builds action.google-docs:insert_text', () => {
    expect(
      REAL_OPS['action.google-docs:insert_text']({
        documentId: '{{latestDocId}}',
        text: 'Automation update',
        index: 128,
        segmentId: 'kix.tab123',
      }),
    ).toMatchSnapshot();
  });

  it('builds action.google-docs:update_text_style', () => {
    expect(
      REAL_OPS['action.google-docs:update_text_style']({
        documentId: '1A2B3C4D',
        range: {
          startIndex: 16,
          endIndex: 32,
        },
        textStyle: {
          bold: true,
          fontSize: { magnitude: 18, unit: 'PT' },
          foregroundColor: { red: 0.1, green: 0.2, blue: 0.5 },
        },
      }),
    ).toMatchSnapshot();
  });
});
