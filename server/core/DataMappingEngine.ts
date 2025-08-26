/**
 * DATA MAPPING ENGINE - Advanced data transformation and mapping system
 * Handles field mapping, expressions, and data transformation between workflow nodes
 */

export interface MappingExpression {
  type: 'static' | 'reference' | 'expression' | 'template';
  value: any;
  expression?: string;
  references?: Array<{
    nodeId: string;
    path: string;
    fallback?: any;
  }>;
}

export interface FieldMapping {
  sourceField?: string;
  targetField: string;
  expression: MappingExpression;
  transform?: string; // Built-in transformation function
  validation?: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    pattern?: string;
    min?: number;
    max?: number;
  };
}

export interface MappingContext {
  nodeOutputs: Record<string, any>;
  currentNode: any;
  globalVariables?: Record<string, any>;
  userContext?: Record<string, any>;
}

export interface ExpressionResult {
  success: boolean;
  value: any;
  error?: string;
  evaluationTime: number;
  referencesUsed: string[];
}

class DataMappingEngine {
  private builtInFunctions = new Map<string, Function>();
  private customFunctions = new Map<string, Function>();

  constructor() {
    this.initializeBuiltInFunctions();
    console.log('🗂️ Data Mapping Engine initialized with built-in functions');
  }

  /**
   * Apply field mappings to transform data
   */
  async applyMappings(
    mappings: FieldMapping[],
    context: MappingContext
  ): Promise<{
    success: boolean;
    result: Record<string, any>;
    errors: Array<{ field: string; error: string }>;
    metadata: {
      totalFields: number;
      successfulFields: number;
      evaluationTime: number;
      referencesUsed: string[];
    };
  }> {
    const startTime = Date.now();
    const result: Record<string, any> = {};
    const errors: Array<{ field: string; error: string }> = [];
    const allReferencesUsed = new Set<string>();

    for (const mapping of mappings) {
      try {
        const expressionResult = await this.evaluateExpression(mapping.expression, context);
        
        if (!expressionResult.success) {
          errors.push({
            field: mapping.targetField,
            error: expressionResult.error || 'Expression evaluation failed'
          });
          continue;
        }

        let value = expressionResult.value;
        
        // Apply built-in transformations
        if (mapping.transform) {
          value = await this.applyTransformation(value, mapping.transform);
        }

        // Apply validation
        if (mapping.validation) {
          const validationResult = this.validateValue(value, mapping.validation);
          if (!validationResult.valid) {
            errors.push({
              field: mapping.targetField,
              error: validationResult.error || 'Validation failed'
            });
            continue;
          }
        }

        // Set the mapped value
        this.setNestedValue(result, mapping.targetField, value);
        
        // Track references used
        expressionResult.referencesUsed.forEach(ref => allReferencesUsed.add(ref));

      } catch (error) {
        errors.push({
          field: mapping.targetField,
          error: error.message
        });
      }
    }

    const evaluationTime = Date.now() - startTime;

    return {
      success: errors.length === 0,
      result,
      errors,
      metadata: {
        totalFields: mappings.length,
        successfulFields: mappings.length - errors.length,
        evaluationTime,
        referencesUsed: Array.from(allReferencesUsed)
      }
    };
  }

  /**
   * Evaluate a mapping expression
   */
  async evaluateExpression(
    expression: MappingExpression,
    context: MappingContext
  ): Promise<ExpressionResult> {
    const startTime = Date.now();
    const referencesUsed: string[] = [];

    try {
      let value: any;

      switch (expression.type) {
        case 'static':
          value = expression.value;
          break;

        case 'reference':
          if (expression.references && expression.references.length > 0) {
            const ref = expression.references[0];
            value = this.getNestedValue(context.nodeOutputs[ref.nodeId], ref.path);
            if (value === undefined || value === null) {
              value = ref.fallback;
            }
            referencesUsed.push(`${ref.nodeId}.${ref.path}`);
          } else {
            throw new Error('Reference expression missing reference configuration');
          }
          break;

        case 'expression':
          if (!expression.expression) {
            throw new Error('Expression type missing expression string');
          }
          value = await this.evaluateJavaScriptExpression(expression.expression, context);
          // Track references used in expressions
          this.extractReferencesFromExpression(expression.expression).forEach(ref => {
            referencesUsed.push(ref);
          });
          break;

        case 'template':
          if (!expression.expression) {
            throw new Error('Template type missing template string');
          }
          value = await this.evaluateTemplate(expression.expression, context);
          // Track references used in templates
          this.extractReferencesFromTemplate(expression.expression).forEach(ref => {
            referencesUsed.push(ref);
          });
          break;

        default:
          throw new Error(`Unknown expression type: ${expression.type}`);
      }

      return {
        success: true,
        value,
        evaluationTime: Date.now() - startTime,
        referencesUsed
      };

    } catch (error) {
      return {
        success: false,
        value: null,
        error: error.message,
        evaluationTime: Date.now() - startTime,
        referencesUsed
      };
    }
  }

