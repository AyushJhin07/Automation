// Load environment variables FIRST
import { env } from './env';

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import {
  context as otelContext,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace as otelTrace,
} from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { redactSecrets } from './utils/redact';
import { runWithRequestContext, getRequestContext } from './utils/ExecutionContext';
import { connectorRegistry } from './ConnectorRegistry';
import { registerRoutes } from './routes';
import { health as healthRoutes } from './routes/health';
import { setupVite, serveStatic, log } from './vite';
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

const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: false });

const shouldBypassStandardBodyParsers = (req: Request): boolean => {
  return req.path.startsWith('/api/webhooks');
};

app.use((req, res, next) => {
  if (shouldBypassStandardBodyParsers(req)) {
    return next();
  }
  return jsonParser(req, res, next);
});

app.use((req, res, next) => {
  if (shouldBypassStandardBodyParsers(req)) {
    return next();
  }
  return urlencodedParser(req, res, next);
});

app.use('/api', healthRoutes);

app.use((req, res, next) => {
  const routeSnapshot = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;
  const originalResJson = res.json;
  res.json = function patchedJson(bodyJson: any, ...args: any[]) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  } as typeof res.json;

  const parentContext = propagation.extract(otelContext.active(), req.headers);
  const span = tracer.startSpan(
    'http.server.request',
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.target': req.originalUrl,
        'http.scheme': req.protocol,
        'http.host': req.get('host') ?? undefined,
        'http.user_agent': req.get('user-agent') ?? undefined,
      },
    },
    parentContext,
  );

  const startTime = process.hrtime.bigint();
  let spanEnded = false;

  const endSpan = (
    status: { code: SpanStatusCode; message?: string },
    extraAttributes?: Record<string, unknown>,
  ) => {
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
      'http.request_id':
        typeof requestId === 'string'
          ? requestId
          : Array.isArray(requestId)
            ? requestId[0]
            : undefined,
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
        try {
          logLine += ` :: ${JSON.stringify(redactSecrets(capturedJsonResponse))}`;
        } catch {}
      }

      if (logLine.length > 80) {
        logLine = `${logLine.slice(0, 79)}…`;
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

  await connectorRegistry.init();

  // Initialize LLM providers
  try {
    const { registerLLMProviders } = await import('./llm');
    registerLLMProviders();
  } catch (error) {
    console.error('Failed to initialize LLM providers:', error);
    console.warn('LLM features will be unavailable');
  }

  await registerRoutes(app);
  const server = createServer(app);

  const shouldStartInlineWorker = (() => {
    const rawValue = process.env.ENABLE_INLINE_WORKER ?? process.env.INLINE_EXECUTION_WORKER;
    if (!rawValue) {
      if (
        env.NODE_ENV === 'development' &&
        process.env.CI !== 'true' &&
        process.env.DISABLE_INLINE_WORKER_AUTOSTART !== 'true'
      ) {
        process.env.ENABLE_INLINE_WORKER = 'true';
        console.log(
          '🛠️ Defaulting ENABLE_INLINE_WORKER=true for development. Set ENABLE_INLINE_WORKER=false to opt-out of inline execution.'
        );
        return true;
      }
      return false;
    }

    return ['1', 'true', 'yes', 'inline'].includes(rawValue.toLowerCase());
  })();

  let executionQueueService:
    | typeof import('./services/ExecutionQueueService.js').executionQueueService
    | null = null;
  try {
    const queueModule = await import('./services/ExecutionQueueService.js');
    executionQueueService = queueModule.executionQueueService;
    const { WebhookManager } = await import('./webhooks/WebhookManager.js');
    WebhookManager.configureQueueService(executionQueueService);

    if (shouldStartInlineWorker) {
      console.log('⚙️  ENABLE_INLINE_WORKER detected. Starting execution worker inline.');
      await executionQueueService.start();
      console.log('✅ Inline execution worker started.');
    } else {
      console.log('🏭 Inline execution worker disabled. Expecting external worker process.');
    }

    executionQueueService.enableExternalConsumerMonitor();
  } catch (error) {
    console.warn('⚠️ Failed to configure execution queue:', (error as any)?.message || error);

    if (shouldStartInlineWorker) {
      console.error('❌ Inline execution worker requested but failed to start. Exiting.');
      process.exit(1);
    }
  }

  const shouldVerifyWorkerHeartbeat =
    executionQueueService !== null &&
    (env.NODE_ENV === 'development' || process.env.CI === 'true') &&
    process.env.SKIP_WORKER_HEARTBEAT_CHECK !== 'true';

  if (shouldVerifyWorkerHeartbeat && executionQueueService) {
    const timeoutOverride = Number.parseInt(
      process.env.WORKER_HEARTBEAT_STARTUP_TIMEOUT_MS ?? '',
      10
    );
    const timeoutMs = Number.isFinite(timeoutOverride) ? timeoutOverride : undefined;

    try {
      const heartbeat = await executionQueueService.waitForWorkerHeartbeat({ timeoutMs });
      const modeLabel = heartbeat.inline ? 'inline' : 'external';
      console.log(
        `✅ Execution worker heartbeat detected (${modeLabel} worker ${
          heartbeat.workerId ?? 'unknown'
        }, age=${Math.round(heartbeat.ageMs)}ms).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Execution worker heartbeat check failed:', message);
      console.error(
        '👉 Start `npm run dev:worker` / `npm run dev:scheduler` or enable ENABLE_INLINE_WORKER=true before launching the API.'
      );
      process.exit(1);
    }
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({ message });
    // Do not rethrow here to avoid crashing the process; rely on logging/monitoring
  });

  const setupStaticFallback = () => {
    try {
      serveStatic(app);
    } catch (e: any) {
      console.warn(
        `⚠️ Static assets not available (${e?.message || e}). Using minimal health route instead.`
      );
      app.get('/', (_req, res) => res.send('Server running OK 🚀'));
    }
  };

  // Only setup Vite in development, after routes are registered.
  // Allow disabling in constrained environments via DISABLE_VITE=true.
  if (app.get('env') === 'development' && process.env.DISABLE_VITE !== 'true') {
    const didSetupVite = await setupVite(app, server);
    if (!didSetupVite) {
      setupStaticFallback();
    }
  } else {
    // In production or when Vite is disabled, try serving static assets.
    // Fall back gracefully if the client build isn't present.
    setupStaticFallback();
  }

  const parsedPort = Number.parseInt(env.PORT, 10);
  if (Number.isNaN(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value provided: ${env.PORT}`);
  }

  const host = process.env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');
  const publicUrl = env.SERVER_PUBLIC_URL || `http://${host === '0.0.0.0' ? 'localhost' : host}:${parsedPort}`;

  let reusePortEnabled = env.NODE_ENV === 'production';

  const onListening = () => {
    log(`serving on ${host}:${parsedPort}`);
    if (publicUrl) {
      log(`public url: ${publicUrl}`);
    }
  };

  const listen = () => {
    const options = reusePortEnabled
      ? { port: parsedPort, host, reusePort: true as const }
      : { port: parsedPort, host };
    server.listen(options, onListening);
  };

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${parsedPort} is already in use. Set PORT to a free port.`);
      process.exit(1);
      return;
    }

    if (error.code === 'ENOTSUP' && reusePortEnabled) {
      console.warn('⚠️ SO_REUSEPORT unsupported on this platform; retrying without reusePort.');
      reusePortEnabled = false;
      listen();
      return;
    }

    console.error('❌ Failed to start HTTP server:', error);
    process.exit(1);
  });

  listen();
})();
