import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Workfront REAL_OPS', () => {
  it('builds action.workfront:test_connection', () => {
    const builder = REAL_OPS['action.workfront:test_connection'];
    expect(builder).toBeDefined();
    expect(builder({
      apiVersion: '16.0'
    })).toMatchSnapshot();
  });

  it('builds action.workfront:create_project', () => {
    const builder = REAL_OPS['action.workfront:create_project'];
    expect(builder).toBeDefined();
    expect(builder({
      apiVersion: 'v16.0',
      name: 'Launch {{project_name}} campaign',
      description: 'Coordinate kickoff for {{client_name}} redesign.',
      ownerID: '{{owner_id}}',
      sponsorID: '{{executive_sponsor_id}}',
      templateID: 'TPL12345',
      groupID: 'GRP-42',
      companyID: 'COMP-99',
      plannedStartDate: '2024-01-15',
      plannedCompletionDate: '2024-04-30',
      priority: 3,
      status: 'CUR',
      portfolioID: 'PORT-7',
      programID: 'PROG-3',
      budgetedCost: 125000,
      budgetedHours: 880
    })).toMatchSnapshot();
  });

  it('builds action.workfront:get_project', () => {
    const builder = REAL_OPS['action.workfront:get_project'];
    expect(builder).toBeDefined();
    expect(builder({
      projectID: '{{workfront_project_id}}',
      fields: ['ID', 'name', 'ownerID', 'plannedStartDate', 'status']
    })).toMatchSnapshot();
  });

  it('builds action.workfront:update_project', () => {
    const builder = REAL_OPS['action.workfront:update_project'];
    expect(builder).toBeDefined();
    expect(builder({
      projectID: '{{workfront_project_id}}',
      name: 'Updated {{project_name}} rollout',
      description: 'Refresh scope after executive review.',
      ownerID: '{{new_owner_id}}',
      sponsorID: '{{executive_sponsor_id}}',
      plannedStartDate: '2024-01-22',
      plannedCompletionDate: '2024-05-10',
      actualStartDate: '2024-01-18',
      actualCompletionDate: '2024-05-08',
      percentComplete: 75,
      priority: 2,
      status: 'CUR',
      portfolioID: 'PORT-7',
      programID: 'PROG-3',
      budgetedCost: 135000,
      budgetedHours: 940
    })).toMatchSnapshot();
  });

  it('builds action.workfront:search_projects', () => {
    const builder = REAL_OPS['action.workfront:search_projects'];
    expect(builder).toBeDefined();
    expect(builder({
      limit: 50,
      offset: 25,
      name: 'Marketing',
      ownerID: '{{owner_id}}',
      status: ['CUR', 'PLN'],
      groupID: 'GRP-42',
      portfolioID: 'PORT-7',
      fields: ['ID', 'name', 'status', 'plannedCompletionDate']
    })).toMatchSnapshot();
  });

  it('builds action.workfront:create_task', () => {
    const builder = REAL_OPS['action.workfront:create_task'];
    expect(builder).toBeDefined();
    expect(builder({
      name: 'Draft {{asset_name}} brief',
      projectID: '{{workfront_project_id}}',
      description: 'Outline deliverables and review owners.',
      assignedToID: '{{assignee_id}}',
      parentID: '{{parent_task_id}}',
      plannedStartDate: '2024-02-05',
      plannedCompletionDate: '2024-02-16',
      plannedHours: 32,
      priority: 2,
      status: 'INP',
      percentComplete: 15,
      predecessors: ['TASK123', 'TASK456']
    })).toMatchSnapshot();
  });

  it('builds action.workfront:get_task', () => {
    const builder = REAL_OPS['action.workfront:get_task'];
    expect(builder).toBeDefined();
    expect(builder({
      taskID: '{{workfront_task_id}}',
      fields: ['ID', 'name', 'assignedToID', 'plannedCompletionDate']
    })).toMatchSnapshot();
  });

  it('builds action.workfront:update_task', () => {
    const builder = REAL_OPS['action.workfront:update_task'];
    expect(builder).toBeDefined();
    expect(builder({
      taskID: '{{workfront_task_id}}',
      name: 'Finalize {{asset_name}} brief',
      description: 'Incorporate stakeholder feedback.',
      assignedToID: '{{assignee_id}}',
      status: 'CPL',
      priority: 3,
      percentComplete: 100,
      plannedStartDate: '2024-02-05',
      plannedCompletionDate: '2024-02-16',
      actualStartDate: '2024-02-06',
      actualCompletionDate: '2024-02-15'
    })).toMatchSnapshot();
  });

  it('builds action.workfront:create_issue', () => {
    const builder = REAL_OPS['action.workfront:create_issue'];
    expect(builder).toBeDefined();
    expect(builder({
      name: 'Bug report for {{feature_name}}',
      projectID: '{{workfront_project_id}}',
      description: 'Customer reported sync failures on {{date}}.',
      assignedToID: '{{assignee_id}}',
      submittedByID: '{{reporter_id}}',
      priority: 2,
      severity: 3,
      status: 'INP',
      resolutionType: 'FIX',
      plannedCompletionDate: '2024-03-01'
    })).toMatchSnapshot();
  });

  it('builds action.workfront:create_timesheet', () => {
    const builder = REAL_OPS['action.workfront:create_timesheet'];
    expect(builder).toBeDefined();
    expect(builder({
      userID: '{{user_id}}',
      startDate: '2024-02-12',
      endDate: '2024-02-18',
      approverID: '{{approver_id}}',
      timesheetProfileID: 'PROFILE-9'
    })).toMatchSnapshot();
  });

  it('builds action.workfront:log_time', () => {
    const builder = REAL_OPS['action.workfront:log_time'];
    expect(builder).toBeDefined();
    expect(builder({
      hours: 6.5,
      entryDate: '2024-02-14',
      taskID: '{{workfront_task_id}}',
      projectID: '{{workfront_project_id}}',
      description: 'Deep dive on {{feature_name}} requirements.',
      hourTypeID: 'HOUR-TYPE-1'
    })).toMatchSnapshot();
  });

  it('builds action.workfront:get_users', () => {
    const builder = REAL_OPS['action.workfront:get_users'];
    expect(builder).toBeDefined();
    expect(builder({
      limit: 75,
      isActive: true,
      groupID: 'GRP-42',
      roleID: 'ROLE-7',
      fields: ['ID', 'name', 'emailAddr']
    })).toMatchSnapshot();
  });

  it('builds action.workfront:create_document', () => {
    const builder = REAL_OPS['action.workfront:create_document'];
    expect(builder).toBeDefined();
    expect(builder({
      name: 'Upload {{asset_name}} mockups',
      docObjCode: 'TASK',
      objID: '{{workfront_task_id}}',
      description: 'First draft assets for review.',
      currentVersion: {
        versionNumber: 1,
        description: 'Initial upload',
        extRefID: '{{file_reference_id}}'
      }
    })).toMatchSnapshot();
  });

  it('builds trigger.workfront:project_created', () => {
    const builder = REAL_OPS['trigger.workfront:project_created'];
    expect(builder).toBeDefined();
    expect(builder({
      apiVersion: 'v16.0',
      groupID: '{{group_id}}',
      portfolioID: '{{portfolio_id}}'
    })).toMatchSnapshot();
  });

  it('builds trigger.workfront:task_created', () => {
    const builder = REAL_OPS['trigger.workfront:task_created'];
    expect(builder).toBeDefined();
    expect(builder({
      projectID: '{{workfront_project_id}}',
      assignedToID: '{{assignee_id}}'
    })).toMatchSnapshot();
  });

  it('builds trigger.workfront:task_completed', () => {
    const builder = REAL_OPS['trigger.workfront:task_completed'];
    expect(builder).toBeDefined();
    expect(builder({
      projectID: '{{workfront_project_id}}',
      assignedToID: '{{assignee_id}}'
    })).toMatchSnapshot();
  });
});