  /**
   * Evaluate JavaScript expression safely
   */
  private async evaluateJavaScriptExpression(expression: string, context: MappingContext): Promise<any> {
    // Create a safe execution context
    const safeContext = {
      // Node outputs
      nodes: context.nodeOutputs,
      
      // Helper functions
      coalesce: (...values: any[]) => {
        for (const value of values) {
          if (value !== null && value !== undefined && value !== '') {
            return value;
          }
        }
        return null;
      },
      
      formatDate: (date: any, format: string = 'YYYY-MM-DD') => {
        try {
          const d = new Date(date);
          if (isNaN(d.getTime())) return null;
          
          // Simple date formatting
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          const seconds = String(d.getSeconds()).padStart(2, '0');
          
          return format
            .replace('YYYY', year.toString())
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
        } catch {
          return null;
        }
      },
      
      slugify: (text: string) => {
        if (typeof text !== 'string') return '';
        return text
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '');
      },
      
      substring: (text: string, start: number, length?: number) => {
        if (typeof text !== 'string') return '';
        return length !== undefined ? text.substr(start, length) : text.substr(start);
      },
      
      uppercase: (text: string) => typeof text === 'string' ? text.toUpperCase() : '',
      lowercase: (text: string) => typeof text === 'string' ? text.toLowerCase() : '',
      trim: (text: string) => typeof text === 'string' ? text.trim() : '',
      
      // Math functions
      Math: {
        round: Math.round,
        floor: Math.floor,
        ceil: Math.ceil,
        abs: Math.abs,
        min: Math.min,
        max: Math.max,
        random: Math.random
      },
      
      // Array functions
      length: (arr: any) => Array.isArray(arr) ? arr.length : 0,
      join: (arr: any[], separator: string = ',') => Array.isArray(arr) ? arr.join(separator) : '',
      filter: (arr: any[], predicate: (item: any) => boolean) => Array.isArray(arr) ? arr.filter(predicate) : [],
      map: (arr: any[], mapper: (item: any) => any) => Array.isArray(arr) ? arr.map(mapper) : [],
      
      // Conditional functions
      if: (condition: boolean, trueValue: any, falseValue: any) => condition ? trueValue : falseValue,
      
      // Custom functions
      ...Object.fromEntries(this.customFunctions.entries())
    };

