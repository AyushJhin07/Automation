import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerGoogleAppsRoutes } from "./googleAppsAPI";
import { registerAIWorkflowRoutes } from "./aiModels";
import { RealAIService, ConversationManager } from "./realAIService";

// Production services
import { authService } from "./services/AuthService";
import { connectionService, ConnectionService } from "./services/ConnectionService";
import { productionLLMOrchestrator } from "./services/ProductionLLMOrchestrator";
import { productionGraphCompiler } from "./core/ProductionGraphCompiler";
import { productionDeployer } from "./core/ProductionDeployer";
import { connectorFramework } from "./connectors/ConnectorFramework";
import { healthMonitoringService } from "./services/HealthMonitoringService";
import { usageMeteringService } from "./services/UsageMeteringService";
import { securityService } from "./services/SecurityService";

// Middleware
import { 
  authenticateToken, 
  optionalAuth, 
  checkQuota, 
  rateLimit, 
  adminOnly, 
  proOrHigher 
} from "./middleware/auth";

// Error handling utilities
import { getErrorMessage, formatError, APIResponse } from "./types/common";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Apply global security middleware
  app.use(securityService.securityHeaders());
  app.use(securityService.requestMonitoring());
  
  // Apply global rate limiting (more permissive in development)
  const rateLimitConfig = process.env.NODE_ENV === 'development' 
    ? { windowMs: 60000, maxRequests: 1000 }  // 1000 requests per minute in dev
    : { windowMs: 60000, maxRequests: 100 };   // 100 requests per minute in production
  
  app.use(securityService.createRateLimiter(rateLimitConfig));

  // Legacy routes (for backward compatibility)
  registerGoogleAppsRoutes(app);
  registerAIWorkflowRoutes(app);

  // ===== AUTHENTICATION ROUTES =====
  
  app.post('/api/auth/register', 
    securityService.validateInput([
      { field: 'email', type: 'email', required: true, sanitize: true },
      { field: 'password', type: 'string', required: true, minLength: 8 },
      { field: 'name', type: 'string', required: false, maxLength: 255, sanitize: true }
    ]),
    async (req, res) => {
      try {
        const result = await authService.register(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.post('/api/auth/login',
    securityService.validateInput([
      { field: 'email', type: 'email', required: true },
      { field: 'password', type: 'string', required: true }
    ]),
    async (req, res) => {
      try {
        const result = await authService.login(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.post('/api/auth/refresh',
    securityService.validateInput([
      { field: 'refreshToken', type: 'string', required: true }
    ]),
    async (req, res) => {
      try {
        const result = await authService.refreshToken(req.body.refreshToken);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        await authService.logout(token);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // ===== CONNECTION MANAGEMENT ROUTES =====

  app.post('/api/connections', 
    authenticateToken,
    checkQuota(1),
    securityService.validateInput([
      { field: 'name', type: 'string', required: true, maxLength: 255, sanitize: true },
      { field: 'provider', type: 'string', required: true, allowedValues: ['openai', 'gemini', 'claude', 'slack', 'gmail'] },
      { field: 'type', type: 'string', required: true, allowedValues: ['llm', 'saas', 'database'] },
      { field: 'credentials', type: 'json', required: true }
    ]),
    async (req, res) => {
      try {
        const connectionId = await connectionService.createConnection({
          userId: req.user!.id,
          ...req.body
        });
        res.json({ success: true, connectionId });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.get('/api/connections', authenticateToken, async (req, res) => {
    try {
      const connections = await connectionService.getUserConnections(req.user!.id);
      // Mask credentials for security
      const maskedConnections = connections.map(conn => ConnectionService.maskCredentials(conn));
      res.json({ success: true, connections: maskedConnections });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.post('/api/connections/:id/test', 
    authenticateToken,
    checkQuota(1),
    async (req, res) => {
      try {
        const result = await connectionService.testConnection(req.params.id, req.user!.id);
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.delete('/api/connections/:id', authenticateToken, async (req, res) => {
    try {
      await connectionService.deleteConnection(req.params.id, req.user!.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // ===== PRODUCTION LLM ORCHESTRATOR ROUTES =====

  app.post('/api/workflow/clarify', 
    authenticateToken,
    checkQuota(1, 500),
    securityService.validateInput([
      { field: 'prompt', type: 'string', required: true, maxLength: 10000, sanitize: true }
    ]),
    async (req, res) => {
      try {
        const result = await productionLLMOrchestrator.clarifyIntent({
          prompt: req.body.prompt,
          userId: req.user!.id,
          context: req.body.context || {}
        });

        // Record usage
        if (result.tokensUsed) {
          await usageMeteringService.recordApiUsage(
            req.user!.id,
            1,
            result.tokensUsed,
            result.cost || 0
          );
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.post('/api/workflow/plan',
    authenticateToken,
    checkQuota(1, 1500),
    securityService.validateInput([
      { field: 'prompt', type: 'string', required: true, maxLength: 10000, sanitize: true },
      { field: 'answers', type: 'json', required: true }
    ]),
    async (req, res) => {
      try {
        const result = await productionLLMOrchestrator.planWorkflow({
          prompt: req.body.prompt,
          answers: req.body.answers,
          userId: req.user!.id,
          context: req.body.context || {}
        });

        // Record usage
        if (result.tokensUsed) {
          await usageMeteringService.recordApiUsage(
            req.user!.id,
            1,
            result.tokensUsed,
            result.cost || 0
          );
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.post('/api/workflow/fix',
    authenticateToken,
    checkQuota(1, 800),
    securityService.validateInput([
      { field: 'graph', type: 'json', required: true },
      { field: 'errors', type: 'array', required: true }
    ]),
    async (req, res) => {
      try {
        const result = await productionLLMOrchestrator.fixWorkflow({
          graph: req.body.graph,
          errors: req.body.errors,
          userId: req.user!.id
        });

        // Record usage
        if (result.tokensUsed) {
          await usageMeteringService.recordApiUsage(
            req.user!.id,
            1,
            result.tokensUsed,
            result.cost || 0
          );
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  // ===== GRAPH COMPILER ROUTES =====

  app.post('/api/workflow/compile',
    authenticateToken,
    checkQuota(1),
    securityService.validateInput([
      { field: 'graph', type: 'json', required: true }
    ]),
    async (req, res) => {
      try {
        const result = productionGraphCompiler.compile(req.body.graph, req.body.options || {});
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  // ===== DEPLOYMENT ROUTES =====

  app.post('/api/workflow/deploy',
    authenticateToken,
    proOrHigher, // Deployment requires Pro plan or higher
    checkQuota(1),
    securityService.validateInput([
      { field: 'files', type: 'array', required: true }
    ]),
    async (req, res) => {
      try {
        const result = await productionDeployer.deploy(req.body.files, req.body.options || {});
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.get('/api/deployment/prerequisites', authenticateToken, async (req, res) => {
    try {
      const result = await productionDeployer.validatePrerequisites();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // ===== CONNECTOR FRAMEWORK ROUTES =====

  app.get('/api/connectors', optionalAuth, async (req, res) => {
    try {
      const { search, category, limit } = req.query;
      const connectors = await connectorFramework.searchConnectors(
        search as string,
        category as string,
        parseInt(limit as string) || 50
      );
      res.json({ success: true, connectors });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/connectors/categories', async (req, res) => {
    try {
      const categories = await connectorFramework.getCategories();
      res.json({ success: true, categories });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/connectors/:slug', async (req, res) => {
    try {
      const connector = await connectorFramework.getConnector(req.params.slug);
      if (!connector) {
        return res.status(404).json({ success: false, error: 'Connector not found' });
      }
      res.json({ success: true, connector });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // ===== USAGE & BILLING ROUTES =====

  app.get('/api/usage', authenticateToken, async (req, res) => {
    try {
      const usage = await usageMeteringService.getUserUsage(req.user!.id);
      res.json({ success: true, usage });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/usage/quota', authenticateToken, async (req, res) => {
    try {
      const quota = await usageMeteringService.checkQuota(req.user!.id);
      res.json({ success: true, quota });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/plans', async (req, res) => {
    try {
      const plans = usageMeteringService.getAvailablePlans();
      res.json({ success: true, plans });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.post('/api/upgrade',
    authenticateToken,
    securityService.validateInput([
      { field: 'plan', type: 'string', required: true, allowedValues: ['free', 'pro', 'enterprise'] }
    ]),
    async (req, res) => {
      try {
        await usageMeteringService.upgradeUserPlan(req.user!.id, req.body.plan);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  // ===== HEALTH & MONITORING ROUTES =====

  app.get('/api/health', async (req, res) => {
    try {
      const health = await healthMonitoringService.getSystemHealth();
      res.json({ success: true, ...health });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/health/metrics', authenticateToken, adminOnly, async (req, res) => {
    try {
      const metrics = healthMonitoringService.getSystemMetrics();
      res.json({ success: true, metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/health/alerts', authenticateToken, adminOnly, async (req, res) => {
    try {
      const alerts = healthMonitoringService.getActiveAlerts();
      res.json({ success: true, alerts });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.post('/api/health/alerts/:id/resolve', authenticateToken, adminOnly, async (req, res) => {
    try {
      const resolved = healthMonitoringService.resolveAlert(req.params.id);
      res.json({ success: resolved });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // ===== SECURITY ROUTES =====

  app.get('/api/security/events', authenticateToken, adminOnly, async (req, res) => {
    try {
      const events = securityService.getSecurityEvents(parseInt(req.query.limit as string) || 100);
      res.json({ success: true, events });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.get('/api/security/stats', authenticateToken, adminOnly, async (req, res) => {
    try {
      const stats = securityService.getSecurityStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  app.post('/api/security/block-ip',
    authenticateToken,
    adminOnly,
    securityService.validateInput([
      { field: 'ipAddress', type: 'string', required: true },
      { field: 'reason', type: 'string', required: true, maxLength: 500, sanitize: true }
    ]),
    async (req, res) => {
      try {
        securityService.blockIP(req.body.ipAddress, req.body.reason);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.post('/api/security/unblock-ip',
    authenticateToken,
    adminOnly,
    securityService.validateInput([
      { field: 'ipAddress', type: 'string', required: true }
    ]),
    async (req, res) => {
      try {
        securityService.unblockIP(req.body.ipAddress);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  // ===== ADMIN ANALYTICS ROUTES =====

  app.get('/api/admin/analytics',
    authenticateToken,
    adminOnly,
    async (req, res) => {
      try {
        const { startDate, endDate } = req.query;
        const analytics = await usageMeteringService.getUsageAnalytics(
          new Date(startDate as string),
          new Date(endDate as string)
        );
        res.json({ success: true, analytics });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  app.get('/api/admin/reports',
    authenticateToken,
    adminOnly,
    async (req, res) => {
      try {
        const healthReport = healthMonitoringService.generateHealthReport();
        const securityReport = securityService.generateSecurityReport();
        
        res.json({
          success: true,
          reports: {
            health: healthReport,
            security: securityReport
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  // ===== LEGACY AI CONVERSATION API (for backward compatibility) =====

  app.post('/api/ai/conversation', 
    authenticateToken,
    checkQuota(1, 500),
    async (req, res) => {
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

        // Record usage
        await usageMeteringService.recordApiUsage(
          req.user!.id,
          1,
          aiResponse.tokensUsed || 0,
          aiResponse.cost || 0
        );

        console.log(`✅ REAL AI Response: ${aiResponse.model}, ${aiResponse.tokensUsed} tokens, $${aiResponse.cost.toFixed(4)}`);

        res.json({
          ...aiResponse,
          conversationHistory: ConversationManager.getConversation(userId)
        });

      } catch (error) {
        console.error('❌ Real AI conversation error:', error);
        res.status(500).json({ 
          error: getErrorMessage(error) || 'Failed to process AI request',
          model: req.body.model || 'unknown'
        });
      }
    }
  );

  // Clear conversation history
  app.delete('/api/ai/conversation/:userId', authenticateToken, (req, res) => {
    const { userId } = req.params;
    ConversationManager.clearConversation(userId);
    res.json({ success: true });
  });

  // ===== AUTOMATION MANAGEMENT ROUTES =====

  app.get('/api/automations', authenticateToken, async (req, res) => {
    // TODO: Get saved automations from storage
    res.json({ automations: [] });
  });

  app.post('/api/automations', 
    authenticateToken,
    checkQuota(1),
    securityService.validateInput([
      { field: 'name', type: 'string', required: true, maxLength: 255, sanitize: true },
      { field: 'nodes', type: 'array', required: true },
      { field: 'edges', type: 'array', required: true }
    ]),
    async (req, res) => {
      try {
        // TODO: Save automation to storage
        const { name, nodes, edges } = req.body;
        
        // Record workflow creation
        await usageMeteringService.recordWorkflowExecution(
          req.user!.id,
          `workflow_${Date.now()}`,
          true
        );
        
        res.json({ success: true, id: Date.now().toString() });
      } catch (error) {
        res.status(500).json({ success: false, error: getErrorMessage(error) });
      }
    }
  );

  // Add LLM Health endpoint using actual user API keys
  app.get('/api/llm/health', authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Get all LLM connections for this user
      const connections = await connectionService.getUserConnections(userId);
      const llmConnections = connections.filter(conn => 
        ['gemini', 'openai', 'claude', 'anthropic'].includes(conn.provider.toLowerCase())
      );

      const healthResults: {
        timestamp: string;
        userId: string;
        results: Record<string, any>;
        overall: string;
        summary?: any;
      } = {
        timestamp: new Date().toISOString(),
        userId: userId,
        results: {},
        overall: 'unknown'
      };

      let healthyCount = 0;
      let totalCount = 0;

      // Test each LLM provider
      for (const connection of llmConnections) {
        totalCount++;
        const provider = connection.provider.toLowerCase();
        
        try {
          console.log(`🔍 Testing ${provider} connection for user ${userId}...`);
          
          let testResult;
          const decryptedCredentials = await connectionService.getConnection(connection.id, userId);
          if (!decryptedCredentials) {
            throw new Error('Failed to decrypt credentials');
          }
          const apiKey = decryptedCredentials.credentials.apiKey || decryptedCredentials.credentials.token;

          switch (provider) {
            case 'gemini':
              testResult = await testGeminiConnection(apiKey);
              break;
            case 'openai':
              testResult = await testOpenAIConnection(apiKey);
              break;
            case 'claude':
            case 'anthropic':
              testResult = await testClaudeConnection(apiKey);
              break;
            default:
              testResult = { ok: false, error: 'Unknown provider' };
          }

          if (testResult.ok) {
            healthyCount++;
          }

          healthResults.results[provider] = {
            ok: testResult.ok,
            message: testResult.message || (testResult.ok ? 'Connection successful' : 'Connection failed'),
            responseTime: testResult.responseTime || 0,
            lastTested: new Date().toISOString(),
            connectionName: connection.name,
            error: testResult.error || null
          };

          // Record usage for this API test
          await usageMeteringService.recordApiUsage(userId, 1, 0, 0);

        } catch (error) {
          console.error(`❌ LLM health check failed for ${provider}:`, error);
          healthResults.results[provider] = {
            ok: false,
            message: 'Health check failed',
            error: getErrorMessage(error),
            lastTested: new Date().toISOString(),
            connectionName: connection.name
          };
        }
      }

      // Determine overall health
      if (totalCount === 0) {
        healthResults.overall = 'no_connections';
      } else if (healthyCount === totalCount) {
        healthResults.overall = 'healthy';
      } else if (healthyCount > 0) {
        healthResults.overall = 'partial';
      } else {
        healthResults.overall = 'unhealthy';
      }

      healthResults.summary = {
        total: totalCount,
        healthy: healthyCount,
        unhealthy: totalCount - healthyCount,
        healthPercentage: totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 0
      };

      res.json(healthResults);

    } catch (error) {
      console.error('❌ LLM health endpoint error:', error);
      res.status(500).json({
        error: 'Health check failed',
        message: getErrorMessage(error),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Helper functions for testing each LLM provider
  async function testGeminiConnection(apiKey: string): Promise<{ok: boolean, message?: string, responseTime?: number, error?: string}> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Reply with exactly: OK'
            }]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 10
          }
        })
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          ok: false,
          error: `HTTP ${response.status}: ${errorText}`,
          responseTime
        };
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      return {
        ok: true,
        message: `Gemini API responding correctly (${responseTime}ms)`,
        responseTime
      };

    } catch (error) {
      return {
        ok: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  async function testOpenAIConnection(apiKey: string): Promise<{ok: boolean, message?: string, responseTime?: number, error?: string}> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-2024-07-18',
          messages: [
            { role: 'user', content: 'Reply with exactly: OK' }
          ],
          max_tokens: 10,
          temperature: 0
        })
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          ok: false,
          error: `HTTP ${response.status}: ${errorText}`,
          responseTime
        };
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content || '';
      
      return {
        ok: true,
        message: `OpenAI API responding correctly (${responseTime}ms)`,
        responseTime
      };

    } catch (error) {
      return {
        ok: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  async function testClaudeConnection(apiKey: string): Promise<{ok: boolean, message?: string, responseTime?: number, error?: string}> {
    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 10,
          system: 'You are a test bot.',
          messages: [
            { role: 'user', content: 'Reply with exactly: OK' }
          ]
        })
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        return {
          ok: false,
          error: `HTTP ${response.status}: ${errorText}`,
          responseTime
        };
      }

      const data = await response.json();
      const responseText = data.content?.[0]?.text || '';
      
      return {
        ok: true,
        message: `Claude API responding correctly (${responseTime}ms)`,
        responseTime
      };

    } catch (error) {
      return {
        ok: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  const httpServer = createServer(app);

  return httpServer;
}
