/**
 * CRITICAL FIX: Answer Field Mapper
 * 
 * Maps LLM-generated question IDs to backend-expected field names
 * Resolves the disconnect between dynamic questions and validation logic
 */

export interface FieldMapping {
  [llmQuestionId: string]: string; // Maps to backend expected field name
}

// CRITICAL: Map LLM question IDs to backend validation field names
export const FIELD_MAPPINGS: FieldMapping = {
  // Trigger mappings
  'schedule_config': 'trigger',
  'trigger_frequency': 'trigger', 
  'trigger_specification': 'trigger',
  'frequency': 'trigger',
  'when_to_run': 'trigger',
  'automation_schedule': 'trigger',
  
  // Spreadsheet mappings
  'spreadsheet_url': 'spreadsheet_url',
  'sheet_url': 'spreadsheet_url',
  'google_sheets_url': 'spreadsheet_url',
  'sheet_link': 'spreadsheet_url',
  'sheets_destination': 'spreadsheet_url',
  
  // Sheet name mappings
  'sheet_name': 'sheet_name',
  'tab_name': 'sheet_name',
  'worksheet_name': 'sheet_name',
  
  // Email mappings
  'search_query': 'search_query',
  'email_filter': 'search_query',
  'gmail_search': 'search_query',
  'email_criteria': 'search_query',
  
  // Slack mappings
  'slack_channel': 'slack_channel',
  'channel': 'slack_channel',
  'notification_channel': 'slack_channel',
  
  // Generic mappings
  'email_content': 'email_content',
  'message_template': 'message_template',
  'notification_message': 'message_template'
};

// CRITICAL: Trigger value mappings
export const TRIGGER_VALUE_MAPPINGS: Record<string, string> = {
  // Time-based triggers
  'every 5 minutes': 'On a time-based trigger every 5 minutes',
  'every 15 minutes': 'On a time-based trigger every 15 minutes', 
  'every 30 minutes': 'On a time-based trigger every 30 minutes',
  'every hour': 'On a time-based trigger every hour',
  'every 6 hours': 'On a time-based trigger every 6 hours',
  'daily': 'On a time-based trigger daily',
  'hourly': 'On a time-based trigger every hour',
  
  // Event-based triggers
  'spreadsheet edit': 'On spreadsheet edit',
  'form submission': 'On form submission',
  'email received': 'On email received',
  'webhook': 'On webhook received',
  
  // Normalize variations
  'time-based': 'On a time-based trigger every 15 minutes',
  'schedule': 'On a time-based trigger every 15 minutes',
  'periodic': 'On a time-based trigger every 15 minutes'
};

/**
 * COMPREHENSIVE: Map and normalize LLM answers to backend-expected format
 * Handles all classes of normalization issues identified by ChatGPT
 */
