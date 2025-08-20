import { Node, Edge } from 'reactflow';
import { GoogleAppsNodeData, TriggerNodeData } from './types';

export class GoogleAppsScriptGenerator {
  private generateFunctionImplementation(app: GoogleAppsNodeData): string {
    if (!app.selectedFunction || !app.functionConfig) {
      return `// ${app.name} - No function selected`;
    }

    const func = app.selectedFunction;
    const config = app.functionConfig;

    switch (app.id) {
      case 'gmail':
        return this.generateGmailFunction(func.id, config);
      case 'sheets':
        return this.generateSheetsFunction(func.id, config);
      case 'drive':
        return this.generateDriveFunction(func.id, config);
      case 'docs':
        return this.generateDocsFunction(func.id, config);
      case 'calendar':
        return this.generateCalendarFunction(func.id, config);
      default:
        return `// Unsupported app: ${app.name}`;
    }
  }

  private generateGmailFunction(functionId: string, config: Record<string, any>): string {
    switch (functionId) {
      case 'search_emails':
        return `
  // Search emails by query
  const threads = GmailApp.search('${config.query || 'is:unread'}', 0, ${config.maxResults || 10});
  const emails = [];
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      emails.push({
        subject: message.getSubject(),
        from: message.getFrom(),
        date: message.getDate(),
        body: message.getPlainBody(),
        snippet: message.getBody().substring(0, 200)
      });
    });
  });
  
  Logger.log('Found ' + emails.length + ' emails');
  return emails;`;

      case 'send_email':
        return `
  // Send email
  const emailData = {
    to: '${config.to || 'recipient@example.com'}',
    subject: '${config.subject || 'Automated Email'}',
    body: \`${config.body || 'This is an automated email.'}\`,
    cc: '${config.cc || ''}',
    bcc: '${config.bcc || ''}'
  };
  
  GmailApp.sendEmail(
    emailData.to,
    emailData.subject,
    emailData.body,
    {
      cc: emailData.cc,
      bcc: emailData.bcc,
      htmlBody: emailData.body
    }
  );
  
  Logger.log('Email sent successfully to: ' + emailData.to);`;

      case 'read_latest_message':
        return `
  // Read latest messages from label
  const label = GmailApp.getUserLabelByName('${config.labelName || 'INBOX'}');
  const threads = label ? label.getThreads(0, 10) : GmailApp.getInboxThreads(0, 10);
  const latestMessages = [];
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      latestMessages.push({
        subject: latestMessage.getSubject(),
        from: latestMessage.getFrom(),
        date: latestMessage.getDate(),
        snippet: latestMessage.getPlainBody().substring(0, 200)
      });
    }
  });
  
  return latestMessages;`;

      case 'add_label':
        return `
  // Add or remove labels
  const label = GmailApp.getUserLabelByName('${config.labelName || 'Processed'}');
  const threads = GmailApp.search('is:unread', 0, 10);
  
  threads.forEach(thread => {
    if ('${config.action}' === 'add') {
      thread.addLabel(label);
    } else if ('${config.action}' === 'remove') {
      thread.removeLabel(label);
    }
  });
  
  Logger.log('Label operation completed for ' + threads.length + ' threads');`;

      case 'download_attachments':
        return `
  // Download email attachments to Drive
  const threads = GmailApp.search('has:attachment', 0, 10);
  const folder = DriveApp.getFolderById('${config.folderId}');
  let attachmentCount = 0;
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      const attachments = message.getAttachments();
      attachments.forEach(attachment => {
        folder.createFile(attachment);
        attachmentCount++;
      });
    });
  });
  
  Logger.log('Downloaded ' + attachmentCount + ' attachments');`;

      default:
        return `// Gmail function '${functionId}' not implemented`;
    }
  }

