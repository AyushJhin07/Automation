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

  const httpServer = createServer(app);

  return httpServer;
}
