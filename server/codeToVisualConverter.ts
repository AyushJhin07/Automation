// CODE-TO-VISUAL CONVERTER
// Takes real Google Apps Script code from LLM and converts to visual workflow

interface ParsedCodeElement {
  type: 'function' | 'trigger' | 'api_call' | 'data_operation';
  name: string;
  service: string; // Gmail, Sheets, Calendar, etc.
  operation: string; // send, search, append, etc.
  parameters: Record<string, any>;
  dependencies: string[];
  lineNumber: number;
}

interface VisualWorkflowNode {
  id: string;
  app: string;
  function: string;
  description: string;
  parameters: Record<string, any>;
  position: { x: number; y: number };
  color: string;
  icon: string;
  isEntry: boolean;
  isExit: boolean;
}

interface VisualWorkflowConnection {
  id: string;
  source: string;
  target: string;
  dataType: string;
  label: string;
}

export class CodeToVisualConverter {
  
  public static async convertAppsScriptToVisual(
    appsScriptCode: string,
    originalPrompt: string
  ): Promise<{
    nodes: VisualWorkflowNode[];
    connections: VisualWorkflowConnection[];
    workflow: any;
  }> {
    console.log('🔄 Converting Google Apps Script code to visual workflow...');
    
    // Step 1: Parse the Apps Script code
    const parsedElements = this.parseAppsScriptCode(appsScriptCode);
    console.log('📝 Parsed code elements:', parsedElements.length);
    
    // Step 2: Identify workflow structure
    const workflowStructure = this.identifyWorkflowStructure(parsedElements);
    console.log('🏗️ Identified workflow structure:', workflowStructure);
    
    // Step 3: Convert to visual nodes
    const nodes = this.createVisualNodes(parsedElements, workflowStructure);
    console.log('📊 Created visual nodes:', nodes.length);
    
    // Step 4: Create logical connections
    const connections = this.createLogicalConnections(nodes, parsedElements);
    console.log('🔗 Created connections:', connections.length);
    
    // Step 5: Generate workflow metadata
    const workflow = {
      title: this.extractWorkflowTitle(appsScriptCode, originalPrompt),
      description: this.extractWorkflowDescription(appsScriptCode),
      complexity: this.calculateComplexity(parsedElements),
      estimatedValue: this.calculateValue(parsedElements),
      originalCode: appsScriptCode
    };
    
    return { nodes, connections, workflow };
  }

