// COMPREHENSIVE AI WORKFLOW INTELLIGENCE
// Understands ANY automation request and generates logical workflows

interface WorkflowIntelligence {
  intent: string;
  triggerType: 'event' | 'schedule' | 'manual' | 'condition';
  dataFlow: DataFlowStep[];
  requiredApps: string[];
  logicalFunctions: AppFunctionPair[];
  businessLogic: string;
  confidence: number;
}

interface DataFlowStep {
  step: number;
  action: string;
  app: string;
  function: string;
  purpose: string;
  dataIn: string[];
  dataOut: string[];
}

interface AppFunctionPair {
  app: string;
  function: string;
  reason: string;
  parameters: Record<string, any>;
  isRequired: boolean;
}

export class AIWorkflowIntelligence {
  
  public static async analyzeAutomationRequest(prompt: string): Promise<WorkflowIntelligence> {
    console.log(`🧠 AI analyzing automation request: "${prompt}"`);
    
    // Step 1: Understand the core intent
    const intent = this.extractBusinessIntent(prompt);
    console.log(`📋 Detected intent: ${intent}`);
    
    // Step 2: Identify trigger type
    const triggerType = this.identifyTriggerType(prompt);
    console.log(`⚡ Trigger type: ${triggerType}`);
    
    // Step 3: Map logical data flow
    const dataFlow = this.mapDataFlow(prompt, intent);
    console.log(`🔄 Data flow steps: ${dataFlow.length}`);
    
    // Step 4: Select required apps based on data flow
    const requiredApps = this.selectRequiredApps(dataFlow, prompt);
    console.log(`📱 Required apps: ${requiredApps.join(', ')}`);
    
    // Step 5: Choose logical functions for each app
    const logicalFunctions = this.selectLogicalFunctions(requiredApps, dataFlow, prompt);
    console.log(`⚙️ Function selections: ${logicalFunctions.map(f => `${f.app}:${f.function}`).join(', ')}`);
    
    // Step 6: Generate business logic explanation
    const businessLogic = this.generateBusinessLogic(intent, dataFlow);
    
    // Step 7: Calculate confidence based on logical coherence
    const confidence = this.calculateConfidence(intent, dataFlow, logicalFunctions);
    
    return {
      intent,
      triggerType,
      dataFlow,
      requiredApps,
      logicalFunctions,
      businessLogic,
      confidence
    };
  }

  private static extractBusinessIntent(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    // Email automation patterns
    if (lowerPrompt.includes('auto reply') || lowerPrompt.includes('automatic reply') || 
        lowerPrompt.includes('responder')) {
      return 'email_auto_responder';
    }
    
    if (lowerPrompt.includes('track') && (lowerPrompt.includes('email') || lowerPrompt.includes('message'))) {
      return 'email_monitoring';
    }
    
    if (lowerPrompt.includes('send') && lowerPrompt.includes('email')) {
      return 'email_notification';
    }
    
    // CRM automation patterns
    if (lowerPrompt.includes('lead') && (lowerPrompt.includes('add') || lowerPrompt.includes('create'))) {
      return 'lead_capture';
    }
    
    if (lowerPrompt.includes('follow up') || lowerPrompt.includes('followup')) {
      return 'lead_followup';
    }
    
    // E-commerce patterns
    if (lowerPrompt.includes('order') && (lowerPrompt.includes('process') || lowerPrompt.includes('fulfill'))) {
      return 'order_processing';
    }
    
    if (lowerPrompt.includes('inventory') && lowerPrompt.includes('update')) {
      return 'inventory_management';
    }
    
    // Data sync patterns
    if (lowerPrompt.includes('sync') || (lowerPrompt.includes('add') && lowerPrompt.includes('to'))) {
      return 'data_synchronization';
    }
    
    // Notification patterns
    if (lowerPrompt.includes('notify') || lowerPrompt.includes('alert')) {
      return 'notification_system';
    }
    
    // Default
    return 'custom_workflow';
  }

  private static identifyTriggerType(prompt: string): 'event' | 'schedule' | 'manual' | 'condition' {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('when') || lowerPrompt.includes('if') || lowerPrompt.includes('whenever')) {
      return 'event';
    }
    
    if (lowerPrompt.includes('daily') || lowerPrompt.includes('weekly') || lowerPrompt.includes('schedule')) {
      return 'schedule';
    }
    
    if (lowerPrompt.includes('button') || lowerPrompt.includes('manual') || lowerPrompt.includes('on demand')) {
      return 'manual';
    }
    
