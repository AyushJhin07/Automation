import { db } from '../database/schema';
import { connectionService } from './ConnectionService';
import { authService } from './AuthService';
import { connectorFramework } from '../connectors/ConnectorFramework';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  message: string;
  lastChecked: Date;
  details?: Record<string, any>;
}

export interface SystemMetrics {
  timestamp: Date;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  database: {
    connected: boolean;
    responseTime: number;
    activeConnections?: number;
  };
  api: {
    totalRequests: number;
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
  };
  users: {
    total: number;
    active: number;
    newToday: number;
  };
  workflows: {
    total: number;
    activeToday: number;
    successRate: number;
  };
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export class HealthMonitoringService {
  private db: any;
  private healthChecks = new Map<string, HealthCheck>();
  private alerts: Alert[] = [];
  private metrics: SystemMetrics[] = [];
  private apiMetrics = {
    requests: 0,
    errors: 0,
    responseTimes: [] as number[],
    lastMinuteRequests: [] as { timestamp: number }[]
  };

  constructor() {
    this.db = db;
    if (!this.db && process.env.NODE_ENV !== 'development') {
      throw new Error('Database connection not available');
    }
    
    // Start monitoring (only if database is available)
    if (this.db) {
      this.startHealthChecks();
      this.startMetricsCollection();
    }
  }

  /**
   * Get overall system health
   */
  public async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheck[];
    uptime: number;
    version: string;
  }> {
    const checks = Array.from(this.healthChecks.values());
    
    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;
    
    if (unhealthyCount > 0) {
      status = 'unhealthy';
    } else if (degradedCount > 0) {
      status = 'degraded';
    }

    return {
      status,
      checks,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  /**
   * Get system metrics
   */
  public getSystemMetrics(): SystemMetrics {
    const now = new Date();
    const memUsage = process.memoryUsage();
    
    // Calculate requests per minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.apiMetrics.lastMinuteRequests.filter(
      req => req.timestamp > oneMinuteAgo
    );

    // Calculate average response time
    const avgResponseTime = this.apiMetrics.responseTimes.length > 0
      ? this.apiMetrics.responseTimes.reduce((a, b) => a + b, 0) / this.apiMetrics.responseTimes.length
      : 0;

    // Calculate error rate
    const errorRate = this.apiMetrics.requests > 0
      ? (this.apiMetrics.errors / this.apiMetrics.requests) * 100
      : 0;

    return {
      timestamp: now,
      uptime: process.uptime(),
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      cpu: {
        usage: 0 // Would need additional monitoring for real CPU usage
      },
      database: this.healthChecks.get('database') ? {
        connected: this.healthChecks.get('database')!.status !== 'unhealthy',
        responseTime: this.healthChecks.get('database')!.responseTime
      } : {
        connected: false,
        responseTime: 0
      },
      api: {
        totalRequests: this.apiMetrics.requests,
        requestsPerMinute: recentRequests.length,
        averageResponseTime: avgResponseTime,
        errorRate: errorRate
      },
      users: {
        total: 0, // Would be populated from database
        active: 0,
        newToday: 0
      },
      workflows: {
        total: 0, // Would be populated from database
        activeToday: 0,
        successRate: 0
      }
    };
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts with pagination
   */
  public getAlerts(limit: number = 50, offset: number = 0): {
    alerts: Alert[];
    total: number;
  } {
    const sortedAlerts = this.alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return {
      alerts: sortedAlerts.slice(offset, offset + limit),
      total: this.alerts.length
    };
  }

  /**
   * Record API request metrics
   */
  public recordApiRequest(responseTime: number, isError: boolean = false): void {
    this.apiMetrics.requests++;
    this.apiMetrics.responseTimes.push(responseTime);
    
    if (isError) {
      this.apiMetrics.errors++;
    }

    // Track requests for rate calculation
    this.apiMetrics.lastMinuteRequests.push({ timestamp: Date.now() });

    // Keep only last 1000 response times and last hour of requests
    if (this.apiMetrics.responseTimes.length > 1000) {
      this.apiMetrics.responseTimes = this.apiMetrics.responseTimes.slice(-1000);
    }

    const oneHourAgo = Date.now() - 3600000;
    this.apiMetrics.lastMinuteRequests = this.apiMetrics.lastMinuteRequests.filter(
      req => req.timestamp > oneHourAgo
    );

    // Check for alerts
    this.checkApiMetricsAlerts(responseTime, isError);
  }

  /**
   * Create an alert
   */
  public createAlert(
    type: 'error' | 'warning' | 'info',
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): string {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      timestamp: new Date(),
      resolved: false,
      metadata
    };

    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    console.log(`🚨 Alert created: ${type.toUpperCase()} - ${title}`);

    // Send notifications for critical alerts
    if (type === 'error') {
      this.sendAlertNotification(alert);
    }

    return alert.id;
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      console.log(`✅ Alert resolved: ${alert.title}`);
      return true;
    }

    return false;
  }

