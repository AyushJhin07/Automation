/**
 * TEMPLATE MANAGER - Curated workflow templates for common use cases
 * Provides ready-to-use workflows, parameterized templates, and template categorization
 */

import { NodeGraph } from '../../shared/nodeGraphSchema';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  workflow: NodeGraph;
  parameters: TemplateParameter[];
  sampleData: Record<string, any>;
  estimatedExecutionTime: string; // e.g., "2-5 minutes"
  popularityScore: number;
  usageCount: number;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  changelog?: string[];
  requirements: {
    connectors: string[];
    permissions?: string[];
    apiKeys?: string[];
  };
  screenshots?: string[];
  videoUrl?: string;
  documentation?: string;
}

export interface TemplateParameter {
  id: string;
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json' | 'url' | 'email';
  defaultValue?: any;
  required: boolean;
  options?: Array<{ label: string; value: any }>;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
  placeholder?: string;
  helpText?: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  order: number;
}

export interface TemplateSearchQuery {
  query?: string;
  category?: string;
  tags?: string[];
  difficulty?: string[];
  connectors?: string[];
  sortBy?: 'popularity' | 'name' | 'created' | 'updated' | 'usage';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface TemplateInstantiationResult {
  success: boolean;
  workflow?: NodeGraph;
  errors?: Array<{ parameter: string; error: string }>;
  warnings?: string[];
}

class TemplateManager {
  private templates = new Map<string, WorkflowTemplate>();
  private categories = new Map<string, TemplateCategory>();

  constructor() {
    this.initializeCategories();
    this.initializeCuratedTemplates();
    console.log('📚 Template Manager initialized with curated workflows');
  }

