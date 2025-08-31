/**
 * P2-1: Advanced Workflow Templates & Industry-Specific Presets
 * 
 * Professional workflow templates that showcase our 149 working apps
 * and provide enterprise customers with ready-to-use automation solutions.
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'sales' | 'marketing' | 'hr' | 'finance' | 'operations' | 'customer-service' | 'devops';
  industry: string[];
  complexity: 'beginner' | 'intermediate' | 'advanced' | 'enterprise';
  estimatedSetupTime: string;
  requiredApps: string[];
  optionalApps: string[];
  businessValue: string;
  roi: string;
  graph: {
    nodes: any[];
    edges: any[];
    metadata: any;
  };
  configurationSteps: Array<{
    step: number;
    title: string;
    description: string;
    app: string;
    action: string;
  }>;
  tags: string[];
}

// SALES & CRM TEMPLATES
export const SALES_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'lead-to-customer-pipeline',
    name: 'Complete Lead-to-Customer Pipeline',
    description: 'Automated lead qualification, nurturing, and conversion process using CRM, marketing automation, and communication tools.',
    category: 'sales',
    industry: ['technology', 'saas', 'consulting', 'real-estate'],
    complexity: 'advanced',
    estimatedSetupTime: '2-3 hours',
    requiredApps: ['salesforce', 'hubspot', 'mailchimp', 'slack', 'google-sheets'],
    optionalApps: ['calendly', 'docusign', 'stripe'],
    businessValue: 'Increase lead conversion by 40% and reduce manual follow-up time by 80%',
    roi: '$50,000+ annual savings for mid-size sales teams',
    graph: {
      nodes: [
        {
          id: 'lead_capture',
          type: 'trigger.salesforce',
          position: { x: 100, y: 100 },
          data: {
            label: 'New Lead Captured',
            app: 'salesforce',
            operation: 'lead_created',
            config: { leadSource: 'website', qualificationRequired: true }
          }
        },
        {
          id: 'lead_scoring',
          type: 'action.hubspot',
          position: { x: 300, y: 100 },
          data: {
            label: 'Calculate Lead Score',
            app: 'hubspot',
            operation: 'update_contact_score',
            config: { scoringCriteria: 'company_size,budget,timeline' }
          }
        },
        {
          id: 'qualified_check',
          type: 'action.core',
          position: { x: 500, y: 100 },
          data: {
            label: 'Qualification Check',
            app: 'core',
            operation: 'conditional',
            config: { condition: 'leadScore >= 70' }
          }
        },
        {
          id: 'nurture_sequence',
          type: 'action.mailchimp',
          position: { x: 700, y: 200 },
          data: {
            label: 'Start Nurture Sequence',
            app: 'mailchimp',
            operation: 'add_to_campaign',
            config: { campaignId: 'lead_nurture_2024' }
          }
        },
        {
          id: 'sales_notification',
          type: 'action.slack',
          position: { x: 700, y: 50 },
          data: {
            label: 'Notify Sales Team',
            app: 'slack',
            operation: 'send_message',
            config: { channel: '#sales-qualified-leads' }
          }
        },
        {
          id: 'log_activity',
          type: 'action.google-sheets',
          position: { x: 900, y: 100 },
          data: {
            label: 'Log to Analytics Sheet',
            app: 'google-sheets',
            operation: 'append_row',
            config: { spreadsheetId: 'lead_analytics_sheet' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'lead_capture', target: 'lead_scoring' },
        { id: 'e2', source: 'lead_scoring', target: 'qualified_check' },
        { id: 'e3', source: 'qualified_check', target: 'sales_notification' },
        { id: 'e4', source: 'qualified_check', target: 'nurture_sequence' },
        { id: 'e5', source: 'sales_notification', target: 'log_activity' },
        { id: 'e6', source: 'nurture_sequence', target: 'log_activity' }
      ],
      metadata: {
        createdBy: 'P2 Template System',
        version: '1.0',
        lastUpdated: new Date().toISOString()
      }
    },
    configurationSteps: [
      {
        step: 1,
        title: 'Configure Salesforce Integration',
        description: 'Set up Salesforce API credentials and lead capture webhook',
        app: 'salesforce',
        action: 'configure_oauth'
      },
      {
        step: 2,
        title: 'Configure HubSpot Scoring',
        description: 'Set up lead scoring criteria and thresholds',
        app: 'hubspot',
        action: 'configure_scoring'
      },
      {
        step: 3,
        title: 'Configure Mailchimp Campaigns',
        description: 'Create nurture email sequences and automation rules',
        app: 'mailchimp',
        action: 'setup_campaigns'
      },
      {
        step: 4,
        title: 'Configure Slack Notifications',
        description: 'Set up sales team notification channels and message templates',
        app: 'slack',
        action: 'configure_webhooks'
      }
    ],
    tags: ['sales', 'crm', 'lead-generation', 'automation', 'enterprise']
  },

  {
    id: 'customer-onboarding-enterprise',
    name: 'Enterprise Customer Onboarding',
    description: 'Complete customer onboarding workflow with document signing, account setup, and team notifications.',
    category: 'sales',
    industry: ['enterprise', 'b2b', 'saas'],
    complexity: 'enterprise',
    estimatedSetupTime: '4-6 hours',
    requiredApps: ['salesforce', 'docusign', 'slack', 'microsoft-teams', 'google-sheets'],
    optionalApps: ['jira', 'confluence', 'calendly'],
    businessValue: 'Reduce onboarding time by 60% and improve customer satisfaction by 35%',
    roi: '$100,000+ annual savings for enterprise sales teams',
    graph: {
      nodes: [
        {
          id: 'deal_won',
          type: 'trigger.salesforce',
          position: { x: 100, y: 150 },
          data: {
            label: 'Deal Won',
            app: 'salesforce',
            operation: 'opportunity_closed_won',
            config: { opportunityStage: 'Closed Won' }
          }
        },
        {
          id: 'generate_contract',
          type: 'action.docusign',
          position: { x: 300, y: 150 },
          data: {
            label: 'Generate Contract',
            app: 'docusign',
            operation: 'send_envelope',
            config: { templateId: 'enterprise_contract_template' }
          }
        },
        {
          id: 'create_project',
          type: 'action.jira',
          position: { x: 500, y: 100 },
          data: {
            label: 'Create Onboarding Project',
            app: 'jira',
            operation: 'create_project',
            config: { projectTemplate: 'customer_onboarding' }
          }
        },
        {
          id: 'setup_team_channel',
          type: 'action.slack',
          position: { x: 500, y: 200 },
          data: {
            label: 'Create Customer Channel',
            app: 'slack',
            operation: 'create_channel',
            config: { channelPrefix: 'customer-' }
          }
        },
        {
          id: 'notify_teams',
          type: 'action.microsoft-teams',
          position: { x: 700, y: 150 },
          data: {
            label: 'Notify Implementation Team',
            app: 'microsoft-teams',
            operation: 'send_message',
            config: { teamId: 'implementation_team' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'deal_won', target: 'generate_contract' },
        { id: 'e2', source: 'generate_contract', target: 'create_project' },
        { id: 'e3', source: 'generate_contract', target: 'setup_team_channel' },
        { id: 'e4', source: 'create_project', target: 'notify_teams' },
        { id: 'e5', source: 'setup_team_channel', target: 'notify_teams' }
      ],
      metadata: {
        createdBy: 'P2 Enterprise Template System',
        version: '1.0',
        complexity: 'enterprise'
      }
    },
    configurationSteps: [
      {
        step: 1,
        title: 'Configure Salesforce Opportunity Triggers',
        description: 'Set up webhook for opportunity stage changes',
        app: 'salesforce',
        action: 'configure_webhooks'
      },
      {
        step: 2,
        title: 'Configure DocuSign Templates',
        description: 'Create and configure contract templates',
        app: 'docusign',
        action: 'setup_templates'
      },
      {
        step: 3,
        title: 'Configure Jira Project Templates',
        description: 'Set up customer onboarding project templates',
        app: 'jira',
        action: 'configure_templates'
      }
    ],
    tags: ['enterprise', 'onboarding', 'b2b', 'customer-success']
  }
];

// MARKETING AUTOMATION TEMPLATES
export const MARKETING_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'omnichannel-campaign',
    name: 'Omnichannel Marketing Campaign',
    description: 'Coordinated marketing campaign across email, social media, and advertising platforms with unified analytics.',
    category: 'marketing',
    industry: ['retail', 'ecommerce', 'consumer-brands'],
    complexity: 'advanced',
    estimatedSetupTime: '3-4 hours',
    requiredApps: ['mailchimp', 'facebook-ads', 'google-ads', 'buffer', 'google-analytics'],
    optionalApps: ['instagram', 'twitter', 'linkedin'],
    businessValue: 'Increase campaign effectiveness by 50% and reduce manual coordination time by 70%',
    roi: '$75,000+ annual marketing efficiency gains',
    graph: {
      nodes: [
        {
          id: 'campaign_trigger',
          type: 'trigger.time',
          position: { x: 100, y: 200 },
          data: {
            label: 'Campaign Launch',
            app: 'time',
            operation: 'schedule',
            config: { frequency: 'weekly', dayOfWeek: 'monday', time: '09:00' }
          }
        },
        {
          id: 'email_campaign',
          type: 'action.mailchimp',
          position: { x: 300, y: 100 },
          data: {
            label: 'Launch Email Campaign',
            app: 'mailchimp',
            operation: 'send_campaign',
            config: { campaignType: 'regular', segmentId: 'active_subscribers' }
          }
        },
        {
          id: 'facebook_ads',
          type: 'action.facebook-ads',
          position: { x: 300, y: 200 },
          data: {
            label: 'Launch Facebook Ads',
            app: 'facebook-ads',
            operation: 'create_campaign',
            config: { objective: 'conversions', budget: 1000 }
          }
        },
        {
          id: 'google_ads',
          type: 'action.google-ads',
          position: { x: 300, y: 300 },
          data: {
            label: 'Launch Google Ads',
            app: 'google-ads',
            operation: 'create_campaign',
            config: { campaignType: 'search', budget: 1500 }
          }
        },
        {
          id: 'social_posts',
          type: 'action.buffer',
          position: { x: 500, y: 150 },
          data: {
            label: 'Schedule Social Posts',
            app: 'buffer',
            operation: 'create_post',
            config: { platforms: ['facebook', 'twitter', 'linkedin'] }
          }
        },
        {
          id: 'track_analytics',
          type: 'action.google-analytics',
          position: { x: 700, y: 200 },
          data: {
            label: 'Track Campaign Performance',
            app: 'google-analytics',
            operation: 'create_custom_event',
            config: { eventName: 'campaign_launched' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'campaign_trigger', target: 'email_campaign' },
        { id: 'e2', source: 'campaign_trigger', target: 'facebook_ads' },
        { id: 'e3', source: 'campaign_trigger', target: 'google_ads' },
        { id: 'e4', source: 'email_campaign', target: 'social_posts' },
        { id: 'e5', source: 'facebook_ads', target: 'track_analytics' },
        { id: 'e6', source: 'google_ads', target: 'track_analytics' },
        { id: 'e7', source: 'social_posts', target: 'track_analytics' }
      ],
      metadata: {
        createdBy: 'P2 Marketing Template System',
        templateVersion: '1.0',
        lastUpdated: new Date().toISOString()
      }
    },
    configurationSteps: [
      {
        step: 1,
        title: 'Configure Email Marketing',
        description: 'Set up Mailchimp campaigns and subscriber segments',
        app: 'mailchimp',
        action: 'configure_campaigns'
      },
      {
        step: 2,
        title: 'Configure Ad Platforms',
        description: 'Set up Facebook and Google Ads accounts with conversion tracking',
        app: 'facebook-ads',
        action: 'configure_campaigns'
      },
      {
        step: 3,
        title: 'Configure Social Media',
        description: 'Connect Buffer to all social media accounts',
        app: 'buffer',
        action: 'configure_accounts'
      },
      {
        step: 4,
        title: 'Configure Analytics',
        description: 'Set up Google Analytics goals and conversion tracking',
        app: 'google-analytics',
        action: 'configure_goals'
      }
    ],
    tags: ['marketing', 'omnichannel', 'campaigns', 'analytics', 'automation']
  }
];

// HR & OPERATIONS TEMPLATES
export const HR_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'employee-lifecycle-management',
    name: 'Complete Employee Lifecycle Management',
    description: 'End-to-end employee management from hiring to offboarding with integrated HR systems.',
    category: 'hr',
    industry: ['technology', 'consulting', 'finance', 'healthcare'],
    complexity: 'enterprise',
    estimatedSetupTime: '6-8 hours',
    requiredApps: ['bamboohr', 'greenhouse', 'slack', 'google-workspace', 'jira'],
    optionalApps: ['workday', 'docusign', 'calendly'],
    businessValue: 'Reduce HR administrative time by 60% and improve employee experience by 40%',
    roi: '$200,000+ annual savings for companies with 100+ employees',
    graph: {
      nodes: [
        {
          id: 'candidate_hired',
          type: 'trigger.greenhouse',
          position: { x: 100, y: 200 },
          data: {
            label: 'Candidate Hired',
            app: 'greenhouse',
            operation: 'candidate_hired',
            config: { stage: 'offer_accepted' }
          }
        },
        {
          id: 'create_employee_record',
          type: 'action.bamboohr',
          position: { x: 300, y: 200 },
          data: {
            label: 'Create Employee Record',
            app: 'bamboohr',
            operation: 'create_employee',
            config: { department: 'auto_detect', startDate: 'next_monday' }
          }
        },
        {
          id: 'setup_accounts',
          type: 'action.google-workspace',
          position: { x: 500, y: 150 },
          data: {
            label: 'Create Google Workspace Account',
            app: 'google-workspace',
            operation: 'create_user',
            config: { orgUnit: '/Employees', sendWelcomeEmail: true }
          }
        },
        {
          id: 'create_onboarding_tasks',
          type: 'action.jira',
          position: { x: 500, y: 250 },
          data: {
            label: 'Create Onboarding Tasks',
            app: 'jira',
            operation: 'create_epic',
            config: { epicTemplate: 'employee_onboarding' }
          }
        },
        {
          id: 'notify_team',
          type: 'action.slack',
          position: { x: 700, y: 200 },
          data: {
            label: 'Notify Team',
            app: 'slack',
            operation: 'send_message',
            config: { channel: '#new-hires' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'candidate_hired', target: 'create_employee_record' },
        { id: 'e2', source: 'create_employee_record', target: 'setup_accounts' },
        { id: 'e3', source: 'create_employee_record', target: 'create_onboarding_tasks' },
        { id: 'e4', source: 'setup_accounts', target: 'notify_team' },
        { id: 'e5', source: 'create_onboarding_tasks', target: 'notify_team' }
      ],
      metadata: {
        createdBy: 'P2 HR Template System',
        templateVersion: '1.0',
        compliance: ['GDPR', 'SOX']
      }
    },
    configurationSteps: [
      {
        step: 1,
        title: 'Configure Greenhouse Integration',
        description: 'Set up hiring pipeline webhooks and candidate tracking',
        app: 'greenhouse',
        action: 'configure_webhooks'
      },
      {
        step: 2,
        title: 'Configure BambooHR',
        description: 'Set up employee data fields and organizational structure',
        app: 'bamboohr',
        action: 'configure_fields'
      },
      {
        step: 3,
        title: 'Configure Google Workspace',
        description: 'Set up organizational units and user provisioning',
        app: 'google-workspace',
        action: 'configure_provisioning'
      }
    ],
    tags: ['hr', 'onboarding', 'employee-lifecycle', 'enterprise', 'compliance']
  }
];

// FINANCE & OPERATIONS TEMPLATES
export const FINANCE_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'invoice-to-cash-automation',
    name: 'Invoice-to-Cash Automation',
    description: 'Complete invoice processing, payment tracking, and financial reporting automation.',
    category: 'finance',
    industry: ['professional-services', 'consulting', 'manufacturing'],
    complexity: 'advanced',
    estimatedSetupTime: '4-5 hours',
    requiredApps: ['quickbooks', 'stripe', 'xero', 'google-sheets', 'gmail'],
    optionalApps: ['salesforce', 'slack'],
    businessValue: 'Reduce invoice processing time by 80% and improve cash flow visibility by 90%',
    roi: '$150,000+ annual savings for mid-size businesses',
    graph: {
      nodes: [
        {
          id: 'invoice_created',
          type: 'trigger.quickbooks',
          position: { x: 100, y: 200 },
          data: {
            label: 'Invoice Created',
            app: 'quickbooks',
            operation: 'invoice_created',
            config: { invoiceType: 'standard' }
          }
        },
        {
          id: 'send_invoice_email',
          type: 'action.gmail',
          position: { x: 300, y: 200 },
          data: {
            label: 'Send Invoice Email',
            app: 'gmail',
            operation: 'send_email',
            config: { template: 'invoice_template' }
          }
        },
        {
          id: 'track_payment',
          type: 'action.stripe',
          position: { x: 500, y: 200 },
          data: {
            label: 'Track Payment Status',
            app: 'stripe',
            operation: 'monitor_payment',
            config: { webhookEvents: ['payment_intent.succeeded'] }
          }
        },
        {
          id: 'update_accounting',
          type: 'action.xero',
          position: { x: 700, y: 200 },
          data: {
            label: 'Update Accounting Records',
            app: 'xero',
            operation: 'update_invoice_status',
            config: { syncWithQuickBooks: true }
          }
        },
        {
          id: 'generate_report',
          type: 'action.google-sheets',
          position: { x: 900, y: 200 },
          data: {
            label: 'Update Cash Flow Report',
            app: 'google-sheets',
            operation: 'update_dashboard',
            config: { reportType: 'cash_flow' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'invoice_created', target: 'send_invoice_email' },
        { id: 'e2', source: 'send_invoice_email', target: 'track_payment' },
        { id: 'e3', source: 'track_payment', target: 'update_accounting' },
        { id: 'e4', source: 'update_accounting', target: 'generate_report' }
      ],
      metadata: {
        createdBy: 'P2 Finance Template System',
        templateVersion: '1.0',
        compliance: ['SOX', 'GAAP']
      }
    },
    configurationSteps: [
      {
        step: 1,
        title: 'Configure QuickBooks Integration',
        description: 'Set up invoice webhooks and accounting sync',
        app: 'quickbooks',
        action: 'configure_webhooks'
      },
      {
        step: 2,
        title: 'Configure Payment Processing',
        description: 'Set up Stripe payment monitoring and reconciliation',
        app: 'stripe',
        action: 'configure_webhooks'
      },
      {
        step: 3,
        title: 'Configure Financial Reporting',
        description: 'Set up automated financial dashboards and reports',
        app: 'google-sheets',
        action: 'configure_templates'
      }
    ],
    tags: ['finance', 'accounting', 'cash-flow', 'reporting', 'automation']
  }
];

// DEVOPS & DEVELOPMENT TEMPLATES
export const DEVOPS_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'ci-cd-pipeline-automation',
    name: 'Complete CI/CD Pipeline Automation',
    description: 'End-to-end development workflow from code commit to production deployment with monitoring.',
    category: 'devops',
    industry: ['technology', 'software', 'saas'],
    complexity: 'enterprise',
    estimatedSetupTime: '8-10 hours',
    requiredApps: ['github', 'jenkins', 'docker-hub', 'kubernetes', 'slack'],
    optionalApps: ['jira', 'datadog', 'new-relic'],
    businessValue: 'Reduce deployment time by 90% and improve code quality by 60%',
    roi: '$300,000+ annual development efficiency gains',
    graph: {
      nodes: [
        {
          id: 'code_pushed',
          type: 'trigger.github',
          position: { x: 100, y: 250 },
          data: {
            label: 'Code Pushed',
            app: 'github',
            operation: 'push_to_main',
            config: { branch: 'main', requiresPR: true }
          }
        },
        {
          id: 'run_tests',
          type: 'action.jenkins',
          position: { x: 300, y: 200 },
          data: {
            label: 'Run Automated Tests',
            app: 'jenkins',
            operation: 'trigger_build',
            config: { jobName: 'automated_tests' }
          }
        },
        {
          id: 'build_image',
          type: 'action.docker-hub',
          position: { x: 300, y: 300 },
          data: {
            label: 'Build Docker Image',
            app: 'docker-hub',
            operation: 'build_push_image',
            config: { repository: 'production_app' }
          }
        },
        {
          id: 'deploy_staging',
          type: 'action.kubernetes',
          position: { x: 500, y: 250 },
          data: {
            label: 'Deploy to Staging',
            app: 'kubernetes',
            operation: 'deploy_application',
            config: { namespace: 'staging', replicas: 2 }
          }
        },
        {
          id: 'notify_team',
          type: 'action.slack',
          position: { x: 700, y: 250 },
          data: {
            label: 'Notify Development Team',
            app: 'slack',
            operation: 'send_message',
            config: { channel: '#deployments' }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'code_pushed', target: 'run_tests' },
        { id: 'e2', source: 'code_pushed', target: 'build_image' },
        { id: 'e3', source: 'run_tests', target: 'deploy_staging' },
        { id: 'e4', source: 'build_image', target: 'deploy_staging' },
        { id: 'e5', source: 'deploy_staging', target: 'notify_team' }
      ],
      metadata: {
        createdBy: 'P2 DevOps Template System',
        templateVersion: '1.0',
        environment: 'production'
      }
    },
    configurationSteps: [
      {
        step: 1,
        title: 'Configure GitHub Webhooks',
        description: 'Set up repository webhooks for push and PR events',
        app: 'github',
        action: 'configure_webhooks'
      },
      {
        step: 2,
        title: 'Configure Jenkins Jobs',
        description: 'Set up automated test and build jobs',
        app: 'jenkins',
        action: 'configure_jobs'
      },
      {
        step: 3,
        title: 'Configure Container Registry',
        description: 'Set up Docker Hub repository and build automation',
        app: 'docker-hub',
        action: 'configure_builds'
      },
      {
        step: 4,
        title: 'Configure Kubernetes Deployment',
        description: 'Set up deployment manifests and rolling update strategy',
        app: 'kubernetes',
        action: 'configure_deployments'
      }
    ],
    tags: ['devops', 'ci-cd', 'deployment', 'automation', 'enterprise']
  }
];

// Master template registry
export const ALL_WORKFLOW_TEMPLATES = [
  ...SALES_TEMPLATES,
  ...MARKETING_TEMPLATES,
  ...HR_TEMPLATES,
  ...FINANCE_TEMPLATES,
  ...DEVOPS_TEMPLATES
];

// Helper functions
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return ALL_WORKFLOW_TEMPLATES.filter(t => t.category === category);
}

export function getTemplatesByIndustry(industry: string): WorkflowTemplate[] {
  return ALL_WORKFLOW_TEMPLATES.filter(t => t.industry.includes(industry));
}

export function getTemplatesByComplexity(complexity: string): WorkflowTemplate[] {
  return ALL_WORKFLOW_TEMPLATES.filter(t => t.complexity === complexity);
}

export function searchTemplates(query: string): WorkflowTemplate[] {
  const lowercaseQuery = query.toLowerCase();
  return ALL_WORKFLOW_TEMPLATES.filter(t => 
    t.name.toLowerCase().includes(lowercaseQuery) ||
    t.description.toLowerCase().includes(lowercaseQuery) ||
    t.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery)) ||
    t.industry.some(ind => ind.toLowerCase().includes(lowercaseQuery))
  );
}

export function getTemplateById(id: string): WorkflowTemplate | null {
  return ALL_WORKFLOW_TEMPLATES.find(t => t.id === id) || null;
}