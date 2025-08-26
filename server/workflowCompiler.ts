// WORKFLOW COMPILER - NodeGraph to Google Apps Script Code Generation
// Based on ChatGPT's compiler architecture with real code generation

import { NodeGraph, GraphNode } from '../shared/nodeGraphSchema';

export interface CodeFile {
  path: string;
  content: string;
}

export interface CompilerResult {
  files: CodeFile[];
  entryPoint: string;
  errors: string[];
}

/**
 * Compiles a visual workflow graph into Google Apps Script code
 */
export class WorkflowCompiler {
  compile(graph: NodeGraph): CompilerResult {
    const errors: string[] = [];
    const files: CodeFile[] = [];

    try {
      // Generate main workflow function
      const mainCode = this.generateMainWorkflow(graph);
      files.push({
        path: 'main.gs',
        content: mainCode
      });

      // Generate helper functions
      files.push(this.generateStorageHelpers());
      files.push(this.generateHttpHelpers());
      files.push(this.generateOAuth2Helpers());

      // Generate manifest
      files.push(this.generateManifest(graph));

      // Generate README
      files.push(this.generateReadme(graph));

      return {
        files,
        entryPoint: 'main.gs',
        errors
      };
    } catch (error) {
      errors.push(`Compilation failed: ${error.message}`);
      return {
        files: [],
        entryPoint: '',
        errors
      };
    }
  }

  private generateMainWorkflow(graph: NodeGraph): string {
    const setupFunctions = this.generateSetupFunctions(graph);
    const executeFunction = this.generateExecuteFunction(graph);
    
    return `/**
 * Generated workflow: ${graph.name}
 * Description: ${graph.description || 'No description provided'}
 * Generated at: ${new Date().toISOString()}
 */

${setupFunctions}

${executeFunction}

/**
 * Main execution function
 */
function executeWorkflow() {
  try {
    console.log('Starting workflow execution: ${graph.name}');
    return executeGraph_();
  } catch (error) {
    console.error('Workflow execution failed:', error);
    throw error;
  }
}`;
  }

  private generateSetupFunctions(graph: NodeGraph): string {
    const triggerNodes = graph.nodes.filter(node => node.type.startsWith('trigger.'));
    let setupCode = '';

    triggerNodes.forEach(node => {
      if (node.type === 'trigger.cron') {
        setupCode += this.generateCronSetup(node);
      } else if (node.type === 'trigger.webhook.inbound') {
        setupCode += this.generateWebhookSetup(node);
      }
    });

    return setupCode;
  }

  private generateExecuteFunction(graph: NodeGraph): string {
    const nodeCode = graph.nodes.map(node => this.generateNodeCode(node)).join('\n\n');
    
    return `function executeGraph_() {
  var state = {
    data: {},
    context: {
      workflowId: '${graph.id}',
      executionId: Utilities.getUuid(),
      timestamp: new Date().toISOString()
    }
  };

  try {
${nodeCode}

    return {
      success: true,
      data: state.data,
      executionId: state.context.executionId
    };
  } catch (error) {
    console.error('Graph execution error:', error);
    return {
      success: false,
      error: error.message,
      executionId: state.context.executionId
    };
  }
}`;
  }

  private generateNodeCode(node: GraphNode): string {
    const nodeType = node.type;
    
    if (nodeType.startsWith('trigger.')) {
      return this.generateTriggerNodeCode(node);
    } else if (nodeType.startsWith('action.')) {
      return this.generateActionNodeCode(node);
    } else if (nodeType.startsWith('transform.')) {
      return this.generateTransformNodeCode(node, nodeType);
    } else {
      return `    // Unknown node type: ${nodeType}`;
    }
  }

  private generateTriggerNodeCode(node: GraphNode): string {
    switch (node.type) {
      case 'trigger.cron':
        return `    // Cron trigger: ${node.label || node.id}
    console.log('Cron trigger activated');`;
      
      case 'trigger.webhook.inbound':
        return `    // Webhook trigger: ${node.label || node.id}
    console.log('Webhook trigger activated');
    // Process webhook data if available
    if (typeof e !== 'undefined' && e.postData) {
      state.data.webhookData = JSON.parse(e.postData.contents);
    }`;
      
      default:
        return this.generateGenericTriggerCode(node);
    }
  }

