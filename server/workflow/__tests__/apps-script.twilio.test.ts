import { describe, expect, it } from 'vitest';
import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Twilio REAL_OPS', () => {
  it('builds action.twilio:send_sms', () => {
    expect(REAL_OPS['action.twilio:send_sms']({})).toMatchSnapshot();
  });
});
