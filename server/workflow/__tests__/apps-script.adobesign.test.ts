import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const ADOBESIGN_OPERATIONS = [
  'action.adobesign:test_connection',
  'action.adobesign:create_agreement',
  'action.adobesign:send_agreement',
  'action.adobesign:get_agreement',
  'action.adobesign:cancel_agreement',
  'trigger.adobesign:agreement_workflow_completed',
  'trigger.adobesign:agreement_action_completed',
] as const;

describe('Apps Script Adobe Sign REAL_OPS', () => {
  for (const operation of ADOBESIGN_OPERATIONS) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder({})).toMatchSnapshot();
    });
  }
});
