/**
 * WEBHOOK BACKFILL ENGINE
 * Recovers missed webhooks during downtime using intelligent time-window polling
 */

export interface BackfillJob {
  id: string;
  connectorId: string;
  workflowId: string;
  userId: string;
  timeWindow: {
    start: Date;
    end: Date;
  };
  status: BackfillStatus;
  strategy: BackfillStrategy;
  config: BackfillConfig;
  progress: BackfillProgress;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastError?: string;
  retryCount: number;
  maxRetries: number;
}

export type BackfillStatus = 
  | 'pending' | 'running' | 'completed' | 'failed' 
  | 'paused' | 'cancelled' | 'partially_completed';

export type BackfillStrategy = 
  | 'api_polling' | 'event_log_replay' | 'timestamp_scan' 
  | 'cursor_based' | 'hybrid' | 'incremental_sync';

export interface BackfillConfig {
  batchSize: number;
  delayBetweenBatches: number; // milliseconds
  maxConcurrentRequests: number;
  timeoutPerRequest: number; // milliseconds
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  deduplication: {
    enabled: boolean;
    keyFields: string[];
    lookbackWindow: number; // hours
  };
  filters: {
    eventTypes?: string[];
    minPriority?: string;
    excludePatterns?: string[];
  };
}

export interface BackfillProgress {
  totalEstimated: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  duplicates: number;
  currentBatch: number;
  totalBatches: number;
  estimatedTimeRemaining: number; // milliseconds
  throughputPerMinute: number;
  lastProcessedTimestamp?: Date;
}

export interface BackfillResult {
  jobId: string;
  status: BackfillStatus;
  summary: {
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    duplicateEvents: number;
    processingTime: number; // milliseconds
    averageLatency: number; // milliseconds
  };
  timeline: BackfillTimelineEntry[];
  errors: BackfillError[];
  recoveredEvents: RecoveredEvent[];
}

export interface BackfillTimelineEntry {
  timestamp: Date;
  event: BackfillEventType;
  description: string;
  details?: Record<string, any>;
}

export type BackfillEventType = 
  | 'job_started' | 'batch_started' | 'batch_completed' | 'batch_failed'
  | 'error_occurred' | 'job_paused' | 'job_resumed' | 'job_completed';

export interface BackfillError {
  timestamp: Date;
  batchId: string;
  errorType: string;
  message: string;
  details: Record<string, any>;
  retryable: boolean;
}

export interface RecoveredEvent {
  id: string;
  originalTimestamp: Date;
  recoveredAt: Date;
  eventType: string;
  source: string;
  data: Record<string, any>;
  processedSuccessfully: boolean;
  workflowExecutionId?: string;
}

export interface ConnectorBackfillSupport {
  connectorId: string;
  name: string;
  supported: boolean;
  strategies: BackfillStrategy[];
  capabilities: {
    supportsTimestampFiltering: boolean;
    supportsCursorPagination: boolean;
    supportsEventLog: boolean;
    maxLookbackDays: number;
    rateLimits: {
      requestsPerMinute: number;
      requestsPerHour: number;
      requestsPerDay: number;
    };
  };
  endpoints: {
    eventList?: string;
    eventLog?: string;
    timestampQuery?: string;
  };
  authentication: {
    type: 'oauth' | 'api_key' | 'basic' | 'custom';
    requiredScopes?: string[];
  };
}

export interface WebhookDowntimeRecord {
  id: string;
  workflowId: string;
  connectorId: string;
  startTime: Date;
  endTime?: Date;
  detectedAt: Date;
  resolvedAt?: Date;
  cause: DowntimeCause;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedWebhooks: string[];
  estimatedMissedEvents: number;
  backfillJobId?: string;
  autoBackfillEnabled: boolean;
}

export type DowntimeCause = 
  | 'system_maintenance' | 'server_error' | 'network_failure' 
  | 'rate_limit_exceeded' | 'webhook_endpoint_down' | 'configuration_error'
  | 'provider_outage' | 'unknown';

class WebhookBackfillEngine {
  private jobs = new Map<string, BackfillJob>();
  private downtimeRecords = new Map<string, WebhookDowntimeRecord>();
  private connectorSupport = new Map<string, ConnectorBackfillSupport>();
  private runningJobs = new Set<string>();
  
