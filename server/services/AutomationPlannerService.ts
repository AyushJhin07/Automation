/**
 * CRITICAL FIX: LLM as Intelligent Automation Planner
 * 
 * Replaces static Q&A with dynamic automation planning where the LLM
 * analyzes the user's request and figures out exactly what's needed.
 */

import { MultiAIService } from '../aiModels.js';
import { buildPlannerPrompt, type PlannerMode } from "./PromptBuilder.js";
import { generateJsonWithGemini } from '../llm/MultiAIService.js';

export interface AutomationStep {
  app: string;
  operation: string;
  required_inputs: string[];
  missing_inputs: string[];
  description: string;
}

export interface AutomationTrigger {
  type: 'time' | 'webhook' | 'email' | 'spreadsheet' | 'form';
  app: string;
  operation: string;
  description: string;
  required_inputs: string[];
  missing_inputs: string[];
}

export interface MissingInput {
  id: string;
  question: string;
  type: 'text' | 'url' | 'email' | 'select' | 'textarea' | 'number';
  placeholder?: string;
  options?: string[];
  required: boolean;
  category: 'trigger' | 'data' | 'action' | 'config';
  helpText?: string;
}

export interface AutomationPlan {
  apps: string[];
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  missing_inputs: MissingInput[];
  workflow_name: string;
  description: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimated_setup_time: string;
  business_value: string;
}

export class AutomationPlannerService {
  
