/**
 * ChatGPT's Build Schema - Single canonical shape the compiler expects
 * 
 * This defines the exact structure that /api/workflow/build requires
 * after LLM normalization is applied to raw user answers.
 */

export interface Question {
  id: string;
  text: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'data_mapping' | 'schedule_config' | 'notification_config' | 'validation_rules';
  required: boolean;
  expected: {
    jsonPointer: string;      // where the normalized value lands, e.g. "/trigger" or "/sheets"
    valueType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'email' | 'url';
    enum?: string[];          // for select/checkbox
    pattern?: string;         // e.g. sheet URL regex
    requiredKeys?: string[];  // for object types
    examples?: any[];         // few-shot hints
    coercions?: string[];     // e.g. ["map_frequency_to_trigger","extract_sheet_url"]
  };
}

// CRITICAL: Build Schema - exact structure compiler expects
export const BuildSchema = {
  type: "object",
  properties: {
    trigger: { 
      type: "string", 
      enum: [
        "time.every_5_minutes",
        "time.every_15_minutes", 
        "time.every_30_minutes",
        "time.every_hour",
        "time.every_day",
        "on_edit",
        "on_form_submit",
        "on_email_received",
        "on_webhook"
      ]
    },
    sheets: {
      type: "object",
      properties: {
        sheet_url: { 
          type: "string", 
          pattern: "https:\\/\\/docs\\.google\\.com\\/spreadsheets\\/d\\/.+" 
        },
        sheet_name: { type: "string" },
        columns: { 
          type: "array", 
          items: { type: "string" }, 
          minItems: 1 
        }
      },
      required: ["sheet_url", "sheet_name", "columns"]
    },
    gmail: {
      type: "object",
      properties: {
        search_query: { type: "string" },
        max_results: { type: "number", minimum: 1, maximum: 100 },
        extract_data: { type: "array", items: { type: "string" } }
      },
      additionalProperties: true
    },
    slack: {
      type: "object", 
      properties: {
        channel: { type: "string", pattern: "^#.+" },
        message_template: { type: "string" },
        username: { type: "string" }
      },
      additionalProperties: true
    },
    jira: {
      type: "object",
      properties: {
        project_key: { type: "string" },
        issue_type: { type: "string", enum: ["Task", "Bug", "Story", "Epic"] },
        summary_template: { type: "string" }
      },
      additionalProperties: true
    },
    salesforce: {
      type: "object",
      properties: {
        lead_source: { type: "string" },
        assignment_rules: { type: "string" }
      },
      additionalProperties: true
    },
    notifications: {
      type: "object",
      properties: {
        emails: { type: "array", items: { type: "string", format: "email" } },
        on: { type: "array", items: { type: "string", enum: ["error", "success", "completion"] } }
      }
    },
    validation_rules: {
      type: "object",
      properties: {
        phone: { type: "string" },
        email: { type: "string" },
        custom: { type: "array", items: { type: "object" } }
      }
    }
  },
  required: ["trigger"]
} as const;

// Type inference from schema
export type BuildAnswers = {
  trigger: string;
  sheets?: {
    sheet_url: string;
    sheet_name: string;
    columns: string[];
  };
  gmail?: {
    search_query?: string;
    max_results?: number;
    extract_data?: string[];
  };
  slack?: {
    channel?: string;
    message_template?: string;
    username?: string;
  };
  jira?: {
    project_key?: string;
    issue_type?: string;
    summary_template?: string;
  };
  salesforce?: {
    lead_source?: string;
    assignment_rules?: string;
  };
  notifications?: {
    emails: string[];
    on: string[];
  };
  validation_rules?: {
    phone?: string;
    email?: string;
    custom?: any[];
  };
};

// Helper to validate build answers
export function validateBuildAnswers(answers: any): { valid: boolean; errors: any[] } {
  // In practice, you'd use AJV here
  const errors: any[] = [];
  
  if (!answers.trigger) {
    errors.push({ path: '/trigger', message: 'Trigger is required' });
  }
  
  if (answers.sheets) {
    if (!answers.sheets.sheet_url || !answers.sheets.sheet_url.includes('spreadsheets/d/')) {
      errors.push({ path: '/sheets/sheet_url', message: 'Valid Google Sheets URL is required' });
    }
    if (!answers.sheets.sheet_name) {
      errors.push({ path: '/sheets/sheet_name', message: 'Sheet name is required' });
    }
    if (!answers.sheets.columns || !Array.isArray(answers.sheets.columns) || answers.sheets.columns.length === 0) {
      errors.push({ path: '/sheets/columns', message: 'At least one column mapping is required' });
    }
  }
  
  return { valid: errors.length === 0, errors };
}