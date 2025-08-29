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
  public static getModels(): AIModelConfig[] {
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

    const systemPrompt = `You are an expert Google Apps Script automation consultant. Carefully analyze the user's request and extract specific automation requirements.

🚨 CRITICAL: Runtime is Google Apps Script ONLY. Use only: Gmail, Google Sheets, Calendar, Drive, UrlFetchApp, PropertiesService, ScriptApp triggers.

ANALYZE THE REQUEST THOROUGHLY:
- What specific trigger should start the automation?
- What data sources are involved?
- What specific actions should be performed?
- What conditions or filters apply?
- What is the expected outcome?

If the user provided clarification answers, prioritize those specifications over assumptions.

Return JSON:
{
  "intent": "specific_intent_based_on_request",
  "requiredApps": ["Specific apps mentioned by user"],
  "suggestedFunctions": ["Functions matching user's exact needs"],
  "complexity": "Simple|Medium|Complex",
  "estimatedValue": "$X,XXX/month time savings", 
  "confidence": 0.95,
  "triggerType": "time|email|sheet|form|manual",
  "specificRequirements": "Detailed description of what user wants"
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
    const startTime = Date.now();
    
    try {
      const { prompt, userId, preferredModel, apiKey, answers } = req.body;
      
      if (!prompt || !userId) {
        return res.status(400).json({ error: 'Prompt and userId are required' });
      }

      console.log(`🚀 AI Workflow Request from user ${userId}: "${prompt}"`);
      
      // If client provided an API key, set it for the specific provider only
      if (apiKey && preferredModel) {
        const modelLower = preferredModel.toLowerCase();
        if (modelLower.includes('gemini')) {
          process.env.GEMINI_API_KEY = apiKey;
        } else if (modelLower.includes('gpt') || modelLower.includes('openai')) {
          process.env.OPENAI_API_KEY = apiKey;
        } else if (modelLower.includes('claude')) {
          process.env.CLAUDE_API_KEY = apiKey;
        }
      }

      // STEP 1: Always ask clarifying questions first (conversational approach)
      if (!answers || Object.keys(answers).length === 0) {
        console.log('🤔 No answers provided - always asking clarifying questions...');
        
        const questions = await generateFollowUpQuestions(prompt);
        
        return res.json({
          success: true,
          needsQuestions: true,
          questions: questions,
          modelUsed: 'Gemini 2.0 Flash (questions)'
        });
      }

      // STEP 2: Generate workflow from answers (deterministic approach)
      console.log('🔧 Generating workflow from user answers...');
      
      const hasAnswers = answers && Object.keys(answers).length > 0;
      
      let enhancedPrompt = prompt;
      if (hasAnswers) {
        console.log('📝 Incorporating user answers:', answers);
        
        // Create normalized answer summary as ChatGPT suggested
        const lines = Object.entries(answers).map(([k, v]) => `- ${k}: ${v}`);
        enhancedPrompt = `${prompt}\n\nClarifications:\n${lines.join('\n')}`;
        
        console.log('🎯 Enhanced prompt with answers:', enhancedPrompt);
      }
      
      // Build deterministic workflow from answers (ChatGPT's approach)
      let workflow;
      let analysis;
      
      if (hasAnswers) {
        workflow = await buildWorkflowFromAnswers(answers, prompt);
        // Create a mock analysis for consistency
        analysis = {
          modelUsed: 'Deterministic Workflow Builder',
          processingTime: Date.now() - Date.now(), // will be overridden below
          confidence: 0.95,
          intent: 'email_automation',
          complexity: 'Complex',
          reasoning: 'Built deterministically from user answers'
        };
      } else {
        analysis = await MultiAIService.analyzeWorkflowPrompt(enhancedPrompt);
        workflow = await generateWorkflowFromAnalysis(analysis, enhancedPrompt);
      }
      
      // Enforce Apps Script only at the output (guard-rail)
      if (workflow.appsScriptCode && violatesAppsScriptOnly(workflow.appsScriptCode)) {
        console.error('🚫 Apps Script violation detected in code:');
        console.error('Code length:', workflow.appsScriptCode.length);
        console.error('First 200 chars:', workflow.appsScriptCode.substring(0, 200));
        
        return res.status(422).json({
          success: false,
          error: 'Model produced non–Apps Script code. Please refine answers or try again.'
        });
      }
      
      const endTime = Date.now();
      const actualProcessingTime = endTime - startTime;
      
      res.json({
        success: true,
        ...workflow,
        aiAnalysis: analysis,
        modelUsed: analysis.modelUsed,
        processingTime: actualProcessingTime,
        confidence: analysis.confidence,
        usedAnswers: answers || null
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

// ===== FOLLOW-UP QUESTIONS LOGIC =====

function needsClarificationHardCheck(prompt: string) {
  const p = prompt.toLowerCase();

  // must mention at least one GWS app or "http/endpoint/scrape" style target
  const hasApp =
    /(gmail|sheet|sheets|calendar|drive|docs|slides|forms|meet|apps\s*script)/.test(p);
  // must state a verb for start or an event
  const hasTrigger =
    /(when|on|if|every|cron|time-based|new email|form submit|row added|label|folder)/.test(p);
  // must have a destination/action
  const hasAction =
    /(log|append|create|send|reply|move|label|post|export|backup|summariz|classif|extract)/.test(p);

  return !(hasApp && hasTrigger && hasAction);
}

function violatesAppsScriptOnly(code: string) {
  // Check for non-GAS patterns while allowing UrlFetchApp.fetch()
  const hasUrlFetchApp = /UrlFetchApp\.fetch\s*\(/i.test(code);
  const hasForbiddenFetch = /\bfetch\s*\(/i.test(code);
  
  const violations = [
    /\bimport\s+/i,                    // ES6 imports
    /\brequire\s*\(/i,                 // Node.js require
    /\baxios\b/i,                      // axios library
    /\bfs\./i,                         // Node.js filesystem
    /\bchild_process\b/i,              // Node.js child_process
    /\bprocess\.env\b/i,               // Node.js process.env
    /\bnew\s+XMLHttpRequest\b/i        // XMLHttpRequest
  ];
  
  // Check fetch separately - allow only if it's UrlFetchApp.fetch
  const hasBadFetch = hasForbiddenFetch && !hasUrlFetchApp;
  
  return violations.some(pattern => pattern.test(code)) || hasBadFetch;
}

function buildWorkflowFromAnswers(answers: any, originalPrompt: string) {
  console.log('🎯 Building intelligent workflow from answers:', answers);
  
  // Intelligent workflow type detection
  const detectWorkflowType = () => {
    const promptText = originalPrompt.toLowerCase();
    const answersText = JSON.stringify(answers).toLowerCase();
    const combined = promptText + ' ' + answersText;
    
    // Interview/HR automation pattern
    if (combined.includes('candidate') || combined.includes('interview') || 
        combined.includes('recruit') || combined.includes('hire') ||
        (combined.includes('sheet') && combined.includes('email') && combined.includes('send'))) {
      return 'interview_automation';
    }
    
    // Gmail monitoring pattern  
    if (combined.includes('gmail') || combined.includes('inbox') || 
        combined.includes('email monitoring') || combined.includes('email automation')) {
      return 'gmail_monitoring';
    }
    
    // Customer support pattern
    if (combined.includes('support') || combined.includes('ticket') || 
        combined.includes('customer') || combined.includes('help')) {
      return 'customer_support';
    }
    
    // E-commerce/order pattern
    if (combined.includes('order') || combined.includes('purchase') || 
        combined.includes('product') || combined.includes('sale')) {
      return 'ecommerce_automation';
    }
    
    // Default to sheet-based if sheets mentioned
    if (combined.includes('sheet') || combined.includes('spreadsheet')) {
      return 'sheet_automation';
    }
    
    return 'generic_automation';
  };
  
  const workflowType = detectWorkflowType();
  console.log(`🎯 Detected workflow type: ${workflowType}`);
  
  // Extract common information from answers
  const extractCommonInfo = () => {
    // Extract Sheet details
    let sheetId = '';
    let sheetName = 'Sheet1';
    for (const [key, value] of Object.entries(answers)) {
      if (key.toLowerCase().includes('sheet') && typeof value === 'string') {
        if (value.includes('docs.google.com/spreadsheets')) {
          const match = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (match) sheetId = match[1];
        }
        // Extract sheet name if mentioned
        if (value.toLowerCase().includes('sheet 1')) sheetName = 'Sheet1';
        break;
      }
    }
    
    // Extract email content/template
    let emailContent = 'Default message';
    for (const [key, value] of Object.entries(answers)) {
      if (key.toLowerCase().includes('email') || key.toLowerCase().includes('content') || 
          key.toLowerCase().includes('template') || key.toLowerCase().includes('message')) {
        if (typeof value === 'string') {
          emailContent = value;
        }
        break;
      }
    }
    
    // Extract trigger information
    let triggerType = 'manual';
    for (const [key, value] of Object.entries(answers)) {
      if (key.toLowerCase().includes('trigger') && typeof value === 'string') {
        if (value.toLowerCase().includes('new row') || value.toLowerCase().includes('sheet')) {
          triggerType = 'sheet_row';
        } else if (value.toLowerCase().includes('email') || value.toLowerCase().includes('gmail')) {
          triggerType = 'gmail';
        }
        break;
      }
    }
    
    return { sheetId, sheetName, emailContent, triggerType };
  };
  
  const { sheetId, sheetName, emailContent, triggerType } = extractCommonInfo();
  
  // Generate workflow based on detected type
  let nodes, connections, appsScriptCode, description, intent;
  
  if (workflowType === 'interview_automation') {
    // Interview automation: Sheets trigger → Check status → Send email → Update status
    nodes = [
      {
        id: 'sheets-trigger',
        type: 'google-sheets',
        app: 'Google Sheets',
        function: 'on_new_row',
        functionName: 'Monitor New Candidates',
        parameters: { spreadsheetId: sheetId, sheetName },
        position: { x: 120, y: 80 },
        icon: '📊',
        color: '#34A853',
        aiReason: 'Detects when new candidate data is added to spreadsheet',
        confidence: 0.95,
        isRequired: true
      },
      {
        id: 'status-check',
        type: 'transform',
        app: 'Built-in',
        function: 'check_column_status',
        functionName: 'Check Invitation Status',
        parameters: { 
          statusColumn: 'D',
          condition: 'empty',
          action: 'proceed_if_empty'
        },
        position: { x: 380, y: 80 },
        icon: '🔍',
        color: '#9AA0A6',
        aiReason: 'Only proceeds if status column D is empty (not yet invited)',
        confidence: 0.90,
        isRequired: true
      },
      {
        id: 'gmail-send',
        type: 'gmail',
        app: 'Gmail',
        function: 'send_email',
        functionName: 'Send Interview Invitation',
        parameters: {
          toColumnRef: 'B',
          subjectTemplate: `${emailContent} - Interview Invitation`,
          bodyColumnRef: 'C',
          fromTemplate: true
        },
        position: { x: 640, y: 80 },
        icon: '📧',
        color: '#EA4335',
        aiReason: 'Sends personalized interview invitation to candidate email',
        confidence: 0.85,
        isRequired: true
      },
      {
        id: 'status-update',
        type: 'google-sheets',
        app: 'Google Sheets',
        function: 'update_cell',
        functionName: 'Update Invitation Status',
        parameters: {
          spreadsheetId: sheetId,
          sheetName,
          column: 'D',
          value: 'Invited',
          onError: 'Failed to Send'
        },
        position: { x: 900, y: 80 },
        icon: '✅',
        color: '#34A853',
        aiReason: 'Updates status column to track invitation success/failure',
        confidence: 0.95,
        isRequired: true
      }
    ];
    
    connections = [
      { id: 'c1', source: 'sheets-trigger', target: 'status-check', dataType: 'row_data' },
      { id: 'c2', source: 'status-check', target: 'gmail-send', dataType: 'candidate_data' },
      { id: 'c3', source: 'gmail-send', target: 'status-update', dataType: 'send_result' }
    ];
    
    appsScriptCode = generateInterviewAutomationGAS({ sheetId, sheetName, emailContent });
    description = `Automatically sends interview invitations when new candidates are added to spreadsheet. Tracks status in column D.`;
    intent = 'interview_automation';
    
  } else if (workflowType === 'sheet_automation') {
    // Generic sheet automation 
    nodes = [
      {
        id: 'sheets-trigger',
        type: 'google-sheets', 
        app: 'Google Sheets',
        function: 'on_edit',
        functionName: 'Monitor Sheet Changes',
        parameters: { spreadsheetId: sheetId, sheetName },
        position: { x: 120, y: 80 },
        icon: '📊',
        color: '#34A853',
        aiReason: 'Monitors spreadsheet for changes or new data',
        confidence: 0.95,
        isRequired: true
      },
      {
        id: 'data-process',
        type: 'transform',
        app: 'Built-in',
        function: 'process_data',
        functionName: 'Process Sheet Data',
        parameters: { action: 'validate_and_format' },
        position: { x: 380, y: 80 },
        icon: '⚙️',
        color: '#9AA0A6',
        aiReason: 'Processes and validates the sheet data',
        confidence: 0.85,
        isRequired: true
      },
      {
        id: 'gmail-notify',
        type: 'gmail',
        app: 'Gmail',
        function: 'send_notification',
        functionName: 'Send Notification',
        parameters: { 
          subject: 'Sheet Updated',
          body: `${emailContent}`
        },
        position: { x: 640, y: 80 },
        icon: '📧',
        color: '#EA4335',
        aiReason: 'Sends notification about sheet changes',
        confidence: 0.80,
        isRequired: true
      }
    ];
    
    connections = [
      { id: 'c1', source: 'sheets-trigger', target: 'data-process', dataType: 'sheet_data' },
      { id: 'c2', source: 'data-process', target: 'gmail-notify', dataType: 'processed_data' }
    ];
    
    appsScriptCode = generateSheetAutomationGAS({ sheetId, sheetName, emailContent });
    description = `Monitors spreadsheet changes and sends notifications when data is updated.`;
    intent = 'sheet_automation';
    
  } else {
    // Default Gmail monitoring (fallback)
    nodes = [
      {
        id: 'gmail-trigger',
        type: 'gmail',
        app: 'Gmail',
        function: 'new_email_in_label',
        functionName: 'Monitor Gmail',
        parameters: { label: 'Inbox' },
        position: { x: 120, y: 80 },
        icon: '📧',
        color: '#EA4335',
        aiReason: 'Monitors new emails in specified label',
        confidence: 0.95,
        isRequired: true
      },
      {
        id: 'gmail-reply',
        type: 'gmail',
        app: 'Gmail',
        function: 'send_reply',
        functionName: 'Auto Reply',
        parameters: { 
          bodyTemplate: emailContent || 'Thank you for your email. We will respond shortly.'
        },
        position: { x: 380, y: 80 },
        icon: '↩️',
        color: '#EA4335',
        aiReason: 'Sends automated reply to emails',
        confidence: 0.85,
        isRequired: true
      }
    ];
    
    connections = [
      { id: 'c1', source: 'gmail-trigger', target: 'gmail-reply', dataType: 'email_data' }
    ];
    
    appsScriptCode = generateGenericGAS({ emailContent });
    description = `Basic email automation with auto-reply functionality.`;
    intent = 'email_automation';
  }

  return {
    id: `workflow-${Date.now()}`,
    title: generateIntelligentTitle(intent, originalPrompt),
    description,
    nodes,
    connections,
    appsScriptCode,
    estimatedValue: '$500/month time savings',
    complexity: nodes.length > 3 ? 'Complex' : 'Medium',
    intelligence: {
      intent,
      confidence: 0.92,
      logicalFunctions: nodes.map(n => ({
        app: n.app,
        function: n.function,
        reason: n.aiReason,
        parameters: n.parameters,
        isRequired: n.isRequired
      }))
    }
  };
}

// New intelligent GAS generators for different automation types
function generateInterviewAutomationGAS(config: any) {
  const { sheetId, sheetName, emailContent } = config;
  
  return `/**
 * Interview Automation: Sheets → Status Check → Send Email → Update Status  
 * Generated by AI Builder for interview candidate management
 */

function onEdit(e) {
  // Only trigger on new rows in the candidate sheet
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== "${sheetName}") return;
  
  const range = e.range;
  if (range.getColumn() > 3 || range.getRow() === 1) return; // Skip headers and status column
  
  processCandidateRow(range.getRow());
}