export function mapAnswersToBackendFormat(llmAnswers: Record<string, any>): Record<string, any> {
  const mappedAnswers: Record<string, any> = {};
  
  console.log('🔄 Comprehensive answer normalization starting...');
  console.log('📝 Original answers keys:', Object.keys(llmAnswers));

  // Apply field mappings
  for (const [llmField, value] of Object.entries(llmAnswers)) {
    const backendField = FIELD_MAPPINGS[llmField] || llmField;
    
    // CRITICAL: Handle trigger values with comprehensive normalization
    if (backendField === 'trigger') {
      const normalizedValue = value.toLowerCase().trim();
      const mappedTriggerValue = TRIGGER_VALUE_MAPPINGS[normalizedValue] || 
                                TRIGGER_VALUE_MAPPINGS[normalizedValue.replace(/^every\s+/, 'every ')] ||
                                `On a time-based trigger ${value}`;
      
      mappedAnswers[backendField] = mappedTriggerValue;
      console.log(`🎯 Mapped trigger: "${llmField}": "${value}" → "${backendField}": "${mappedTriggerValue}"`);
    } 
    // CRITICAL: Handle data_extraction_method (checkbox → array)
    else if (llmField === 'data_extraction_method' && typeof value === 'string') {
      mappedAnswers[backendField] = value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      console.log(`🔄 Normalized checkbox to array: "${llmField}" → ${mappedAnswers[backendField].length} items`);
    }
    // CRITICAL: Handle data_mapping (multi-line text → structured)
    else if (llmField === 'data_mapping' && typeof value === 'string') {
      const parsed = parseDataMapping(value);
      Object.assign(mappedAnswers, parsed);
      console.log(`🔄 Parsed data mapping: extracted ${Object.keys(parsed).join(', ')}`);
    }
    // CRITICAL: Handle notification_config (text → structured)
    else if (llmField === 'notification_config' && typeof value === 'string') {
      const emails = value.split(/[,\s]/).map(s => s.trim()).filter(s => /\S+@\S+\.\S+/.test(s));
      if (emails.length) {
        mappedAnswers.notifications = { emails, on: ['error'] };
        console.log(`🔄 Parsed notification emails: ${emails.length} recipients`);
      }
    }
    // CRITICAL: Handle access_control (text → structured)
    else if (llmField === 'access_control' && typeof value === 'string') {
      mappedAnswers.acl = [{ principal: 'sheet_owners', role: 'edit' }];
      console.log(`🔄 Normalized access control to default ACL`);
    }
    // Default mapping
    else {
      mappedAnswers[backendField] = value;
      
      if (llmField !== backendField) {
        console.log(`🔄 Mapped field: "${llmField}" → "${backendField}"`);
      }
    }
  }

  // CRITICAL: Ensure critical fields exist with intelligent defaults
  if (!mappedAnswers.trigger) {
    if (llmAnswers.schedule_config || llmAnswers.frequency || llmAnswers.trigger_frequency) {
      mappedAnswers.trigger = 'On a time-based trigger every 15 minutes';
      console.log('🔧 Added default trigger from schedule indicators');
    } else if (llmAnswers.spreadsheet_url || llmAnswers.sheet_url) {
      mappedAnswers.trigger = 'On spreadsheet edit';
      console.log('🔧 Inferred spreadsheet edit trigger');
    } else {
      mappedAnswers.trigger = 'On a time-based trigger every 15 minutes';
      console.log('🔧 Added fallback time-based trigger');
    }
  }

  if (!mappedAnswers.action && Object.keys(llmAnswers).length > 0) {
    mappedAnswers.action = 'automated_workflow';
    console.log('🔧 Added default action');
  }

  // CRITICAL: Ensure sheet_url is available if any sheet operation is mentioned
  if (!mappedAnswers.sheet_url && !mappedAnswers.spreadsheet_url) {
    // Check if any value contains a sheet URL
    for (const value of Object.values(llmAnswers)) {
      if (typeof value === 'string' && value.includes('spreadsheets/d/')) {
        mappedAnswers.spreadsheet_url = value;
        console.log('🔧 Extracted sheet URL from embedded answer');
        break;
      }
    }
  }

  console.log('✅ Normalized answers keys:', Object.keys(mappedAnswers));
  console.log('🎯 Critical fields check:', {
    trigger: !!mappedAnswers.trigger,
    spreadsheet_url: !!mappedAnswers.spreadsheet_url,
    sheet_url: !!mappedAnswers.sheet_url
  });
  
  return mappedAnswers;
}

/**
 * Parse data_mapping multi-line text into structured components
 */
function parseDataMapping(dataMapping: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = dataMapping.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Extract sheet URL
  const urlLine = lines.find(l => l.startsWith('http') && l.includes('spreadsheets/d/'));
  if (urlLine) {
    result.sheet_url = urlLine;
    result.spreadsheet_url = urlLine; // Both formats for compatibility
  }

  // Extract sheet name
  const sheetLine = lines.find(l => /^sheet\s*\d+|^sheet/i.test(l.replace(',', '')));
  if (sheetLine) {
    result.sheet_name = sheetLine.replace(/[,]/g, '').trim();
  }

  // Extract column mappings
  const columnLines = lines.filter(l => 
    !l.includes('spreadsheets/d/') && 
    !/^sheet/i.test(l) &&
    l.includes('→') || l.includes(':') || l.includes('=')
  );
  
  if (columnLines.length) {
    result.columns = columnLines.map(line => {
      // Parse "Source Field → Destination Column" format
      if (line.includes('→')) {
        const [source, dest] = line.split('→').map(s => s.trim());
        return { source, destination: dest };
      }
      // Parse "Field: Column" format  
      if (line.includes(':')) {
        const [source, dest] = line.split(':').map(s => s.trim());
        return { source, destination: dest };
      }
      // Default format
      return line.trim();
    });
  }

  return result;
}

/**
 * Extract spreadsheet ID from any URL format
 */
export function extractSpreadsheetId(url: string): string {
  if (!url) return '';
  
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || '';
}

/**
 * Validate and normalize trigger configuration
 */
export function validateTriggerConfig(trigger: string): { isValid: boolean; normalized: string; error?: string } {
  if (!trigger) {
    return { isValid: false, normalized: '', error: 'Trigger configuration is required' };
  }

  const normalized = trigger.toLowerCase().trim();
  
  // Check for time-based triggers
  if (normalized.includes('time-based') || normalized.includes('every') || normalized.includes('daily') || normalized.includes('hourly')) {
    return { isValid: true, normalized: trigger };
  }
  
  // Check for event-based triggers
  if (normalized.includes('spreadsheet') || normalized.includes('form') || normalized.includes('email') || normalized.includes('webhook')) {
    return { isValid: true, normalized: trigger };
  }
  
  // Try to normalize common variations
  if (normalized.includes('15') && normalized.includes('min')) {
    return { isValid: true, normalized: 'On a time-based trigger every 15 minutes' };
  }
  
  return { isValid: false, normalized: '', error: `Unrecognized trigger format: ${trigger}` };
}