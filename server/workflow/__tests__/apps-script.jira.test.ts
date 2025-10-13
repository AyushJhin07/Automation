import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Jira REAL_OPS', () => {
  it('builds action.jira:create_issue', () => {
    const builder = REAL_OPS['action.jira:create_issue'];
    expect(builder).toBeDefined();
    expect(builder({
      projectKey: 'ENG',
      summary: 'Resolve incident {{incident_id}}',
      description: 'Automated follow-up created from the incident workflow.',
      issueType: 'Bug'
    })).toMatchSnapshot();
  });
});
