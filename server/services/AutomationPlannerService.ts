/**
 * CRITICAL FIX: LLM as Intelligent Automation Planner
 * 
 * Replaces static Q&A with dynamic automation planning where the LLM
 * analyzes the user's request and figures out exactly what's needed.
 */

import { MultiAIService } from '../aiModels.js';

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
   * CRITICAL: Analyze user prompt and create comprehensive automation plan
   */
  static async planAutomation(userPrompt: string): Promise<AutomationPlan> {
    console.log('🧠 LLM Automation Planner analyzing prompt:', userPrompt);

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
        triggerType: plan.trigger.type,
        stepsCount: plan.steps.length,
        missingInputsCount: plan.missing_inputs.length
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
      type: `trigger.${plan.trigger.app}`,
      position: { x: 100, y: 200 },
      data: {
        label: plan.trigger.description,
        app: plan.trigger.app,
        operation: plan.trigger.operation,
        config: this.fillConfigFromAnswers(plan.trigger.required_inputs, userAnswers)
      },
      app: plan.trigger.app,
      op: `trigger.${plan.trigger.app}:${plan.trigger.operation}`,
      params: this.fillConfigFromAnswers(plan.trigger.required_inputs, userAnswers)
    });

    // Create step nodes
    let previousNodeId = triggerId;
    plan.steps.forEach((step, index) => {
      const stepId = `step_${index + 1}`;
      
      nodes.push({
        id: stepId,
        type: `action.${step.app}`,
        position: { x: 300 + (index * 200), y: 200 },
        data: {
          label: step.description,
          app: step.app,
          operation: step.operation,
          config: this.fillConfigFromAnswers(step.required_inputs, userAnswers)
        },
        app: step.app,
        op: `action.${step.app}:${step.operation}`,
        params: this.fillConfigFromAnswers(step.required_inputs, userAnswers)
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
   * Create fallback plan when LLM fails
   */
  private static createFallbackPlan(userPrompt: string): AutomationPlan {
    return {
      apps: ['gmail', 'sheets'],
      trigger: {
        type: 'time',
        app: 'time',
        operation: 'schedule', 
        description: 'Time-based trigger',
        required_inputs: ['frequency'],
        missing_inputs: ['frequency']
      },
      steps: [
        {
          app: 'gmail',
          operation: 'search_emails',
          description: 'Search emails',
          required_inputs: ['search_query'],
          missing_inputs: ['search_query']
        },
        {
          app: 'sheets',
          operation: 'append_row',
          description: 'Log to spreadsheet',
          required_inputs: ['spreadsheet_url'],
          missing_inputs: ['spreadsheet_url']
        }
      ],
      missing_inputs: [
        {
          id: 'frequency',
          question: 'How often should this automation run?',
          type: 'select',
          options: ['Every 5 minutes', 'Every 15 minutes', 'Every hour', 'Daily'],
          required: true,
          category: 'trigger'
        },
        {
          id: 'search_query',
          question: 'What email search criteria should we use?',
          type: 'text',
          placeholder: 'from:example.com OR subject:invoice',
          required: true,
          category: 'trigger'
        },
        {
          id: 'spreadsheet_url',
          question: 'What is the EXACT Google Sheets URL?',
          type: 'url',
          placeholder: 'https://docs.google.com/spreadsheets/d/...',
          required: true,
          category: 'data',
          helpText: 'Copy the full URL from your Google Sheets browser tab'
        }
      ],
      workflow_name: 'Custom Automation',
      description: userPrompt,
      complexity: 'medium',
      estimated_setup_time: '15-20 minutes',
      business_value: 'Automate manual processes and save time'
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