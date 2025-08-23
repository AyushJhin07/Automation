import { simpleGraphValidator } from './SimpleGraphValidator';

export interface CompilerOptions {
  projectName?: string;
  includeLogging?: boolean;
  includeErrorHandling?: boolean;
  includeRateLimiting?: boolean;
  timezone?: string;
  version?: string;
}

export interface CompiledFile {
  name: string;
  content: string;
  type: 'javascript' | 'json' | 'html';
  description?: string;
}

export interface CompilerResult {
  success: boolean;
  files: CompiledFile[];
  manifest: any;
  entry: string;
  estimatedSize: number;
  requiredScopes: string[];
  deploymentInstructions: string;
  error?: string;
}

export class ProductionGraphCompiler {

  public compile(graph: any, options: CompilerOptions = {}): CompilerResult {
    try {
      console.log(`🔧 Compiling graph: ${graph.name || graph.id}`);

      // Validate graph first
      const validation = simpleGraphValidator.validate(graph);
      if (!validation.valid) {
        return {
          success: false,
          files: [],
          manifest: {},
          entry: '',
          estimatedSize: 0,
          requiredScopes: [],
          deploymentInstructions: '',
          error: `Graph validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      const compiledFiles: CompiledFile[] = [];
      const requiredScopes = validation.requiredScopes || [];

      // Generate main execution file
      const mainCode = this.generateMainCode(graph, options);
      compiledFiles.push({
        name: 'Code.js',
        content: mainCode,
        type: 'javascript',
        description: 'Main workflow execution code'
      });

      // Generate helper files
      const helperFiles = this.generateHelperFiles(graph, options);
      compiledFiles.push(...helperFiles);

      // Generate manifest
      const manifest = this.generateManifest(graph, requiredScopes, options);

      // Generate trigger setup if needed
      const triggerSetup = this.generateTriggerSetup(graph);
      if (triggerSetup) {
        compiledFiles.push({
          name: 'Triggers.js',
          content: triggerSetup,
          type: 'javascript',
          description: 'Trigger setup and management'
        });
      }

      // Generate deployment instructions
      const deploymentInstructions = this.generateDeploymentInstructions(graph, options);

      // Calculate estimated size
      const estimatedSize = compiledFiles.reduce((total, file) => total + file.content.length, 0);

      console.log(`✅ Graph compiled successfully: ${compiledFiles.length} files, ${estimatedSize} bytes`);

      return {
        success: true,
        files: compiledFiles,
        manifest,
        entry: 'Code.js',
        estimatedSize,
        requiredScopes,
        deploymentInstructions
      };

    } catch (error) {
      console.error('❌ Compilation error:', error);
      return {
        success: false,
        files: [],
        manifest: {},
        entry: '',
        estimatedSize: 0,
        requiredScopes: [],
        deploymentInstructions: '',
        error: error.message || 'Compilation failed'
      };
    }
  }

  /**
   * Generate main workflow execution code
   */
  private generateMainCode(graph: any, options: CompilerOptions): string {
    const { nodes, edges } = graph;
    const executionOrder = this.getExecutionOrder(nodes, edges);

    let code = this.generateFileHeader(graph, options);

    // Generate main execution function
    code += `
/**
 * Main workflow execution function
 * Generated from: ${graph.name || 'Unnamed Workflow'}
 */
function executeWorkflow(triggerData = {}) {
  ${options.includeLogging ? 'Logger.log("🚀 Starting workflow execution: " + JSON.stringify(triggerData));' : ''}
  
  try {
    // Initialize workflow context
    const context = {
      triggerData: triggerData,
      results: {},
      errors: [],
      startTime: new Date(),
      correlationId: Utilities.getUuid()
    };
    
    ${options.includeLogging ? 'Logger.log("📋 Execution context initialized: " + context.correlationId);' : ''}
    
    // Execute nodes in topological order
    ${executionOrder.map(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return this.generateNodeExecution(node, options);
    }).join('\n    ')}
    
    ${options.includeLogging ? 'Logger.log("✅ Workflow completed successfully in " + (new Date() - context.startTime) + "ms");' : ''}
    
    return {
      success: true,
      results: context.results,
      executionTime: new Date() - context.startTime,
      correlationId: context.correlationId
    };
    
  } catch (error) {
    ${options.includeErrorHandling ? `
    Logger.log("❌ Workflow execution failed: " + error.toString());
    
    // Send error notification if configured
    try {
      const errorNotificationEmail = PropertiesService.getScriptProperties().getProperty('ERROR_NOTIFICATION_EMAIL');
      if (errorNotificationEmail) {
        MailApp.sendEmail({
          to: errorNotificationEmail,
          subject: 'Workflow Execution Failed: ${graph.name || 'Unknown'}',
          body: \`Workflow execution failed at \${new Date()}\\n\\nError: \${error.toString()}\\n\\nStack: \${error.stack}\`
        });
      }
    } catch (notificationError) {
      Logger.log("Failed to send error notification: " + notificationError.toString());
    }
    ` : 'Logger.log("❌ Workflow execution failed: " + error.toString());'}
    
    throw error;
  }
}

// Polling-safe wrapper with concurrency lock (prevents overlapping executions)
function executeWorkflowSafe(triggerData = {}) {
  return withLock_(function() {
    return executeWorkflow(triggerData);
  }, 300000, 3); // 5 minute timeout, 3 retries
}

// Entry point for polling triggers (uses lock)
function run_polling_workflow_(triggerData = {}) {
  return executeWorkflowSafe(triggerData);
}

// Entry point for one-time triggers (no lock needed)
function run_workflow_(triggerData = {}) {
  return executeWorkflow(triggerData);
}
`;

    // Generate individual node functions
    nodes.forEach(node => {
      code += this.generateNodeFunction(node, options);
    });

    return code;
  }

  /**
   * Generate execution code for a specific node
   */
  private generateNodeExecution(node: any, options: CompilerOptions): string {
    const errorHandling = options.includeErrorHandling;
    const logging = options.includeLogging;

    return `
    // Execute node: ${node.id} (${node.type})
    ${logging ? `Logger.log("🔄 Executing node: ${node.id}");` : ''}
    ${errorHandling ? 'try {' : ''}
      context.results['${node.id}'] = execute_${node.id}(context);
      ${logging ? `Logger.log("✅ Node ${node.id} completed");` : ''}
    ${errorHandling ? `
    } catch (nodeError) {
      Logger.log("❌ Node ${node.id} failed: " + nodeError.toString());
      context.errors.push({
        nodeId: '${node.id}',
        error: nodeError.toString(),
        timestamp: new Date()
      });
      
      // Decide whether to continue or stop based on node configuration
      ${node.data?.continueOnError !== false ? '// Continue execution despite error' : 'throw nodeError;'}
    }` : ''}`;
  }

  /**
   * Generate function for individual node
   */
  private generateNodeFunction(node: any, options: CompilerOptions): string {
    const { id, type, data } = node;

    let functionCode = `
/**
 * Node: ${id}
 * Type: ${type}
 * ${data?.description || 'No description'}
 */
function execute_${id}(context) {
`;

    switch (type) {
      case 'trigger.time.cron':
        functionCode += this.generateTimeTriggerCode(data);
        break;
      case 'trigger.webhook':
        functionCode += this.generateWebhookTriggerCode(data);
        break;
      case 'trigger.gmail.new_email':
        functionCode += this.generateGmailTriggerCode(data);
        break;
      case 'action.gmail.send':
        functionCode += this.generateGmailSendCode(data);
        break;
      case 'action.gmail.read':
        functionCode += this.generateGmailReadCode(data);
        break;
      case 'action.sheets.append':
        functionCode += this.generateSheetsAppendCode(data);
        break;
      case 'action.sheets.read':
        functionCode += this.generateSheetsReadCode(data);
        break;
      case 'action.drive.create_file':
        functionCode += this.generateDriveCreateCode(data);
        break;
      case 'action.http.request':
        functionCode += this.generateHttpRequestCode(data);
        break;
      case 'condition.if':
        functionCode += this.generateConditionCode(data);
        break;
      case 'transform.data_mapper':
        functionCode += this.generateDataMapperCode(data);
        break;
      case 'utility.delay':
        functionCode += this.generateDelayCode(data);
        break;
      case 'utility.logger':
        functionCode += this.generateLoggerCode(data);
        break;
      default:
        functionCode += `
  Logger.log("⚠️ Unknown node type: ${type}");
  return { type: '${type}', status: 'skipped', message: 'Unknown node type' };`;
    }

    functionCode += '\n}\n';
    return functionCode;
  }

  /**
   * Generate specific node type implementations
   */
  private generateTimeTriggerCode(data: any): string {
    return `
  // Time trigger - this runs on schedule
  return {
    type: 'time_trigger',
    schedule: '${data.schedule || '@daily'}',
    timezone: '${data.timezone || 'America/New_York'}',
    triggeredAt: new Date(),
    status: 'triggered'
  };`;
  }

  private generateWebhookTriggerCode(data: any): string {
    return `
  // Webhook trigger - processes incoming HTTP requests
  const triggerData = context.triggerData;
  
  return {
    type: 'webhook_trigger',
    method: triggerData.method || 'POST',
    headers: triggerData.headers || {},
    body: triggerData.body || {},
    query: triggerData.query || {},
    status: 'triggered'
  };`;
  }

  private generateGmailTriggerCode(data: any): string {
    return `
  // Gmail trigger - searches for emails
  const query = '${data.query || 'is:unread'}';
  const maxResults = ${data.maxResults || 10};
  
  const threads = GmailApp.search(query, 0, maxResults);
  const emails = [];
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      emails.push({
        id: message.getId(),
        subject: message.getSubject(),
        from: message.getFrom(),
        to: message.getTo(),
        date: message.getDate(),
        body: message.getPlainBody(),
        isUnread: message.isUnread(),
        threadId: thread.getId()
      });
    });
  });
  
