/**
 * P2-3: Advanced Analytics and Workflow Performance Monitoring
 * 
 * Comprehensive analytics system for tracking workflow performance,
 * user behavior, and business metrics across all 149 applications.
 */

export interface WorkflowMetrics {
  workflowId: string;
  executionId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  nodeMetrics: NodeMetric[];
  errorCount: number;
  successRate: number;
  totalCost: number;
  appsUsed: string[];
}

export interface NodeMetric {
  nodeId: string;
  app: string;
  operation: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  retryCount: number;
  errorMessage?: string;
  inputSize: number;
  outputSize: number;
  apiCallsCount: number;
  cost: number;
}

export interface BusinessMetrics {
  timeframe: 'hour' | 'day' | 'week' | 'month';
  totalWorkflows: number;
  successfulWorkflows: number;
  failedWorkflows: number;
  averageExecutionTime: number;
  totalCost: number;
  costSavings: number;
  topApps: Array<{ app: string; usage: number; successRate: number }>;
  topWorkflows: Array<{ workflowId: string; executions: number; successRate: number }>;
  errorPatterns: Array<{ error: string; count: number; apps: string[] }>;
}

class WorkflowAnalyticsEngine {
  private metrics: Map<string, WorkflowMetrics> = new Map();
  private nodeMetrics: Map<string, NodeMetric[]> = new Map();

  // Record workflow execution start
  startWorkflowExecution(workflowId: string, userId: string, appsUsed: string[]): string {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const metrics: WorkflowMetrics = {
      workflowId,
      executionId,
      userId,
      startTime: new Date(),
      status: 'running',
      nodeMetrics: [],
      errorCount: 0,
      successRate: 0,
      totalCost: 0,
      appsUsed
    };

    this.metrics.set(executionId, metrics);
    console.log(`📊 Started tracking workflow execution: ${executionId}`);
    
    return executionId;
  }

  // Record workflow execution completion
  completeWorkflowExecution(executionId: string, status: 'completed' | 'failed' | 'cancelled', totalCost: number = 0): void {
    const metrics = this.metrics.get(executionId);
    if (!metrics) return;

    metrics.endTime = new Date();
    metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
    metrics.status = status;
    metrics.totalCost = totalCost;
    
    // Calculate success rate based on node metrics
    const completedNodes = metrics.nodeMetrics.filter(n => n.status === 'completed').length;
    const totalNodes = metrics.nodeMetrics.length;
    metrics.successRate = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

    console.log(`📈 Completed workflow execution: ${executionId} (${status}) - ${metrics.duration}ms`);
  }

  // Record node execution
  recordNodeExecution(executionId: string, nodeMetric: NodeMetric): void {
    const workflowMetrics = this.metrics.get(executionId);
    if (!workflowMetrics) return;

    workflowMetrics.nodeMetrics.push(nodeMetric);
    
    if (nodeMetric.status === 'failed') {
      workflowMetrics.errorCount++;
    }

    // Store node metrics separately for detailed analysis
    if (!this.nodeMetrics.has(executionId)) {
      this.nodeMetrics.set(executionId, []);
    }
    this.nodeMetrics.get(executionId)!.push(nodeMetric);
  }

