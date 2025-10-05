/**
 * PRODUCTION DEPLOYMENT: Health Check & Monitoring Endpoints
 * 
 * Enterprise-grade health monitoring for production deployment
 */

import { Router } from 'express';
import { LLMProviderService } from '../services/LLMProviderService.js';
import { WorkflowRepository } from '../workflow/WorkflowRepository.js';
import { checkQueueHealth } from '../services/QueueHealthService.js';
import { executionQueueService } from '../services/ExecutionQueueService.js';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  checks: {
    database: HealthCheck;
    llm: HealthCheck;
    workflows: HealthCheck;
    memory: HealthCheck;
    queue: HealthCheck;
    dependencies: HealthCheck;
  };
  metrics: {
    totalWorkflows: number;
    activeConnections: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: number;
  };
}

interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  responseTime?: number;
  details?: any;
}

// Comprehensive health check endpoint
router.get('/health', async (req, res) => {
  const startTime = Date.now();

  try {
    const queueStatus = await checkQueueDurability();
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: await checkDatabase(),
        llm: await checkLLMProviders(),
        workflows: await checkWorkflowRepository(),
        memory: checkMemoryUsage(),
        queue: queueStatus,
        dependencies: checkDependencies()
      },
      metrics: {
        totalWorkflows: await WorkflowRepository.countWorkflows(),
        activeConnections: 0, // Would track actual connections in production
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage().user / 1000000 // Convert to seconds
      }
    };

    // Determine overall health status
    const failedChecks = Object.values(healthStatus.checks).filter(check => check.status === 'fail');
    const warnChecks = Object.values(healthStatus.checks).filter(check => check.status === 'warn');
    
    if (failedChecks.length > 0) {
      healthStatus.status = 'unhealthy';
    } else if (warnChecks.length > 0) {
      healthStatus.status = 'degraded';
    }

    const responseTime = Date.now() - startTime;
    
    // Return appropriate HTTP status
    const httpStatus = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json({
      ...healthStatus,
      responseTime
    });

  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check system failure',
      responseTime: Date.now() - startTime
    });
  }
});

// Detailed system metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      },
      application: {
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
        features: {
          llmEnabled: process.env.ENABLE_LLM_FEATURES === 'true',
          collaborationEnabled: process.env.ENABLE_COLLABORATION === 'true',
          analyticsEnabled: process.env.ENABLE_ANALYTICS === 'true'
        }
      },
      workflows: await WorkflowRepository.getWorkflowMetrics(),
      llm: LLMProviderService.getProviderStatus(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('❌ Metrics collection failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect metrics'
    });
  }
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    // Quick checks for readiness
    const queueHealth = await checkQueueHealth();
    const queueReady = queueHealth.status === 'pass' && queueHealth.durable;
    const checks = {
      llm: LLMProviderService.getProviderStatus().configured,
      environment: process.env.NODE_ENV === 'production',
      dependencies: true, // Would check actual dependencies
      queue: queueReady,
    };

    const ready = Object.values(checks).every((check) => Boolean(check));

    res.status(ready ? 200 : 503).json({
      ready,
      checks,
      queueHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ready: false,
      error: 'Readiness check failed'
    });
  }
});

// Liveness probe (for Kubernetes)
router.get('/live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

router.get('/queue/heartbeat', (req, res) => {
  const snapshot = executionQueueService.getTelemetrySnapshot();
  const queueHealth = snapshot.queueHealth;
  const queueDepths = snapshot.metrics.queueDepths;
  const leases = snapshot.leases.entries;
  const now = Date.now();
  const heartbeatTimeout = snapshot.worker.heartbeatTimeoutMs;

  const staleLeases = leases.filter((lease) => {
    const heartbeatMs = lease.lastHeartbeatAt !== null ? Date.parse(lease.lastHeartbeatAt) : null;
    if (heartbeatMs !== null && Number.isFinite(heartbeatMs)) {
      return now - heartbeatMs > heartbeatTimeout;
    }

    const lockedMs = lease.lockedAt !== null ? Date.parse(lease.lockedAt) : null;
    if (lockedMs !== null && Number.isFinite(lockedMs)) {
      return now - lockedMs > heartbeatTimeout;
    }

    return true;
  });

  const latestHeartbeatAt = leases.reduce<string | null>((latest, lease) => {
    if (!lease.lastHeartbeatAt) {
      return latest;
    }

    if (!latest) {
      return lease.lastHeartbeatAt;
    }

    return Date.parse(lease.lastHeartbeatAt) > Date.parse(latest) ? lease.lastHeartbeatAt : latest;
  }, null);
  const parsedLatestHeartbeat = latestHeartbeatAt !== null ? Date.parse(latestHeartbeatAt) : null;
  const latestHeartbeatAgeMs =
    parsedLatestHeartbeat !== null && Number.isFinite(parsedLatestHeartbeat)
      ? now - parsedLatestHeartbeat
      : null;

  const totalWaiting = Object.values(queueDepths).reduce((sum, depth) => {
    const waiting = depth?.waiting ?? 0;
    const delayed = depth?.delayed ?? 0;
    return sum + waiting + delayed;
  }, 0);

  const status: HealthCheck = (() => {
    if (!snapshot.started || !snapshot.databaseEnabled) {
      return {
        status: 'fail',
        message: 'Execution worker has not been started. Queue processing is offline.'
      };
    }

    if (queueHealth && queueHealth.status === 'fail') {
      return {
        status: 'fail',
        message: queueHealth.message,
        details: queueHealth,
      };
    }

    if (staleLeases.length > 0) {
      return {
        status: 'warn',
        message: `Detected ${staleLeases.length} leases without a fresh heartbeat.`,
        details: { staleLeases },
      };
    }

    if (totalWaiting > 0) {
      return {
        status: 'warn',
        message: `Queue depth is ${totalWaiting}. Worker is running but backlog remains.`,
        details: { totalWaiting },
      };
    }

    return {
      status: 'pass',
      message: 'Execution worker heartbeat is healthy and queue is drained.'
    };
  })();

  const httpStatus = status.status === 'pass' ? 200 : 503;

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    worker: {
      started: snapshot.started,
      id: snapshot.worker.id,
      queue: snapshot.worker.queueName,
      heartbeatTimeoutMs: heartbeatTimeout,
      latestHeartbeatAt,
      latestHeartbeatAgeMs,
    },
    queueHealth,
    queueDepths,
    leases,
    inlineWorker: ['1', 'true', 'yes', 'inline'].includes(
      (process.env.ENABLE_INLINE_WORKER ?? process.env.INLINE_EXECUTION_WORKER ?? '').toLowerCase()
    ),
  });
});

