import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Google Contacts REAL_OPS', () => {
  it('builds action.google-contacts:test_connection', () => {
    expect(REAL_OPS['action.google-contacts:test_connection']({})).toMatchSnapshot();
  });

  it('builds action.google-contacts:create_contact', () => {
    const builder = REAL_OPS['action.google-contacts:create_contact'];
    expect(builder({
      names: [{ givenName: 'Ada', familyName: 'Lovelace' }],
      emailAddresses: [{ value: 'ada@example.com', type: 'work' }],
      phoneNumbers: [{ value: '+1-555-0100', type: 'mobile' }],
      organizations: [{ name: 'Analytical Engines', title: 'Programmer' }],
      biographies: [{ value: 'First computer programmer' }]
    })).toMatchSnapshot();
  });

  it('builds action.google-contacts:get_contact', () => {
    const builder = REAL_OPS['action.google-contacts:get_contact'];
    expect(builder({ resourceName: 'people/c123', personFields: 'names,emailAddresses' })).toMatchSnapshot();
  });

  it('builds action.google-contacts:update_contact', () => {
    const builder = REAL_OPS['action.google-contacts:update_contact'];
    expect(builder({
      resourceName: 'people/c456',
      updatePersonFields: 'names,emailAddresses',
      names: [{ givenName: 'Grace', familyName: 'Hopper' }],
      emailAddresses: [{ value: 'grace@example.com' }]
    })).toMatchSnapshot();
  });

  it('builds action.google-contacts:delete_contact', () => {
    const builder = REAL_OPS['action.google-contacts:delete_contact'];
    expect(builder({ resourceName: 'people/c789' })).toMatchSnapshot();
  });

  it('builds action.google-contacts:list_contacts', () => {
    const builder = REAL_OPS['action.google-contacts:list_contacts'];
    expect(builder({
      personFields: 'names,emailAddresses,phoneNumbers',
      sortOrder: 'LAST_MODIFIED_DESCENDING',
      pageSize: 50
    })).toMatchSnapshot();
  });

  it('builds action.google-contacts:search_contacts', () => {
    const builder = REAL_OPS['action.google-contacts:search_contacts'];
    expect(builder({ query: 'Ada', readMask: 'names,emailAddresses', pageSize: 5 })).toMatchSnapshot();
  });

  it('builds action.google-contacts:create_contact_group', () => {
    const builder = REAL_OPS['action.google-contacts:create_contact_group'];
    expect(builder({ name: 'VIP', readGroupFields: 'name,memberCount' })).toMatchSnapshot();
  });

  it('builds action.google-contacts:list_contact_groups', () => {
    const builder = REAL_OPS['action.google-contacts:list_contact_groups'];
    expect(builder({ groupFields: 'name,memberCount', pageSize: 20 })).toMatchSnapshot();
  });

  it('builds trigger.google-contacts:contact_created', () => {
    const builder = REAL_OPS['trigger.google-contacts:contact_created'];
    expect(builder({})).toMatchSnapshot();
  });

  it('builds trigger.google-contacts:contact_updated', () => {
    const builder = REAL_OPS['trigger.google-contacts:contact_updated'];
    expect(builder({})).toMatchSnapshot();
  });
});