  /**
   * ChatGPT Enhancement: Dynamic automation planning with registry integration
   */
  static async planAutomation(userPrompt: string, mode?: PlannerMode): Promise<AutomationPlan> {
    console.log('🧠 LLM Automation Planner analyzing prompt:', userPrompt);
    
    const DEFAULT_MODE: PlannerMode = (process.env.PLANNER_MODE as PlannerMode) || "gas-only";
    const resolvedMode = mode || DEFAULT_MODE;
    
    console.log('🎯 Planner mode:', resolvedMode);
    
    try {
      const systemPrompt = buildPlannerPrompt(userPrompt, resolvedMode);
      
      // Use JSON-safe generation
      const jsonResponse = await generateJsonWithGemini('gemini-2.0-flash-exp', systemPrompt);
      
      let plan;
      try {
        plan = JSON.parse(jsonResponse);
      } catch (parseError) {
        console.error('❌ Failed to parse LLM plan response:', parseError);
        // Fallback to deterministic planning
        return this.createFallbackPlan(userPrompt, resolvedMode);
      }
      
      console.log('✅ Generated dynamic automation plan:', {
        mode: resolvedMode,
        apps: plan.apps,
        steps: plan.steps?.length || 0,
        questions: plan.follow_up_questions?.length || 0
      });
      
      // Convert to our internal format
      return {
        apps: plan.apps || [],
        trigger: plan.trigger || { type: 'manual', app: 'manual', operation: 'trigger' },
        steps: plan.steps || [],
        missing_inputs: plan.missing_inputs || [],
        workflow_name: plan.workflow_name || 'Generated Workflow',
        description: plan.description || 'AI-generated automation workflow',
        complexity: plan.complexity || 'medium',
        business_value: plan.business_value || 'Automation efficiency',
        follow_up_questions: plan.follow_up_questions || []
      };
      
    } catch (error) {
      console.error('❌ LLM planning failed:', error);
      return this.createFallbackPlan(userPrompt, resolvedMode);
    }

    const planningPrompt = `You are a world-class automation planner with expertise in business processes and our 149 available applications.

AVAILABLE APPLICATIONS (choose the most relevant):
🏢 CRM & Sales: Salesforce, HubSpot, Pipedrive, Zoho CRM, Dynamics 365
💬 Communication: Slack, Microsoft Teams, Discord, Telegram, WhatsApp, Twilio, Zoom
🛍️ E-commerce: Shopify, Stripe, PayPal, Square, Amazon, eBay, WooCommerce, BigCommerce
📋 Project Management: Jira, Asana, Trello, Monday.com, ClickUp, Basecamp, Notion
📧 Marketing: Mailchimp, Klaviyo, SendGrid, HubSpot, ActiveCampaign, ConvertKit
📊 Analytics: Google Analytics, Mixpanel, Amplitude, Datadog, New Relic
💰 Finance: QuickBooks, Xero, Wave, FreshBooks, Sage, Zoho Books
📄 Documents: Google Docs/Sheets/Slides, Microsoft Office, DocuSign, Adobe Sign
☁️ Storage: Google Drive, Dropbox, Box, OneDrive, AWS S3
🔧 DevOps: GitHub, GitLab, Jenkins, Docker Hub, Kubernetes
📱 Social Media: Facebook, Twitter, Instagram, LinkedIn, YouTube, TikTok, Buffer
🎫 Support: Zendesk, Freshdesk, Intercom, ServiceNow
👤 HR: BambooHR, Greenhouse, Workday
🗄️ Database: MySQL, PostgreSQL, MongoDB, Redis, Oracle
📧 Google Workspace: Gmail, Google Sheets, Google Calendar, Google Drive, Google Forms

USER'S AUTOMATION REQUEST: "${userPrompt}"

ANALYZE THIS REQUEST AND CREATE A COMPREHENSIVE AUTOMATION PLAN:

1. Identify ALL apps needed for this automation
2. Determine the trigger type and configuration
3. Plan the sequence of steps/operations required
4. For EACH step, identify what inputs are required
5. Determine which inputs are MISSING from the user's prompt
6. Generate intelligent questions ONLY for missing inputs

RESPOND WITH DETAILED JSON:

{
  "apps": ["gmail", "sheets"],
  "trigger": {
    "type": "time",
    "app": "time", 
    "operation": "schedule",
    "description": "Check for new emails every 15 minutes",
    "required_inputs": ["frequency", "unit"],
    "missing_inputs": []
  },
  "steps": [
    {
      "app": "gmail",
      "operation": "search_emails",
      "description": "Search for invoice emails",
      "required_inputs": ["search_query", "max_results"],
      "missing_inputs": ["search_query"]
    },
    {
      "app": "sheets", 
      "operation": "append_row",
      "description": "Log invoice data to spreadsheet",
      "required_inputs": ["spreadsheet_url", "sheet_name", "row_data"],
      "missing_inputs": ["spreadsheet_url", "sheet_name"]
    }
  ],
  "missing_inputs": [
    {
      "id": "search_query",
      "question": "What email search criteria should we use to find invoices?",
      "type": "text",
      "placeholder": "from:vendor@company.com OR subject:invoice",
      "required": true,
      "category": "trigger",
      "helpText": "Use Gmail search syntax to filter for invoice emails"
    },
    {
      "id": "spreadsheet_url", 
      "question": "What is the EXACT Google Sheets URL where invoice data should be logged?",
      "type": "url",
      "placeholder": "https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit",
      "required": true,
      "category": "data",
      "helpText": "Copy the full URL from your Google Sheets browser tab"
    },
    {
      "id": "sheet_name",
      "question": "Which sheet tab should we use?", 
      "type": "text",
      "placeholder": "Sheet1",
      "required": true,
      "category": "data",
      "helpText": "The name of the specific sheet tab within your spreadsheet"
    }
  ],
  "workflow_name": "Gmail Invoice Logger",
  "description": "Automatically monitor Gmail for invoice emails and log them to Google Sheets",
  "complexity": "medium",
  "estimated_setup_time": "15-20 minutes",
  "business_value": "Save 2-3 hours per week on manual invoice processing"
}

CRITICAL REQUIREMENTS:
1. Be SPECIFIC about required inputs for each operation
2. Only ask questions for inputs that are MISSING from the user's prompt
3. Use appropriate input types (url for spreadsheets, email for recipients, etc.)
4. Provide helpful placeholders and validation guidance
5. Group questions by logical categories (trigger, data, action, config)

This plan will be used to generate ONLY the necessary follow-up questions and then compile the workflow.`;

    try {
      const response = await MultiAIService.generateText({
        model: 'gemini-2.0-flash-exp',
        prompt: planningPrompt
      });

      // Parse the LLM response
      let plan: AutomationPlan;
      try {
        const cleanedResponse = response.replace(/```json|```/g, '').trim();
        plan = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('❌ Failed to parse LLM planning response:', parseError);
        // Fallback plan
        plan = this.createFallbackPlan(userPrompt);
      }

      // Validate and enhance the plan
      plan = this.validateAndEnhancePlan(plan, userPrompt);

      console.log('✅ Generated automation plan:', {
        apps: plan.apps,
        triggerType: plan.trigger?.type || 'unknown',
        stepsCount: plan.steps?.length || 0,
        missingInputsCount: plan.missing_inputs?.length || 0
      });

      return plan;

    } catch (error) {
      console.error('❌ LLM planning failed:', error);
      return this.createFallbackPlan(userPrompt);
    }
  }