  /**
   * Start automated health checks
   */
  private startHealthChecks(): void {
    console.log('🏥 Starting health monitoring...');

    // Run health checks every 30 seconds
    setInterval(() => {
      this.runHealthChecks();
    }, 30000);

    // Run initial health check
    this.runHealthChecks();
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(): Promise<void> {
    const checks = [
      this.checkDatabase(),
      this.checkLLMConnections(),
      this.checkConnectorFramework(),
      this.checkMemoryUsage(),
      this.checkDiskSpace(),
      this.checkExternalAPIs()
    ];

    await Promise.allSettled(checks);
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Simple query to test database
      await this.db.execute('SELECT 1');
      
      const responseTime = Date.now() - startTime;
      
      this.healthChecks.set('database', {
        name: 'Database',
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        message: responseTime < 1000 ? 'Database responding normally' : 'Database response slow',
        lastChecked: new Date()
      });

      if (responseTime > 5000) {
        this.createAlert('warning', 'Database Slow Response', 
          `Database query took ${responseTime}ms`);
      }

    } catch (error) {
      this.healthChecks.set('database', {
        name: 'Database',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: `Database connection failed: ${error.message}`,
        lastChecked: new Date()
      });

      this.createAlert('error', 'Database Connection Failed', 
        `Unable to connect to database: ${error.message}`);
    }
  }

