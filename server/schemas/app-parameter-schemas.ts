/**
 * P1-6: Per-app typed parameter schemas for better UX
 * 
 * This file defines the parameter schemas for each application,
 * providing proper form validation, input types, and user guidance.
 */

export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'select' | 'textarea' | 'password';
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  defaultValue?: any;
}

export interface AppParameterSchema {
  [operation: string]: {
    [parameter: string]: ParameterSchema;
  };
}

// Core Google Workspace Apps
export const googleSheetsSchema: AppParameterSchema = {
  'onEdit': {
    spreadsheetUrl: {
      type: 'url',
      label: 'Spreadsheet URL',
      description: 'The Google Sheets URL to monitor for changes',
      required: true,
      placeholder: 'https://docs.google.com/spreadsheets/d/...',
      validation: {
        pattern: '^https://docs\\.google\\.com/spreadsheets/d/[a-zA-Z0-9-_]+',
        message: 'Must be a valid Google Sheets URL'
      }
    }
  },
  'getRow': {
    spreadsheetUrl: {
      type: 'url',
      label: 'Spreadsheet URL',
      description: 'The Google Sheets URL to read from',
      required: true,
      placeholder: 'https://docs.google.com/spreadsheets/d/...'
    },
    sheetName: {
      type: 'string',
      label: 'Sheet Name',
      description: 'Name of the specific sheet tab',
      placeholder: 'Sheet1',
      defaultValue: 'Sheet1'
    },
    rowNumber: {
      type: 'number',
      label: 'Row Number',
      description: 'Row number to retrieve (1-based)',
      required: true,
      validation: { min: 1 }
    }
  },
  'updateCell': {
    spreadsheetUrl: {
      type: 'url',
      label: 'Spreadsheet URL',
      required: true,
      placeholder: 'https://docs.google.com/spreadsheets/d/...'
    },
    cellRange: {
      type: 'string',
      label: 'Cell Range',
      description: 'Cell range in A1 notation (e.g., A1, B2:C3)',
      required: true,
      placeholder: 'A1'
    },
    value: {
      type: 'string',
      label: 'Cell Value',
      description: 'Value to set in the cell',
      required: true,
      placeholder: 'New value'
    }
  },
  'append_row': {
    spreadsheetUrl: {
      type: 'url',
      label: 'Spreadsheet URL',
      required: true,
      placeholder: 'https://docs.google.com/spreadsheets/d/...'
    },
    values: {
      type: 'textarea',
      label: 'Row Values',
      description: 'Comma-separated values to append as a new row',
      required: true,
      placeholder: 'value1, value2, value3'
    }
  }
};

export const gmailSchema: AppParameterSchema = {
  'sendEmail': {
    to: {
      type: 'email',
      label: 'To Email',
      description: 'Recipient email address',
      required: true,
      placeholder: 'recipient@example.com'
    },
    subject: {
      type: 'string',
      label: 'Subject',
      description: 'Email subject line',
      required: true,
      placeholder: 'Email subject'
    },
    body: {
      type: 'textarea',
      label: 'Email Body',
      description: 'Email content',
      required: true,
      placeholder: 'Email message content...'
    },
    cc: {
      type: 'email',
      label: 'CC Email',
      description: 'Carbon copy recipient (optional)',
      placeholder: 'cc@example.com'
    }
  },
  'search_emails': {
    query: {
      type: 'string',
      label: 'Search Query',
      description: 'Gmail search query (e.g., "from:example.com")',
      required: true,
      placeholder: 'from:example.com OR subject:important'
    },
    maxResults: {
      type: 'number',
      label: 'Max Results',
      description: 'Maximum number of emails to return',
      defaultValue: 10,
      validation: { min: 1, max: 100 }
    }
  },
  'send_reply': {
    originalMessageId: {
      type: 'string',
      label: 'Original Message ID',
      description: 'ID of the message to reply to',
      required: true,
      placeholder: 'Gmail message ID'
    },
    replyBody: {
      type: 'textarea',
      label: 'Reply Content',
      description: 'Reply message content',
      required: true,
      placeholder: 'Your reply message...'
    }
  }
};

// Communication Apps
export const slackSchema: AppParameterSchema = {
  'send_message': {
    channel: {
      type: 'string',
      label: 'Channel',
      description: 'Slack channel name or ID',
      required: true,
      placeholder: '#general'
    },
    message: {
      type: 'textarea',
      label: 'Message',
      description: 'Message content to send',
      required: true,
      placeholder: 'Hello from automation!'
    },
    username: {
      type: 'string',
      label: 'Bot Username',
      description: 'Display name for the bot (optional)',
      placeholder: 'Automation Bot'
    }
  }
};

export const microsoftTeamsSchema: AppParameterSchema = {
  'send_message': {
    channelId: {
      type: 'string',
      label: 'Channel ID',
      description: 'Microsoft Teams channel ID',
      required: true,
      placeholder: 'Channel ID from Teams'
    },
    message: {
      type: 'textarea',
      label: 'Message',
      description: 'Message content to send',
      required: true,
      placeholder: 'Hello from automation!'
    }
  }
};

// CRM Apps
export const salesforceSchema: AppParameterSchema = {
  'create_lead': {
    firstName: {
      type: 'string',
      label: 'First Name',
      required: true,
      placeholder: 'John'
    },
    lastName: {
      type: 'string',
      label: 'Last Name',
      required: true,
      placeholder: 'Doe'
    },
    email: {
      type: 'email',
      label: 'Email',
      required: true,
      placeholder: 'john.doe@example.com'
    },
    company: {
      type: 'string',
      label: 'Company',
      required: true,
      placeholder: 'Acme Corp'
    },
    phone: {
      type: 'string',
      label: 'Phone Number',
      placeholder: '+1 (555) 123-4567'
    }
  }
};

