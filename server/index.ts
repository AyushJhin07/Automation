// Load environment variables FIRST
import { env } from './env';

// Log LLM API key presence for debugging
console.log('🔑 LLM API Keys:', { 
  GEMINI: !!process.env.GEMINI_API_KEY, 
  OPENAI: !!process.env.OPENAI_API_KEY, 
  CLAUDE: !!process.env.CLAUDE_API_KEY 
});
import express, { type Request, Response, NextFunction } from "express";
import { context as otelContext, propagation, SpanKind, SpanStatusCode, trace as otelTrace } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { redactSecrets } from './utils/redact';
import { runWithRequestContext, getRequestContext } from './utils/ExecutionContext';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runStartupChecks } from './runtime/startupChecks';
import './observability/index.js';
import { recordHttpRequestDuration, tracer } from './observability/index.js';

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
  const routeSnapshot = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  const parentContext = propagation.extract(otelContext.active(), req.headers);
  const span = tracer.startSpan('http.server.request', {
    kind: SpanKind.SERVER,
    attributes: {
      'http.method': req.method,
      'http.target': req.originalUrl,
      'http.scheme': req.protocol,
      'http.host': req.get('host') ?? undefined,
      'http.user_agent': req.get('user-agent') ?? undefined,
    },
  }, parentContext);

  const startTime = process.hrtime.bigint();
  let spanEnded = false;

  const endSpan = (status: { code: SpanStatusCode; message?: string }, extraAttributes?: Record<string, unknown>) => {
    if (spanEnded) {
      return;
    }
    spanEnded = true;
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1_000_000;
    const matchedRoute = req.route?.path ?? routeSnapshot;
    const requestId = res.getHeader('x-request-id');

    span.setAttributes({
      'http.route': matchedRoute,
      'http.status_code': res.statusCode,
      'http.request_id': typeof requestId === 'string' ? requestId : Array.isArray(requestId) ? requestId[0] : undefined,
      ...(extraAttributes ?? {}),
    });
    span.setStatus(status);
    recordHttpRequestDuration(durationMs, {
      http_method: req.method,
      http_route: matchedRoute,
      http_status_code: res.statusCode,
    });
    span.end();
  };

  res.on('finish', () => {
    const status: { code: SpanStatusCode; message?: string } =
      res.statusCode >= 500
        ? { code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` }
        : { code: SpanStatusCode.OK };
    endSpan(status);

    if (routeSnapshot.startsWith('/api')) {
      const ctx = getRequestContext();
      const reqId = ctx?.requestId || 'unknown';
      const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      let logLine = `[${reqId}] ${req.method} ${routeSnapshot} ${res.statusCode} in ${Math.round(duration)}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV === 'development') {
        try { logLine += ` :: ${JSON.stringify(redactSecrets(capturedJsonResponse))}`; } catch {}
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  res.on('close', () => {
    if (!spanEnded) {
      endSpan({ code: SpanStatusCode.ERROR, message: 'connection closed before response finished' });
    }
  });

  const spanContext = otelTrace.setSpan(parentContext, span);
  otelContext.with(spanContext, () => next());
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

  const host = process.env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');
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