  /**
   * Re-evaluate plan after user provides missing inputs
   */
  static async refinePlan(
    originalPlan: AutomationPlan, 
    userAnswers: Record<string, string>
  ): Promise<{ isComplete: boolean; updatedPlan?: AutomationPlan; additionalQuestions?: MissingInput[] }> {
    
    const refinementPrompt = `You are an automation planner reviewing a plan after the user provided additional information.

ORIGINAL PLAN:
${JSON.stringify(originalPlan, null, 2)}

USER'S ANSWERS:
${JSON.stringify(userAnswers, null, 2)}

ANALYZE:
1. Are all required inputs now provided?
2. Do the user's answers reveal any additional requirements?
3. Should any steps be modified based on the new information?

RESPOND WITH:
{
  "is_complete": true/false,
  "updated_plan": { /* updated plan if needed */ },
  "additional_questions": [ /* array of additional questions if not complete */ ],
  "reasoning": "Why the plan is complete or what's still missing"
}`;

    try {
      const response = await MultiAIService.generateText({
        model: 'gemini-2.0-flash-exp', 
        prompt: refinementPrompt
      });

      const result = JSON.parse(response.replace(/```json|```/g, '').trim());
      
      return {
        isComplete: result.is_complete,
        updatedPlan: result.updated_plan,
        additionalQuestions: result.additional_questions || []
      };

    } catch (error) {
      console.error('❌ Plan refinement failed:', error);
      // Assume complete if we can't refine
      return { isComplete: true, updatedPlan: originalPlan };
    }
  }

  /**
   * Convert completed plan to workflow graph
   */
  static planToWorkflowGraph(plan: AutomationPlan, userAnswers: Record<string, string>) {
    const nodes = [];
    const edges = [];

    // Create trigger node
    const triggerId = 'trigger_1';
    nodes.push({
      id: triggerId,
      type: `trigger.${plan.trigger?.app || 'unknown'}`,
      position: { x: 100, y: 200 },
      data: {
        label: plan.trigger?.description || 'Trigger',
        app: plan.trigger?.app || 'unknown',
        operation: plan.trigger?.operation || 'unknown',
        config: this.fillConfigFromAnswers(plan.trigger?.required_inputs || [], userAnswers)
      },
      app: plan.trigger?.app || 'unknown',
      op: `trigger.${plan.trigger?.app || 'unknown'}:${plan.trigger?.operation || 'unknown'}`,
      params: this.fillConfigFromAnswers(plan.trigger?.required_inputs || [], userAnswers)
    });

    // Create step nodes
    let previousNodeId = triggerId;
    (plan.steps || []).forEach((step, index) => {
      const stepId = `step_${index + 1}`;
      
      nodes.push({
        id: stepId,
        type: `action.${step?.app || 'unknown'}`,
        position: { x: 300 + (index * 200), y: 200 },
        data: {
          label: step?.description || 'Action',
          app: step?.app || 'unknown',
          operation: step?.operation || 'unknown',
          config: this.fillConfigFromAnswers(step?.required_inputs || [], userAnswers)
        },
        app: step?.app || 'unknown',
        op: `action.${step?.app || 'unknown'}:${step?.operation || 'unknown'}`,
        params: this.fillConfigFromAnswers(step?.required_inputs || [], userAnswers)
      });

      // Connect to previous node
      edges.push({
        id: `edge_${previousNodeId}_${stepId}`,
        source: previousNodeId,
        target: stepId
      });

      previousNodeId = stepId;
    });

    return {
      id: `wf_${Date.now()}`,
      name: plan.workflow_name,
      version: 1,
      nodes,
      edges,
      scopes: [],
      secrets: [],
      metadata: {
        createdBy: 'LLM Automation Planner',
        createdAt: new Date().toISOString(),
        automationType: 'llm_planned',
        description: plan.description,
        complexity: plan.complexity,
        businessValue: plan.business_value,
        originalPrompt: userAnswers.originalPrompt || ''
      }
    };
  }