function processCandidateRow(rowNum) {
  try {
    console.log(\`🎯 Processing candidate in row \${rowNum}\`);
    
    const sheet = SpreadsheetApp.openById("${sheetId}").getSheetByName("${sheetName}");
    const range = sheet.getRange(rowNum, 1, 1, 4); // A:D columns
    const [name, email, template, status] = range.getValues()[0];
    
    // Only proceed if status column (D) is empty
    if (status && status.toString().trim() !== '') {
      console.log(\`⏭️ Skipping row \${rowNum} - already processed (status: \${status})\`);
      return;
    }
    
    // Validate required data
    if (!name || !email) {
      sheet.getRange(rowNum, 4).setValue('Missing Data');
      console.log(\`❌ Row \${rowNum} missing required data\`);
      return;
    }
    
    // Send interview invitation
    const subject = \`\${emailContent || 'Interview Invitation'} - \${name}\`;
    const body = template || \`
Dear \${name},

Thank you for your interest in our position. We would like to invite you for an interview.

Please reply with your availability for the coming week.

Best regards,
HR Team
\`;
    
    console.log(\`📧 Sending invitation to \${email}\`);
    
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body
    });
    
    // Update status to 'Invited'
    sheet.getRange(rowNum, 4).setValue('Invited');
    console.log(\`✅ Successfully invited \${name} and updated status\`);
    
  } catch (error) {
    console.error(\`❌ Error processing candidate: \${error.message}\`);
    
    // Update status to show error
    try {
      const sheet = SpreadsheetApp.openById("${sheetId}").getSheetByName("${sheetName}");
      sheet.getRange(rowNum, 4).setValue('Failed to Send');
    } catch (updateError) {
      console.error(\`Failed to update error status: \${updateError.message}\`);
    }
  }
}

function testInterviewAutomation() {
  console.log('🧪 Testing interview automation...');
  processCandidateRow(2); // Test with row 2
}`;
}

function generateSheetAutomationGAS(config: any) {
  const { sheetId, sheetName, emailContent } = config;
  
  return `/**
 * Sheet Automation: Monitor Changes → Process Data → Send Notifications
 * Generated by AI Builder for spreadsheet monitoring
 */

function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== "${sheetName}") return;
  
  const range = e.range;
  console.log(\`📊 Sheet change detected: \${range.getA1Notation()}\`);
  
  processSheetChange(range);
}

function processSheetChange(range) {
  try {
    const sheet = range.getSheet();
    const values = range.getValues();
    
    console.log(\`🔄 Processing change in \${range.getA1Notation()}\`);
    
    // Send notification about the change
    const subject = 'Sheet Updated - ${sheetName}';
    const body = \`
\${emailContent || 'Spreadsheet has been updated'}

Details:
- Sheet: \${sheet.getName()}
- Range: \${range.getA1Notation()}
- New Values: \${JSON.stringify(values)}
- Time: \${new Date()}

View spreadsheet: https://docs.google.com/spreadsheets/d/${sheetId}/edit
\`;
    
    // You can modify this to send to specific recipients
    const recipients = ['admin@company.com']; // Add your email here
    
    recipients.forEach(email => {
      MailApp.sendEmail({
        to: email,
        subject: subject,
        body: body
      });
    });
    
    console.log(\`✅ Notification sent for change in \${range.getA1Notation()}\`);
    
  } catch (error) {
    console.error(\`❌ Error processing sheet change: \${error.message}\`);
  }
}`;
}

function generateGenericGAS(config: any) {
  const { emailContent } = config;
  
  return `/**
 * Generic Email Automation
 * Generated by AI Builder for basic email handling
 */

function processEmails() {
  try {
    console.log('📧 Starting email processing...');
    
    const threads = GmailApp.getInboxThreads(0, 10);
    
    threads.forEach(thread => {
      const messages = thread.getMessages();
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage.isUnread()) {
        console.log(\`📨 Processing: \${lastMessage.getSubject()}\`);
        
        // Send auto-reply
        const replyBody = \`\${emailContent || 'Thank you for your email. We will respond shortly.'}

---
This is an automated response.
\`;
        
        lastMessage.reply(replyBody);
        lastMessage.markRead();
        
        console.log(\`✅ Auto-reply sent to \${lastMessage.getFrom()}\`);
      }
    });
    
  } catch (error) {
    console.error(\`❌ Error processing emails: \${error.message}\`);
  }
}

function setupEmailTrigger() {
  // Create a time-based trigger to check emails every 5 minutes
  ScriptApp.newTrigger('processEmails')
    .timeBased()
    .everyMinutes(5)
    .create();
}`;
}

function generateGASForGmailReplyLabelSheet(config: any) {
  const { gmailLabel, keywords, sheetId, sheetName, priorities } = config;
  const keywordsArray = JSON.stringify(keywords || []);
  const prioritiesArray = JSON.stringify(priorities || ['High', 'Medium', 'Low']);

  return `/**
 * Gmail → LLM Classify → Reply/Label → Sheets Automation
 * Generated by AI Builder
 * 
 * Monitors: ${gmailLabel}
 * Keywords: ${keywords?.join(', ') || 'any'}
 * Sheet: ${sheetId}
 */

function main() {
  try {
    console.log('🚀 Starting Gmail automation...');
    
    const labelName = ${JSON.stringify(gmailLabel)};
    const keywords = ${keywordsArray};
    const priorities = ${prioritiesArray};
    const sheetId = ${JSON.stringify(sheetId)};
    const sheetName = ${JSON.stringify(sheetName)};
    
    // Get emails from specific label
    const query = 'label:"' + labelName + '" is:unread';
    const threads = GmailApp.search(query, 0, 50);
    
    console.log(\`Found \${threads.length} unread emails in "\${labelName}" label\`);
    
    if (threads.length === 0) {
      console.log('No new emails to process');
      return;
    }
    
    // Open Google Sheet
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(sheetName) || 
                  SpreadsheetApp.openById(sheetId).getSheets()[0];
    
    // Process each email thread
    threads.forEach((thread, index) => {
      try {
        const messages = thread.getMessages();
        const latestMessage = messages[messages.length - 1];
        
        const subject = latestMessage.getSubject() || '';
        const from = latestMessage.getFrom() || '';
        const body = latestMessage.getPlainBody() || '';
        const date = latestMessage.getDate();
        
        console.log(\`Processing email \${index + 1}: "\${subject}"\`);
        
        // Step 1: Check if email contains target keywords
        const hasKeyword = keywords.length === 0 || 
          keywords.some(keyword => 
            body.toLowerCase().includes(keyword.toLowerCase()) ||
            subject.toLowerCase().includes(keyword.toLowerCase())
          );
        
        console.log(\`Keywords check: \${hasKeyword ? 'PASS' : 'FAIL'}\`);
        
        // Step 2: LLM Classification (with fallback)
        const classification = classifyWithGemini({
          subject: subject,
          body: body.substring(0, 1000), // Limit for API
          keywords: keywords
        });
        
        const shouldReply = hasKeyword && classification.replyWorthy;
        const priority = classification.priority || 'Medium';
        
        console.log(\`Classification: Priority=\${priority}, ShouldReply=\${shouldReply}\`);
        
        // Step 3: Send reply if needed
        let replySent = 'No';
        if (shouldReply) {
          try {
            const replyText = classification.suggestedReply || 
              'Thank you for your email regarding ' + subject + '. We have received your query and will get back to you shortly.';
            
            latestMessage.reply(replyText);
            replySent = 'Yes';
            console.log('✅ Reply sent');
          } catch (replyError) {
            console.error('Failed to send reply:', replyError);
            replySent = 'Failed';
          }
        }
        
        // Step 4: Apply priority label
        try {
          const priorityLabelName = 'Priority/' + priority;
          let priorityLabel = GmailApp.getUserLabelByName(priorityLabelName);
          
          if (!priorityLabel) {
            priorityLabel = GmailApp.createLabel(priorityLabelName);
          }
          
          thread.addLabel(priorityLabel);
          console.log(\`✅ Applied label: \${priorityLabelName}\`);
        } catch (labelError) {
          console.error('Failed to apply label:', labelError);
        }
        
        // Step 5: Log to Google Sheets
        try {
          const rowData = [
            subject,
            from,
            body.substring(0, 500), // Truncate long bodies
            priority,
            replySent,
            date
          ];
          
          sheet.appendRow(rowData);
          console.log('✅ Logged to sheet');
        } catch (sheetError) {
          console.error('Failed to log to sheet:', sheetError);
        }
        
        // Mark as read to avoid reprocessing
        thread.markAsRead();
        
      } catch (emailError) {
        console.error(\`Error processing email \${index + 1}:\`, emailError);
      }
    });
    
    console.log('✅ Gmail automation completed successfully');
    
  } catch (error) {
    console.error('❌ Gmail automation error:', error);
    
    // Send error notification
    try {
      GmailApp.sendEmail(
        Session.getActiveUser().getEmail(),
        'Gmail Automation Error',
        \`Your Gmail automation encountered an error: \${error.toString()}\`
      );
    } catch (notificationError) {
      console.error('Failed to send error notification:', notificationError);
    }
  }
}

function classifyWithGemini(input) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    
    if (!apiKey) {
      console.log('No Gemini API key found, using keyword-based classification');
      return {
        replyWorthy: input.keywords.some(k => 
          input.body.toLowerCase().includes(k.toLowerCase())
        ),
        priority: 'Medium',
        suggestedReply: 'Thank you for your email. We will get back to you shortly.'
      };
    }
    
    const prompt = \`Analyze this email and return JSON:
Subject: \${input.subject}
Body: \${input.body}

Required keywords: \${input.keywords.join(', ')}

Return JSON format:
{
  "replyWorthy": true/false,
  "priority": "High/Medium/Low", 
  "suggestedReply": "appropriate response text"
}

Priority rules:
- High: Urgent issues, complaints, immediate action needed
- Medium: General queries, information requests
- Low: Marketing, newsletters, non-critical updates

Reply worthiness: Only if email contains required keywords and needs human response\`;

    const payload = {
      contents: [{ 
        parts: [{ text: prompt }] 
      }],
      generationConfig: { 
        temperature: 0.1, 
        maxOutputTokens: 512 
      }
    };
    
    const response = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );
    
    if (response.getResponseCode() !== 200) {
      throw new Error('Gemini API error: ' + response.getContentText());
    }
    
    const data = JSON.parse(response.getContentText());
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const result = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, '').trim());
    
    console.log('🤖 LLM Classification:', result);
    return result;
    
  } catch (error) {
    console.error('LLM classification failed:', error);
    
    // Fallback to keyword-based classification
    const hasKeywords = input.keywords.some(k => 
      input.body.toLowerCase().includes(k.toLowerCase()) ||
      input.subject.toLowerCase().includes(k.toLowerCase())
    );
    
    return {
      replyWorthy: hasKeywords,
      priority: 'Medium',
      suggestedReply: 'Thank you for your email. We will get back to you shortly.'
    };
  }
}

// Setup function to create time-based triggers
function setupTriggers() {
  console.log('Setting up triggers for Gmail automation...');
  
  // Delete existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create time-based trigger (every 5 minutes)
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyMinutes(5)
    .create();
    
  console.log('✅ Trigger set up: runs every 5 minutes');
  console.log('💡 Add your Gemini API key to Script Properties for LLM features');
}

// Manual execution function for testing
function runOnce() {
  console.log('🧪 Running Gmail automation manually...');
  main();
}`;
}

async function shouldAskQuestions(prompt: string): Promise<{shouldAsk: boolean, reasoning: string}> {
  // Use LLM to intelligently determine if questions are needed
  try {
    const analysisPrompt = `You are an expert Google Apps Script automation consultant. Analyze this user request and determine if you have enough information to build a complete automation.

User Request: "${prompt}"

Consider these critical factors:
1. Is the trigger clearly specified? (when should it run?)
2. Are the data sources clearly defined? (what data to process?)
3. Are the actions clearly defined? (what should happen?)
4. Are any conditions or filters specified?
5. Is the automation scope clear?

Respond with JSON only:
{
  "needsQuestions": true/false,
  "reasoning": "Brief explanation",
  "missingInfo": ["trigger", "data_source", "actions", "conditions"] // only include what's missing
}

Examples:
- "automate my emails" → needs questions (vague, missing trigger, actions)
- "Monitor Gmail for invoices and save them to Sheet every hour" → no questions (clear trigger, source, action)
- "create automation" → needs questions (completely vague)`;

    // Use the Gemini model to analyze
    const models = MultiAIService.getModels();
    const geminiModel = models.find(m => m.provider === 'gemini');
    
    if (!geminiModel?.apiKey) {
      // Fallback to simple heuristics if no API key
      return {
        shouldAsk: prompt.split(' ').length <= 8,
        reasoning: 'Simple heuristic analysis'
      };
    }

    const response = await fetch(`${geminiModel.endpoint}?key=${geminiModel.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: analysisPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
      })
    });

    if (!response.ok) throw new Error('Analysis failed');
    
    const data = await response.json();
    const aiResponse = data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
    
    return {
      shouldAsk: parsed.needsQuestions,
      reasoning: parsed.reasoning
    };
    
  } catch (error) {
    console.error('LLM analysis failed, using fallback:', error);
    // Fallback to simple heuristics
    return {
      shouldAsk: prompt.split(' ').length <= 8 || prompt.toLowerCase().includes('automate'),
      reasoning: 'Fallback analysis - prompt appears to need clarification'
    };
  }
}

async function generateFollowUpQuestions(prompt: string): Promise<any[]> {
  // Use LLM to generate intelligent, context-aware questions
  try {
    const appHints = detectAppsFromPrompt(prompt); // you already import this
    const appList = appHints?.join(', ') || 'Google Workspace apps';

    const questionPrompt = `You are an expert Google Apps Script solution architect.
We are building an automation ONLY in Google Apps Script (UrlFetchApp for external APIs, OAuth2 library for OAuth). No Node.js/Python/servers.

User request: "${prompt}"

Return 3–5 highly specific questions that BLOCK implementation if unanswered. Focus ONLY on:
- trigger specifics (event, schedule, Gmail label/query, Form submit, Drive folder, etc.)
- filters/conditions/exclusions
- exact fields to read/write
- destination details (Sheet ID/range, Calendar, Drive folder)
- permissions/scopes and frequency/error handling

Respond as strict JSON array:
[
  { "id": "trigger", "text": "...", "type": "choice|text", "choices": ["..."], "required": true, "category": "trigger" },
  ...
]`;

    // Use the Gemini model to generate questions
    const models = MultiAIService.getModels();
    const geminiModel = models.find(m => m.provider === 'gemini');
    
    if (!geminiModel?.apiKey) {
      // Fallback to basic questions if no API key
      return [{
        id: 'basic_trigger',
        text: 'What should trigger this automation?',
        type: 'choice',
        choices: ['Time-based', 'Event-based', 'Manual trigger'],
        required: true,
        category: 'trigger'
      }];
    }

    const response = await fetch(`${geminiModel.endpoint}?key=${geminiModel.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: questionPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
      })
    });

    if (!response.ok) throw new Error('Question generation failed');
    
    const data = await response.json();
    const aiResponse = data.candidates[0].content.parts[0].text;
    
    // Robust JSON parsing with fallback as ChatGPT suggested
    let parsed;
    try {
      const raw = aiResponse.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      // Fallback questions if parsing fails
      parsed = [
        { id: 'trigger', text: 'What should trigger this automation?', type: 'text', required: true, category: 'trigger' },
        { id: 'filter', text: 'Any filters/conditions (e.g., subject contains, label, folder)?', type: 'text', required: false, category: 'filter' },
        { id: 'destination', text: 'Where should we write the output (Sheet ID and range)?', type: 'text', required: true, category: 'destination' }
      ];
    }
    
    // ChatGPT's format expects direct array, not object with questions property
    return Array.isArray(parsed) ? parsed : (parsed.questions || []);
    
  } catch (error) {
    console.error('LLM question generation failed, using fallback:', error);
    // Fallback to basic questions
    return [
      {
        id: 'trigger_type',
        text: 'What should trigger this automation?',
        type: 'choice',
        choices: ['New email arrives', 'Time schedule', 'Sheet update', 'Manual run'],
        required: true,
        category: 'trigger'
      },
      {
        id: 'action_type', 
        text: 'What should the automation do?',
        type: 'choice',
        choices: ['Process emails', 'Update sheets', 'Send notifications', 'Generate reports'],
        required: true,
        category: 'action'
      }
    ];
  }
}

export { MultiAIService };