  private readonly maxConcurrentJobs = 5;
  private readonly defaultConfig: BackfillConfig = {
    batchSize: 100,
    delayBetweenBatches: 1000,
    maxConcurrentRequests: 3,
    timeoutPerRequest: 30000,
    retryPolicy: {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelay: 1000
    },
    deduplication: {
      enabled: true,
      keyFields: ['id', 'timestamp', 'type'],
      lookbackWindow: 24
    },
    filters: {
      eventTypes: [],
      excludePatterns: []
    }
  };

  constructor() {
    this.initializeConnectorSupport();
    this.startDowntimeMonitoring();
    this.startJobProcessor();
    console.log('🔄 Webhook Backfill Engine initialized');
  }

  /**
   * Create a new backfill job
   */
  createBackfillJob(data: {
    connectorId: string;
    workflowId: string;
    userId: string;
    timeWindow: { start: Date; end: Date };
    strategy?: BackfillStrategy;
    config?: Partial<BackfillConfig>;
  }): BackfillJob {
    const id = this.generateJobId();
    
    // Validate connector support
    const connectorSupport = this.connectorSupport.get(data.connectorId);
    if (!connectorSupport?.supported) {
      throw new Error(`Backfill not supported for connector: ${data.connectorId}`);
    }

    // Determine optimal strategy
    const strategy = data.strategy || this.selectOptimalStrategy(data.connectorId, data.timeWindow);
    
    // Merge configuration
    const config = { ...this.defaultConfig, ...data.config };

    const job: BackfillJob = {
      id,
      connectorId: data.connectorId,
      workflowId: data.workflowId,
      userId: data.userId,
      timeWindow: data.timeWindow,
      status: 'pending',
      strategy,
      config,
      progress: {
        totalEstimated: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        duplicates: 0,
        currentBatch: 0,
        totalBatches: 0,
        estimatedTimeRemaining: 0,
        throughputPerMinute: 0
      },
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3
    };

    this.jobs.set(id, job);
    console.log(`📋 Created backfill job ${id} for connector ${data.connectorId}`);
    
    return job;
  }