    return 'event'; // Default to event-based
  }

  private static mapDataFlow(prompt: string, intent: string): DataFlowStep[] {
    const steps: DataFlowStep[] = [];
    
    switch (intent) {
      case 'email_auto_responder':
        steps.push({
          step: 1,
          action: 'Configure automatic email response',
          app: 'Gmail',
          function: 'set_auto_reply',
          purpose: 'Automatically respond to incoming emails',
          dataIn: ['incoming_emails'],
          dataOut: ['auto_reply_sent']
        });
        break;
        
      case 'email_monitoring':
        steps.push({
          step: 1,
          action: 'Monitor incoming emails',
          app: 'Gmail',
          function: 'search_emails',
          purpose: 'Find emails matching criteria',
          dataIn: ['gmail_inbox'],
          dataOut: ['email_data']
        });
        steps.push({
          step: 2,
          action: 'Store email data',
          app: 'Google Sheets',
          function: 'append_row',
          purpose: 'Log email information for tracking',
          dataIn: ['email_data'],
          dataOut: ['stored_records']
        });
        break;
        
      case 'lead_capture':
        steps.push({
          step: 1,
          action: 'Extract contact information',
          app: 'Gmail',
          function: 'search_emails',
          purpose: 'Find new lead emails',
          dataIn: ['gmail_inbox'],
          dataOut: ['contact_info']
        });
        steps.push({
          step: 2,
          action: 'Create CRM lead',
          app: 'Salesforce',
          function: 'create_lead',
          purpose: 'Add lead to CRM system',
          dataIn: ['contact_info'],
          dataOut: ['crm_lead_id']
        });
        break;
        
      case 'order_processing':
        steps.push({
          step: 1,
          action: 'Monitor new orders',
          app: 'Shopify',
          function: 'list_orders',
          purpose: 'Get new orders from store',
          dataIn: ['shopify_store'],
          dataOut: ['order_data']
        });
        steps.push({
          step: 2,
          action: 'Process payment',
          app: 'Stripe',
          function: 'create_payment_intent',
          purpose: 'Handle payment processing',
          dataIn: ['order_data'],
          dataOut: ['payment_confirmation']
        });
        break;
        
      case 'notification_system':
        // Determine source app from prompt
        let sourceApp = 'Gmail';
        if (prompt.toLowerCase().includes('shopify')) sourceApp = 'Shopify';
        if (prompt.toLowerCase().includes('salesforce')) sourceApp = 'Salesforce';
        
        steps.push({
          step: 1,
          action: 'Monitor source system',
          app: sourceApp,
          function: 'monitor_changes',
          purpose: 'Watch for events to notify about',
          dataIn: ['system_events'],
          dataOut: ['event_data']
        });
        steps.push({
          step: 2,
          action: 'Send notification',
          app: 'Slack',
          function: 'send_message',
          purpose: 'Notify team about event',
          dataIn: ['event_data'],
          dataOut: ['notification_sent']
        });
        break;
        
      default:
        // Generic workflow - try to understand from prompt
        steps.push({
          step: 1,
          action: 'Process input',
          app: 'Gmail',
          function: 'search_emails',
          purpose: 'Default email processing',
          dataIn: ['user_input'],
          dataOut: ['processed_data']
        });
    }
    
    return steps;
  }

  private static selectRequiredApps(dataFlow: DataFlowStep[], prompt: string): string[] {
    // Extract unique apps from data flow
    const apps = [...new Set(dataFlow.map(step => step.app))];
    
    // Add additional apps based on prompt context
    const lowerPrompt = prompt.toLowerCase();
    
    // If notification is mentioned, add Slack
    if (lowerPrompt.includes('notify') || lowerPrompt.includes('alert')) {
      if (!apps.includes('Slack')) apps.push('Slack');
    }
    
    // If tracking/storing is mentioned, add Sheets
    if (lowerPrompt.includes('track') || lowerPrompt.includes('log') || lowerPrompt.includes('store')) {
      if (!apps.includes('Google Sheets')) apps.push('Google Sheets');
    }
    
    // If scheduling is mentioned, add Calendar
    if (lowerPrompt.includes('schedule') || lowerPrompt.includes('reminder') || lowerPrompt.includes('meeting')) {
      if (!apps.includes('Google Calendar')) apps.push('Google Calendar');
    }
    
    return apps;
  }

  private static selectLogicalFunctions(
    apps: string[], 
    dataFlow: DataFlowStep[], 
    prompt: string
  ): AppFunctionPair[] {
    const functions: AppFunctionPair[] = [];
    
    apps.forEach(appName => {
      // Find the data flow step for this app
      const appStep = dataFlow.find(step => step.app === appName);
      
      if (appStep) {
        functions.push({
          app: appName,
          function: appStep.function,
          reason: appStep.purpose,
          parameters: this.generateContextualParameters(appName, appStep.function, prompt),
          isRequired: true
        });
      } else {
        // App was added based on context, choose appropriate function
        const contextFunction = this.chooseContextualFunction(appName, prompt, dataFlow);
        functions.push({
          app: appName,
          function: contextFunction.function,
          reason: contextFunction.reason,
          parameters: contextFunction.parameters,
          isRequired: false
        });
      }
    });
    
    return functions;
  }

  private static chooseContextualFunction(
    appName: string, 
    prompt: string, 
    dataFlow: DataFlowStep[]
  ): { function: string; reason: string; parameters: Record<string, any> } {
    const lowerPrompt = prompt.toLowerCase();
    
    // Determine if this app is likely a trigger or action
    const isFirstApp = dataFlow.length === 0;
    const hasDataInput = dataFlow.length > 0;
    
    switch (appName) {
      case 'Gmail':
        if (lowerPrompt.includes('send') || lowerPrompt.includes('notify')) {
          return {
            function: 'send_email',
            reason: 'Email sending detected in prompt',
            parameters: { to: 'dynamic', subject: 'from_context', body: 'generated' }
          };
        }
        if (lowerPrompt.includes('reply') || lowerPrompt.includes('respond')) {
          return {
            function: 'reply_to_email',
            reason: 'Email reply functionality needed',
            parameters: { messageId: 'from_trigger', body: 'auto_generated' }
          };
        }
        return {
          function: 'search_emails',
          reason: 'Default email monitoring',
          parameters: { query: 'is:unread', maxResults: 50 }
        };
        
      case 'Google Sheets':
        if (hasDataInput) {
          return {
            function: 'append_row',
            reason: 'Store data from previous step',
            parameters: { values: 'from_previous_app' }
          };
        }
        return {
          function: 'read_range',
          reason: 'Read data for workflow',
          parameters: { range: 'A:Z' }
        };
        
      case 'Slack':
        return {
          function: 'send_message',
          reason: 'Team notification needed',
          parameters: { channel: '#general', text: 'automation_update' }
        };
        
      case 'Salesforce':
        if (lowerPrompt.includes('lead') || lowerPrompt.includes('prospect')) {
          return {
            function: 'create_lead',
            reason: 'Lead creation detected',
            parameters: { source: 'automation' }
          };
        }
        return {
          function: 'search_leads',
          reason: 'Lead lookup needed',
          parameters: { criteria: 'recent' }
        };
        
      default:
        return {
          function: 'process_data',
          reason: 'Generic data processing',
          parameters: {}
        };
    }
  }

  private static generateContextualParameters(
    appName: string, 
    functionName: string, 
    prompt: string
  ): Record<string, any> {
    const lowerPrompt = prompt.toLowerCase();
    
    // Gmail parameters
    if (appName === 'Gmail') {
      if (functionName === 'set_auto_reply') {
        return {
          message: 'Thank you for your email. I will respond as soon as possible.',
          startDate: 'immediate',
          endDate: 'manual_disable'
        };
      }
      if (functionName === 'search_emails') {
        let query = 'is:unread';
        if (lowerPrompt.includes('important')) query += ' is:important';
        if (lowerPrompt.includes('customer')) query += ' label:customers';
        return { query, maxResults: 50 };
      }
      if (functionName === 'send_email') {
        return {
          to: 'extracted_from_data',
          subject: 'Automated notification',
          body: 'Generated based on workflow context'
        };
      }
    }
    
    // Google Sheets parameters
    if (appName === 'Google Sheets') {
      if (functionName === 'append_row') {
        return {
          spreadsheetId: 'auto_create_or_specify',
          range: 'A:Z',
          values: 'data_from_previous_step'
        };
      }
    }
    
    // Slack parameters
    if (appName === 'Slack') {
      if (functionName === 'send_message') {
        let channel = '#general';
        if (lowerPrompt.includes('sales')) channel = '#sales';
        if (lowerPrompt.includes('support')) channel = '#support';
        
        return {
          channel,
          text: 'Automation update: {dynamic_content}',
          username: 'AutomationBot'
        };
      }
    }
    
    return {};
  }

  private static generateBusinessLogic(intent: string, dataFlow: DataFlowStep[]): string {
    const steps = dataFlow.map(step => `${step.step}. ${step.action} (${step.app})`).join(' → ');
    
    switch (intent) {
      case 'email_auto_responder':
        return `Automatically respond to all incoming emails with a professional message. This ensures no email goes unanswered while you're busy.`;
        
      case 'email_monitoring':
        return `Monitor incoming emails and automatically log them to a spreadsheet for tracking and analysis. Perfect for lead management and customer service.`;
        
      case 'lead_capture':
        return `Capture leads from emails and automatically add them to your CRM system. Streamlines your sales process and ensures no leads are missed.`;
        
      case 'order_processing':
        return `Process new orders by handling payments and updating inventory. Automates your e-commerce fulfillment workflow.`;
        
      default:
        return `Custom automation workflow: ${steps}`;
    }
  }

  private static calculateConfidence(
    intent: string, 
    dataFlow: DataFlowStep[], 
    functions: AppFunctionPair[]
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Intent clarity
    if (intent !== 'custom_workflow') confidence += 0.2;
    
    // Data flow logic
    if (dataFlow.length > 0) confidence += 0.1;
    if (dataFlow.length <= 3) confidence += 0.1; // Simple workflows are more reliable
    
    // Function appropriateness
    const appropriateFunctions = functions.filter(f => f.isRequired).length;
    confidence += (appropriateFunctions / functions.length) * 0.2;
    
    return Math.min(0.95, confidence);
  }
}

// Integration with existing system
export function generateIntelligentWorkflow(prompt: string) {
  return AIWorkflowIntelligence.analyzeAutomationRequest(prompt);
}