import express from 'express';

interface WorkflowGenerationRequest {
  prompt: string;
  userId: string;
}

interface GeneratedWorkflow {
  id: string;
  title: string;
  description: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  appsScriptCode: string;
  estimatedValue: string;
}

interface WorkflowNode {
  id: string;
  type: string;
  app: string;
  function: string;
  parameters: Record<string, any>;
  position: { x: number; y: number };
  icon: string; // Icon name as string for JSON serialization
  color: string;
}

interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

class AIWorkflowGenerator {
  private static async callOpenAI(prompt: string): Promise<any> {
    // TODO: Replace with actual OpenAI API call
    // For now, return structured analysis based on prompt
    
    const analysis = this.analyzePrompt(prompt);
    return analysis;
  }

  private static analyzePrompt(prompt: string): any {
    const lowerPrompt = prompt.toLowerCase();
    
    // Detect intent and required apps
    const apps = [];
    const functions = [];
    
    if (lowerPrompt.includes('email') || lowerPrompt.includes('gmail')) {
      apps.push('Gmail');
      if (lowerPrompt.includes('send')) functions.push('Send Email');
      if (lowerPrompt.includes('track') || lowerPrompt.includes('monitor')) functions.push('Search Emails');
    }
    
    if (lowerPrompt.includes('sheet') || lowerPrompt.includes('spreadsheet')) {
      apps.push('Google Sheets');
      functions.push('Append Row');
    }
    
    if (lowerPrompt.includes('calendar') || lowerPrompt.includes('schedule')) {
      apps.push('Google Calendar');
      functions.push('Create Event');
    }
    
    if (lowerPrompt.includes('drive') || lowerPrompt.includes('file')) {
      apps.push('Google Drive');
      functions.push('Upload File');
    }
    
    if (lowerPrompt.includes('report') || lowerPrompt.includes('analyze')) {
      apps.push('AI Analysis');
      functions.push('Process Data');
    }

    return {
      intent: this.extractIntent(prompt),
      requiredApps: apps,
      suggestedFunctions: functions,
      complexity: apps.length > 2 ? 'Medium' : 'Simple',
      estimatedValue: this.calculateValue(apps.length)
    };
  }

  private static extractIntent(prompt: string): string {
    if (prompt.toLowerCase().includes('track') && prompt.toLowerCase().includes('email')) {
      return 'email_tracking';
    }
    if (prompt.toLowerCase().includes('follow') && prompt.toLowerCase().includes('lead')) {
      return 'lead_followup';
    }
    if (prompt.toLowerCase().includes('organize') && prompt.toLowerCase().includes('file')) {
      return 'file_organization';
    }
    return 'custom_automation';
  }

  private static calculateValue(appCount: number): string {
    const baseValue = appCount * 400;
    return `$${baseValue.toLocaleString()}/month time savings`;
  }

  public static async generateWorkflow(prompt: string, userId: string): Promise<GeneratedWorkflow> {
    try {
      // Analyze prompt with AI (or fallback logic)
      const analysis = await this.callOpenAI(prompt);
      
      // Generate workflow based on analysis
      const workflow = this.buildWorkflowFromAnalysis(analysis, prompt);
      
      // Generate Google Apps Script code
      const appsScriptCode = this.generateAppsScriptCode(workflow);
      
      return {
        ...workflow,
        appsScriptCode,
        estimatedValue: analysis.estimatedValue
      };
      
    } catch (error) {
      console.error('Error generating workflow:', error);
      throw new Error('Failed to generate workflow');
    }
  }