  /**
   * Fill configuration from user answers
   */
  private static fillConfigFromAnswers(requiredInputs: string[], userAnswers: Record<string, string>): Record<string, any> {
    const config: Record<string, any> = {};
    
    requiredInputs.forEach(input => {
      if (userAnswers[input]) {
        config[input] = userAnswers[input];
      }
    });

    return config;
  }

  /**
   * Create DYNAMIC fallback plan when LLM fails (analyzes prompt complexity)
   */
  private static createFallbackPlan(userPrompt: string): AutomationPlan {
    console.log('🔄 Creating dynamic fallback plan for:', userPrompt);
    
    const prompt = userPrompt.toLowerCase();
    const apps: string[] = [];
    const missingInputs: MissingInput[] = [];
    const steps: AutomationStep[] = [];

    // DYNAMIC APP DETECTION
    if (prompt.includes('email') || prompt.includes('gmail')) apps.push('gmail');
    if (prompt.includes('sheet') || prompt.includes('spreadsheet')) apps.push('sheets');
    if (prompt.includes('slack')) apps.push('slack');
    if (prompt.includes('jira')) apps.push('jira');
    if (prompt.includes('salesforce') || prompt.includes('crm')) apps.push('salesforce');
    if (prompt.includes('docusign') || prompt.includes('contract') || prompt.includes('signature')) apps.push('docusign');
    if (prompt.includes('notion')) apps.push('notion');
    if (prompt.includes('calendly') || prompt.includes('calendar') || prompt.includes('meeting')) apps.push('calendly');
    if (prompt.includes('mailchimp') || prompt.includes('email marketing')) apps.push('mailchimp');
    if (prompt.includes('quickbooks') || prompt.includes('accounting') || prompt.includes('invoice')) apps.push('quickbooks');
    if (prompt.includes('trello')) apps.push('trello');
    if (prompt.includes('asana')) apps.push('asana');
    if (prompt.includes('hubspot')) apps.push('hubspot');
    if (prompt.includes('stripe') || prompt.includes('payment')) apps.push('stripe');
    if (prompt.includes('shopify') || prompt.includes('ecommerce')) apps.push('shopify');

    // Default to gmail+sheets if no apps detected
    if (apps.length === 0) {
      apps.push('gmail', 'sheets');
    }

    console.log('🔍 Detected apps from prompt:', apps);

    // DYNAMIC STEP GENERATION based on detected apps
    apps.forEach((app, index) => {
      switch (app) {
        case 'gmail':
          steps.push({
            app: 'gmail',
            operation: 'search_emails',
            description: 'Search and filter emails',
            required_inputs: ['search_query', 'max_results'],
            missing_inputs: ['search_query']
          });
          missingInputs.push({
            id: 'search_query',
            question: 'What email search criteria should we use to find the right emails?',
            type: 'text',
            placeholder: 'from:vendor.com OR subject:invoice OR has:attachment',
            required: true,
            category: 'trigger',
            helpText: 'Use Gmail search syntax to filter emails precisely'
          });
          break;

        case 'sheets':
          steps.push({
            app: 'sheets',
            operation: 'append_row',
            description: 'Log data to spreadsheet',
            required_inputs: ['spreadsheet_url', 'sheet_name', 'column_mapping'],
            missing_inputs: ['spreadsheet_url', 'sheet_name']
          });
          missingInputs.push(
            {
              id: 'spreadsheet_url',
              question: 'What is the EXACT Google Sheets URL where data should be logged?',
              type: 'url',
              placeholder: 'https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit',
              required: true,
              category: 'data',
              helpText: 'Copy the full URL from your Google Sheets browser tab'
            },
            {
              id: 'sheet_name',
              question: 'Which sheet tab should we use for logging data?',
              type: 'text',
              placeholder: 'Sheet1',
              required: true,
              category: 'data'
            }
          );
          break;

        case 'slack':
          steps.push({
            app: 'slack',
            operation: 'send_message',
            description: 'Send Slack notification',
            required_inputs: ['channel', 'message_template'],
            missing_inputs: ['channel', 'message_template']
          });
          missingInputs.push(
            {
              id: 'slack_channel',
              question: 'Which Slack channel should receive notifications?',
              type: 'text',
              placeholder: '#general',
              required: true,
              category: 'action'
            },
            {
              id: 'slack_message_template',
              question: 'What message should be sent to Slack?',
              type: 'textarea',
              placeholder: 'New email received from {{sender}} with subject: {{subject}}',
              required: true,
              category: 'action'
            }
          );
          break;

        case 'jira':
          steps.push({
            app: 'jira',
            operation: 'create_ticket',
            description: 'Create Jira ticket',
            required_inputs: ['project_key', 'issue_type', 'summary_template'],
            missing_inputs: ['project_key', 'issue_type', 'summary_template']
          });
          missingInputs.push(
            {
              id: 'jira_project_key',
              question: 'What is your Jira project key?',
              type: 'text',
              placeholder: 'PROJ',
              required: true,
              category: 'action'
            },
            {
              id: 'jira_issue_type',
              question: 'What type of Jira issue should be created?',
              type: 'select',
              options: ['Task', 'Bug', 'Story', 'Epic'],
              required: true,
              category: 'action'
            },
            {
              id: 'jira_summary_template',
              question: 'What should be the Jira ticket summary?',
              type: 'text',
              placeholder: 'New customer onboarding: {{customer_name}}',
              required: true,
              category: 'action'
            }
          );
          break;

        case 'salesforce':
          steps.push({
            app: 'salesforce',
            operation: 'create_lead',
            description: 'Create Salesforce lead',
            required_inputs: ['lead_source', 'assignment_rules'],
            missing_inputs: ['lead_source', 'assignment_rules']
          });
          missingInputs.push(
            {
              id: 'salesforce_lead_source',
              question: 'What lead source should be assigned in Salesforce?',
              type: 'text',
              placeholder: 'Website',
              required: true,
              category: 'action'
            },
            {
              id: 'salesforce_assignment_rules',
              question: 'Should leads be auto-assigned to specific sales reps?',
              type: 'select',
              options: ['Auto-assign by territory', 'Assign to specific rep', 'Round-robin assignment', 'No auto-assignment'],
              required: true,
              category: 'action'
            }
          );
          break;

        case 'docusign':
          missingInputs.push(
            {
              id: 'docusign_template_id',
              question: 'What DocuSign template should be used for contracts?',
              type: 'text',
              placeholder: 'template_123456',
              required: true,
              category: 'action'
            },
            {
              id: 'docusign_signer_email',
              question: 'What email field contains the signer\'s email address?',
              type: 'text',
              placeholder: '{{customer_email}}',
              required: true,
              category: 'action'
            }
          );
          break;

        case 'notion':
          missingInputs.push(
            {
              id: 'notion_database_id',
              question: 'What is your Notion database ID?',
              type: 'text',
              placeholder: '12345678-1234-1234-1234-123456789012',
              required: true,
              category: 'action',
              helpText: 'Find this in your Notion database URL'
            },
            {
              id: 'notion_page_template',
              question: 'What properties should be set on the Notion page?',
              type: 'textarea',
              placeholder: 'Title: {{customer_name}}\nStatus: Onboarding\nOwner: {{sales_rep}}',
              required: true,
              category: 'action'
            }
          );
          break;

        case 'calendly':
          missingInputs.push(
            {
              id: 'calendly_event_type',
              question: 'What Calendly event type should be used?',
              type: 'text',
              placeholder: 'onboarding-call',
              required: true,
              category: 'action'
            }
          );
          break;

        case 'mailchimp':
          missingInputs.push(
            {
              id: 'mailchimp_list_id',
              question: 'What Mailchimp list should customers be added to?',
              type: 'text',
              placeholder: 'list_12345',
              required: true,
              category: 'action'
            },
            {
              id: 'mailchimp_tags',
              question: 'What tags should be applied to new subscribers?',
              type: 'text',
              placeholder: 'new-customer,onboarding',
              required: false,
              category: 'action'
            }
          );
          break;

        case 'quickbooks':
          missingInputs.push(
            {
              id: 'quickbooks_customer_type',
              question: 'What QuickBooks customer type should be assigned?',
              type: 'select',
              options: ['Standard', 'Premium', 'Enterprise'],
              required: true,
              category: 'action'
            }
          );
          break;
      }
    });

    // Add trigger questions
    missingInputs.unshift({
      id: 'trigger_frequency',
      question: 'How often should this automation check for new triggers?',
      type: 'select',
      options: ['Every 5 minutes', 'Every 15 minutes', 'Every 30 minutes', 'Every hour', 'Every 6 hours', 'Daily'],
      required: true,
      category: 'trigger'
    });

    console.log(`🎯 Generated dynamic fallback plan: ${apps.length} apps, ${missingInputs.length} questions`);

    return {
      apps,
      trigger: {
        type: 'time',
        app: 'time',
        operation: 'schedule',
        description: 'Time-based automation trigger',
        required_inputs: ['frequency'],
        missing_inputs: ['frequency']
      },
      steps,
      missing_inputs: missingInputs,
      workflow_name: this.generateWorkflowName(apps, userPrompt),
      description: userPrompt,
      complexity: this.assessComplexity(apps.length, missingInputs.length),
      estimated_setup_time: this.estimateSetupTime(apps.length, missingInputs.length),
      business_value: this.estimateBusinessValue(apps, userPrompt)
    };
  }