export const hubspotSchema: AppParameterSchema = {
  'create_contact': {
    email: {
      type: 'email',
      label: 'Email',
      required: true,
      placeholder: 'contact@example.com'
    },
    firstName: {
      type: 'string',
      label: 'First Name',
      placeholder: 'John'
    },
    lastName: {
      type: 'string',
      label: 'Last Name',
      placeholder: 'Doe'
    },
    company: {
      type: 'string',
      label: 'Company',
      placeholder: 'Acme Corp'
    }
  }
};

// E-commerce Apps
export const shopifySchema: AppParameterSchema = {
  'create_product': {
    title: {
      type: 'string',
      label: 'Product Title',
      required: true,
      placeholder: 'Amazing Product'
    },
    description: {
      type: 'textarea',
      label: 'Product Description',
      placeholder: 'Detailed product description...'
    },
    price: {
      type: 'number',
      label: 'Price',
      required: true,
      placeholder: '29.99',
      validation: { min: 0 }
    },
    inventory: {
      type: 'number',
      label: 'Inventory Quantity',
      defaultValue: 1,
      validation: { min: 0 }
    }
  }
};

export const stripeSchema: AppParameterSchema = {
  'create_payment': {
    amount: {
      type: 'number',
      label: 'Amount (cents)',
      description: 'Payment amount in cents (e.g., 2999 for $29.99)',
      required: true,
      placeholder: '2999',
      validation: { min: 50 }
    },
    currency: {
      type: 'select',
      label: 'Currency',
      required: true,
      defaultValue: 'usd',
      options: [
        { value: 'usd', label: 'USD' },
        { value: 'eur', label: 'EUR' },
        { value: 'gbp', label: 'GBP' },
        { value: 'cad', label: 'CAD' }
      ]
    },
    customerEmail: {
      type: 'email',
      label: 'Customer Email',
      required: true,
      placeholder: 'customer@example.com'
    },
    description: {
      type: 'string',
      label: 'Payment Description',
      placeholder: 'Payment for order #123'
    }
  }
};

// Time-based triggers
export const timeSchema: AppParameterSchema = {
  'schedule': {
    frequency: {
      type: 'select',
      label: 'Frequency',
      required: true,
      options: [
        { value: '5min', label: 'Every 5 minutes' },
        { value: '15min', label: 'Every 15 minutes' },
        { value: '30min', label: 'Every 30 minutes' },
        { value: '1hour', label: 'Every hour' },
        { value: '6hours', label: 'Every 6 hours' },
        { value: '12hours', label: 'Every 12 hours' },
        { value: '1day', label: 'Daily' },
        { value: '1week', label: 'Weekly' }
      ]
    }
  },
  'delay': {
    hours: {
      type: 'number',
      label: 'Delay Hours',
      description: 'Number of hours to delay',
      required: true,
      defaultValue: 1,
      validation: { min: 0.1, max: 168 }
    }
  }
};

// Master schema registry
export const APP_PARAMETER_SCHEMAS: Record<string, AppParameterSchema> = {
  'sheets': googleSheetsSchema,
  'gmail': gmailSchema,
  'slack': slackSchema,
  'microsoft-teams': microsoftTeamsSchema,
  'salesforce': salesforceSchema,
  'hubspot': hubspotSchema,
  'shopify': shopifySchema,
  'stripe': stripeSchema,
  'time': timeSchema
};

// Helper function to get schema for a specific app and operation
export function getParameterSchema(app: string, operation: string): Record<string, ParameterSchema> | null {
  const appSchema = APP_PARAMETER_SCHEMAS[app];
  if (!appSchema) return null;
  
  return appSchema[operation] || null;
}

// Helper function to validate parameters against schema
export function validateParameters(app: string, operation: string, params: Record<string, any>): {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
} {
  const schema = getParameterSchema(app, operation);
  if (!schema) return { isValid: true, errors: [] };

  const errors: Array<{ field: string; message: string }> = [];

  // Check required fields
  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    if (fieldSchema.required && (!params[fieldName] || params[fieldName] === '')) {
      errors.push({
        field: fieldName,
        message: `${fieldSchema.label} is required`
      });
    }

    // Type and validation checks
    const value = params[fieldName];
    if (value !== undefined && value !== '') {
      // Email validation
      if (fieldSchema.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push({
            field: fieldName,
            message: `${fieldSchema.label} must be a valid email address`
          });
        }
      }

      // URL validation
      if (fieldSchema.type === 'url') {
        try {
          new URL(value);
        } catch {
          errors.push({
            field: fieldName,
            message: `${fieldSchema.label} must be a valid URL`
          });
        }
      }

      // Number validation
      if (fieldSchema.type === 'number') {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors.push({
            field: fieldName,
            message: `${fieldSchema.label} must be a number`
          });
        } else if (fieldSchema.validation) {
          if (fieldSchema.validation.min !== undefined && numValue < fieldSchema.validation.min) {
            errors.push({
              field: fieldName,
              message: `${fieldSchema.label} must be at least ${fieldSchema.validation.min}`
            });
          }
          if (fieldSchema.validation.max !== undefined && numValue > fieldSchema.validation.max) {
            errors.push({
              field: fieldName,
              message: `${fieldSchema.label} must be at most ${fieldSchema.validation.max}`
            });
          }
        }
      }

      // Pattern validation
      if (fieldSchema.validation?.pattern) {
        const regex = new RegExp(fieldSchema.validation.pattern);
        if (!regex.test(value)) {
          errors.push({
            field: fieldName,
            message: fieldSchema.validation.message || `${fieldSchema.label} format is invalid`
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}