  private static buildWorkflowFromAnalysis(analysis: any, originalPrompt: string): Omit<GeneratedWorkflow, 'appsScriptCode' | 'estimatedValue'> {
    const nodes: WorkflowNode[] = [];
    const connections: WorkflowConnection[] = [];
    
    // Create nodes based on detected apps
    analysis.requiredApps.forEach((app: string, index: number) => {
      const nodeId = `${app.toLowerCase().replace(' ', '-')}-${index}`;
      
      nodes.push({
        id: nodeId,
        type: app.toLowerCase().replace(' ', '-'),
        app: app,
        function: this.getFunctionForApp(app, originalPrompt),
        parameters: this.getParametersForApp(app, originalPrompt),
        position: { x: 100 + (index * 200), y: 100 + (index % 2) * 100 },
        icon: this.getIconForApp(app),
        color: this.getColorForApp(app)
      });
      
      // Create connections between consecutive nodes
      if (index > 0) {
        connections.push({
          id: `conn-${index}`,
          source: nodes[index - 1].id,
          target: nodeId
        });
      }
    });

    return {
      id: `workflow-${Date.now()}`,
      title: this.generateTitle(analysis.intent),
      description: this.generateDescription(originalPrompt),
      nodes,
      connections
    };
  }

  private static getFunctionForApp(app: string, prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    switch (app) {
      case 'Gmail':
        if (lowerPrompt.includes('send')) return 'Send Email';
        if (lowerPrompt.includes('track') || lowerPrompt.includes('monitor')) return 'Search Emails';
        return 'Process Emails';
      case 'Google Sheets':
        if (lowerPrompt.includes('read')) return 'Read Range';
        return 'Append Row';
      case 'Google Calendar':
        return 'Create Event';
      case 'Google Drive':
        if (lowerPrompt.includes('organize')) return 'Organize Files';
        return 'Upload File';
      case 'AI Analysis':
        return 'Process Data';
      default:
        return 'Process';
    }
  }

  private static getParametersForApp(app: string, prompt: string): Record<string, any> {
    switch (app) {
      case 'Gmail':
        return {
          query: 'is:unread label:important',
          fields: ['from', 'subject', 'body', 'date']
        };
      case 'Google Sheets':
        return {
          spreadsheetId: 'auto-create',
          range: 'A:Z',
          values: 'from previous step'
        };
      case 'Google Calendar':
        return {
          title: 'Auto-generated event',
          duration: 30
        };
      default:
        return {};
    }
  }

  private static getIconForApp(app: string): string {
    const iconMap: Record<string, string> = {
      'Gmail': 'Mail',
      'Google Sheets': 'Sheet',
      'Google Calendar': 'Calendar',
      'Google Drive': 'FolderOpen',
      'AI Analysis': 'Brain'
    };
    return iconMap[app] || 'Zap';
  }

  private static getColorForApp(app: string): string {
    const colorMap: Record<string, string> = {
      'Gmail': '#EA4335',
      'Google Sheets': '#0F9D58',
      'Google Calendar': '#4285F4',
      'Google Drive': '#4285F4',
      'AI Analysis': '#8B5CF6'
    };
    return colorMap[app] || '#6366f1';
  }

  private static generateTitle(intent: string): string {
    const titleMap: Record<string, string> = {
      'email_tracking': 'Email Tracking Automation',
      'lead_followup': 'Lead Follow-up System',
      'file_organization': 'File Organization Automation',
      'custom_automation': 'Custom Workflow Automation'
    };
    return titleMap[intent] || 'AI-Generated Automation';
  }

  private static generateDescription(prompt: string): string {
    return `Automatically ${prompt.toLowerCase().replace(/^i want to |^i need to /, '')}`;
  }

