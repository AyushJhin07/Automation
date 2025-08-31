/**
 * P2-3: Advanced Analytics API Routes
 */

import { Router } from 'express';
import { workflowAnalytics } from '../analytics/workflow-analytics.js';

const router = Router();

// Get workflow performance metrics
router.get('/workflows/:workflowId/performance', (req, res) => {
  try {
    const { workflowId } = req.params;
    const { timeframe = 'day' } = req.query;

    const performance = workflowAnalytics.getWorkflowPerformance(
      workflowId, 
      timeframe as 'hour' | 'day' | 'week' | 'month'
    );

    res.json({
      success: true,
      performance,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching workflow performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow performance metrics'
    });
  }
});

// Get business metrics dashboard
router.get('/business-metrics', (req, res) => {
  try {
    const { timeframe = 'day' } = req.query;

    const metrics = workflowAnalytics.getBusinessMetrics(
      timeframe as 'hour' | 'day' | 'week' | 'month'
    );

    res.json({
      success: true,
      metrics,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching business metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch business metrics'
    });
  }
});

// Get app-specific analytics
router.get('/apps/:app/analytics', (req, res) => {
  try {
    const { app } = req.params;
    const { timeframe = 'day' } = req.query;

    const analytics = workflowAnalytics.getAppAnalytics(
      app,
      timeframe as 'hour' | 'day' | 'week' | 'month'
    );

    res.json({
      success: true,
      app,
      analytics,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching app analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app analytics'
    });
  }
});

// Get user behavior analytics
router.get('/users/:userId/analytics', (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe = 'day' } = req.query;

    const analytics = workflowAnalytics.getUserAnalytics(
      userId,
      timeframe as 'hour' | 'day' | 'week' | 'month'
    );

    res.json({
      success: true,
      userId,
      analytics,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user analytics'
    });
  }
});

// Get real-time dashboard
router.get('/dashboard', (req, res) => {
  try {
    const dashboard = workflowAnalytics.getRealTimeDashboard();

    res.json({
      success: true,
      dashboard,
      timestamp: new Date().toISOString(),
      refreshInterval: 30000 // Suggest 30 second refresh
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch real-time dashboard'
    });
  }
});

// Record workflow execution start
router.post('/workflows/:workflowId/executions', (req, res) => {
  try {
    const { workflowId } = req.params;
    const { userId, appsUsed } = req.body;

    if (!userId || !Array.isArray(appsUsed)) {
      return res.status(400).json({
        success: false,
        error: 'userId and appsUsed array are required'
      });
    }

    const executionId = workflowAnalytics.startWorkflowExecution(workflowId, userId, appsUsed);

    res.json({
      success: true,
      executionId,
      workflowId,
      startTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error starting workflow execution tracking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start execution tracking'
    });
  }
});

// Record workflow execution completion
router.post('/executions/:executionId/complete', (req, res) => {
  try {
    const { executionId } = req.params;
    const { status, totalCost = 0 } = req.body;

    if (!status || !['completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Valid status (completed, failed, cancelled) is required'
      });
    }

    workflowAnalytics.completeWorkflowExecution(executionId, status, totalCost);

    res.json({
      success: true,
      executionId,
      status,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error completing workflow execution tracking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete execution tracking'
    });
  }
});

// Record node execution metrics
router.post('/executions/:executionId/nodes', (req, res) => {
  try {
    const { executionId } = req.params;
    const nodeMetric = req.body;

    // Validate required fields
    const required = ['nodeId', 'app', 'operation', 'startTime', 'status'];
    for (const field of required) {
      if (!nodeMetric[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`
        });
      }
    }

    // Convert string dates to Date objects
    nodeMetric.startTime = new Date(nodeMetric.startTime);
    if (nodeMetric.endTime) {
      nodeMetric.endTime = new Date(nodeMetric.endTime);
    }

    workflowAnalytics.recordNodeExecution(executionId, nodeMetric);

    res.json({
      success: true,
      message: 'Node execution recorded',
      nodeId: nodeMetric.nodeId
    });
  } catch (error) {
    console.error('Error recording node execution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record node execution'
    });
  }
});

// Export metrics
router.get('/export', (req, res) => {
  try {
    const { format = 'json' } = req.query;

    if (!['json', 'csv'].includes(format as string)) {
      return res.status(400).json({
        success: false,
        error: 'Format must be json or csv'
      });
    }

    const exportData = workflowAnalytics.exportMetrics(format as 'json' | 'csv');
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const filename = `workflow_metrics_${new Date().toISOString().split('T')[0]}.${format}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    console.error('Error exporting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export metrics'
    });
  }
});

// Get analytics summary for admin
router.get('/summary', (req, res) => {
  try {
    const businessMetrics = workflowAnalytics.getBusinessMetrics('day');
    const dashboard = workflowAnalytics.getRealTimeDashboard();

    const summary = {
      overview: {
        totalExecutionsToday: dashboard.executionsToday,
        successRateToday: dashboard.successRateToday,
        activeWorkflows: dashboard.activeWorkflows,
        systemHealth: dashboard.systemHealth
      },
      performance: {
        averageExecutionTime: businessMetrics.averageExecutionTime,
        totalCost: businessMetrics.totalCost,
        costSavings: businessMetrics.costSavings,
        topPerformingApps: dashboard.topPerformingApps.slice(0, 5)
      },
      issues: {
        recentErrors: dashboard.recentErrors.slice(0, 5),
        alerts: dashboard.alerts,
        errorPatterns: businessMetrics.errorPatterns.slice(0, 3)
      },
      trends: {
        topWorkflows: businessMetrics.topWorkflows.slice(0, 5),
        topApps: businessMetrics.topApps.slice(0, 10)
      }
    };

    res.json({
      success: true,
      summary,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics summary'
    });
  }
});

export default router;