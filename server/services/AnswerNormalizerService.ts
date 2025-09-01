/**
 * ChatGPT's LLM-Powered Answer Normalization Service
 * 
 * Uses LLM intelligence to convert free-form user answers into
 * the exact structured format the compiler expects.
 */

import { LLMProviderService } from './LLMProviderService.js';
import { Question, BuildAnswers } from '../../shared/build-schema.js';

export interface NormalizationResult {
  normalized: BuildAnswers;
  __issues: Array<{ path: string; reason: string }>;
  provider: string;
  processingTime: number;
}

export class AnswerNormalizerService {
  
  /**
   * CRITICAL: LLM-powered answer normalization
   * Let the LLM intelligently convert free-form answers to structured format
   */
  static async normalizeAnswersLLM(
    questions: Question[], 
    rawAnswers: Record<string, any>, 
    timezone: string = 'UTC'
  ): Promise<NormalizationResult> {
    const startTime = Date.now();
    
    console.log('🧠 LLM Answer Normalization starting:', {
      questionCount: questions.length,
      rawAnswerKeys: Object.keys(rawAnswers),
      timezone
    });

    const systemPrompt = `You are a precise data normalizer for automation workflows. Your job is to convert user's free-form answers into a structured JSON object that matches the exact schema the compiler expects.

INSTRUCTIONS:
1. Analyze the questions and their expected output format
2. Convert user answers to the exact structure needed
3. Use intelligent coercion (e.g., "every 15 minutes" → "time.every_15_minutes")
4. Extract structured data from free text (URLs, emails, lists)
5. If data is missing or invalid, set null and report in __issues

TIMEZONE: ${timezone}

EXPECTED OUTPUT STRUCTURE:
{
  "normalized": {
    "trigger": "time.every_15_minutes",
    "sheets": {
      "sheet_url": "https://docs.google.com/spreadsheets/d/...",
      "sheet_name": "Sheet1", 
      "columns": ["Column A", "Column B"]
    },
    "gmail": {
      "search_query": "subject:invoice",
      "max_results": 50
    },
    "slack": {
      "channel": "#notifications",
      "message_template": "New email: {{subject}}"
    }
  },
  "__issues": [
    {"path": "/sheets/sheet_url", "reason": "missing or invalid URL format"}
  ]
}

COERCION RULES:
- Schedule frequencies: "every X minutes/hours" → "time.every_X_minutes/hours"
- Sheet URLs: Extract from any text containing "spreadsheets/d/"
- Comma-separated lists: Convert to arrays
- Email lists: Extract valid email addresses
- Channel names: Ensure # prefix for Slack channels
- Multi-line mappings: Parse into structured column mappings

RESPOND WITH VALID JSON ONLY. No explanations or markdown.`;

    const userPrompt = `QUESTIONS AND ANSWERS TO NORMALIZE:

QUESTIONS:
${JSON.stringify(questions, null, 2)}

USER'S RAW ANSWERS:
${JSON.stringify(rawAnswers, null, 2)}

Convert these answers to the exact structured format needed by the automation compiler. Use intelligent coercion and extraction to handle free-form text appropriately.`;

    try {
      const result = await LLMProviderService.generateText(userPrompt, {
        model: 'gemini-2.0-flash-exp',
        temperature: 0.1, // Low temperature for precise formatting
        maxTokens: 1500
      });

      console.log(`✅ LLM normalization response from ${result.provider}:`, {
        responseLength: result.text.length,
        model: result.model
      });

      // Parse LLM response
      let parsed: { normalized: BuildAnswers; __issues: any[] };
      try {
        const cleanedResponse = result.text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('❌ Failed to parse LLM normalization response:', parseError);
        
        // Fallback to deterministic normalization
        return this.fallbackNormalization(questions, rawAnswers, result.provider);
      }

      // Validate the normalized structure
      if (!parsed.normalized || typeof parsed.normalized !== 'object') {
        console.warn('⚠️ LLM returned invalid normalized structure, using fallback');
        return this.fallbackNormalization(questions, rawAnswers, result.provider);
      }

      const processingTime = Date.now() - startTime;
      
      console.log('✅ LLM normalization completed:', {
        normalizedKeys: Object.keys(parsed.normalized),
        issuesCount: parsed.__issues?.length || 0,
        processingTime
      });

      return {
        normalized: parsed.normalized,
        __issues: parsed.__issues || [],
        provider: result.provider,
        processingTime
      };

    } catch (error) {
      console.error('❌ LLM normalization failed:', error);
      return this.fallbackNormalization(questions, rawAnswers, 'fallback');
    }
  }