  private static generateWorkflowName(apps: string[], prompt: string): string {
    const appNames = apps.map(app => app.charAt(0).toUpperCase() + app.slice(1)).join(' + ');
    return `${appNames} Automation`;
  }

  private static assessComplexity(appCount: number, questionCount: number): 'simple' | 'medium' | 'complex' {
    if (appCount <= 2 && questionCount <= 4) return 'simple';
    if (appCount <= 4 && questionCount <= 8) return 'medium';
    return 'complex';
  }

  private static estimateSetupTime(appCount: number, questionCount: number): string {
    const baseTime = 10; // 10 minutes base
    const appTime = appCount * 5; // 5 minutes per app
    const configTime = questionCount * 2; // 2 minutes per configuration
    const totalMinutes = baseTime + appTime + configTime;
    
    if (totalMinutes < 30) return `${totalMinutes} minutes`;
    if (totalMinutes < 120) return `${Math.round(totalMinutes / 15) * 15} minutes`;
    return `${Math.round(totalMinutes / 60)} hours`;
  }

  private static estimateBusinessValue(apps: string[], prompt: string): string {
    const appCount = apps.length;
    const hasHighValueApps = apps.some(app => ['salesforce', 'hubspot', 'quickbooks', 'jira'].includes(app));
    
    if (hasHighValueApps && appCount >= 4) {
      return 'High-value enterprise automation - save 10+ hours per week';
    } else if (appCount >= 3) {
      return 'Multi-app automation - save 5-8 hours per week';
    } else {
      return 'Simple automation - save 2-3 hours per week';
    }
  }

