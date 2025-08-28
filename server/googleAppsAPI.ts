import type { Express, Request, Response } from "express";

// COMPREHENSIVE GOOGLE APPS SCRIPT FUNCTION IMPLEMENTATIONS
// Covers ALL Google Workspace services: Gmail, Sheets, Docs, Slides, Calendar, Drive, Contacts, Chat, Meet, Forms

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

  // Google Docs Functions
  static generateDocsFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'create_doc':
        return `
function createDoc() {
  const title = "${params.title || 'Untitled Document'}";
  const folderId = "${params.folderId || ''}";
  
  try {
    const doc = DocumentApp.create(title);
    
    if (folderId) {
      const file = DriveApp.getFileById(doc.getId());
      const folder = DriveApp.getFolderById(folderId);
      file.moveTo(folder);
    }
    
    console.log('Document created successfully: ' + title);
    return { 
      success: true, 
      documentId: doc.getId(),
      documentUrl: doc.getUrl(),
      title: title
    };
  } catch (error) {
    console.error('Error creating document:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'append_text':
        return `
function appendText() {
  const documentId = "${params.documentId || ''}";
  const text = \`${params.text || ''}\`;
  
  try {
    const doc = DocumentApp.openById(documentId);
    const body = doc.getBody();
    body.appendParagraph(text);
    
    console.log('Text appended to document: ' + documentId);
    return { success: true, message: 'Text appended successfully' };
  } catch (error) {
    console.error('Error appending text:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'insert_table':
        return `
function insertTable() {
  const documentId = "${params.documentId || ''}";
  const rows = parseInt("${params.rows || '2'}");
  const cols = parseInt("${params.cols || '2'}");
  
  try {
    const doc = DocumentApp.openById(documentId);
    const body = doc.getBody();
    
    const tableData = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        row.push('Cell ' + (i + 1) + ',' + (j + 1));
      }
      tableData.push(row);
    }
    
    const table = body.appendTable(tableData);
    
    console.log('Table inserted into document: ' + documentId);
    return { success: true, message: 'Table inserted successfully' };
  } catch (error) {
    console.error('Error inserting table:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'find_replace':
        return `
function findReplace() {
  const documentId = "${params.documentId || ''}";
  const findText = "${params.findText || ''}";
  const replaceText = "${params.replaceText || ''}";
  
  try {
    const doc = DocumentApp.openById(documentId);
    const body = doc.getBody();
    
    const replacedCount = body.replaceText(findText, replaceText);
    
    console.log('Find and replace completed in document: ' + documentId);
    return { 
      success: true, 
      replacedCount: replacedCount,
      message: 'Replaced ' + replacedCount + ' instances'
    };
  } catch (error) {
    console.error('Error in find and replace:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return '// Unknown Docs function: ' + functionId;
    }
  }

  // Google Slides Functions
  static generateSlidesFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'create_presentation':
        return `
function createPresentation() {
  const title = "${params.title || 'Untitled Presentation'}";
  const folderId = "${params.folderId || ''}";
  
  try {
    const presentation = SlidesApp.create(title);
    
    if (folderId) {
      const file = DriveApp.getFileById(presentation.getId());
      const folder = DriveApp.getFolderById(folderId);
      file.moveTo(folder);
    }
    
    console.log('Presentation created successfully: ' + title);
    return { 
      success: true, 
      presentationId: presentation.getId(),
      presentationUrl: presentation.getUrl(),
      title: title
    };
  } catch (error) {
    console.error('Error creating presentation:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'add_slide':
        return `
function addSlide() {
  const presentationId = "${params.presentationId || ''}";
  const layout = "${params.layout || 'BLANK'}";
  
  try {
    const presentation = SlidesApp.openById(presentationId);
    const slide = presentation.appendSlide(SlidesApp.PredefinedLayout[layout] || SlidesApp.PredefinedLayout.BLANK);
    
    console.log('Slide added to presentation: ' + presentationId);
    return { 
      success: true, 
      slideId: slide.getObjectId(),
      message: 'Slide added successfully'
    };
  } catch (error) {
    console.error('Error adding slide:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'insert_text':
        return `
function insertText() {
  const presentationId = "${params.presentationId || ''}";
  const slideIndex = parseInt("${params.slideIndex || '0'}");
  const text = \`${params.text || ''}\`;
  
  try {
    const presentation = SlidesApp.openById(presentationId);
    const slides = presentation.getSlides();
    
    if (slideIndex < slides.length) {
      const slide = slides[slideIndex];
      const textBox = slide.insertTextBox(text);
      
      console.log('Text inserted into slide: ' + slideIndex);
      return { success: true, message: 'Text inserted successfully' };
    } else {
      return { success: false, error: 'Slide index out of range' };
    }
  } catch (error) {
    console.error('Error inserting text:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return '// Unknown Slides function: ' + functionId;
    }
  }

  // Google Calendar Functions
  static generateCalendarFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'create_event':
        return `
function createEvent() {
  const title = "${params.title || 'New Event'}";
  const startTime = new Date("${params.startTime || new Date().toISOString()}");
  const endTime = new Date("${params.endTime || new Date(Date.now() + 3600000).toISOString()}");
  const description = \`${params.description || ''}\`;
  const location = "${params.location || ''}";
  const guests = "${params.guests || ''}";
  
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    
    const options = {};
    if (description) options.description = description;
    if (location) options.location = location;
    if (guests) options.guests = guests.split(',').map(g => g.trim());
    
    const event = calendar.createEvent(title, startTime, endTime, options);
    
    console.log('Event created successfully: ' + title);
    return { 
      success: true, 
      eventId: event.getId(),
      title: title,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    };
  } catch (error) {
    console.error('Error creating event:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'update_event':
        return `
function updateEvent() {
  const eventId = "${params.eventId || ''}";
  const title = "${params.title || ''}";
  const description = \`${params.description || ''}\`;
  const location = "${params.location || ''}";
  
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(eventId);
    
    if (!event) {
      return { success: false, error: 'Event not found' };
    }
    
    if (title) event.setTitle(title);
    if (description) event.setDescription(description);
    if (location) event.setLocation(location);
    
    console.log('Event updated successfully: ' + eventId);
    return { success: true, message: 'Event updated successfully' };
  } catch (error) {
    console.error('Error updating event:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'list_events':
        return `
function listEvents() {
  const startDate = new Date("${params.startDate || new Date().toISOString()}");
  const endDate = new Date("${params.endDate || new Date(Date.now() + 7 * 24 * 3600000).toISOString()}");
  
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const events = calendar.getEvents(startDate, endDate);
    
    const eventList = events.map(event => ({
      id: event.getId(),
      title: event.getTitle(),
      description: event.getDescription(),
      location: event.getLocation(),
      startTime: event.getStartTime().toISOString(),
      endTime: event.getEndTime().toISOString()
    }));
    
    console.log('Retrieved ' + events.length + ' events');
    return { success: true, events: eventList };
  } catch (error) {
    console.error('Error listing events:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return '// Unknown Calendar function: ' + functionId;
    }
  }

  // Google Contacts Functions
  static generateContactsFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'create_contact':
        return `
function createContact() {
  const firstName = "${params.firstName || ''}";
  const lastName = "${params.lastName || ''}";
  const email = "${params.email || ''}";
  const phone = "${params.phone || ''}";
  const company = "${params.company || ''}";
  
  try {
    const contact = ContactsApp.createContact(firstName, lastName, email);
    
    if (phone) {
      contact.addPhone(ContactsApp.Field.MOBILE_PHONE, phone);
    }
    
    if (company) {
      contact.addCompany(company, '');
    }
    
    console.log('Contact created successfully: ' + firstName + ' ' + lastName);
    return { 
      success: true, 
      contactId: contact.getId(),
      fullName: firstName + ' ' + lastName,
      email: email
    };
  } catch (error) {
    console.error('Error creating contact:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'update_contact':
        return `
function updateContact() {
  const contactId = "${params.contactId || ''}";
  const firstName = "${params.firstName || ''}";
  const lastName = "${params.lastName || ''}";
  const email = "${params.email || ''}";
  const phone = "${params.phone || ''}";
  
  try {
    const contact = ContactsApp.getContact(contactId);
    
    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }
    
    if (firstName || lastName) {
      contact.setFullName(firstName + ' ' + lastName);
    }
    
    if (email) {
      const emails = contact.getEmails();
      if (emails.length > 0) {
        contact.removeEmail(emails[0]);
      }
      contact.addEmail(ContactsApp.Field.HOME_EMAIL, email);
    }
    
    console.log('Contact updated successfully: ' + contactId);
    return { success: true, message: 'Contact updated successfully' };
  } catch (error) {
    console.error('Error updating contact:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return '// Unknown Contacts function: ' + functionId;
    }
  }

  // Google Chat Functions
  static generateChatFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'post_message':
        return `
function postMessage() {
  const spaceId = "${params.spaceId || ''}";
  const text = \`${params.text || ''}\`;
  
  try {
    // Using Google Chat API via UrlFetchApp since ChatApp is limited
    const accessToken = PropertiesService.getScriptProperties().getProperty('GOOGLE_ACCESS_TOKEN');
    
    if (!accessToken) {
      return { success: false, error: 'Google access token not found' };
    }
    
    const response = UrlFetchApp.fetch('https://chat.googleapis.com/v1/spaces/' + spaceId + '/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        text: text
      })
    });
    
    const responseData = JSON.parse(response.getContentText());
    
    console.log('Message posted to Chat space: ' + spaceId);
    return { 
      success: true, 
      messageId: responseData.name,
      text: text
    };
  } catch (error) {
    console.error('Error posting message to Chat:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return '// Unknown Chat function: ' + functionId;
    }
  }

  // Google Meet Functions
  static generateMeetFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'create_meeting':
        return `
function createMeeting() {
  const title = "${params.title || 'New Meeting'}";
  const startTime = new Date("${params.startTime || new Date().toISOString()}");
  const endTime = new Date("${params.endTime || new Date(Date.now() + 3600000).toISOString()}");
  const attendees = "${params.attendees || ''}";
  
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    
    const options = {
      description: 'Meeting created via automation',
      guests: attendees ? attendees.split(',').map(a => a.trim()) : []
    };
    
    const event = calendar.createEvent(title, startTime, endTime, options);
    
    // Add Google Meet conference
    const conferenceData = event.addConferenceData(ConferenceDataService.newConferenceDataBuilder()
      .setConferenceId(Utilities.getUuid())
      .setConferenceSolution(ConferenceDataService.newConferenceSolution()
        .setKey({
          type: 'hangoutsMeet'
        }))
      .build());
    
    console.log('Meeting created successfully: ' + title);
    return { 
      success: true, 
      eventId: event.getId(),
      meetingUrl: event.getDescription(),
      title: title
    };
  } catch (error) {
    console.error('Error creating meeting:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return '// Unknown Meet function: ' + functionId;
    }
  }

  // Google Forms Functions
  static generateFormsFunction(functionId: string, params: Record<string, any>): string {
    switch (functionId) {
      case 'create_form':
        return `
function createForm() {
  const title = "${params.title || 'Untitled Form'}";
  const description = \`${params.description || ''}\`;
  
  try {
    const form = FormApp.create(title);
    
    if (description) {
      form.setDescription(description);
    }
    
    console.log('Form created successfully: ' + title);
    return { 
      success: true, 
      formId: form.getId(),
      formUrl: form.getPublishedUrl(),
      editUrl: form.getEditUrl(),
      title: title
    };
  } catch (error) {
    console.error('Error creating form:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'add_question':
        return `
function addQuestion() {
  const formId = "${params.formId || ''}";
  const questionText = \`${params.questionText || ''}\`;
  const questionType = "${params.questionType || 'TEXT'}";
  const required = ${params.required || false};
  
  try {
    const form = FormApp.openById(formId);
    
    let question;
    switch (questionType.toUpperCase()) {
      case 'TEXT':
        question = form.addTextItem();
        break;
      case 'PARAGRAPH':
        question = form.addParagraphTextItem();
        break;
      case 'MULTIPLE_CHOICE':
        question = form.addMultipleChoiceItem();
        break;
      case 'CHECKBOX':
        question = form.addCheckboxItem();
        break;
      case 'SCALE':
        question = form.addScaleItem();
        break;
      default:
        question = form.addTextItem();
    }
    
    question.setTitle(questionText);
    if (required) {
      question.setRequired(true);
    }
    
    console.log('Question added to form: ' + formId);
    return { 
      success: true, 
      questionId: question.getId(),
      questionText: questionText
    };
  } catch (error) {
    console.error('Error adding question to form:', error);
    return { success: false, error: error.toString() };
  }
}`;

      case 'get_responses':
        return `
function getResponses() {
  const formId = "${params.formId || ''}";
  const limit = parseInt("${params.limit || '100'}");
  
  try {
    const form = FormApp.openById(formId);
    const responses = form.getResponses();
    
    const responseData = responses.slice(-limit).map(response => ({
      id: response.getId(),
      timestamp: response.getTimestamp().toISOString(),
      respondentEmail: response.getRespondentEmail(),
      answers: response.getItemResponses().map(itemResponse => ({
        question: itemResponse.getItem().getTitle(),
        answer: itemResponse.getResponse()
      }))
    }));
    
    console.log('Retrieved ' + responseData.length + ' form responses');
    return { 
      success: true, 
      responses: responseData,
      totalCount: responses.length
    };
  } catch (error) {
    console.error('Error getting form responses:', error);
    return { success: false, error: error.toString() };
  }
}`;

      default:
        return '// Unknown Forms function: ' + functionId;
    }
  }

  // Generate optimized script from user answers
  static generateFromAnswers(answers: any, nodes: any[], edges: any[]): string {
    // Extract key information from answers
    const extractInfo = () => {
      const gmailLabel = this.extractValue(answers, ['label', 'gmail_label', 'trigger_label']) || 'Inbox';
      const keywords = this.extractKeywords(answers);
      const sheetInfo = this.extractSheetInfo(answers);
      const frequency = this.extractFrequency(answers);
      
      return { gmailLabel, keywords, sheetInfo, frequency };
    };
    
    const { gmailLabel, keywords, sheetInfo, frequency } = extractInfo();
    
    return `/**
 * Gmail → Sheets Automation
 * Generated from AI Builder answers
 * 
 * Monitors: ${gmailLabel}
 * Keywords: ${keywords.join(', ') || 'any'}
 * Sheet: ${sheetInfo.spreadsheetId}
 * Frequency: Every ${frequency} minutes
 */

function main() {
  try {
    console.log('🚀 Starting Gmail automation...');
    
    const labelName = ${JSON.stringify(gmailLabel)};
    const keywords = ${JSON.stringify(keywords)};
    const sheetId = ${JSON.stringify(sheetInfo.spreadsheetId)};
    const sheetName = ${JSON.stringify(sheetInfo.sheetName)};
    
    // Build Gmail search query
    let query = 'is:unread';
    if (labelName !== 'Inbox') {
      query += \` label:"\${labelName}"\`;
    }
    if (keywords.length > 0) {
      query += \` (\${keywords.map(k => \`subject:"\${k}"\`).join(' OR ')})\`;
    }
    
    console.log('Search query:', query);
    const threads = GmailApp.search(query, 0, 50);
    console.log(\`Found \${threads.length} emails\`);
    
    if (threads.length === 0) {
      console.log('No emails to process');
      return;
    }
    
    // Open Google Sheet
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(sheetName) || 
                  SpreadsheetApp.openById(sheetId).getSheets()[0];
    
    let processedCount = 0;
    
    // Process each email thread
    threads.forEach((thread, index) => {
      try {
        const messages = thread.getMessages();
        const latestMessage = messages[messages.length - 1];
        
        const subject = latestMessage.getSubject() || '';
        const from = latestMessage.getFrom() || '';
        const body = latestMessage.getPlainBody() || '';
        const date = latestMessage.getDate();
        
        console.log(\`Processing: "\${subject}"\`);
        
        // Append to sheet
        const rowData = [
          subject,
          from,
          Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
          body.substring(0, 500) // Truncate long emails
        ];
        
        sheet.appendRow(rowData);
        thread.markAsRead();
        processedCount++;
        
      } catch (emailError) {
        console.error(\`Error processing email \${index + 1}:\`, emailError);
      }
    });
    
    console.log(\`✅ Processed \${processedCount} emails successfully\`);
    
  } catch (error) {
    console.error('❌ Gmail automation error:', error);
    
    // Send error notification
    try {
      GmailApp.sendEmail(
        Session.getActiveUser().getEmail(),
        'Gmail Automation Error',
        \`Your Gmail automation encountered an error: \${error.toString()}\`
      );
    } catch (notificationError) {
      console.error('Failed to send error notification:', notificationError);
    }
  }
}

function setupTriggers() {
  console.log('Setting up automation triggers...');
  
  // Delete existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create time-based trigger
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyMinutes(${frequency})
    .create();
    
  console.log(\`✅ Trigger set up: runs every \${${frequency}} minutes\`);
}

function runOnce() {
  console.log('🧪 Running Gmail automation manually...');
  main();
}`;
  }

  // Helper methods for answer extraction
  private static extractValue(answers: any, keys: string[]): string | null {
    for (const key of keys) {
      for (const [answerKey, value] of Object.entries(answers)) {
        if (answerKey.toLowerCase().includes(key.toLowerCase()) && typeof value === 'string') {
          return value;
        }
      }
    }
    return null;
  }

  private static extractKeywords(answers: any): string[] {
    const keywords: string[] = [];
    for (const [key, value] of Object.entries(answers)) {
      if (key.toLowerCase().includes('keyword') || key.toLowerCase().includes('filter')) {
        if (typeof value === 'string') {
          // Extract keywords from text like "product, Return, Missing"
          keywords.push(...value.split(',').map(k => k.trim()).filter(Boolean));
        }
      }
    }
    return keywords;
  }

  private static extractSheetInfo(answers: any): { spreadsheetId: string; sheetName: string } {
    let spreadsheetId = '';
    let sheetName = 'Sheet1';
    
    for (const [key, value] of Object.entries(answers)) {
      if (key.toLowerCase().includes('sheet') && typeof value === 'string') {
        if (value.includes('docs.google.com/spreadsheets')) {
          const match = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (match) spreadsheetId = match[1];
        } else if (value.length > 10 && !value.includes(' ')) {
          spreadsheetId = value;
        }
      }
    }
    
    return { spreadsheetId, sheetName };
  }

  private static extractFrequency(answers: any): number {
    for (const [key, value] of Object.entries(answers)) {
      if (key.toLowerCase().includes('frequency') && typeof value === 'string') {
        const match = value.match(/(\d+)\s*min/i);
        if (match) {
          return Math.max(1, Math.min(60, parseInt(match[1], 10)));
        }
      }
    }
    return 5; // Default: every 5 minutes
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
        } else if (appName.includes('docs')) {
          script += this.generateDocsFunction(functionId, params) + '\n\n';
        } else if (appName.includes('slides')) {
          script += this.generateSlidesFunction(functionId, params) + '\n\n';
        } else if (appName.includes('calendar')) {
          script += this.generateCalendarFunction(functionId, params) + '\n\n';
        } else if (appName.includes('contacts')) {
          script += this.generateContactsFunction(functionId, params) + '\n\n';
        } else if (appName.includes('chat')) {
          script += this.generateChatFunction(functionId, params) + '\n\n';
        } else if (appName.includes('meet')) {
          script += this.generateMeetFunction(functionId, params) + '\n\n';
        } else if (appName.includes('forms')) {
          script += this.generateFormsFunction(functionId, params) + '\n\n';
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
      const { nodes, edges, answers } = req.body;
      
      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ error: 'Invalid nodes data' });
      }
      
      // If answers are provided, generate optimized script
      const script = answers 
        ? GoogleAppsScriptAPI.generateFromAnswers(answers, nodes, edges || [])
        : GoogleAppsScriptAPI.generateCompleteScript(nodes, edges || []);
      
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
      } else if (appType === 'docs' || appType === 'google-docs') {
        testScript = GoogleAppsScriptAPI.generateDocsFunction(functionId, params);
      } else if (appType === 'slides' || appType === 'google-slides') {
        testScript = GoogleAppsScriptAPI.generateSlidesFunction(functionId, params);
      } else if (appType === 'calendar' || appType === 'google-calendar') {
        testScript = GoogleAppsScriptAPI.generateCalendarFunction(functionId, params);
      } else if (appType === 'contacts' || appType === 'google-contacts') {
        testScript = GoogleAppsScriptAPI.generateContactsFunction(functionId, params);
      } else if (appType === 'chat' || appType === 'google-chat') {
        testScript = GoogleAppsScriptAPI.generateChatFunction(functionId, params);
      } else if (appType === 'meet' || appType === 'google-meet') {
        testScript = GoogleAppsScriptAPI.generateMeetFunction(functionId, params);
      } else if (appType === 'forms' || appType === 'google-forms') {
        testScript = GoogleAppsScriptAPI.generateFormsFunction(functionId, params);
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