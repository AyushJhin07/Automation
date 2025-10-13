import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const ADYEN_OPERATIONS = [
  'action.adyen:test_connection',
  'action.adyen:create_payment',
  'action.adyen:capture_payment',
  'action.adyen:refund_payment',
  'trigger.adyen:payment_success',
] as const;

describe('Apps Script Adyen REAL_OPS', () => {
  for (const operation of ADYEN_OPERATIONS) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder({})).toMatchSnapshot();
    });
  }
});