  private generateSheetsFunction(functionId: string, config: Record<string, any>): string {
    switch (functionId) {
      case 'append_row':
        return `
  // Append row to sheet
  const spreadsheet = SpreadsheetApp.openById('${config.spreadsheetId}');
  const sheet = spreadsheet.getActiveSheet();
  const values = '${config.values}'.split(',').map(v => v.trim());
  
  sheet.appendRow(values);
  Logger.log('Row appended successfully');`;

      case 'read_range':
        return `
  // Read range from sheet
  const spreadsheet = SpreadsheetApp.openById('${config.spreadsheetId}');
  const sheet = spreadsheet.getActiveSheet();
  const range = sheet.getRange('${config.range}');
  const values = range.getValues();
  
  Logger.log('Read ' + values.length + ' rows from range ${config.range}');
  return values;`;

      case 'update_range':
        return `
  // Update range in sheet
  const spreadsheet = SpreadsheetApp.openById('${config.spreadsheetId}');
  const sheet = spreadsheet.getActiveSheet();
  const range = sheet.getRange('${config.range}');
  const values = JSON.parse('${config.values}'); // Expecting JSON array
  
  range.setValues(values);
  Logger.log('Range ${config.range} updated successfully');`;

      case 'find_rows':
        return `
  // Find rows by value
  const spreadsheet = SpreadsheetApp.openById('${config.spreadsheetId}');
  const sheet = spreadsheet.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const searchColumn = '${config.searchColumn}'.charCodeAt(0) - 'A'.charCodeAt(0);
  const foundRows = [];
  
  data.forEach((row, index) => {
    if (row[searchColumn] === '${config.searchValue}') {
      foundRows.push({ rowIndex: index + 1, data: row });
    }
  });
  
  Logger.log('Found ' + foundRows.length + ' matching rows');
  return foundRows;`;

      case 'create_sheet':
        return `
  // Create new sheet
  const spreadsheet = SpreadsheetApp.openById('${config.spreadsheetId}');
  const newSheet = spreadsheet.insertSheet('${config.sheetName}');
  
  Logger.log('Created new sheet: ${config.sheetName}');
  return newSheet.getSheetId();`;

      default:
        return `// Sheets function '${functionId}' not implemented`;
    }
  }

  private generateDriveFunction(functionId: string, config: Record<string, any>): string {
    switch (functionId) {
      case 'create_folder':
        return `
  // Create folder in Drive
  const parentFolder = '${config.parentFolderId}' ? 
    DriveApp.getFolderById('${config.parentFolderId}') : 
    DriveApp.getRootFolder();
  
  const newFolder = parentFolder.createFolder('${config.folderName}');
  Logger.log('Created folder: ${config.folderName}');
  return newFolder.getId();`;

      case 'search_files':
        return `
  // Search files in Drive
  const query = '${config.query}';
  const files = DriveApp.searchFiles(query);
  const results = [];
  
  while (files.hasNext()) {
    const file = files.next();
    results.push({
      name: file.getName(),
      id: file.getId(),
      size: file.getSize(),
      lastUpdated: file.getLastUpdated()
    });
  }
  
  Logger.log('Found ' + results.length + ' files');
  return results;`;

      case 'export_as_pdf':
        return `
  // Export file as PDF
  const sourceFile = DriveApp.getFileById('${config.fileId}');
  const blob = sourceFile.getBlob();
  const pdfBlob = blob.getAs('application/pdf');
  const pdfName = '${config.exportName || 'exported-file.pdf'}';
  
  const pdfFile = DriveApp.createFile(pdfBlob.setName(pdfName));
  Logger.log('Exported PDF: ' + pdfName);
  return pdfFile.getId();`;

      default:
        return `// Drive function '${functionId}' not implemented`;
    }
  }

  private generateDocsFunction(functionId: string, config: Record<string, any>): string {
    switch (functionId) {
      case 'create_document':
        return `
  // Create new document
  const doc = DocumentApp.create('${config.title}');
  
  ${config.templateId ? `
  // Copy from template
  const template = DocumentApp.openById('${config.templateId}');
  const templateBody = template.getBody();
  const newBody = doc.getBody();
  newBody.replaceText('.*', templateBody.getText());
  ` : ''}
  
  Logger.log('Created document: ${config.title}');
  return doc.getId();`;

      case 'find_replace':
        return `
  // Find and replace text
  const doc = DocumentApp.openById('${config.documentId}');
  const body = doc.getBody();
  
  body.replaceText('${config.findText}', '${config.replaceText}');
  Logger.log('Replaced text in document');`;

      case 'insert_text':
        return `
  // Insert text into document
  const doc = DocumentApp.openById('${config.documentId}');
  const body = doc.getBody();
  
  ${config.index ? 
    `body.insertText(${config.index}, '${config.text}');` :
    `body.appendParagraph('${config.text}');`
  }
  
  Logger.log('Text inserted into document');`;

      case 'insert_table':
        return `
  // Insert table into document
  const doc = DocumentApp.openById('${config.documentId}');
  const body = doc.getBody();
  
  const table = body.appendTable();
  for (let i = 0; i < ${config.rows || 3}; i++) {
    const row = table.appendTableRow();
    for (let j = 0; j < ${config.columns || 3}; j++) {
      row.appendTableCell('Cell ' + (i + 1) + ',' + (j + 1));
    }
  }
  
  Logger.log('Table inserted with ${config.rows || 3} rows and ${config.columns || 3} columns');`;

      default:
        return `// Docs function '${functionId}' not implemented`;
    }
  }

