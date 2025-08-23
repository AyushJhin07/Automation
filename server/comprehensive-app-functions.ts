// COMPREHENSIVE APPLICATION FUNCTIONS LIBRARY
// Building maximum possible functions for each of the 500+ applications

export interface AppFunction {
  id: string;
  name: string;
  description: string;
  category: 'trigger' | 'action' | 'both';
  parameters: Record<string, {
    type: string;
    required: boolean;
    description: string;
    options?: string[];
    default?: any;
  }>;
  requiredScopes: string[];
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    dailyLimit?: number;
  };
  pricing?: {
    costPerExecution?: number;
    includedInPlan?: string[];
  };
}

// ===== GMAIL - COMPLETE FUNCTION SET =====
export const GMAIL_FUNCTIONS: AppFunction[] = [
  // === EMAIL MANAGEMENT ===
  {
    id: 'send_email',
    name: 'Send Email',
    description: 'Send a new email message',
    category: 'action',
    parameters: {
      to: { type: 'string', required: true, description: 'Recipient email address' },
      cc: { type: 'string', required: false, description: 'CC recipients (comma-separated)' },
      bcc: { type: 'string', required: false, description: 'BCC recipients (comma-separated)' },
      subject: { type: 'string', required: true, description: 'Email subject' },
      body: { type: 'string', required: true, description: 'Email body content' },
      htmlBody: { type: 'string', required: false, description: 'HTML email body' },
      attachments: { type: 'array', required: false, description: 'File attachments' },
      replyTo: { type: 'string', required: false, description: 'Reply-to address' },
      importance: { type: 'string', required: false, description: 'Email importance', options: ['low', 'normal', 'high'] }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.send']
  },
  {
    id: 'reply_to_email',
    name: 'Reply to Email',
    description: 'Reply to an existing email',
    category: 'action',
    parameters: {
      messageId: { type: 'string', required: true, description: 'Original message ID' },
      body: { type: 'string', required: true, description: 'Reply body content' },
      htmlBody: { type: 'string', required: false, description: 'HTML reply body' },
      attachments: { type: 'array', required: false, description: 'File attachments' },
      replyAll: { type: 'boolean', required: false, description: 'Reply to all recipients', default: false }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'forward_email',
    name: 'Forward Email',
    description: 'Forward an email to other recipients',
    category: 'action',
    parameters: {
      messageId: { type: 'string', required: true, description: 'Original message ID' },
      to: { type: 'string', required: true, description: 'Forward to recipients' },
      message: { type: 'string', required: false, description: 'Additional message' },
      includeAttachments: { type: 'boolean', required: false, description: 'Include original attachments', default: true }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  
  // === EMAIL SEARCH & FILTERING ===
  {
    id: 'search_emails',
    name: 'Search Emails',
    description: 'Search for emails using Gmail search syntax',
    category: 'trigger',
    parameters: {
      query: { type: 'string', required: true, description: 'Gmail search query' },
      maxResults: { type: 'number', required: false, description: 'Maximum results to return', default: 10 },
      includeSpamTrash: { type: 'boolean', required: false, description: 'Include spam and trash', default: false },
      labelIds: { type: 'array', required: false, description: 'Filter by label IDs' },
      after: { type: 'string', required: false, description: 'Search after date (YYYY/MM/DD)' },
      before: { type: 'string', required: false, description: 'Search before date (YYYY/MM/DD)' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
  },
  {
    id: 'get_emails_by_label',
    name: 'Get Emails by Label',
    description: 'Retrieve emails with specific labels',
    category: 'trigger',
    parameters: {
      labelName: { type: 'string', required: true, description: 'Label name to filter by' },
      maxResults: { type: 'number', required: false, description: 'Maximum results', default: 10 },
      unreadOnly: { type: 'boolean', required: false, description: 'Only unread emails', default: false }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
  },
  {
    id: 'get_unread_emails',
    name: 'Get Unread Emails',
    description: 'Retrieve all unread emails',
    category: 'trigger',
    parameters: {
      maxResults: { type: 'number', required: false, description: 'Maximum results', default: 10 },
      fromSender: { type: 'string', required: false, description: 'Filter by sender email' },
      hasAttachment: { type: 'boolean', required: false, description: 'Only emails with attachments' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
  },
  
  // === EMAIL ORGANIZATION ===
  {
    id: 'add_label',
    name: 'Add Label to Email',
    description: 'Add labels to an email',
    category: 'action',
    parameters: {
      messageId: { type: 'string', required: true, description: 'Email message ID' },
      labelNames: { type: 'array', required: true, description: 'Label names to add' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'remove_label',
    name: 'Remove Label from Email',
    description: 'Remove labels from an email',
    category: 'action',
    parameters: {
      messageId: { type: 'string', required: true, description: 'Email message ID' },
      labelNames: { type: 'array', required: true, description: 'Label names to remove' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'create_label',
    name: 'Create Label',
    description: 'Create a new Gmail label',
    category: 'action',
    parameters: {
      name: { type: 'string', required: true, description: 'Label name' },
      color: { type: 'string', required: false, description: 'Label color' },
      visibility: { type: 'string', required: false, description: 'Label visibility', options: ['labelShow', 'labelHide'] }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.labels']
  },
  {
    id: 'mark_as_read',
    name: 'Mark as Read',
    description: 'Mark emails as read',
    category: 'action',
    parameters: {
      messageIds: { type: 'array', required: true, description: 'Array of message IDs' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'mark_as_unread',
    name: 'Mark as Unread',
    description: 'Mark emails as unread',
    category: 'action',
    parameters: {
      messageIds: { type: 'array', required: true, description: 'Array of message IDs' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'archive_email',
    name: 'Archive Email',
    description: 'Archive emails (remove from inbox)',
    category: 'action',
    parameters: {
      messageIds: { type: 'array', required: true, description: 'Array of message IDs' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'delete_email',
    name: 'Delete Email',
    description: 'Delete emails permanently',
    category: 'action',
    parameters: {
      messageIds: { type: 'array', required: true, description: 'Array of message IDs' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'star_email',
    name: 'Star Email',
    description: 'Add star to emails',
    category: 'action',
    parameters: {
      messageIds: { type: 'array', required: true, description: 'Array of message IDs' },
      starType: { type: 'string', required: false, description: 'Type of star', options: ['yellow', 'blue', 'red', 'orange', 'green', 'purple'] }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },
  {
    id: 'unstar_email',
    name: 'Unstar Email',
    description: 'Remove star from emails',
    category: 'action',
    parameters: {
      messageIds: { type: 'array', required: true, description: 'Array of message IDs' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.modify']
  },

  // === ATTACHMENT MANAGEMENT ===
  {
    id: 'download_attachment',
    name: 'Download Attachment',
    description: 'Download email attachments',
    category: 'action',
    parameters: {
      messageId: { type: 'string', required: true, description: 'Email message ID' },
      attachmentId: { type: 'string', required: true, description: 'Attachment ID' },
      savePath: { type: 'string', required: false, description: 'Save location path' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
  },
  {
    id: 'save_attachment_to_drive',
    name: 'Save Attachment to Drive',
    description: 'Save email attachment directly to Google Drive',
    category: 'action',
    parameters: {
      messageId: { type: 'string', required: true, description: 'Email message ID' },
      attachmentId: { type: 'string', required: true, description: 'Attachment ID' },
      driveFolder: { type: 'string', required: false, description: 'Drive folder ID' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/drive.file']
  },

  // === EMAIL TRIGGERS ===
  {
    id: 'new_email_received',
    name: 'New Email Received',
    description: 'Trigger when new email is received',
    category: 'trigger',
    parameters: {
      fromSender: { type: 'string', required: false, description: 'Filter by sender' },
      withSubject: { type: 'string', required: false, description: 'Filter by subject contains' },
      hasAttachment: { type: 'boolean', required: false, description: 'Only emails with attachments' },
      labelFilter: { type: 'string', required: false, description: 'Filter by label' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
  },
  {
    id: 'email_starred',
    name: 'Email Starred',
    description: 'Trigger when email is starred',
    category: 'trigger',
    parameters: {
      starType: { type: 'string', required: false, description: 'Type of star', options: ['any', 'yellow', 'blue', 'red', 'orange', 'green', 'purple'] }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
  },
  {
    id: 'email_labeled',
    name: 'Email Labeled',
    description: 'Trigger when email receives specific label',
    category: 'trigger',
    parameters: {
      labelName: { type: 'string', required: true, description: 'Label name to watch' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
  }
];

// ===== GOOGLE SHEETS - COMPLETE FUNCTION SET =====
export const GOOGLE_SHEETS_FUNCTIONS: AppFunction[] = [
  // === WORKSHEET MANAGEMENT ===
  {
    id: 'create_spreadsheet',
    name: 'Create Spreadsheet',
    description: 'Create a new Google Sheets spreadsheet',
    category: 'action',
    parameters: {
      title: { type: 'string', required: true, description: 'Spreadsheet title' },
      sheetNames: { type: 'array', required: false, description: 'Initial sheet names' },
      shareWithEmails: { type: 'array', required: false, description: 'Emails to share with' },
      folderId: { type: 'string', required: false, description: 'Google Drive folder ID' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file']
  },
  {
    id: 'add_worksheet',
    name: 'Add Worksheet',
    description: 'Add a new worksheet to spreadsheet',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      title: { type: 'string', required: true, description: 'Worksheet title' },
      rows: { type: 'number', required: false, description: 'Number of rows', default: 1000 },
      columns: { type: 'number', required: false, description: 'Number of columns', default: 26 }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'delete_worksheet',
    name: 'Delete Worksheet',
    description: 'Delete a worksheet from spreadsheet',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: true, description: 'Worksheet name to delete' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'rename_worksheet',
    name: 'Rename Worksheet',
    description: 'Rename an existing worksheet',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      oldName: { type: 'string', required: true, description: 'Current worksheet name' },
      newName: { type: 'string', required: true, description: 'New worksheet name' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },

  // === DATA OPERATIONS ===
  {
    id: 'append_row',
    name: 'Append Row',
    description: 'Add a new row to the end of the sheet',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name', default: 'Sheet1' },
      values: { type: 'array', required: true, description: 'Array of values for the row' },
      valueInputOption: { type: 'string', required: false, description: 'How to interpret values', options: ['RAW', 'USER_ENTERED'], default: 'USER_ENTERED' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'insert_row',
    name: 'Insert Row',
    description: 'Insert a row at specific position',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      rowIndex: { type: 'number', required: true, description: 'Row index to insert at' },
      values: { type: 'array', required: false, description: 'Values for the new row' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'update_cell',
    name: 'Update Cell',
    description: 'Update a specific cell value',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      cell: { type: 'string', required: true, description: 'Cell address (e.g., A1, B2)' },
      value: { type: 'string', required: true, description: 'New cell value' },
      valueInputOption: { type: 'string', required: false, description: 'How to interpret value', options: ['RAW', 'USER_ENTERED'], default: 'USER_ENTERED' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'update_range',
    name: 'Update Range',
    description: 'Update a range of cells',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      range: { type: 'string', required: true, description: 'Range (e.g., A1:C3)' },
      values: { type: 'array', required: true, description: '2D array of values' },
      valueInputOption: { type: 'string', required: false, description: 'How to interpret values', options: ['RAW', 'USER_ENTERED'], default: 'USER_ENTERED' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'clear_range',
    name: 'Clear Range',
    description: 'Clear values from a range of cells',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      range: { type: 'string', required: true, description: 'Range to clear (e.g., A1:C3)' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'delete_row',
    name: 'Delete Row',
    description: 'Delete specific rows from sheet',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      startIndex: { type: 'number', required: true, description: 'Start row index (0-based)' },
      endIndex: { type: 'number', required: false, description: 'End row index (0-based)' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },

  // === DATA READING ===
  {
    id: 'get_cell_value',
    name: 'Get Cell Value',
    description: 'Get value from a specific cell',
    category: 'both',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      cell: { type: 'string', required: true, description: 'Cell address (e.g., A1)' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  },
  {
    id: 'get_range_values',
    name: 'Get Range Values',
    description: 'Get values from a range of cells',
    category: 'both',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      range: { type: 'string', required: true, description: 'Range (e.g., A1:C10)' },
      valueRenderOption: { type: 'string', required: false, description: 'How to render values', options: ['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'] }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  },
  {
    id: 'get_all_data',
    name: 'Get All Data',
    description: 'Get all data from a worksheet',
    category: 'both',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      includeEmpty: { type: 'boolean', required: false, description: 'Include empty cells', default: false }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  },
  {
    id: 'find_replace',
    name: 'Find and Replace',
    description: 'Find and replace text in spreadsheet',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name (all sheets if not specified)' },
      findText: { type: 'string', required: true, description: 'Text to find' },
      replaceText: { type: 'string', required: true, description: 'Replacement text' },
      matchCase: { type: 'boolean', required: false, description: 'Match case', default: false },
      matchEntireCell: { type: 'boolean', required: false, description: 'Match entire cell', default: false }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },

  // === FORMATTING ===
  {
    id: 'format_cells',
    name: 'Format Cells',
    description: 'Apply formatting to cells',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      range: { type: 'string', required: true, description: 'Range to format' },
      backgroundColor: { type: 'string', required: false, description: 'Background color (hex)' },
      textColor: { type: 'string', required: false, description: 'Text color (hex)' },
      bold: { type: 'boolean', required: false, description: 'Bold text' },
      italic: { type: 'boolean', required: false, description: 'Italic text' },
      fontSize: { type: 'number', required: false, description: 'Font size' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'add_borders',
    name: 'Add Borders',
    description: 'Add borders to cells',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      range: { type: 'string', required: true, description: 'Range for borders' },
      borderStyle: { type: 'string', required: false, description: 'Border style', options: ['SOLID', 'DASHED', 'DOTTED'] },
      borderColor: { type: 'string', required: false, description: 'Border color (hex)' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },

  // === SORTING & FILTERING ===
  {
    id: 'sort_range',
    name: 'Sort Range',
    description: 'Sort a range of data',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      range: { type: 'string', required: true, description: 'Range to sort' },
      sortColumn: { type: 'number', required: true, description: 'Column index to sort by (0-based)' },
      ascending: { type: 'boolean', required: false, description: 'Sort ascending', default: true }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  {
    id: 'create_filter',
    name: 'Create Filter',
    description: 'Create auto-filter on range',
    category: 'action',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet name' },
      range: { type: 'string', required: true, description: 'Range for filter' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets']
  },

  // === TRIGGERS ===
  {
    id: 'new_row_added',
    name: 'New Row Added',
    description: 'Trigger when new row is added',
    category: 'trigger',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID to monitor' },
      worksheetName: { type: 'string', required: false, description: 'Specific worksheet to monitor' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  },
  {
    id: 'cell_updated',
    name: 'Cell Updated',
    description: 'Trigger when specific cell is updated',
    category: 'trigger',
    parameters: {
      spreadsheetId: { type: 'string', required: true, description: 'Spreadsheet ID to monitor' },
      worksheetName: { type: 'string', required: false, description: 'Worksheet to monitor' },
      cellRange: { type: 'string', required: false, description: 'Specific range to monitor' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  }
];

// ===== FUNCTION RETRIEVAL SYSTEM =====
export function getComprehensiveAppFunctions(appName: string): AppFunction[] {
  const normalizedName = appName.toLowerCase();
  
  // Gmail functions
  if (normalizedName.includes('gmail') || normalizedName.includes('email')) {
    return GMAIL_FUNCTIONS;
  }
  
  // Google Sheets functions
  if (normalizedName.includes('sheet') || normalizedName.includes('spreadsheet')) {
    return GOOGLE_SHEETS_FUNCTIONS;
  }
  
  // Google Calendar functions (to be expanded)
  if (normalizedName.includes('calendar')) {
    return GOOGLE_CALENDAR_FUNCTIONS;
  }
  
  // Google Drive functions (to be expanded)
  if (normalizedName.includes('drive')) {
    return GOOGLE_DRIVE_FUNCTIONS;
  }
  
  // Slack functions
  if (normalizedName.includes('slack')) {
    return SLACK_FUNCTIONS;
  }
  
  // Notion functions
  if (normalizedName.includes('notion')) {
    return NOTION_FUNCTIONS;
  }
  
  // Trello functions
  if (normalizedName.includes('trello')) {
    return TRELLO_FUNCTIONS;
  }
  
  // Asana functions
  if (normalizedName.includes('asana')) {
    return ASANA_FUNCTIONS;
  }
  
  // HubSpot functions
  if (normalizedName.includes('hubspot')) {
    return HUBSPOT_FUNCTIONS;
  }
  
  // Salesforce functions
  if (normalizedName.includes('salesforce')) {
    return SALESFORCE_FUNCTIONS;
  }
  
  // Zoom functions
  if (normalizedName.includes('zoom')) {
    return ZOOM_FUNCTIONS;
  }
  
  // Microsoft Teams functions
  if (normalizedName.includes('teams') || normalizedName.includes('microsoft teams')) {
    return MICROSOFT_TEAMS_FUNCTIONS;
  }
  
  // Jira functions
  if (normalizedName.includes('jira')) {
    return JIRA_FUNCTIONS;
  }
  
  // Default functions for other apps
  return getDefaultAppFunctions(appName);
}

// ===== GOOGLE CALENDAR - COMPLETE FUNCTION SET =====
const GOOGLE_CALENDAR_FUNCTIONS: AppFunction[] = [
  // === EVENT MANAGEMENT ===
  {
    id: 'create_event',
    name: 'Create Event',
    description: 'Create a new calendar event',
    category: 'action',
    parameters: {
      summary: { type: 'string', required: true, description: 'Event title' },
      description: { type: 'string', required: false, description: 'Event description' },
      startTime: { type: 'string', required: true, description: 'Start time (ISO format)' },
      endTime: { type: 'string', required: true, description: 'End time (ISO format)' },
      timezone: { type: 'string', required: false, description: 'Timezone' },
      location: { type: 'string', required: false, description: 'Event location' },
      attendees: { type: 'array', required: false, description: 'Attendee email addresses' },
      reminders: { type: 'array', required: false, description: 'Reminder settings' },
      recurrence: { type: 'string', required: false, description: 'Recurrence rule (RRULE)' },
      calendarId: { type: 'string', required: false, description: 'Calendar ID', default: 'primary' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar']
  },
  {
    id: 'update_event',
    name: 'Update Event',
    description: 'Update an existing calendar event',
    category: 'action',
    parameters: {
      eventId: { type: 'string', required: true, description: 'Event ID' },
      summary: { type: 'string', required: false, description: 'Event title' },
      description: { type: 'string', required: false, description: 'Event description' },
      startTime: { type: 'string', required: false, description: 'Start time' },
      endTime: { type: 'string', required: false, description: 'End time' },
      location: { type: 'string', required: false, description: 'Event location' },
      attendees: { type: 'array', required: false, description: 'Attendee emails' },
      calendarId: { type: 'string', required: false, description: 'Calendar ID', default: 'primary' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar']
  },
  {
    id: 'delete_event',
    name: 'Delete Event',
    description: 'Delete a calendar event',
    category: 'action',
    parameters: {
      eventId: { type: 'string', required: true, description: 'Event ID' },
      calendarId: { type: 'string', required: false, description: 'Calendar ID', default: 'primary' },
      sendNotifications: { type: 'boolean', required: false, description: 'Send notifications to attendees', default: true }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar']
  },
  {
    id: 'get_events',
    name: 'Get Events',
    description: 'Retrieve calendar events',
    category: 'both',
    parameters: {
      calendarId: { type: 'string', required: false, description: 'Calendar ID', default: 'primary' },
      timeMin: { type: 'string', required: false, description: 'Start time filter' },
      timeMax: { type: 'string', required: false, description: 'End time filter' },
      maxResults: { type: 'number', required: false, description: 'Maximum results', default: 10 },
      singleEvents: { type: 'boolean', required: false, description: 'Expand recurring events', default: true }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly']
  },
  {
    id: 'find_free_time',
    name: 'Find Free Time',
    description: 'Find available time slots',
    category: 'both',
    parameters: {
      timeMin: { type: 'string', required: true, description: 'Start time to search' },
      timeMax: { type: 'string', required: true, description: 'End time to search' },
      duration: { type: 'number', required: true, description: 'Duration in minutes' },
      calendars: { type: 'array', required: false, description: 'Calendar IDs to check' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly']
  },
  
  // === CALENDAR MANAGEMENT ===
  {
    id: 'create_calendar',
    name: 'Create Calendar',
    description: 'Create a new calendar',
    category: 'action',
    parameters: {
      summary: { type: 'string', required: true, description: 'Calendar name' },
      description: { type: 'string', required: false, description: 'Calendar description' },
      timezone: { type: 'string', required: false, description: 'Calendar timezone' },
      backgroundColor: { type: 'string', required: false, description: 'Background color' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar']
  },
  {
    id: 'share_calendar',
    name: 'Share Calendar',
    description: 'Share calendar with users',
    category: 'action',
    parameters: {
      calendarId: { type: 'string', required: true, description: 'Calendar ID' },
      userEmail: { type: 'string', required: true, description: 'User email to share with' },
      role: { type: 'string', required: true, description: 'Permission role', options: ['reader', 'writer', 'owner'] },
      sendNotifications: { type: 'boolean', required: false, description: 'Send notification', default: true }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar']
  },
  
  // === TRIGGERS ===
  {
    id: 'event_created',
    name: 'Event Created',
    description: 'Trigger when new event is created',
    category: 'trigger',
    parameters: {
      calendarId: { type: 'string', required: false, description: 'Calendar to monitor' },
      attendeeFilter: { type: 'string', required: false, description: 'Filter by attendee email' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly']
  },
  {
    id: 'event_starting_soon',
    name: 'Event Starting Soon',
    description: 'Trigger before event starts',
    category: 'trigger',
    parameters: {
      minutesBefore: { type: 'number', required: false, description: 'Minutes before event', default: 15 },
      calendarId: { type: 'string', required: false, description: 'Calendar to monitor' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly']
  }
];

// ===== GOOGLE DRIVE - COMPLETE FUNCTION SET =====
const GOOGLE_DRIVE_FUNCTIONS: AppFunction[] = [
  // === FILE MANAGEMENT ===
  {
    id: 'upload_file',
    name: 'Upload File',
    description: 'Upload a file to Google Drive',
    category: 'action',
    parameters: {
      fileName: { type: 'string', required: true, description: 'File name' },
      fileContent: { type: 'string', required: true, description: 'File content or path' },
      parentFolder: { type: 'string', required: false, description: 'Parent folder ID' },
      mimeType: { type: 'string', required: false, description: 'MIME type' },
      description: { type: 'string', required: false, description: 'File description' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive.file']
  },
  {
    id: 'download_file',
    name: 'Download File',
    description: 'Download a file from Google Drive',
    category: 'action',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File ID' },
      exportFormat: { type: 'string', required: false, description: 'Export format for Google Docs' },
      savePath: { type: 'string', required: false, description: 'Local save path' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive.readonly']
  },
  {
    id: 'delete_file',
    name: 'Delete File',
    description: 'Delete a file from Google Drive',
    category: 'action',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File ID' },
      permanently: { type: 'boolean', required: false, description: 'Delete permanently', default: false }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive']
  },
  {
    id: 'copy_file',
    name: 'Copy File',
    description: 'Create a copy of a file',
    category: 'action',
    parameters: {
      fileId: { type: 'string', required: true, description: 'Source file ID' },
      newName: { type: 'string', required: false, description: 'New file name' },
      parentFolder: { type: 'string', required: false, description: 'Destination folder ID' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive']
  },
  {
    id: 'move_file',
    name: 'Move File',
    description: 'Move a file to different folder',
    category: 'action',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File ID' },
      newParent: { type: 'string', required: true, description: 'New parent folder ID' },
      removeFromParents: { type: 'array', required: false, description: 'Parent IDs to remove from' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive']
  },
  {
    id: 'rename_file',
    name: 'Rename File',
    description: 'Rename a file or folder',
    category: 'action',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File ID' },
      newName: { type: 'string', required: true, description: 'New name' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive']
  },
  
  // === FOLDER MANAGEMENT ===
  {
    id: 'create_folder',
    name: 'Create Folder',
    description: 'Create a new folder',
    category: 'action',
    parameters: {
      name: { type: 'string', required: true, description: 'Folder name' },
      parentFolder: { type: 'string', required: false, description: 'Parent folder ID' },
      description: { type: 'string', required: false, description: 'Folder description' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive']
  },
  {
    id: 'list_files',
    name: 'List Files',
    description: 'List files in a folder',
    category: 'both',
    parameters: {
      folderId: { type: 'string', required: false, description: 'Folder ID (root if not specified)' },
      query: { type: 'string', required: false, description: 'Search query' },
      maxResults: { type: 'number', required: false, description: 'Maximum results', default: 10 },
      orderBy: { type: 'string', required: false, description: 'Sort order', options: ['name', 'modifiedTime', 'createdTime'] }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive.readonly']
  },
  {
    id: 'search_files',
    name: 'Search Files',
    description: 'Search for files by name or content',
    category: 'both',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query' },
      mimeType: { type: 'string', required: false, description: 'Filter by MIME type' },
      maxResults: { type: 'number', required: false, description: 'Maximum results', default: 10 },
      includeTeamDrives: { type: 'boolean', required: false, description: 'Include shared drives', default: false }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive.readonly']
  },
  
  // === SHARING & PERMISSIONS ===
  {
    id: 'share_file',
    name: 'Share File',
    description: 'Share a file with users',
    category: 'action',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File ID' },
      emailAddress: { type: 'string', required: true, description: 'User email' },
      role: { type: 'string', required: true, description: 'Permission role', options: ['reader', 'writer', 'commenter', 'owner'] },
      sendNotifications: { type: 'boolean', required: false, description: 'Send notification', default: true },
      message: { type: 'string', required: false, description: 'Message to include' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive']
  },
  {
    id: 'create_shareable_link',
    name: 'Create Shareable Link',
    description: 'Create a public shareable link',
    category: 'action',
    parameters: {
      fileId: { type: 'string', required: true, description: 'File ID' },
      role: { type: 'string', required: false, description: 'Link permission', options: ['reader', 'writer', 'commenter'], default: 'reader' },
      allowFileDiscovery: { type: 'boolean', required: false, description: 'Allow file discovery', default: false }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive']
  },
  
  // === TRIGGERS ===
  {
    id: 'file_uploaded',
    name: 'File Uploaded',
    description: 'Trigger when new file is uploaded',
    category: 'trigger',
    parameters: {
      folderId: { type: 'string', required: false, description: 'Monitor specific folder' },
      mimeType: { type: 'string', required: false, description: 'Filter by file type' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive.readonly']
  },
  {
    id: 'file_modified',
    name: 'File Modified',
    description: 'Trigger when file is modified',
    category: 'trigger',
    parameters: {
      fileId: { type: 'string', required: false, description: 'Monitor specific file' },
      folderId: { type: 'string', required: false, description: 'Monitor folder' }
    },
    requiredScopes: ['https://www.googleapis.com/auth/drive.readonly']
  }
];

// ===== SLACK - COMPLETE FUNCTION SET =====
const SLACK_FUNCTIONS: AppFunction[] = [
  // === MESSAGING ===
  {
    id: 'send_message',
    name: 'Send Message',
    description: 'Send a message to channel or user',
    category: 'action',
    parameters: {
      channel: { type: 'string', required: true, description: 'Channel ID or user ID' },
      text: { type: 'string', required: true, description: 'Message text' },
      blocks: { type: 'array', required: false, description: 'Slack blocks for rich formatting' },
      threadTs: { type: 'string', required: false, description: 'Thread timestamp for replies' },
      username: { type: 'string', required: false, description: 'Custom username' },
      iconEmoji: { type: 'string', required: false, description: 'Custom emoji icon' },
      unfurlLinks: { type: 'boolean', required: false, description: 'Unfurl links', default: true }
    },
    requiredScopes: ['chat:write']
  },
  {
    id: 'send_direct_message',
    name: 'Send Direct Message',
    description: 'Send a direct message to user',
    category: 'action',
    parameters: {
      user: { type: 'string', required: true, description: 'User ID or email' },
      text: { type: 'string', required: true, description: 'Message text' },
      blocks: { type: 'array', required: false, description: 'Slack blocks' }
    },
    requiredScopes: ['chat:write', 'im:write']
  },
  {
    id: 'update_message',
    name: 'Update Message',
    description: 'Update an existing message',
    category: 'action',
    parameters: {
      channel: { type: 'string', required: true, description: 'Channel ID' },
      timestamp: { type: 'string', required: true, description: 'Message timestamp' },
      text: { type: 'string', required: true, description: 'New message text' },
      blocks: { type: 'array', required: false, description: 'Updated blocks' }
    },
    requiredScopes: ['chat:write']
  },
  {
    id: 'delete_message',
    name: 'Delete Message',
    description: 'Delete a message',
    category: 'action',
    parameters: {
      channel: { type: 'string', required: true, description: 'Channel ID' },
      timestamp: { type: 'string', required: true, description: 'Message timestamp' }
    },
    requiredScopes: ['chat:write']
  },
  {
    id: 'add_reaction',
    name: 'Add Reaction',
    description: 'Add emoji reaction to message',
    category: 'action',
    parameters: {
      channel: { type: 'string', required: true, description: 'Channel ID' },
      timestamp: { type: 'string', required: true, description: 'Message timestamp' },
      name: { type: 'string', required: true, description: 'Emoji name (without colons)' }
    },
    requiredScopes: ['reactions:write']
  },
  
  // === CHANNEL MANAGEMENT ===
  {
    id: 'create_channel',
    name: 'Create Channel',
    description: 'Create a new channel',
    category: 'action',
    parameters: {
      name: { type: 'string', required: true, description: 'Channel name' },
      isPrivate: { type: 'boolean', required: false, description: 'Create private channel', default: false },
      purpose: { type: 'string', required: false, description: 'Channel purpose' },
      topic: { type: 'string', required: false, description: 'Channel topic' }
    },
    requiredScopes: ['channels:write']
  },
  {
    id: 'invite_to_channel',
    name: 'Invite to Channel',
    description: 'Invite users to a channel',
    category: 'action',
    parameters: {
      channel: { type: 'string', required: true, description: 'Channel ID' },
      users: { type: 'array', required: true, description: 'User IDs to invite' }
    },
    requiredScopes: ['channels:write']
  },
  {
    id: 'archive_channel',
    name: 'Archive Channel',
    description: 'Archive a channel',
    category: 'action',
    parameters: {
      channel: { type: 'string', required: true, description: 'Channel ID' }
    },
    requiredScopes: ['channels:write']
  },
  {
    id: 'get_channel_info',
    name: 'Get Channel Info',
    description: 'Get information about a channel',
    category: 'both',
    parameters: {
      channel: { type: 'string', required: true, description: 'Channel ID' },
      includeLocale: { type: 'boolean', required: false, description: 'Include locale info', default: false }
    },
    requiredScopes: ['channels:read']
  },
  {
    id: 'list_channels',
    name: 'List Channels',
    description: 'List all channels',
    category: 'both',
    parameters: {
      excludeArchived: { type: 'boolean', required: false, description: 'Exclude archived channels', default: true },
      types: { type: 'array', required: false, description: 'Channel types', options: ['public_channel', 'private_channel', 'mpim', 'im'] }
    },
    requiredScopes: ['channels:read']
  },
  
  // === USER MANAGEMENT ===
  {
    id: 'get_user_info',
    name: 'Get User Info',
    description: 'Get information about a user',
    category: 'both',
    parameters: {
      user: { type: 'string', required: true, description: 'User ID' },
      includeLocale: { type: 'boolean', required: false, description: 'Include locale info', default: false }
    },
    requiredScopes: ['users:read']
  },
  {
    id: 'list_users',
    name: 'List Users',
    description: 'List all workspace users',
    category: 'both',
    parameters: {
      cursor: { type: 'string', required: false, description: 'Pagination cursor' },
      limit: { type: 'number', required: false, description: 'Number of users', default: 50 },
      includeLocale: { type: 'boolean', required: false, description: 'Include locale info', default: false }
    },
    requiredScopes: ['users:read']
  },
  {
    id: 'set_user_status',
    name: 'Set User Status',
    description: 'Set user status',
    category: 'action',
    parameters: {
      statusText: { type: 'string', required: false, description: 'Status message' },
      statusEmoji: { type: 'string', required: false, description: 'Status emoji' },
      statusExpiration: { type: 'number', required: false, description: 'Expiration timestamp' }
    },
    requiredScopes: ['users.profile:write']
  },
  
  // === FILE SHARING ===
  {
    id: 'upload_file',
    name: 'Upload File',
    description: 'Upload a file to Slack',
    category: 'action',
    parameters: {
      channels: { type: 'array', required: true, description: 'Channel IDs to share in' },
      file: { type: 'string', required: true, description: 'File content or path' },
      filename: { type: 'string', required: false, description: 'Filename' },
      title: { type: 'string', required: false, description: 'File title' },
      initialComment: { type: 'string', required: false, description: 'Initial comment' },
      filetype: { type: 'string', required: false, description: 'File type' }
    },
    requiredScopes: ['files:write']
  },
  
  // === TRIGGERS ===
  {
    id: 'message_posted',
    name: 'Message Posted',
    description: 'Trigger when message is posted',
    category: 'trigger',
    parameters: {
      channel: { type: 'string', required: false, description: 'Monitor specific channel' },
      user: { type: 'string', required: false, description: 'Monitor specific user' },
      keyword: { type: 'string', required: false, description: 'Filter by keyword' }
    },
    requiredScopes: ['channels:history', 'groups:history', 'im:history']
  },
  {
    id: 'user_joined_channel',
    name: 'User Joined Channel',
    description: 'Trigger when user joins channel',
    category: 'trigger',
    parameters: {
      channel: { type: 'string', required: false, description: 'Monitor specific channel' }
    },
    requiredScopes: ['channels:read']
  },
  {
    id: 'reaction_added',
    name: 'Reaction Added',
    description: 'Trigger when reaction is added',
    category: 'trigger',
    parameters: {
      channel: { type: 'string', required: false, description: 'Monitor specific channel' },
      emoji: { type: 'string', required: false, description: 'Monitor specific emoji' }
    },
    requiredScopes: ['reactions:read']
  }
];

// ===== NOTION - COMPLETE FUNCTION SET =====
const NOTION_FUNCTIONS: AppFunction[] = [
  {
    id: 'create_page',
    name: 'Create Page',
    description: 'Create a new Notion page',
    category: 'action',
    parameters: {
      parentId: { type: 'string', required: true, description: 'Parent page or database ID' },
      title: { type: 'string', required: true, description: 'Page title' },
      content: { type: 'array', required: false, description: 'Page blocks content' },
      properties: { type: 'object', required: false, description: 'Page properties (for database pages)' }
    },
    requiredScopes: ['pages:write']
  },
  {
    id: 'update_page',
    name: 'Update Page',
    description: 'Update a Notion page',
    category: 'action',
    parameters: {
      pageId: { type: 'string', required: true, description: 'Page ID' },
      properties: { type: 'object', required: false, description: 'Properties to update' },
      archived: { type: 'boolean', required: false, description: 'Archive status' }
    },
    requiredScopes: ['pages:write']
  },
  {
    id: 'create_database',
    name: 'Create Database',
    description: 'Create a new Notion database',
    category: 'action',
    parameters: {
      parentId: { type: 'string', required: true, description: 'Parent page ID' },
      title: { type: 'string', required: true, description: 'Database title' },
      properties: { type: 'object', required: true, description: 'Database schema' }
    },
    requiredScopes: ['databases:write']
  },
  {
    id: 'query_database',
    name: 'Query Database',
    description: 'Query a Notion database',
    category: 'both',
    parameters: {
      databaseId: { type: 'string', required: true, description: 'Database ID' },
      filter: { type: 'object', required: false, description: 'Query filter' },
      sorts: { type: 'array', required: false, description: 'Sort criteria' },
      pageSize: { type: 'number', required: false, description: 'Results per page', default: 100 }
    },
    requiredScopes: ['databases:read']
  },
  {
    id: 'add_block',
    name: 'Add Block',
    description: 'Add block to a page',
    category: 'action',
    parameters: {
      pageId: { type: 'string', required: true, description: 'Page ID' },
      blocks: { type: 'array', required: true, description: 'Blocks to add' }
    },
    requiredScopes: ['blocks:write']
  }
];

// ===== TRELLO - COMPLETE FUNCTION SET =====
const TRELLO_FUNCTIONS: AppFunction[] = [
  {
    id: 'create_card',
    name: 'Create Card',
    description: 'Create a new Trello card',
    category: 'action',
    parameters: {
      listId: { type: 'string', required: true, description: 'List ID' },
      name: { type: 'string', required: true, description: 'Card name' },
      desc: { type: 'string', required: false, description: 'Card description' },
      pos: { type: 'string', required: false, description: 'Position in list' },
      due: { type: 'string', required: false, description: 'Due date' },
      members: { type: 'array', required: false, description: 'Member IDs' },
      labels: { type: 'array', required: false, description: 'Label IDs' }
    },
    requiredScopes: ['write']
  },
  {
    id: 'update_card',
    name: 'Update Card',
    description: 'Update a Trello card',
    category: 'action',
    parameters: {
      cardId: { type: 'string', required: true, description: 'Card ID' },
      name: { type: 'string', required: false, description: 'Card name' },
      desc: { type: 'string', required: false, description: 'Card description' },
      closed: { type: 'boolean', required: false, description: 'Archive card' },
      due: { type: 'string', required: false, description: 'Due date' },
      pos: { type: 'string', required: false, description: 'Position' }
    },
    requiredScopes: ['write']
  },
  {
    id: 'move_card',
    name: 'Move Card',
    description: 'Move card to different list',
    category: 'action',
    parameters: {
      cardId: { type: 'string', required: true, description: 'Card ID' },
      listId: { type: 'string', required: true, description: 'Target list ID' },
      pos: { type: 'string', required: false, description: 'Position in list' }
    },
    requiredScopes: ['write']
  },
  {
    id: 'add_comment',
    name: 'Add Comment',
    description: 'Add comment to card',
    category: 'action',
    parameters: {
      cardId: { type: 'string', required: true, description: 'Card ID' },
      text: { type: 'string', required: true, description: 'Comment text' }
    },
    requiredScopes: ['write']
  },
  {
    id: 'create_list',
    name: 'Create List',
    description: 'Create a new list',
    category: 'action',
    parameters: {
      boardId: { type: 'string', required: true, description: 'Board ID' },
      name: { type: 'string', required: true, description: 'List name' },
      pos: { type: 'string', required: false, description: 'Position on board' }
    },
    requiredScopes: ['write']
  }
];

// ===== ASANA - COMPLETE FUNCTION SET =====
const ASANA_FUNCTIONS: AppFunction[] = [
  {
    id: 'create_task',
    name: 'Create Task',
    description: 'Create a new Asana task',
    category: 'action',
    parameters: {
      name: { type: 'string', required: true, description: 'Task name' },
      notes: { type: 'string', required: false, description: 'Task description' },
      projects: { type: 'array', required: false, description: 'Project IDs' },
      assignee: { type: 'string', required: false, description: 'Assignee user ID' },
      due_on: { type: 'string', required: false, description: 'Due date (YYYY-MM-DD)' },
      start_on: { type: 'string', required: false, description: 'Start date' },
      completed: { type: 'boolean', required: false, description: 'Completion status', default: false }
    },
    requiredScopes: ['default']
  },
  {
    id: 'update_task',
    name: 'Update Task',
    description: 'Update an Asana task',
    category: 'action',
    parameters: {
      taskId: { type: 'string', required: true, description: 'Task ID' },
      name: { type: 'string', required: false, description: 'Task name' },
      notes: { type: 'string', required: false, description: 'Task notes' },
      completed: { type: 'boolean', required: false, description: 'Completion status' },
      assignee: { type: 'string', required: false, description: 'Assignee user ID' },
      due_on: { type: 'string', required: false, description: 'Due date' }
    },
    requiredScopes: ['default']
  },
  {
    id: 'create_project',
    name: 'Create Project',
    description: 'Create a new Asana project',
    category: 'action',
    parameters: {
      name: { type: 'string', required: true, description: 'Project name' },
      notes: { type: 'string', required: false, description: 'Project description' },
      team: { type: 'string', required: false, description: 'Team ID' },
      workspace: { type: 'string', required: true, description: 'Workspace ID' },
      layout: { type: 'string', required: false, description: 'Project layout', options: ['list', 'board', 'timeline', 'calendar'] }
    },
    requiredScopes: ['default']
  },
  {
    id: 'add_comment',
    name: 'Add Comment',
    description: 'Add comment to task',
    category: 'action',
    parameters: {
      taskId: { type: 'string', required: true, description: 'Task ID' },
      text: { type: 'string', required: true, description: 'Comment text' }
    },
    requiredScopes: ['default']
  }
];

// ===== HUBSPOT - COMPLETE FUNCTION SET =====
const HUBSPOT_FUNCTIONS: AppFunction[] = [
  {
    id: 'create_contact',
    name: 'Create Contact',
    description: 'Create a new HubSpot contact',
    category: 'action',
    parameters: {
      email: { type: 'string', required: true, description: 'Contact email' },
      firstname: { type: 'string', required: false, description: 'First name' },
      lastname: { type: 'string', required: false, description: 'Last name' },
      phone: { type: 'string', required: false, description: 'Phone number' },
      company: { type: 'string', required: false, description: 'Company name' },
      website: { type: 'string', required: false, description: 'Website URL' }
    },
    requiredScopes: ['contacts']
  },
  {
    id: 'update_contact',
    name: 'Update Contact',
    description: 'Update a HubSpot contact',
    category: 'action',
    parameters: {
      contactId: { type: 'string', required: true, description: 'Contact ID' },
      properties: { type: 'object', required: true, description: 'Properties to update' }
    },
    requiredScopes: ['contacts']
  },
  {
    id: 'create_deal',
    name: 'Create Deal',
    description: 'Create a new HubSpot deal',
    category: 'action',
    parameters: {
      dealname: { type: 'string', required: true, description: 'Deal name' },
      amount: { type: 'number', required: false, description: 'Deal amount' },
      pipeline: { type: 'string', required: false, description: 'Pipeline ID' },
      dealstage: { type: 'string', required: false, description: 'Deal stage ID' },
      closedate: { type: 'string', required: false, description: 'Close date' },
      hubspot_owner_id: { type: 'string', required: false, description: 'Owner ID' }
    },
    requiredScopes: ['deals']
  },
  {
    id: 'create_company',
    name: 'Create Company',
    description: 'Create a new HubSpot company',
    category: 'action',
    parameters: {
      name: { type: 'string', required: true, description: 'Company name' },
      domain: { type: 'string', required: false, description: 'Company domain' },
      industry: { type: 'string', required: false, description: 'Industry' },
      phone: { type: 'string', required: false, description: 'Phone number' },
      city: { type: 'string', required: false, description: 'City' },
      state: { type: 'string', required: false, description: 'State' }
    },
    requiredScopes: ['companies']
  },
  {
    id: 'search_contacts',
    name: 'Search Contacts',
    description: 'Search HubSpot contacts',
    category: 'both',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query' },
      limit: { type: 'number', required: false, description: 'Results limit', default: 10 },
      properties: { type: 'array', required: false, description: 'Properties to return' }
    },
    requiredScopes: ['contacts']
  }
];

// ===== SALESFORCE - COMPLETE FUNCTION SET =====
const SALESFORCE_FUNCTIONS: AppFunction[] = [
  {
    id: 'create_lead',
    name: 'Create Lead',
    description: 'Create a new Salesforce lead',
    category: 'action',
    parameters: {
      LastName: { type: 'string', required: true, description: 'Last name' },
      FirstName: { type: 'string', required: false, description: 'First name' },
      Company: { type: 'string', required: true, description: 'Company name' },
      Email: { type: 'string', required: false, description: 'Email address' },
      Phone: { type: 'string', required: false, description: 'Phone number' },
      Status: { type: 'string', required: false, description: 'Lead status' },
      LeadSource: { type: 'string', required: false, description: 'Lead source' }
    },
    requiredScopes: ['api', 'full']
  },
  {
    id: 'create_account',
    name: 'Create Account',
    description: 'Create a new Salesforce account',
    category: 'action',
    parameters: {
      Name: { type: 'string', required: true, description: 'Account name' },
      Type: { type: 'string', required: false, description: 'Account type' },
      Industry: { type: 'string', required: false, description: 'Industry' },
      Phone: { type: 'string', required: false, description: 'Phone number' },
      Website: { type: 'string', required: false, description: 'Website URL' },
      BillingCity: { type: 'string', required: false, description: 'Billing city' }
    },
    requiredScopes: ['api', 'full']
  },
  {
    id: 'create_opportunity',
    name: 'Create Opportunity',
    description: 'Create a new Salesforce opportunity',
    category: 'action',
    parameters: {
      Name: { type: 'string', required: true, description: 'Opportunity name' },
      AccountId: { type: 'string', required: false, description: 'Account ID' },
      StageName: { type: 'string', required: true, description: 'Stage name' },
      CloseDate: { type: 'string', required: true, description: 'Close date (YYYY-MM-DD)' },
      Amount: { type: 'number', required: false, description: 'Opportunity amount' },
      Probability: { type: 'number', required: false, description: 'Win probability (0-100)' }
    },
    requiredScopes: ['api', 'full']
  },
  {
    id: 'update_record',
    name: 'Update Record',
    description: 'Update a Salesforce record',
    category: 'action',
    parameters: {
      objectType: { type: 'string', required: true, description: 'Object type (Lead, Account, etc.)' },
      recordId: { type: 'string', required: true, description: 'Record ID' },
      fields: { type: 'object', required: true, description: 'Fields to update' }
    },
    requiredScopes: ['api', 'full']
  },
  {
    id: 'query_records',
    name: 'Query Records',
    description: 'Query Salesforce records using SOQL',
    category: 'both',
    parameters: {
      query: { type: 'string', required: true, description: 'SOQL query' }
    },
    requiredScopes: ['api', 'full']
  }
];

// ===== ZOOM - COMPLETE FUNCTION SET =====
const ZOOM_FUNCTIONS: AppFunction[] = [
  {
    id: 'create_meeting',
    name: 'Create Meeting',
    description: 'Create a new Zoom meeting',
    category: 'action',
    parameters: {
      topic: { type: 'string', required: true, description: 'Meeting topic' },
      type: { type: 'number', required: false, description: 'Meeting type', default: 2 },
      start_time: { type: 'string', required: false, description: 'Start time (ISO format)' },
      duration: { type: 'number', required: false, description: 'Duration in minutes' },
      timezone: { type: 'string', required: false, description: 'Timezone' },
      password: { type: 'string', required: false, description: 'Meeting password' },
      agenda: { type: 'string', required: false, description: 'Meeting agenda' }
    },
    requiredScopes: ['meeting:write']
  },
  {
    id: 'update_meeting',
    name: 'Update Meeting',
    description: 'Update a Zoom meeting',
    category: 'action',
    parameters: {
      meetingId: { type: 'string', required: true, description: 'Meeting ID' },
      topic: { type: 'string', required: false, description: 'Meeting topic' },
      start_time: { type: 'string', required: false, description: 'Start time' },
      duration: { type: 'number', required: false, description: 'Duration in minutes' },
      agenda: { type: 'string', required: false, description: 'Meeting agenda' }
    },
    requiredScopes: ['meeting:write']
  },
  {
    id: 'delete_meeting',
    name: 'Delete Meeting',
    description: 'Delete a Zoom meeting',
    category: 'action',
    parameters: {
      meetingId: { type: 'string', required: true, description: 'Meeting ID' },
      occurrence_id: { type: 'string', required: false, description: 'Occurrence ID for recurring meetings' }
    },
    requiredScopes: ['meeting:write']
  },
  {
    id: 'list_meetings',
    name: 'List Meetings',
    description: 'List user meetings',
    category: 'both',
    parameters: {
      userId: { type: 'string', required: false, description: 'User ID (me for current user)' },
      type: { type: 'string', required: false, description: 'Meeting type', options: ['scheduled', 'live', 'upcoming'] },
      page_size: { type: 'number', required: false, description: 'Page size', default: 30 }
    },
    requiredScopes: ['meeting:read']
  }
];

// ===== MICROSOFT TEAMS - COMPLETE FUNCTION SET =====
const MICROSOFT_TEAMS_FUNCTIONS: AppFunction[] = [
  {
    id: 'send_message',
    name: 'Send Message',
    description: 'Send message to Teams channel',
    category: 'action',
    parameters: {
      teamId: { type: 'string', required: true, description: 'Team ID' },
      channelId: { type: 'string', required: true, description: 'Channel ID' },
      content: { type: 'string', required: true, description: 'Message content' },
      contentType: { type: 'string', required: false, description: 'Content type', options: ['text', 'html'], default: 'text' }
    },
    requiredScopes: ['ChannelMessage.Send']
  },
  {
    id: 'create_team',
    name: 'Create Team',
    description: 'Create a new Microsoft Teams team',
    category: 'action',
    parameters: {
      displayName: { type: 'string', required: true, description: 'Team display name' },
      description: { type: 'string', required: false, description: 'Team description' },
      visibility: { type: 'string', required: false, description: 'Team visibility', options: ['private', 'public'], default: 'private' }
    },
    requiredScopes: ['Team.Create']
  },
  {
    id: 'add_member',
    name: 'Add Member',
    description: 'Add member to team',
    category: 'action',
    parameters: {
      teamId: { type: 'string', required: true, description: 'Team ID' },
      userId: { type: 'string', required: true, description: 'User ID to add' },
      role: { type: 'string', required: false, description: 'Member role', options: ['owner', 'member'], default: 'member' }
    },
    requiredScopes: ['TeamMember.ReadWrite.All']
  }
];

// ===== JIRA - COMPLETE FUNCTION SET =====
const JIRA_FUNCTIONS: AppFunction[] = [
  {
    id: 'create_issue',
    name: 'Create Issue',
    description: 'Create a new Jira issue',
    category: 'action',
    parameters: {
      projectKey: { type: 'string', required: true, description: 'Project key' },
      summary: { type: 'string', required: true, description: 'Issue summary' },
      description: { type: 'string', required: false, description: 'Issue description' },
      issueType: { type: 'string', required: true, description: 'Issue type name' },
      priority: { type: 'string', required: false, description: 'Priority name' },
      assignee: { type: 'string', required: false, description: 'Assignee username' },
      labels: { type: 'array', required: false, description: 'Issue labels' }
    },
    requiredScopes: ['write:jira-work']
  },
  {
    id: 'update_issue',
    name: 'Update Issue',
    description: 'Update a Jira issue',
    category: 'action',
    parameters: {
      issueKey: { type: 'string', required: true, description: 'Issue key' },
      summary: { type: 'string', required: false, description: 'Issue summary' },
      description: { type: 'string', required: false, description: 'Issue description' },
      assignee: { type: 'string', required: false, description: 'Assignee username' },
      priority: { type: 'string', required: false, description: 'Priority name' }
    },
    requiredScopes: ['write:jira-work']
  },
  {
    id: 'transition_issue',
    name: 'Transition Issue',
    description: 'Transition issue to different status',
    category: 'action',
    parameters: {
      issueKey: { type: 'string', required: true, description: 'Issue key' },
      transitionId: { type: 'string', required: true, description: 'Transition ID' },
      comment: { type: 'string', required: false, description: 'Transition comment' }
    },
    requiredScopes: ['write:jira-work']
  },
  {
    id: 'add_comment',
    name: 'Add Comment',
    description: 'Add comment to issue',
    category: 'action',
    parameters: {
      issueKey: { type: 'string', required: true, description: 'Issue key' },
      body: { type: 'string', required: true, description: 'Comment body' }
    },
    requiredScopes: ['write:jira-work']
  },
  {
    id: 'search_issues',
    name: 'Search Issues',
    description: 'Search for Jira issues using JQL',
    category: 'both',
    parameters: {
      jql: { type: 'string', required: true, description: 'JQL query' },
      maxResults: { type: 'number', required: false, description: 'Maximum results', default: 50 },
      fields: { type: 'array', required: false, description: 'Fields to return' }
    },
    requiredScopes: ['read:jira-work']
  }
];

function getDefaultAppFunctions(appName: string): AppFunction[] {
  return [
    {
      id: 'create_item',
      name: 'Create Item',
      description: `Create new item in ${appName}`,
      category: 'action',
      parameters: {
        name: { type: 'string', required: true, description: 'Item name' },
        description: { type: 'string', required: false, description: 'Item description' }
      },
      requiredScopes: []
    },
    {
      id: 'update_item',
      name: 'Update Item',
      description: `Update existing item in ${appName}`,
      category: 'action',
      parameters: {
        id: { type: 'string', required: true, description: 'Item ID' },
        updates: { type: 'object', required: true, description: 'Fields to update' }
      },
      requiredScopes: []
    },
    {
      id: 'get_item',
      name: 'Get Item',
      description: `Retrieve item from ${appName}`,
      category: 'both',
      parameters: {
        id: { type: 'string', required: true, description: 'Item ID' }
      },
      requiredScopes: []
    }
  ];
}