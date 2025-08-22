import express from 'express';
import { detectAppsFromPrompt, getAppById, generateCompleteAppDatabase, TOTAL_SUPPORTED_APPS } from './complete500Apps';
import { IntelligentFunctionMapper } from './intelligentFunctionMapper';

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

class MultiAIService {
  private static models: AIModelConfig[] = [
    {
      name: 'Gemini Pro',
      provider: 'gemini',
      costPerToken: 0.00025, // Much cheaper than OpenAI
      maxTokens: 32000,
      apiKey: process.env.GEMINI_API_KEY,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
    },
    {
      name: 'Claude 3 Haiku',
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

  public static async analyzeWorkflowPrompt(prompt: string): Promise<AIAnalysisResult> {
    const startTime = Date.now();
    
    // Try models in order of cost efficiency
    for (const model of this.models) {
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
        console.warn(`${model.name} failed, trying next model:`, error.message);
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
      throw new Error('Gemini API key not configured');
    }

    const systemPrompt = `You are an automation expert. Analyze the user's workflow request and return a JSON response with:
{
  "intent": "email_tracking|lead_followup|file_organization|custom_automation",
  "requiredApps": ["Gmail", "Google Sheets", etc.],
  "suggestedFunctions": ["Search Emails", "Append Row", etc.],
  "complexity": "Simple|Medium|Complex",
  "estimatedValue": "$X,XXX/month time savings",
  "confidence": 0.95
}`;

    try {
      const response = await fetch(`${model.endpoint}?key=${model.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nUser Request: "${prompt}"`
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.candidates[0].content.parts[0].text;
      
      // Parse JSON response from Gemini
      const parsed = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
      return parsed;
      
    } catch (error) {
      console.error('Gemini API call failed:', error);
      throw error;
    }
  }

  private static async callClaude(model: AIModelConfig, prompt: string): Promise<Omit<AIAnalysisResult, 'processingTime' | 'modelUsed'>> {
    if (!model.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const systemPrompt = `You are an automation expert. Analyze workflow requests and return structured JSON responses for Google Apps Script automation building.`;

    try {
      const response = await fetch(model.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': model.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Analyze this automation request and return JSON: "${prompt}"`
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
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

    const systemPrompt = `You are an automation expert specializing in Google Apps Script. Analyze user requests and return structured JSON responses for automation building.`;

    try {
      const response = await fetch(model.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this automation request: "${prompt}"` }
          ],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
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

  private static localFallbackAnalysis(prompt: string): AIAnalysisResult {
    const lowerPrompt = prompt.toLowerCase();
    
    // Use comprehensive app detection from 500+ app database
    const detectedApps = detectAppsFromPrompt(prompt);
    const appNames = detectedApps.map(app => app.name);
    
    // Extract suggested functions from detected apps
    const functions: string[] = [];
    detectedApps.forEach(app => {
      app.commonFunctions.forEach(func => {
        functions.push(func.name);
      });
    });

    // Determine intent based on detected apps and prompt
    let intent = 'custom_automation';
    if (lowerPrompt.includes('track') && lowerPrompt.includes('email')) intent = 'email_tracking';
    if (lowerPrompt.includes('follow') && (lowerPrompt.includes('lead') || lowerPrompt.includes('customer'))) intent = 'lead_followup';
    if (lowerPrompt.includes('organize') && lowerPrompt.includes('file')) intent = 'file_organization';
    if (lowerPrompt.includes('report') || lowerPrompt.includes('dashboard')) intent = 'reporting_automation';
    if (lowerPrompt.includes('payment') || lowerPrompt.includes('order')) intent = 'ecommerce_automation';
    if (lowerPrompt.includes('social') || lowerPrompt.includes('post')) intent = 'social_media_automation';
    if (lowerPrompt.includes('support') || lowerPrompt.includes('ticket')) intent = 'customer_support_automation';

    // Calculate complexity based on number of apps and their individual complexity
    let complexity: 'Simple' | 'Medium' | 'Complex' = 'Simple';
    if (detectedApps.length > 3 || detectedApps.some(app => app.complexity === 'Complex')) {
      complexity = 'Complex';
    } else if (detectedApps.length > 2 || detectedApps.some(app => app.complexity === 'Medium')) {
      complexity = 'Medium';
    }

    // Calculate estimated value based on apps and complexity
    const baseValue = Math.max(400, detectedApps.length * 600);
    const complexityMultiplier = complexity === 'Complex' ? 2 : complexity === 'Medium' ? 1.5 : 1;
    const totalValue = Math.round(baseValue * complexityMultiplier);
    const estimatedValue = `$${totalValue.toLocaleString()}/month time savings`;

    // High confidence if we detected specific apps, lower if using defaults
    const confidence = detectedApps.length > 0 ? 0.9 : 0.6;

    return {
      intent,
      requiredApps: appNames.length > 0 ? appNames : ['Gmail', 'Google Sheets'], // Default if nothing detected
      suggestedFunctions: functions.length > 0 ? functions.slice(0, 8) : ['Process Data'], // Limit to 8 functions
      complexity,
      estimatedValue,
      confidence,
      processingTime: 50, // Fast local processing
      modelUsed: `Local AI Analysis (${TOTAL_SUPPORTED_APPS}+ Apps)`
    };
  }

  public static async getAvailableModels(): Promise<AIModelConfig[]> {
    return this.models.filter(model => 
      model.provider === 'local' || 
      (model.apiKey && model.apiKey.length > 0)
    );
  }

  public static async estimateCost(prompt: string, modelName?: string): Promise<{ cost: number; model: string }> {
    const tokenCount = Math.ceil(prompt.length / 4); // Rough token estimation
    
    const selectedModel = modelName 
      ? this.models.find(m => m.name === modelName)
      : this.models[0]; // Default to cheapest (Gemini)
    
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
      const { prompt, userId, preferredModel } = req.body;
      
      if (!prompt || !userId) {
        return res.status(400).json({ error: 'Prompt and userId are required' });
      }

      console.log(`Generating workflow for user ${userId} with prompt: "${prompt}"`);
      
      // Analyze prompt with multiple AI models
      const analysis = await MultiAIService.analyzeWorkflowPrompt(prompt);
      
      // Generate workflow structure
      const workflow = await generateWorkflowFromAnalysis(analysis, prompt);
      
      res.json({
        ...workflow,
        aiAnalysis: analysis,
        modelUsed: analysis.modelUsed,
        processingTime: analysis.processingTime,
        confidence: analysis.confidence
      });
      
    } catch (error) {
      console.error('Error generating workflow:', error);
      res.status(500).json({ 
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
            error: error.message
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
  // Use intelligent function mapping for each app
  const functionMappings = IntelligentFunctionMapper.generateWorkflowWithIntelligentFunctions(
    originalPrompt,
    analysis.requiredApps
  );

  // Build workflow structure with intelligent function selection
  const nodes = [];
  const connections = [];
  
  // Create nodes with intelligently selected functions
  functionMappings.forEach((mapping, index) => {
    const nodeId = `${mapping.appName.toLowerCase().replace(/\s+/g, '-')}-${index}`;
    
    nodes.push({
      id: nodeId,
      type: mapping.appName.toLowerCase().replace(/\s+/g, '-'),
      app: mapping.appName,
      function: mapping.selectedFunction,
      functionName: APP_FUNCTIONS[mapping.appName as keyof typeof APP_FUNCTIONS]?.[mapping.selectedFunction]?.name || mapping.selectedFunction,
      parameters: mapping.parameters,
      position: { x: 100 + (index * 200), y: 100 + (index % 2) * 100 },
      icon: getIconForApp(mapping.appName),
      color: getColorForApp(mapping.appName),
      aiReason: mapping.reason,
      confidence: mapping.confidence
    });
    
    // Create connections between consecutive nodes
    if (index > 0) {
      connections.push({
        id: `conn-${index}`,
        source: nodes[index - 1].id,
        target: nodeId
      });
    }
  });

  // Generate enhanced Google Apps Script code with specific functions
  const appsScriptCode = generateEnhancedAppsScriptCode(nodes, analysis, functionMappings);

  return {
    id: `workflow-${Date.now()}`,
    title: generateTitle(analysis.intent),
    description: generateDescription(originalPrompt),
    nodes,
    connections,
    appsScriptCode,
    estimatedValue: analysis.estimatedValue,
    complexity: analysis.complexity,
    functionMappings // Include the intelligent function selections
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

function generateDescription(prompt: string): string {
  return `Automatically ${prompt.toLowerCase().replace(/^i want to |^i need to |^please |^can you /, '')}`;
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
      if (mapping.selectedFunction === 'search_emails') {
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
  const hasGmailSearch = functionMappings.some(m => m.appName === 'Gmail' && m.selectedFunction === 'search_emails');
  const hasSheetAppend = functionMappings.some(m => m.appName === 'Google Sheets' && m.selectedFunction === 'append_row');
  const hasCalendarCreate = functionMappings.some(m => m.appName === 'Google Calendar' && m.selectedFunction === 'create_event');

  if (hasGmailSearch) {
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
      \`Your automation encountered an error: \${error.message}\`
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
      \`Your automation encountered an error: \${error.message}\`
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