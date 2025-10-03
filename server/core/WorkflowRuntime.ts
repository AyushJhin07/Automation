/**
 * WorkflowRuntime - Server-side execution of workflows
 * This complements the Google Apps Script compiler by providing
 * server-side execution capabilities, especially for LLM nodes
 */

import { NodeGraph, GraphNode, ParameterContext } from '../../shared/nodeGraphSchema';
import { runLLMGenerate, runLLMExtract, runLLMClassify, runLLMToolCall } from '../nodes/llm/executeLLM';
import { resolveAllParams } from './ParameterResolver';
import { retryManager, RetryPolicy } from './RetryManager';
import { runExecutionManager } from './RunExecutionManager';
import type { NodeExecution } from './RunExecutionManager';
import {
  nodeSandbox,
  collectSecretStrings,
  SandboxPolicyViolationError,
} from '../runtime/NodeSandbox';
import { db, workflowTimers } from '../database/schema.js';
import type { WorkflowResumeState, WorkflowTimerPayload } from '../types/workflowTimers';

const DEFAULT_NODE_TIMEOUT_MS = 30_000;

export interface WorkflowRuntimeOptions {
  defaultNodeTimeoutMs?: number;
  nodeTimeouts?: Record<string, number>;
  executionId?: string;
  organizationId?: string;
  triggerType?: string;
  resumeState?: WorkflowResumeState | null;
}

interface NormalizedRuntimeOptions {
  defaultNodeTimeoutMs: number;
  nodeTimeouts: Record<string, number>;
}

interface NodeExecutionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

type NodeExecutionMetadataSnapshot = Partial<NodeExecution['metadata']>;

interface TimeoutGuard {
  promise: Promise<never>;
  cancel: () => void;
}

export interface ExecutionContext {
  outputs: Record<string, any>;
  prevOutput?: any;
  userId?: string;
  workflowId: string;
  startTime: Date;
  executionId: string;
  initialData?: any;
  organizationId?: string;
}

export interface ExecutionResult {
  success: boolean;
  status: 'completed' | 'waiting' | 'failed';
  data?: any;
  error?: string;
  executionTime: number;
  nodeOutputs: Record<string, any>;
  waitUntil?: string;
  timerId?: string | null;
}

interface DelayNodeResult {
  __workflowDelay: true;
  delayMs: number;
  output: any;
}

interface TimerScheduleResult {
  timerId: string | null;
  resumeAt: Date;
}

export class WorkflowRuntime {
  private nodeMetadata = new Map<string, NodeExecutionMetadataSnapshot>();

