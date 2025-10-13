import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Trello REAL_OPS', () => {
  it('builds action.trello:create_card', () => {
    const builder = REAL_OPS['action.trello:create_card'];
    expect(builder).toBeDefined();
    expect(builder({
      name: 'Prep launch assets for {{product_name}}',
      description: 'Include legal review and creative sign-off before publishing.',
      listId: '5d5ea62b8b5aba1234567890'
    })).toMatchSnapshot();
  });
});