    try {
      // Use Function constructor for safer evaluation than eval
      // Still not completely safe, but better than direct eval
      const func = new Function(
        ...Object.keys(safeContext),
        `"use strict"; return (${expression});`
      );
      
      const result = func(...Object.values(safeContext));
      return result;
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error.message}`);
    }
  }

  /**
   * Evaluate template string with variable interpolation
   */
  private async evaluateTemplate(template: string, context: MappingContext): Promise<string> {
    let result = template;
    
    // Replace node references: {{nodes.nodeId.path}}
    const nodeRegex = /\{\{nodes\.([^.]+)\.([^}]+)\}\}/g;
    result = result.replace(nodeRegex, (match, nodeId, path) => {
      const value = this.getNestedValue(context.nodeOutputs[nodeId], path);
      return value !== null && value !== undefined ? String(value) : '';
    });
    
    // Replace simple variables: {{variableName}}
    const varRegex = /\{\{([^}]+)\}\}/g;
    result = result.replace(varRegex, (match, varName) => {
      const trimmed = varName.trim();
      
      // Check global variables
      if (context.globalVariables && context.globalVariables[trimmed] !== undefined) {
        return String(context.globalVariables[trimmed]);
      }
      
      // Check user context
      if (context.userContext && context.userContext[trimmed] !== undefined) {
        return String(context.userContext[trimmed]);
      }
      
      return match; // Return original if not found
    });
    
    return result;
  }

  /**
   * Apply built-in transformation function
   */
  private async applyTransformation(value: any, transformName: string): Promise<any> {
    const transform = this.builtInFunctions.get(transformName);
    if (!transform) {
      throw new Error(`Unknown transformation: ${transformName}`);
    }
    
    return transform(value);
  }

  /**
   * Validate value against validation rules
   */
  private validateValue(value: any, validation: FieldMapping['validation']): {
    valid: boolean;
    error?: string;
  } {
    if (!validation) return { valid: true };

    // Required check
    if (validation.required && (value === null || value === undefined || value === '')) {
      return { valid: false, error: 'Field is required' };
    }

    // Type check
    if (validation.type && value !== null && value !== undefined) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== validation.type) {
        return { valid: false, error: `Expected type ${validation.type}, got ${actualType}` };
      }
    }

    // Pattern check (for strings)
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        return { valid: false, error: `Value does not match pattern: ${validation.pattern}` };
      }
    }

    // Min/Max checks
    if (validation.min !== undefined) {
      if (typeof value === 'number' && value < validation.min) {
        return { valid: false, error: `Value must be at least ${validation.min}` };
      }
      if (typeof value === 'string' && value.length < validation.min) {
        return { valid: false, error: `Length must be at least ${validation.min}` };
      }
    }

    if (validation.max !== undefined) {
      if (typeof value === 'number' && value > validation.max) {
        return { valid: false, error: `Value must be at most ${validation.max}` };
      }
      if (typeof value === 'string' && value.length > validation.max) {
        return { valid: false, error: `Length must be at most ${validation.max}` };
      }
    }

    return { valid: true };
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      // Handle array indexing
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        current = current[parseInt(key)];
      } else {
        current = current[key];
      }
    }
    
    return current;
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      
      if (!(key in current) || typeof current[key] !== 'object') {
        // Determine if next key is array index
        const nextKey = keys[i + 1];
        current[key] = /^\d+$/.test(nextKey) ? [] : {};
      }
      
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Extract node references from expression string
   */
  private extractReferencesFromExpression(expression: string): string[] {
    const references: string[] = [];
    const regex = /nodes\.([^.\s]+)\.([^.\s\)]+)/g;
    let match;
    
    while ((match = regex.exec(expression)) !== null) {
      references.push(`${match[1]}.${match[2]}`);
    }
    
    return references;
  }

  /**
   * Extract node references from template string
   */
  private extractReferencesFromTemplate(template: string): string[] {
    const references: string[] = [];
    const regex = /\{\{nodes\.([^.]+)\.([^}]+)\}\}/g;
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      references.push(`${match[1]}.${match[2]}`);
    }
    
    return references;
  }

  /**
   * Initialize built-in transformation functions
   */
  private initializeBuiltInFunctions(): void {
    // String transformations
    this.builtInFunctions.set('uppercase', (value: any) => 
      typeof value === 'string' ? value.toUpperCase() : String(value).toUpperCase()
    );
    
    this.builtInFunctions.set('lowercase', (value: any) => 
      typeof value === 'string' ? value.toLowerCase() : String(value).toLowerCase()
    );
    
    this.builtInFunctions.set('trim', (value: any) => 
      typeof value === 'string' ? value.trim() : String(value).trim()
    );
    
    this.builtInFunctions.set('slugify', (value: any) => {
      const text = String(value);
      return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    });

    // Number transformations
    this.builtInFunctions.set('toNumber', (value: any) => {
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    });
    
    this.builtInFunctions.set('round', (value: any) => Math.round(Number(value)));
    this.builtInFunctions.set('floor', (value: any) => Math.floor(Number(value)));
    this.builtInFunctions.set('ceil', (value: any) => Math.ceil(Number(value)));

    // Date transformations
    this.builtInFunctions.set('formatDate', (value: any, format: string = 'YYYY-MM-DD') => {
      try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return null;
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return format
          .replace('YYYY', year.toString())
          .replace('MM', month)
          .replace('DD', day);
      } catch {
        return null;
      }
    });

    // Array transformations
    this.builtInFunctions.set('join', (value: any, separator: string = ',') => 
      Array.isArray(value) ? value.join(separator) : String(value)
    );
    
    this.builtInFunctions.set('split', (value: any, separator: string = ',') => 
      typeof value === 'string' ? value.split(separator) : [value]
    );
    
    this.builtInFunctions.set('length', (value: any) => 
      Array.isArray(value) ? value.length : String(value).length
    );

    // Type conversions
    this.builtInFunctions.set('toString', (value: any) => String(value));
    this.builtInFunctions.set('toBoolean', (value: any) => Boolean(value));
    
    // JSON operations
    this.builtInFunctions.set('parseJSON', (value: any) => {
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        return null;
      }
    });
    
    this.builtInFunctions.set('stringifyJSON', (value: any) => {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    });
  }

  /**
   * Register a custom transformation function
   */
  registerCustomFunction(name: string, func: Function): void {
    this.customFunctions.set(name, func);
    console.log(`📝 Registered custom function: ${name}`);
  }

  /**
   * Get available transformation functions
   */
  getAvailableFunctions(): {
    builtIn: string[];
    custom: string[];
  } {
    return {
      builtIn: Array.from(this.builtInFunctions.keys()),
      custom: Array.from(this.customFunctions.keys())
    };
  }

  /**
   * Test expression syntax and references
   */
  async testExpression(
    expression: MappingExpression,
    sampleContext: MappingContext
  ): Promise<{
    valid: boolean;
    result?: any;
    error?: string;
    referencesUsed: string[];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    try {
      const result = await this.evaluateExpression(expression, sampleContext);
      
      // Check for potentially missing references
      if (expression.type === 'expression' && expression.expression) {
        const referencesInExpression = this.extractReferencesFromExpression(expression.expression);
        for (const ref of referencesInExpression) {
          const [nodeId, path] = ref.split('.');
          if (!sampleContext.nodeOutputs[nodeId]) {
            warnings.push(`Referenced node '${nodeId}' not found in sample context`);
          }
        }
      }
      
      return {
        valid: result.success,
        result: result.value,
        error: result.error,
        referencesUsed: result.referencesUsed,
        warnings
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        referencesUsed: [],
        warnings
      };
    }
  }
}

export const dataMappingEngine = new DataMappingEngine();