  private static parseAppsScriptCode(code: string): ParsedCodeElement[] {
    const elements: ParsedCodeElement[] = [];
    const lines = code.split('\n');
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Parse Gmail operations
      if (trimmedLine.includes('GmailApp.')) {
        if (trimmedLine.includes('search(')) {
          elements.push({
            type: 'api_call',
            name: 'search_emails',
            service: 'Gmail',
            operation: 'search',
            parameters: this.extractParameters(trimmedLine, 'search'),
            dependencies: [],
            lineNumber: index + 1
          });
        }
        if (trimmedLine.includes('sendEmail(')) {
          elements.push({
            type: 'api_call',
            name: 'send_email',
            service: 'Gmail',
            operation: 'send',
            parameters: this.extractParameters(trimmedLine, 'sendEmail'),
            dependencies: [],
            lineNumber: index + 1
          });
        }
        if (trimmedLine.includes('updateVacation(')) {
          elements.push({
            type: 'api_call',
            name: 'set_auto_reply',
            service: 'Gmail',
            operation: 'auto_reply',
            parameters: this.extractParameters(trimmedLine, 'updateVacation'),
            dependencies: [],
            lineNumber: index + 1
          });
        }
      }
      
      // Parse Google Sheets operations
      if (trimmedLine.includes('SpreadsheetApp.')) {
        if (trimmedLine.includes('appendRow(')) {
          elements.push({
            type: 'api_call',
            name: 'append_row',
            service: 'Google Sheets',
            operation: 'append',
            parameters: this.extractParameters(trimmedLine, 'appendRow'),
            dependencies: ['data_from_previous'],
            lineNumber: index + 1
          });
        }
        if (trimmedLine.includes('getRange(')) {
          elements.push({
            type: 'api_call',
            name: 'read_range',
            service: 'Google Sheets',
            operation: 'read',
            parameters: this.extractParameters(trimmedLine, 'getRange'),
            dependencies: [],
            lineNumber: index + 1
          });
        }
      }
      
      // Parse Calendar operations
      if (trimmedLine.includes('CalendarApp.')) {
        if (trimmedLine.includes('createEvent(')) {
          elements.push({
            type: 'api_call',
            name: 'create_event',
            service: 'Google Calendar',
            operation: 'create',
            parameters: this.extractParameters(trimmedLine, 'createEvent'),
            dependencies: ['event_data'],
            lineNumber: index + 1
          });
        }
      }
      
      // Parse function definitions
      if (trimmedLine.startsWith('function ') && !trimmedLine.includes('//')) {
        const functionName = trimmedLine.match(/function\s+(\w+)/)?.[1];
        if (functionName) {
          elements.push({
            type: 'function',
            name: functionName,
            service: 'Custom',
            operation: 'process',
            parameters: {},
            dependencies: [],
            lineNumber: index + 1
          });
        }
      }
      
      // Parse triggers
      if (trimmedLine.includes('newTrigger(')) {
        elements.push({
          type: 'trigger',
          name: 'automation_trigger',
          service: 'Google Apps Script',
          operation: 'schedule',
          parameters: this.extractTriggerParameters(trimmedLine),
          dependencies: [],
          lineNumber: index + 1
        });
      }
    });
    
    return elements;
  }

  private static extractParameters(line: string, functionName: string): Record<string, any> {
    // Extract parameters from function calls
    const params: Record<string, any> = {};
    
    try {
      // Simple parameter extraction for common patterns
      if (functionName === 'search') {
        const queryMatch = line.match(/'([^']+)'/);
        if (queryMatch) params.query = queryMatch[1];
      }
      
      if (functionName === 'sendEmail') {
        const matches = line.match(/'([^']+)'/g);
        if (matches && matches.length >= 3) {
          params.to = matches[0].replace(/'/g, '');
          params.subject = matches[1].replace(/'/g, '');
          params.body = matches[2].replace(/'/g, '');
        }
      }
      
      if (functionName === 'appendRow') {
        params.values = 'extracted_from_array';
      }
    } catch (error) {
      console.log('Parameter extraction error:', error);
    }
    
    return params;
  }

  private static extractTriggerParameters(line: string): Record<string, any> {
    const params: Record<string, any> = {};
    
    if (line.includes('everyMinutes(')) {
      const minutesMatch = line.match(/everyMinutes\((\d+)\)/);
      if (minutesMatch) params.interval = `${minutesMatch[1]} minutes`;
    }
    
    if (line.includes('everyHours(')) {
      const hoursMatch = line.match(/everyHours\((\d+)\)/);
      if (hoursMatch) params.interval = `${hoursMatch[1]} hours`;
    }
    
    return params;
  }

  private static identifyWorkflowStructure(elements: ParsedCodeElement[]): any {
    // Identify the main workflow pattern
    const services = [...new Set(elements.map(e => e.service))];
    const operations = [...new Set(elements.map(e => e.operation))];
    
    // Determine workflow type
    let workflowType = 'custom';
    if (services.includes('Gmail') && operations.includes('auto_reply')) {
      workflowType = 'email_auto_responder';
    } else if (services.includes('Gmail') && services.includes('Google Sheets')) {
      workflowType = 'email_to_sheets';
    } else if (services.includes('Gmail') && operations.includes('send')) {
      workflowType = 'email_automation';
    }
    
    return {
      type: workflowType,
      services,
      operations,
      complexity: elements.length > 3 ? 'complex' : 'simple'
    };
  }

  private static createVisualNodes(
    elements: ParsedCodeElement[], 
    structure: any
  ): VisualWorkflowNode[] {
    const nodes: VisualWorkflowNode[] = [];
    const serviceGroups = this.groupElementsByService(elements);
    
    let xPosition = 100;
    const yPosition = 200;
    
    Object.entries(serviceGroups).forEach(([service, serviceElements], index) => {
      // Skip custom functions and triggers for visual representation
      if (service === 'Custom' || service === 'Google Apps Script') return;
      
      const mainElement = serviceElements[0] as ParsedCodeElement;
      const allOperations = serviceElements.map(e => e.operation);
      
      nodes.push({
        id: `${service.toLowerCase().replace(/\s+/g, '-')}-${index}`,
        app: service,
        function: this.mapOperationToFunction(mainElement.operation, allOperations),
        description: this.generateNodeDescription(service, allOperations),
        parameters: this.mergeParameters(serviceElements),
        position: { x: xPosition, y: yPosition + (index % 2) * 100 },
        color: this.getServiceColor(service),
        icon: this.getServiceIcon(service),
        isEntry: index === 0,
        isExit: index === Object.keys(serviceGroups).length - 1
      });
      
      xPosition += 250;
    });
    
    return nodes;
  }

  private static groupElementsByService(elements: ParsedCodeElement[]): Record<string, ParsedCodeElement[]> {
    const groups: Record<string, ParsedCodeElement[]> = {};
    
    elements.forEach(element => {
      if (!groups[element.service]) {
        groups[element.service] = [];
      }
      groups[element.service].push(element);
    });
    
    return groups;
  }

  private static mapOperationToFunction(operation: string, allOperations: string[]): string {
    const operationMap: Record<string, string> = {
      'search': 'Search Emails',
      'send': 'Send Email',
      'auto_reply': 'Set Auto Reply',
      'append': 'Append Row',
      'read': 'Read Range',
      'create': 'Create Event',
      'update': 'Update Data'
    };
    
    return operationMap[operation] || `${operation.charAt(0).toUpperCase()}${operation.slice(1)}`;
  }

  private static generateNodeDescription(service: string, operations: string[]): string {
    const operationText = operations.join(', ');
    return `${service} operations: ${operationText}`;
  }

  private static mergeParameters(elements: ParsedCodeElement[]): Record<string, any> {
    const merged: Record<string, any> = {};
    
    elements.forEach(element => {
      Object.assign(merged, element.parameters);
    });
    
    return merged;
  }

  private static createLogicalConnections(
    nodes: VisualWorkflowNode[], 
    elements: ParsedCodeElement[]
  ): VisualWorkflowConnection[] {
    const connections: VisualWorkflowConnection[] = [];
    
    // Create sequential connections based on data dependencies
    for (let i = 0; i < nodes.length - 1; i++) {
      const sourceNode = nodes[i];
      const targetNode = nodes[i + 1];
      
      connections.push({
        id: `conn-${i}`,
        source: sourceNode.id,
        target: targetNode.id,
        dataType: this.inferDataType(sourceNode, targetNode),
        label: this.generateConnectionLabel(sourceNode, targetNode)
      });
    }
    
    return connections;
  }

  private static inferDataType(source: VisualWorkflowNode, target: VisualWorkflowNode): string {
    if (source.app === 'Gmail' && target.app === 'Google Sheets') {
      return 'email_data';
    }
    if (source.app === 'Google Sheets' && target.app === 'Gmail') {
      return 'contact_data';
    }
    if (source.app.includes('Sheets') && target.app === 'Google Calendar') {
      return 'event_data';
    }
    
    return 'data';
  }

  private static generateConnectionLabel(source: VisualWorkflowNode, target: VisualWorkflowNode): string {
    return `${source.app} → ${target.app}`;
  }

  private static getServiceColor(service: string): string {
    const colorMap: Record<string, string> = {
      'Gmail': '#EA4335',
      'Google Sheets': '#0F9D58',
      'Google Calendar': '#4285F4',
      'Google Drive': '#4285F4',
      'Slack': '#4A154B',
      'Salesforce': '#00A1E0',
      'HubSpot': '#FF7A59'
    };
    
    return colorMap[service] || '#6366f1';
  }

  private static getServiceIcon(service: string): string {
    const iconMap: Record<string, string> = {
      'Gmail': 'Mail',
      'Google Sheets': 'Sheet',
      'Google Calendar': 'Calendar',
      'Google Drive': 'FolderOpen',
      'Slack': 'MessageSquare',
      'Salesforce': 'Cloud',
      'HubSpot': 'Heart'
    };
    
    return iconMap[service] || 'Zap';
  }

  private static extractWorkflowTitle(code: string, prompt: string): string {
    // Look for title in comments
    const titleMatch = code.match(/\/\*\*\s*\n\s*\*\s*(.+)\n/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    
    // Generate from prompt
    return `Automation: ${prompt.substring(0, 50)}...`;
  }

  private static extractWorkflowDescription(code: string): string {
    // Look for description in comments
    const descMatch = code.match(/\/\*\*[\s\S]*?\*\s*(.+)\n[\s\S]*?\*\//);
    if (descMatch) {
      return descMatch[1].trim();
    }
    
    return 'Generated from Google Apps Script code';
  }

  private static calculateComplexity(elements: ParsedCodeElement[]): 'Simple' | 'Medium' | 'Complex' {
    const services = new Set(elements.map(e => e.service)).size;
    const operations = elements.length;
    
    if (services > 3 || operations > 5) return 'Complex';
    if (services > 1 || operations > 2) return 'Medium';
    return 'Simple';
  }

  private static calculateValue(elements: ParsedCodeElement[]): string {
    const services = new Set(elements.map(e => e.service)).size;
    const baseValue = services * 500;
    return `$${baseValue.toLocaleString()}/month time savings`;
  }
}

// Real LLM-to-Visual Workflow Service
export class LLMToVisualWorkflowService {
  
  public static async generateWorkflowFromConversation(
    conversation: any[],
    selectedModel: string,
    apiKey: string
  ): Promise<any> {
    console.log('🧠 Generating real workflow from LLM conversation...');
    
    // Step 1: Get the final automation understanding from conversation
    const finalPrompt = this.buildFinalPrompt(conversation);
    
    // Step 2: Ask LLM to generate actual Google Apps Script code
    const appsScriptCode = await this.generateRealAppsScriptCode(finalPrompt, selectedModel, apiKey);
    
    // Step 3: Convert the real code to visual workflow
    const visualWorkflow = await CodeToVisualConverter.convertAppsScriptToVisual(
      appsScriptCode,
      finalPrompt
    );
    
    return {
      ...visualWorkflow,
      generatedCode: appsScriptCode,
      conversationSummary: finalPrompt
    };
  }

  private static buildFinalPrompt(conversation: any[]): string {
    // Combine all user messages and AI clarifications into final prompt
    const userMessages = conversation
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join(' ');
    
    return userMessages;
  }

  private static async generateRealAppsScriptCode(
    prompt: string,
    model: string,
    apiKey: string
  ): Promise<string> {
    console.log(`🔥 Asking ${model} to generate REAL Google Apps Script code...`);
    
    const codePrompt = `You are a Google Apps Script expert. Generate complete, functional Google Apps Script code for this automation:

"${prompt}"

Requirements:
1. Generate COMPLETE, working Google Apps Script code
2. Include all necessary functions and error handling
3. Add proper triggers and scheduling
4. Use best practices for Google Workspace APIs
5. Include detailed comments explaining each step

Return ONLY the Google Apps Script code, no explanations.`;

    // Call the real API to generate code
    const response = await fetch('/api/ai/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: codePrompt,
        model: model,
        apiKey: apiKey,
        userId: 'code-generation'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate Apps Script code');
    }

    const result = await response.json();
    
    // Extract code from response (remove any markdown formatting)
    let code = result.response;
    code = code.replace(/```javascript\n?|\n?```/g, '');
    code = code.replace(/```\n?|\n?```/g, '');
    
    console.log('✅ Real Google Apps Script code generated by LLM');
    return code;
  }
}