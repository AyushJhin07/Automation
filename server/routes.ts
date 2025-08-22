import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerGoogleAppsRoutes } from "./googleAppsAPI";
import { registerAIWorkflowRoutes } from "./aiModels";
import { RealAIService, ConversationManager } from "./realAIService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Google Apps Script automation routes
  registerGoogleAppsRoutes(app);
  
  // AI workflow generation routes
  registerAIWorkflowRoutes(app);

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