  private static generateAppsScriptCode(workflow: Omit<GeneratedWorkflow, 'appsScriptCode' | 'estimatedValue'>): string {
    const hasGmail = workflow.nodes.some(n => n.app === 'Gmail');
    const hasSheets = workflow.nodes.some(n => n.app === 'Google Sheets');
    const hasCalendar = workflow.nodes.some(n => n.app === 'Google Calendar');
    
    let code = `/**
 * ${workflow.title}
 * ${workflow.description}
 * Generated by AI Workflow Builder
 */

function main() {
  try {
    console.log('Starting ${workflow.title}...');
`;

    if (hasGmail) {
      code += `
    // Gmail processing
    const emails = GmailApp.search('is:unread label:important');
    console.log(\`Found \${emails.length} emails to process\`);
    
    emails.forEach(thread => {
      const message = thread.getMessages()[0];
      const emailData = {
        from: message.getFrom(),
        subject: message.getSubject(),
        body: message.getPlainBody(),
        date: message.getDate()
      };
      
      processEmailData(emailData);
    });
`;
    }

    if (hasSheets) {
      code += `
    // Google Sheets processing
    const spreadsheet = SpreadsheetApp.openById('YOUR_SPREADSHEET_ID');
    const sheet = spreadsheet.getActiveSheet();
    
    function processEmailData(emailData) {
      // Add email data to spreadsheet
      sheet.appendRow([
        new Date(),
        emailData.from,
        emailData.subject,
        emailData.body
      ]);
      console.log('Added email data to spreadsheet');
    }
`;
    }

    if (hasCalendar) {
      code += `
    // Google Calendar processing
    function createFollowUpEvent(emailData) {
      const calendar = CalendarApp.getDefaultCalendar();
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 3);
      
      calendar.createEvent(
        'Follow up: ' + emailData.subject,
        followUpDate,
        new Date(followUpDate.getTime() + 30 * 60000), // 30 minutes
        {
          description: 'Follow up on email from: ' + emailData.from
        }
      );
    }
`;
    }

    code += `
    console.log('${workflow.title} completed successfully!');
  } catch (error) {
    console.error('Error in automation:', error);
    // Send error notification if needed
  }
}

// Set up triggers
function createTriggers() {
  // Delete existing triggers
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  
  // Create new trigger to run every 5 minutes
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyMinutes(5)
    .create();
    
  console.log('Triggers created successfully');
}
`;

    return code;
  }
}

// Express route handlers - DISABLED: Conflicts with new AI routes
export function registerAIWorkflowRoutes(app: express.Application) {
  // DISABLED: This route conflicts with the new AI routes
  // The new implementation is in routes/ai.ts
  console.log('⚠️ registerAIWorkflowRoutes called but routes are disabled to avoid conflicts');
  
  // Generate workflow from natural language prompt - DISABLED
  // app.post('/api/ai/generate-workflow', async (req, res) => {
  //   try {
  //     const { prompt, userId }: WorkflowGenerationRequest = req.body;
  //     
  //     if (!prompt || !userId) {
  //       return res.status(400).json({ error: 'Prompt and userId are required' });
  //     }

  //     const workflow = await AIWorkflowGenerator.generateWorkflow(prompt, userId);
  //       
  //     res.json(workflow);
  //   } catch (error) {
  //     console.error('Error generating workflow:', error);
  //     res.status(500).json({ error: 'Failed to generate workflow' });
  //   }
  // });

  // Validate generated workflow
  app.post('/api/ai/validate-workflow', async (req, res) => {
    try {
      const { workflow } = req.body;
      
      // TODO: Implement workflow validation logic
      const isValid = workflow && workflow.nodes && workflow.nodes.length > 0;
      
      res.json({ 
        valid: isValid,
        issues: isValid ? [] : ['Workflow must have at least one node']
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to validate workflow' });
    }
  });

  // Get workflow templates based on prompt analysis
  app.post('/api/ai/suggest-templates', async (req, res) => {
    try {
      const { prompt } = req.body;
      
      // TODO: Implement template suggestion logic
      const templates = [
        {
          id: 'email-to-sheets',
          title: 'Email to Sheets',
          description: 'Process emails and add to spreadsheet',
          complexity: 'Simple'
        }
      ];
      
      res.json({ templates });
    } catch (error) {
      res.status(500).json({ error: 'Failed to suggest templates' });
    }
  });
}

export { AIWorkflowGenerator };