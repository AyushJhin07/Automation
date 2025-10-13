import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const ADP_OPERATIONS = [
  'action.adp:test_connection',
  'action.adp:get_worker',
  'action.adp:create_worker',
  'action.adp:update_worker',
  'trigger.adp:worker_hired',
] as const;

describe('Apps Script ADP REAL_OPS', () => {
  for (const operation of ADP_OPERATIONS) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder({})).toMatchSnapshot();
    });
  }
});
