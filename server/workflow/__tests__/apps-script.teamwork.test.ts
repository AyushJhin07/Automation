import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Teamwork REAL_OPS', () => {
  it('builds action.teamwork:create_project', () => {
    const builder = REAL_OPS['action.teamwork:create_project'];
    expect(builder).toBeDefined();
    expect(builder({
      name: 'Launch {{product_name}} initiative',
      description: 'Coordinate go-to-market tasks for {{product_name}}.',
      company_id: '{{company_id}}',
      category_id: '42',
      start_date: '2024-01-08',
      end_date: '2024-03-29',
      budget: 125000,
      status: 'active',
      privacy: 'open',
      tags: 'launch,priority'
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:update_project', () => {
    const builder = REAL_OPS['action.teamwork:update_project'];
    expect(builder).toBeDefined();
    expect(builder({
      project_id: '{{teamwork_project_id}}',
      name: 'Updated {{project_name}} plan',
      status: 'active',
      privacy: 'private',
      tags: 'updated,review'
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:get_project', () => {
    const builder = REAL_OPS['action.teamwork:get_project'];
    expect(builder).toBeDefined();
    expect(builder({
      project_id: '{{teamwork_project_id}}'
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:list_projects', () => {
    const builder = REAL_OPS['action.teamwork:list_projects'];
    expect(builder).toBeDefined();
    expect(builder({
      status: 'active',
      company_id: '1234',
      category_id: '42',
      created_after: '2024-01-01',
      created_before: '2024-03-31',
      updated_after: '2024-02-01',
      updated_before: '2024-02-28',
      page: 2,
      page_size: 50
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:create_task', () => {
    const builder = REAL_OPS['action.teamwork:create_task'];
    expect(builder).toBeDefined();
    expect(builder({
      project_id: '{{teamwork_project_id}}',
      content: 'Draft kickoff brief for {{product_name}}',
      description: 'Outline goals, deliverables, and owners before the kickoff.',
      responsible_party_id: '{{owner_id}}',
      task_list_id: '8765',
      priority: 'high',
      due_date: '2024-02-05',
      start_date: '2024-01-15',
      estimated_minutes: 240,
      tags: 'kickoff,brief',
      private: false
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:update_task', () => {
    const builder = REAL_OPS['action.teamwork:update_task'];
    expect(builder).toBeDefined();
    expect(builder({
      task_id: '{{teamwork_task_id}}',
      content: 'Finalize kickoff brief',
      priority: 'medium',
      completed: true,
      tags: 'kickoff,brief,done'
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:get_task', () => {
    const builder = REAL_OPS['action.teamwork:get_task'];
    expect(builder).toBeDefined();
    expect(builder({
      task_id: '{{teamwork_task_id}}'
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:list_tasks', () => {
    const builder = REAL_OPS['action.teamwork:list_tasks'];
    expect(builder).toBeDefined();
    expect(builder({
      project_id: '{{teamwork_project_id}}',
      task_list_id: '8765',
      responsible_party_id: '{{owner_id}}',
      tag: 'kickoff',
      completed: false,
      updated_after: '2024-01-01',
      updated_before: '2024-02-01',
      page: 3,
      page_size: 100
    })).toMatchSnapshot();
  });

  it('builds action.teamwork:create_time_entry', () => {
    const builder = REAL_OPS['action.teamwork:create_time_entry'];
    expect(builder).toBeDefined();
    expect(builder({
      project_id: '{{teamwork_project_id}}',
      task_id: '{{teamwork_task_id}}',
      person_id: '{{teamwork_user_id}}',
      description: 'Planning session for {{product_name}} launch',
      hours: 2,
      minutes: 30,
      date: '2024-01-22',
      time: '09:30',
      is_billable: true,
      tags: 'planning,launch'
    })).toMatchSnapshot();
  });
});
