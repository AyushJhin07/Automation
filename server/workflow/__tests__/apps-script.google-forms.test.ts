import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const operations = [
  'action.google-forms:test_connection',
  'action.google-forms:create_form',
  'action.google-forms:get_form',
  'action.google-forms:batch_update',
  'action.google-forms:add_question',
  'action.google-forms:update_form_info',
  'action.google-forms:delete_item',
  'action.google-forms:list_responses',
  'action.google-forms:get_response',
  'action.google-forms:update_settings',
  'trigger.google-forms:form_response',
  'trigger.google-forms:form_created'
] as const;

describe('Apps Script Google Forms REAL_OPS', () => {
  for (const key of operations) {
    it(`builds ${key}`, () => {
      expect(REAL_OPS[key]({})).toMatchSnapshot();
    });
  }
});
