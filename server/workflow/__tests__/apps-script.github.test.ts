import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const GITHUB_OPERATIONS = [
  'action.github:add_labels_to_issue',
  'action.github:close_issue',
  'action.github:create_comment',
  'action.github:create_issue',
  'action.github:create_pull_request',
  'action.github:create_webhook',
  'action.github:get_issue',
  'action.github:get_repository',
  'action.github:list_issues',
  'action.github:list_pull_requests',
  'action.github:list_repositories',
  'action.github:merge_pull_request',
  'action.github:test_connection',
  'action.github:update_issue',
  'action.github:update_pull_request',
  'trigger.github:issue_closed',
  'trigger.github:issue_opened',
  'trigger.github:pull_request_merged',
  'trigger.github:pull_request_opened',
  'trigger.github:push',
] as const;

describe('Apps Script GitHub REAL_OPS', () => {
  for (const operation of GITHUB_OPERATIONS) {
    it(`builds ${operation}`, () => {
      expect(REAL_OPS[operation]({})).toMatchSnapshot();
    });
  }
});
