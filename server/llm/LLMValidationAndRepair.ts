/**
 * LLM VALIDATION & REPAIR - Ensures reliable structured outputs
 * Validates LLM responses against JSON schemas and auto-repairs invalid outputs
 */

import { llmRegistry } from './LLMProvider';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  repairedData?: any;
  repairAttempts: number;
  originalResponse?: string;
  finalResponse?: string;
  validationDetails: {
    schemaPath?: string;
    errorType: 'parse' | 'schema' | 'format' | 'type' | 'constraint';
    field?: string;
    expected?: string;
    actual?: string;
  }[];
}

export interface RepairOptions {
  maxRepairAttempts: number;
  strictMode: boolean; // If true, fail on any validation error; if false, attempt best-effort fixes
  repairStrategy: 'llm' | 'rule_based' | 'hybrid';
  preservePartialData: boolean; // Keep valid parts of invalid JSON
  provider?: string;
  model?: string;
}

class LLMValidationAndRepair {
  private defaultRepairOptions: RepairOptions = {
    maxRepairAttempts: 3,
    strictMode: false,
    repairStrategy: 'hybrid',
    preservePartialData: true,
    provider: 'openai',
    model: 'openai:gpt-4o-mini'
  };

  /**
   * Validate and potentially repair LLM output against a JSON schema
   */
  async validateAndRepair(
    llmOutput: string,
    jsonSchema: any,
    originalPrompt?: string,
    options: Partial<RepairOptions> = {}
  ): Promise<ValidationResult> {
    const opts = { ...this.defaultRepairOptions, ...options };
    const result: ValidationResult = {
      isValid: false,
      errors: [],
      repairAttempts: 0,
      originalResponse: llmOutput,
      validationDetails: []
    };

    let currentOutput = llmOutput;
    
    // First attempt: validate the original output
    const initialValidation = await this.validateAgainstSchema(currentOutput, jsonSchema);
    
    if (initialValidation.isValid) {
      result.isValid = true;
      result.repairedData = initialValidation.parsedData;
      result.finalResponse = currentOutput;
      return result;
    }

    // Track validation errors
    result.errors = initialValidation.errors;
    result.validationDetails = initialValidation.validationDetails;

    // Attempt repairs if not in strict mode
    if (!opts.strictMode && opts.maxRepairAttempts > 0) {
      const repairResult = await this.attemptRepairs(
        currentOutput, 
        jsonSchema, 
        originalPrompt, 
        opts,
        initialValidation
      );
      
      result.repairAttempts = repairResult.attempts;
      result.repairedData = repairResult.repairedData;
      result.finalResponse = repairResult.finalOutput;
      result.isValid = repairResult.isValid;
      
      if (repairResult.errors.length > 0) {
        result.errors.push(...repairResult.errors);
      }
    }

    return result;
  }

  /**
   * Validate JSON string against schema
   */
  private async validateAgainstSchema(jsonString: string, schema: any): Promise<{
    isValid: boolean;
    errors: string[];
    parsedData?: any;
    validationDetails: ValidationResult['validationDetails'];
  }> {
    const errors: string[] = [];
    const validationDetails: ValidationResult['validationDetails'] = [];
    let parsedData: any;

    // Step 1: Try to parse JSON
    try {
      parsedData = JSON.parse(jsonString.trim());
    } catch (parseError) {
      errors.push(`JSON parsing failed: ${parseError.message}`);
      validationDetails.push({
        errorType: 'parse',
        expected: 'Valid JSON',
        actual: 'Invalid JSON syntax'
      });
      
      // Try to extract JSON from mixed content
      const extractedJson = this.extractJsonFromText(jsonString);
      if (extractedJson) {
        try {
          parsedData = JSON.parse(extractedJson);
          errors.pop(); // Remove the parsing error
          validationDetails.pop();
        } catch {
          return { isValid: false, errors, validationDetails };
        }
      } else {
        return { isValid: false, errors, validationDetails };
      }
    }

    // Step 2: Validate against schema
    const schemaValidation = this.validateDataAgainstSchema(parsedData, schema);
    errors.push(...schemaValidation.errors);
    validationDetails.push(...schemaValidation.validationDetails);

    return {
      isValid: errors.length === 0,
      errors,
      parsedData: errors.length === 0 ? parsedData : undefined,
      validationDetails
    };
  }

