/**
 * CRITICAL FIX: AI Automation Planner Routes
 * 
 * Replaces static Q&A with intelligent automation planning
 */

import { Router } from 'express';
import { AutomationPlannerService } from '../services/AutomationPlannerService.js';

const router = Router();

// CRITICAL: Plan automation workflow (replaces static Q&A)
router.post('/plan-workflow', async (req, res) => {
  try {
    const { prompt, userId } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }

    console.log('🧠 Planning automation for prompt:', prompt);

    // First, check if prompt is complete enough
    const isComplete = await AutomationPlannerService.isPromptComplete(prompt);
    
    if (isComplete) {
      console.log('✅ Prompt is complete, proceeding directly to workflow generation');
      return res.json({
        success: true,
        isComplete: true,
        needsQuestions: false,
        message: 'Prompt contains sufficient information to build automation',
        directBuild: true
      });
    }

    // Generate comprehensive automation plan
    const plan = await AutomationPlannerService.planAutomation(prompt);

    console.log('📋 Generated automation plan:', {
      apps: plan.apps,
      missingInputs: plan.missing_inputs.length,
      complexity: plan.complexity
    });

    // If no missing inputs, we can build directly
    if (plan.missing_inputs.length === 0) {
      return res.json({
        success: true,
        isComplete: true,
        needsQuestions: false,
        plan,
        message: 'Automation plan is complete, ready to build'
      });
    }

    // Return the missing inputs as dynamic questions
    res.json({
      success: true,
      isComplete: false,
      needsQuestions: true,
      plan,
      questions: plan.missing_inputs,
      message: `Need ${plan.missing_inputs.length} additional details to complete your ${plan.workflow_name}`
    });

  } catch (error) {
    console.error('❌ Automation planning error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to plan automation',
      fallbackToManual: true
    });
  }
});

// Refine plan after user provides answers
router.post('/refine-plan', async (req, res) => {
  try {
    const { plan, answers } = req.body;

    if (!plan || !answers) {
      return res.status(400).json({
        success: false,
        error: 'Both plan and answers are required'
      });
    }

    console.log('🔄 Refining automation plan with user answers');

    const refinement = await AutomationPlannerService.refinePlan(plan, answers);

    if (refinement.isComplete) {
      // Generate final workflow graph
      const workflowGraph = AutomationPlannerService.planToWorkflowGraph(
        refinement.updatedPlan || plan, 
        answers
      );

      return res.json({
        success: true,
        isComplete: true,
        workflowGraph,
        plan: refinement.updatedPlan || plan,
        message: 'Automation plan is complete and ready to build'
      });
    } else {
      // Still need more information
      return res.json({
        success: true,
        isComplete: false,
        needsMoreQuestions: true,
        additionalQuestions: refinement.additionalQuestions,
        updatedPlan: refinement.updatedPlan,
        message: `Need ${refinement.additionalQuestions?.length || 0} more details`
      });
    }

  } catch (error) {
    console.error('❌ Plan refinement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refine automation plan'
    });
  }
});

// Get planning capabilities and supported apps
router.get('/capabilities', (req, res) => {
  try {
    const capabilities = {
      supportedApps: [
        // Core Google Workspace
        'gmail', 'sheets', 'calendar', 'drive', 'docs', 'slides', 'forms',
        
        // CRM & Sales
        'salesforce', 'hubspot', 'pipedrive', 'zoho-crm', 'dynamics365',
        
        // Communication
        'slack', 'microsoft-teams', 'discord', 'telegram', 'whatsapp', 'twilio', 'zoom',
        
        // E-commerce & Payment
        'shopify', 'stripe', 'paypal', 'square', 'amazon', 'ebay', 'woocommerce',
        
        // Project Management
        'jira', 'asana', 'trello', 'monday', 'clickup', 'basecamp', 'notion',
        
        // Marketing
        'mailchimp', 'klaviyo', 'sendgrid', 'activecampaign', 'convertkit',
        
        // And 119 more apps...
      ],
      
      triggerTypes: [
        { type: 'time', description: 'Schedule-based triggers' },
        { type: 'webhook', description: 'External system events' },
        { type: 'email', description: 'Email-based triggers' },
        { type: 'spreadsheet', description: 'Spreadsheet change events' },
        { type: 'form', description: 'Form submission events' }
      ],
      
      operationTypes: [
        { type: 'search', description: 'Search and filter data' },
        { type: 'create', description: 'Create new records' },
        { type: 'update', description: 'Update existing data' },
        { type: 'send', description: 'Send messages or notifications' },
        { type: 'process', description: 'Process and transform data' }
      ],

      inputTypes: [
        { type: 'text', description: 'Short text input' },
        { type: 'textarea', description: 'Long text input' },
        { type: 'email', description: 'Email address with validation' },
        { type: 'url', description: 'URL with validation' },
        { type: 'select', description: 'Single choice from options' },
        { type: 'number', description: 'Numeric input with constraints' }
      ],

      planningCapabilities: [
        'Dynamic requirement analysis',
        'Missing input detection',
        'Multi-app workflow planning',
        'Business value estimation',
        'Complexity assessment',
        'Setup time estimation'
      ]
    };

    res.json({
      success: true,
      capabilities,
      totalApps: 149,
      plannerVersion: '2.0'
    });
  } catch (error) {
    console.error('Error fetching planning capabilities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch planning capabilities'
    });
  }
});

export default router;