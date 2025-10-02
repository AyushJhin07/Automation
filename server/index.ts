// Load environment variables FIRST
import { env } from './env';

// Log LLM API key presence for debugging
console.log('🔑 LLM API Keys:', { 
  GEMINI: !!process.env.GEMINI_API_KEY, 
  OPENAI: !!process.env.OPENAI_API_KEY, 
  CLAUDE: !!process.env.CLAUDE_API_KEY 
});
import express, { type Request, Response, NextFunction } from "express";
import { randomUUID } from 'crypto';
import { redactSecrets } from './utils/redact';
import { runWithRequestContext, getRequestContext } from './utils/ExecutionContext';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runStartupChecks } from './runtime/startupChecks';

const app = express();
// Correlation ID + JSON body parsing with audit logging
app.use((req, res, next) => {
  const existing = req.headers['x-request-id'] as string | undefined;
  const reqId = existing && existing.length > 0 ? existing : randomUUID();
  res.setHeader('x-request-id', reqId);
  runWithRequestContext({ requestId: reqId }, () => next());
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const ctx = getRequestContext();
      const reqId = ctx?.requestId || 'unknown';
      let logLine = `[${reqId}] ${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV === 'development') {
        try { logLine += ` :: ${JSON.stringify(redactSecrets(capturedJsonResponse))}`; } catch {}
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await runStartupChecks();
  // Initialize LLM providers
  try {
    const { registerLLMProviders } = await import('./llm');
    registerLLMProviders();
  } catch (error) {
    console.error('Failed to initialize LLM providers:', error);
    console.warn('LLM features will be unavailable');
  }

  const server = await registerRoutes(app);
  try {
    const { executionQueueService } = await import('./services/ExecutionQueueService.js');
    const { WebhookManager } = await import('./webhooks/WebhookManager.js');
    WebhookManager.configureQueueService(executionQueueService);
  } catch (e) {
    console.warn('⚠️ Failed to configure execution queue:', (e as any)?.message || e);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // Do not rethrow here to avoid crashing the process; rely on logging/monitoring
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const parsedPort = Number.parseInt(env.PORT, 10);
  if (Number.isNaN(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value provided: ${env.PORT}`);
  }

  const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  const publicUrl = env.SERVER_PUBLIC_URL || `http://${host === '0.0.0.0' ? 'localhost' : host}:${parsedPort}`;

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${parsedPort} is already in use. Set PORT to a free port.`);
    } else {
      console.error('❌ Failed to start HTTP server:', error);
    }
    process.exit(1);
  });

  server.listen({
    port: parsedPort,
    host,
    reusePort: env.NODE_ENV === 'production',
  }, () => {
    log(`serving on ${host}:${parsedPort}`);
    if (publicUrl) {
      log(`public url: ${publicUrl}`);
    }
  });
})();