  /**
   * Attempt to repair invalid LLM output
   */
  private async attemptRepairs(
    originalOutput: string,
    schema: any,
    originalPrompt: string | undefined,
    options: RepairOptions,
    initialValidation: any
  ): Promise<{
    isValid: boolean;
    repairedData?: any;
    finalOutput: string;
    attempts: number;
    errors: string[];
  }> {
    let currentOutput = originalOutput;
    let attempts = 0;
    const errors: string[] = [];

    while (attempts < options.maxRepairAttempts) {
      attempts++;
      
      try {
        let repairedOutput: string;
        
        switch (options.repairStrategy) {
          case 'rule_based':
            repairedOutput = await this.ruleBasedRepair(currentOutput, schema, initialValidation);
            break;
          case 'llm':
            repairedOutput = await this.llmBasedRepair(currentOutput, schema, originalPrompt, options);
            break;
          case 'hybrid':
          default:
            // Try rule-based first, then LLM if it fails
            repairedOutput = await this.ruleBasedRepair(currentOutput, schema, initialValidation);
            
            const ruleValidation = await this.validateAgainstSchema(repairedOutput, schema);
            if (!ruleValidation.isValid) {
              repairedOutput = await this.llmBasedRepair(currentOutput, schema, originalPrompt, options);
            }
            break;
        }

        // Validate the repaired output
        const validation = await this.validateAgainstSchema(repairedOutput, schema);
        
        if (validation.isValid) {
          return {
            isValid: true,
            repairedData: validation.parsedData,
            finalOutput: repairedOutput,
            attempts,
            errors
          };
        } else {
          currentOutput = repairedOutput;
          errors.push(`Repair attempt ${attempts} failed: ${validation.errors.join(', ')}`);
        }
        
      } catch (repairError) {
        errors.push(`Repair attempt ${attempts} error: ${repairError.message}`);
      }
    }

    return {
      isValid: false,
      finalOutput: currentOutput,
      attempts,
      errors
    };
  }

  /**
   * Rule-based repair using common patterns and fixes
   */
  private async ruleBasedRepair(output: string, schema: any, validationResult: any): Promise<string> {
    let repaired = output.trim();

    // Common JSON fixes
    repaired = this.fixCommonJsonIssues(repaired);
    
    // Extract JSON if it's embedded in other text
    const extractedJson = this.extractJsonFromText(repaired);
    if (extractedJson) {
      repaired = extractedJson;
    }

    // Try to fix schema-specific issues
    repaired = this.fixSchemaIssues(repaired, schema);

    return repaired;
  }

