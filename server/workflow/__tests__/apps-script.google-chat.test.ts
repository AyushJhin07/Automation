import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Google Chat REAL_OPS', () => {
  const cases: Array<[string, Record<string, any>]> = [
    ['action.google-chat:test_connection', {}],
    [
      'action.google-chat:send_message',
      {
        space: 'spaces/AAA',
        text: 'Hello from {{user.name}}',
        thread: { name: 'spaces/AAA/threads/BBB' },
        cards: [{ header: { title: 'Example' } }],
        cardsV2: [{ cardId: 'card-1', card: { sections: [] } }],
        actionResponse: { type: 'NEW_MESSAGE', url: 'https://example.com' }
      }
    ],
    [
      'action.google-chat:create_space',
      {
        displayName: 'Launch Announcements',
        spaceType: 'SPACE',
        threaded: true,
        externalUserAllowed: false,
        spaceHistoryState: 'HISTORY_ON'
      }
    ],
    [
      'action.google-chat:list_spaces',
      {
        pageSize: 25,
        pageToken: 'token-123',
        filter: 'spaceType = "SPACE"'
      }
    ],
    ['action.google-chat:get_space', { name: 'spaces/AAA' }],
    [
      'action.google-chat:list_members',
      {
        parent: 'spaces/AAA',
        pageSize: 50,
        pageToken: 'page-2',
        filter: 'member.type = "HUMAN"',
        showGroups: true
      }
    ],
    [
      'action.google-chat:create_membership',
      {
        parent: 'spaces/AAA',
        member: { name: 'users/123', type: 'HUMAN' },
        role: 'ROLE_MEMBER'
      }
    ],
    [
      'action.google-chat:list_messages',
      {
        parent: 'spaces/AAA',
        pageSize: 20,
        pageToken: 'next-token',
        filter: 'thread.name = "spaces/AAA/threads/BBB"',
        orderBy: 'createTime desc'
      }
    ],
    ['action.google-chat:get_message', { name: 'spaces/AAA/messages/MSG123' }],
    [
      'action.google-chat:update_message',
      {
        name: 'spaces/AAA/messages/MSG123',
        text: 'Updated message {{payload.update}}',
        cards: [{ sections: [{ widgets: [] }] }],
        cardsV2: [{ cardId: 'card-2', card: { sections: [] } }],
        updateMask: 'text,cards,cardsV2'
      }
    ],
    ['action.google-chat:delete_message', { name: 'spaces/AAA/messages/MSG123', force: true }],
    ['trigger.google-chat:message_created', { space: 'spaces/AAA' }],
    ['trigger.google-chat:space_created', {}],
    ['trigger.google-chat:membership_created', { space: 'spaces/AAA' }]
  ];

  for (const [operation, config] of cases) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder(config)).toMatchSnapshot();
    });
  }
});
