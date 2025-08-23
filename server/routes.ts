import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerGoogleAppsRoutes } from "./googleAppsAPI";
import { registerAIWorkflowRoutes } from "./aiModels";
import { RealAIService, ConversationManager } from "./realAIService";
import { WorkflowAPI } from "./workflowAPI";
// Temporarily commented out to fix import issues
// import { graphValidator } from "./core/GraphValidator.js";
// import { graphCompiler } from "./core/GraphCompiler.js";
// import { googleAppsScriptDeployer } from "./core/GoogleAppsScriptDeployer.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Google Apps Script automation routes
  registerGoogleAppsRoutes(app);
  
  // AI workflow generation routes
  registerAIWorkflowRoutes(app);

  // NEW Proper Backend Pipeline API - TEMPORARILY DISABLED
  
  // TODO: Re-enable after fixing import issues
  /*
  // Workflow API endpoints
  app.post('/api/workflow/clarify', async (req, res) => {
    try {
      const { prompt, context, model = 'gemini-pro', apiKey } = req.body;

      if (!prompt || !apiKey) {
        return res.status(400).json({ error: 'Prompt and API key are required' });
      }

      const systemPrompt = `You are an automation analyst for Google Apps Script. Ask essential clarifying questions.

Return JSON:
{
  "questions": [
    {
      "id": "trigger_type",
      "text": "What should trigger this automation?",
      "type": "choice",
      "choices": ["Time schedule", "New email", "Webhook"],
      "required": true,
      "category": "trigger"
    }
  ]
}`;

      const aiResponse = await RealAIService.processAutomationRequest(
        `${systemPrompt}\n\nAnalyze: "${prompt}"`,
        model,
        apiKey,
        []
      );

      const result = JSON.parse(aiResponse.response || '{}');

      res.json({
        success: true,
        questions: result.questions || [],
        tokensUsed: aiResponse.tokensUsed,
        cost: aiResponse.cost
      });

    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.post('/api/workflow/generate-complete', async (req, res) => {
    try {
      const { prompt, answers, model = 'gemini-pro', apiKey, options } = req.body;

      if (!prompt || !apiKey) {
        return res.status(400).json({ error: 'Prompt and API key are required' });
      }

      const systemPrompt = `Generate a NodeGraph for Google Apps Script automation.

Return JSON:
{
  "graph": {
    "id": "workflow_123",
    "name": "Email Logger",
    "nodes": [
      {
        "id": "trigger1",
        "type": "trigger.gmail.new_email",
        "position": {"x": 100, "y": 100},
        "data": {"query": "is:unread"}
      }
    ],
    "edges": []
  },
  "rationale": "This workflow..."
}`;

      const answersText = Object.entries(answers || {})
        .map(([q, a]) => `Q: ${q}\nA: ${a}`)
        .join('\n\n');

      const aiResponse = await RealAIService.processAutomationRequest(
        `${systemPrompt}\n\nRequest: "${prompt}"\n\nAnswers:\n${answersText}`,
        model,
        apiKey,
        []
      );

      const result = JSON.parse(aiResponse.response || '{}');
      const graph = result.graph || {
        id: `fallback_${Date.now()}`,
        name: 'Basic Automation',
        nodes: [{
          id: 'trigger1',
          type: 'trigger.time.cron',
          position: { x: 100, y: 100 },
          data: { schedule: '@daily' }
        }],
        edges: []
      };

      // Compile to Google Apps Script
      const compiled = graphCompiler.compile(graph, options || {});

      res.json({
        success: true,
        graph: graph,
        rationale: result.rationale || 'Generated workflow',
        files: compiled.files,
        manifest: compiled.manifest,
        tokensUsed: aiResponse.tokensUsed,
        cost: aiResponse.cost
      });

    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.post('/api/workflow/validate', async (req, res) => {
    try {
      const { graph } = req.body;
      if (!graph) {
        return res.status(400).json({ error: 'Graph is required' });
      }

      const validation = graphValidator.validate(graph);
      res.json({ success: true, ...validation });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.post('/api/workflow/compile', async (req, res) => {
    try {
      const { graph, options } = req.body;
      if (!graph) {
        return res.status(400).json({ error: 'Graph is required' });
      }

      const compiled = graphCompiler.compile(graph, options || {});
      res.json({ success: true, ...compiled });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.post('/api/workflow/deploy', async (req, res) => {
    try {
      const { files, options } = req.body;
      if (!files) {
        return res.status(400).json({ error: 'Files are required' });
      }

      const deployment = await googleAppsScriptDeployer.deploy(files, options || {});
      res.json({ success: deployment.success, ...deployment });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });
  */

  // REAL AI Conversation API
  app.post('/api/ai/conversation', async (req, res) => {
    try {
      const { prompt, model, apiKey, userId } = req.body;
      
      if (!prompt || !model || !apiKey) {
        return res.status(400).json({ 
          error: 'Prompt, model, and apiKey are required' 
        });
      }

      console.log(`🧠 REAL AI Conversation Request:`, { model, prompt: prompt.substring(0, 100) });

      // Get conversation history
      const conversationHistory = ConversationManager.getConversation(userId);
      
      // Add user message to conversation
      ConversationManager.addMessage(userId, 'user', prompt);

      // Call REAL AI service
      const aiResponse = await RealAIService.processAutomationRequest(
        prompt,
        model,
        apiKey,
        conversationHistory
      );

      // Add AI response to conversation
      ConversationManager.addMessage(userId, 'assistant', aiResponse.response);

      console.log(`✅ REAL AI Response: ${aiResponse.model}, ${aiResponse.tokensUsed} tokens, $${aiResponse.cost.toFixed(4)}`);

      res.json({
        ...aiResponse,
        conversationHistory: ConversationManager.getConversation(userId)
      });

    } catch (error) {
      console.error('❌ Real AI conversation error:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to process AI request',
        model: req.body.model || 'unknown'
      });
    }
  });

  // Clear conversation history
  app.delete('/api/ai/conversation/:userId', (req, res) => {
    const { userId } = req.params;
    ConversationManager.clearConversation(userId);
    res.json({ success: true });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // Automation management endpoints
  app.get('/api/automations', (req, res) => {
    // TODO: Get saved automations from storage
    res.json({ automations: [] });
  });

  app.post('/api/automations', (req, res) => {
    // TODO: Save automation to storage
    const { name, nodes, edges } = req.body;
    res.json({ success: true, id: Date.now().toString() });
  });

  const httpServer = createServer(app);

  return httpServer;
}