  /**
   * LLM-based repair using another LLM call
   */
  private async llmBasedRepair(
    output: string,
    schema: any,
    originalPrompt: string | undefined,
    options: RepairOptions
  ): Promise<string> {
    const provider = llmRegistry.get(options.provider || 'openai');
    
    const repairPrompt = this.buildRepairPrompt(output, schema, originalPrompt);
    
    const result = await provider.generate({
      model: options.model || 'openai:gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a JSON repair specialist. Your task is to fix invalid JSON to match the required schema. 
          Return ONLY the corrected JSON, nothing else. Do not include explanations or markdown formatting.`
        },
        {
          role: 'user',
          content: repairPrompt
        }
      ],
      temperature: 0.1,
      maxTokens: 2000
    });

    return result.text || output;
  }

  /**
   * Fix common JSON syntax issues
   */
  private fixCommonJsonIssues(jsonString: string): string {
    let fixed = jsonString;

    // Remove markdown code blocks
    fixed = fixed.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '');
    
    // Fix trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');
    
    // Fix unescaped quotes in strings
    fixed = fixed.replace(/"([^"]*)"([^"]*)"([^"]*?)"/g, '"$1\\"$2\\"$3"');
    
    // Fix missing quotes around keys
    fixed = fixed.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '"$1":');
    
    // Fix boolean values
    fixed = fixed.replace(/:\s*True\b/g, ': true');
    fixed = fixed.replace(/:\s*False\b/g, ': false');
    fixed = fixed.replace(/:\s*None\b/g, ': null');
    
    // Remove extra commas before closing brackets
    fixed = fixed.replace(/,\s*}/g, '}');
    fixed = fixed.replace(/,\s*]/g, ']');

    return fixed;
  }

  /**
   * Extract JSON from text that might contain other content
   */
  private extractJsonFromText(text: string): string | null {
    // Try to find JSON object boundaries
    const patterns = [
      /\{[\s\S]*\}/,  // Find outermost braces
      /\[[\s\S]*\]/   // Find outermost brackets
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          JSON.parse(match[0]);
          return match[0];
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Fix issues specific to the schema requirements
   */
  private fixSchemaIssues(jsonString: string, schema: any): string {
    try {
      const data = JSON.parse(jsonString);
      const fixed = this.fixDataAgainstSchema(data, schema);
      return JSON.stringify(fixed, null, 2);
    } catch {
      return jsonString;
    }
  }

  /**
   * Fix data object to match schema requirements
   */
  private fixDataAgainstSchema(data: any, schema: any): any {
    if (!schema || typeof schema !== 'object') return data;

    const fixed = { ...data };

    // Handle required properties
    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredField of schema.required) {
        if (!(requiredField in fixed)) {
          // Add missing required field with default value
          fixed[requiredField] = this.getDefaultValueForType(schema.properties?.[requiredField]);
        }
      }
    }

    // Handle property types
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties as any)) {
        if (key in fixed) {
          fixed[key] = this.fixValueForType(fixed[key], propSchema);
        }
      }
    }

    return fixed;
  }

  /**
   * Get default value for a schema type
   */
  private getDefaultValueForType(propSchema: any): any {
    if (!propSchema || typeof propSchema !== 'object') return null;

    switch (propSchema.type) {
      case 'string': return propSchema.default || '';
      case 'number': return propSchema.default || 0;
      case 'integer': return propSchema.default || 0;
      case 'boolean': return propSchema.default || false;
      case 'array': return propSchema.default || [];
      case 'object': return propSchema.default || {};
      default: return null;
    }
  }

  /**
   * Fix value to match expected type
   */
  private fixValueForType(value: any, propSchema: any): any {
    if (!propSchema || typeof propSchema !== 'object') return value;

    switch (propSchema.type) {
      case 'string':
        return typeof value === 'string' ? value : String(value);
      case 'number':
        return typeof value === 'number' ? value : parseFloat(value) || 0;
      case 'integer':
        return typeof value === 'number' ? Math.floor(value) : parseInt(value) || 0;
      case 'boolean':
        return typeof value === 'boolean' ? value : Boolean(value);
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'object':
        return typeof value === 'object' && value !== null ? value : {};
      default:
        return value;
    }
  }

  /**
   * Validate data against schema (simplified JSON Schema validation)
   */
  private validateDataAgainstSchema(data: any, schema: any): {
    errors: string[];
    validationDetails: ValidationResult['validationDetails'];
  } {
    const errors: string[] = [];
    const validationDetails: ValidationResult['validationDetails'] = [];

    if (!schema || typeof schema !== 'object') {
      return { errors, validationDetails };
    }

    // Check type
    if (schema.type) {
      const actualType = Array.isArray(data) ? 'array' : typeof data;
      if (actualType !== schema.type) {
        errors.push(`Expected type ${schema.type}, got ${actualType}`);
        validationDetails.push({
          errorType: 'type',
          expected: schema.type,
          actual: actualType
        });
      }
    }

    // Check required properties
    if (schema.required && Array.isArray(schema.required) && typeof data === 'object') {
      for (const requiredField of schema.required) {
        if (!(requiredField in data)) {
          errors.push(`Missing required property: ${requiredField}`);
          validationDetails.push({
            errorType: 'constraint',
            field: requiredField,
            expected: 'required property',
            actual: 'missing'
          });
        }
      }
    }

    // Check properties
    if (schema.properties && typeof data === 'object') {
      for (const [key, propSchema] of Object.entries(schema.properties as any)) {
        if (key in data) {
          const propValidation = this.validateDataAgainstSchema(data[key], propSchema);
          for (const error of propValidation.errors) {
            errors.push(`Property ${key}: ${error}`);
          }
          for (const detail of propValidation.validationDetails) {
            validationDetails.push({
              ...detail,
              schemaPath: key,
              field: key
            });
          }
        }
      }
    }

    return { errors, validationDetails };
  }

  /**
   * Build repair prompt for LLM-based repair
   */
  private buildRepairPrompt(output: string, schema: any, originalPrompt?: string): string {
    const schemaStr = JSON.stringify(schema, null, 2);
    
    let prompt = `I need you to fix this JSON output to match the required schema.

REQUIRED SCHEMA:
${schemaStr}

INVALID JSON OUTPUT:
${output}

Please return the corrected JSON that:
1. Is valid JSON syntax
2. Matches the required schema exactly
3. Preserves as much of the original data as possible
4. Adds any missing required fields with appropriate default values

Return ONLY the corrected JSON, no explanations:`;

    if (originalPrompt) {
      prompt += `\n\nORIGINAL CONTEXT: The JSON was generated in response to: "${originalPrompt}"`;
    }

    return prompt;
  }

  /**
   * Get validation statistics for monitoring
   */
  getValidationStats(): {
    totalValidations: number;
    successRate: number;
    repairSuccessRate: number;
    commonErrors: Array<{ error: string; count: number }>;
  } {
    // TODO: Implement stats tracking
    return {
      totalValidations: 0,
      successRate: 1,
      repairSuccessRate: 1,
      commonErrors: []
    };
  }
}

export const llmValidationAndRepair = new LLMValidationAndRepair();