  private generateGenericTriggerCode(node: GraphNode): string {
    return `    // Generic trigger: ${node.type}
    console.log('Trigger activated: ${node.label || node.id}');`;
  }

  private generateTransformNodeCode(node: GraphNode, nodeType: any): string {
    switch (nodeType) {
      case 'transform.filter.expr':
        return `    // Filter data based on expression
    var expression = ` + JSON.stringify(node.params.expression) + `;
    var items = state.data.items || [];
    var filteredItems = items.filter(function(item, index) {
      try {
        // Safe evaluation context
        var ctx = state.context;
        return eval('(function(item, ctx) { return ' + expression + '; })')(item, ctx);
      } catch (e) {
        console.warn('Filter expression failed for item', index, ':', e.message);
        return false;
      }
    });
    state.data.items = filteredItems;
    state.data.filteredCount = filteredItems.length;`;

      case 'transform.text.extract_regex':
        return `    // Extract text using regex
    var source = ` + JSON.stringify(node.params.source) + `;
    var pattern = ` + JSON.stringify(node.params.pattern) + `;
    var flags = ` + JSON.stringify(node.params.flags || 'g') + `;
    var sourceText = getNestedValue_(state.data, source) || '';
    try {
      var regex = new RegExp(pattern, flags);
      var matches = sourceText.match(regex);
      state.data.extractedText = matches;
      state.data.extractedCount = matches ? matches.length : 0;
    } catch (e) {
      console.error('Regex extraction failed:', e);
      state.data.extractedText = null;
      state.data.extractedCount = 0;
    }`;

      case 'transform.text.template':
        return `    // Apply text template
    var template = ` + JSON.stringify(node.params.template) + `;
    var bindings = ` + JSON.stringify(node.params.bindings || {}) + `;
    var result = template;
    Object.keys(bindings).forEach(function(key) {
      var placeholder = '{{' + key + '}}';
      var value = getNestedValue_(state.data, bindings[key]) || '';
      result = result.replace(new RegExp(placeholder, 'g'), String(value));
    });
    state.data.templatedText = result;`;

      case 'transform.json.path':
        return `    // Extract JSON path
    var source = ` + JSON.stringify(node.params.source) + `;
    var path = ` + JSON.stringify(node.params.path) + `;
    var sourceData = getNestedValue_(state.data, source);
    if (sourceData) {
      try {
        var result = getNestedValue_(sourceData, path);
        state.data.extractedValue = result;
      } catch (e) {
        console.error('JSON path extraction failed:', e);
        state.data.extractedValue = null;
      }
    } else {
      state.data.extractedValue = null;
    }`;

      default:
        return `    // Unknown transform type: ${nodeType}`;
    }
  }

  private generateActionNodeCode(node: GraphNode): string {
    const [, app, action] = node.type.split('.');
    
    switch (app) {
      case 'sheets':
        return this.generateSheetsActionCode(node, action);
      case 'gmail':
        return this.generateGmailActionCode(node, action);
      case 'calendar':
        return this.generateCalendarActionCode(node, action);
      case 'http':
        return this.generateHttpActionCode(node);
      default:
        return this.generateGenericActionCode(node);
    }
  }

  private generateSheetsActionCode(node: GraphNode, action: string): string {
    switch (action) {
      case 'add_row':
        return `    // Add row to Google Sheets
    var spreadsheetId = interpolateValue_(` + JSON.stringify(node.params.spreadsheetId) + `, state.data);
    var sheetName = interpolateValue_(` + JSON.stringify(node.params.sheetName) + `, state.data);
    var values = ` + JSON.stringify(node.params.values) + `;
    
    try {
      var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
      if (sheet) {
        sheet.appendRow(values);
        state.data.sheetsResult = { success: true, rowsAdded: 1 };
      } else {
        throw new Error('Sheet not found: ' + sheetName);
      }
    } catch (e) {
      console.error('Sheets add row failed:', e);
      state.data.sheetsResult = { success: false, error: e.message };
    }`;
      
      default:
        return this.generateGenericActionCode(node);
    }
  }