  /**
   * Get all templates with optional filtering
   */
  getTemplates(query: TemplateSearchQuery = {}): {
    templates: WorkflowTemplate[];
    total: number;
    hasMore: boolean;
  } {
    let templates = Array.from(this.templates.values());

    // Apply filters
    if (query.query) {
      const searchTerm = query.query.toLowerCase();
      templates = templates.filter(template =>
        template.name.toLowerCase().includes(searchTerm) ||
        template.description.toLowerCase().includes(searchTerm) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    if (query.category) {
      templates = templates.filter(template => template.category.id === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      templates = templates.filter(template =>
        query.tags!.some(tag => template.tags.includes(tag))
      );
    }

    if (query.difficulty && query.difficulty.length > 0) {
      templates = templates.filter(template =>
        query.difficulty!.includes(template.difficulty)
      );
    }

    if (query.connectors && query.connectors.length > 0) {
      templates = templates.filter(template =>
        query.connectors!.some(connector =>
          template.requirements.connectors.includes(connector)
        )
      );
    }

    // Sort templates
    const sortBy = query.sortBy || 'popularity';
    const sortOrder = query.sortOrder || 'desc';

    templates.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortBy) {
        case 'popularity':
          aVal = a.popularityScore;
          bVal = b.popularityScore;
          break;
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'created':
          aVal = a.createdAt.getTime();
          bVal = b.createdAt.getTime();
          break;
        case 'updated':
          aVal = a.updatedAt.getTime();
          bVal = b.updatedAt.getTime();
          break;
        case 'usage':
          aVal = a.usageCount;
          bVal = b.usageCount;
          break;
        default:
          aVal = a.popularityScore;
          bVal = b.popularityScore;
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    // Paginate
    const limit = query.limit || 20;
    const offset = query.offset || 0;
    const total = templates.length;
    const paginatedTemplates = templates.slice(offset, offset + limit);

    return {
      templates: paginatedTemplates,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(id: string): WorkflowTemplate | null {
    return this.templates.get(id) || null;
  }

  /**
   * Get all template categories
   */
  getCategories(): TemplateCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Instantiate a template with provided parameters
   */
  instantiateTemplate(
    templateId: string,
    parameters: Record<string, any>,
    customizations?: {
      workflowName?: string;
      workflowDescription?: string;
    }
  ): TemplateInstantiationResult {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        success: false,
        errors: [{ parameter: 'template', error: 'Template not found' }]
      };
    }

    // Validate parameters
    const validationResult = this.validateParameters(template.parameters, parameters);
    if (!validationResult.valid) {
      return {
        success: false,
        errors: validationResult.errors
      };
    }

    try {
      // Clone the template workflow
      const workflow: NodeGraph = JSON.parse(JSON.stringify(template.workflow));
      
      // Apply customizations
      if (customizations?.workflowName) {
        workflow.name = customizations.workflowName;
      }
      if (customizations?.workflowDescription) {
        workflow.description = customizations.workflowDescription;
      }

      // Generate new workflow ID
      workflow.id = `workflow_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Apply parameter substitutions
      const substitutionResult = this.applyParameterSubstitutions(workflow, parameters);
      
      // Increment usage count
      template.usageCount++;

      return {
        success: true,
        workflow: substitutionResult.workflow,
        warnings: substitutionResult.warnings
      };

    } catch (error) {
      return {
        success: false,
        errors: [{ parameter: 'instantiation', error: error.message }]
      };
    }
  }

  /**
   * Add a new template to the gallery
   */
  addTemplate(template: Omit<WorkflowTemplate, 'createdAt' | 'updatedAt' | 'usageCount'>): void {
    const fullTemplate: WorkflowTemplate = {
      ...template,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0
    };

    this.templates.set(template.id, fullTemplate);
    console.log(`📚 Added template: ${template.name}`);
  }

  /**
   * Get template analytics and statistics
   */
  getTemplateAnalytics(): {
    totalTemplates: number;
    totalUsage: number;
    popularTemplates: Array<{ id: string; name: string; usage: number }>;
    categoryDistribution: Array<{ category: string; count: number }>;
    difficultyDistribution: Array<{ difficulty: string; count: number }>;
    recentlyAdded: WorkflowTemplate[];
  } {
    const templates = Array.from(this.templates.values());
    
    const totalTemplates = templates.length;
    const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);
    
    const popularTemplates = templates
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map(t => ({ id: t.id, name: t.name, usage: t.usageCount }));

    const categoryDistribution = this.getCategoryDistribution(templates);
    const difficultyDistribution = this.getDifficultyDistribution(templates);
    
    const recentlyAdded = templates
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    return {
      totalTemplates,
      totalUsage,
      popularTemplates,
      categoryDistribution,
      difficultyDistribution,
      recentlyAdded
    };
  }

  // Private helper methods

  private validateParameters(
    templateParams: TemplateParameter[],
    providedParams: Record<string, any>
  ): {
    valid: boolean;
    errors: Array<{ parameter: string; error: string }>;
  } {
    const errors: Array<{ parameter: string; error: string }> = [];

    for (const param of templateParams) {
      const value = providedParams[param.id];

      // Check required parameters
      if (param.required && (value === undefined || value === null || value === '')) {
        errors.push({ parameter: param.id, error: `${param.name} is required` });
        continue;
      }

      // Skip validation if parameter is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.validateParameterType(value, param.type)) {
        errors.push({ parameter: param.id, error: `${param.name} must be of type ${param.type}` });
        continue;
      }

      // Additional validation
      if (param.validation) {
        const validationError = this.validateParameterConstraints(value, param.validation, param.name);
        if (validationError) {
          errors.push({ parameter: param.id, error: validationError });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private validateParameterType(value: any, type: TemplateParameter['type']): boolean {
    switch (type) {
      case 'string':
      case 'url':
      case 'email':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'select':
      case 'multiselect':
        return true; // Options validation would be done separately
      case 'json':
        try {
          JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
          return true;
        } catch {
          return false;
        }
      default:
        return true;
    }
  }

  private validateParameterConstraints(
    value: any,
    validation: TemplateParameter['validation'],
    paramName: string
  ): string | null {
    if (!validation) return null;

    // Pattern validation
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return `${paramName} does not match the required pattern`;
      }
    }

    // Numeric constraints
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        return `${paramName} must be at least ${validation.min}`;
      }
      if (validation.max !== undefined && value > validation.max) {
        return `${paramName} must be at most ${validation.max}`;
      }
    }

    // String length constraints
    if (typeof value === 'string') {
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        return `${paramName} must be at least ${validation.minLength} characters`;
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        return `${paramName} must be at most ${validation.maxLength} characters`;
      }
    }

    return null;
  }

  private applyParameterSubstitutions(
    workflow: NodeGraph,
    parameters: Record<string, any>
  ): {
    workflow: NodeGraph;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Recursively replace parameter placeholders in the workflow
    const processValue = (value: any): any => {
      if (typeof value === 'string') {
        // Replace parameter placeholders: {{param.paramId}}
        return value.replace(/\{\{param\.([^}]+)\}\}/g, (match, paramId) => {
          if (parameters[paramId] !== undefined) {
            return String(parameters[paramId]);
          } else {
            warnings.push(`Parameter placeholder ${match} not found in provided parameters`);
            return match;
          }
        });
      }

      if (Array.isArray(value)) {
        return value.map(processValue);
      }

      if (typeof value === 'object' && value !== null) {
        const processed: any = {};
        for (const [key, val] of Object.entries(value)) {
          processed[key] = processValue(val);
        }
        return processed;
      }

      return value;
    };

    const processedWorkflow = processValue(workflow);

    return {
      workflow: processedWorkflow,
      warnings
    };
  }

  private getCategoryDistribution(templates: WorkflowTemplate[]): Array<{ category: string; count: number }> {
    const distribution = new Map<string, number>();
    
    for (const template of templates) {
      const category = template.category.name;
      distribution.set(category, (distribution.get(category) || 0) + 1);
    }

    return Array.from(distribution.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getDifficultyDistribution(templates: WorkflowTemplate[]): Array<{ difficulty: string; count: number }> {
    const distribution = new Map<string, number>();
    
    for (const template of templates) {
      const difficulty = template.difficulty;
      distribution.set(difficulty, (distribution.get(difficulty) || 0) + 1);
    }

    return Array.from(distribution.entries())
      .map(([difficulty, count]) => ({ difficulty, count }))
      .sort((a, b) => b.count - a.count);
  }

  private initializeCategories(): void {
    const categories: TemplateCategory[] = [
      {
        id: 'automation',
        name: 'Business Automation',
        description: 'Automate repetitive business processes',
        icon: '⚙️',
        color: '#3B82F6',
        order: 1
      },
      {
        id: 'data-sync',
        name: 'Data Synchronization',
        description: 'Keep data synchronized between systems',
        icon: '🔄',
        color: '#10B981',
        order: 2
      },
      {
        id: 'notifications',
        name: 'Notifications & Alerts',
        description: 'Send notifications and alerts automatically',
        icon: '🔔',
        color: '#F59E0B',
        order: 3
      },
      {
        id: 'ai-workflows',
        name: 'AI-Powered Workflows',
        description: 'Leverage AI for intelligent automation',
        icon: '🤖',
        color: '#8B5CF6',
        order: 4
      },
      {
        id: 'ecommerce',
        name: 'E-commerce',
        description: 'Automate online store operations',
        icon: '🛒',
        color: '#EF4444',
        order: 5
      },
      {
        id: 'hr-recruiting',
        name: 'HR & Recruiting',
        description: 'Streamline human resources processes',
        icon: '👥',
        color: '#06B6D4',
        order: 6
      },
      {
        id: 'marketing',
        name: 'Marketing',
        description: 'Automate marketing campaigns and lead generation',
        icon: '📢',
        color: '#EC4899',
        order: 7
      },
      {
        id: 'finance',
        name: 'Finance & Accounting',
        description: 'Automate financial processes and reporting',
        icon: '💰',
        color: '#84CC16',
        order: 8
      }
    ];

    for (const category of categories) {
      this.categories.set(category.id, category);
    }
  }

  private initializeCuratedTemplates(): void {
    // Template 1: Email to Task Automation
    this.addTemplate({
      id: 'email-to-task',
      name: 'Email to Task Automation',
      description: 'Automatically create tasks from important emails in your project management tool',
      category: this.categories.get('automation')!,
      difficulty: 'beginner',
      tags: ['email', 'tasks', 'productivity', 'project-management'],
      workflow: this.createEmailToTaskWorkflow(),
      parameters: [
        {
          id: 'email_filter',
          name: 'Email Filter Keywords',
          description: 'Keywords to identify important emails (comma-separated)',
          type: 'string',
          required: true,
          defaultValue: 'urgent, important, action required',
          placeholder: 'urgent, important, action required',
          helpText: 'Emails containing these keywords will create tasks'
        },
        {
          id: 'project_id',
          name: 'Project ID',
          description: 'The ID of the project where tasks should be created',
          type: 'string',
          required: true,
          placeholder: 'proj_12345',
          helpText: 'Get this from your project management tool'
        }
      ],
      sampleData: {
        email: {
          subject: 'URGENT: Fix production bug',
          body: 'We have a critical bug in production that needs immediate attention.',
          from: 'manager@company.com'
        }
      },
      estimatedExecutionTime: '1-2 minutes',
      popularityScore: 95,
      usageCount: 1250,
      author: 'Workflow Templates Team',
      version: '1.2.0',
      changelog: ['Added email filtering', 'Improved task descriptions', 'Added priority mapping'],
      requirements: {
        connectors: ['gmail', 'asana'],
        apiKeys: ['Gmail API', 'Asana API']
      },
      documentation: 'This workflow monitors your Gmail inbox for emails containing specific keywords and automatically creates tasks in Asana.'
    });

    // Template 2: Lead Qualification with AI
    this.addTemplate({
      id: 'ai-lead-qualification',
      name: 'AI-Powered Lead Qualification',
      description: 'Use AI to automatically qualify and score incoming leads based on custom criteria',
      category: this.categories.get('ai-workflows')!,
      difficulty: 'intermediate',
      tags: ['ai', 'leads', 'sales', 'qualification', 'scoring'],
      workflow: this.createAILeadQualificationWorkflow(),
      parameters: [
        {
          id: 'qualification_criteria',
          name: 'Qualification Criteria',
          description: 'Describe what makes a qualified lead for your business',
          type: 'string',
          required: true,
          defaultValue: 'Company size > 50 employees, Budget > $10k, Has decision-making authority',
          helpText: 'Be specific about your ideal customer profile'
        },
        {
          id: 'score_threshold',
          name: 'Qualification Score Threshold',
          description: 'Minimum score (0-100) for a lead to be considered qualified',
          type: 'number',
          required: true,
          defaultValue: 70,
          validation: { min: 0, max: 100 }
        }
      ],
      sampleData: {
        lead: {
          name: 'John Smith',
          email: 'john@techcorp.com',
          company: 'TechCorp Inc',
          title: 'CTO',
          message: 'Looking for a solution to automate our customer onboarding process for our team of 100+'
        }
      },
      estimatedExecutionTime: '30 seconds',
      popularityScore: 88,
      usageCount: 850,
      author: 'AI Workflows Team',
      version: '2.0.0',
      requirements: {
        connectors: ['llm', 'hubspot'],
        apiKeys: ['OpenAI API', 'HubSpot API']
      }
    });

    // Template 3: Order Fulfillment Automation
    this.addTemplate({
      id: 'order-fulfillment',
      name: 'E-commerce Order Fulfillment',
      description: 'Automatically process orders, update inventory, and send confirmation emails',
      category: this.categories.get('ecommerce')!,
      difficulty: 'intermediate',
      tags: ['ecommerce', 'orders', 'inventory', 'fulfillment'],
      workflow: this.createOrderFulfillmentWorkflow(),
      parameters: [
        {
          id: 'warehouse_location',
          name: 'Warehouse Location',
          description: 'Primary warehouse for order fulfillment',
          type: 'select',
          required: true,
          options: [
            { label: 'US East (New York)', value: 'us-east' },
            { label: 'US West (California)', value: 'us-west' },
            { label: 'Europe (London)', value: 'eu-london' },
            { label: 'Asia Pacific (Singapore)', value: 'ap-singapore' }
          ],
          defaultValue: 'us-east'
        },
        {
          id: 'low_stock_threshold',
          name: 'Low Stock Alert Threshold',
          description: 'Send alerts when inventory falls below this number',
          type: 'number',
          required: true,
          defaultValue: 10,
          validation: { min: 1, max: 1000 }
        }
      ],
      sampleData: {
        order: {
          id: 'ORD-12345',
          customer: 'jane@example.com',
          items: [{ sku: 'PROD-001', quantity: 2, price: 29.99 }],
          total: 59.98
        }
      },
      estimatedExecutionTime: '2-3 minutes',
      popularityScore: 92,
      usageCount: 2100,
      author: 'E-commerce Team',
      version: '1.5.0',
      requirements: {
        connectors: ['shopify', 'gmail', 'sheets'],
        apiKeys: ['Shopify API', 'Gmail API']
      }
    });

    // Template 4: Expense Report Processing
    this.addTemplate({
      id: 'expense-report-processing',
      name: 'Automated Expense Report Processing',
      description: 'Extract data from expense receipts using AI and create expense reports automatically',
      category: this.categories.get('finance')!,
      difficulty: 'advanced',
      tags: ['finance', 'expenses', 'ai', 'ocr', 'automation'],
      workflow: this.createExpenseReportWorkflow(),
      parameters: [
        {
          id: 'expense_categories',
          name: 'Expense Categories',
          description: 'Valid expense categories for your organization',
          type: 'multiselect',
          required: true,
          options: [
            { label: 'Travel', value: 'travel' },
            { label: 'Meals', value: 'meals' },
            { label: 'Office Supplies', value: 'office' },
            { label: 'Software', value: 'software' },
            { label: 'Marketing', value: 'marketing' },
            { label: 'Training', value: 'training' }
          ],
          defaultValue: ['travel', 'meals', 'office']
        },
        {
          id: 'approval_threshold',
          name: 'Auto-Approval Threshold',
          description: 'Expenses below this amount will be auto-approved',
          type: 'number',
          required: true,
          defaultValue: 50,
          validation: { min: 0, max: 500 }
        }
      ],
      sampleData: {
        receipt: {
          image_url: 'https://example.com/receipt.jpg',
          submitted_by: 'employee@company.com'
        }
      },
      estimatedExecutionTime: '1-2 minutes',
      popularityScore: 85,
      usageCount: 680,
      author: 'Finance Automation Team',
      version: '1.0.0',
      requirements: {
        connectors: ['llm', 'gmail', 'sheets'],
        apiKeys: ['OpenAI API (Vision)', 'Gmail API']
      }
    });

    // Template 5: Social Media Content Scheduler
    this.addTemplate({
      id: 'social-media-scheduler',
      name: 'AI Social Media Content Scheduler',
      description: 'Generate and schedule social media content across multiple platforms using AI',
      category: this.categories.get('marketing')!,
      difficulty: 'intermediate',
      tags: ['social-media', 'content', 'ai', 'scheduling', 'marketing'],
      workflow: this.createSocialMediaSchedulerWorkflow(),
      parameters: [
        {
          id: 'brand_voice',
          name: 'Brand Voice',
          description: 'Describe your brand voice and tone',
          type: 'string',
          required: true,
          defaultValue: 'Professional, friendly, and helpful. We focus on empowering small businesses.',
          helpText: 'This will guide the AI in generating content that matches your brand'
        },
        {
          id: 'posting_schedule',
          name: 'Posting Schedule',
          description: 'How often to post content',
          type: 'select',
          required: true,
          options: [
            { label: 'Daily', value: 'daily' },
            { label: 'Every 2 days', value: 'every-2-days' },
            { label: 'Weekly', value: 'weekly' },
            { label: 'Bi-weekly', value: 'bi-weekly' }
          ],
          defaultValue: 'daily'
        }
      ],
      sampleData: {
        content_theme: 'productivity tips for small business owners',
        platforms: ['twitter', 'linkedin', 'facebook']
      },
      estimatedExecutionTime: '5-10 minutes',
      popularityScore: 89,
      usageCount: 1420,
      author: 'Marketing Team',
      version: '1.3.0',
      requirements: {
        connectors: ['llm', 'twitter', 'linkedin'],
        apiKeys: ['OpenAI API', 'Twitter API', 'LinkedIn API']
      }
    });

    console.log(`📚 Initialized ${this.templates.size} curated templates across ${this.categories.size} categories`);
  }

  // Simplified workflow creation methods (in production, these would be full NodeGraph definitions)
  private createEmailToTaskWorkflow(): NodeGraph {
    return {
      id: 'email-to-task-template',
      name: 'Email to Task Automation',
      description: 'Convert important emails to tasks',
      nodes: [
        {
          id: 'email_trigger',
          type: 'trigger.gmail.new_email',
          position: { x: 100, y: 100 },
          data: {
            label: 'New Email Trigger',
            params: {
              filter: '{{param.email_filter}}'
            }
          }
        },
        {
          id: 'extract_task_info',
          type: 'action.llm.extract',
          position: { x: 300, y: 100 },
          data: {
            label: 'Extract Task Information',
            params: {
              provider: 'openai',
              model: 'gpt-4o-mini',
              prompt: 'Extract task title, description, and priority from this email',
              jsonSchema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] }
                }
              }
            }
          }
        },
        {
          id: 'create_task',
          type: 'action.asana.create_task',
          position: { x: 500, y: 100 },
          data: {
            label: 'Create Asana Task',
            params: {
              project_id: '{{param.project_id}}',
              name: '{{nodes.extract_task_info.title}}',
              notes: '{{nodes.extract_task_info.description}}'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'email_trigger', target: 'extract_task_info' },
        { id: 'e2', source: 'extract_task_info', target: 'create_task' }
      ],
      tags: ['email', 'tasks']
    };
  }

  private createAILeadQualificationWorkflow(): NodeGraph {
    return {
      id: 'ai-lead-qualification-template',
      name: 'AI Lead Qualification',
      description: 'Qualify leads using AI',
      nodes: [
        {
          id: 'new_lead_trigger',
          type: 'trigger.hubspot.new_lead',
          position: { x: 100, y: 100 },
          data: {
            label: 'New Lead Trigger',
            params: {}
          }
        },
        {
          id: 'qualify_lead',
          type: 'action.llm.extract',
          position: { x: 300, y: 100 },
          data: {
            label: 'AI Lead Qualification',
            params: {
              provider: 'openai',
              model: 'gpt-4o-mini',
              prompt: 'Qualify this lead based on: {{param.qualification_criteria}}. Score from 0-100.',
              jsonSchema: {
                type: 'object',
                properties: {
                  score: { type: 'number' },
                  reasoning: { type: 'string' },
                  qualified: { type: 'boolean' }
                }
              }
            }
          }
        },
        {
          id: 'update_lead_score',
          type: 'action.hubspot.update_contact',
          position: { x: 500, y: 100 },
          data: {
            label: 'Update Lead Score',
            params: {
              score: '{{nodes.qualify_lead.score}}',
              qualified: '{{nodes.qualify_lead.qualified}}'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'new_lead_trigger', target: 'qualify_lead' },
        { id: 'e2', source: 'qualify_lead', target: 'update_lead_score' }
      ],
      tags: ['ai', 'leads']
    };
  }

  private createOrderFulfillmentWorkflow(): NodeGraph {
    return {
      id: 'order-fulfillment-template',
      name: 'Order Fulfillment',
      description: 'Process e-commerce orders',
      nodes: [
        {
          id: 'new_order_trigger',
          type: 'trigger.shopify.new_order',
          position: { x: 100, y: 100 },
          data: {
            label: 'New Order Trigger',
            params: {}
          }
        },
        {
          id: 'check_inventory',
          type: 'action.shopify.check_inventory',
          position: { x: 300, y: 100 },
          data: {
            label: 'Check Inventory',
            params: {
              warehouse: '{{param.warehouse_location}}'
            }
          }
        },
        {
          id: 'update_inventory',
          type: 'action.sheets.update_row',
          position: { x: 500, y: 100 },
          data: {
            label: 'Update Inventory',
            params: {
              spreadsheet_id: 'inventory_sheet',
              values: 'updated quantities'
            }
          }
        },
        {
          id: 'send_confirmation',
          type: 'action.gmail.send_email',
          position: { x: 700, y: 100 },
          data: {
            label: 'Send Confirmation',
            params: {
              to: '{{nodes.new_order_trigger.customer_email}}',
              subject: 'Order Confirmation #{{nodes.new_order_trigger.order_number}}',
              body: 'Your order has been confirmed and will be processed soon.'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'new_order_trigger', target: 'check_inventory' },
        { id: 'e2', source: 'check_inventory', target: 'update_inventory' },
        { id: 'e3', source: 'update_inventory', target: 'send_confirmation' }
      ],
      tags: ['ecommerce', 'orders']
    };
  }

  private createExpenseReportWorkflow(): NodeGraph {
    return {
      id: 'expense-report-template',
      name: 'Expense Report Processing',
      description: 'Process expense receipts with AI',
      nodes: [
        {
          id: 'receipt_trigger',
          type: 'trigger.gmail.new_attachment',
          position: { x: 100, y: 100 },
          data: {
            label: 'Receipt Email Trigger',
            params: {
              subject_contains: 'expense',
              attachment_types: ['image']
            }
          }
        },
        {
          id: 'extract_receipt_data',
          type: 'action.llm.extract',
          position: { x: 300, y: 100 },
          data: {
            label: 'Extract Receipt Data',
            params: {
              provider: 'openai',
              model: 'gpt-4o-mini',
              prompt: 'Extract expense information from this receipt image',
              jsonSchema: {
                type: 'object',
                properties: {
                  merchant: { type: 'string' },
                  amount: { type: 'number' },
                  date: { type: 'string' },
                  category: { type: 'string' }
                }
              }
            }
          }
        },
        {
          id: 'add_to_expense_sheet',
          type: 'action.sheets.append_row',
          position: { x: 500, y: 100 },
          data: {
            label: 'Add to Expense Sheet',
            params: {
              spreadsheet_id: 'expense_tracking',
              values: [
                '{{nodes.extract_receipt_data.date}}',
                '{{nodes.extract_receipt_data.merchant}}',
                '{{nodes.extract_receipt_data.amount}}',
                '{{nodes.extract_receipt_data.category}}'
              ]
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'receipt_trigger', target: 'extract_receipt_data' },
        { id: 'e2', source: 'extract_receipt_data', target: 'add_to_expense_sheet' }
      ],
      tags: ['finance', 'ai']
    };
  }

  private createSocialMediaSchedulerWorkflow(): NodeGraph {
    return {
      id: 'social-media-scheduler-template',
      name: 'Social Media Scheduler',
      description: 'Generate and schedule social content',
      nodes: [
        {
          id: 'content_timer',
          type: 'trigger.schedule.cron',
          position: { x: 100, y: 100 },
          data: {
            label: 'Content Schedule Trigger',
            params: {
              schedule: '{{param.posting_schedule}}'
            }
          }
        },
        {
          id: 'generate_content',
          type: 'action.llm.generate',
          position: { x: 300, y: 100 },
          data: {
            label: 'Generate Social Content',
            params: {
              provider: 'openai',
              model: 'gpt-4o-mini',
              prompt: 'Generate social media content with this brand voice: {{param.brand_voice}}'
            }
          }
        },
        {
          id: 'post_to_twitter',
          type: 'action.twitter.create_tweet',
          position: { x: 500, y: 50 },
          data: {
            label: 'Post to Twitter',
            params: {
              text: '{{nodes.generate_content.twitter_post}}'
            }
          }
        },
        {
          id: 'post_to_linkedin',
          type: 'action.linkedin.create_post',
          position: { x: 500, y: 150 },
          data: {
            label: 'Post to LinkedIn',
            params: {
              text: '{{nodes.generate_content.linkedin_post}}'
            }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'content_timer', target: 'generate_content' },
        { id: 'e2', source: 'generate_content', target: 'post_to_twitter' },
        { id: 'e3', source: 'generate_content', target: 'post_to_linkedin' }
      ],
      tags: ['social-media', 'ai']
    };
  }
}

export const templateManager = new TemplateManager();