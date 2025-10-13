import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const GOOGLE_ADMIN_OPERATIONS = [
  'action.google-admin:create_group',
  'action.google-admin:create_user',
  'action.google-admin:add_group_member',
  'action.google-admin:test_connection',
  'trigger.google-admin:user_created',
  'trigger.google-admin:user_suspended',
] as const;

describe('Apps Script Google Admin REAL_OPS', () => {
  for (const operation of GOOGLE_ADMIN_OPERATIONS) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder({})).toMatchSnapshot();
    });
  }
});
