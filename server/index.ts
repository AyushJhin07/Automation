// Load environment variables FIRST
import './env';

// Log LLM API key presence for debugging
console.log('🔑 LLM API Keys:', { 
  GEMINI: !!process.env.GEMINI_API_KEY, 
  OPENAI: !!process.env.OPENAI_API_KEY, 
  CLAUDE: !!process.env.CLAUDE_API_KEY 
});
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
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
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV === 'development') {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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
    executionQueueService.start();
  } catch (e) {
    console.warn('⚠️ Failed to start execution queue:', (e as any)?.message || e);
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

  // Serve the app on port 5000 or fallback ports for macOS compatibility
  const preferredPort = 5000;
  const fallbackPorts = [5001, 3000, 8000, 8080];
  
  const tryPort = (port: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const onError = (err: any) => {
        if (err.code === 'EADDRINUSE' || err.code === 'ENOTSUP') {
          reject(err);
        } else {
          reject(err);
        }
      };

      server.on('error', onError);

      if (process.env.NODE_ENV === "production") {
        // Production: bind to all interfaces
        server.listen({
          port,
          host: "0.0.0.0",
          reusePort: true,
        }, () => {
          server.removeListener('error', onError);
          log(`serving on 0.0.0.0:${port}`);
          resolve();
        });
      } else {
        // Development: use localhost for macOS compatibility
        server.listen(port, () => {
          server.removeListener('error', onError);
          log(`serving on localhost:${port}`);
          resolve();
        });
      }
    });
  };

  // Try preferred port first, then fallback ports
  const startServer = async () => {
    const portsToTry = [preferredPort, ...fallbackPorts];
    
    for (const port of portsToTry) {
      try {
        await tryPort(port);
        return; // Success, exit the loop
      } catch (err: any) {
        log(`Port ${port} failed: ${err.message}`);
        if (port === portsToTry[portsToTry.length - 1]) {
          // Last port failed
          log(`All ports failed. Please check if another service is using these ports.`);
          log(`On macOS, you might need to disable AirPlay Receiver in System Preferences > Sharing`);
          process.exit(1);
        }
      }
    }
  };

  startServer();
})();
