import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Zendesk REAL_OPS', () => {
  it('builds create_ticket handler', () => {
    const builder = REAL_OPS['action.zendesk:create_ticket'];
    expect(builder({
      ticket: {
        subject: '{{ticket_subject}}',
        comment: {
          body: '{{ticket_body}}',
          html_body: '<p>{{ticket_body}}</p>',
          public: true
        },
        requester: {
          name: '{{requester_name}}',
          email: '{{requester_email}}'
        },
        priority: 'high',
        tags: ['support', 'urgent'],
        collaborator_ids: [123, '{{collaborator_id}}'],
        custom_fields: [
          { id: 42, value: '{{custom_value}}' }
        ]
      }
    })).toMatchSnapshot();
  });

  it('builds list_tickets handler', () => {
    const builder = REAL_OPS['action.zendesk:list_tickets'];
    expect(builder({
      sort_by: 'created_at',
      sort_order: 'desc',
      include: 'users,groups',
      'page[size]': 50,
      'page[after]': '{{next_cursor}}'
    })).toMatchSnapshot();
  });

  it('builds update_ticket handler', () => {
    const builder = REAL_OPS['action.zendesk:update_ticket'];
    expect(builder({
      id: 12345,
      ticket: {
        status: 'open',
        priority: 'urgent',
        tags: ['follow_up'],
        comment: {
          body: '{{update_body}}',
          public: false,
          author_id: '{{agent_id}}'
        },
        collaborator_ids: [12345, '{{collab}}'],
        safe_update: true
      }
    })).toMatchSnapshot();
  });
});