  /**
   * ChatGPT Enhancement: Create fallback plan based on mode
   */
  private static createFallbackPlan(userPrompt: string, mode: PlannerMode): AutomationPlan {
    console.log('🔄 Creating fallback plan for mode:', mode);
    
    const apps = mode === "gas-only" ? ["gmail", "sheets"] : ["gmail", "sheets", "slack"];
    
    return {
      apps,
      trigger: { type: 'time', app: 'time', operation: 'schedule' },
      steps: [
        {
          app: 'gmail',
          operation: 'search_emails',
          required_inputs: ['search_query'],
          missing_inputs: ['search_query'],
          description: 'Search for emails'
        },
        {
          app: 'sheets',
          operation: 'append_row',
          required_inputs: ['spreadsheet_id', 'sheet_name', 'values'],
          missing_inputs: ['spreadsheet_id', 'sheet_name'],
          description: 'Log data to spreadsheet'
        }
      ],
      missing_inputs: [
        { id: 'search_query', question: 'What emails should we search for?', type: 'text' },
        { id: 'spreadsheet_id', question: 'What Google Sheet should we use?', type: 'url' },
        { id: 'sheet_name', question: 'Which sheet tab?', type: 'text' }
      ],
      workflow_name: 'Email to Sheets Automation',
      description: 'Monitor emails and log them to a spreadsheet',
      complexity: 'simple',
      business_value: 'Save time on manual email processing',
      follow_up_questions: [
        { id: 'search_query', question: 'What emails should we search for?', category: 'data', expected_format: 'free' },
        { id: 'spreadsheet_id', question: 'What Google Sheet should we use?', category: 'data', expected_format: 'url' },
        { id: 'sheet_name', question: 'Which sheet tab?', category: 'data', expected_format: 'free' }
      ]
    };
  }