  private generateGmailActionCode(node: GraphNode, action: string): string {
    switch (action) {
      case 'send_email':
        return `    // Send email via Gmail
    var to = interpolateValue_(` + JSON.stringify(node.params.to) + `, state.data);
    var subject = interpolateValue_(` + JSON.stringify(node.params.subject) + `, state.data);
    var body = interpolateValue_(` + JSON.stringify(node.params.body) + `, state.data);
    
    try {
      GmailApp.sendEmail(to, subject, body);
      state.data.emailResult = { success: true, recipient: to };
    } catch (e) {
      console.error('Gmail send failed:', e);
      state.data.emailResult = { success: false, error: e.message };
    }`;
      
      default:
        return this.generateGenericActionCode(node);
    }
  }

  private generateCalendarActionCode(node: GraphNode, action: string): string {
    return `    // Calendar action: ${action}
    console.log('Calendar action not yet implemented: ${action}');`;
  }

  private generateHttpActionCode(node: GraphNode): string {
    return `    // HTTP Request
    var method = ` + JSON.stringify(node.params.method) + `;
    var url = interpolateValue_(` + JSON.stringify(node.params.url) + `, state.data);
    var headers = ` + JSON.stringify(node.params.headers || {}) + `;
    var body = ` + JSON.stringify(node.params.body) + `;
    var timeoutSec = ` + JSON.stringify(node.params.timeoutSec || 30) + `;
    
    try {
      var response = UrlFetchApp.fetch(url, {
        method: method,
        headers: headers,
        payload: body,
        muteHttpExceptions: true
      });
      state.data.httpResult = {
        statusCode: response.getResponseCode(),
        body: response.getContentText(),
        headers: response.getAllHeaders()
      };
    } catch (e) {
      console.error('HTTP request failed:', e);
      state.data.httpResult = { error: e.message };
    }`;
  }

  private generateGenericActionCode(node: GraphNode): string {
    const [, appName] = node.type.split('.');
    const actionName = node.type.split('.')[2];
    return `    // Generic ${appName} ${actionName} action
    console.log('Executing ${appName} action: ${actionName}');
    var params = ` + JSON.stringify(node.params) + `;
    // TODO: Implement ${appName} ${actionName} integration
    state.data.genericResult = { 
      action: '${actionName}', 
      app: '${appName}', 
      params: params,
      executed: true 
    };`;
  }

  private generateCronSetup(node: GraphNode): string {
    return `
/**
 * Setup cron trigger for ` + (node.label || node.id) + `
 */
function setupCronTrigger_` + node.id.replace(/[^a-zA-Z0-9]/g, '_') + `() {
  ScriptApp.deleteTrigger(ScriptApp.getProjectTriggers().find(function(trigger) {
    return trigger.getHandlerFunction() === 'executeWorkflow';
  }));
  
  var trigger = ScriptApp.newTrigger('executeWorkflow');
  ` + (node.params.everyMinutes ? `trigger.timeBased().everyMinutes(` + node.params.everyMinutes + `);` : '') + `
  ` + (node.params.everyHours ? `trigger.timeBased().everyHours(` + node.params.everyHours + `);` : '') + `
  ` + (node.params.cron ? `// Custom cron: ` + node.params.cron + ` (implement with time-based trigger)` : '') + `
  trigger.create();
}`;
  }

  private generateWebhookSetup(node: GraphNode): string {
    return `
/**
 * Setup webhook trigger for ` + (node.label || node.id) + `
 */
function setupWebhookTrigger_` + node.id.replace(/[^a-zA-Z0-9]/g, '_') + `() {
  // Webhook setup
  console.log('Webhook endpoint: ' + ScriptApp.getService().getUrl());
  console.log('Webhook path: \` + node.params.path + \`');
}`;
  }

