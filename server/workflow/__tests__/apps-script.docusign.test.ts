import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const DOCUSIGN_OPERATIONS = [
  'action.docusign:create_envelope',
  'action.docusign:list_envelopes',
  'action.docusign:send_envelope',
  'trigger.docusign:envelope_completed',
] as const;

describe('Apps Script DocuSign REAL_OPS', () => {
  for (const operation of DOCUSIGN_OPERATIONS) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder({})).toMatchSnapshot();
    });
  }
});
