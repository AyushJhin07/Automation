/**
 * ChatGPT's LLM-Powered Answer Normalization Service
 * 
 * Uses LLM intelligence to convert free-form user answers into
 * the exact structured format the compiler expects.
 */

import { LLMProviderService } from './LLMProviderService.js';
import { Question, BuildAnswers } from '../../shared/build-schema.js';

const SHEET_URL_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i;

function parseSheetFreeform(input: string) {
  if (!input) return null;

  const urlMatch = input.match(SHEET_URL_RE);
  const spreadsheetUrl = urlMatch ? urlMatch[0].trim() : null;
  const spreadsheetId  = urlMatch ? urlMatch[1] : null;

  // Split lines, strip empties
  const lines = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Try structured "Spreadsheet ID: …; Sheet Name: …; Headers: …"
  const idMatch    = input.match(/Spreadsheet ID:\s*([a-zA-Z0-9-_]+)/i);
  const nameMatch  = input.match(/Sheet Name:\s*([^\n;]+)/i);
  const headsMatch = input.match(/Headers?:\s*([^\n]+)/i);

  const sheetName =
    nameMatch?.[1]?.trim() ||
    // If line after URL looks like a name, use it
    (urlMatch && lines[lines.indexOf(spreadsheetUrl) + 1]) ||
    undefined;

  const headersRaw =
    headsMatch?.[1] ||
    // If there's a third line after URL, treat it as headers
    (urlMatch && lines[lines.indexOf(spreadsheetUrl) + 2]) ||
    // Or if user pasted a single line of headers
    (!urlMatch && lines.length >= 1 ? lines[lines.length - 1] : '');

  const columns =
    headersRaw
      ? headersRaw
          .split(/[,\|]/)         // commas or pipes
          .map(s => s.trim())
          .filter(Boolean)
      : [];

  return {
    spreadsheetUrl,
    spreadsheetId: idMatch?.[1] || spreadsheetId || null,
    sheetName,
    columns,
  };
}

export interface NormalizationResult {
  normalized: BuildAnswers;
  __issues: Array<{ path: string; reason: string }>;
  provider: string;
  processingTime: number;
}

export class AnswerNormalizerService {
  
  /**
   * ChatGPT's robust URL extraction from any field
   */
  private static extractSheetUrl(anyText: string): string | null {
    if (!anyText) return null;
    const re = /(https?:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_\-]+)/i;
    const m = anyText.match(re);
    return m ? m[1] : null;
  }

  /**
   * ChatGPT's sheet coercion after LLM parsing
   */
  private static coerceSheets(obj: any, raw: Record<string,string>): any {
    obj.sheets = obj.sheets || {};
    const fieldsToScan = [
      raw.spreadsheet_destination,
      raw.data_mapping,
      raw.mapping,
      raw.sheetDetails,
      raw.sheet_url,
      raw.columns,
      // scan ALL raw fields:
      ...Object.values(raw)
    ].filter(Boolean);

    // find the first URL anywhere
    for (const val of fieldsToScan) {
      const url = this.extractSheetUrl(String(val));
      if (url && !obj.sheets.sheet_url) {
        obj.sheets.sheet_url = url;
      }
    }

    // extract sheet name heuristically
    if (!obj.sheets.sheet_name) {
      const guess = String(raw.spreadsheet_destination || raw.data_mapping || '')
        .split('\n').map(s => s.trim()).find(s => /^sheet\s*\w+/i.test(s) || /^[A-Za-z0-9 _-]{1,30}$/.test(s));
      if (guess) obj.sheets.sheet_name = guess.replace(/^sheet\s*/i, '');
    }

    // extract columns heuristically
    if (!Array.isArray(obj.sheets.columns) || obj.sheets.columns?.length === 0) {
      const lines = String(raw.spreadsheet_destination || raw.data_mapping || '')
        .split('\n').map(s => s.trim());
      const last = lines[lines.length - 1];
      if (last && last.includes(',')) {
        obj.sheets.columns = last.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    return obj;
  }
  
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

    // ChatGPT's strict JSON instruction
    const SYSTEM_JSON_INSTRUCTION = `
You are an answer normalizer. Output ONLY strict JSON. No prose.
If a value is unknown, set it to null. Use this schema:
{
  "trigger": { "type": "time|event|manual", "frequency": { "value": number, "unit": "minutes|hours|days" } },
  "apps": { "source": string[], "destination": string[] },
  "sheets": { "sheet_url": string|null, "sheet_name": string|null, "columns": string[]|null },
  "mapping": { "pairs": [ { "from": string, "to": string, "transform": string|null } ] }
}
`;

    function makeLLMPrompt(questions: Question[], rawAnswers: Record<string, any>, timezone: string): string {
      return [
        SYSTEM_JSON_INSTRUCTION,
        'Questions:',
        JSON.stringify(questions, null, 2),
        'Answers:',
        JSON.stringify(rawAnswers, null, 2),
        'Timezone:',
        timezone,
        'Return ONLY the JSON object above. No markdown, no explanation.'
      ].join('\n');
    }

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

    // ChatGPT's strict JSON prompt
    const prompt = makeLLMPrompt(questions, rawAnswers, timezone);

    try {
      const result = await LLMProviderService.generateText(prompt, {
        model: 'gemini-2.0-flash-exp',
        temperature: 0.1, // Low temperature for precise formatting
        maxTokens: 1500
      });

      console.log(`✅ LLM normalization response from ${result.provider}:`, {
        responseLength: result.text.length,
        model: result.model
      });

      // ChatGPT's strict parsing with repair path
      let normalized: any;
      try {
        normalized = typeof result.text === 'string' ? JSON.parse(result.text) : result.text;
      } catch (e) {
        // attempt simple JSON repair (strip pre/post text)
        const match = String(result.text).match(/\{[\s\S]*\}$/);
        if (match) {
          normalized = JSON.parse(match[0]);
        } else {
          throw new Error('LLM did not return JSON');
        }
      }

      // ChatGPT's coercion after parsing
      normalized = this.coerceSheets(normalized, rawAnswers);

      let parsed: { normalized: BuildAnswers; __issues: any[] };
      if (normalized.normalized && normalized.__issues) {
        parsed = normalized;
      } else {
        // Wrap in expected format if LLM returned direct structure
        parsed = {
          normalized: normalized,
          __issues: []
        };
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

    // Handle sheets normalization with ChatGPT's parseSheetFreeform
    const freeform = rawAnswers.spreadsheet_destination || rawAnswers.sheet || rawAnswers.google_sheet || 
                    rawAnswers.data_mapping || rawAnswers.sheet_config || 
                    rawAnswers.spreadsheet_url || rawAnswers.sheet_url || '';
    
    const parsed = parseSheetFreeform(freeform);

    if (parsed?.spreadsheetId) {
      normalized.sheets = {
        sheet_url: parsed.spreadsheetUrl,
        sheet_id:  parsed.spreadsheetId,
        sheet_name: parsed.sheetName || 'Sheet1',
        columns: parsed.columns && parsed.columns.length ? parsed.columns : undefined,
      };
      // For backwards compatibility with builder/validator
      normalized.spreadsheet_url = parsed.spreadsheetUrl;
      normalized.spreadsheet_id  = parsed.spreadsheetId;
    } else {
      issues.push({ path: '/sheets/sheet_url', reason: 'Valid Google Sheets URL not found in any field' });
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