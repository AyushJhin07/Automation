/**
 * ENHANCED OBSERVABILITY MANAGER
 * Provides correlation tracking, advanced search, and intelligent monitoring
 */

export interface CorrelationContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  userId?: string;
  workflowId?: string;
  executionId?: string;
  sessionId?: string;
  requestId?: string;
  nodeId?: string;
  connectorId?: string;
  metadata: Record<string, any>;
  tags: string[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

export interface ObservabilityEvent {
  id: string;
  correlationId: string;
  traceId: string;
  spanId: string;
  type: EventType;
  severity: LogLevel;
  timestamp: Date;
  source: EventSource;
  title: string;
  message: string;
  details: Record<string, any>;
  metadata: {
    userId?: string;
    workflowId?: string;
    executionId?: string;
    nodeId?: string;
    connectorId?: string;
    duration?: number;
    cost?: number;
    tokens?: number;
    statusCode?: number;
    userAgent?: string;
    ipAddress?: string;
  };
  tags: string[];
  searchable: string;
  fingerprint: string;
}

export type EventType = 
  | 'workflow_start' | 'workflow_complete' | 'workflow_fail'
  | 'node_start' | 'node_complete' | 'node_fail' | 'node_retry'
  | 'llm_request' | 'llm_response' | 'llm_error'
  | 'connector_call' | 'connector_response' | 'connector_error'
  | 'auth_login' | 'auth_logout' | 'auth_fail'
  | 'api_request' | 'api_response' | 'api_error'
  | 'webhook_received' | 'webhook_processed' | 'webhook_failed'
  | 'user_action' | 'system_event' | 'error' | 'warning' | 'info';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type EventSource = 
  | 'workflow_runtime' | 'llm_provider' | 'connector' | 'api_server' 
  | 'auth_service' | 'webhook_handler' | 'user_interface' | 'system';

export interface SearchQuery {
  query?: string;
  correlationId?: string;
  traceId?: string;
  userId?: string;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  connectorId?: string;
  type?: EventType[];
  severity?: LogLevel[];
  source?: EventSource[];
  tags?: string[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'duration' | 'severity';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  events: ObservabilityEvent[];
  total: number;
  aggregations: {
    byType: Record<EventType, number>;
    bySeverity: Record<LogLevel, number>;
    bySource: Record<EventSource, number>;
    byHour: Array<{ hour: string; count: number }>;
    topCorrelations: Array<{ correlationId: string; count: number; duration: number }>;
    errorRate: number;
    averageDuration: number;
    totalCost: number;
  };
  suggestions: string[];
  correlatedEvents?: ObservabilityEvent[];
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  query: SearchQuery;
  condition: {
    operator: 'gt' | 'lt' | 'eq' | 'contains' | 'regex';
    value: any;
    threshold?: number;
    window?: number; // minutes
  };
  actions: AlertAction[];
  isEnabled: boolean;
  lastTriggered?: Date;
  triggerCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertAction {
  type: 'email' | 'slack' | 'webhook' | 'log';
  config: Record<string, any>;
  isEnabled: boolean;
}

export interface TraceAnalysis {
  traceId: string;
  totalDuration: number;
  eventCount: number;
  errorCount: number;
  warningCount: number;
  workflow?: {
    id: string;
    name: string;
    status: 'running' | 'completed' | 'failed';
    startTime: Date;
    endTime?: Date;
    duration?: number;
  };
  timeline: Array<{
    timestamp: Date;
    event: ObservabilityEvent;
    depth: number;
    children: number;
  }>;
  criticalPath: ObservabilityEvent[];
  bottlenecks: Array<{
    event: ObservabilityEvent;
    impact: number;
    recommendation: string;
  }>;
  insights: string[];
}

class ObservabilityManager {
  private events: ObservabilityEvent[] = [];
  private correlationContexts = new Map<string, CorrelationContext>();
  private alertRules = new Map<string, AlertRule>();
  private readonly maxEvents = 50000;
  private readonly indexedFields = new Set([
    'correlationId', 'traceId', 'userId', 'workflowId', 'executionId', 
    'nodeId', 'connectorId', 'type', 'severity', 'source'
  ]);

  constructor() {
    this.initializeBuiltinAlerts();
    this.startMaintenanceTasks();
    console.log('👁️ Enhanced Observability Manager initialized');
  }

  /**
   * Create a new correlation context for tracking related events
   */
  createCorrelationContext(data: {
    userId?: string;
    workflowId?: string;
    executionId?: string;
    sessionId?: string;
    requestId?: string;
    metadata?: Record<string, any>;
    tags?: string[];
    parentContext?: CorrelationContext;
  }): CorrelationContext {
    const correlationId = this.generateCorrelationId();
    const traceId = data.parentContext?.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();

    const context: CorrelationContext = {
      correlationId,
      traceId,
      spanId,
      parentSpanId: data.parentContext?.spanId,
      userId: data.userId,
      workflowId: data.workflowId,
      executionId: data.executionId,
      sessionId: data.sessionId,
      requestId: data.requestId,
      metadata: data.metadata || {},
      tags: data.tags || [],
      startTime: new Date()
    };

    this.correlationContexts.set(correlationId, context);
    
    // Auto-expire contexts after 1 hour
    setTimeout(() => {
      this.correlationContexts.delete(correlationId);
    }, 60 * 60 * 1000);

    return context;
  }

  /**
   * Complete a correlation context
   */
  completeCorrelationContext(correlationId: string): void {
    const context = this.correlationContexts.get(correlationId);
    if (context) {
      context.endTime = new Date();
      context.duration = context.endTime.getTime() - context.startTime.getTime();
      this.correlationContexts.set(correlationId, context);
    }
  }

  /**
   * Log an observability event
   */
  logEvent(data: {
    type: EventType;
    severity: LogLevel;
    source: EventSource;
    title: string;
    message: string;
    details?: Record<string, any>;
    correlationContext?: CorrelationContext;
    metadata?: ObservabilityEvent['metadata'];
    tags?: string[];
  }): ObservabilityEvent {
    const id = this.generateEventId();
    const timestamp = new Date();
    
    // Use provided context or create a minimal one
    const context = data.correlationContext || {
      correlationId: this.generateCorrelationId(),
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      metadata: {},
      tags: [],
      startTime: timestamp
    };

    // Create searchable text
    const searchable = [
      data.title,
      data.message,
      JSON.stringify(data.details || {}),
      JSON.stringify(data.metadata || {}),
      ...(data.tags || []),
      ...context.tags
    ].join(' ').toLowerCase();

    // Generate fingerprint for deduplication
    const fingerprint = this.generateFingerprint(data.type, data.source, data.title, data.details);

    const event: ObservabilityEvent = {
      id,
      correlationId: context.correlationId,
      traceId: context.traceId,
      spanId: context.spanId,
      type: data.type,
      severity: data.severity,
      timestamp,
      source: data.source,
      title: data.title,
      message: data.message,
      details: data.details || {},
      metadata: {
        ...data.metadata,
        userId: context.userId,
        workflowId: context.workflowId,
        executionId: context.executionId,
        nodeId: context.nodeId,
        connectorId: context.connectorId
      },
      tags: [...(data.tags || []), ...context.tags],
      searchable,
      fingerprint
    };

    this.events.push(event);

    // Trim events if we exceed the limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Check alert rules
    this.checkAlertRules(event);

    // Log to console for development
    if (data.severity === 'error' || data.severity === 'fatal') {
      console.error(`🚨 [${data.source}] ${data.title}: ${data.message}`, data.details);
    } else if (data.severity === 'warn') {
      console.warn(`⚠️ [${data.source}] ${data.title}: ${data.message}`);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`📊 [${data.source}] ${data.title}: ${data.message}`);
    }

    return event;
  }

  /**
   * Search events with advanced filtering and aggregations
   */
  searchEvents(query: SearchQuery): SearchResult {
    let filteredEvents = [...this.events];

    // Apply filters
    if (query.query) {
      const searchTerm = query.query.toLowerCase();
      filteredEvents = filteredEvents.filter(event => 
        event.searchable.includes(searchTerm)
      );
    }

    // Exact match filters
    if (query.correlationId) {
      filteredEvents = filteredEvents.filter(e => e.correlationId === query.correlationId);
    }
    if (query.traceId) {
      filteredEvents = filteredEvents.filter(e => e.traceId === query.traceId);
    }
    if (query.userId) {
      filteredEvents = filteredEvents.filter(e => e.metadata.userId === query.userId);
    }
    if (query.workflowId) {
      filteredEvents = filteredEvents.filter(e => e.metadata.workflowId === query.workflowId);
    }
    if (query.executionId) {
      filteredEvents = filteredEvents.filter(e => e.metadata.executionId === query.executionId);
    }
    if (query.nodeId) {
      filteredEvents = filteredEvents.filter(e => e.metadata.nodeId === query.nodeId);
    }
    if (query.connectorId) {
      filteredEvents = filteredEvents.filter(e => e.metadata.connectorId === query.connectorId);
    }

    // Array filters
    if (query.type && query.type.length > 0) {
      filteredEvents = filteredEvents.filter(e => query.type!.includes(e.type));
    }
    if (query.severity && query.severity.length > 0) {
      filteredEvents = filteredEvents.filter(e => query.severity!.includes(e.severity));
    }
    if (query.source && query.source.length > 0) {
      filteredEvents = filteredEvents.filter(e => query.source!.includes(e.source));
    }
    if (query.tags && query.tags.length > 0) {
      filteredEvents = filteredEvents.filter(e => 
        query.tags!.some(tag => e.tags.includes(tag))
      );
    }

    // Time range filter
    if (query.startTime) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= query.endTime!);
    }

    const total = filteredEvents.length;

    // Sort events
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder || 'desc';
    
    filteredEvents.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortBy) {
        case 'timestamp':
          aVal = a.timestamp.getTime();
          bVal = b.timestamp.getTime();
          break;
        case 'duration':
          aVal = a.metadata.duration || 0;
          bVal = b.metadata.duration || 0;
          break;
        case 'severity':
          const severityOrder = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
          aVal = severityOrder[a.severity];
          bVal = severityOrder[b.severity];
          break;
        default:
          aVal = a.timestamp.getTime();
          bVal = b.timestamp.getTime();
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Paginate
    const limit = query.limit || 100;
    const offset = query.offset || 0;
    const paginatedEvents = filteredEvents.slice(offset, offset + limit);

    // Generate aggregations
    const aggregations = this.generateAggregations(filteredEvents);

    // Generate search suggestions
    const suggestions = this.generateSearchSuggestions(query.query);

    // Find correlated events if we have a correlation/trace ID
    let correlatedEvents: ObservabilityEvent[] | undefined;
    if (query.correlationId || query.traceId) {
      const targetId = query.correlationId || query.traceId;
      const field = query.correlationId ? 'correlationId' : 'traceId';
      correlatedEvents = this.events.filter(e => 
        e[field] === targetId && !paginatedEvents.find(pe => pe.id === e.id)
      ).slice(0, 50);
    }

    return {
      events: paginatedEvents,
      total,
      aggregations,
      suggestions,
      correlatedEvents
    };
  }

  /**
   * Analyze a complete trace
   */
  analyzeTrace(traceId: string): TraceAnalysis {
    const traceEvents = this.events.filter(e => e.traceId === traceId);
    
    if (traceEvents.length === 0) {
      throw new Error(`No events found for trace ${traceId}`);
    }

    // Sort by timestamp
    traceEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const startTime = traceEvents[0].timestamp;
    const endTime = traceEvents[traceEvents.length - 1].timestamp;
    const totalDuration = endTime.getTime() - startTime.getTime();

    const errorCount = traceEvents.filter(e => e.severity === 'error' || e.severity === 'fatal').length;
    const warningCount = traceEvents.filter(e => e.severity === 'warn').length;

    // Identify workflow info
    const workflowStartEvent = traceEvents.find(e => e.type === 'workflow_start');
    const workflowEndEvent = traceEvents.find(e => 
      e.type === 'workflow_complete' || e.type === 'workflow_fail'
    );

    const workflow = workflowStartEvent ? {
      id: workflowStartEvent.metadata.workflowId || '',
      name: workflowStartEvent.details.workflowName || 'Unknown Workflow',
      status: workflowEndEvent?.type === 'workflow_complete' ? 'completed' as const :
              workflowEndEvent?.type === 'workflow_fail' ? 'failed' as const : 'running' as const,
      startTime: workflowStartEvent.timestamp,
      endTime: workflowEndEvent?.timestamp,
      duration: workflowEndEvent ? 
        workflowEndEvent.timestamp.getTime() - workflowStartEvent.timestamp.getTime() : undefined
    } : undefined;

    // Build timeline with depth calculation
    const timeline = this.buildEventTimeline(traceEvents);

    // Identify critical path (longest sequence of dependent events)
    const criticalPath = this.identifyCriticalPath(traceEvents);

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(traceEvents);

    // Generate insights
    const insights = this.generateTraceInsights(traceEvents, totalDuration, errorCount, warningCount);

    return {
      traceId,
      totalDuration,
      eventCount: traceEvents.length,
      errorCount,
      warningCount,
      workflow,
      timeline,
      criticalPath,
      bottlenecks,
      insights
    };
  }

  /**
   * Create an alert rule
   */
  createAlertRule(data: {
    name: string;
    description: string;
    query: SearchQuery;
    condition: AlertRule['condition'];
    actions: AlertAction[];
    createdBy: string;
  }): AlertRule {
    const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const rule: AlertRule = {
      id,
      name: data.name,
      description: data.description,
      query: data.query,
      condition: data.condition,
      actions: data.actions,
      isEnabled: true,
      triggerCount: 0,
      createdBy: data.createdBy,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.alertRules.set(id, rule);
    console.log(`🚨 Created alert rule: ${data.name}`);
    return rule;
  }

  /**
   * Get observability metrics and dashboard data
   */
  getMetrics(timeframe?: { start: Date; end: Date }): {
    overview: {
      totalEvents: number;
      errorRate: number;
      warningRate: number;
      averageResponseTime: number;
      totalCost: number;
      activeWorkflows: number;
      activeUsers: number;
    };
    trends: {
      hourlyEvents: Array<{ hour: string; count: number; errors: number }>;
      topErrors: Array<{ message: string; count: number; lastSeen: Date }>;
      slowestWorkflows: Array<{ workflowId: string; averageDuration: number; count: number }>;
      costByHour: Array<{ hour: string; cost: number }>;
    };
    health: {
      systemStatus: 'healthy' | 'degraded' | 'critical';
      issues: Array<{ severity: LogLevel; message: string; count: number }>;
      uptime: number;
    };
  } {
    let events = this.events;
    
    if (timeframe) {
      events = events.filter(e => 
        e.timestamp >= timeframe.start && e.timestamp <= timeframe.end
      );
    }

    const totalEvents = events.length;
    const errorEvents = events.filter(e => e.severity === 'error' || e.severity === 'fatal');
    const warningEvents = events.filter(e => e.severity === 'warn');
    
    const errorRate = totalEvents > 0 ? (errorEvents.length / totalEvents) * 100 : 0;
    const warningRate = totalEvents > 0 ? (warningEvents.length / totalEvents) * 100 : 0;

    // Calculate average response time from events with duration
    const eventsWithDuration = events.filter(e => e.metadata.duration);
    const averageResponseTime = eventsWithDuration.length > 0 ?
      eventsWithDuration.reduce((sum, e) => sum + (e.metadata.duration || 0), 0) / eventsWithDuration.length : 0;

    // Calculate total cost
    const totalCost = events.reduce((sum, e) => sum + (e.metadata.cost || 0), 0);

    // Count unique workflows and users
    const activeWorkflows = new Set(events.map(e => e.metadata.workflowId).filter(Boolean)).size;
    const activeUsers = new Set(events.map(e => e.metadata.userId).filter(Boolean)).size;

    // Generate trends
    const trends = this.generateMetricTrends(events);

    // Assess system health
    const health = this.assessSystemHealth(events);

    return {
      overview: {
        totalEvents,
        errorRate,
        warningRate,
        averageResponseTime,
        totalCost,
        activeWorkflows,
        activeUsers
      },
      trends,
      health
    };
  }

  // Private helper methods

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private generateSpanId(): string {
    return `span_${Math.random().toString(36).slice(2)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private generateFingerprint(type: EventType, source: EventSource, title: string, details?: Record<string, any>): string {
    const data = `${type}:${source}:${title}:${JSON.stringify(details || {})}`;
    // Simple hash function (in production, use a proper hash library)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private generateAggregations(events: ObservabilityEvent[]): SearchResult['aggregations'] {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byHour: Record<string, number> = {};
    const correlationCounts: Record<string, { count: number; durations: number[] }> = {};
    
    let totalDuration = 0;
    let durationCount = 0;
    let totalCost = 0;

    for (const event of events) {
      // Count by type
      byType[event.type] = (byType[event.type] || 0) + 1;
      
      // Count by severity
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      
      // Count by source
      bySource[event.source] = (bySource[event.source] || 0) + 1;
      
      // Count by hour
      const hour = event.timestamp.toISOString().slice(0, 13);
      byHour[hour] = (byHour[hour] || 0) + 1;
      
      // Track correlations
      if (!correlationCounts[event.correlationId]) {
        correlationCounts[event.correlationId] = { count: 0, durations: [] };
      }
      correlationCounts[event.correlationId].count++;
      if (event.metadata.duration) {
        correlationCounts[event.correlationId].durations.push(event.metadata.duration);
      }
      
      // Accumulate metrics
      if (event.metadata.duration) {
        totalDuration += event.metadata.duration;
        durationCount++;
      }
      if (event.metadata.cost) {
        totalCost += event.metadata.cost;
      }
    }

    // Calculate error rate
    const errorEvents = (bySeverity['error'] || 0) + (bySeverity['fatal'] || 0);
    const errorRate = events.length > 0 ? (errorEvents / events.length) * 100 : 0;

    // Get top correlations
    const topCorrelations = Object.entries(correlationCounts)
      .map(([correlationId, data]) => ({
        correlationId,
        count: data.count,
        duration: data.durations.length > 0 ? 
          data.durations.reduce((a, b) => a + b, 0) / data.durations.length : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      byType: byType as Record<EventType, number>,
      bySeverity: bySeverity as Record<LogLevel, number>,
      bySource: bySource as Record<EventSource, number>,
      byHour: Object.entries(byHour)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hour, count]) => ({ hour, count })),
      topCorrelations,
      errorRate,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      totalCost
    };
  }

  private generateSearchSuggestions(query?: string): string[] {
    const suggestions: string[] = [];
    
    if (!query || query.length < 2) {
      return [
        'error', 'warning', 'workflow_fail', 'llm_error', 'timeout',
        'slow response', 'high cost', 'retry', 'connector_error'
      ];
    }

    // Find common terms in recent events
    const recentEvents = this.events.slice(-1000);
    const termCounts: Record<string, number> = {};
    
    for (const event of recentEvents) {
      const words = event.searchable.split(/\s+/).filter(word => 
        word.length > 2 && word.toLowerCase().includes(query.toLowerCase())
      );
      
      for (const word of words) {
        termCounts[word] = (termCounts[word] || 0) + 1;
      }
    }

    return Object.entries(termCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([term]) => term);
  }

  private buildEventTimeline(events: ObservabilityEvent[]): TraceAnalysis['timeline'] {
    return events.map(event => ({
      timestamp: event.timestamp,
      event,
      depth: this.calculateEventDepth(event, events),
      children: this.countChildEvents(event, events)
    }));
  }

  private calculateEventDepth(event: ObservabilityEvent, allEvents: ObservabilityEvent[]): number {
    // Simple depth calculation based on span relationships
    // In a full implementation, you'd build a proper span tree
    let depth = 0;
    const nodeEvents = allEvents.filter(e => 
      e.metadata.nodeId === event.metadata.nodeId && 
      e.timestamp <= event.timestamp
    );
    
    return Math.min(nodeEvents.length, 10); // Cap depth for visualization
  }

  private countChildEvents(event: ObservabilityEvent, allEvents: ObservabilityEvent[]): number {
    return allEvents.filter(e => 
      e.correlationId === event.correlationId &&
      e.timestamp > event.timestamp &&
      e.metadata.nodeId === event.metadata.nodeId
    ).length;
  }

  private identifyCriticalPath(events: ObservabilityEvent[]): ObservabilityEvent[] {
    // Simplified critical path identification
    // Find the sequence of events with the longest total duration
    const workflowEvents = events.filter(e => 
      e.type.startsWith('workflow_') || e.type.startsWith('node_')
    );
    
    return workflowEvents.slice(0, 10); // Return first 10 as simplified critical path
  }

  private identifyBottlenecks(events: ObservabilityEvent[]): TraceAnalysis['bottlenecks'] {
    const bottlenecks: TraceAnalysis['bottlenecks'] = [];
    
    // Find events with high duration
    const slowEvents = events.filter(e => e.metadata.duration && e.metadata.duration > 5000);
    
    for (const event of slowEvents.slice(0, 5)) {
      bottlenecks.push({
        event,
        impact: (event.metadata.duration || 0) / 1000, // Impact in seconds
        recommendation: this.generateBottleneckRecommendation(event)
      });
    }
    
    return bottlenecks;
  }

  private generateBottleneckRecommendation(event: ObservabilityEvent): string {
    if (event.type.includes('llm')) {
      return 'Consider using a faster LLM model or reducing prompt complexity';
    }
    if (event.type.includes('connector')) {
      return 'Check external API performance or implement caching';
    }
    if (event.type.includes('node')) {
      return 'Optimize node processing logic or consider parallel execution';
    }
    return 'Investigate processing delay and consider optimization';
  }

  private generateTraceInsights(events: ObservabilityEvent[], totalDuration: number, errorCount: number, warningCount: number): string[] {
    const insights: string[] = [];
    
    if (totalDuration > 60000) {
      insights.push(`Trace took ${(totalDuration / 1000).toFixed(1)} seconds - consider optimization`);
    }
    
    if (errorCount > 0) {
      insights.push(`${errorCount} error(s) occurred - check error details for issues`);
    }
    
    if (warningCount > 0) {
      insights.push(`${warningCount} warning(s) detected - review for potential issues`);
    }
    
    const llmEvents = events.filter(e => e.type.includes('llm'));
    if (llmEvents.length > 10) {
      insights.push(`High LLM usage (${llmEvents.length} calls) - consider caching or batching`);
    }
    
    const uniqueNodes = new Set(events.map(e => e.metadata.nodeId).filter(Boolean));
    insights.push(`Executed ${uniqueNodes.size} unique nodes`);
    
    return insights;
  }

  private checkAlertRules(event: ObservabilityEvent): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.isEnabled) continue;
      
      try {
        if (this.evaluateAlertCondition(rule, event)) {
          this.triggerAlert(rule, event);
        }
      } catch (error) {
        console.error(`Error evaluating alert rule ${rule.name}:`, error);
      }
    }
  }

  private evaluateAlertCondition(rule: AlertRule, event: ObservabilityEvent): boolean {
    const { condition } = rule;
    
    switch (condition.operator) {
      case 'eq':
        return event.severity === condition.value || event.type === condition.value;
      case 'contains':
        return event.searchable.includes(condition.value);
      case 'regex':
        return new RegExp(condition.value).test(event.searchable);
      case 'gt':
        if (condition.threshold && event.metadata.duration) {
          return event.metadata.duration > condition.threshold;
        }
        break;
      case 'lt':
        if (condition.threshold && event.metadata.duration) {
          return event.metadata.duration < condition.threshold;
        }
        break;
    }
    
    return false;
  }

  private triggerAlert(rule: AlertRule, event: ObservabilityEvent): void {
    rule.lastTriggered = new Date();
    rule.triggerCount++;
    this.alertRules.set(rule.id, rule);
    
    console.warn(`🚨 Alert triggered: ${rule.name}`, { event: event.id, rule: rule.id });
    
    // Execute alert actions
    for (const action of rule.actions) {
      if (action.isEnabled) {
        this.executeAlertAction(action, rule, event);
      }
    }
  }

  private executeAlertAction(action: AlertAction, rule: AlertRule, event: ObservabilityEvent): void {
    switch (action.type) {
      case 'log':
        console.error(`🚨 ALERT: ${rule.name} - ${event.title}: ${event.message}`);
        break;
      case 'webhook':
        // In production, make HTTP request to webhook URL
        console.log(`📞 Webhook alert for ${rule.name}:`, action.config.url);
        break;
      case 'email':
        // In production, send email
        console.log(`📧 Email alert for ${rule.name}:`, action.config.recipients);
        break;
      case 'slack':
        // In production, send Slack message
        console.log(`💬 Slack alert for ${rule.name}:`, action.config.channel);
        break;
    }
  }

  private generateMetricTrends(events: ObservabilityEvent[]): any {
    // Group events by hour
    const hourlyGroups: Record<string, { events: ObservabilityEvent[]; errors: number }> = {};
    
    for (const event of events) {
      const hour = event.timestamp.toISOString().slice(0, 13);
      if (!hourlyGroups[hour]) {
        hourlyGroups[hour] = { events: [], errors: 0 };
      }
      hourlyGroups[hour].events.push(event);
      if (event.severity === 'error' || event.severity === 'fatal') {
        hourlyGroups[hour].errors++;
      }
    }

    const hourlyEvents = Object.entries(hourlyGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, data]) => ({
        hour,
        count: data.events.length,
        errors: data.errors
      }));

    // Find top errors by fingerprint
    const errorGroups: Record<string, { count: number; message: string; lastSeen: Date }> = {};
    
    for (const event of events.filter(e => e.severity === 'error' || e.severity === 'fatal')) {
      if (!errorGroups[event.fingerprint]) {
        errorGroups[event.fingerprint] = {
          count: 0,
          message: event.message,
          lastSeen: event.timestamp
        };
      }
      errorGroups[event.fingerprint].count++;
      if (event.timestamp > errorGroups[event.fingerprint].lastSeen) {
        errorGroups[event.fingerprint].lastSeen = event.timestamp;
      }
    }

    const topErrors = Object.values(errorGroups)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Find slowest workflows
    const workflowGroups: Record<string, { durations: number[]; count: number }> = {};
    
    for (const event of events.filter(e => e.type === 'workflow_complete' && e.metadata.duration)) {
      const workflowId = event.metadata.workflowId || 'unknown';
      if (!workflowGroups[workflowId]) {
        workflowGroups[workflowId] = { durations: [], count: 0 };
      }
      workflowGroups[workflowId].durations.push(event.metadata.duration!);
      workflowGroups[workflowId].count++;
    }

    const slowestWorkflows = Object.entries(workflowGroups)
      .map(([workflowId, data]) => ({
        workflowId,
        averageDuration: data.durations.reduce((a, b) => a + b, 0) / data.durations.length,
        count: data.count
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 10);

    // Calculate cost by hour
    const costByHour = Object.entries(hourlyGroups)
      .map(([hour, data]) => ({
        hour,
        cost: data.events.reduce((sum, e) => sum + (e.metadata.cost || 0), 0)
      }))
      .sort(([a], [b]) => a.localeCompare(b));

    return {
      hourlyEvents,
      topErrors,
      slowestWorkflows,
      costByHour
    };
  }

  private assessSystemHealth(events: ObservabilityEvent[]): any {
    const recentEvents = events.filter(e => 
      e.timestamp > new Date(Date.now() - 60 * 60 * 1000) // Last hour
    );

    const errorRate = recentEvents.length > 0 ? 
      recentEvents.filter(e => e.severity === 'error' || e.severity === 'fatal').length / recentEvents.length * 100 : 0;

    let systemStatus: 'healthy' | 'degraded' | 'critical';
    if (errorRate > 10) {
      systemStatus = 'critical';
    } else if (errorRate > 5) {
      systemStatus = 'degraded';
    } else {
      systemStatus = 'healthy';
    }

    // Identify common issues
    const issues: Array<{ severity: LogLevel; message: string; count: number }> = [];
    const issueGroups: Record<string, { severity: LogLevel; count: number }> = {};

    for (const event of recentEvents.filter(e => e.severity === 'error' || e.severity === 'warn')) {
      const key = `${event.severity}:${event.title}`;
      if (!issueGroups[key]) {
        issueGroups[key] = { severity: event.severity, count: 0 };
      }
      issueGroups[key].count++;
    }

    for (const [message, data] of Object.entries(issueGroups)) {
      issues.push({
        severity: data.severity,
        message: message.split(':')[1],
        count: data.count
      });
    }

    // Simple uptime calculation (time since first event)
    const firstEvent = this.events[0];
    const uptime = firstEvent ? Date.now() - firstEvent.timestamp.getTime() : 0;

    return {
      systemStatus,
      issues: issues.sort((a, b) => b.count - a.count).slice(0, 10),
      uptime
    };
  }

  private initializeBuiltinAlerts(): void {
    // High error rate alert
    this.createAlertRule({
      name: 'High Error Rate',
      description: 'Triggers when error rate exceeds 10% in a 5-minute window',
      query: { severity: ['error', 'fatal'] },
      condition: { operator: 'gt', threshold: 10, window: 5 },
      actions: [
        { type: 'log', config: {}, isEnabled: true }
      ],
      createdBy: 'system'
    });

    // Slow LLM response alert
    this.createAlertRule({
      name: 'Slow LLM Response',
      description: 'Triggers when LLM response time exceeds 30 seconds',
      query: { type: ['llm_response'] },
      condition: { operator: 'gt', threshold: 30000 },
      actions: [
        { type: 'log', config: {}, isEnabled: true }
      ],
      createdBy: 'system'
    });

    // Workflow failure alert
    this.createAlertRule({
      name: 'Workflow Failure',
      description: 'Triggers when any workflow fails',
      query: { type: ['workflow_fail'] },
      condition: { operator: 'eq', value: 'workflow_fail' },
      actions: [
        { type: 'log', config: {}, isEnabled: true }
      ],
      createdBy: 'system'
    });
  }

  private startMaintenanceTasks(): void {
    // Clean up old events every hour
    setInterval(() => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const initialCount = this.events.length;
      this.events = this.events.filter(e => e.timestamp > cutoff);
      
      if (initialCount > this.events.length) {
        console.log(`🧹 Cleaned up ${initialCount - this.events.length} old events`);
      }
    }, 60 * 60 * 1000);

    // Clean up old correlation contexts every 30 minutes
    setInterval(() => {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      let cleaned = 0;
      
      for (const [id, context] of this.correlationContexts.entries()) {
        if (context.startTime < cutoff) {
          this.correlationContexts.delete(id);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old correlation contexts`);
      }
    }, 30 * 60 * 1000);
  }
}

export const observabilityManager = new ObservabilityManager();