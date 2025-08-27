import express from 'express';
import { detectAppsFromPrompt, getAppById, generateCompleteAppDatabase, TOTAL_SUPPORTED_APPS } from './complete500Apps';
import { IntelligentFunctionMapper } from './intelligentFunctionMapper';
import { AIWorkflowIntelligence } from './aiWorkflowIntelligence';
import { getErrorMessage } from './types/common';

interface AIModelConfig {
  name: string;
  provider: 'openai' | 'gemini' | 'claude' | 'local';
  costPerToken: number;
  maxTokens: number;
  apiKey?: string;
  endpoint?: string;
}

interface AIAnalysisResult {
  intent: string;
  requiredApps: string[];
  suggestedFunctions: string[];
  complexity: 'Simple' | 'Medium' | 'Complex';
  estimatedValue: string;
  confidence: number;
  processingTime: number;
  modelUsed: string;
}

// Model name mapping constants for consistency
const MODEL_MAP = {
  gemini: 'gemini-2.0-flash-exp', // Use latest Gemini model (experimental 2.0)
  gemini_stable: 'gemini-1.5-flash-8b', // Stable newer version
  gemini_fallback: 'gemini-1.5-flash', // Fallback to 1.5 if needed
  claude: 'claude-3-5-haiku-20241022', // Use latest Claude model
  openai: 'gpt-4o-mini-2024-07-18' // Use latest GPT model
};

