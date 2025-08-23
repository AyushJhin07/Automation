// WORKFLOW API - Complete Integration of ChatGPT Architecture
// Integrates Orchestrator, Compiler, and Deployer services

import { Request, Response } from 'express';
import { 
  NodeGraph, 
  ClarifyRequest, 
  PlanRequest, 
  FixRequest, 
  CodegenRequest,
  DeployRequest 
} from '../shared/nodeGraphSchema';
import { WorkflowOrchestrator } from './orchestrator';
import { WorkflowCompiler } from './workflowCompiler';
import { simpleGraphValidator } from './core/SimpleGraphValidator';

export class WorkflowAPI {
  private orchestrator: WorkflowOrchestrator;
  private compiler: WorkflowCompiler;

  constructor() {
    this.orchestrator = new WorkflowOrchestrator();
    this.compiler = new WorkflowCompiler();
  }

  // Get system capabilities
  public getCapabilities = async (req: Request, res: Response) => {
    try {
      const capabilities = this.orchestrator.getCapabilities();
      
      res.json({
        success: true,
        capabilities,
        totalNodes: capabilities.nodes.length,
        supportedApps: Object.keys(capabilities.schemasByType).length
      });
    } catch (error) {
      console.error('Get capabilities error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system capabilities'
      });
    }
  };

  // Step 1: Clarify user intent
  public clarifyIntent = async (req: Request, res: Response) => {
    try {
      const request: ClarifyRequest = req.body;
      
      if (!request.prompt) {
        return res.status(400).json({
          success: false,
          error: 'Prompt is required'
        });
      }

      console.log('🤔 Clarifying intent for:', request.prompt);
      
      const response = await this.orchestrator.clarifyIntent(request);
      
      res.json({
        success: true,
        ...response,
        hasQuestions: response.questions.length > 0
      });
    } catch (error) {
      console.error('Clarify intent error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clarify intent: ' + (error as Error).message
      });
    }
  };

  // Step 2: Plan workflow
  public planWorkflow = async (req: Request, res: Response) => {
    try {
      const request: PlanRequest = req.body;
      
      if (!request.prompt) {
        return res.status(400).json({
          success: false,
          error: 'Prompt is required'
        });
      }

      // Get capabilities if not provided
      if (!request.capabilities) {
        request.capabilities = this.orchestrator.getCapabilities();
      }

      console.log('📋 Planning workflow for:', request.prompt);
      
      const response = await this.orchestrator.planWorkflow(request);
      
      // Validate the generated graph
      const validationResult = simpleGraphValidator.validate(response.graph);
      const errors = validationResult.errors;
      const safetyWarnings = validationResult.securityWarnings || [];
      
      res.json({
        success: true,
        ...response,
        validation: {
          errors: errors.filter(e => e.severity === 'error'),
          warnings: [...errors.filter(e => e.severity === 'warn'), ...safetyWarnings],
          isValid: errors.filter(e => e.severity === 'error').length === 0
        },
        stats: {
          nodeCount: response.graph.nodes.length,
          edgeCount: response.graph.edges.length,
          triggerCount: response.graph.nodes.filter(n => n.type.startsWith('trigger.')).length,
          actionCount: response.graph.nodes.filter(n => n.type.startsWith('action.')).length,
          transformCount: response.graph.nodes.filter(n => n.type.startsWith('transform.')).length
        }
      });
    } catch (error) {
      console.error('Plan workflow error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to plan workflow: ' + (error as Error).message
      });
    }
  };

  // Step 3: Fix workflow errors
  public fixWorkflow = async (req: Request, res: Response) => {
    try {
      const request: FixRequest = req.body;
      
      if (!request.graph) {
        return res.status(400).json({
          success: false,
          error: 'Graph is required'
        });
      }

      if (!request.errors || request.errors.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Errors array is required'
        });
      }

      console.log('🔧 Fixing workflow errors:', request.errors.length);
      
      const response = await this.orchestrator.fixWorkflow(request);
      
      // Re-validate the fixed graph
      const validationResult = simpleGraphValidator.validate(response.graph);
      const errors = validationResult.errors;
      
      res.json({
        success: true,
        graph: response.graph,
        validation: {
          errors: errors.filter(e => e.severity === 'error'),
          warnings: errors.filter(e => e.severity === 'warn'),
          isValid: errors.filter(e => e.severity === 'error').length === 0,
          fixedErrorCount: request.errors.length - errors.filter(e => e.severity === 'error').length
        }
      });
    } catch (error) {
      console.error('Fix workflow error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fix workflow: ' + (error as Error).message
      });
    }
  };

  // Step 4: Generate Google Apps Script code
  public generateCode = async (req: Request, res: Response) => {
    try {
      const request: CodegenRequest = req.body;
      
      if (!request.graph) {
        return res.status(400).json({
          success: false,
          error: 'Graph is required'
        });
      }

      // Validate graph before compilation
      const validationResult = simpleGraphValidator.validate(request.graph);
      const errors = validationResult.errors;
      const criticalErrors = errors.filter(e => e.severity === 'error');
      
      if (criticalErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot compile graph with validation errors',
          errors: criticalErrors
        });
      }

      console.log('🔨 Compiling workflow to Google Apps Script:', request.graph.name);
      
      const response = await this.compiler.compileWorkflow(request.graph);
      
      res.json({
        success: true,
        ...response,
        stats: {
          fileCount: response.files.length,
          totalLines: response.files.reduce((sum, file) => sum + file.content.split('\n').length, 0),
          mainFile: response.entry,
          hasWebhooks: response.files.some(f => f.content.includes('doPost')),
          hasTimeTriggers: response.files.some(f => f.content.includes('timeBased')),
          requiredScopes: request.graph.scopes.length,
          secrets: request.graph.secrets
        }
      });
    } catch (error) {
      console.error('Generate code error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate code: ' + (error as Error).message
      });
    }
  };

  // Step 5: Deploy to Google Apps Script (placeholder)
  public deployWorkflow = async (req: Request, res: Response) => {
    try {
      const request: DeployRequest = req.body;
      
      if (!request.files || request.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Files are required for deployment'
        });
      }

      console.log('🚀 Deploying workflow to Google Apps Script...');
      
      // TODO: Implement actual deployment using clasp or Apps Script API
      // For now, return deployment instructions
      
      const deploymentId = `deploy_${Date.now()}`;
      const projectUrl = `https://script.google.com/home/projects/${deploymentId}`;
      
      res.json({
        success: true,
        deploymentId,
        projectUrl,
        webAppUrl: request.files.some(f => f.content.includes('doPost')) 
          ? `https://script.google.com/macros/s/${deploymentId}/exec`
          : undefined,
        instructions: {
          steps: [
            'Create a new Google Apps Script project',
            'Copy and paste the generated code files',
            'Update the appsscript.json manifest',
            'Set required script properties (secrets)',
            'Run trigger setup functions',
            'Deploy as web app if webhooks are used',
            'Test the workflow'
          ],
          requiredSecrets: request.scopes || [],
          estimatedSetupTime: '10-15 minutes'
        }
      });
    } catch (error) {
      console.error('Deploy workflow error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to deploy workflow: ' + (error as Error).message
      });
    }
  };

  // Complete workflow generation (combines all steps)
  public generateCompleteWorkflow = async (req: Request, res: Response) => {
    try {
      const { prompt, answers, skipQuestions = false } = req.body;
      
      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: 'Prompt is required'
        });
      }

      console.log('🎯 Generating complete workflow for:', prompt);
      
      let workflow: NodeGraph;
      let questions: any[] = [];
      let rationale = '';

      // Step 1: Check if we need clarification
      if (!skipQuestions && !answers) {
        const clarifyResponse = await this.orchestrator.clarifyIntent({ prompt });
        
        if (clarifyResponse.questions.length > 0) {
          return res.json({
            success: true,
            needsQuestions: true,
            questions: clarifyResponse.questions,
            guessedGraph: clarifyResponse.guessedGraph
          });
        }
        
        workflow = clarifyResponse.guessedGraph!;
      } else {
        // Step 2: Plan the workflow
        const capabilities = this.orchestrator.getCapabilities();
        const planResponse = await this.orchestrator.planWorkflow({
          prompt,
          answers,
          capabilities
        });
        
        workflow = planResponse.graph;
        rationale = planResponse.rationale;
      }

      // Step 3: Validate and fix if needed
      const validationResult = simpleGraphValidator.validate(workflow);
      const errors = validationResult.errors;
      const criticalErrors = errors.filter(e => e.severity === 'error');
      
      if (criticalErrors.length > 0) {
        console.log('🔧 Auto-fixing workflow errors...');
        const fixResponse = await this.orchestrator.fixWorkflow({
          graph: workflow,
          errors: criticalErrors
        });
        workflow = fixResponse.graph;
      }

      // Step 4: Generate code
      const codeResponse = await this.compiler.compileWorkflow(workflow);
      
      // Step 5: Prepare deployment info
      const deploymentInfo = {
        instructions: [
          '1. Create new Google Apps Script project',
          '2. Replace Code.gs with generated code',
          '3. Add helper files to project',
          '4. Update appsscript.json manifest',
          '5. Set script properties (secrets)',
          '6. Run trigger setup functions',
          '7. Test the workflow'
        ],
        requiredSecrets: workflow.secrets,
        requiredScopes: workflow.scopes
      };

      res.json({
        success: true,
        workflow: {
          graph: workflow,
          rationale,
          validation: {
            errors: errors.filter(e => e.severity === 'error'),
            warnings: errors.filter(e => e.severity === 'warn'),
            isValid: errors.filter(e => e.severity === 'error').length === 0
          }
        },
        code: {
          files: codeResponse.files,
          entry: codeResponse.entry,
          stats: {
            fileCount: codeResponse.files.length,
            totalLines: codeResponse.files.reduce((sum, file) => sum + file.content.split('\n').length, 0)
          }
        },
        deployment: deploymentInfo,
        estimatedValue: workflow.metadata?.estimatedValue || '$500/month time savings',
        complexity: workflow.metadata?.complexity || 'Medium'
      });

    } catch (error) {
      console.error('Generate complete workflow error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate complete workflow: ' + (error as Error).message
      });
    }
  };

  // Validate workflow graph
  public validateWorkflow = async (req: Request, res: Response) => {
    try {
      const { graph }: { graph: NodeGraph } = req.body;
      
      if (!graph) {
        return res.status(400).json({
          success: false,
          error: 'Graph is required'
        });
      }

      const validationResult = simpleGraphValidator.validate(graph);
      const errors = validationResult.errors;
      const safetyWarnings = validationResult.securityWarnings || [];
      
      res.json({
        success: true,
        validation: {
          errors: errors.filter(e => e.severity === 'error'),
          warnings: [...errors.filter(e => e.severity === 'warn'), ...safetyWarnings],
          isValid: errors.filter(e => e.severity === 'error').length === 0,
          summary: {
            totalIssues: errors.length + safetyWarnings.length,
            criticalErrors: errors.filter(e => e.severity === 'error').length,
            warnings: errors.filter(e => e.severity === 'warn').length + safetyWarnings.length
          }
        }
      });
    } catch (error) {
      console.error('Validate workflow error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate workflow: ' + (error as Error).message
      });
    }
  };

  // Get workflow templates/examples
  public getWorkflowTemplates = async (req: Request, res: Response) => {
    try {
      const templates = [
        {
          id: 'email-to-sheets',
          name: 'Email to Sheets Logger',
          description: 'Log incoming emails to Google Sheets',
          category: 'Gmail + Sheets',
          complexity: 'Simple',
          estimatedValue: '$200/month',
          prompt: 'Monitor my Gmail for emails with subject containing "invoice" and log them to a Google Sheet with sender, subject, and date'
        },
        {
          id: 'calendar-reminder',
          name: 'Meeting Reminder System',
          description: 'Send email reminders before calendar events',
          category: 'Calendar + Gmail',
          complexity: 'Medium',
          estimatedValue: '$300/month',
          prompt: 'Check my Google Calendar daily and send email reminders 1 hour before each meeting to all attendees'
        },
        {
          id: 'expense-tracker',
          name: 'Expense Tracking Automation',
          description: 'Track expenses from email receipts',
          category: 'Gmail + Sheets',
          complexity: 'Complex',
          estimatedValue: '$500/month',
          prompt: 'Monitor Gmail for receipt emails, extract expense amounts and categories, then log to expense tracking spreadsheet'
        },
        {
          id: 'lead-processor',
          name: 'Lead Processing Workflow',
          description: 'Process new leads from form submissions',
          category: 'Webhooks + CRM',
          complexity: 'Complex',
          estimatedValue: '$1000/month',
          prompt: 'Receive webhook from contact form, validate lead information, create Salesforce contact, and send welcome email sequence'
        },
        {
          id: 'report-generator',
          name: 'Automated Report Generation',
          description: 'Generate and email weekly reports',
          category: 'Sheets + Gmail',
          complexity: 'Medium',
          estimatedValue: '$400/month',
          prompt: 'Every Monday, compile data from multiple Google Sheets, generate summary report, and email to management team'
        }
      ];

      res.json({
        success: true,
        templates,
        categories: ['Gmail + Sheets', 'Calendar + Gmail', 'Webhooks + CRM', 'Sheets + Gmail'],
        totalTemplates: templates.length
      });
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get workflow templates'
      });
    }
  };
}