  /**
   * Start a backfill job
   */
  async startBackfillJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Backfill job not found: ${jobId}`);
    }

    if (job.status !== 'pending' && job.status !== 'paused') {
      throw new Error(`Cannot start job in status: ${job.status}`);
    }

    if (this.runningJobs.size >= this.maxConcurrentJobs) {
      throw new Error('Maximum concurrent jobs reached. Please try again later.');
    }

    job.status = 'running';
    job.startedAt = new Date();
    this.runningJobs.add(jobId);

    console.log(`🚀 Starting backfill job ${jobId}`);
    
    // Process job asynchronously
    this.processJob(job).catch(error => {
      console.error(`❌ Backfill job ${jobId} failed:`, error);
      job.status = 'failed';
      job.lastError = error.message;
      this.runningJobs.delete(jobId);
    });
  }

  /**
   * Process a backfill job using the selected strategy
   */
  private async processJob(job: BackfillJob): Promise<void> {
    try {
      const connectorSupport = this.connectorSupport.get(job.connectorId)!;
      
      // Estimate total events
      job.progress.totalEstimated = await this.estimateEventCount(job, connectorSupport);
      job.progress.totalBatches = Math.ceil(job.progress.totalEstimated / job.config.batchSize);

      const timeline: BackfillTimelineEntry[] = [];
      const errors: BackfillError[] = [];
      const recoveredEvents: RecoveredEvent[] = [];

      timeline.push({
        timestamp: new Date(),
        event: 'job_started',
        description: `Started backfill using ${job.strategy} strategy`,
        details: { estimatedEvents: job.progress.totalEstimated }
      });

      // Process based on strategy
      switch (job.strategy) {
        case 'api_polling':
          await this.processApiPolling(job, connectorSupport, timeline, errors, recoveredEvents);
          break;
        case 'event_log_replay':
          await this.processEventLogReplay(job, connectorSupport, timeline, errors, recoveredEvents);
          break;
        case 'timestamp_scan':
          await this.processTimestampScan(job, connectorSupport, timeline, errors, recoveredEvents);
          break;
        case 'cursor_based':
          await this.processCursorBased(job, connectorSupport, timeline, errors, recoveredEvents);
          break;
        case 'hybrid':
          await this.processHybrid(job, connectorSupport, timeline, errors, recoveredEvents);
          break;
        default:
          throw new Error(`Unsupported backfill strategy: ${job.strategy}`);
      }

      // Complete job
      job.status = 'completed';
      job.completedAt = new Date();
      
      timeline.push({
        timestamp: new Date(),
        event: 'job_completed',
        description: `Backfill completed successfully`,
        details: { 
          duration: job.completedAt.getTime() - job.startedAt!.getTime(),
          eventsRecovered: recoveredEvents.length
        }
      });

      console.log(`✅ Backfill job ${job.id} completed: ${recoveredEvents.length} events recovered`);

    } catch (error) {
      job.status = 'failed';
      job.lastError = error.message;
      console.error(`❌ Backfill job ${job.id} failed:`, error);
    } finally {
      this.runningJobs.delete(job.id);
    }
  }

  /**
   * Process backfill using API polling strategy
   */
  private async processApiPolling(
    job: BackfillJob,
    connectorSupport: ConnectorBackfillSupport,
    timeline: BackfillTimelineEntry[],
    errors: BackfillError[],
    recoveredEvents: RecoveredEvent[]
  ): Promise<void> {
    const startTime = job.timeWindow.start;
    const endTime = job.timeWindow.end;
    const batchDuration = (endTime.getTime() - startTime.getTime()) / job.progress.totalBatches;

    for (let batch = 0; batch < job.progress.totalBatches; batch++) {
      if (job.status !== 'running') break;

      const batchStart = new Date(startTime.getTime() + batch * batchDuration);
      const batchEnd = new Date(Math.min(batchStart.getTime() + batchDuration, endTime.getTime()));

      timeline.push({
        timestamp: new Date(),
        event: 'batch_started',
        description: `Processing batch ${batch + 1}/${job.progress.totalBatches}`,
        details: { batchStart, batchEnd }
      });

      try {
        // Simulate API polling for events in time window
        const batchEvents = await this.pollEventsFromConnector(
          job.connectorId,
          batchStart,
          batchEnd,
          job.config
        );

        // Process and deduplicate events
        const processedEvents = await this.processAndDeduplicateEvents(
          batchEvents,
          job,
          connectorSupport
        );

        // Execute workflows for recovered events
        for (const event of processedEvents) {
          try {
            const executionId = await this.executeWorkflowForEvent(job.workflowId, event);
            
            const recoveredEvent: RecoveredEvent = {
              id: event.id,
              originalTimestamp: event.timestamp,
              recoveredAt: new Date(),
              eventType: event.type,
              source: job.connectorId,
              data: event.data,
              processedSuccessfully: true,
              workflowExecutionId: executionId
            };
            
            recoveredEvents.push(recoveredEvent);
            job.progress.successful++;
          } catch (error) {
            job.progress.failed++;
            errors.push({
              timestamp: new Date(),
              batchId: `batch_${batch}`,
              errorType: 'workflow_execution_error',
              message: error.message,
              details: { eventId: event.id },
              retryable: true
            });
          }
        }

        job.progress.currentBatch = batch + 1;
        job.progress.processed += batchEvents.length;
        
        timeline.push({
          timestamp: new Date(),
          event: 'batch_completed',
          description: `Batch ${batch + 1} completed`,
          details: { eventsProcessed: batchEvents.length, eventsRecovered: processedEvents.length }
        });

        // Delay between batches to respect rate limits
        if (batch < job.progress.totalBatches - 1) {
          await this.delay(job.config.delayBetweenBatches);
        }

      } catch (error) {
        timeline.push({
          timestamp: new Date(),
          event: 'batch_failed',
          description: `Batch ${batch + 1} failed`,
          details: { error: error.message }
        });

        errors.push({
          timestamp: new Date(),
          batchId: `batch_${batch}`,
          errorType: 'batch_processing_error',
          message: error.message,
          details: { batchStart, batchEnd },
          retryable: true
        });

        job.progress.failed++;
      }

      // Update progress metrics
      this.updateProgressMetrics(job);
    }
  }

  /**
   * Process backfill using event log replay strategy
   */
  private async processEventLogReplay(
    job: BackfillJob,
    connectorSupport: ConnectorBackfillSupport,
    timeline: BackfillTimelineEntry[],
    errors: BackfillError[],
    recoveredEvents: RecoveredEvent[]
  ): Promise<void> {
    // Simulate event log replay for supported connectors
    if (!connectorSupport.endpoints.eventLog) {
      throw new Error('Event log endpoint not available for this connector');
    }

    timeline.push({
      timestamp: new Date(),
      event: 'batch_started',
      description: 'Starting event log replay',
      details: { strategy: 'event_log_replay' }
    });

    try {
      // Fetch events from event log
      const events = await this.fetchFromEventLog(
        job.connectorId,
        job.timeWindow.start,
        job.timeWindow.end,
        job.config
      );

      // Process events in batches
      const batches = this.chunkArray(events, job.config.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        for (const event of batch) {
          try {
            const executionId = await this.executeWorkflowForEvent(job.workflowId, event);
            
            recoveredEvents.push({
              id: event.id,
              originalTimestamp: event.timestamp,
              recoveredAt: new Date(),
              eventType: event.type,
              source: job.connectorId,
              data: event.data,
              processedSuccessfully: true,
              workflowExecutionId: executionId
            });
            
            job.progress.successful++;
          } catch (error) {
            job.progress.failed++;
          }
        }

        job.progress.currentBatch = i + 1;
        job.progress.processed += batch.length;
        
        await this.delay(job.config.delayBetweenBatches);
      }

      timeline.push({
        timestamp: new Date(),
        event: 'batch_completed',
        description: 'Event log replay completed',
        details: { totalEvents: events.length, recoveredEvents: recoveredEvents.length }
      });

    } catch (error) {
      timeline.push({
        timestamp: new Date(),
        event: 'batch_failed',
        description: 'Event log replay failed',
        details: { error: error.message }
      });
      throw error;
    }
  }

  /**
   * Process backfill using timestamp scan strategy
   */
  private async processTimestampScan(
    job: BackfillJob,
    connectorSupport: ConnectorBackfillSupport,
    timeline: BackfillTimelineEntry[],
    errors: BackfillError[],
    recoveredEvents: RecoveredEvent[]
  ): Promise<void> {
    // Implementation for timestamp-based scanning
    console.log(`📅 Processing timestamp scan for job ${job.id}`);
    
    // Simulate timestamp-based event recovery
    const mockEvents = this.generateMockEvents(job.timeWindow.start, job.timeWindow.end, 50);
    
    for (const event of mockEvents) {
      try {
        const executionId = await this.executeWorkflowForEvent(job.workflowId, event);
        
        recoveredEvents.push({
          id: event.id,
          originalTimestamp: event.timestamp,
          recoveredAt: new Date(),
          eventType: event.type,
          source: job.connectorId,
          data: event.data,
          processedSuccessfully: true,
          workflowExecutionId: executionId
        });
        
        job.progress.successful++;
      } catch (error) {
        job.progress.failed++;
      }
    }
    
    job.progress.processed = mockEvents.length;
  }

  /**
   * Process backfill using cursor-based pagination
   */
  private async processCursorBased(
    job: BackfillJob,
    connectorSupport: ConnectorBackfillSupport,
    timeline: BackfillTimelineEntry[],
    errors: BackfillError[],
    recoveredEvents: RecoveredEvent[]
  ): Promise<void> {
    // Implementation for cursor-based pagination
    console.log(`🔄 Processing cursor-based backfill for job ${job.id}`);
    
    // Simulate cursor-based pagination
    let cursor = null;
    let batchCount = 0;
    
    do {
      const result = await this.fetchEventsByCursor(job.connectorId, cursor, job.config.batchSize);
      
      for (const event of result.events) {
        try {
          const executionId = await this.executeWorkflowForEvent(job.workflowId, event);
          
          recoveredEvents.push({
            id: event.id,
            originalTimestamp: event.timestamp,
            recoveredAt: new Date(),
            eventType: event.type,
            source: job.connectorId,
            data: event.data,
            processedSuccessfully: true,
            workflowExecutionId: executionId
          });
          
          job.progress.successful++;
        } catch (error) {
          job.progress.failed++;
        }
      }
      
      cursor = result.nextCursor;
      batchCount++;
      job.progress.currentBatch = batchCount;
      job.progress.processed += result.events.length;
      
      await this.delay(job.config.delayBetweenBatches);
      
    } while (cursor && job.status === 'running');
  }

  /**
   * Process backfill using hybrid strategy
   */
  private async processHybrid(
    job: BackfillJob,
    connectorSupport: ConnectorBackfillSupport,
    timeline: BackfillTimelineEntry[],
    errors: BackfillError[],
    recoveredEvents: RecoveredEvent[]
  ): Promise<void> {
    // Combine multiple strategies for optimal recovery
    console.log(`🔀 Processing hybrid backfill for job ${job.id}`);
    
    // Start with event log if available
    if (connectorSupport.endpoints.eventLog) {
      await this.processEventLogReplay(job, connectorSupport, timeline, errors, recoveredEvents);
    }
    
    // Fill gaps with API polling
    await this.processApiPolling(job, connectorSupport, timeline, errors, recoveredEvents);
  }

  /**
   * Detect webhook downtime automatically
   */
  detectWebhookDowntime(workflowId: string, connectorId: string, cause: DowntimeCause): WebhookDowntimeRecord {
    const id = this.generateDowntimeId();
    
    const record: WebhookDowntimeRecord = {
      id,
      workflowId,
      connectorId,
      startTime: new Date(),
      detectedAt: new Date(),
      cause,
      severity: this.determineSeverity(cause),
      affectedWebhooks: [`${workflowId}:${connectorId}`],
      estimatedMissedEvents: 0,
      autoBackfillEnabled: true
    };

    this.downtimeRecords.set(id, record);
    
    console.log(`🚨 Detected webhook downtime: ${id} for ${workflowId}:${connectorId}`);
    
    // Auto-create backfill job if enabled
    if (record.autoBackfillEnabled) {
      setTimeout(() => {
        this.autoCreateBackfillJob(record);
      }, 5 * 60 * 1000); // Wait 5 minutes before starting backfill
    }
    
    return record;
  }

  /**
   * Resolve webhook downtime and trigger backfill
   */
  resolveWebhookDowntime(downtimeId: string): void {
    const record = this.downtimeRecords.get(downtimeId);
    if (!record) return;

    record.endTime = new Date();
    record.resolvedAt = new Date();
    
    const downtimeDuration = record.endTime.getTime() - record.startTime.getTime();
    record.estimatedMissedEvents = this.estimateMissedEvents(record.connectorId, downtimeDuration);
    
    console.log(`✅ Resolved webhook downtime: ${downtimeId}, estimated ${record.estimatedMissedEvents} missed events`);
    
    // Create backfill job for the downtime period
    if (record.autoBackfillEnabled && record.estimatedMissedEvents > 0) {
      this.autoCreateBackfillJob(record);
    }
  }

  /**
   * Get backfill job status and progress
   */
  getBackfillJob(jobId: string): BackfillJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * List all backfill jobs with optional filtering
   */
  listBackfillJobs(filters?: {
    connectorId?: string;
    workflowId?: string;
    userId?: string;
    status?: BackfillStatus;
    timeRange?: { start: Date; end: Date };
  }): BackfillJob[] {
    let jobs = Array.from(this.jobs.values());

    if (filters) {
      if (filters.connectorId) {
        jobs = jobs.filter(job => job.connectorId === filters.connectorId);
      }
      if (filters.workflowId) {
        jobs = jobs.filter(job => job.workflowId === filters.workflowId);
      }
      if (filters.userId) {
        jobs = jobs.filter(job => job.userId === filters.userId);
      }
      if (filters.status) {
        jobs = jobs.filter(job => job.status === filters.status);
      }
      if (filters.timeRange) {
        jobs = jobs.filter(job => 
          job.createdAt >= filters.timeRange!.start && 
          job.createdAt <= filters.timeRange!.end
        );
      }
    }

    return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Cancel a running backfill job
   */
  cancelBackfillJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.status === 'running') {
      job.status = 'cancelled';
      this.runningJobs.delete(jobId);
      console.log(`🛑 Cancelled backfill job: ${jobId}`);
    }
  }

  /**
   * Get connector backfill capabilities
   */
  getConnectorCapabilities(connectorId: string): ConnectorBackfillSupport | null {
    return this.connectorSupport.get(connectorId) || null;
  }

  /**
   * Get backfill analytics and statistics
   */
  getBackfillAnalytics(timeframe?: { start: Date; end: Date }): {
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    totalEventsRecovered: number;
    averageRecoveryTime: number;
    topConnectors: Array<{ connectorId: string; jobCount: number; successRate: number }>;
    downtimeStatistics: {
      totalDowntimeEvents: number;
      averageDowntimeDuration: number;
      topCauses: Array<{ cause: DowntimeCause; count: number }>;
    };
  } {
    let jobs = Array.from(this.jobs.values());
    let downtimes = Array.from(this.downtimeRecords.values());

    if (timeframe) {
      jobs = jobs.filter(job => 
        job.createdAt >= timeframe.start && job.createdAt <= timeframe.end
      );
      downtimes = downtimes.filter(downtime => 
        downtime.detectedAt >= timeframe.start && downtime.detectedAt <= timeframe.end
      );
    }

    const completedJobs = jobs.filter(job => job.status === 'completed');
    const totalEventsRecovered = completedJobs.reduce((sum, job) => sum + job.progress.successful, 0);
    
    const averageRecoveryTime = completedJobs.length > 0 ?
      completedJobs.reduce((sum, job) => {
        const duration = job.completedAt ? 
          job.completedAt.getTime() - job.startedAt!.getTime() : 0;
        return sum + duration;
      }, 0) / completedJobs.length : 0;

    // Connector statistics
    const connectorStats = new Map<string, { jobCount: number; successful: number }>();
    jobs.forEach(job => {
      if (!connectorStats.has(job.connectorId)) {
        connectorStats.set(job.connectorId, { jobCount: 0, successful: 0 });
      }
      const stats = connectorStats.get(job.connectorId)!;
      stats.jobCount++;
      if (job.status === 'completed') stats.successful++;
    });

    const topConnectors = Array.from(connectorStats.entries()).map(([connectorId, stats]) => ({
      connectorId,
      jobCount: stats.jobCount,
      successRate: stats.jobCount > 0 ? (stats.successful / stats.jobCount) * 100 : 0
    })).sort((a, b) => b.jobCount - a.jobCount).slice(0, 10);

    // Downtime statistics
    const resolvedDowntimes = downtimes.filter(d => d.endTime);
    const averageDowntimeDuration = resolvedDowntimes.length > 0 ?
      resolvedDowntimes.reduce((sum, d) => sum + (d.endTime!.getTime() - d.startTime.getTime()), 0) / resolvedDowntimes.length : 0;

    const causeStats = new Map<DowntimeCause, number>();
    downtimes.forEach(d => {
      causeStats.set(d.cause, (causeStats.get(d.cause) || 0) + 1);
    });

    const topCauses = Array.from(causeStats.entries()).map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalJobs: jobs.length,
      successfulJobs: jobs.filter(job => job.status === 'completed').length,
      failedJobs: jobs.filter(job => job.status === 'failed').length,
      totalEventsRecovered,
      averageRecoveryTime,
      topConnectors,
      downtimeStatistics: {
        totalDowntimeEvents: downtimes.length,
        averageDowntimeDuration,
        topCauses
      }
    };
  }

  // Private helper methods

  private generateJobId(): string {
    return `backfill_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private generateDowntimeId(): string {
    return `downtime_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  private initializeConnectorSupport(): void {
    // Initialize backfill support for major connectors
    const supportedConnectors: ConnectorBackfillSupport[] = [
      {
        connectorId: 'slack',
        name: 'Slack',
        supported: true,
        strategies: ['api_polling', 'timestamp_scan'],
        capabilities: {
          supportsTimestampFiltering: true,
          supportsCursorPagination: true,
          supportsEventLog: false,
          maxLookbackDays: 30,
          rateLimits: {
            requestsPerMinute: 50,
            requestsPerHour: 1000,
            requestsPerDay: 10000
          }
        },
        endpoints: {
          timestampQuery: 'https://api.slack.com/api/conversations.history'
        },
        authentication: {
          type: 'oauth',
          requiredScopes: ['channels:history', 'channels:read']
        }
      },
      {
        connectorId: 'github',
        name: 'GitHub',
        supported: true,
        strategies: ['api_polling', 'event_log_replay', 'hybrid'],
        capabilities: {
          supportsTimestampFiltering: true,
          supportsCursorPagination: true,
          supportsEventLog: true,
          maxLookbackDays: 90,
          rateLimits: {
            requestsPerMinute: 60,
            requestsPerHour: 5000,
            requestsPerDay: 5000
          }
        },
        endpoints: {
          eventList: 'https://api.github.com/repos/{owner}/{repo}/events',
          eventLog: 'https://api.github.com/repos/{owner}/{repo}/events',
          timestampQuery: 'https://api.github.com/repos/{owner}/{repo}/events'
        },
        authentication: {
          type: 'oauth',
          requiredScopes: ['repo']
        }
      },
      {
        connectorId: 'gmail',
        name: 'Gmail',
        supported: true,
        strategies: ['api_polling', 'timestamp_scan'],
        capabilities: {
          supportsTimestampFiltering: true,
          supportsCursorPagination: false,
          supportsEventLog: false,
          maxLookbackDays: 365,
          rateLimits: {
            requestsPerMinute: 25,
            requestsPerHour: 1000,
            requestsPerDay: 1000000
          }
        },
        endpoints: {
          timestampQuery: 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
        },
        authentication: {
          type: 'oauth',
          requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly']
        }
      }
    ];

    supportedConnectors.forEach(connector => {
      this.connectorSupport.set(connector.connectorId, connector);
    });

    console.log(`📋 Initialized backfill support for ${supportedConnectors.length} connectors`);
  }

  private selectOptimalStrategy(connectorId: string, timeWindow: { start: Date; end: Date }): BackfillStrategy {
    const support = this.connectorSupport.get(connectorId);
    if (!support) return 'api_polling';

    const windowDuration = timeWindow.end.getTime() - timeWindow.start.getTime();
    const windowHours = windowDuration / (1000 * 60 * 60);

    // Select strategy based on time window and capabilities
    if (windowHours <= 1 && support.capabilities.supportsEventLog) {
      return 'event_log_replay';
    } else if (windowHours <= 6 && support.capabilities.supportsCursorPagination) {
      return 'cursor_based';
    } else if (windowHours <= 24) {
      return 'timestamp_scan';
    } else if (support.strategies.includes('hybrid')) {
      return 'hybrid';
    } else {
      return 'api_polling';
    }
  }

  private async estimateEventCount(job: BackfillJob, connectorSupport: ConnectorBackfillSupport): Promise<number> {
    // Estimate based on connector type and time window
    const windowHours = (job.timeWindow.end.getTime() - job.timeWindow.start.getTime()) / (1000 * 60 * 60);
    
    // Rough estimates based on connector activity patterns
    const estimatesPerHour: Record<string, number> = {
      slack: 50,
      github: 20,
      gmail: 10,
      trello: 5,
      asana: 8,
      notion: 3
    };

    const hourlyRate = estimatesPerHour[job.connectorId] || 10;
    return Math.ceil(windowHours * hourlyRate);
  }

  private async pollEventsFromConnector(
    connectorId: string,
    startTime: Date,
    endTime: Date,
    config: BackfillConfig
  ): Promise<any[]> {
    // Simulate polling events from connector API
    console.log(`🔍 Polling events from ${connectorId}: ${startTime.toISOString()} to ${endTime.toISOString()}`);
    
    // Generate mock events for simulation
    return this.generateMockEvents(startTime, endTime, config.batchSize);
  }

  private async fetchFromEventLog(
    connectorId: string,
    startTime: Date,
    endTime: Date,
    config: BackfillConfig
  ): Promise<any[]> {
    // Simulate fetching from event log
    console.log(`📜 Fetching from event log: ${connectorId}`);
    return this.generateMockEvents(startTime, endTime, config.batchSize * 2);
  }

  private async fetchEventsByCursor(
    connectorId: string,
    cursor: string | null,
    batchSize: number
  ): Promise<{ events: any[]; nextCursor: string | null }> {
    // Simulate cursor-based pagination
    const events = this.generateMockEvents(new Date(Date.now() - 86400000), new Date(), batchSize);
    const nextCursor = cursor ? null : 'next_cursor_token';
    
    return { events, nextCursor };
  }

  private generateMockEvents(startTime: Date, endTime: Date, count: number): any[] {
    const events = [];
    const duration = endTime.getTime() - startTime.getTime();
    
    for (let i = 0; i < count; i++) {
      const timestamp = new Date(startTime.getTime() + Math.random() * duration);
      events.push({
        id: `event_${Date.now()}_${i}`,
        type: 'message_received',
        timestamp,
        data: {
          message: `Sample event ${i}`,
          user: `user_${i % 5}`,
          channel: `channel_${i % 3}`
        }
      });
    }
    
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private async processAndDeduplicateEvents(
    events: any[],
    job: BackfillJob,
    connectorSupport: ConnectorBackfillSupport
  ): Promise<any[]> {
    if (!job.config.deduplication.enabled) {
      return events;
    }

    // Simple deduplication based on key fields
    const seen = new Set<string>();
    const deduplicated = [];

    for (const event of events) {
      const key = job.config.deduplication.keyFields
        .map(field => event[field])
        .join('|');
      
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(event);
      } else {
        job.progress.duplicates++;
      }
    }

    return deduplicated;
  }

  private async executeWorkflowForEvent(workflowId: string, event: any): Promise<string> {
    // Simulate workflow execution
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    // Add small delay to simulate processing
    await this.delay(100 + Math.random() * 200);
    
    console.log(`⚡ Executed workflow ${workflowId} for event ${event.id}: ${executionId}`);
    return executionId;
  }

  private updateProgressMetrics(job: BackfillJob): void {
    const now = Date.now();
    const elapsed = now - job.startedAt!.getTime();
    
    if (elapsed > 0 && job.progress.processed > 0) {
      job.progress.throughputPerMinute = (job.progress.processed / elapsed) * 60000;
      
      const remaining = job.progress.totalEstimated - job.progress.processed;
      job.progress.estimatedTimeRemaining = remaining > 0 ? 
        (remaining / job.progress.throughputPerMinute) * 60000 : 0;
    }
  }

  private autoCreateBackfillJob(downtimeRecord: WebhookDowntimeRecord): void {
    if (!downtimeRecord.endTime) return;

    try {
      const job = this.createBackfillJob({
        connectorId: downtimeRecord.connectorId,
        workflowId: downtimeRecord.workflowId,
        userId: 'system',
        timeWindow: {
          start: downtimeRecord.startTime,
          end: downtimeRecord.endTime
        },
        strategy: 'hybrid'
      });

      downtimeRecord.backfillJobId = job.id;
      
      // Start the job automatically
      this.startBackfillJob(job.id);
      
      console.log(`🤖 Auto-created backfill job ${job.id} for downtime ${downtimeRecord.id}`);
      
    } catch (error) {
      console.error(`❌ Failed to auto-create backfill job for downtime ${downtimeRecord.id}:`, error);
    }
  }

  private determineSeverity(cause: DowntimeCause): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<DowntimeCause, 'low' | 'medium' | 'high' | 'critical'> = {
      system_maintenance: 'low',
      server_error: 'high',
      network_failure: 'medium',
      rate_limit_exceeded: 'medium',
      webhook_endpoint_down: 'high',
      configuration_error: 'medium',
      provider_outage: 'critical',
      unknown: 'medium'
    };

    return severityMap[cause] || 'medium';
  }

  private estimateMissedEvents(connectorId: string, downtimeDuration: number): number {
    // Estimate based on connector activity patterns
    const eventsPerHour: Record<string, number> = {
      slack: 50,
      github: 20,
      gmail: 10,
      trello: 5,
      asana: 8,
      notion: 3
    };

    const hourlyRate = eventsPerHour[connectorId] || 10;
    const hours = downtimeDuration / (1000 * 60 * 60);
    
    return Math.ceil(hours * hourlyRate);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private startDowntimeMonitoring(): void {
    // Monitor for webhook downtime every 30 seconds
    setInterval(() => {
      // In production, this would monitor actual webhook health
      console.log('📊 Monitoring webhook health...');
    }, 30000);
  }

  private startJobProcessor(): void {
    // Process pending jobs every 10 seconds
    setInterval(() => {
      const pendingJobs = Array.from(this.jobs.values())
        .filter(job => job.status === 'pending')
        .slice(0, this.maxConcurrentJobs - this.runningJobs.size);

      pendingJobs.forEach(job => {
        if (this.runningJobs.size < this.maxConcurrentJobs) {
          this.startBackfillJob(job.id).catch(error => {
            console.error(`Failed to auto-start backfill job ${job.id}:`, error);
          });
        }
      });
    }, 10000);
  }
}

export const webhookBackfillEngine = new WebhookBackfillEngine();