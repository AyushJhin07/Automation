import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const SQUARE_OPERATIONS = [
  'action.square:create_customer',
  'action.square:create_order',
  'action.square:create_payment',
  'trigger.square:payment_created',
] as const;

describe('Apps Script Square REAL_OPS', () => {
  for (const operation of SQUARE_OPERATIONS) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder({})).toMatchSnapshot();
    });
  }
});