  private generateCalendarFunction(functionId: string, config: Record<string, any>): string {
    switch (functionId) {
      case 'create_event':
        return `
  // Create calendar event
  const calendar = CalendarApp.getDefaultCalendar();
  const event = calendar.createEvent(
    '${config.title}',
    new Date('${config.startTime}'),
    new Date('${config.endTime}'),
    {
      description: '${config.description || ''}',
      location: '${config.location || ''}'
    }
  );
  
  Logger.log('Created event: ${config.title}');
  return event.getId();`;

      case 'get_events':
        return `
  // Get calendar events
  const calendar = CalendarApp.getDefaultCalendar();
  const startDate = new Date('${config.startDate}');
  const endDate = new Date('${config.endDate}');
  const events = calendar.getEvents(startDate, endDate);
  
  const eventData = events.map(event => ({
    title: event.getTitle(),
    start: event.getStartTime(),
    end: event.getEndTime(),
    description: event.getDescription()
  }));
  
  Logger.log('Found ' + events.length + ' events');
  return eventData;`;

      default:
        return `// Calendar function '${functionId}' not implemented`;
    }
  }

  private generateTriggerSetup(trigger: TriggerNodeData): string {
    if (!trigger.config) return '';

    switch (trigger.id) {
      case 'time_based':
        const frequency = trigger.config.frequency;
        return `
  // Set up time-based trigger
  ScriptApp.newTrigger('main')
    .timeBased()
    .${frequency}()
    .create();`;

      case 'form_submit':
        return `
  // Set up form submit trigger
  const form = FormApp.openById('${trigger.config.formId}');
  ScriptApp.newTrigger('main')
    .onFormSubmit()
    .create();`;

      case 'email_received':
        return `
  // Note: Gmail doesn't have direct triggers, use time-based polling
  // This function should be called by a time-based trigger every 5-15 minutes
  function checkNewEmails() {
    const threads = GmailApp.search('${trigger.config.searchQuery || 'is:unread'}');
    if (threads.length > 0) {
      main(); // Call main automation function
    }
  }`;

      default:
        return '';
    }
  }

  generateScript(nodes: Node[], edges: Edge[]): string {
    const triggers = nodes.filter(node => node.type === 'trigger') as Node<TriggerNodeData>[];
    const appNodes = nodes.filter(node => node.type === 'googleApp') as Node<GoogleAppsNodeData>[];

    let script = `/**
 * Google Apps Script Automation
 * Generated automatically - customize as needed
 */

function main() {
  try {
`;

    // Generate main function logic
    appNodes.forEach((node, index) => {
      script += `
    // ${node.data.name} - ${node.data.selectedFunction?.name || 'No function selected'}
    ${this.generateFunctionImplementation(node.data)}
`;
      if (index < appNodes.length - 1) {
        script += '\n    // Continue to next step...\n';
      }
    });

    script += `
  } catch (error) {
    Logger.log('Error in automation: ' + error.toString());
    // Optionally send error notification
    // GmailApp.sendEmail('admin@yourdomain.com', 'Automation Error', error.toString());
  }
}

// Required scopes (add to manifest):
/*
{
  "oauthScopes": [
`;

    // Collect all required scopes
    const allScopes = new Set<string>();
    appNodes.forEach(node => {
      node.data.scopes.forEach(scope => allScopes.add(scope));
    });

    allScopes.forEach(scope => {
      script += `    "${scope}",\n`;
    });

    script += `  ]
}
*/

`;

    // Add trigger setup if any
    if (triggers.length > 0) {
      script += `
// Trigger setup function (run once to set up automation)
function setupTriggers() {
`;
      triggers.forEach(trigger => {
        script += this.generateTriggerSetup(trigger.data);
      });
      script += `
  Logger.log('Triggers set up successfully');
}
`;
    }

    script += `
// Test function
function testAutomation() {
  Logger.log('Testing automation...');
  main();
  Logger.log('Test completed - check logs for results');
}`;

    return script;
  }
}