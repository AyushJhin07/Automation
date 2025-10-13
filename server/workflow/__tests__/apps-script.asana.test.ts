import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Asana REAL_OPS', () => {
  it('builds action.asana:create_task', () => {
    const builder = REAL_OPS['action.asana:create_task'];
    expect(builder).toBeDefined();
    expect(builder({
      name: 'Follow up with {{lead_name}}',
      notes: 'Schedule onboarding call once the deal closes.',
      projectId: '1200012345678901'
    })).toMatchSnapshot();
  });
});