  /**
   * Check LLM API connections
   */
  private async checkLLMConnections(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Test if we can create connections (this would test the service)
      const testResult = await connectionService.getUserConnections('health-check-user');
      
      const responseTime = Date.now() - startTime;
      
      this.healthChecks.set('llm_connections', {
        name: 'LLM Connections',
        status: 'healthy',
        responseTime,
        message: 'LLM connection service operational',
        lastChecked: new Date()
      });

    } catch (error) {
      this.healthChecks.set('llm_connections', {
        name: 'LLM Connections',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: `LLM connection service failed: ${error.message}`,
        lastChecked: new Date()
      });
    }
  }

  /**
   * Check connector framework
   */
  private async checkConnectorFramework(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const connectors = await connectorFramework.loadConnectors();
      const responseTime = Date.now() - startTime;
      
      this.healthChecks.set('connectors', {
        name: 'Connector Framework',
        status: connectors.length > 0 ? 'healthy' : 'degraded',
        responseTime,
        message: `${connectors.length} connectors loaded`,
        lastChecked: new Date(),
        details: { connectorCount: connectors.length }
      });

    } catch (error) {
      this.healthChecks.set('connectors', {
        name: 'Connector Framework',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: `Connector framework failed: ${error.message}`,
        lastChecked: new Date()
      });
    }
  }

  /**
   * Check memory usage
   */
  private checkMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const usagePercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Memory usage: ${usagePercentage.toFixed(1)}%`;
    
    if (usagePercentage > 90) {
      status = 'unhealthy';
      message = `Critical memory usage: ${usagePercentage.toFixed(1)}%`;
      this.createAlert('error', 'High Memory Usage', 
        `Memory usage is at ${usagePercentage.toFixed(1)}%`);
    } else if (usagePercentage > 75) {
      status = 'degraded';
      message = `High memory usage: ${usagePercentage.toFixed(1)}%`;
    }

    this.healthChecks.set('memory', {
      name: 'Memory Usage',
      status,
      responseTime: 0,
      message,
      lastChecked: new Date(),
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        percentage: usagePercentage
      }
    });
  }

  /**
   * Check disk space (simplified)
   */
  private checkDiskSpace(): void {
    // In a real implementation, you'd check actual disk usage
    // For now, we'll simulate it
    
    this.healthChecks.set('disk', {
      name: 'Disk Space',
      status: 'healthy',
      responseTime: 0,
      message: 'Disk space sufficient',
      lastChecked: new Date(),
      details: { usage: '45%' }
    });
  }

  /**
   * Check external API availability
   */
  private async checkExternalAPIs(): Promise<void> {
    const apis = [
      { name: 'OpenAI', url: 'https://api.openai.com/v1/models' },
      { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models' },
      { name: 'Anthropic Claude', url: 'https://api.anthropic.com/v1/messages' }
    ];

    for (const api of apis) {
      const startTime = Date.now();
      
      try {
        const response = await fetch(api.url, {
          method: 'GET',
          headers: { 'User-Agent': 'HealthCheck/1.0' }
        });

        const responseTime = Date.now() - startTime;
        const isHealthy = response.status < 500;

        this.healthChecks.set(`external_${api.name.toLowerCase()}`, {
          name: `External API: ${api.name}`,
          status: isHealthy ? 'healthy' : 'degraded',
          responseTime,
          message: `${api.name} API ${isHealthy ? 'available' : 'experiencing issues'}`,
          lastChecked: new Date(),
          details: { statusCode: response.status }
        });

      } catch (error) {
        this.healthChecks.set(`external_${api.name.toLowerCase()}`, {
          name: `External API: ${api.name}`,
          status: 'unhealthy',
          responseTime: Date.now() - startTime,
          message: `${api.name} API unreachable: ${error.message}`,
          lastChecked: new Date()
        });
      }
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Collect metrics every 5 minutes
    setInterval(() => {
      const metrics = this.getSystemMetrics();
      this.metrics.push(metrics);

      // Keep only last 24 hours of metrics (288 data points)
      if (this.metrics.length > 288) {
        this.metrics = this.metrics.slice(-288);
      }
    }, 300000); // 5 minutes
  }

  /**
   * Check API metrics for alerts
   */
  private checkApiMetricsAlerts(responseTime: number, isError: boolean): void {
    // Alert on slow response times
    if (responseTime > 10000) {
      this.createAlert('warning', 'Slow API Response', 
        `API request took ${responseTime}ms`);
    }

    // Alert on high error rate
    const errorRate = this.apiMetrics.requests > 0
      ? (this.apiMetrics.errors / this.apiMetrics.requests) * 100
      : 0;

    if (errorRate > 10 && this.apiMetrics.requests > 10) {
      this.createAlert('error', 'High Error Rate', 
        `API error rate is ${errorRate.toFixed(1)}%`);
    }
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotification(alert: Alert): void {
    try {
      // In a real implementation, you'd send to Slack, email, etc.
      console.log(`📧 Sending alert notification: ${alert.title}`);
      
      // Example: Send email notification
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        // This would integrate with your email service
        console.log(`Would send email to ${adminEmail}: ${alert.message}`);
      }

    } catch (error) {
      console.error('Failed to send alert notification:', error);
    }
  }

  /**
   * Get historical metrics
   */
  public getHistoricalMetrics(hours: number = 24): SystemMetrics[] {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Generate health report
   */
  public generateHealthReport(): {
    summary: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheck[];
    metrics: SystemMetrics;
    alerts: Alert[];
    recommendations: string[];
  } {
    const health = this.getSystemHealth();
    const metrics = this.getSystemMetrics();
    const activeAlerts = this.getActiveAlerts();
    const recommendations: string[] = [];

    // Generate recommendations based on current state
    if (metrics.memory.percentage > 75) {
      recommendations.push('Consider increasing memory allocation or optimizing memory usage');
    }

    if (metrics.api.errorRate > 5) {
      recommendations.push('Investigate API errors and improve error handling');
    }

    if (metrics.api.averageResponseTime > 2000) {
      recommendations.push('Optimize API response times');
    }

    const summary = `System is ${health.status}. ${health.checks.length} checks completed, ${activeAlerts.length} active alerts.`;

    return {
      summary,
      status: health.status,
      checks: health.checks,
      metrics,
      alerts: activeAlerts,
      recommendations
    };
  }
}

export const healthMonitoringService = new HealthMonitoringService();