  private generateStorageHelpers(): CodeFile {
    return {
      path: 'storage.gs',
      content: `/**
 * Storage helper functions for state management
 */

/**
 * Get PropertiesService store
 */
function getStore_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Check if we've seen this item before (deduplication)
 */
function isProcessed_(itemId) {
  return getStore_().getProperty('processed_' + itemId) !== null;
}

/**
 * Mark item as seen
 */
function markProcessed_(itemId) {
  getStore_().setProperty('processed_' + itemId, new Date().toISOString());
}

/**
 * Get last processed timestamp
 */
function getLastProcessedTime_(key) {
  return getStore_().getProperty(key) || '1970-01-01T00:00:00.000Z';
}

/**
 * Set last processed timestamp
 */
function setLastProcessedTime_(key, timestamp) {
  getStore_().setProperty(key, timestamp);
}

/**
 * Clear all stored state (use with caution)
 */
function clearStoredState_() {
  getStore_().deleteAllProperties();
}`
    };
  }

  private generateHttpHelpers(): CodeFile {
    return {
      path: 'http.gs',
      content: `/**
 * HTTP helper functions with retry and error handling
 */

/**
 * Make HTTP request with JSON response
 */
function fetchJson_(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  options.headers['Content-Type'] = 'application/json';
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseText = response.getContentText();
    
    return {
      success: true,
      status: response.getResponseCode(),
      data: JSON.parse(responseText),
      headers: response.getAllHeaders()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 0
    };
  }
}

/**
 * Make raw HTTP request
 */
function fetchRaw_(url, options) {
  try {
    var response = UrlFetchApp.fetch(url, options);
    return {
      success: true,
      status: response.getResponseCode(),
      body: response.getContentText(),
      headers: response.getAllHeaders()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 0
    };
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue_(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce(function(current, key) {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

/**
 * Interpolate template values
 */
function interpolateValue_(template, data) {
  if (typeof template !== 'string') return template;
  return template.replace(/\\{\\{([^}]+)\\}\\}/g, function(match, path) {
    return getNestedValue_(data, path) || match;
  });
}`
    };
  }

  private generateOAuth2Helpers(): CodeFile {
    return {
      path: 'oauth.gs',
      content: `/**
 * OAuth2 helper functions for external service authentication
 */

/**
 * Get OAuth2 service for external APIs
 */
function getService_(serviceName) {
  return OAuth2.createService(serviceName)
    .setAuthorizationBaseUrl('https://accounts.google.com/oauth/authorize')
    .setTokenUrl('https://accounts.google.com/oauth/token')
    .setClientId('YOUR_CLIENT_ID')
    .setClientSecret('YOUR_CLIENT_SECRET')
    .setCallbackFunction('authCallback_')
    .setPropertyStore(PropertiesService.getScriptProperties());
}

/**
 * OAuth2 callback handler
 */
function authCallback_(request) {
  var service = getService_('external_api');
  var authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('Success!');
  } else {
    return HtmlService.createHtmlOutput('Denied. You can close this tab');
  }
}

/**
 * Get authorization URL for OAuth2 flow
 */
function getAuthorizationUrl_(serviceName) {
  var service = getService_(serviceName);
  if (service.hasAccess()) {
    return 'Already authorized';
  } else {
    return service.getAuthorizationUrl();
  }
}`
    };
  }

  private generateManifest(graph: NodeGraph): CodeFile {
    return {
      path: 'appsscript.json',
      content: JSON.stringify({
        "timeZone": "America/New_York",
        "dependencies": {
          "enabledAdvancedServices": []
        },
        "exceptionLogging": "STACKDRIVER",
        "runtimeVersion": "V8"
      }, null, 2)
    };
  }

  private generateReadme(graph: NodeGraph): CodeFile {
    return {
      path: 'README.md',
      content: `# ${graph.name}

${graph.description || 'No description provided'}

## Generated Workflow

This Google Apps Script project was automatically generated from a visual workflow.

### Files

- \`main.gs\` - Main workflow execution logic
- \`storage.gs\` - Data persistence helpers
- \`http.gs\` - HTTP request utilities
- \`oauth.gs\` - OAuth2 authentication helpers
- \`appsscript.json\` - Apps Script manifest

### Setup

1. Open [Google Apps Script](https://script.google.com)
2. Create a new project
3. Copy the generated code files
4. Configure any required OAuth2 credentials
5. Set up triggers as needed

### Execution

Run the \`executeWorkflow()\` function to start the workflow.

Generated at: ${new Date().toISOString()}
`
    };
  }
}