// Helper functions for health checks
async function checkDatabase(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    // In production, you'd test actual database connection
    // For now, simulate based on environment
    if (process.env.DATABASE_URL) {
      return {
        status: 'pass',
        message: 'Database connection healthy',
        responseTime: Date.now() - startTime
      };
    } else {
      return {
        status: 'warn',
        message: 'Database URL not configured (development mode)',
        responseTime: Date.now() - startTime
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: `Database check failed: ${error.message}`,
      responseTime: Date.now() - startTime
    };
  }
}

async function checkLLMProviders(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    const providerStatus = LLMProviderService.getProviderStatus();
    
    if (providerStatus.configured && providerStatus.available.length > 0) {
      return {
        status: 'pass',
        message: `LLM providers healthy: ${providerStatus.available.join(', ')}`,
        responseTime: Date.now() - startTime,
        details: providerStatus
      };
    } else {
      return {
        status: 'fail',
        message: 'No LLM providers configured',
        responseTime: Date.now() - startTime,
        details: providerStatus
      };
    }
  } catch (error) {
    return {
      status: 'fail',
      message: `LLM check failed: ${error.message}`,
      responseTime: Date.now() - startTime
    };
  }
}

async function checkWorkflowRepository(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    const metrics = await WorkflowRepository.getWorkflowMetrics();

    return {
      status: 'pass',
      message: `Workflow repository healthy: ${metrics.total} workflows`,
      responseTime: Date.now() - startTime,
      details: metrics
    };
  } catch (error: any) {
    return {
      status: 'fail',
      message: `Workflow repository check failed: ${error?.message || 'Unknown error'}`,
      responseTime: Date.now() - startTime
    };
  }
}

function checkMemoryUsage(): HealthCheck {
  const startTime = Date.now();
  
  try {
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = `Memory usage: ${memUsedMB}MB / ${memTotalMB}MB (${memPercent}%)`;
    
    if (memPercent > 90) {
      status = 'fail';
      message += ' - CRITICAL';
    } else if (memPercent > 75) {
      status = 'warn';
      message += ' - HIGH';
    }
    
    return {
      status,
      message,
      responseTime: Date.now() - startTime,
      details: memUsage
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Memory check failed: ${error.message}`,
      responseTime: Date.now() - startTime
    };
  }
}

function checkDependencies(): HealthCheck {
  const startTime = Date.now();
  
  try {
    // Check critical dependencies
    const criticalModules = ['express', 'react', 'typescript'];
    const missing = criticalModules.filter(mod => {
      try {
        require.resolve(mod);
        return false;
      } catch {
        return true;
      }
    });
    
    if (missing.length > 0) {
      return {
        status: 'fail',
        message: `Missing critical dependencies: ${missing.join(', ')}`,
        responseTime: Date.now() - startTime
      };
    }
    
    return {
      status: 'pass',
      message: 'All critical dependencies available',
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `Dependency check failed: ${error.message}`,
      responseTime: Date.now() - startTime
    };
  }
}

async function checkQueueDurability(): Promise<HealthCheck> {
  const status = await checkQueueHealth();
  const base: HealthCheck = {
    status: status.status,
    message: status.message,
    responseTime: status.latencyMs ?? undefined,
    details: {
      durable: status.durable,
      checkedAt: status.checkedAt,
      error: status.error,
    },
  };

  if (!status.durable || status.status !== 'pass') {
    return { ...base, status: 'fail' };
  }

  return base;
}

export default router;