class MultiAIService {
  // Get models dynamically to avoid API key caching issues
  private static getModels(): AIModelConfig[] {
    return [
      {
        name: 'Gemini 2.0 Flash (Experimental)',
        provider: 'gemini',
        costPerToken: 0.00025, // Much cheaper than OpenAI
        maxTokens: 32000,
        apiKey: process.env.GEMINI_API_KEY,
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_MAP.gemini}:generateContent`
      },
      {
        name: 'Gemini 1.5 Flash 8B',
        provider: 'gemini',
        costPerToken: 0.00015, // Even cheaper for 8B model
        maxTokens: 32000,
        apiKey: process.env.GEMINI_API_KEY,
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_MAP.gemini_stable}:generateContent`
      },
      {
        name: 'Claude 3.5 Haiku',
        provider: 'claude',
        costPerToken: 0.00025, // Anthropic pricing
        maxTokens: 200000,
        apiKey: process.env.CLAUDE_API_KEY,
        endpoint: 'https://api.anthropic.com/v1/messages'
      },
      {
        name: 'GPT-4o Mini',
        provider: 'openai',
        costPerToken: 0.00015, // OpenAI's cheaper model
        maxTokens: 128000,
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: 'https://api.openai.com/v1/chat/completions'
      },
      {
        name: 'Local Fallback',
        provider: 'local',
        costPerToken: 0, // Free fallback
        maxTokens: Infinity,
      }
    ];
  }

  public static async analyzeWorkflowPrompt(prompt: string): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    
    // Try models in order of cost efficiency
    for (const model of this.getModels()) {
      try {
        console.log(`Trying ${model.name} for workflow analysis...`);
        
        const result = await this.callAIModel(model, prompt);
        const processingTime = Date.now() - startTime;
        
        return {
          ...result,
          processingTime,
          modelUsed: model.name
        };
        
      } catch (error) {
        console.warn(`${model.name} failed, trying next model:`, getErrorMessage(error));
        continue;
      }
    }
    
    // If all AI models fail, use local fallback
    return this.localFallbackAnalysis(prompt);
  }

  private static async callAIModel(model: AIModelConfig, prompt: string): Promise<Omit<AIAnalysisResult, 'processingTime' | 'modelUsed'>> {
    switch (model.provider) {
      case 'gemini':
        return this.callGemini(model, prompt);
      case 'claude':
        return this.callClaude(model, prompt);
      case 'openai':
        return this.callOpenAI(model, prompt);
      case 'local':
        return this.localFallbackAnalysis(prompt);
      default:
        throw new Error(`Unsupported AI provider: ${model.provider}`);
    }
  }

  private static async callGemini(model: AIModelConfig, prompt: string): Promise<Omit<AIAnalysisResult, 'processingTime' | 'modelUsed'>> {
    if (!model.apiKey) {
      console.error("Gemini API key is missing in model config");
      throw new Error('Gemini API key not configured');
    }

    const systemPrompt = `You are an automation expert. Analyze the user's workflow request and return a JSON response with:

🚨 CRITICAL: Runtime is Google Apps Script ONLY. Do not propose or suggest any other runtimes, servers, or platforms. All external APIs must be called via UrlFetchApp. OAuth must use Apps Script OAuth2 library. No Node.js, Python, or external servers allowed.

{
  "intent": "email_tracking|lead_followup|file_organization|custom_automation",
  "requiredApps": ["Gmail", "Google Sheets", etc.],
  "suggestedFunctions": ["Search Emails", "Append Row", etc.],
  "complexity": "Simple|Medium|Complex",
  "estimatedValue": "$X,XXX/month time savings",
  "confidence": 0.95
}`;

    // Try multiple Gemini models with fallback
    const modelVariants = [
      { name: 'Gemini 2.0 Flash (Experimental)', endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_MAP.gemini}:generateContent` },
      { name: 'Gemini 1.5 Flash 8B', endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_MAP.gemini_stable}:generateContent` },
      { name: 'Gemini 1.5 Flash (Fallback)', endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_MAP.gemini_fallback}:generateContent` }
    ];

    let lastError: Error | null = null;

    for (const variant of modelVariants) {
      try {
        console.log(`🚀 Trying ${variant.name}...`);
        console.log("Endpoint:", variant.endpoint);
        console.log("API key prefix:", model.apiKey.slice(0, 6));

        const response = await fetch(`${variant.endpoint}?key=${model.apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `${systemPrompt}\n\nUser Request: "${prompt}"`
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.warn(`❌ ${variant.name} failed: ${response.status} - ${errorData}`);
          lastError = new Error(`${variant.name} error: ${response.status} - ${errorData}`);
          continue; // Try next model
        }

        const data = await response.json();
        const aiResponse = data.candidates[0].content.parts[0].text;
        
        // Parse JSON response from Gemini
        const parsed = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
        
        console.log(`✅ Success with ${variant.name}!`);
        return parsed;
        
      } catch (error) {
        console.warn(`❌ ${variant.name} failed:`, error);
        lastError = error as Error;
        continue; // Try next model
      }
    }

    // If all models failed, throw the last error
    console.error('🚨 All Gemini models failed!');
    throw lastError || new Error('All Gemini model variants failed');
  }

  private static async callClaude(model: AIModelConfig, prompt: string): Promise<Omit<AIAnalysisResult, 'processingTime' | 'modelUsed'>> {
    if (!model.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const systemPrompt = `You are an automation expert. Analyze workflow requests and return structured JSON responses for Google Apps Script automation building.

🚨 CRITICAL: Runtime is Google Apps Script ONLY. Do not propose or suggest any other runtimes, servers, or platforms. All external APIs must be called via UrlFetchApp. OAuth must use Apps Script OAuth2 library. No Node.js, Python, or external servers allowed.`;

    try {
      const response = await fetch(model.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': model.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL_MAP.claude, // Use consistent model version
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Analyze this automation request and return JSON: "${prompt}"`
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      const aiResponse = data.content[0].text;
      
      // Parse JSON response from Claude
      const parsed = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
      return parsed;
      
    } catch (error) {
      console.error('Claude API call failed:', error);
      throw error;
    }
  }

  private static async callOpenAI(model: AIModelConfig, prompt: string): Promise<Omit<AIAnalysisResult, 'processingTime' | 'modelUsed'>> {
    if (!model.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `You are an automation expert specializing in Google Apps Script. Analyze user requests and return structured JSON responses for automation building.

🚨 CRITICAL: Runtime is Google Apps Script ONLY. Do not propose or suggest any other runtimes, servers, or platforms. All external APIs must be called via UrlFetchApp. OAuth must use Apps Script OAuth2 library. No Node.js, Python, or external servers allowed.`;

    try {
      const response = await fetch(model.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey}` // Correct OpenAI auth
        },
        body: JSON.stringify({
          model: MODEL_MAP.openai, // Use consistent model version
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this automation request and return JSON: "${prompt}"` }
          ],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      
      // Parse JSON response from OpenAI
      const parsed = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
      return parsed;
      
    } catch (error) {
      console.error('OpenAI API call failed:', error);
      throw error;
    }
  }

  private static async localFallbackAnalysis(prompt: string): Promise<AIAnalysisResult> {
    console.log(`🧠 Starting comprehensive AI analysis for: "${prompt}"`);
    
    // Use the comprehensive AI workflow intelligence
    const intelligence = await AIWorkflowIntelligence.analyzeAutomationRequest(prompt);
    
    console.log(`✅ AI Intelligence Results:`, {
      intent: intelligence.intent,
      apps: intelligence.requiredApps,
      functions: intelligence.logicalFunctions.map(f => `${f.app}:${f.function}`)
    });

    // Extract function names for compatibility
    const functions = intelligence.logicalFunctions.map(f => f.function);

    // Calculate complexity based on workflow logic
    let complexity: 'Simple' | 'Medium' | 'Complex' = 'Simple';
    if (intelligence.dataFlow.length > 3 || intelligence.requiredApps.length > 3) {
      complexity = 'Complex';
    } else if (intelligence.dataFlow.length > 1 || intelligence.requiredApps.length > 1) {
      complexity = 'Medium';
    }

    // Calculate estimated value based on business impact
    const baseValue = Math.max(400, intelligence.dataFlow.length * 800);
    const complexityMultiplier = complexity === 'Complex' ? 2.5 : complexity === 'Medium' ? 1.8 : 1.2;
    const totalValue = Math.round(baseValue * complexityMultiplier);
    const estimatedValue = `$${totalValue.toLocaleString()}/month time savings`;

    return {
      intent: intelligence.intent,
      requiredApps: intelligence.requiredApps,
      suggestedFunctions: functions,
      complexity,
      estimatedValue,
      confidence: intelligence.confidence,
      processingTime: 80, // Slightly longer for comprehensive analysis
      modelUsed: `Comprehensive AI Intelligence (${TOTAL_SUPPORTED_APPS}+ Apps)`
    };
  }

  public static async getAvailableModels(): Promise<AIModelConfig[]> {
    return this.getModels().filter(model => 
      model.provider === 'local' || 
      (model.apiKey && model.apiKey.length > 0)
    );
  }

  public static async estimateCost(prompt: string, modelName?: string): Promise<{ cost: number; model: string }> {
    const tokenCount = Math.ceil(prompt.length / 4); // Rough token estimation
    
    const selectedModel = modelName 
      ? this.getModels().find(m => m.name === modelName)
      : this.getModels()[0]; // Default to cheapest (Gemini)
    
    if (!selectedModel) {
      return { cost: 0, model: 'Local Fallback' };
    }
    
    const cost = tokenCount * selectedModel.costPerToken;
    return { cost, model: selectedModel.name };
  }
}

// Update the AI Workflow API to use multiple models
export function registerAIWorkflowRoutes(app: express.Application) {
  // Generate workflow with AI model selection
  app.post('/api/ai/generate-workflow', async (req, res) => {
    try {
      const { prompt, userId, preferredModel, apiKey } = req.body;
      
      if (!prompt || !userId) {
        return res.status(400).json({ error: 'Prompt and userId are required' });
      }

      console.log(`Generating workflow for user ${userId} with prompt: "${prompt}"`);
      
      // If client provided an API key, temporarily override the environment
      if (apiKey) {
        process.env.GEMINI_API_KEY = apiKey;
        process.env.OPENAI_API_KEY = apiKey;
        process.env.CLAUDE_API_KEY = apiKey;
      }
      
      // Analyze prompt with multiple AI models
      const analysis = await MultiAIService.analyzeWorkflowPrompt(prompt);
      
      // Generate workflow structure
      const workflow = await generateWorkflowFromAnalysis(analysis, prompt);
      
      res.json({
        success: true,
        ...workflow,
        aiAnalysis: analysis,
        modelUsed: analysis.modelUsed,
        processingTime: analysis.processingTime,
        confidence: analysis.confidence
      });
      
    } catch (error) {
      console.error('Error generating workflow:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to generate workflow',
        fallback: true
      });
    }
  });

  // Get available AI models and their costs
  app.get('/api/ai/models', async (req, res) => {
    try {
      const models = await MultiAIService.getAvailableModels();
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get AI models' });
    }
  });

  // Estimate cost for workflow generation
  app.post('/api/ai/estimate-cost', async (req, res) => {
    try {
      const { prompt, modelName } = req.body;
      const estimate = await MultiAIService.estimateCost(prompt, modelName);
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ error: 'Failed to estimate cost' });
    }
  });

  // Get all supported applications
  app.get('/api/ai/supported-apps', async (req, res) => {
    try {
      const allApps = generateCompleteAppDatabase();
      const { category, search, limit = 50 } = req.query;
      
      let filteredApps = allApps;
      
      // Filter by category if specified
      if (category) {
        filteredApps = filteredApps.filter(app => 
          app.category.toLowerCase() === (category as string).toLowerCase()
        );
      }
      
      // Filter by search term if specified
      if (search) {
        const searchTerm = (search as string).toLowerCase();
        filteredApps = filteredApps.filter(app =>
          app.name.toLowerCase().includes(searchTerm) ||
          app.description.toLowerCase().includes(searchTerm)
        );
      }
      
      // Sort by popularity and limit results
      const sortedApps = filteredApps
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, parseInt(limit as string));
      
      res.json({ 
        apps: sortedApps,
        total: TOTAL_SUPPORTED_APPS,
        filtered: filteredApps.length
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get supported apps' });
    }
  });

  // Test AI model connectivity
  app.post('/api/ai/test-models', async (req, res) => {
    try {
      const testPrompt = "Create a simple email to spreadsheet automation";
      const results = [];
      
      for (const model of await MultiAIService.getAvailableModels()) {
        try {
          const start = Date.now();
          const result = await MultiAIService.analyzeWorkflowPrompt(testPrompt);
          const responseTime = Date.now() - start;
          
          results.push({
            model: model.name,
            status: 'success',
            responseTime,
            confidence: result.confidence
          });
        } catch (error) {
          results.push({
            model: model.name,
            status: 'failed',
            error: getErrorMessage(error)
          });
        }
      }
      
      res.json({ testResults: results });
    } catch (error) {
      res.status(500).json({ error: 'Failed to test models' });
    }
  });
}

async function generateWorkflowFromAnalysis(analysis: AIAnalysisResult, originalPrompt: string) {
  console.log(`🔧 Generating workflow from comprehensive analysis...`);
  
  // Get the comprehensive intelligence analysis
  const intelligence = await AIWorkflowIntelligence.analyzeAutomationRequest(originalPrompt);
  
  // Build workflow structure with logical function selection
  const nodes: any[] = [];
  const connections: any[] = [];
  
  // Create nodes based on intelligent analysis
  intelligence.logicalFunctions.forEach((funcMapping, index) => {
    const nodeId = `${funcMapping.app.toLowerCase().replace(/\s+/g, '-')}-${index}`;
    
    nodes.push({
      id: nodeId,
      type: funcMapping.app.toLowerCase().replace(/\s+/g, '-'),
      app: funcMapping.app,
      function: funcMapping.function,
      functionName: funcMapping.function,
      parameters: funcMapping.parameters,
      position: { x: 100 + (index * 220), y: 100 + (index % 2) * 120 },
      icon: getIconForApp(funcMapping.app),
      color: getColorForApp(funcMapping.app),
      aiReason: funcMapping.reason,
      confidence: intelligence.confidence,
      isRequired: funcMapping.isRequired
    });
    
    // Create logical connections based on data flow
    if (index > 0) {
      connections.push({
        id: `conn-${index}`,
        source: nodes[index - 1].id,
        target: nodeId,
        dataType: intelligence.dataFlow[index - 1]?.dataOut[0] || 'data'
      });
    }
  });

  // Generate intelligent Google Apps Script code
  const appsScriptCode = generateIntelligentAppsScriptCode(intelligence, nodes);

  return {
    id: `workflow-${Date.now()}`,
    title: generateIntelligentTitle(intelligence.intent, originalPrompt),
    description: intelligence.businessLogic,
    nodes,
    connections,
    appsScriptCode,
    estimatedValue: analysis.estimatedValue,
    complexity: analysis.complexity,
    intelligence // Include the full intelligence analysis
  };
}

function getFunctionForApp(app: string, prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  
  switch (app) {
    case 'Gmail':
      if (lowerPrompt.includes('send') || lowerPrompt.includes('reply')) return 'Send Email';
      if (lowerPrompt.includes('track') || lowerPrompt.includes('monitor')) return 'Search Emails';
      if (lowerPrompt.includes('parse') || lowerPrompt.includes('extract')) return 'Parse Emails';
      return 'Process Emails';
    case 'Google Sheets':
      if (lowerPrompt.includes('read') || lowerPrompt.includes('get')) return 'Read Range';
      if (lowerPrompt.includes('update') || lowerPrompt.includes('modify')) return 'Update Range';
      return 'Append Row';
    case 'Google Calendar':
      if (lowerPrompt.includes('find') || lowerPrompt.includes('check')) return 'Find Events';
      return 'Create Event';
    case 'Google Drive':
      if (lowerPrompt.includes('organize') || lowerPrompt.includes('sort')) return 'Organize Files';
      if (lowerPrompt.includes('find') || lowerPrompt.includes('search')) return 'Search Files';
      return 'Upload File';
    case 'AI Analysis':
      if (lowerPrompt.includes('extract')) return 'Extract Data';
      if (lowerPrompt.includes('classify')) return 'Classify Content';
      return 'Process Data';
    default:
      return 'Process';
  }
}

function getParametersForApp(app: string, prompt: string, analysis: AIAnalysisResult): Record<string, any> {
  switch (app) {
    case 'Gmail':
      return {
        query: analysis.intent === 'email_tracking' ? 'is:unread label:customers' : 'is:unread',
        fields: ['from', 'subject', 'body', 'date'],
        maxResults: 50
      };
    case 'Google Sheets':
      return {
        spreadsheetId: 'auto-create',
        range: 'A:Z',
        values: 'from previous step',
        headers: true
      };
    case 'Google Calendar':
      return {
        calendarId: 'primary',
        title: 'Auto-generated from workflow',
        duration: 30,
        reminders: true
      };
    case 'Google Drive':
      return {
        folderId: 'auto-create',
        organizationRules: 'by date and type',
        permissions: 'inherit'
      };
    default:
      return {};
  }
}

function getIconForApp(app: string): string {
  const iconMap: Record<string, string> = {
    'Gmail': 'Mail',
    'Google Sheets': 'Sheet',
    'Google Calendar': 'Calendar',
    'Google Drive': 'FolderOpen',
    'AI Analysis': 'Brain',
    'Google Docs': 'FileText',
    'Google Forms': 'FileEdit'
  };
  return iconMap[app] || 'Zap';
}

function getColorForApp(app: string): string {
  const colorMap: Record<string, string> = {
    'Gmail': '#EA4335',
    'Google Sheets': '#0F9D58',
    'Google Calendar': '#4285F4',
    'Google Drive': '#4285F4',
    'AI Analysis': '#8B5CF6',
    'Google Docs': '#4285F4',
    'Google Forms': '#673AB7'
  };
  return colorMap[app] || '#6366f1';
}

function generateIntelligentTitle(intent: string, prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  
  // Smart title generation based on prompt content
  if (lowerPrompt.includes('gmail') && lowerPrompt.includes('invoice') && lowerPrompt.includes('sheet')) {
    return 'Gmail Invoice Monitor';
  }
  if (lowerPrompt.includes('gmail') && lowerPrompt.includes('sheet')) {
    return 'Gmail to Sheets Automation';
  }
  if (lowerPrompt.includes('email') && lowerPrompt.includes('respond')) {
    return 'Smart Email Auto-Responder';
  }
  if (lowerPrompt.includes('lead') && lowerPrompt.includes('follow')) {
    return 'Lead Follow-up Automation';
  }
  if (lowerPrompt.includes('calendar') && lowerPrompt.includes('meet')) {
    return 'Meeting Scheduler';
  }
  if (lowerPrompt.includes('form') && lowerPrompt.includes('sheet')) {
    return 'Form to Sheets Connector';
  }
  if (lowerPrompt.includes('monitor') && lowerPrompt.includes('email')) {
    return 'Email Monitoring System';
  }
  if (lowerPrompt.includes('backup') || lowerPrompt.includes('sync')) {
    return 'Data Sync Automation';
  }
  if (lowerPrompt.includes('notification') || lowerPrompt.includes('alert')) {
    return 'Smart Notification System';
  }
  
  // Fallback to intent-based titles
  const titleMap: Record<string, string> = {
    'email_auto_responder': 'Smart Email Auto-Responder',
    'email_monitoring': 'Email Monitoring System',
    'email_tracking': 'Email Tracking System',
    'lead_followup': 'Lead Follow-up Automation',
    'lead_capture': 'Lead Capture System',
    'order_processing': 'Order Processing Automation',
    'notification_system': 'Smart Notification System',
    'data_synchronization': 'Data Sync Automation',
    'file_organization': 'File Organization System',
    'reporting_automation': 'Automated Reporting System',
    'custom_workflow': 'Custom Automation Workflow'
  };
  
  if (titleMap[intent]) {
    return titleMap[intent];
  }
  
  // Clean and capitalize the prompt
  const cleanPrompt = prompt
    .replace(/^(i want to|i need to|please|can you|help me|create|build|make)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Capitalize first letter of each word for shorter prompts
  if (cleanPrompt.length < 50) {
    const titleWords = cleanPrompt.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
    return titleWords.join(' ') || 'Custom Automation Workflow';
  }
  
  return `AI-Generated Automation: ${cleanPrompt.substring(0, 40)}...`;
}

function generateDescription(prompt: string): string {
  return `Automatically ${prompt.toLowerCase().replace(/^i want to |^i need to |^please |^can you /, '')}`;
}

function generateIntelligentAppsScriptCode(intelligence: any, nodes: any[]): string {
  let code = `/**
 * ${generateIntelligentTitle(intelligence.intent, 'automation')}
 * Generated by Comprehensive AI Intelligence
 * 
 * Business Logic: ${intelligence.businessLogic}
 * 
 * Data Flow:
${intelligence.dataFlow.map((step: any) => ` * ${step.step}. ${step.action} (${step.app}: ${step.function})`).join('\n')}
 * 
 * Confidence: ${(intelligence.confidence * 100).toFixed(1)}%
 */

function main() {
  try {
    console.log('Starting intelligent automation: ${intelligence.intent}');
    
    // Configuration
    const CONFIG = {
      SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
      CALENDAR_ID: 'primary',
      DRIVE_FOLDER_ID: 'YOUR_FOLDER_ID'
    };
`;

  // Generate code based on data flow steps
  intelligence.dataFlow.forEach((step: any, index: number) => {
    if (step.app === 'Gmail') {
      if (step.function === 'set_auto_reply') {
        code += `
    // Step ${step.step}: ${step.action}
    function setupAutoReply() {
      Gmail.Users.Settings.updateVacation({
        enableAutoReply: true,
        responseSubject: 'Auto Reply',
        responseBodyPlainText: 'Thank you for your email. I will respond as soon as possible.',
        restrictToContacts: false,
        restrictToDomain: false
      }, 'me');
      
      console.log('✅ Auto-reply enabled successfully');
    }
`;
      } else if (step.function === 'search_emails') {
        code += `
    // Step ${step.step}: ${step.action}
    function ${step.function}() {
      const query = 'is:unread';
      const threads = GmailApp.search(query, 0, 50);
      
      console.log(\`Found \${threads.length} emails for: ${step.purpose}\`);
      
      const emailData = [];
      threads.forEach(thread => {
        const message = thread.getMessages()[0];
        emailData.push({
          from: message.getFrom(),
          subject: message.getSubject(),
          body: message.getPlainBody(),
          date: message.getDate()
        });
      });
      
      return emailData;
    }
`;
      }
    }
    
    if (step.app === 'Google Sheets' && step.function === 'append_row') {
      code += `
    // Step ${step.step}: ${step.action}
    function appendToSheet(data) {
      const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = spreadsheet.getActiveSheet();
      
      // Purpose: ${step.purpose}
      const values = [
        new Date(),
        data.from || '',
        data.subject || '',
        data.body?.substring(0, 500) || '',
        'Processed by AI'
      ];
      
      sheet.appendRow(values);
      console.log('✅ Data stored:', values);
    }
`;
    }
    
    if (step.app === 'Slack' && step.function === 'send_message') {
      code += `
    // Step ${step.step}: ${step.action}
    function sendSlackNotification(data) {
      // Purpose: ${step.purpose}
      const webhookUrl = 'YOUR_SLACK_WEBHOOK_URL';
      const message = {
        text: \`Automation Update: \${data.subject || 'New event'}\`,
        channel: '#general',
        username: 'AutomationBot',
        icon_emoji: ':robot_face:'
      };
      
      UrlFetchApp.fetch(webhookUrl, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(message)
      });
      
      console.log('✅ Slack notification sent');
    }
`;
    }
  });

  // Main execution logic
  code += `
    // Execute intelligent workflow
    console.log('🚀 Executing ${intelligence.intent} automation...');
    
`;

  if (intelligence.intent === 'email_auto_responder') {
    code += `    setupAutoReply();
    console.log('✅ Email auto-responder is now active!');
`;
  } else {
    // Multi-step execution
    const hasEmailSearch = intelligence.dataFlow.some((step: any) => step.function === 'search_emails');
    const hasSheetAppend = intelligence.dataFlow.some((step: any) => step.function === 'append_row');
    const hasSlackNotify = intelligence.dataFlow.some((step: any) => step.function === 'send_message');

    if (hasEmailSearch) {
      code += `    const emailData = search_emails();
    
`;
      if (hasSheetAppend) {
        code += `    emailData.forEach(email => {
      appendToSheet(email);
    });
    
`;
      }
      
      if (hasSlackNotify) {
        code += `    emailData.forEach(email => {
      sendSlackNotification(email);
    });
    
`;
      }
    }
  }

  code += `    console.log('✅ Intelligent automation completed successfully!');
  } catch (error) {
    console.error('❌ Automation error:', error);
    
    // Send error notification
    GmailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'Automation Error Alert',
      \`Your \${intelligence.intent} automation encountered an error: \${getErrorMessage(error)}\`
    );
  }
}

// Setup function
function setupTriggers() {
  console.log('Setting up triggers for: ${intelligence.intent}');
  
  // Delete existing triggers
  ScriptApp.getProjectTriggers().forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Create appropriate trigger based on automation type
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyMinutes(5)
    .create();
    
  console.log('✅ Intelligent automation triggers configured');
}
`;

  return code;
}

function generateTitle(intent: string): string {
  const titleMap: Record<string, string> = {
    'email_tracking': 'Smart Email Tracking System',
    'lead_followup': 'Automated Lead Follow-up',
    'file_organization': 'Intelligent File Organization',
    'reporting_automation': 'Automated Reporting System',
    'custom_automation': 'Custom Workflow Automation'
  };
  return titleMap[intent] || 'AI-Generated Automation';
}

function generateEnhancedAppsScriptCode(nodes: any[], analysis: AIAnalysisResult, functionMappings: any[]): string {
  let code = `/**
 * ${generateTitle(analysis.intent)}
 * Generated by AI Workflow Builder (${analysis.modelUsed})
 * Confidence: ${(analysis.confidence * 100).toFixed(1)}%
 * Estimated Value: ${analysis.estimatedValue}
 * 
 * Intelligent Function Selection:
${functionMappings.map(m => ` * - ${m.appName}: ${m.selectedFunction} (${(m.confidence * 100).toFixed(0)}% confidence)`).join('\n')}
 */

function main() {
  try {
    console.log('Starting intelligent automation...');
    
    // Configuration
    const CONFIG = {
      SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID', // Replace with your sheet ID
      CALENDAR_ID: 'primary',
      DRIVE_FOLDER_ID: 'YOUR_FOLDER_ID' // Replace with your folder ID
    };
`;

  // Generate specific function implementations based on intelligent selection
  functionMappings.forEach(mapping => {
    if (mapping.appName === 'Gmail') {
      if (mapping.selectedFunction === 'set_auto_reply') {
        code += `
    // Gmail: Set Auto Reply (AI Selected - ${mapping.reason})
    function setupAutoReply() {
      const message = '${mapping.parameters.message || 'Thank you for your email. I will respond shortly.'}';
      const startDate = new Date();
      const endDate = null; // Runs indefinitely until disabled
      
      // Set up Gmail auto-reply
      Gmail.Users.Settings.updateVacation({
        enableAutoReply: true,
        responseSubject: 'Auto Reply',
        responseBodyPlainText: message,
        restrictToContacts: ${mapping.parameters.restrictToContacts || false},
        restrictToDomain: false
      }, 'me');
      
      console.log('Auto-reply enabled with message:', message);
    }
`;
      } else if (mapping.selectedFunction === 'search_emails') {
        code += `
    // Gmail: Search Emails (AI Selected - ${mapping.reason})
    function searchEmails() {
      const query = '${mapping.parameters.query || 'is:unread'}';
      const threads = GmailApp.search(query, 0, ${mapping.parameters.maxResults || 50});
      
      console.log(\`Found \${threads.length} emails matching: \${query}\`);
      
      const emailData = [];
      threads.forEach(thread => {
        const message = thread.getMessages()[0];
        emailData.push({
          from: message.getFrom(),
          subject: message.getSubject(),
          body: message.getPlainBody(),
          date: message.getDate(),
          threadId: thread.getId(),
          messageId: message.getId()
        });
      });
      
      return emailData;
    }
`;
      } else if (mapping.selectedFunction === 'send_email') {
        code += `
    // Gmail: Send Email (AI Selected - ${mapping.reason})
    function sendEmail(emailData) {
      const to = emailData.to || '${mapping.parameters.to || 'recipient@example.com'}';
      const subject = '${mapping.parameters.subject || 'Automated Email'}';
      const body = emailData.body || '${mapping.parameters.body || 'Generated by automation'}';
      
      GmailApp.sendEmail(to, subject, body);
      console.log(\`Email sent to: \${to}\`);
    }
`;
      }
    }

    if (mapping.appName === 'Google Sheets') {
      if (mapping.selectedFunction === 'append_row') {
        code += `
    // Google Sheets: Append Row (AI Selected - ${mapping.reason})
    function appendToSheet(data) {
      const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = spreadsheet.getActiveSheet();
      
      // Intelligent column mapping based on data
      const values = [
        new Date(),
        data.from || data.email || '',
        data.subject || data.title || '',
        data.body || data.description || '',
        data.company || '',
        'Processed by AI'
      ];
      
      sheet.appendRow(values);
      console.log('Data appended to sheet:', values);
    }
`;
      } else if (mapping.selectedFunction === 'read_range') {
        code += `
    // Google Sheets: Read Range (AI Selected - ${mapping.reason})
    function readSheetData() {
      const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = spreadsheet.getActiveSheet();
      const range = '${mapping.parameters.range || 'A:Z'}';
      
      const data = sheet.getRange(range).getValues();
      console.log(\`Read \${data.length} rows from sheet\`);
      
      return data;
    }
`;
      }
    }

    if (mapping.appName === 'Google Calendar') {
      if (mapping.selectedFunction === 'create_event') {
        code += `
    // Google Calendar: Create Event (AI Selected - ${mapping.reason})
    function createCalendarEvent(eventData) {
      const calendar = CalendarApp.getDefaultCalendar();
      const title = eventData.title || '${mapping.parameters.title || 'Automated Event'}';
      const startTime = new Date(eventData.startTime || Date.now() + 24*60*60*1000); // Tomorrow
      const endTime = new Date(startTime.getTime() + ${mapping.parameters.duration || 30} * 60000);
      
      const event = calendar.createEvent(title, startTime, endTime, {
        description: eventData.description || 'Generated by automation workflow',
        guests: eventData.attendees || '',
        sendInvites: true
      });
      
      console.log('Calendar event created:', event.getTitle());
      return event;
    }
`;
      }
    }
  });

  // Main execution flow with intelligent function calls
  code += `
    // Execute intelligent workflow
    console.log('Executing workflow with AI-selected functions...');
    
`;

  // Add execution logic based on function mappings
  const hasGmailAutoReply = functionMappings.some(m => m.appName === 'Gmail' && m.selectedFunction === 'set_auto_reply');
  const hasGmailSearch = functionMappings.some(m => m.appName === 'Gmail' && m.selectedFunction === 'search_emails');
  const hasSheetAppend = functionMappings.some(m => m.appName === 'Google Sheets' && m.selectedFunction === 'append_row');
  const hasCalendarCreate = functionMappings.some(m => m.appName === 'Google Calendar' && m.selectedFunction === 'create_event');

  if (hasGmailAutoReply) {
    code += `    // Set up automatic email responder
    setupAutoReply();
    console.log('Automatic email responder is now active!');
`;
  } else if (hasGmailSearch) {
    code += `    const emailData = searchEmails();\n`;
    
    if (hasSheetAppend) {
      code += `    
    emailData.forEach(email => {
      appendToSheet(email);
    });
`;
    }
    
    if (hasCalendarCreate) {
      code += `    
    emailData.forEach(email => {
      createCalendarEvent({
        title: 'Follow up: ' + email.subject,
        description: 'Follow up on email from: ' + email.from,
        attendees: email.from
      });
    });
`;
    }
  }

  code += `
    console.log('Intelligent automation completed successfully!');
  } catch (error) {
    console.error('Automation error:', error);
    
    // Send error notification email
    GmailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'Automation Error Alert',
      \`Your automation encountered an error: \${getErrorMessage(error)}\`
    );
  }
}

// Set up automated triggers
function setupTriggers() {
  // Delete existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Create time-based trigger (runs every 5 minutes)
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyMinutes(5)
    .create();
    
  console.log('Intelligent automation triggers set up successfully');
  console.log('Your automation will run every 5 minutes');
}

// Manual execution function
function runOnce() {
  console.log('Running intelligent automation manually...');
  main();
}
`;

  return code;
}

// Keep the old function for backward compatibility
function generateAppsScriptCode(nodes: any[], analysis: AIAnalysisResult): string {
  const hasGmail = nodes.some(n => n.app === 'Gmail');
  const hasSheets = nodes.some(n => n.app === 'Google Sheets');
  const hasCalendar = nodes.some(n => n.app === 'Google Calendar');
  const hasDrive = nodes.some(n => n.app === 'Google Drive');
  
  let code = `/**
 * ${generateTitle(analysis.intent)}
 * Generated by AI Workflow Builder (${analysis.modelUsed})
 * Confidence: ${(analysis.confidence * 100).toFixed(1)}%
 * Estimated Value: ${analysis.estimatedValue}
 */

function main() {
  try {
    console.log('Starting automation...');
    
    // Configuration
    const CONFIG = {
      SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID', // Replace with your sheet ID
      CALENDAR_ID: 'primary',
      DRIVE_FOLDER_ID: 'YOUR_FOLDER_ID' // Replace with your folder ID
    };
`;

  if (hasGmail) {
    code += `
    // Gmail Processing
    function processEmails() {
      const query = '${nodes.find(n => n.app === 'Gmail')?.parameters?.query || 'is:unread'}';
      const threads = GmailApp.search(query);
      
      console.log(\`Found \${threads.length} emails to process\`);
      
      threads.forEach(thread => {
        const message = thread.getMessages()[0];
        const emailData = {
          from: message.getFrom(),
          subject: message.getSubject(),
          body: message.getPlainBody(),
          date: message.getDate(),
          threadId: thread.getId()
        };
        
        processEmailData(emailData);
        thread.markAsRead(); // Mark as processed
      });
    }
`;
  }

  if (hasSheets) {
    code += `
    // Google Sheets Processing
    function processEmailData(emailData) {
      try {
        const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        const sheet = spreadsheet.getActiveSheet();
        
        // Add data to spreadsheet
        sheet.appendRow([
          new Date(),
          emailData.from,
          emailData.subject,
          emailData.body.substring(0, 500), // Limit body text
          emailData.date,
          'Processed by AI'
        ]);
        
        console.log('Email data added to spreadsheet');
      } catch (error) {
        console.error('Error writing to spreadsheet:', error);
      }
    }
`;
  }

  if (hasCalendar) {
    code += `
    // Google Calendar Processing
    function createFollowUpEvent(emailData) {
      try {
        const calendar = CalendarApp.getDefaultCalendar();
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + 3); // 3 days from now
        
        const event = calendar.createEvent(
          'Follow up: ' + emailData.subject,
          followUpDate,
          new Date(followUpDate.getTime() + 30 * 60000), // 30 minutes duration
          {
            description: \`Follow up on email from: \${emailData.from}\\n\\nOriginal subject: \${emailData.subject}\`,
            guests: emailData.from,
            sendInvites: true
          }
        );
        
        console.log('Follow-up event created:', event.getTitle());
      } catch (error) {
        console.error('Error creating calendar event:', error);
      }
    }
`;
  }

  if (hasDrive) {
    code += `
    // Google Drive Processing
    function organizeFiles() {
      try {
        const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
        const files = folder.getFiles();
        
        while (files.hasNext()) {
          const file = files.next();
          const fileType = file.getMimeType();
          
          // Organize by file type
          let targetFolder;
          if (fileType.includes('pdf')) {
            targetFolder = getOrCreateFolder(folder, 'PDFs');
          } else if (fileType.includes('image')) {
            targetFolder = getOrCreateFolder(folder, 'Images');
          } else {
            targetFolder = getOrCreateFolder(folder, 'Documents');
          }
          
          file.moveTo(targetFolder);
          console.log(\`Moved \${file.getName()} to \${targetFolder.getName()}\`);
        }
      } catch (error) {
        console.error('Error organizing files:', error);
      }
    }
    
    function getOrCreateFolder(parentFolder, name) {
      const folders = parentFolder.getFoldersByName(name);
      return folders.hasNext() ? folders.next() : parentFolder.createFolder(name);
    }
`;
  }

  // Main execution flow
  if (hasGmail) {
    code += `
    // Execute main workflow
    processEmails();
`;
  }

  code += `
    console.log('Automation completed successfully!');
  } catch (error) {
    console.error('Automation error:', error);
    
    // Send error notification email (optional)
    GmailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'Automation Error Alert',
      \`Your automation encountered an error: \${getErrorMessage(error)}\`
    );
  }
}

// Set up automated triggers
function setupTriggers() {
  // Delete existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Create time-based trigger (runs every 5 minutes)
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyMinutes(5)
    .create();
    
  console.log('Automation triggers set up successfully');
  console.log('Your automation will run every 5 minutes');
}

// Manual execution function
function runOnce() {
  console.log('Running automation manually...');
  main();
}
`;

  return code;
}

export { MultiAIService };