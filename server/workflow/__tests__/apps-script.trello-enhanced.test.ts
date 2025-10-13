import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Trello Enhanced REAL_OPS', () => {
  it('builds action.trello-enhanced:create_board', () => {
    const config = {
      name: 'Growth Launchpad',
      desc: 'Program board for the {{fiscal_quarter}} expansion roadmap.',
      idOrganization: '{{org_id}}',
      prefs_permissionLevel: 'org',
      prefs_voting: 'members',
      prefs_comments: 'observers',
      prefs_background: 'blue',
    };

    expect(REAL_OPS['action.trello-enhanced:create_board'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:create_card with advanced fields', () => {
    const config = {
      idList: '{{list_id}}',
      name: 'Draft launch announcement',
      desc: 'Coordinate copy review and legal approval.',
      pos: 'bottom',
      due: '{{due_at}}',
      dueComplete: false,
      idMembers: ['{{comms_owner}}', '6430a62bca1efc1a9b456700'],
      idLabels: 'launch,{{priority_label}}',
      idChecklists: ['{{qa_checklist}}'],
      address: '135 Townsend St, San Francisco, CA 94107',
      locationName: 'Headquarters',
      coordinates: '37.781,-122.396',
    };

    expect(REAL_OPS['action.trello-enhanced:create_card'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:create_checklist', () => {
    const config = {
      idCard: '{{card_id}}',
      name: 'Launch prerequisites',
      pos: 'top',
    };

    expect(REAL_OPS['action.trello-enhanced:create_checklist'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:add_checklist_item', () => {
    const config = {
      idChecklist: '{{checklist_id}}',
      name: 'Confirm translations approved',
      pos: 'bottom',
      checked: true,
    };

    expect(REAL_OPS['action.trello-enhanced:add_checklist_item'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:add_attachment from base64 payload', () => {
    const config = {
      id: '{{card_id}}',
      name: 'Final creative brief.pdf',
      file: '{{file_base64}}',
      mimeType: 'application/pdf',
      setCover: true,
    };

    expect(REAL_OPS['action.trello-enhanced:add_attachment'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:create_label', () => {
    const config = {
      idBoard: '{{board_id}}',
      name: 'High Priority',
      color: 'red',
    };

    expect(REAL_OPS['action.trello-enhanced:create_label'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:search_cards', () => {
    const config = {
      query: 'label:"High Priority" due:{{due_window}}',
      idBoards: '{{board_id}}',
      modelTypes: 'cards',
      card_fields: 'name,due,dueComplete,idMembers',
      cards_limit: 50,
      card_board: true,
      card_list: true,
      card_members: true,
      card_attachments: 'cover',
      board_fields: 'name,url',
      boards_limit: 1,
      partial: false,
    };

    expect(REAL_OPS['action.trello-enhanced:search_cards'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:create_webhook', () => {
    const config = {
      idModel: '{{board_id}}',
      callbackURL: 'https://hooks.example.com/trello/{{environment}}',
      description: 'Launch automation webhook',
      active: true,
    };

    expect(REAL_OPS['action.trello-enhanced:create_webhook'](config)).toMatchSnapshot();
  });

  it('builds action.trello-enhanced:test_connection', () => {
    expect(REAL_OPS['action.trello-enhanced:test_connection']({})).toMatchSnapshot();
  });

  it('builds trigger.trello-enhanced:card_created handler', () => {
    const config = {
      idBoard: '{{board_id}}',
    };

    expect(REAL_OPS['trigger.trello-enhanced:card_created'](config)).toMatchSnapshot();
  });

  it('builds trigger.trello-enhanced:card_moved handler', () => {
    const config = {
      idBoard: 'bQ9H42',
    };

    expect(REAL_OPS['trigger.trello-enhanced:card_moved'](config)).toMatchSnapshot();
  });

  it('builds trigger.trello-enhanced:checklist_item_completed handler', () => {
    expect(REAL_OPS['trigger.trello-enhanced:checklist_item_completed']({})).toMatchSnapshot();
  });
});
