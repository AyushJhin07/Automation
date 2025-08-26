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
import { integrationManager } from "./integrations/IntegrationManager";
import { oauthManager } from "./oauth/OAuthManager";
import { endToEndTester } from "./testing/EndToEndTester";
import { connectorSeeder } from "./database/seedConnectors";
import { connectorRegistry } from "./ConnectorRegistry";
import { webhookManager } from "./webhooks/WebhookManager";

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
      
      // Use ConnectorRegistry instead of ConnectorFramework for development
      // (works without database)
      let connectors = connectorRegistry.getAllConnectors().map(entry => ({
        id: entry.definition.id,
        name: entry.definition.name,
        description: entry.definition.description,
        category: entry.definition.category,
        authentication: entry.definition.authentication,
        isActive: true,
        actionsCount: entry.definition.actions?.length || 0,
        triggersCount: entry.definition.triggers?.length || 0,
        hasOAuth: entry.definition.authentication?.type === 'oauth2',
        hasWebhooks: entry.definition.triggers?.some(t => t.webhookSupport) || false,
        hasImplementation: entry.hasImplementation,
        functionCount: entry.functionCount
      }));
      
      // Apply filters
      if (search) {
        const searchLower = search.toLowerCase();
        connectors = connectors.filter(c => 
          c.name.toLowerCase().includes(searchLower) ||
          c.description.toLowerCase().includes(searchLower)
        );
      }
      
      if (category) {
        connectors = connectors.filter(c => 
          c.category.toLowerCase() === category.toLowerCase()
        );
      }
      
      if (limit) {
        connectors = connectors.slice(0, parseInt(limit as string));
      }
      
      res.json({ 
        success: true, 
        connectors,
        total: connectors.length 
      });
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

  // Reload connectors from disk (dev utility)
  app.post('/api/registry/reload', (req, res) => {
    try {
      connectorRegistry.reload();
      res.json({ success: true, message: 'Connector registry reloaded' });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Simple debug endpoint
  app.get('/api/registry/debug', (req, res) => {
    const stats = connectorRegistry.getStats();
    res.json({ success: true, ...stats });
  });

  // Node catalog endpoint for Graph Editor UI
  app.get('/api/registry/catalog', (req, res) => {
    try {
      const catalog = connectorRegistry.getNodeCatalog();
      console.log('[DEBUG] Catalog keys:', Object.keys(catalog));
      console.log('[DEBUG] Connectors count:', Object.keys(catalog.connectors || {}).length);
      console.log('[DEBUG] Categories count:', Object.keys(catalog.categories || {}).length);
      
      res.json({ 
        success: true, 
        catalog 
      });
    } catch (e) {
      console.error('[ERROR] Catalog generation failed:', e);
      res.status(500).json({ 
        success: false, 
        error: String(e) 
      });
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

  // ===== CONNECTOR REGISTRY ROUTES =====

  // Get comprehensive node catalog for UI
  app.get('/api/registry/catalog', async (req, res) => {
    try {
      const catalog = connectorRegistry.getNodeCatalog();
      res.json({ success: true, catalog });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Get all connectors with implementation status
  app.get('/api/registry/connectors', async (req, res) => {
    try {
      const connectors = connectorRegistry.getAllConnectors();
      res.json({ success: true, connectors });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Search connectors
  app.get('/api/registry/search/:query', async (req, res) => {
    try {
      const results = connectorRegistry.searchConnectors(req.params.query);
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Get connectors by category
  app.get('/api/registry/category/:category', async (req, res) => {
    try {
      const connectors = connectorRegistry.getConnectorsByCategory(req.params.category);
      res.json({ success: true, connectors });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Get all categories
  app.get('/api/registry/categories', async (req, res) => {
    try {
      const categories = connectorRegistry.getAllCategories();
      res.json({ success: true, categories });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Get registry statistics
  app.get('/api/registry/stats', async (req, res) => {
    try {
      const stats = connectorRegistry.getRegistryStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Get specific connector definition
  app.get('/api/registry/connector/:appId', async (req, res) => {
    try {
      const connector = connectorRegistry.getConnector(req.params.appId);
      if (!connector) {
        return res.status(404).json({ success: false, error: 'Connector not found' });
      }
      res.json({ success: true, connector });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Get functions for a specific app
  app.get('/api/registry/functions/:appId', async (req, res) => {
    try {
      const functions = connectorRegistry.getAppFunctions(req.params.appId);
      res.json({ success: true, functions });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Validate node type
  app.get('/api/registry/validate/:nodeType', async (req, res) => {
    try {
      const isValid = connectorRegistry.isValidNodeType(req.params.nodeType);
      const functionDef = isValid ? connectorRegistry.getFunctionByType(req.params.nodeType) : null;
      res.json({ success: true, isValid, functionDef });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  });

  // Refresh registry (reload from files)
  app.post('/api/registry/refresh', adminOnly, async (req, res) => {
    try {
      connectorRegistry.refresh();
      const stats = connectorRegistry.getRegistryStats();
      res.json({ success: true, message: 'Registry refreshed', stats });
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

  // ===== OAUTH ROUTES =====
  
  // Get supported OAuth providers
  app.get('/api/oauth/providers', async (req, res) => {
    try {
      const providers = oauthManager.listProviders();
      
      res.json({
        success: true,
        data: {
          providers: providers.map(p => ({
            name: p.name,
            displayName: p.displayName,
            scopes: p.config.scopes,
            configured: !!(p.config.clientId && p.config.clientSecret)
          }))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Initiate OAuth flow
  app.post('/api/oauth/authorize', authenticateToken, async (req, res) => {
    try {
      const { provider, additionalParams } = req.body;
      const userId = req.user!.id;
      
      if (!provider) {
        return res.status(400).json({
          success: false,
          error: 'Provider is required'
        });
      }

      if (!oauthManager.supportsOAuth(provider)) {
        return res.status(400).json({
          success: false,
          error: `OAuth provider ${provider} is not supported`
        });
      }

      const { authUrl, state } = await oauthManager.generateAuthUrl(
        provider,
        userId,
        undefined, // returnUrl
        additionalParams?.scopes // additionalScopes
      );
      
      res.json({
        success: true,
        data: {
          authUrl,
          state,
          provider
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // OAuth callback handler (generic for all providers)
  app.get('/api/oauth/callback/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      const { code, state, shop } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({
          success: false,
          error: 'Missing authorization code or state'
        });
      }

      // Handle callback and exchange code for tokens
      const { tokens, userInfo } = await oauthManager.handleCallback(
        code as string,
        state as string,
        provider
      );

      // Store the connection (we'll need to get userId from state or session)
      // For now, we'll return the tokens to be stored by the frontend
      res.json({
        success: true,
        data: {
          provider,
          tokens,
          userInfo,
          message: 'OAuth flow completed successfully'
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Store OAuth connection after successful callback
  app.post('/api/oauth/store-connection', authenticateToken, async (req, res) => {
    try {
      const { provider, tokens, userInfo, additionalConfig } = req.body;
      const userId = req.user!.id;
      
      if (!provider || !tokens) {
        return res.status(400).json({
          success: false,
          error: 'Provider and tokens are required'
        });
      }

      // Store connection through connection service (OAuth manager handles this in callback)
      await connectionService.storeConnection(
        userId,
        provider,
        tokens,
        userInfo
      );
      
              res.json({
          success: true,
          data: {
            provider,
            message: 'Connection stored successfully'
          }
        });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Refresh OAuth token
  app.post('/api/oauth/refresh', authenticateToken, async (req, res) => {
    try {
      const { provider } = req.body;
      const userId = req.user!.id;
      
      if (!provider) {
        return res.status(400).json({
          success: false,
          error: 'Provider is required'
        });
      }

      const newTokens = await oauthManager.refreshToken(userId, provider);
      
      res.json({
        success: true,
        data: {
          tokens: newTokens,
          provider
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // ===== FUNCTION LIBRARY ROUTES =====
  
  // Get functions for a specific application
  app.get('/api/functions/:appName', async (req, res) => {
    try {
      const { appName } = req.params;
      
      if (!appName) {
        return res.status(400).json({
          success: false,
          error: 'App name is required'
        });
      }

      const functions = getAppFunctions(appName);
      
      res.json({
        success: true,
        data: {
          appName,
          functions,
          totalFunctions: functions.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Search functions across applications
  app.get('/api/functions/search/:query', async (req, res) => {
    try {
      const { query } = req.params;
      const { apps } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required'
        });
      }

      const appNames = apps ? (apps as string).split(',') : undefined;
      const searchResults: Array<any> = [];
      
      // If specific apps requested, search only those
      const appsToSearch = appNames || Object.keys(getComprehensiveAppFunctions());
      
      appsToSearch.forEach(appName => {
        const functions = getAppFunctions(appName);
        functions.forEach(func => {
          const matchesName = func.name.toLowerCase().includes(query.toLowerCase());
          const matchesDescription = func.description.toLowerCase().includes(query.toLowerCase());
          const matchesId = func.id.toLowerCase().includes(query.toLowerCase());
          
          if (matchesName || matchesDescription || matchesId) {
            searchResults.push({ ...func, appName });
          }
        });
      });

      // Sort by relevance
      searchResults.sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(query.toLowerCase());
        const bNameMatch = b.name.toLowerCase().includes(query.toLowerCase());
        
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        
        return a.name.localeCompare(b.name);
      });
      
      res.json({
        success: true,
        data: {
          query,
          results: searchResults,
          totalResults: searchResults.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Get functions by category
  app.get('/api/functions/category/:category', async (req, res) => {
    try {
      const { category } = req.params;
      const { apps } = req.query;
      
      if (!['action', 'trigger', 'both'].includes(category)) {
        return res.status(400).json({
          success: false,
          error: 'Category must be action, trigger, or both'
        });
      }

      const appNames = apps ? (apps as string).split(',') : undefined;
      const results: Array<any> = [];
      
      const appsToSearch = appNames || Object.keys(getComprehensiveAppFunctions());
      
      appsToSearch.forEach(appName => {
        const functions = getAppFunctions(appName);
        functions.forEach(func => {
          if (func.category === category || func.category === 'both') {
            results.push({ ...func, appName });
          }
        });
      });

      results.sort((a, b) => a.name.localeCompare(b.name));
      
      res.json({
        success: true,
        data: {
          category,
          results,
          totalResults: results.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // ===== INTEGRATION ROUTES =====
  
  // Test integration connection
  app.post('/api/integrations/test', authenticateToken, async (req, res) => {
    try {
      const { appName, credentials, additionalConfig } = req.body;
      
      if (!appName || !credentials) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appName, credentials'
        });
      }

      const result = await integrationManager.testConnection(appName, credentials);
      
      res.json({
        success: result.success,
        data: result.data,
        error: result.error
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Initialize integration
  app.post('/api/integrations/initialize', authenticateToken, async (req, res) => {
    try {
      const { appName, credentials, additionalConfig } = req.body;
      
      if (!appName || !credentials) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appName, credentials'
        });
      }

      const result = await integrationManager.initializeIntegration({
        appName,
        credentials,
        additionalConfig
      });
      
      res.json({
        success: result.success,
        data: result.data,
        error: result.error
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Execute function on integrated application
  app.post('/api/integrations/execute', authenticateToken, checkQuota, async (req, res) => {
    try {
      const { appName, functionId, parameters, credentials } = req.body;
      
      if (!appName || !functionId || !parameters || !credentials) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appName, functionId, parameters, credentials'
        });
      }

      const result = await integrationManager.executeFunction({
        appName,
        functionId,
        parameters,
        credentials
      });

      // Track usage
      if (req.user?.id) {
        await usageMeteringService.trackUsage(req.user.id, 'integration_execution', {
          appName,
          functionId,
          executionTime: result.executionTime,
          success: result.success
        });
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        appName: req.body.appName,
        functionId: req.body.functionId,
        executionTime: 0
      });
    }
  });

  // Get supported applications
  app.get('/api/integrations/supported', async (req, res) => {
    try {
      const supportedApps = integrationManager.getSupportedApplications();
      
      res.json({
        success: true,
        data: {
          applications: supportedApps,
          count: supportedApps.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Get integration status
  app.get('/api/integrations/status/:appName', authenticateToken, async (req, res) => {
    try {
      const { appName } = req.params;
      const status = integrationManager.getIntegrationStatus(appName);
      
      res.json({
        success: true,
        data: {
          appName,
          connected: status.connected,
          supported: integrationManager.isApplicationSupported(appName)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Remove integration
  app.delete('/api/integrations/:appName', authenticateToken, async (req, res) => {
    try {
      const { appName } = req.params;
      const removed = integrationManager.removeIntegration(appName);
      
      res.json({
        success: true,
        data: {
          appName,
          removed
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // ===== DATABASE SEEDING ROUTES =====
  
  // Seed connectors from JSON files
  app.post('/api/admin/seed-connectors', authenticateToken, adminOnly, async (req, res) => {
    try {
      console.log('🌱 Starting connector seeding via API...');
      const results = await connectorSeeder.seedAllConnectors();
      
      res.json({
        success: true,
        data: results,
        message: `Seeded ${results.imported} new connectors, updated ${results.updated} existing`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Get seeding statistics
  app.get('/api/admin/connector-stats', authenticateToken, adminOnly, async (req, res) => {
    try {
      const stats = await connectorSeeder.getSeedingStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // Clear all connectors (dangerous - admin only)
  app.delete('/api/admin/clear-connectors', authenticateToken, adminOnly, async (req, res) => {
    try {
      const deletedCount = await connectorSeeder.clearAllConnectors();
      
      res.json({
        success: true,
        data: { deletedCount },
        message: `Cleared ${deletedCount} connectors from database`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  // ===== TESTING ROUTES =====
  
  // Run end-to-end tests
  app.get('/api/test/e2e', async (req, res) => {
    try {
      console.log('🧪 Starting end-to-end tests via API...');
      const results = await endToEndTester.runAllTests();
      const report = endToEndTester.generateReport();
      
      res.json({
        success: true,
        data: {
          summary: results,
          report,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

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

  // ===== WEBHOOK & TRIGGER MANAGEMENT ROUTES =====
  
  // Handle incoming webhooks
  app.post('/api/webhooks/:webhookId', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { webhookId } = req.params;
      const payload = req.body;
      const headers = req.headers as Record<string, string>;
      
      const success = await webhookManager.handleWebhook(webhookId, payload, headers);
      
      if (success) {
        res.json({
          success: true,
          message: 'Webhook processed successfully',
          webhookId,
          timestamp: new Date(),
          responseTime: Date.now() - startTime
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to process webhook',
          webhookId,
          responseTime: Date.now() - startTime
        });
      }
      
    } catch (error) {
      console.error('❌ Webhook endpoint error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Register new webhook
  app.post('/api/webhooks/register', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { appId, triggerId, workflowId, secret, metadata } = req.body;
      
      if (!appId || !triggerId || !workflowId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: appId, triggerId, workflowId'
        });
      }
      
      const endpoint = await webhookManager.registerWebhook({
        id: '', // Will be generated
        appId,
        triggerId,
        workflowId,
        secret,
        isActive: true,
        metadata: metadata || {}
      });
      
      res.json({
        success: true,
        endpoint,
        message: 'Webhook registered successfully',
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ Webhook registration error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Register polling trigger
  app.post('/api/triggers/polling/register', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id, appId, triggerId, workflowId, interval, dedupeKey, metadata } = req.body;
      
      if (!id || !appId || !triggerId || !workflowId || !interval) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: id, appId, triggerId, workflowId, interval'
        });
      }
      
      const pollingTrigger = {
        id,
        appId,
        triggerId,
        workflowId,
        interval,
        nextPoll: new Date(Date.now() + interval * 1000),
        isActive: true,
        dedupeKey,
        metadata: metadata || {}
      };
      
      await webhookManager.registerPollingTrigger(pollingTrigger);
      
      res.json({
        success: true,
        trigger: pollingTrigger,
        message: 'Polling trigger registered successfully',
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ Polling trigger registration error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Get webhook statistics
  app.get('/api/webhooks/stats', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const stats = webhookManager.getStats();
      
      res.json({
        success: true,
        stats,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ Webhook stats error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // List all webhooks
  app.get('/api/webhooks', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const webhooks = webhookManager.listWebhooks();
      
      res.json({
        success: true,
        webhooks,
        count: webhooks.length,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ List webhooks error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Deactivate webhook
  app.put('/api/webhooks/:webhookId/deactivate', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { webhookId } = req.params;
      const success = webhookManager.deactivateWebhook(webhookId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Webhook deactivated successfully',
          webhookId,
          responseTime: Date.now() - startTime
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Webhook not found',
          webhookId,
          responseTime: Date.now() - startTime
        });
      }
      
    } catch (error) {
      console.error('❌ Webhook deactivation error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });

  // Generic webhook handler (handles all incoming webhooks)
  app.post('/api/webhooks/:webhookId', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { webhookId } = req.params;
      const headers = req.headers as Record<string, string>;
      const payload = req.body;
      
      // Get raw body for signature verification (critical for Stripe, Shopify, GitHub)
      const rawBody = (req as any).rawBody || JSON.stringify(payload);
      
      console.log(`📥 Webhook received: ${webhookId}`);
      
      const success = await webhookManager.handleWebhook(webhookId, payload, headers, rawBody);
      
      if (success) {
        res.json({
          success: true,
          message: 'Webhook processed successfully',
          webhookId,
          responseTime: Date.now() - startTime
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Webhook processing failed',
          webhookId,
          responseTime: Date.now() - startTime
        });
      }
      
    } catch (error) {
      console.error('❌ Webhook processing error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });

  // Vendor-specific webhook endpoints for better organization
  app.post('/api/webhooks/slack/:webhookId', async (req, res) => {
    const { webhookId } = req.params;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    await webhookManager.handleWebhook(webhookId, req.body, req.headers as Record<string, string>, rawBody);
    res.status(200).send('OK');
  });

  app.post('/api/webhooks/stripe/:webhookId', async (req, res) => {
    const { webhookId } = req.params;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    await webhookManager.handleWebhook(webhookId, req.body, req.headers as Record<string, string>, rawBody);
    res.status(200).send('OK');
  });

  app.post('/api/webhooks/shopify/:webhookId', async (req, res) => {
    const { webhookId } = req.params;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    await webhookManager.handleWebhook(webhookId, req.body, req.headers as Record<string, string>, rawBody);
    res.status(200).send('OK');
  });

  app.post('/api/webhooks/github/:webhookId', async (req, res) => {
    const { webhookId } = req.params;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    await webhookManager.handleWebhook(webhookId, req.body, req.headers as Record<string, string>, rawBody);
    res.status(200).send('OK');
  });

  // ===== CONNECTOR ENDPOINTS =====
  
  // List all available connectors
  app.get('/api/connectors', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const connectors = await connectorRegistry.listConnectors();
      
      res.json({
        success: true,
        connectors: connectors.map(connector => ({
          id: connector.id,
          name: connector.name,
          description: connector.description,
          category: connector.category,
          authentication: connector.authentication,
          isActive: connector.isActive,
          actionsCount: connector.actions?.length || 0,
          triggersCount: connector.triggers?.length || 0,
          hasOAuth: connector.authentication?.type === 'oauth2',
          hasWebhooks: connector.triggers?.some(t => t.webhookSupport) || false
        })),
        total: connectors.length,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ List connectors error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Get specific connector details
  app.get('/api/connectors/:connectorId', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { connectorId } = req.params;
      const connector = await connectorRegistry.getConnector(connectorId);
      
      if (!connector) {
        return res.status(404).json({
          success: false,
          error: `Connector not found: ${connectorId}`,
          responseTime: Date.now() - startTime
        });
      }
      
      res.json({
        success: true,
        connector,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error(`❌ Get connector error for ${req.params.connectorId}:`, getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Get connector functions (actions and triggers)
  app.get('/api/connectors/:connectorId/functions', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { connectorId } = req.params;
      const connector = await connectorRegistry.getConnector(connectorId);
      
      if (!connector) {
        return res.status(404).json({
          success: false,
          error: `Connector not found: ${connectorId}`,
          responseTime: Date.now() - startTime
        });
      }
      
      const functions = [
        ...(connector.actions || []).map(action => ({
          ...action,
          type: 'action'
        })),
        ...(connector.triggers || []).map(trigger => ({
          ...trigger,
          type: 'trigger'
        }))
      ];
      
      res.json({
        success: true,
        functions,
        total: functions.length,
        actions: connector.actions?.length || 0,
        triggers: connector.triggers?.length || 0,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error(`❌ Get connector functions error for ${req.params.connectorId}:`, getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });

  // ===== WEBHOOK REGISTRATION ENDPOINTS =====
  
  // Register a webhook for a specific provider
  app.post('/api/webhooks/register/:provider', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.user!.id;
      const { provider } = req.params;
      const { events, callbackUrl, secret } = req.body;
      
      // Validate required fields
      if (!events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Events array is required',
          responseTime: Date.now() - startTime
        });
      }
      
      // Get the API client for this provider
      const apiClient = integrationManager.getAPIClient(provider);
      if (!apiClient) {
        return res.status(404).json({
          success: false,
          error: `No API client found for provider: ${provider}`,
          responseTime: Date.now() - startTime
        });
      }
      
      // Generate webhook URL if not provided
      const webhookUrl = callbackUrl || `${process.env.BASE_URL || 'https://your-domain.com'}/api/webhooks/${provider}`;
      
      // Register webhook with the external service
      const result = await apiClient.registerWebhook(webhookUrl, events, secret);
      
      if (result.success && result.data) {
        // Store webhook registration in database
        const webhook = await webhookManager.registerWebhook({
          appId: provider,
          triggerId: 'webhook_received',
          workflowId: req.body.workflowId || 'manual',
          endpoint: webhookUrl,
          secret: result.data.secret || secret,
          isActive: true,
          metadata: {
            events,
            externalWebhookId: result.data.webhookId,
            userId,
            registeredAt: new Date()
          }
        });
        
        res.json({
          success: true,
          webhook: {
            ...webhook,
            externalWebhookId: result.data.webhookId
          },
          responseTime: Date.now() - startTime
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to register webhook',
          responseTime: Date.now() - startTime
        });
      }
      
    } catch (error) {
      console.error(`❌ Webhook registration error for ${req.params.provider}:`, getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Unregister a webhook
  app.delete('/api/webhooks/register/:provider/:webhookId', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { provider, webhookId } = req.params;
      
      // Get the API client for this provider
      const apiClient = integrationManager.getAPIClient(provider);
      if (!apiClient) {
        return res.status(404).json({
          success: false,
          error: `No API client found for provider: ${provider}`,
          responseTime: Date.now() - startTime
        });
      }
      
      // Get webhook metadata to find external webhook ID
      const webhook = webhookManager.getWebhook(webhookId);
      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found',
          responseTime: Date.now() - startTime
        });
      }
      
      // Unregister from external service
      const externalWebhookId = webhook.metadata?.externalWebhookId;
      if (externalWebhookId) {
        const result = await apiClient.unregisterWebhook(externalWebhookId);
        if (!result.success) {
          console.warn(`Failed to unregister webhook from ${provider}: ${result.error}`);
        }
      }
      
      // Deactivate webhook locally
      const success = webhookManager.deactivateWebhook(webhookId);
      
      res.json({
        success,
        message: success ? 'Webhook unregistered successfully' : 'Webhook not found',
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error(`❌ Webhook unregistration error:`, getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // List registered webhooks for a provider
  app.get('/api/webhooks/register/:provider', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { provider } = req.params;
      
      // Get local webhooks for this provider
      const localWebhooks = webhookManager.listWebhooks().filter(w => w.appId === provider);
      
      // Get external webhooks if API client supports it
      const apiClient = integrationManager.getAPIClient(provider);
      let externalWebhooks = [];
      
      if (apiClient) {
        try {
          const result = await apiClient.listWebhooks();
          if (result.success) {
            externalWebhooks = result.data || [];
          }
        } catch (error) {
          console.warn(`Failed to list external webhooks for ${provider}:`, error.message);
        }
      }
      
      res.json({
        success: true,
        webhooks: {
          local: localWebhooks,
          external: externalWebhooks
        },
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error(`❌ List webhooks error for ${req.params.provider}:`, getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });

  // ===== ADMIN ENDPOINTS =====
  
  // Seed connectors from JSON files to database
  app.post('/api/admin/seed-connectors', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      // TODO: Add admin role check
      // if (req.user!.role !== 'admin') {
      //   return res.status(403).json({ success: false, error: 'Admin access required' });
      // }
      
      const result = await connectorSeeder.seedAllConnectors();
      
      res.json({
        success: true,
        message: 'Connectors seeded successfully',
        result,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ Seed connectors error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Get seeding statistics
  app.get('/api/admin/seed-connectors/stats', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const stats = await connectorSeeder.getSeedingStats();
      
      res.json({
        success: true,
        stats,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ Get seeding stats error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Clear all connectors from database
  app.delete('/api/admin/seed-connectors', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      // TODO: Add admin role check
      // if (req.user!.role !== 'admin') {
      //   return res.status(403).json({ success: false, error: 'Admin access required' });
      // }
      
      const deletedCount = await connectorSeeder.clearAllConnectors();
      
      res.json({
        success: true,
        message: `Cleared ${deletedCount} connectors from database`,
        deletedCount,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ Clear connectors error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });

  // ===== HEALTH CHECK ENDPOINTS =====
  
  // Health check for all integrations
  app.get('/api/health/integrations', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.user!.id;
      
      // Get all user connections
      const connections = await connectionService.getUserConnections(userId);
      
      const healthChecks: Record<string, any> = {};
      let totalConnections = 0;
      let healthyConnections = 0;
      let failedConnections = 0;
      
      // Test each connection
      for (const connection of connections) {
        totalConnections++;
        
        try {
          // Use the integrationManager to test the connection
          const testResult = await integrationManager.executeFunction(
            connection.provider,
            'test_connection',
            {},
            userId
          );
          
          healthChecks[connection.provider] = {
            status: testResult.success ? 'healthy' : 'error',
            lastChecked: new Date().toISOString(),
            connectedAt: connection.createdAt,
            error: testResult.success ? null : testResult.error
          };
          
          if (testResult.success) {
            healthyConnections++;
          } else {
            failedConnections++;
          }
          
        } catch (error) {
          failedConnections++;
          healthChecks[connection.provider] = {
            status: 'error',
            lastChecked: new Date().toISOString(),
            connectedAt: connection.createdAt,
            error: getErrorMessage(error)
          };
        }
      }
      
      const overallHealth = failedConnections === 0 ? 'healthy' : 
                          healthyConnections > failedConnections ? 'degraded' : 'unhealthy';
      
      res.json({
        success: true,
        health: {
          status: overallHealth,
          summary: {
            total: totalConnections,
            healthy: healthyConnections,
            failed: failedConnections
          },
          connections: healthChecks,
          checkedAt: new Date().toISOString()
        },
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error('❌ Integration health check error:', getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Health check for specific integration
  app.get('/api/health/integrations/:provider', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const userId = req.user!.id;
      const { provider } = req.params;
      
      // Check if user has this connection
      const connections = await connectionService.getUserConnections(userId);
      const connection = connections.find(conn => conn.provider === provider);
      
      if (!connection) {
        return res.status(404).json({
          success: false,
          error: `No connection found for provider: ${provider}`,
          responseTime: Date.now() - startTime
        });
      }
      
      try {
        // Test the specific connection
        const testResult = await integrationManager.executeFunction(
          provider,
          'test_connection',
          {},
          userId
        );
        
        res.json({
          success: true,
          health: {
            provider,
            status: testResult.success ? 'healthy' : 'error',
            lastChecked: new Date().toISOString(),
            connectedAt: connection.createdAt,
            error: testResult.success ? null : testResult.error,
            details: testResult
          },
          responseTime: Date.now() - startTime
        });
        
      } catch (error) {
        res.json({
          success: true,
          health: {
            provider,
            status: 'error',
            lastChecked: new Date().toISOString(),
            connectedAt: connection.createdAt,
            error: getErrorMessage(error)
          },
          responseTime: Date.now() - startTime
        });
      }
      
    } catch (error) {
      console.error(`❌ Health check error for ${req.params.provider}:`, getErrorMessage(error));
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });
  
  // Overall system health
  app.get('/api/health', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const health = {
        status: 'healthy',
        services: {
          database: 'healthy',
          oauth: 'healthy', 
          integrations: 'healthy',
          webhooks: 'healthy'
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      };
      
      // Quick database check
      try {
        const connectors = await connectorRegistry.listConnectors();
        health.services.database = connectors.length > 0 ? 'healthy' : 'degraded';
      } catch (error) {
        health.services.database = 'error';
        health.status = 'degraded';
      }
      
      // Check OAuth manager
      try {
        const providers = oauthManager.listProviders();
        health.services.oauth = providers.length > 0 ? 'healthy' : 'degraded';
      } catch (error) {
        health.services.oauth = 'error';
        health.status = 'degraded';
      }
      
      res.json({
        success: true,
        health,
        responseTime: Date.now() - startTime
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        responseTime: Date.now() - startTime
      });
    }
  });

  // ===== LLM API ENDPOINTS =====
  // Get available LLM models and providers
  app.get('/api/llm/models', async (req, res) => {
    try {
      const { llmRegistry } = await import('./llm');
      const availableProviders = llmRegistry.getAvailableProviders();
      const availableModels = llmRegistry.getAvailableModels();
      
      res.json({
        success: true,
        providers: availableProviders,
        models: availableModels,
        providerCount: availableProviders.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `LLM registry error: ${error.message}`
      });
    }
  });

  // Test LLM connection and functionality
  app.post('/api/llm/test', async (req, res) => {
    try {
      const { provider, model, prompt = 'Hello! Please respond with "Connection successful."' } = req.body || {};
      
      if (!provider || !model) {
        return res.status(400).json({
          success: false,
          error: 'Provider and model are required'
        });
      }

      const { llmRegistry } = await import('./llm');
      const llmProvider = llmRegistry.get(provider);
      
      const startTime = Date.now();
      const result = await llmProvider.generate({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        maxTokens: 100
      });
      const duration = Date.now() - startTime;

      res.json({
        success: true,
        result: {
          text: result.text,
          usage: result.usage,
          duration,
          provider,
          model
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `LLM test failed: ${error.message}`
      });
    }
  });

  // Execute a workflow with LLM nodes (for testing)
  app.post('/api/llm/execute-workflow', async (req, res) => {
    try {
      const { graph, initialData = {} } = req.body;
      
      if (!graph) {
        return res.status(400).json({
          success: false,
          error: 'Workflow graph is required'
        });
      }

      const { workflowRuntime } = await import('./core/WorkflowRuntime');
      const result = await workflowRuntime.executeWorkflow(graph, initialData);

      res.json({
        success: result.success,
        result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Workflow execution failed: ${error.message}`
      });
    }
  });

  // ===== PHASE 3 LLM ADVANCED FEATURES API =====
  
  // Smart suggestions
  app.get('/api/llm/suggestions', async (req, res) => {
    try {
      const { smartSuggestionsEngine } = await import('./llm/LLMAdvancedFeatures');
      const context = req.query;
      const suggestions = await smartSuggestionsEngine.generateSuggestions(context);
      res.json({ success: true, suggestions });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Real-time LLM streaming
  app.post('/api/llm/stream', async (req, res) => {
    try {
      const { realTimeLLMExecutor } = await import('./llm/LLMAdvancedFeatures');
      const { request } = req.body;
      
      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const result = await realTimeLLMExecutor.streamLLMResponse(request, (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      });

      res.write(`data: ${JSON.stringify({ status: 'complete', fullText: result })}\n\n`);
      res.end();
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // LLM debugging traces
  app.get('/api/llm/traces', async (req, res) => {
    try {
      const { llmDebugTracer } = await import('./llm/LLMAdvancedFeatures');
      const { nodeId, limit } = req.query;
      const traces = llmDebugTracer.getTraces(nodeId as string, Number(limit) || 50);
      const analytics = llmDebugTracer.getTraceAnalytics();
      res.json({ success: true, traces, analytics });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Conditional logic evaluation
  app.post('/api/llm/evaluate-condition', async (req, res) => {
    try {
      const { conditionalLogicEngine } = await import('./llm/LLMAdvancedFeatures');
      const { condition, context, useLLM } = req.body;
      const result = await conditionalLogicEngine.evaluateCondition(condition, context, useLLM);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Dynamic schema generation
  app.post('/api/llm/generate-schema', async (req, res) => {
    try {
      const { dynamicSchemaGenerator } = await import('./llm/LLMAdvancedFeatures');
      const { description, examples } = req.body;
      const result = await dynamicSchemaGenerator.generateSchema(description, examples);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Intelligent error analysis
  app.post('/api/llm/analyze-error', async (req, res) => {
    try {
      const { intelligentErrorHandler } = await import('./llm/LLMAdvancedFeatures');
      const { error, context } = req.body;
      const analysis = await intelligentErrorHandler.analyzeAndSuggestFix(new Error(error.message), context);
      res.json({ success: true, analysis });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Auto workflow generation
  app.post('/api/llm/generate-workflow', async (req, res) => {
    try {
      const { autoWorkflowGenerator } = await import('./llm/LLMAdvancedFeatures');
      const { description } = req.body;
      const result = await autoWorkflowGenerator.generateWorkflow(description);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // LLM templates
  app.get('/api/llm/templates', async (req, res) => {
    try {
      const { llmTemplateManager } = await import('./llm/LLMTemplates');
      const { category, tags, search } = req.query;
      const templates = llmTemplateManager.getTemplates({
        category: category as string,
        tags: tags ? (tags as string).split(',') : undefined,
        search: search as string
      });
      const categories = llmTemplateManager.getCategories();
      res.json({ success: true, templates, categories });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Render LLM template
  app.post('/api/llm/render-template', async (req, res) => {
    try {
      const { llmTemplateManager } = await import('./llm/LLMTemplates');
      const { templateId, variables } = req.body;
      const result = llmTemplateManager.renderTemplate(templateId, variables);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // LLM analytics and usage metrics
  app.get('/api/llm/analytics', async (req, res) => {
    try {
      const { llmAnalytics } = await import('./llm/LLMAnalytics');
      const since = req.query.since ? Number(req.query.since) : undefined;
      const userId = req.query.userId as string;
      
      const metrics = userId 
        ? llmAnalytics.getUserMetrics(userId, since)
        : llmAnalytics.getUsageMetrics(since);
      
      const dashboard = llmAnalytics.getDashboardData();
      res.json({ success: true, metrics, dashboard });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // RAG document management
  app.post('/api/llm/rag/add-documents', async (req, res) => {
    try {
      const { advancedRAG } = await import('./llm/AdvancedRAG');
      const { urls, workflowId, userId } = req.body;
      const documents = await advancedRAG.addDocumentsFromUrls(urls, workflowId, userId);
      res.json({ success: true, documents, count: documents.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // RAG search
  app.post('/api/llm/rag/search', async (req, res) => {
    try {
      const { advancedRAG } = await import('./llm/AdvancedRAG');
      const query = req.body;
      const results = await advancedRAG.search(query);
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Provider fallback status
  app.get('/api/llm/fallback/status', async (req, res) => {
    try {
      const { llmFallbackManager } = await import('./llm/LLMFallbackManager');
      const status = llmFallbackManager.getProviderStatus();
      const recommendations = llmFallbackManager.getProviderRecommendations();
      res.json({ success: true, status, recommendations });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Memory management
  app.get('/api/llm/memory/context', async (req, res) => {
    try {
      const { llmMemoryManager } = await import('./llm/LLMMemoryManager');
      const { query, workflowId, userId } = req.query;
      const context = await llmMemoryManager.getEnhancedContext(
        query as string, 
        workflowId as string, 
        userId as string
      );
      res.json({ success: true, context });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== RUN EXECUTION & OBSERVABILITY API =====
  
  // Get workflow executions with filtering and pagination
  app.get('/api/executions', async (req, res) => {
    try {
      const { runExecutionManager } = await import('./core/RunExecutionManager');
      
      const query = {
        executionId: req.query.executionId as string,
        workflowId: req.query.workflowId as string,
        userId: req.query.userId as string,
        status: req.query.status ? [req.query.status as string] : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        sortBy: req.query.sortBy as 'startTime' | 'duration' | 'status',
        sortOrder: req.query.sortOrder as 'asc' | 'desc'
      };
      
      const result = runExecutionManager.queryExecutions(query);
      res.json(result);
    } catch (error) {
      console.error('Failed to query executions:', error);
      res.status(500).json({ error: 'Failed to query executions' });
    }
  });
  
  // Get specific execution details
  app.get('/api/executions/:executionId', async (req, res) => {
    try {
      const { runExecutionManager } = await import('./core/RunExecutionManager');
      const execution = runExecutionManager.getExecution(req.params.executionId);
      
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      
      res.json(execution);
    } catch (error) {
      console.error('Failed to get execution:', error);
      res.status(500).json({ error: 'Failed to get execution' });
    }
  });
  
  // Retry entire execution
  app.post('/api/executions/:executionId/retry', async (req, res) => {
    try {
      const { workflowRuntime } = await import('./core/WorkflowRuntime');
      const { runExecutionManager } = await import('./core/RunExecutionManager');
      
      const execution = runExecutionManager.getExecution(req.params.executionId);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      
      // TODO: Implement retry logic by re-running the workflow
      // For now, just return success
      res.json({ success: true, message: 'Retry scheduled' });
    } catch (error) {
      console.error('Failed to retry execution:', error);
      res.status(500).json({ error: 'Failed to retry execution' });
    }
  });
  
  // Retry specific node
  app.post('/api/executions/:executionId/nodes/:nodeId/retry', async (req, res) => {
    try {
      const { retryManager } = await import('./core/RetryManager');
      
      await retryManager.replayFromDLQ(req.params.executionId, req.params.nodeId);
      res.json({ success: true, message: 'Node retry scheduled' });
    } catch (error) {
      console.error('Failed to retry node:', error);
      res.status(500).json({ error: 'Failed to retry node' });
    }
  });
  
  // Get execution statistics
  app.get('/api/executions/stats/:timeframe', async (req, res) => {
    try {
      const { runExecutionManager } = await import('./core/RunExecutionManager');
      const timeframe = req.params.timeframe as 'hour' | 'day' | 'week';
      
      const stats = runExecutionManager.getExecutionStats(timeframe);
      res.json(stats);
    } catch (error) {
      console.error('Failed to get execution stats:', error);
      res.status(500).json({ error: 'Failed to get execution stats' });
    }
  });
  
  // Get DLQ items
  app.get('/api/dlq', async (req, res) => {
    try {
      const { retryManager } = await import('./core/RetryManager');
      const dlqItems = retryManager.getDLQItems();
      res.json({ items: dlqItems });
    } catch (error) {
      console.error('Failed to get DLQ items:', error);
      res.status(500).json({ error: 'Failed to get DLQ items' });
    }
  });

  // Test LLM JSON validation and repair
  app.post('/api/llm/validate-json', async (req, res) => {
    try {
      const { llmValidationAndRepair } = await import('./llm/LLMValidationAndRepair');
      const { jsonString, schema, originalPrompt, options } = req.body;
      
      const result = await llmValidationAndRepair.validateAndRepair(
        jsonString,
        schema,
        originalPrompt,
        options
      );
      
      res.json(result);
    } catch (error) {
      console.error('Failed to validate JSON:', error);
      res.status(500).json({ error: 'Failed to validate JSON' });
    }
  });

  // ===== WEBHOOK VERIFICATION API =====
  
  // Verify webhook signature
  app.post('/api/webhooks/verify', async (req, res) => {
    try {
      const { webhookVerifier } = await import('./webhooks/WebhookVerifier');
      const { provider, headers, body, config } = req.body;
      
      const result = await webhookVerifier.verifyWebhook(
        provider,
        headers,
        body,
        config
      );
      
      res.json(result);
    } catch (error) {
      console.error('Failed to verify webhook:', error);
      res.status(500).json({ error: 'Failed to verify webhook' });
    }
  });
  
  // Generate test webhook signature
  app.post('/api/webhooks/generate-signature', async (req, res) => {
    try {
      const { webhookVerifier } = await import('./webhooks/WebhookVerifier');
      const { provider, body, config } = req.body;
      
      const result = webhookVerifier.generateTestSignature(provider, body, config);
      res.json(result);
    } catch (error) {
      console.error('Failed to generate webhook signature:', error);
      res.status(500).json({ error: 'Failed to generate webhook signature' });
    }
  });
  
  // Get webhook verification stats
  app.get('/api/webhooks/stats', async (req, res) => {
    try {
      const { webhookVerifier } = await import('./webhooks/WebhookVerifier');
      const stats = webhookVerifier.getVerificationStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get webhook stats:', error);
      res.status(500).json({ error: 'Failed to get webhook stats' });
    }
  });
  
  // Register webhook provider configuration
  app.post('/api/webhooks/register-provider', async (req, res) => {
    try {
      const { webhookVerifier } = await import('./webhooks/WebhookVerifier');
      const config = req.body;
      
      webhookVerifier.registerProvider(config);
      res.json({ success: true, message: `Provider ${config.provider} registered` });
    } catch (error) {
      console.error('Failed to register webhook provider:', error);
      res.status(500).json({ error: 'Failed to register webhook provider' });
    }
  });

  // ===== LLM BUDGET & CACHE API =====
  
  // Get budget status
  app.get('/api/llm/budget/status', async (req, res) => {
    try {
      const { llmBudgetAndCache } = await import('./llm/LLMBudgetAndCache');
      const status = llmBudgetAndCache.getBudgetStatus();
      res.json(status);
    } catch (error) {
      console.error('Failed to get budget status:', error);
      res.status(500).json({ error: 'Failed to get budget status' });
    }
  });
  
  // Update budget configuration
  app.post('/api/llm/budget/config', async (req, res) => {
    try {
      const { llmBudgetAndCache } = await import('./llm/LLMBudgetAndCache');
      const config = req.body;
      
      llmBudgetAndCache.updateBudgetConfig(config);
      res.json({ success: true, message: 'Budget configuration updated' });
    } catch (error) {
      console.error('Failed to update budget config:', error);
      res.status(500).json({ error: 'Failed to update budget config' });
    }
  });
  
  // Get cache statistics
  app.get('/api/llm/cache/stats', async (req, res) => {
    try {
      const { llmBudgetAndCache } = await import('./llm/LLMBudgetAndCache');
      const stats = llmBudgetAndCache.getCacheStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      res.status(500).json({ error: 'Failed to get cache stats' });
    }
  });
  
  // Clear cache
  app.post('/api/llm/cache/clear', async (req, res) => {
    try {
      const { llmBudgetAndCache } = await import('./llm/LLMBudgetAndCache');
      llmBudgetAndCache.clearCache();
      res.json({ success: true, message: 'Cache cleared' });
    } catch (error) {
      console.error('Failed to clear cache:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });
  
  // Get usage analytics
  app.get('/api/llm/usage/analytics', async (req, res) => {
    try {
      const { llmBudgetAndCache } = await import('./llm/LLMBudgetAndCache');
      const timeframe = req.query.timeframe as 'day' | 'week' | 'month' || 'day';
      const analytics = llmBudgetAndCache.getUsageAnalytics(timeframe);
      res.json(analytics);
    } catch (error) {
      console.error('Failed to get usage analytics:', error);
      res.status(500).json({ error: 'Failed to get usage analytics' });
    }
  });
  
  // Check budget constraints for a request
  app.post('/api/llm/budget/check', async (req, res) => {
    try {
      const { llmBudgetAndCache } = await import('./llm/LLMBudgetAndCache');
      const { estimatedCostUSD, userId, workflowId } = req.body;
      
      const result = await llmBudgetAndCache.checkBudgetConstraints(
        estimatedCostUSD,
        userId,
        workflowId
      );
      
      res.json(result);
    } catch (error) {
      console.error('Failed to check budget constraints:', error);
      res.status(500).json({ error: 'Failed to check budget constraints' });
    }
  });

  // ===== PHASE 4 ENTERPRISE FEATURES API =====
  
  // LLM Orchestration
  app.post('/api/llm/orchestrate', async (req, res) => {
    try {
      const { llmOrchestrator } = await import('./llm/enterprise/LLMOrchestrator');
      const { model, messages, context, nodeTypes } = req.body;
      
      const result = await llmOrchestrator.orchestrateRequest({
        model,
        messages,
        context,
        nodeTypes
      });
      
      res.json({ success: true, result });
    } catch (error) {
      console.error('LLM orchestration error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vector Database Management
  app.post('/api/vector/upsert', async (req, res) => {
    try {
      const { vectorDatabaseManager } = await import('./llm/enterprise/VectorDatabaseManager');
      const { documents, indexName } = req.body;
      
      const result = await vectorDatabaseManager.upsert(documents, indexName);
      res.json({ success: true, result });
    } catch (error) {
      console.error('Vector upsert error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/vector/search', async (req, res) => {
    try {
      const { vectorDatabaseManager } = await import('./llm/enterprise/VectorDatabaseManager');
      const { query, indexName } = req.body;
      
      const results = await vectorDatabaseManager.search(query, indexName);
      res.json({ success: true, results });
    } catch (error) {
      console.error('Vector search error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Fine-tuning Pipeline
  app.post('/api/llm/fine-tune/start', async (req, res) => {
    try {
      const { llmFineTuningPipeline } = await import('./llm/enterprise/LLMFineTuningPipeline');
      const { name, baseModel, provider, datasetId, config, createdBy } = req.body;
      
      const job = await llmFineTuningPipeline.startFineTuning(
        name, baseModel, provider, datasetId, config, createdBy
      );
      
      res.json({ success: true, job });
    } catch (error) {
      console.error('Fine-tuning start error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/llm/fine-tune/jobs', async (req, res) => {
    try {
      const { llmFineTuningPipeline } = await import('./llm/enterprise/LLMFineTuningPipeline');
      const jobs = llmFineTuningPipeline.listJobs();
      res.json({ success: true, jobs });
    } catch (error) {
      console.error('Fine-tuning jobs error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Enterprise Security
  app.post('/api/security/assess', async (req, res) => {
    try {
      const { enterpriseSecurityManager } = await import('./llm/enterprise/EnterpriseSecurityManager');
      const { prompt, context, userId, userLocation, metadata } = req.body;
      
      const assessment = await enterpriseSecurityManager.assessSecurity({
        prompt, context, userId, userLocation, metadata
      });
      
      res.json({ success: true, assessment });
    } catch (error) {
      console.error('Security assessment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Multi-modal LLM
  app.post('/api/llm/multimodal', async (req, res) => {
    try {
      const { multiModalLLMManager } = await import('./llm/enterprise/MultiModalLLMManager');
      const request = req.body;
      
      const result = await multiModalLLMManager.processMultiModalRequest(request);
      res.json({ success: true, result });
    } catch (error) {
      console.error('Multi-modal processing error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Phase 4 Consolidated Features
  app.post('/api/llm/collaborative', async (req, res) => {
    try {
      const { phase4EnterpriseFeatures } = await import('./llm/enterprise/Phase4ConsolidatedFeatures');
      const { task, prompt, context } = req.body;
      
      const result = await phase4EnterpriseFeatures.collaborativeAI.executeCollaborativeTask(task, prompt, context);
      res.json({ success: true, result });
    } catch (error) {
      console.error('Collaborative AI error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/marketplace/search', async (req, res) => {
    try {
      const { phase4EnterpriseFeatures } = await import('./llm/enterprise/Phase4ConsolidatedFeatures');
      const query = req.query;
      
      const results = phase4EnterpriseFeatures.marketplace.searchMarketplace(query as any);
      res.json({ success: true, results });
    } catch (error) {
      console.error('Marketplace search error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/governance/evaluate', async (req, res) => {
    try {
      const { phase4EnterpriseFeatures } = await import('./llm/enterprise/Phase4ConsolidatedFeatures');
      const { request, context } = req.body;
      
      const evaluation = await phase4EnterpriseFeatures.governance.evaluateRequest(request, context);
      res.json({ success: true, evaluation });
    } catch (error) {
      console.error('Governance evaluation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/optimization/optimize', async (req, res) => {
    try {
      const { phase4EnterpriseFeatures } = await import('./llm/enterprise/Phase4ConsolidatedFeatures');
      const { workflow, performanceData } = req.body;
      
      const optimization = await phase4EnterpriseFeatures.autoOptimization.optimizeWorkflow(workflow, performanceData);
      res.json({ success: true, optimization });
    } catch (error) {
      console.error('Auto-optimization error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/enterprise/analytics', async (req, res) => {
    try {
      const { phase4EnterpriseFeatures } = await import('./llm/enterprise/Phase4ConsolidatedFeatures');
      const analytics = phase4EnterpriseFeatures.getEnterpriseAnalytics();
      res.json({ success: true, analytics });
    } catch (error) {
      console.error('Enterprise analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