  /**
   * Deterministic fallback normalization when LLM fails
   */
  private static fallbackNormalization(
    questions: Question[], 
    rawAnswers: Record<string, any>, 
    provider: string
  ): NormalizationResult {
    console.log('🔄 Using deterministic fallback normalization');
    
    const normalized: any = {};
    const issues: Array<{ path: string; reason: string }> = [];

    // Handle trigger normalization
    const triggerAnswer = rawAnswers.schedule_config || rawAnswers.trigger_frequency || rawAnswers.frequency;
    if (triggerAnswer) {
      const triggerStr = triggerAnswer.toLowerCase();
      if (triggerStr.includes('5') && triggerStr.includes('min')) {
        normalized.trigger = 'time.every_5_minutes';
      } else if (triggerStr.includes('15') && triggerStr.includes('min')) {
        normalized.trigger = 'time.every_15_minutes';
      } else if (triggerStr.includes('30') && triggerStr.includes('min')) {
        normalized.trigger = 'time.every_30_minutes';
      } else if (triggerStr.includes('hour')) {
        normalized.trigger = 'time.every_hour';
      } else if (triggerStr.includes('day')) {
        normalized.trigger = 'time.every_day';
      } else {
        normalized.trigger = 'time.every_15_minutes'; // Safe default
      }
    } else {
      normalized.trigger = 'time.every_15_minutes';
      issues.push({ path: '/trigger', reason: 'No schedule specified, using default' });
    }

    // Handle sheets normalization
    const dataMappingAnswer = rawAnswers.data_mapping || rawAnswers.sheet_config;
    const sheetUrlAnswer = rawAnswers.spreadsheet_url || rawAnswers.sheet_url;
    
    if (dataMappingAnswer || sheetUrlAnswer) {
      normalized.sheets = {};
      
      // Extract sheet URL
      if (sheetUrlAnswer && sheetUrlAnswer.includes('spreadsheets/d/')) {
        normalized.sheets.sheet_url = sheetUrlAnswer;
      } else if (dataMappingAnswer && dataMappingAnswer.includes('spreadsheets/d/')) {
        const urlMatch = dataMappingAnswer.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\s\n]+/);
        if (urlMatch) {
          normalized.sheets.sheet_url = urlMatch[0];
        }
      }
      
      if (!normalized.sheets.sheet_url) {
        issues.push({ path: '/sheets/sheet_url', reason: 'Valid Google Sheets URL not found' });
      }

      // Extract sheet name
      const sheetNameAnswer = rawAnswers.sheet_name || rawAnswers.tab_name;
      if (sheetNameAnswer) {
        normalized.sheets.sheet_name = sheetNameAnswer;
      } else if (dataMappingAnswer) {
        const lines = dataMappingAnswer.split('\n').map(l => l.trim());
        const sheetLine = lines.find(l => /^sheet\s*\d*$/i.test(l.replace(',', '')));
        normalized.sheets.sheet_name = sheetLine || 'Sheet1';
      } else {
        normalized.sheets.sheet_name = 'Sheet1';
      }

      // Extract columns
      const columnsAnswer = rawAnswers.columns || rawAnswers.column_mapping;
      if (columnsAnswer) {
        if (Array.isArray(columnsAnswer)) {
          normalized.sheets.columns = columnsAnswer;
        } else if (typeof columnsAnswer === 'string') {
          normalized.sheets.columns = columnsAnswer.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        }
      } else if (dataMappingAnswer) {
        const lines = dataMappingAnswer.split('\n').map(l => l.trim()).filter(Boolean);
        const columnLines = lines.filter(l => 
          !l.includes('spreadsheets/d/') && 
          !/^sheet\s*\d*$/i.test(l) &&
          l.length > 0
        );
        normalized.sheets.columns = columnLines.length > 0 ? columnLines : ['Data', 'Timestamp'];
      } else {
        normalized.sheets.columns = ['Data', 'Timestamp'];
      }
    }

    // Handle Gmail normalization
    const searchQuery = rawAnswers.search_query || rawAnswers.email_filter || rawAnswers.gmail_search;
    if (searchQuery) {
      normalized.gmail = {
        search_query: searchQuery,
        max_results: 50
      };
    }

    // Handle Slack normalization
    const slackChannel = rawAnswers.slack_channel || rawAnswers.channel;
    const slackMessage = rawAnswers.slack_message || rawAnswers.message_template;
    if (slackChannel || slackMessage) {
      normalized.slack = {
        channel: slackChannel?.startsWith('#') ? slackChannel : `#${slackChannel || 'general'}`,
        message_template: slackMessage || 'Automation notification: {{message}}'
      };
    }

    // Handle notifications
    const notificationConfig = rawAnswers.notification_config;
    if (notificationConfig && typeof notificationConfig === 'string') {
      const emails = notificationConfig.split(/[,\s]/).map(s => s.trim()).filter(s => /\S+@\S+\.\S+/.test(s));
      if (emails.length > 0) {
        normalized.notifications = {
          emails,
          on: ['error']
        };
      }
    }

    console.log('✅ Fallback normalization completed:', {
      normalizedKeys: Object.keys(normalized),
      issuesCount: issues.length
    });

    return {
      normalized,
      __issues: issues,
      provider,
      processingTime: Date.now() - Date.now()
    };
  }

  /**
   * Validate normalized answers against build schema
   */
  static validateNormalizedAnswers(answers: any): { valid: boolean; errors: any[] } {
    const errors: any[] = [];
    
    // Critical validations
    if (!answers.trigger) {
      errors.push({ path: '/trigger', message: 'Trigger configuration is required' });
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
    
    if (answers.slack && answers.slack.channel && !answers.slack.channel.startsWith('#')) {
      errors.push({ path: '/slack/channel', message: 'Slack channel must start with #' });
    }
    
    return { valid: errors.length === 0, errors };
  }
}