  // Get workflow performance metrics
  getWorkflowPerformance(workflowId: string, timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): {
    workflowId: string;
    executions: number;
    successRate: number;
    averageExecutionTime: number;
    totalCost: number;
    errorRate: number;
    topErrors: Array<{ error: string; count: number }>;
    performanceTrend: Array<{ timestamp: Date; executionTime: number; success: boolean }>;
  } {
    const now = new Date();
    const timeframeDuration = this.getTimeframeDuration(timeframe);
    const cutoff = new Date(now.getTime() - timeframeDuration);

    const workflowExecutions = Array.from(this.metrics.values())
      .filter(m => m.workflowId === workflowId && m.startTime >= cutoff);

    const successfulExecutions = workflowExecutions.filter(m => m.status === 'completed');
    const failedExecutions = workflowExecutions.filter(m => m.status === 'failed');
    
    const totalExecutions = workflowExecutions.length;
    const successRate = totalExecutions > 0 ? Math.round((successfulExecutions.length / totalExecutions) * 100) : 0;
    const errorRate = totalExecutions > 0 ? Math.round((failedExecutions.length / totalExecutions) * 100) : 0;
    
    const averageExecutionTime = workflowExecutions.length > 0 ?
      Math.round(workflowExecutions.reduce((sum, m) => sum + (m.duration || 0), 0) / workflowExecutions.length) : 0;

    const totalCost = workflowExecutions.reduce((sum, m) => sum + m.totalCost, 0);

    // Analyze error patterns
    const errorCounts = new Map<string, number>();
    workflowExecutions.forEach(m => {
      m.nodeMetrics.forEach(n => {
        if (n.errorMessage) {
          const count = errorCounts.get(n.errorMessage) || 0;
          errorCounts.set(n.errorMessage, count + 1);
        }
      });
    });

    const topErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Performance trend
    const performanceTrend = workflowExecutions
      .filter(m => m.duration !== undefined)
      .map(m => ({
        timestamp: m.startTime,
        executionTime: m.duration!,
        success: m.status === 'completed'
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      workflowId,
      executions: totalExecutions,
      successRate,
      averageExecutionTime,
      totalCost: Math.round(totalCost * 100) / 100,
      errorRate,
      topErrors,
      performanceTrend
    };
  }

  // Get business metrics across all workflows
  getBusinessMetrics(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): BusinessMetrics {
    const now = new Date();
    const timeframeDuration = this.getTimeframeDuration(timeframe);
    const cutoff = new Date(now.getTime() - timeframeDuration);

    const recentExecutions = Array.from(this.metrics.values())
      .filter(m => m.startTime >= cutoff);

    const totalWorkflows = recentExecutions.length;
    const successfulWorkflows = recentExecutions.filter(m => m.status === 'completed').length;
    const failedWorkflows = recentExecutions.filter(m => m.status === 'failed').length;

    const averageExecutionTime = recentExecutions.length > 0 ?
      Math.round(recentExecutions.reduce((sum, m) => sum + (m.duration || 0), 0) / recentExecutions.length) : 0;

    const totalCost = recentExecutions.reduce((sum, m) => sum + m.totalCost, 0);

    // Calculate cost savings (estimated based on manual process time)
    const estimatedManualTimePerWorkflow = 30 * 60 * 1000; // 30 minutes in ms
    const actualAutomationTime = recentExecutions.reduce((sum, m) => sum + (m.duration || 0), 0);
    const timeSaved = (totalWorkflows * estimatedManualTimePerWorkflow) - actualAutomationTime;
    const costSavings = (timeSaved / (60 * 60 * 1000)) * 50; // $50/hour saved

    // Analyze app usage
    const appUsage = new Map<string, { count: number; successes: number }>();
    recentExecutions.forEach(m => {
      m.appsUsed.forEach(app => {
        const current = appUsage.get(app) || { count: 0, successes: 0 };
        current.count++;
        if (m.status === 'completed') current.successes++;
        appUsage.set(app, current);
      });
    });

    const topApps = Array.from(appUsage.entries())
      .map(([app, stats]) => ({
        app,
        usage: stats.count,
        successRate: Math.round((stats.successes / stats.count) * 100)
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);

    // Analyze workflow patterns
    const workflowUsage = new Map<string, { count: number; successes: number }>();
    recentExecutions.forEach(m => {
      const current = workflowUsage.get(m.workflowId) || { count: 0, successes: 0 };
      current.count++;
      if (m.status === 'completed') current.successes++;
      workflowUsage.set(m.workflowId, current);
    });

    const topWorkflows = Array.from(workflowUsage.entries())
      .map(([workflowId, stats]) => ({
        workflowId,
        executions: stats.count,
        successRate: Math.round((stats.successes / stats.count) * 100)
      }))
      .sort((a, b) => b.executions - a.executions)
      .slice(0, 10);

    // Analyze error patterns
    const errorPatterns = new Map<string, { count: number; apps: Set<string> }>();
    recentExecutions.forEach(m => {
      m.nodeMetrics.forEach(n => {
        if (n.errorMessage) {
          const current = errorPatterns.get(n.errorMessage) || { count: 0, apps: new Set() };
          current.count++;
          current.apps.add(n.app);
          errorPatterns.set(n.errorMessage, current);
        }
      });
    });

    const topErrorPatterns = Array.from(errorPatterns.entries())
      .map(([error, stats]) => ({
        error,
        count: stats.count,
        apps: Array.from(stats.apps)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      timeframe,
      totalWorkflows,
      successfulWorkflows,
      failedWorkflows,
      averageExecutionTime,
      totalCost: Math.round(totalCost * 100) / 100,
      costSavings: Math.round(costSavings * 100) / 100,
      topApps,
      topWorkflows,
      errorPatterns: topErrorPatterns
    };
  }

  // Get app-specific analytics
  getAppAnalytics(app: string, timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): {
    app: string;
    totalUsage: number;
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
    topOperations: Array<{ operation: string; count: number; successRate: number }>;
    performanceTrend: Array<{ timestamp: Date; responseTime: number; success: boolean }>;
  } {
    const now = new Date();
    const timeframeDuration = this.getTimeframeDuration(timeframe);
    const cutoff = new Date(now.getTime() - timeframeDuration);

    const appNodeMetrics = Array.from(this.nodeMetrics.values())
      .flat()
      .filter(n => n.app === app && n.startTime >= cutoff);

    const totalUsage = appNodeMetrics.length;
    const successfulNodes = appNodeMetrics.filter(n => n.status === 'completed');
    const failedNodes = appNodeMetrics.filter(n => n.status === 'failed');
    
    const successRate = totalUsage > 0 ? Math.round((successfulNodes.length / totalUsage) * 100) : 0;
    const errorRate = totalUsage > 0 ? Math.round((failedNodes.length / totalUsage) * 100) : 0;
    
    const averageResponseTime = appNodeMetrics.length > 0 ?
      Math.round(appNodeMetrics.reduce((sum, n) => sum + (n.duration || 0), 0) / appNodeMetrics.length) : 0;

    // Analyze operation usage
    const operationUsage = new Map<string, { count: number; successes: number }>();
    appNodeMetrics.forEach(n => {
      const current = operationUsage.get(n.operation) || { count: 0, successes: 0 };
      current.count++;
      if (n.status === 'completed') current.successes++;
      operationUsage.set(n.operation, current);
    });

    const topOperations = Array.from(operationUsage.entries())
      .map(([operation, stats]) => ({
        operation,
        count: stats.count,
        successRate: Math.round((stats.successes / stats.count) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Performance trend
    const performanceTrend = appNodeMetrics
      .filter(n => n.duration !== undefined)
      .map(n => ({
        timestamp: n.startTime,
        responseTime: n.duration!,
        success: n.status === 'completed'
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      app,
      totalUsage,
      successRate,
      averageResponseTime,
      errorRate,
      topOperations,
      performanceTrend
    };
  }

  // Get user behavior analytics
  getUserAnalytics(userId: string, timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): {
    userId: string;
    totalWorkflows: number;
    activeWorkflows: number;
    successRate: number;
    favoriteApps: Array<{ app: string; usage: number }>;
    productivityScore: number;
    timeSpent: number;
    costGenerated: number;
    achievements: string[];
  } {
    const now = new Date();
    const timeframeDuration = this.getTimeframeDuration(timeframe);
    const cutoff = new Date(now.getTime() - timeframeDuration);

    const userExecutions = Array.from(this.metrics.values())
      .filter(m => m.userId === userId && m.startTime >= cutoff);

    const totalWorkflows = userExecutions.length;
    const activeWorkflows = userExecutions.filter(m => m.status === 'running').length;
    const successfulWorkflows = userExecutions.filter(m => m.status === 'completed').length;
    const successRate = totalWorkflows > 0 ? Math.round((successfulWorkflows / totalWorkflows) * 100) : 0;

    // Analyze app preferences
    const appUsage = new Map<string, number>();
    userExecutions.forEach(m => {
      m.appsUsed.forEach(app => {
        appUsage.set(app, (appUsage.get(app) || 0) + 1);
      });
    });

    const favoriteApps = Array.from(appUsage.entries())
      .map(([app, usage]) => ({ app, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);

    // Calculate productivity metrics
    const timeSpent = userExecutions.reduce((sum, m) => sum + (m.duration || 0), 0);
    const costGenerated = userExecutions.reduce((sum, m) => sum + m.totalCost, 0);
    
    // Productivity score based on automation efficiency
    const automationEfficiency = timeSpent > 0 ? (successfulWorkflows * 1800000) / timeSpent : 0; // 30 min saved per workflow
    const productivityScore = Math.min(100, Math.round(automationEfficiency * 10));

    // Generate achievements
    const achievements: string[] = [];
    if (successfulWorkflows >= 10) achievements.push('Automation Expert');
    if (successRate >= 95) achievements.push('Quality Master');
    if (favoriteApps.length >= 5) achievements.push('Multi-Platform Pro');
    if (totalWorkflows >= 50) achievements.push('Power User');
    if (costGenerated <= 10) achievements.push('Cost Optimizer');

    return {
      userId,
      totalWorkflows,
      activeWorkflows,
      successRate,
      favoriteApps,
      productivityScore,
      timeSpent,
      costGenerated: Math.round(costGenerated * 100) / 100,
      achievements
    };
  }

  // Get real-time dashboard data
  getRealTimeDashboard(): {
    activeWorkflows: number;
    executionsToday: number;
    successRateToday: number;
    totalCostToday: number;
    topPerformingApps: Array<{ app: string; successRate: number; usage: number }>;
    recentErrors: Array<{ app: string; error: string; timestamp: Date }>;
    systemHealth: 'healthy' | 'degraded' | 'critical';
    alerts: Array<{ type: string; message: string; severity: 'info' | 'warning' | 'error' }>;
  } {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const todayExecutions = Array.from(this.metrics.values())
      .filter(m => m.startTime >= todayStart);

    const activeWorkflows = todayExecutions.filter(m => m.status === 'running').length;
    const executionsToday = todayExecutions.length;
    const successfulToday = todayExecutions.filter(m => m.status === 'completed').length;
    const successRateToday = executionsToday > 0 ? Math.round((successfulToday / executionsToday) * 100) : 0;
    const totalCostToday = todayExecutions.reduce((sum, m) => sum + m.totalCost, 0);

    // Analyze app performance
    const appPerformance = new Map<string, { usage: number; successes: number }>();
    todayExecutions.forEach(m => {
      m.appsUsed.forEach(app => {
        const current = appPerformance.get(app) || { usage: 0, successes: 0 };
        current.usage++;
        if (m.status === 'completed') current.successes++;
        appPerformance.set(app, current);
      });
    });

    const topPerformingApps = Array.from(appPerformance.entries())
      .map(([app, stats]) => ({
        app,
        successRate: Math.round((stats.successes / stats.usage) * 100),
        usage: stats.usage
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 10);

    // Recent errors (last hour)
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentErrors = Array.from(this.nodeMetrics.values())
      .flat()
      .filter(n => n.status === 'failed' && n.startTime >= hourAgo)
      .map(n => ({
        app: n.app,
        error: n.errorMessage || 'Unknown error',
        timestamp: n.startTime
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    // Determine system health
    let systemHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const alerts: Array<{ type: string; message: string; severity: 'info' | 'warning' | 'error' }> = [];

    if (successRateToday < 70) {
      systemHealth = 'critical';
      alerts.push({
        type: 'low_success_rate',
        message: `Success rate is critically low: ${successRateToday}%`,
        severity: 'error'
      });
    } else if (successRateToday < 85) {
      systemHealth = 'degraded';
      alerts.push({
        type: 'degraded_performance',
        message: `Success rate below target: ${successRateToday}%`,
        severity: 'warning'
      });
    }

    if (recentErrors.length > 10) {
      alerts.push({
        type: 'high_error_rate',
        message: `High error rate detected: ${recentErrors.length} errors in the last hour`,
        severity: 'warning'
      });
    }

    if (totalCostToday > 100) {
      alerts.push({
        type: 'high_cost',
        message: `Daily cost exceeds budget: $${totalCostToday.toFixed(2)}`,
        severity: 'warning'
      });
    }

    return {
      activeWorkflows,
      executionsToday,
      successRateToday,
      totalCostToday: Math.round(totalCostToday * 100) / 100,
      topPerformingApps,
      recentErrors,
      systemHealth,
      alerts
    };
  }

  // Helper method to get timeframe duration in milliseconds
  private getTimeframeDuration(timeframe: 'hour' | 'day' | 'week' | 'month'): number {
    switch (timeframe) {
      case 'hour': return 60 * 60 * 1000;
      case 'day': return 24 * 60 * 60 * 1000;
      case 'week': return 7 * 24 * 60 * 60 * 1000;
      case 'month': return 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  // Export metrics for external analysis
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    const allMetrics = Array.from(this.metrics.values());
    
    if (format === 'csv') {
      const headers = ['executionId', 'workflowId', 'userId', 'startTime', 'duration', 'status', 'successRate', 'totalCost', 'appsUsed'];
      const rows = allMetrics.map(m => [
        m.executionId,
        m.workflowId,
        m.userId,
        m.startTime.toISOString(),
        m.duration || 0,
        m.status,
        m.successRate,
        m.totalCost,
        m.appsUsed.join(';')
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(allMetrics, null, 2);
  }

  // Clear old metrics (data retention)
  clearOldMetrics(retentionDays: number = 90): number {
    const cutoff = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
    let deletedCount = 0;

    for (const [executionId, metrics] of this.metrics.entries()) {
      if (metrics.startTime < cutoff) {
        this.metrics.delete(executionId);
        this.nodeMetrics.delete(executionId);
        deletedCount++;
      }
    }

    console.log(`🧹 Cleared ${deletedCount} old metrics (older than ${retentionDays} days)`);
    return deletedCount;
  }
}

// Singleton instance
export const workflowAnalytics = new WorkflowAnalyticsEngine();

// Auto-cleanup old metrics daily
setInterval(() => {
  workflowAnalytics.clearOldMetrics(90); // Keep 90 days of data
}, 24 * 60 * 60 * 1000); // Run daily