  /**
   * Validate and enhance LLM-generated plan
   */
  private static validateAndEnhancePlan(plan: AutomationPlan, originalPrompt: string): AutomationPlan {
    // Ensure required fields exist
    if (!plan.apps || !Array.isArray(plan.apps)) {
      plan.apps = ['gmail', 'sheets'];
    }

    if (!plan.workflow_name) {
      plan.workflow_name = 'Custom Automation';
    }

    if (!plan.description) {
      plan.description = originalPrompt;
    }

    // Validate missing inputs have proper structure
    if (!plan.missing_inputs || !Array.isArray(plan.missing_inputs)) {
      plan.missing_inputs = [];
    }

    // Ensure all missing inputs have required fields
    plan.missing_inputs = plan.missing_inputs.map(input => ({
      id: input.id || 'unknown',
      question: input.question || 'Please provide this information',
      type: input.type || 'text',
      required: input.required !== false,
      category: input.category || 'config',
      ...input
    }));

    // Add spreadsheet URL validation if sheets app is used
    if (plan.apps.includes('sheets') || plan.apps.includes('google-sheets')) {
      const hasSpreadsheetUrl = plan.missing_inputs.some(input => 
        input.id.includes('spreadsheet') || input.id.includes('sheet')
      );
      
      if (!hasSpreadsheetUrl) {
        plan.missing_inputs.push({
          id: 'spreadsheet_url',
          question: 'What is the EXACT Google Sheets URL where data should be stored?',
          type: 'url',
          placeholder: 'https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit',
          required: true,
          category: 'data',
          helpText: 'Copy the full URL from your Google Sheets browser tab. This is required for all sheet operations.'
        });
      }
    }

    return plan;
  }

  /**
   * Check if user's prompt contains enough information to skip questions
   */
  static async isPromptComplete(userPrompt: string): Promise<boolean> {
    const completenessPrompt = `Analyze this automation request and determine if it contains enough information to build the automation without asking follow-up questions.

USER REQUEST: "${userPrompt}"

Check if the request includes:
1. Clear trigger specification (when/how often)
2. Specific data sources (spreadsheet URLs, email criteria, etc.)
3. Clear actions to perform
4. All necessary configuration details

RESPOND WITH ONLY: true or false

If true: The request is complete and ready to build
If false: Follow-up questions are needed`;

    try {
      const response = await MultiAIService.generateText({
        model: 'gemini-2.0-flash-exp',
        prompt: completenessPrompt
      });

      return response.trim().toLowerCase() === 'true';
    } catch (error) {
      console.error('❌ Completeness check failed:', error);
      return false; // Default to asking questions
    }
  }
}