  /**
   * Execute a workflow graph server-side
   * Particularly useful for LLM nodes and testing
   */
  async executeWorkflow(
    graph: NodeGraph,
    initialData: any = {},
    userId?: string,
    options: WorkflowRuntimeOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = new Date();
    const resumeState = options.resumeState ?? null;
    const executionId = options.executionId ?? `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const triggerType = options.triggerType ?? (resumeState ? 'resume' : 'manual');

    const context: ExecutionContext = {
      outputs: resumeState?.nodeOutputs ? { ...resumeState.nodeOutputs } : {},
      prevOutput: resumeState?.prevOutput ?? initialData,
      userId,
      workflowId: graph.id,
      startTime,
      executionId,
      initialData,
      organizationId: options.organizationId,
    };

    const runtimeOptions = this.normalizeOptions(options);

    const sortedNodeIds = resumeState?.remainingNodeIds?.length
      ? [...resumeState.remainingNodeIds]
      : this.topologicalSort(graph);
    let startIndex = 0;
    if (!resumeState?.remainingNodeIds?.length && resumeState?.nextNodeId) {
      const resumeIndex = sortedNodeIds.indexOf(resumeState.nextNodeId);
      if (resumeIndex >= 0) {
        startIndex = resumeIndex;
      }
    }

    // Start execution tracking
    await runExecutionManager.startExecution(executionId, graph, userId, triggerType, initialData);

    console.log(`🚀 Starting server-side execution of workflow: ${graph.name}`);

    try {
      // Execute nodes in order
      for (let i = startIndex; i < sortedNodeIds.length; i++) {
        const nodeId = sortedNodeIds[i];
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) {
          throw new Error(`Node ${nodeId} not found in graph`);
        }

        console.log(`📋 Executing node: ${node.label} (${node.type})`);

        const connectorId = this.resolveConnectorId(node);
        const configuredTimeout = this.resolveConfiguredTimeout(node.id, runtimeOptions);

        // Start node execution tracking
        await runExecutionManager.startNodeExecution(context.executionId, node, context.prevOutput, {
          timeoutMs: configuredTimeout,
          connectorId
        });

        const nodeAbortController = new AbortController();
        try {
          // Execute node with retry logic and idempotency
          const nodeResult = await retryManager.executeWithRetry(
            node.id,
            context.executionId,
            () => this.executeNode(node, context, { signal: nodeAbortController.signal, timeoutMs: configuredTimeout }),
            {
              policy: this.getRetryPolicyForNode(node),
              idempotencyKey: this.generateIdempotencyKey(node, context),
              nodeType: node.type,
              connectorId,
              nodeLabel: node.label
            }
          );

          const isDelayResult = this.isDelayResult(nodeResult);
          const nodeOutput = isDelayResult ? nodeResult.output : nodeResult;
          this.captureNodeUsageMetadata(context, node, nodeOutput);
          context.outputs[node.id] = nodeOutput;
          context.prevOutput = nodeOutput;

          // Track successful completion
          const metadata = this.consumeNodeMetadata(context.executionId, node.id);
          const circuitState = connectorId ? retryManager.getCircuitState(connectorId, node.id) : undefined;
          await runExecutionManager.completeNodeExecution(context.executionId, node.id, nodeOutput, {
            ...metadata,
            circuitState
          });

          if (isDelayResult && nodeResult.delayMs > 0) {
            const remainingNodeIds = sortedNodeIds.slice(i + 1);
            if (remainingNodeIds.length > 0) {
              const scheduleResult = await this.scheduleWorkflowTimer({
                context,
                graph,
                node,
                delayMs: nodeResult.delayMs,
                remainingNodeIds,
              });
              if (scheduleResult) {
                if (nodeOutput && typeof nodeOutput === 'object') {
                  (nodeOutput as Record<string, any>).scheduled = true;
                  (nodeOutput as Record<string, any>).resumeAt = scheduleResult.resumeAt.toISOString();
                }
                await runExecutionManager.markExecutionWaiting(
                  context.executionId,
                  `Timer scheduled for node ${node.label}`,
                  scheduleResult.resumeAt
                );
                const executionTime = Date.now() - startTime.getTime();
                return {
                  success: true,
                  status: 'waiting',
                  data: context.prevOutput,
                  executionTime,
                  nodeOutputs: context.outputs,
                  waitUntil: scheduleResult.resumeAt.toISOString(),
                  timerId: scheduleResult.timerId,
                };
              }
            }

            await this.waitForDelay(nodeResult.delayMs);
          }

          console.log(`✅ Node ${node.id} completed successfully`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          const originalMessage = err.message ?? 'Unknown error';
          const message = originalMessage;
          if (err instanceof SandboxPolicyViolationError) {
            this.setNodeMetadata(context.executionId, node.id, {
              policyViolation: err.violation,
            });
            retryManager.emitActionableError({
              executionId: context.executionId,
              nodeId: node.id,
              nodeType: node.type,
              code: err.violation.type === 'resource-limit' ? 'SANDBOX_RESOURCE_LIMIT' : 'SANDBOX_NETWORK_POLICY',
              message: originalMessage,
              details: err.violation,
            });
          }
          const metadata = this.consumeNodeMetadata(context.executionId, node.id);
          const circuitState = connectorId ? retryManager.getCircuitState(connectorId, node.id) : undefined;
          await runExecutionManager.failNodeExecution(context.executionId, node.id, message, {
            ...metadata,
            circuitState
          });
          console.error(`❌ Node ${node.id} failed:`, err);
          err.message = `Node "${node.label}" failed: ${originalMessage}`;
          throw err;
        } finally {
          nodeAbortController.abort();
        }
      }

      const executionTime = Date.now() - startTime.getTime();
      
      // Track successful completion
      await runExecutionManager.completeExecution(context.executionId, context.prevOutput);

      console.log(`🎉 Workflow execution completed in ${executionTime}ms`);

      return {
        success: true,
        status: 'completed',
        data: context.prevOutput,
        executionTime,
        nodeOutputs: context.outputs
      };
    } catch (error) {
      const executionTime = Date.now() - startTime.getTime();
      const errorMessage = (error as Error)?.message ?? 'Unknown error';

      // Track failed completion
      await runExecutionManager.completeExecution(context.executionId, undefined, errorMessage);

      console.error(`💥 Workflow execution failed after ${executionTime}ms:`, error);

      return {
        success: false,
        status: 'failed',
        error: errorMessage,
        executionTime,
        nodeOutputs: context.outputs
      };
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: GraphNode, context: ExecutionContext, options: NodeExecutionOptions = {}): Promise<any> {
    const { signal, timeoutMs } = options;
    // Resolve node parameters using AI-as-a-field ParameterResolver
    const paramContext: ParameterContext = {
      nodeOutputs: context.outputs,
      currentNodeId: node.id,
      workflowId: context.workflowId,
      userId: context.userId,
      executionId: context.executionId
    };

    const resolvedParams = await resolveAllParams(node.data, paramContext);
    const nodeContext = { ...context, nodeId: node.id };

    if (this.isDelayNode(node)) {
      return this.buildDelayNodeResult(resolvedParams);
    }

    const runtimeConfig = (node.data as any)?.runtime ?? (resolvedParams as any)?.runtime;

    if (runtimeConfig && typeof runtimeConfig.code === 'string') {
      const effectiveTimeout = this.resolveEffectiveTimeout(runtimeConfig, timeoutMs);
      this.setNodeMetadata(context.executionId, node.id, { timeoutMs: effectiveTimeout });

      const sandboxParams = this.extractSandboxParams(resolvedParams);
      const sandboxContext: Record<string, any> = {
        workflowId: context.workflowId,
        executionId: context.executionId,
        nodeId: node.id,
        userId: context.userId,
        prevOutput: context.prevOutput,
        nodeOutputs: context.outputs
      };

      if (node.connectionId) {
        sandboxContext.connectionId = node.connectionId;
      }
      if (resolvedParams?.credentials || node.credentials) {
        sandboxContext.credentials = resolvedParams?.credentials ?? node.credentials;
      }
      if (resolvedParams?.auth || node.auth) {
        sandboxContext.auth = resolvedParams?.auth ?? node.auth;
      }
      if (runtimeConfig.environment) {
        sandboxContext.environment = runtimeConfig.environment;
      }
      if (node.data?.metadata) {
        sandboxContext.metadata = node.data.metadata;
      }

      const secrets = this.gatherSecrets(
        runtimeConfig.secrets,
        runtimeConfig.redact,
        resolvedParams?.credentials,
        node.credentials,
        resolvedParams?.auth,
        node.auth
      );

      const timeoutController = new AbortController();
      const { signal: combinedSignal, cleanup } = this.createCombinedSignal(signal, timeoutController.signal);
      const guard = this.createTimeoutGuard(node, effectiveTimeout, () => timeoutController.abort());

      try {
        const sandboxPromise = nodeSandbox.execute({
          code: runtimeConfig.code,
          entryPoint: runtimeConfig.entryPoint ?? runtimeConfig.entry ?? 'run',
          params: sandboxParams,
          context: sandboxContext,
          timeoutMs: effectiveTimeout,
          signal: combinedSignal,
          secrets
        });

        const sandboxOutcome = guard
          ? await Promise.race([sandboxPromise, guard.promise])
          : await sandboxPromise;

        if (sandboxOutcome.logs.length > 0) {
          for (const logEntry of sandboxOutcome.logs) {
            const prefix = `🧪 [Sandbox:${node.id}]`;
            switch (logEntry.level) {
              case 'error':
                console.error(`${prefix} ${logEntry.message}`);
                break;
              case 'warn':
                console.warn(`${prefix} ${logEntry.message}`);
                break;
              case 'info':
              case 'log':
                console.log(`${prefix} ${logEntry.message}`);
                break;
              case 'debug':
              default:
                console.debug(`${prefix} ${logEntry.message}`);
                break;
            }
          }
        }

        return sandboxOutcome.result;
      } finally {
        guard?.cancel();
        cleanup();
      }
    }

    // Execute based on node type
    switch (node.type) {
      // LLM Actions
      case 'action.llm.generate':
        return await runLLMGenerate(resolvedParams, nodeContext);

      case 'action.llm.extract':
        return await runLLMExtract(resolvedParams, nodeContext);

      case 'action.llm.classify':
        return await runLLMClassify(resolvedParams, nodeContext);

      case 'action.llm.tool_call':
        return await runLLMToolCall(resolvedParams, nodeContext);
      
      // HTTP Actions (useful for testing and API calls)
      case 'action.http.request':
        return await this.executeHttpRequest(resolvedParams);
      
      // Transform nodes
      case 'transform.json.extract':
        return this.executeJsonExtract(resolvedParams, context);
      
      case 'transform.text.format':
        return this.executeTextFormat(resolvedParams, context);
      
      // Placeholder for other node types
      default:
        console.warn(`⚠️  Node type ${node.type} not supported in server-side execution`);
        return {
          message: `Node type ${node.type} executed successfully`,
          type: node.type,
          data: resolvedParams
        };
    }
  }

  private isDelayResult(value: any): value is DelayNodeResult {
    return Boolean(value && typeof value === 'object' && value.__workflowDelay === true);
  }

  private isDelayNode(node: GraphNode): boolean {
    const type = typeof node.type === 'string' ? node.type.toLowerCase() : '';
    if (type.includes('time') && type.includes('delay')) {
      return true;
    }
    if (type.endsWith('.delay') || type.endsWith(':delay')) {
      return true;
    }

    const data = (node.data ?? {}) as Record<string, any>;
    const appCandidates = [node.app, data.app];
    const fnCandidates = [data.function, data.op, (node as any).function, node.op];
    if (appCandidates.some(app => typeof app === 'string' && app.toLowerCase() === 'time')) {
      if (fnCandidates.some(fn => typeof fn === 'string' && fn.toLowerCase() === 'delay')) {
        return true;
      }
    }

    return false;
  }

  private buildDelayNodeResult(params: Record<string, any>): DelayNodeResult {
    const delayMs = this.calculateDelayMs(params ?? {});
    const output = {
      delayedMs: delayMs,
      requested: this.cloneForTimer(params ?? {}),
      scheduled: false,
    };

    return {
      __workflowDelay: true,
      delayMs,
      output,
    };
  }

  private calculateDelayMs(params: Record<string, any>): number {
    const readNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    };

    let totalMs = 0;

    const direct = readNumber(params.delayMs);
    if (direct !== null) {
      totalMs += direct;
    }

    const seconds = readNumber(params.delaySeconds ?? params.seconds);
    if (seconds !== null) {
      totalMs += seconds * 1000;
    }

    const minutes = readNumber(params.delayMinutes ?? params.minutes);
    if (minutes !== null) {
      totalMs += minutes * 60 * 1000;
    }

    const hours = readNumber(params.delayHours ?? params.hours);
    if (hours !== null) {
      totalMs += hours * 60 * 60 * 1000;
    }

    return Math.max(0, Math.floor(totalMs));
  }

  private async scheduleWorkflowTimer(params: {
    context: ExecutionContext;
    graph: NodeGraph;
    node: GraphNode;
    delayMs: number;
    remainingNodeIds: string[];
  }): Promise<TimerScheduleResult | null> {
    if (!db || params.delayMs <= 0 || params.remainingNodeIds.length === 0) {
      return null;
    }

    try {
      const resumeAt = new Date(Date.now() + params.delayMs);
      const payload: WorkflowTimerPayload = {
        workflowId: params.graph.id,
        organizationId: params.context.organizationId,
        userId: params.context.userId,
        executionId: params.context.executionId,
        initialData: this.cloneForTimer(params.context.initialData ?? null),
        resumeState: {
          nodeOutputs: this.cloneForTimer(params.context.outputs),
          prevOutput: this.cloneForTimer(params.context.prevOutput),
          remainingNodeIds: [...params.remainingNodeIds],
          nextNodeId: params.remainingNodeIds[0] ?? null,
          startedAt: params.context.startTime.toISOString(),
        },
        triggerType: 'timer',
        metadata: {
          reason: 'delay',
          nodeId: params.node.id,
          delayMs: params.delayMs,
        },
      };

      const [created] = await db
        .insert(workflowTimers)
        .values({
          executionId: params.context.executionId,
          resumeAt,
          payload,
          status: 'pending',
          attempts: 0,
          lastError: null,
        })
        .returning({ id: workflowTimers.id });

      return { timerId: created?.id ?? null, resumeAt };
    } catch (error) {
      const message = (error as Error)?.message ?? 'Unknown error';
      console.error('Failed to schedule workflow timer:', message);
      return null;
    }
  }

  private cloneForTimer<T>(value: T): T {
    if (value === undefined || value === null) {
      return value;
    }

    if (value instanceof Date) {
      return new Date(value.getTime()) as unknown as T;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  private async waitForDelay(delayMs: number): Promise<void> {
    if (!this.isPositiveNumber(delayMs)) {
      return;
    }

    const waitMs = Math.min(delayMs, 50);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  /**
   * Execute HTTP request node
   */
  private async executeHttpRequest(params: any): Promise<any> {
    const { url, method = 'GET', headers = {}, body } = params;
    
    if (!url) {
      throw new Error('URL is required for HTTP requests');
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await response.text();
      
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch {
        parsedData = data;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: parsedData
      };
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  /**
   * Execute JSON extraction transform
   */
  private executeJsonExtract(params: any, context: ExecutionContext): any {
    const { path } = params;
    const data = context.prevOutput;

    if (!path) {
      return data;
    }

    try {
      // Simple dot notation path extraction
      return path.split('.').reduce((obj: any, key: string) => {
        return obj && obj[key] !== undefined ? obj[key] : undefined;
      }, data);
    } catch (error) {
      throw new Error(`JSON extraction failed: ${error.message}`);
    }
  }

  /**
   * Execute text formatting transform
   */
  private executeTextFormat(params: any, context: ExecutionContext): any {
    const { template } = params;
    const data = context.prevOutput;

    if (!template) {
      return data;
    }

    try {
      // Simple template replacement with {{key}} syntax
      let formatted = template;
      if (typeof data === 'object' && data !== null) {
        Object.entries(data).forEach(([key, value]) => {
          const placeholder = `{{${key}}}`;
          formatted = formatted.replace(new RegExp(placeholder, 'g'), String(value));
        });
      }
      
      return formatted;
    } catch (error) {
      throw new Error(`Text formatting failed: ${error.message}`);
    }
  }

  /**
   * Topologically sort nodes to ensure proper execution order
   */
  private topologicalSort(graph: NodeGraph): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      // Find all nodes that this node depends on (nodes with edges pointing to this node)
      const incomingEdges = graph.edges.filter(edge => edge.target === nodeId);
      incomingEdges.forEach(edge => visit(edge.source));
      
      result.push(nodeId);
    };
    
    // Visit all nodes
    graph.nodes.forEach(node => visit(node.id));
    
    return result;
  }

  /**
   * Get retry policy based on node type
   */
  private getRetryPolicyForNode(node: GraphNode): Partial<RetryPolicy> {
    const nodeType = node.type;
    
    // LLM nodes - more retries due to rate limits
    if (nodeType.startsWith('action.llm.')) {
      return {
        maxAttempts: 4,
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE', 'SERVER_ERROR']
      };
    }
    
    // HTTP nodes - network retries
    if (nodeType.startsWith('action.http') || nodeType.includes('webhook')) {
      return {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']
      };
    }
    
    // External service actions (Gmail, Sheets, etc.)
    if (nodeType.startsWith('action.') && !nodeType.startsWith('action.transform')) {
      return {
        maxAttempts: 2,
        initialDelayMs: 1500,
        maxDelayMs: 15000,
        retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']
      };
    }
    
    // Transform nodes - usually no retries needed
    if (nodeType.startsWith('transform.')) {
      return {
        maxAttempts: 1,
        retryableErrors: []
      };
    }
    
    // Default policy
    return {
      maxAttempts: 2,
      initialDelayMs: 1000,
      retryableErrors: ['TIMEOUT', 'NETWORK_ERROR']
    };
  }

  /**
   * Generate idempotency key for node execution
   */
  private generateIdempotencyKey(node: GraphNode, context: ExecutionContext): string {
    // Create a hash-like key based on node content and context
    const nodeFingerprint = JSON.stringify({
      nodeId: node.id,
      nodeType: node.type,
      params: node.data.params,
      workflowId: context.workflowId,
      // Include relevant previous outputs for context-dependent idempotency
      relevantInputs: this.getRelevantInputsForIdempotency(node, context)
    });
    
    // Simple hash function for idempotency key
    let hash = 0;
    for (let i = 0; i < nodeFingerprint.length; i++) {
      const char = nodeFingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return `idem_${Math.abs(hash)}_${node.id}`;
  }

  /**
   * Get relevant inputs for idempotency calculation
   */
  private getRelevantInputsForIdempotency(node: GraphNode, context: ExecutionContext): any {
    // For most nodes, we only care about the direct dependencies
    const relevantInputs: any = {};

    // If this node has parameter references to other nodes, include those outputs
    const nodeParams = node.data.params || {};
    for (const [key, value] of Object.entries(nodeParams)) {
      if (typeof value === 'object' && value?.mode === 'ref' && value?.nodeId) {
        relevantInputs[key] = context.outputs[value.nodeId];
      }
    }

    return relevantInputs;
  }

  private normalizeOptions(options: WorkflowRuntimeOptions): NormalizedRuntimeOptions {
    const defaultNodeTimeout = this.isPositiveNumber(options.defaultNodeTimeoutMs)
      ? options.defaultNodeTimeoutMs!
      : DEFAULT_NODE_TIMEOUT_MS;

    const nodeTimeouts: Record<string, number> = {};
    if (options.nodeTimeouts) {
      for (const [nodeId, value] of Object.entries(options.nodeTimeouts)) {
        if (this.isPositiveNumber(value)) {
          nodeTimeouts[nodeId] = value;
        }
      }
    }

    return {
      defaultNodeTimeoutMs: defaultNodeTimeout,
      nodeTimeouts
    };
  }

  private resolveConfiguredTimeout(nodeId: string, options: NormalizedRuntimeOptions): number | undefined {
    const override = options.nodeTimeouts[nodeId];
    if (this.isPositiveNumber(override)) {
      return override;
    }
    return options.defaultNodeTimeoutMs;
  }

  private resolveEffectiveTimeout(runtimeConfig: any, configuredTimeout?: number): number | undefined {
    const runtimeTimeout = typeof runtimeConfig?.timeoutMs === 'number' ? runtimeConfig.timeoutMs : undefined;
    const candidates = [configuredTimeout, runtimeTimeout, DEFAULT_NODE_TIMEOUT_MS];

    for (const candidate of candidates) {
      if (this.isPositiveNumber(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private captureNodeUsageMetadata(
    context: ExecutionContext,
    node: GraphNode,
    result: unknown
  ): void {
    if (!result) {
      return;
    }

    const metadata = this.extractUsageMetadata(result);
    if (metadata && Object.keys(metadata).length > 0) {
      this.setNodeMetadata(context.executionId, node.id, metadata);
    }
  }

  private extractUsageMetadata(result: unknown): NodeExecutionMetadataSnapshot | null {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const payload = result as Record<string, any>;
    const usage = this.resolveUsagePayload(payload);
    const metadata: NodeExecutionMetadataSnapshot = {};

    const tokensUsed = this.resolveTokensUsed(payload, usage);
    if (typeof tokensUsed === 'number' && Number.isFinite(tokensUsed)) {
      metadata.tokensUsed = tokensUsed;
    }

    if (usage) {
      if (typeof usage.promptTokens === 'number') {
        metadata.promptTokens = usage.promptTokens;
      }
      if (typeof usage.completionTokens === 'number') {
        metadata.completionTokens = usage.completionTokens;
      }
      if (typeof usage.costUSD === 'number') {
        metadata.costUSD = usage.costUSD;
      }
    }

    if (typeof payload.provider === 'string') {
      metadata.llmProvider = payload.provider;
    }
    if (typeof payload.model === 'string') {
      metadata.llmModel = payload.model;
    }
    if (payload.cached === true) {
      metadata.cacheHit = true;
    }
    if (payload.cacheSavings) {
      metadata.cacheSavings = payload.cacheSavings;
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  private resolveUsagePayload(payload: Record<string, any>): any {
    if (payload.usage && typeof payload.usage === 'object') {
      return payload.usage;
    }
    if (payload.result && typeof payload.result === 'object' && payload.result.usage) {
      return payload.result.usage;
    }
    if (payload.data && typeof payload.data === 'object' && payload.data.usage) {
      return payload.data.usage;
    }
    return undefined;
  }

  private resolveTokensUsed(payload: Record<string, any>, usage: any): number | undefined {
    if (typeof payload.tokensUsed === 'number') {
      return payload.tokensUsed;
    }
    if (usage) {
      if (typeof usage.totalTokens === 'number') {
        return usage.totalTokens;
      }
      if (typeof usage.promptTokens === 'number' || typeof usage.completionTokens === 'number') {
        return (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
      }
    }
    return undefined;
  }

  private setNodeMetadata(executionId: string, nodeId: string, metadata: NodeExecutionMetadataSnapshot): void {
    const key = this.getMetadataKey(executionId, nodeId);
    const existing = this.nodeMetadata.get(key) || {};
    this.nodeMetadata.set(key, { ...existing, ...metadata });
  }

  private consumeNodeMetadata(executionId: string, nodeId: string): NodeExecutionMetadataSnapshot {
    const key = this.getMetadataKey(executionId, nodeId);
    const metadata = this.nodeMetadata.get(key) || {};
    this.nodeMetadata.delete(key);
    return metadata;
  }

  private getMetadataKey(executionId: string, nodeId: string): string {
    return `${executionId}:${nodeId}`;
  }

  private createCombinedSignal(primary?: AbortSignal, secondary?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const listeners: Array<{ signal: AbortSignal; handler: () => void }> = [];
    const sources = [primary, secondary].filter((signal): signal is AbortSignal => Boolean(signal));

    const abort = () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };

    for (const source of sources) {
      if (source.aborted) {
        abort();
      } else {
        const handler = () => abort();
        source.addEventListener('abort', handler);
        listeners.push({ signal: source, handler });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        for (const { signal, handler } of listeners) {
          signal.removeEventListener('abort', handler);
        }
      }
    };
  }

  private createTimeoutGuard(node: GraphNode, timeoutMs?: number, onTimeout?: () => void): TimeoutGuard | undefined {
    if (!this.isPositiveNumber(timeoutMs)) {
      return undefined;
    }

    let timer: NodeJS.Timeout;
    const promise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new Error(`Node "${node.label}" (${node.id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return {
      promise,
      cancel: () => {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };
  }

  private resolveConnectorId(node: GraphNode): string | undefined {
    const data = node.data || {};
    const metadata = node.metadata || {};
    const candidates = [
      (data as any)?.connectorId,
      (metadata as any)?.connectorId,
      (data as any)?.provider,
      (data as any)?.appKey,
      (data as any)?.app,
      node.app,
      node.connectionId,
      (data as any)?.connectionId
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    if (typeof node.type === 'string') {
      const parts = node.type.split('.');
      if (parts.length >= 2) {
        const [category, connector] = parts;
        if (category === 'action' || category === 'trigger') {
          return connector;
        }
      }
    }

    return undefined;
  }

  private isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  private extractSandboxParams(resolvedParams: Record<string, any>): any {
    if (resolvedParams == null) {
      return {};
    }

    if (Array.isArray(resolvedParams)) {
      return resolvedParams;
    }

    if (resolvedParams.parameters && typeof resolvedParams.parameters === 'object' && !Array.isArray(resolvedParams.parameters)) {
      return resolvedParams.parameters;
    }

    if (resolvedParams.params && typeof resolvedParams.params === 'object' && !Array.isArray(resolvedParams.params)) {
      return resolvedParams.params;
    }

    if (resolvedParams.input && typeof resolvedParams.input === 'object' && !Array.isArray(resolvedParams.input)) {
      return resolvedParams.input;
    }

    const clone: Record<string, any> = {};
    for (const [key, value] of Object.entries(resolvedParams)) {
      if (key === 'runtime' || key === 'credentials' || key === 'auth') {
        continue;
      }
      clone[key] = value;
    }
    return clone;
  }

  private gatherSecrets(...sources: any[]): string[] {
    const secrets = new Set<string>();

    const append = (value: any) => {
      if (!value) {
        return;
      }
      if (typeof value === 'string') {
        if (value.length > 0 && value !== '[REDACTED]') {
          secrets.add(value);
        }
        return;
      }
      if (Array.isArray(value) || typeof value === 'object') {
        for (const secret of collectSecretStrings(value)) {
          if (secret && secret.length > 0 && secret !== '[REDACTED]') {
            secrets.add(secret);
          }
        }
      }
    };

    for (const source of sources) {
      append(source);
    }

    return Array.from(secrets);
  }
}

export const workflowRuntime = new WorkflowRuntime();