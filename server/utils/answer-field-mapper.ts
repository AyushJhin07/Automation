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
 * CRITICAL: Map LLM answers to backend-expected format
 */
export function mapAnswersToBackendFormat(llmAnswers: Record<string, string>): Record<string, string> {
  const mappedAnswers: Record<string, string> = {};
  
  console.log('🔄 Mapping LLM answers to backend format...');
  console.log('📝 Original answers:', Object.keys(llmAnswers));

  // Apply field mappings
  for (const [llmField, value] of Object.entries(llmAnswers)) {
    const backendField = FIELD_MAPPINGS[llmField] || llmField;
    
    // Special handling for trigger values
    if (backendField === 'trigger') {
      const normalizedValue = value.toLowerCase().trim();
      const mappedTriggerValue = TRIGGER_VALUE_MAPPINGS[normalizedValue] || 
                                TRIGGER_VALUE_MAPPINGS[normalizedValue.replace(/^every\s+/, 'every ')] ||
                                `On a time-based trigger ${value}`;
      
      mappedAnswers[backendField] = mappedTriggerValue;
      console.log(`🎯 Mapped trigger: "${llmField}": "${value}" → "${backendField}": "${mappedTriggerValue}"`);
    } else {
      mappedAnswers[backendField] = value;
      
      if (llmField !== backendField) {
        console.log(`🔄 Mapped field: "${llmField}" → "${backendField}"`);
      }
    }
  }

  // Ensure critical fields exist with defaults
  if (!mappedAnswers.trigger && (llmAnswers.schedule_config || llmAnswers.frequency)) {
    mappedAnswers.trigger = 'On a time-based trigger every 15 minutes';
    console.log('🔧 Added default trigger from schedule config');
  }

  if (!mappedAnswers.action && Object.keys(llmAnswers).length > 0) {
    mappedAnswers.action = 'automated_workflow';
    console.log('🔧 Added default action');
  }

  console.log('✅ Mapped answers:', Object.keys(mappedAnswers));
  console.log('🎯 Final trigger value:', mappedAnswers.trigger);
  
  return mappedAnswers;
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