  return {
    type: 'gmail_trigger',
    query: query,
    emailsFound: emails.length,
    emails: emails,
    status: 'completed'
  };`;
  }

  private generateGmailSendCode(data: any): string {
    return `
  // Send email via Gmail
  const to = \`${data.to || '{{context.triggerData.email}}'}\`;
  const subject = \`${data.subject || 'Automation Notification'}\`;
  const body = \`${data.body || 'This is an automated message.'}\`;
  
  // Support for dynamic content from context
  const resolvedTo = this.resolveTemplate(to, context);
  const resolvedSubject = this.resolveTemplate(subject, context);
  const resolvedBody = this.resolveTemplate(body, context);
  
  const emailOptions = {
    to: resolvedTo,
    subject: resolvedSubject,
    ${data.htmlBody ? 'htmlBody: resolvedBody,' : 'body: resolvedBody,'}
    ${data.cc ? `cc: '${data.cc}',` : ''}
    ${data.bcc ? `bcc: '${data.bcc}',` : ''}
    ${data.replyTo ? `replyTo: '${data.replyTo}',` : ''}
  };
  
  ${data.attachments ? `
  // Handle attachments if specified
  if (context.results.attachments) {
    emailOptions.attachments = context.results.attachments;
  }` : ''}
  
  MailApp.sendEmail(emailOptions);
  
  return {
    type: 'gmail_send',
    to: resolvedTo,
    subject: resolvedSubject,
    sentAt: new Date(),
    status: 'sent'
  };`;
  }

  private generateGmailReadCode(data: any): string {
    return `
  // Read emails from Gmail
  const query = '${data.query || 'is:unread'}';
  const maxResults = ${data.maxResults || 10};
  const markAsRead = ${data.markAsRead || false};
  
  const threads = GmailApp.search(query, 0, maxResults);
  const emails = [];
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      emails.push({
        id: message.getId(),
        subject: message.getSubject(),
        from: message.getFrom(),
        to: message.getTo(),
        date: message.getDate(),
        body: message.getPlainBody(),
        htmlBody: message.getBody(),
        isUnread: message.isUnread(),
        threadId: thread.getId(),
        labels: message.getThread().getLabels().map(label => label.getName())
      });
      
      if (markAsRead && message.isUnread()) {
        message.markRead();
      }
    });
  });
  
  return {
    type: 'gmail_read',
    query: query,
    emailsRead: emails.length,
    emails: emails,
    status: 'completed'
  };`;
  }

  private generateSheetsAppendCode(data: any): string {
    return `
  // Append data to Google Sheets
  const spreadsheetId = '${data.spreadsheetId || ''}';
  const sheetName = '${data.sheetName || 'Sheet1'}';
  const values = ${JSON.stringify(data.values || [])};
  
  // Resolve dynamic values from context
  const resolvedValues = values.map(row => 
    row.map(cell => this.resolveTemplate(String(cell), context))
  );
  
  let sheet;
  if (spreadsheetId) {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.getActiveSheet();
  } else {
    sheet = SpreadsheetApp.getActiveSheet();
  }
  
  // Add timestamp if configured
  ${data.includeTimestamp ? `
  resolvedValues.forEach(row => {
    row.push(new Date().toISOString());
  });` : ''}
  
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, resolvedValues.length, resolvedValues[0].length);
  range.setValues(resolvedValues);
  
  return {
    type: 'sheets_append',
    spreadsheetId: spreadsheetId,
    sheetName: sheetName,
    rowsAdded: resolvedValues.length,
    lastRow: sheet.getLastRow(),
    status: 'completed'
  };`;
  }

  private generateSheetsReadCode(data: any): string {
    return `
  // Read data from Google Sheets
  const spreadsheetId = '${data.spreadsheetId || ''}';
  const sheetName = '${data.sheetName || 'Sheet1'}';
  const range = '${data.range || 'A:Z'}';
  
  let sheet;
  if (spreadsheetId) {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.getActiveSheet();
  } else {
    sheet = SpreadsheetApp.getActiveSheet();
  }
  
  const dataRange = sheet.getRange(range);
  const values = dataRange.getValues();
  
  // Convert to objects if headers are in first row
  ${data.hasHeaders ? `
  const headers = values[0];
  const data = values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
  
  return {
    type: 'sheets_read',
    spreadsheetId: spreadsheetId,
    sheetName: sheetName,
    rowsRead: data.length,
    headers: headers,
    data: data,
    status: 'completed'
  };` : `
  return {
    type: 'sheets_read',
    spreadsheetId: spreadsheetId,
    sheetName: sheetName,
    rowsRead: values.length,
    data: values,
    status: 'completed'
  };`}`;
  }

  private generateDriveCreateCode(data: any): string {
    return `
  // Create file in Google Drive
  const fileName = \`${data.fileName || 'automation-file.txt'}\`;
  const content = \`${data.content || 'Generated by automation'}\`;
  const mimeType = '${data.mimeType || 'text/plain'}';
  const folderId = '${data.folderId || ''}';
  
  // Resolve dynamic content
  const resolvedFileName = this.resolveTemplate(fileName, context);
  const resolvedContent = this.resolveTemplate(content, context);
  
  let file;
  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    file = folder.createFile(resolvedFileName, resolvedContent, mimeType);
  } else {
    file = DriveApp.createFile(resolvedFileName, resolvedContent, mimeType);
  }
  
  return {
    type: 'drive_create',
    fileId: file.getId(),
    fileName: resolvedFileName,
    fileUrl: file.getUrl(),
    size: file.getSize(),
    status: 'created'
  };`;
  }

  private generateHttpRequestCode(data: any): string {
    return `
  // Make HTTP request
  const url = \`${data.url || 'https://api.example.com'}\`;
  const method = '${data.method || 'GET'}';
  const headers = ${JSON.stringify(data.headers || {})};
  const payload = ${JSON.stringify(data.payload || {})};
  
  // Resolve dynamic values
  const resolvedUrl = this.resolveTemplate(url, context);
  const resolvedPayload = JSON.stringify(payload).replace(/{{([^}]+)}}/g, (match, key) => {
    return this.getContextValue(context, key) || match;
  });
  
  const options = {
    method: method,
    headers: headers,
    ${data.method !== 'GET' ? 'payload: resolvedPayload,' : ''}
    muteHttpExceptions: true
  };
  
  // Add authentication if configured
  ${data.authType === 'bearer' ? `
  const token = PropertiesService.getScriptProperties().getProperty('${data.tokenProperty || 'API_TOKEN'}');
  if (token) {
    options.headers['Authorization'] = 'Bearer ' + token;
  }` : ''}
  
  ${data.authType === 'apikey' ? `
  const apiKey = PropertiesService.getScriptProperties().getProperty('${data.apiKeyProperty || 'API_KEY'}');
  if (apiKey) {
    options.headers['${data.apiKeyHeader || 'X-API-Key'}'] = apiKey;
  }` : ''}
  
  const response = UrlFetchApp.fetch(resolvedUrl, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = responseText;
  }
  
  if (responseCode >= 400) {
    throw new Error(\`HTTP request failed: \${responseCode} - \${responseText}\`);
  }
  
  return {
    type: 'http_request',
    url: resolvedUrl,
    method: method,
    responseCode: responseCode,
    responseData: responseData,
    status: 'completed'
  };`;
  }

  private generateConditionCode(data: any): string {
    return `
  // Conditional logic
  const condition = '${data.condition || 'true'}';
  const leftValue = this.getContextValue(context, '${data.leftValue || ''}');
  const operator = '${data.operator || '=='}';
  const rightValue = '${data.rightValue || ''}';
  
  let result = false;
  
  switch (operator) {
    case '==':
      result = leftValue == rightValue;
      break;
    case '!=':
      result = leftValue != rightValue;
      break;
    case '>':
      result = Number(leftValue) > Number(rightValue);
      break;
    case '<':
      result = Number(leftValue) < Number(rightValue);
      break;
    case '>=':
      result = Number(leftValue) >= Number(rightValue);
      break;
    case '<=':
      result = Number(leftValue) <= Number(rightValue);
      break;
    case 'contains':
      result = String(leftValue).includes(String(rightValue));
      break;
    case 'startsWith':
      result = String(leftValue).startsWith(String(rightValue));
      break;
    case 'endsWith':
      result = String(leftValue).endsWith(String(rightValue));
      break;
    default:
      result = Boolean(leftValue);
  }
  
  return {
    type: 'condition',
    leftValue: leftValue,
    operator: operator,
    rightValue: rightValue,
    result: result,
    status: 'evaluated'
  };`;
  }

  private generateDataMapperCode(data: any): string {
    return `
  // Data transformation
  const mapping = ${JSON.stringify(data.mapping || {})};
  const sourceData = this.getContextValue(context, '${data.sourceField || ''}');
  
  const transformedData = {};
  
  Object.keys(mapping).forEach(targetField => {
    const sourceField = mapping[targetField];
    if (sourceField.startsWith('{{') && sourceField.endsWith('}}')) {
      const fieldPath = sourceField.slice(2, -2);
      transformedData[targetField] = this.getContextValue(context, fieldPath);
    } else {
      transformedData[targetField] = sourceField;
    }
  });
  
  return {
    type: 'data_mapper',
    sourceData: sourceData,
    transformedData: transformedData,
    status: 'transformed'
  };`;
  }

  private generateDelayCode(data: any): string {
    return `
  // Add delay
  const delayMs = ${data.delayMs || 1000};
  const delaySeconds = ${data.delaySeconds || 0};
  
  const totalDelay = delayMs + (delaySeconds * 1000);
  
  if (totalDelay > 0) {
    Utilities.sleep(totalDelay);
  }
  
  return {
    type: 'delay',
    delayMs: totalDelay,
    status: 'completed'
  };`;
  }

  private generateLoggerCode(data: any): string {
    return `
  // Log message
  const message = \`${data.message || 'Log entry'}\`;
  const level = '${data.level || 'info'}';
  
  const resolvedMessage = this.resolveTemplate(message, context);
  const logEntry = \`[\${level.toUpperCase()}] \${new Date().toISOString()}: \${resolvedMessage}\`;
  
  Logger.log(logEntry);
  
  ${data.saveToSheet ? `
  // Also save to spreadsheet if configured
  try {
    const logSheet = SpreadsheetApp.openById('${data.logSpreadsheetId || ''}').getSheetByName('${data.logSheetName || 'Logs'}');
    logSheet.appendRow([new Date(), level, resolvedMessage, context.correlationId]);
  } catch (e) {
    Logger.log('Failed to save log to sheet: ' + e.toString());
  }` : ''}
  
  return {
    type: 'logger',
    message: resolvedMessage,
    level: level,
    timestamp: new Date(),
    status: 'logged'
  };`;
  }

  /**
   * Generate helper files
   */
  private generateHelperFiles(graph: any, options: CompilerOptions): CompiledFile[] {
    const files: CompiledFile[] = [];

    // Runtime helpers
    files.push({
      name: 'RuntimeHelpers.js',
      content: this.generateRuntimeHelpers(options),
      type: 'javascript',
      description: 'Runtime utility functions'
    });

    // HTTP helpers
    files.push({
      name: 'HttpHelpers.js',
      content: this.generateHttpHelpers(options),
      type: 'javascript',
      description: 'HTTP request utilities'
    });

    // Storage helpers
    files.push({
      name: 'StorageHelpers.js',
      content: this.generateStorageHelpers(options),
      type: 'javascript',
      description: 'Data storage utilities'
    });

    return files;
  }

  private generateRuntimeHelpers(options: CompilerOptions): string {
    return `
/**
 * Enhanced Runtime Helper Functions for ALL Applications
 * Generated by Production Graph Compiler with retry logic and error handling
 */

// Global error tracking
var errorLog = [];
var maxErrors = 100;

function logError(error, context) {
  var timestamp = new Date().toISOString();
  var errorEntry = {
    timestamp: timestamp,
    error: error.toString(),
    context: context || 'unknown',
    stack: error.stack || 'no stack trace'
  };
  
  errorLog.unshift(errorEntry);
  if (errorLog.length > maxErrors) {
    errorLog = errorLog.slice(0, maxErrors);
  }
  
  console.error('[' + timestamp + '] ' + context + ':', error);
  
  // Store in Properties for persistence
  try {
    PropertiesService.getScriptProperties().setProperty('error_log', JSON.stringify(errorLog.slice(0, 10)));
  } catch (e) {
    console.error('Failed to persist error log:', e);
  }
}

function getErrorLog() {
  try {
    var stored = PropertiesService.getScriptProperties().getProperty('error_log');
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return errorLog.slice(0, 10);
  }
}

// Enhanced backoff with jitter for ALL applications
function backoff_(attemptNumber, baseDelay) {
  baseDelay = baseDelay || 500; // Default 500ms
  var maxDelay = 60000; // 60 seconds max
  var jitter = Math.floor(Math.random() * 250); // Random jitter up to 250ms
  
  var delay = Math.min(maxDelay, baseDelay * Math.pow(2, attemptNumber) + jitter);
  console.log('Backing off for ' + delay + 'ms (attempt ' + (attemptNumber + 1) + ')');
  Utilities.sleep(delay);
}

// Enhanced lock service with timeout and retry for ALL applications
function withLock_(func, timeoutMs, maxRetries) {
  timeoutMs = timeoutMs || 30000; // 30 second default timeout
  maxRetries = maxRetries || 3;
  
  for (var retry = 0; retry < maxRetries; retry++) {
    var lock = LockService.getScriptLock();
    
    try {
      if (lock.waitLock(timeoutMs)) {
        console.log('Lock acquired, executing function...');
        var result = func();
        return result;
      } else {
        console.warn('Failed to acquire lock within ' + timeoutMs + 'ms (attempt ' + (retry + 1) + ')');
        if (retry < maxRetries - 1) {
          Utilities.sleep(1000 + Math.random() * 2000); // Random wait 1-3 seconds
        }
      }
    } catch (error) {
      logError(error, 'Function execution under lock');
      throw error;
    } finally {
      try {
        lock.releaseLock();
        console.log('Lock released');
      } catch (e) {
        console.warn('Failed to release lock:', e.toString());
      }
    }
  }
  
  throw new Error('Could not acquire lock after ' + maxRetries + ' attempts');
}

// Deduplication service for ALL applications (prevents duplicate processing)
function markSeen_(key, ttlMinutes) {
  ttlMinutes = ttlMinutes || 60; // Default 1 hour
  var timestamp = new Date().getTime();
  var expiryTime = timestamp + (ttlMinutes * 60 * 1000);
  
  try {
    PropertiesService.getScriptProperties().setProperty('seen_' + key, expiryTime.toString());
    return true;
  } catch (error) {
    logError(error, 'Mark seen: ' + key);
    return false;
  }
}

function wasSeen_(key) {
  try {
    var expiryTime = PropertiesService.getScriptProperties().getProperty('seen_' + key);
    if (!expiryTime) return false;
    
    var now = new Date().getTime();
    if (now > parseInt(expiryTime)) {
      // Expired, clean up
      PropertiesService.getScriptProperties().deleteProperty('seen_' + key);
      return false;
    }
    
    return true;
  } catch (error) {
    logError(error, 'Check seen: ' + key);
    return false; // Assume not seen on error
  }
}

/**
 * Resolve template variables in strings
 */
function resolveTemplate(template, context) {
  if (typeof template !== 'string') return template;
  
  return template.replace(/{{([^}]+)}}/g, (match, path) => {
    const value = getContextValue(context, path.trim());
    return value !== undefined ? value : match;
  });
}

/**
 * Get value from context using dot notation
 */
function getContextValue(context, path) {
  if (!path) return undefined;
  
  const parts = path.split('.');
  let current = context;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * Safe JSON parsing with fallback
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

/**
 * Format date for logging
 */
function formatDate(date = new Date()) {
  return date.toISOString();
}

/**
 * Generate correlation ID for tracking
 */
function generateCorrelationId() {
  return Utilities.getUuid();
}

${options.includeRateLimiting ? `
/**
 * Rate limiting with PropertiesService
 */
function checkRateLimit(key, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const properties = PropertiesService.getScriptProperties();
  const rateLimitData = safeJsonParse(properties.getProperty('rate_limit_' + key), {});
  
  if (!rateLimitData.window || now > rateLimitData.window + windowMs) {
    // Reset window
    rateLimitData.window = now;
    rateLimitData.count = 1;
  } else {
    rateLimitData.count = (rateLimitData.count || 0) + 1;
  }
  
  properties.setProperty('rate_limit_' + key, JSON.stringify(rateLimitData));
  
  if (rateLimitData.count > maxRequests) {
    throw new Error(\`Rate limit exceeded for \${key}: \${rateLimitData.count}/\${maxRequests} requests\`);
  }
  
  return rateLimitData;
}` : ''}

/**
 * Retry function with exponential backoff
 */
function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        Logger.log(\`Retry attempt \${attempt + 1} failed, waiting \${delay}ms: \${error.toString()}\`);
        Utilities.sleep(delay);
      }
    }
  }
  
  throw lastError;
}
`;
  }

  private generateHttpHelpers(options: CompilerOptions): string {
    return `
/**
 * Enhanced HTTP Helper Functions for ALL Applications
 * With retry logic, jitter, and improved error handling
 */

// Enhanced HTTP fetch with retry logic for ALL applications
function fetchJson_(request, maxAttempts, context) {
  maxAttempts = maxAttempts || 5;
  context = context || 'HTTP Request';
  
  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(context + ': Attempt ' + (attempt + 1) + '/' + maxAttempts);
      
      var response = UrlFetchApp.fetch(request.url, request);
      var statusCode = response.getResponseCode();
      var responseText = response.getContentText();
      
      console.log(context + ': HTTP ' + statusCode + ' received');
      
      // Handle different status codes appropriately
      if (statusCode >= 200 && statusCode < 300) {
        // Success - parse JSON safely
        return {
          status: statusCode,
          body: safeJsonParse_(responseText, responseText),
          headers: response.getAllHeaders(),
          success: true
        };
      } else if (statusCode === 429 || statusCode >= 500) {
        // Rate limited or server error - retry with backoff
        if (attempt < maxAttempts - 1) {
          console.warn(context + ': Retryable error ' + statusCode + ', backing off...');
          backoff_(attempt);
          continue;
        }
      } else if (statusCode >= 400 && statusCode < 500) {
        // Client error - don't retry
        logError(new Error('HTTP ' + statusCode + ': ' + responseText), context);
        return {
          status: statusCode,
          body: safeJsonParse_(responseText, responseText),
          headers: response.getAllHeaders(),
          success: false,
          error: 'Client error: ' + statusCode
        };
      }
      
      // If we get here, it's a non-retryable error
      throw new Error('HTTP ' + statusCode + ': ' + responseText);
      
    } catch (error) {
      var isNetworkError = error.toString().indexOf('DNS') !== -1 || 
                          error.toString().indexOf('timeout') !== -1 ||
                          error.toString().indexOf('connection') !== -1;
      
      if (isNetworkError && attempt < maxAttempts - 1) {
        console.warn(context + ': Network error, retrying...', error.toString());
        backoff_(attempt);
        continue;
      } else if (attempt === maxAttempts - 1) {
        // Final attempt failed
        logError(error, context);
        return {
          status: 0,
          body: null,
          success: false,
          error: 'Max retries exceeded: ' + error.toString()
        };
      }
      
      // Re-throw if not final attempt
      throw error;
    }
  }
  
  // Should never reach here
  return {
    status: 0,
    body: null,
    success: false,
    error: 'Unexpected error in fetchJson_'
  };
}

// Safe JSON parsing with fallback for ALL applications
function safeJsonParse_(text, fallback) {
  try {
    if (!text || text.trim() === '') {
      return fallback || null;
    }
    return JSON.parse(text);
  } catch (error) {
    console.warn('JSON parse failed, returning fallback:', error.toString());
    logError(error, 'JSON Parsing');
    return fallback || text;
  }
}

/**
 * Make authenticated HTTP request (LEGACY - replaced by fetchJson_)
 */
function makeAuthenticatedRequest(url, options = {}) {
  const defaultOptions = {
    method: 'GET',
    headers: {},
    muteHttpExceptions: true
  };
  
  const requestOptions = Object.assign(defaultOptions, options);
  
  // Add common headers
  requestOptions.headers['User-Agent'] = 'Google-Apps-Script-Automation/1.0';
  requestOptions.headers['Accept'] = 'application/json';
  
  if (requestOptions.method !== 'GET' && requestOptions.payload) {
    if (typeof requestOptions.payload === 'object') {
      requestOptions.payload = JSON.stringify(requestOptions.payload);
      requestOptions.headers['Content-Type'] = 'application/json';
    }
  }
  
  // Use new enhanced fetchJson_ function
  return fetchJson_({
    url: url,
    method: requestOptions.method,
    headers: requestOptions.headers,
    payload: requestOptions.payload,
    muteHttpExceptions: true
  }, 5, 'makeAuthenticatedRequest');
}

/**
 * POST JSON data
 */
function postJson(url, data, headers = {}) {
  return makeAuthenticatedRequest(url, {
    method: 'POST',
    payload: data,
    headers: headers
  });
}

/**
 * GET with query parameters
 */
function getWithParams(url, params = {}) {
  const queryString = Object.keys(params)
    .map(key => \`\${encodeURIComponent(key)}=\${encodeURIComponent(params[key])}\`)
    .join('&');
    
  const fullUrl = queryString ? \`\${url}?\${queryString}\` : url;
  
  return makeAuthenticatedRequest(fullUrl);
}
`;
  }

  private generateStorageHelpers(options: CompilerOptions): string {
    return `
/**
 * Storage Helper Functions
 */

/**
 * Secure storage using PropertiesService
 */
const SecureStorage = {
  
  set: function(key, value) {
    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(key, JSON.stringify(value));
  },
  
  get: function(key, defaultValue = null) {
    const properties = PropertiesService.getScriptProperties();
    const value = properties.getProperty(key);
    return value ? safeJsonParse(value, defaultValue) : defaultValue;
  },
  
  remove: function(key) {
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty(key);
  },
  
  has: function(key) {
    const properties = PropertiesService.getScriptProperties();
    return properties.getProperty(key) !== null;
  },
  
  // Batch operations
  setMultiple: function(keyValuePairs) {
    const properties = PropertiesService.getScriptProperties();
    const serialized = {};
    Object.keys(keyValuePairs).forEach(key => {
      serialized[key] = JSON.stringify(keyValuePairs[key]);
    });
    properties.setProperties(serialized);
  },
  
  getMultiple: function(keys) {
    const properties = PropertiesService.getScriptProperties();
    const result = {};
    keys.forEach(key => {
      const value = properties.getProperty(key);
      result[key] = value ? safeJsonParse(value) : null;
    });
    return result;
  }
};

/**
 * Deduplication helper
 */
function markProcessed(id, ttlHours = 24) {
  const key = 'processed_' + id;
  const expiresAt = Date.now() + (ttlHours * 60 * 60 * 1000);
  
  SecureStorage.set(key, {
    processedAt: Date.now(),
    expiresAt: expiresAt
  });
}

function isAlreadyProcessed(id) {
  const key = 'processed_' + id;
  const data = SecureStorage.get(key);
  
  if (!data) return false;
  
  // Check if expired
  if (Date.now() > data.expiresAt) {
    SecureStorage.remove(key);
    return false;
  }
  
  return true;
}

/**
 * Cleanup expired entries
 */
function cleanupExpiredEntries() {
  // This would need to be called periodically
  // Google Apps Script doesn't have a built-in way to iterate all properties
  Logger.log('Cleanup would run here - implement based on your key patterns');
}
`;
  }

  /**
   * Generate manifest file
   */
  private generateManifest(graph: any, requiredScopes: string[], options: CompilerOptions): any {
    return {
      timeZone: options.timezone || 'America/New_York',
      dependencies: {},
      exceptionLogging: 'STACKDRIVER',
      runtimeVersion: 'V8',
      oauthScopes: requiredScopes,
      webapp: {
        access: 'ANYONE_ANONYMOUS',
        executeAs: 'USER_DEPLOYING'
      },
      executionApi: {
        access: 'ANYONE'
      }
    };
  }

  /**
   * Generate trigger setup code
   */
  private generateTriggerSetup(graph: any): string | null {
    const triggers = graph.nodes.filter(node => node.type.startsWith('trigger.'));
    
    if (triggers.length === 0) return null;

    let code = `
/**
 * Trigger Setup and Management
 */

/**
 * Install all triggers for this workflow
 */
function installTriggers() {
  // Delete existing triggers first
  deleteTriggers();
  
`;

    triggers.forEach(trigger => {
      switch (trigger.type) {
        case 'trigger.time.cron':
          code += this.generateTimeTriggerSetup(trigger);
          break;
        case 'trigger.webhook':
          code += this.generateWebhookTriggerSetup(trigger);
          break;
        case 'trigger.gmail.new_email':
          code += this.generateGmailTriggerSetup(trigger);
          break;
      }
    });

    code += `
  Logger.log('All triggers installed successfully');
}

/**
 * Delete all triggers for this workflow
 */
function deleteTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction().startsWith('executeWorkflow')) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Webhook entry point (for HTTP triggers)
 */
function doPost(e) {
  try {
    const triggerData = {
      method: 'POST',
      headers: e.parameter,
      body: e.postData ? JSON.parse(e.postData.contents) : {},
      query: e.parameter
    };
    
    const result = executeWorkflow(triggerData);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Webhook execution failed: ' + error.toString());
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET webhook entry point
 */
function doGet(e) {
  try {
    const triggerData = {
      method: 'GET',
      headers: {},
      body: {},
      query: e.parameter
    };
    
    const result = executeWorkflow(triggerData);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Webhook execution failed: ' + error.toString());
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;

    return code;
  }

  private generateTimeTriggerSetup(trigger: any): string {
    const schedule = trigger.data.schedule || '@daily';
    
    if (schedule.startsWith('@')) {
      // Predefined schedules
      const scheduleMap = {
        '@daily': 'ScriptApp.newTrigger("executeWorkflow").timeBased().everyDays(1)',
        '@hourly': 'ScriptApp.newTrigger("executeWorkflow").timeBased().everyHours(1)',
        '@weekly': 'ScriptApp.newTrigger("executeWorkflow").timeBased().everyWeeks(1)'
      };
      
      return `
  // Time trigger: ${schedule}
  ${scheduleMap[schedule] || scheduleMap['@daily']}.create();
`;
    } else {
      // Cron-style (simplified)
      return `
  // Time trigger: ${schedule}
  ScriptApp.newTrigger('executeWorkflow')
    .timeBased()
    .everyDays(1)
    .create();
`;
    }
  }

  private generateWebhookTriggerSetup(trigger: any): string {
    return `
  // Webhook trigger setup
  // Note: Deploy as web app to get webhook URL
  Logger.log('Webhook trigger configured - deploy as web app to activate');
`;
  }

  private generateGmailTriggerSetup(trigger: any): string {
    return `
  // Gmail trigger: ${trigger.data.query || 'is:unread'}
  ScriptApp.newTrigger('executeWorkflow')
    .timeBased()
    .everyMinutes(5) // Check every 5 minutes
    .create();
`;
  }

  /**
   * Generate file header with metadata
   */
  private generateFileHeader(graph: any, options: CompilerOptions): string {
    return `
/**
 * Google Apps Script Automation
 * Generated by Production Graph Compiler
 * 
 * Workflow: ${graph.name || 'Unnamed Workflow'}
 * Description: ${graph.description || 'No description'}
 * Generated: ${new Date().toISOString()}
 * Version: ${options.version || '1.0.0'}
 * 
 * ⚠️  DO NOT EDIT MANUALLY - This file is auto-generated
 */

`;
  }

  /**
   * Generate deployment instructions
   */
  private generateDeploymentInstructions(graph: any, options: CompilerOptions): string {
    return `
# Deployment Instructions for ${graph.name || 'Workflow'}

## Prerequisites
1. Google Apps Script project created
2. Required OAuth scopes authorized
3. API keys stored in PropertiesService (if needed)

## Deployment Steps

### 1. Upload Files
Copy all generated files to your Google Apps Script project:
- Code.js (main execution)
- RuntimeHelpers.js (utilities)
- HttpHelpers.js (HTTP functions)
- StorageHelpers.js (storage functions)
- Triggers.js (trigger setup)

### 2. Set Up Properties
In your Apps Script project, go to Project Settings > Script Properties and add:
${this.generateRequiredProperties(graph)}

### 3. Install Triggers
Run the \`installTriggers()\` function once to set up automated execution.

### 4. Test Execution
Run \`executeWorkflow({})\` to test the workflow manually.

### 5. Deploy as Web App (if using webhooks)
1. Click "Deploy" > "New Deployment"
2. Choose "Web app" as type
3. Set execute as "Me" and access to "Anyone"
4. Copy the web app URL for webhook configuration

## Monitoring
- Check execution logs in Apps Script editor
- Monitor quota usage in Google Cloud Console
- Set up error notifications via email

## Troubleshooting
- Verify all OAuth scopes are authorized
- Check PropertiesService for required API keys
- Review execution logs for detailed error messages
`;
  }

  private generateRequiredProperties(graph: any): string {
    const properties = [];
    
    // Scan nodes for required properties
    graph.nodes.forEach(node => {
      if (node.type === 'action.http.request') {
        if (node.data.authType === 'bearer') {
          properties.push(`${node.data.tokenProperty || 'API_TOKEN'}: Your bearer token`);
        }
        if (node.data.authType === 'apikey') {
          properties.push(`${node.data.apiKeyProperty || 'API_KEY'}: Your API key`);
        }
      }
    });
    
    if (properties.length === 0) {
      return '(No additional properties required)';
    }
    
    return properties.map(prop => `- ${prop}`).join('\n');
  }

  /**
   * Get execution order using topological sort
   */
  private getExecutionOrder(nodes: any[], edges: any[]): string[] {
    const nodeIds = nodes.map(n => n.id);
    const dependencies = new Map();
    
    // Initialize dependencies
    nodeIds.forEach(id => dependencies.set(id, new Set()));
    
    // Build dependency graph
    edges.forEach(edge => {
      if (dependencies.has(edge.target)) {
        dependencies.get(edge.target).add(edge.source);
      }
    });
    
    // Topological sort
    const result = [];
    const visited = new Set();
    const visiting = new Set();
    
    function visit(nodeId) {
      if (visiting.has(nodeId)) {
        throw new Error(`Circular dependency detected involving node: ${nodeId}`);
      }
      
      if (visited.has(nodeId)) return;
      
      visiting.add(nodeId);
      
      const deps = dependencies.get(nodeId) || new Set();
      deps.forEach(depId => {
        if (nodeIds.includes(depId)) {
          visit(depId);
        }
      });
      
      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    }
    
    nodeIds.forEach(id => {
      if (!visited.has(id)) {
        visit(id);
      }
    });
    
    return result;
  }
}

export const productionGraphCompiler = new ProductionGraphCompiler();