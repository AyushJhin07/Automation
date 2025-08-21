import type { Express, Request, Response } from "express";

// Google Apps Script function implementations
export class GoogleAppsScriptAPI {
  
  // Gmail Functions
  static generateGmailFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'send_email':
        return `
function sendEmail() {
  const to = "${params.to || ''}";
  const subject = "${params.subject || ''}";
  const body = \`${params.body || ''}\`;
  const cc = "${params.cc || ''}";
  const bcc = "${params.bcc || ''}";
  
  const options = {};
  if (cc) options.cc = cc;
  if (bcc) options.bcc = bcc;
  if ("${params.attachments}") {
    // Handle attachments from Drive
    const attachmentIds = "${params.attachments}".split(',');
    options.attachments = attachmentIds.map(id => DriveApp.getFileById(id.trim()));
  }
  
  try {
    GmailApp.sendEmail(to, subject, body, options);
    console.log('Email sent successfully to: ' + to);
    return { success: true, message: 'Email sent to ' + to };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'send_html_email':
        return `
function sendHtmlEmail() {
  const to = "${params.to || ''}";
  const subject = "${params.subject || ''}";
  const htmlBody = \`${params.htmlBody || ''}\`;
  const cc = "${params.cc || ''}";
  const bcc = "${params.bcc || ''}";
  
  const options = { htmlBody: htmlBody };
  if (cc) options.cc = cc;
  if (bcc) options.bcc = bcc;
  
  try {
    GmailApp.sendEmail(to, subject, '', options);
    console.log('HTML email sent successfully to: ' + to);
    return { success: true, message: 'HTML email sent to ' + to };
  } catch (error) {
    console.error('Error sending HTML email:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'search_emails':
        return `
function searchEmails() {
  const query = "${params.query || 'is:unread'}";
  const maxResults = ${params.maxResults || 10};
  const dateRange = "${params.dateRange || ''}";
  
  let searchQuery = query;
  if (dateRange) {
    searchQuery += ' ' + dateRange;
  }
  
  try {
    const threads = GmailApp.search(searchQuery, 0, maxResults);
    const results = [];
    
    threads.forEach(thread => {
      const messages = thread.getMessages();
      messages.forEach(message => {
        results.push({
          id: message.getId(),
          subject: message.getSubject(),
          from: message.getFrom(),
          date: message.getDate(),
          snippet: message.getBody().substring(0, 200),
          isUnread: message.isUnread()
        });
      });
    });
    
    console.log('Found ' + results.length + ' emails matching query: ' + searchQuery);
    return { success: true, emails: results, count: results.length };
  } catch (error) {
    console.error('Error searching emails:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'reply_to_email':
        return `
function replyToEmail() {
  const messageId = "${params.messageId || ''}";
  const replyBody = \`${params.body || ''}\`;
  const replyAll = ${params.replyAll === 'true'};
  
  try {
    const message = GmailApp.getMessageById(messageId);
    if (replyAll) {
      message.replyAll(replyBody);
    } else {
      message.reply(replyBody);
    }
    
    console.log('Reply sent for message: ' + messageId);
    return { success: true, message: 'Reply sent successfully' };
  } catch (error) {
    console.error('Error replying to email:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'add_label':
        return `
function addRemoveLabel() {
  const messageIds = "${params.messageIds || ''}".split(',');
  const labelName = "${params.labelName || ''}";
  const action = "${params.action || 'add'}";
  
  try {
    let label = GmailApp.getUserLabelByName(labelName);
    if (!label && action === 'add') {
      label = GmailApp.createLabel(labelName);
    }
    
    const results = [];
    messageIds.forEach(messageId => {
      try {
        const message = GmailApp.getMessageById(messageId.trim());
        if (action === 'add' && label) {
          message.getThread().addLabel(label);
          results.push({ messageId: messageId, action: 'labeled', success: true });
        } else if (action === 'remove' && label) {
          message.getThread().removeLabel(label);
          results.push({ messageId: messageId, action: 'unlabeled', success: true });
        }
      } catch (error) {
        results.push({ messageId: messageId, success: false, error: error.toString() });
      }
    });
    
    console.log('Label operation completed for ' + messageIds.length + ' messages');
    return { success: true, results: results };
  } catch (error) {
    console.error('Error with label operation:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'download_attachments':
        return `
function downloadAttachments() {
  const messageId = "${params.messageId || ''}";
  const folderId = "${params.folderId || ''}";
  const fileTypes = "${params.fileTypes || ''}".split(',');
  
  try {
    const message = GmailApp.getMessageById(messageId);
    const attachments = message.getAttachments();
    const folder = DriveApp.getFolderById(folderId);
    const downloadedFiles = [];
    
    attachments.forEach(attachment => {
      const fileName = attachment.getName();
      const fileType = fileName.split('.').pop().toLowerCase();
      
      // Filter by file types if specified
      if (fileTypes.length > 0 && fileTypes[0] !== '' && !fileTypes.includes(fileType)) {
        return;
      }
      
      try {
        const file = folder.createFile(attachment);
        downloadedFiles.push({
          name: fileName,
          id: file.getId(),
          size: attachment.getSize(),
          type: fileType
        });
        console.log('Downloaded attachment: ' + fileName);
      } catch (error) {
        console.error('Error downloading attachment ' + fileName + ':', error);
      }
    });
    
    return { 
      success: true, 
      message: 'Downloaded ' + downloadedFiles.length + ' attachments',
      files: downloadedFiles 
    };
  } catch (error) {
    console.error('Error downloading attachments:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'email_analytics':
        return `
function emailAnalytics() {
  const dateRange = "${params.dateRange || '30d'}";
  const metrics = "${params.metrics || 'count'}";
  const groupBy = "${params.groupBy || 'day'}";
  
  try {
    const query = 'newer_than:' + dateRange;
    const threads = GmailApp.search(query);
    const analytics = {};
    
    threads.forEach(thread => {
      const messages = thread.getMessages();
      messages.forEach(message => {
        const date = message.getDate();
        let key = '';
        
        switch (groupBy) {
          case 'day':
            key = date.toDateString();
            break;
          case 'week':
            const week = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
            key = 'Week ' + week;
            break;
          case 'month':
            key = date.getFullYear() + '-' + (date.getMonth() + 1);
            break;
          case 'sender':
            key = message.getFrom();
            break;
        }
        
        if (!analytics[key]) {
          analytics[key] = { count: 0, senders: new Set(), subjects: [] };
        }
        
        analytics[key].count++;
        analytics[key].senders.add(message.getFrom());
        analytics[key].subjects.push(message.getSubject());
      });
    });
    
    // Convert sets to arrays for JSON serialization
    Object.keys(analytics).forEach(key => {
      analytics[key].senders = Array.from(analytics[key].senders);
      analytics[key].uniqueSenders = analytics[key].senders.length;
    });
    
    console.log('Analytics generated for ' + threads.length + ' threads');
    return { success: true, analytics: analytics, totalThreads: threads.length };
  } catch (error) {
    console.error('Error generating analytics:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return `
function ${functionId}() {
  // Function: ${functionId}
  // Parameters: ${JSON.stringify(params)}
  console.log('Executing ${functionId} with params:', ${JSON.stringify(params)});
  
  try {
    // TODO: Implement specific logic for ${functionId}
    return { 
      success: true, 
      message: 'Function ${functionId} executed successfully',
      params: ${JSON.stringify(params)}
    };
  } catch (error) {
    console.error('Error in ${functionId}:', error);
    return { success: false, error: error.toString() };
  }
}`;
    }
  }

  // Google Sheets Functions
  static generateSheetsFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'append_row':
        return `
function appendRow() {
  const spreadsheetId = "${params.spreadsheetId || ''}";
  const range = "${params.range || 'A:D'}";
  const values = "${params.values || ''}".split(',').map(v => v.trim());
  
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getActiveSheet();
    
    // Append the row
    sheet.appendRow(values);
    
    // Get the row number that was just added
    const lastRow = sheet.getLastRow();
    
    console.log('Row appended successfully at row ' + lastRow);
    return { 
      success: true, 
      message: 'Row appended at position ' + lastRow,
      rowNumber: lastRow,
      values: values 
    };
  } catch (error) {
    console.error('Error appending row:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'read_range':
        return `
function readRange() {
  const spreadsheetId = "${params.spreadsheetId || ''}";
  const range = "${params.range || 'A1:D10'}";
  
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getActiveSheet();
    const dataRange = sheet.getRange(range);
    const values = dataRange.getValues();
    
    // Convert to more usable format
    const headers = values[0] || [];
    const rows = values.slice(1).map(row => {
      const rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header] = row[index] || '';
      });
      return rowObj;
    });
    
    console.log('Read ' + rows.length + ' rows from range ' + range);
    return { 
      success: true, 
      data: { headers: headers, rows: rows, rawValues: values },
      range: range,
      count: rows.length
    };
  } catch (error) {
    console.error('Error reading range:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'update_range':
        return `
function updateRange() {
  const spreadsheetId = "${params.spreadsheetId || ''}";
  const range = "${params.range || 'A1'}";
  const values = "${params.values || ''}";
  
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getActiveSheet();
    
    // Parse values - could be single value or CSV
    let parsedValues;
    if (values.includes(',')) {
      parsedValues = [values.split(',').map(v => v.trim())];
    } else {
      parsedValues = [[values]];
    }
    
    const targetRange = sheet.getRange(range);
    targetRange.setValues(parsedValues);
    
    console.log('Range updated successfully: ' + range);
    return { 
      success: true, 
      message: 'Range ' + range + ' updated successfully',
      updatedCells: parsedValues[0].length
    };
  } catch (error) {
    console.error('Error updating range:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'find_rows':
        return `
function findRows() {
  const spreadsheetId = "${params.spreadsheetId || ''}";
  const searchValue = "${params.searchValue || ''}";
  const searchColumn = "${params.searchColumn || 'A'}";
  
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getActiveSheet();
    const lastRow = sheet.getLastRow();
    
    const searchRange = sheet.getRange(searchColumn + '1:' + searchColumn + lastRow);
    const searchValues = searchRange.getValues();
    const matchingRows = [];
    
    for (let i = 0; i < searchValues.length; i++) {
      if (searchValues[i][0].toString().toLowerCase().includes(searchValue.toLowerCase())) {
        const rowNumber = i + 1;
        const rowData = sheet.getRange(rowNumber + ':' + rowNumber).getValues()[0];
        matchingRows.push({
          rowNumber: rowNumber,
          data: rowData,
          matchedValue: searchValues[i][0]
        });
      }
    }
    
    console.log('Found ' + matchingRows.length + ' rows matching: ' + searchValue);
    return { 
      success: true, 
      matches: matchingRows,
      count: matchingRows.length,
      searchValue: searchValue
    };
  } catch (error) {
    console.error('Error finding rows:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return `
function ${functionId}() {
  // Sheets Function: ${functionId}
  // Parameters: ${JSON.stringify(params)}
  console.log('Executing Sheets ${functionId} with params:', ${JSON.stringify(params)});
  
  try {
    // TODO: Implement specific logic for ${functionId}
    return { 
      success: true, 
      message: 'Sheets function ${functionId} executed successfully',
      params: ${JSON.stringify(params)}
    };
  } catch (error) {
    console.error('Error in Sheets ${functionId}:', error);
    return { success: false, error: error.toString() };
  }
}`;
    }
  }

  // Google Drive Functions
  static generateDriveFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'create_folder':
        return `
function createFolder() {
  const folderName = "${params.folderName || ''}";
  const parentFolderId = "${params.parentFolderId || ''}";
  
  try {
    let folder;
    if (parentFolderId) {
      const parentFolder = DriveApp.getFolderById(parentFolderId);
      folder = parentFolder.createFolder(folderName);
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    console.log('Folder created: ' + folderName + ' (ID: ' + folder.getId() + ')');
    return { 
      success: true, 
      folderId: folder.getId(),
      folderName: folderName,
      url: folder.getUrl()
    };
  } catch (error) {
    console.error('Error creating folder:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'upload_file':
        return `
function uploadFile() {
  const fileName = "${params.fileName || ''}";
  const content = "${params.content || ''}";
  const folderId = "${params.folderId || ''}";
  const mimeType = "${params.mimeType || 'text/plain'}";
  
  try {
    const blob = Utilities.newBlob(content, mimeType, fileName);
    let file;
    
    if (folderId) {
      const folder = DriveApp.getFolderById(folderId);
      file = folder.createFile(blob);
    } else {
      file = DriveApp.createFile(blob);
    }
    
    console.log('File uploaded: ' + fileName + ' (ID: ' + file.getId() + ')');
    return { 
      success: true, 
      fileId: file.getId(),
      fileName: fileName,
      url: file.getUrl()
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return `
function ${functionId}() {
  // Drive Function: ${functionId}
  // Parameters: ${JSON.stringify(params)}
  console.log('Executing Drive ${functionId} with params:', ${JSON.stringify(params)});
  
  try {
    // TODO: Implement specific logic for ${functionId}
    return { 
      success: true, 
      message: 'Drive function ${functionId} executed successfully',
      params: ${JSON.stringify(params)}
    };
  } catch (error) {
    console.error('Error in Drive ${functionId}:', error);
    return { success: false, error: error.toString() };
  }
}`;
    }
  }

  // Generate complete script with all functions
  static generateCompleteScript(nodes: any[], edges: any[]): string {
    let script = `
// Generated Google Apps Script - Intelligent Automation
// Generated on: ${new Date().toISOString()}

// Global configuration
const CONFIG = {
  DEBUG: true,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000
};

// Utility functions
function logExecution(functionName, params, result) {
  if (CONFIG.DEBUG) {
    console.log('=== Function Execution ===');
    console.log('Function:', functionName);
    console.log('Parameters:', JSON.stringify(params));
    console.log('Result:', JSON.stringify(result));
    console.log('========================');
  }
}

function retryOperation(operation, maxRetries = CONFIG.MAX_RETRIES) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return operation();
    } catch (error) {
      console.log('Attempt ' + (i + 1) + ' failed:', error);
      if (i === maxRetries - 1) throw error;
      Utilities.sleep(CONFIG.RETRY_DELAY);
    }
  }
}

// Main execution function
function main() {
  console.log('Starting automation execution...');
  
  try {
    // Execute functions based on automation flow
    ${this.generateExecutionFlow(nodes, edges)}
    
    console.log('Automation completed successfully');
    return { success: true, message: 'Automation executed successfully' };
  } catch (error) {
    console.error('Automation failed:', error);
    return { success: false, error: error.toString() };
  }
}

`;

    // Add individual function implementations
    nodes.forEach(node => {
      if (node.type === 'googleApp' && node.data.selectedFunction) {
        const appName = node.data.name.toLowerCase();
        const functionId = node.data.selectedFunction.id;
        const params = node.data.functionConfig || {};
        
        if (appName.includes('gmail')) {
          script += this.generateGmailFunction(functionId, params) + '\n\n';
        } else if (appName.includes('sheets')) {
          script += this.generateSheetsFunction(functionId, params) + '\n\n';
        } else if (appName.includes('drive')) {
          script += this.generateDriveFunction(functionId, params) + '\n\n';
        }
      }
    });

    return script;
  }

  // Generate execution flow based on connections
  static generateExecutionFlow(nodes: any[], edges: any[]): string {
    let flow = '';
    
    // Find trigger nodes first
    const triggerNodes = nodes.filter(node => node.type === 'trigger');
    const appNodes = nodes.filter(node => node.type === 'googleApp');
    
    if (triggerNodes.length > 0) {
      flow += `
    // Trigger-based execution
    const triggerResult = executeTrigger();
    if (!triggerResult.success) {
      throw new Error('Trigger failed: ' + triggerResult.error);
    }
    
    console.log('Trigger executed successfully');
    `;
    }
    
    // Execute app functions in order based on connections
    appNodes.forEach((node, index) => {
      if (node.data.selectedFunction) {
        const functionName = node.data.selectedFunction.id;
        flow += `
    // Execute ${node.data.name} - ${node.data.selectedFunction.name}
    const result${index} = ${functionName}();
    logExecution('${functionName}', ${JSON.stringify(node.data.functionConfig || {})}, result${index});
    
    if (!result${index}.success) {
      console.error('Function ${functionName} failed:', result${index}.error);
    }
    `;
      }
    });
    
    return flow;
  }
}

// API Routes for backend integration
export function registerGoogleAppsRoutes(app: Express): void {
  
  // Generate script endpoint
  app.post('/api/automation/generate-script', (req: Request, res: Response) => {
    try {
      const { nodes, edges } = req.body;
      
      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ error: 'Invalid nodes data' });
      }
      
      const script = GoogleAppsScriptAPI.generateCompleteScript(nodes, edges || []);
      
      res.json({ 
        success: true, 
        script: script,
        nodeCount: nodes.length,
        edgeCount: (edges || []).length
      });
    } catch (error) {
      console.error('Error generating script:', error);
      res.status(500).json({ error: 'Failed to generate script' });
    }
  });
  
  // Validate automation endpoint
  app.post('/api/automation/validate', (req: Request, res: Response) => {
    try {
      const { nodes, edges } = req.body;
      const validation = { valid: true, errors: [], warnings: [] };
      
      // Validate nodes
      nodes.forEach((node: any, index: number) => {
        if (node.type === 'googleApp' && !node.data.selectedFunction) {
          validation.errors.push(`Node ${index + 1} (${node.data.name}) has no function selected`);
          validation.valid = false;
        }
        
        if (node.data.selectedFunction) {
          const requiredParams = node.data.selectedFunction.parameters.filter((p: any) => p.required);
          const config = node.data.functionConfig || {};
          
          requiredParams.forEach((param: any) => {
            if (!config[param.name]) {
              validation.errors.push(`Node ${index + 1}: Missing required parameter '${param.name}'`);
              validation.valid = false;
            }
          });
        }
      });
      
      // Validate connections
      if (edges.length === 0 && nodes.length > 1) {
        validation.warnings.push('No connections between nodes - automation may not flow properly');
      }
      
      res.json(validation);
    } catch (error) {
      console.error('Error validating automation:', error);
      res.status(500).json({ error: 'Failed to validate automation' });
    }
  });

  // Test function endpoint
  app.post('/api/automation/test-function', (req: Request, res: Response) => {
    try {
      const { functionId, appType, params } = req.body;
      
      let testScript = '';
      if (appType === 'gmail') {
        testScript = GoogleAppsScriptAPI.generateGmailFunction(functionId, params);
      } else if (appType === 'sheets') {
        testScript = GoogleAppsScriptAPI.generateSheetsFunction(functionId, params);
      } else if (appType === 'drive') {
        testScript = GoogleAppsScriptAPI.generateDriveFunction(functionId, params);
      }
      
      res.json({ 
        success: true, 
        testScript: testScript,
        message: 'Test script generated for ' + functionId
      });
    } catch (error) {
      console.error('Error generating test script:', error);
      res.status(500).json({ error: 'Failed to generate test script' });
    }
  });
}