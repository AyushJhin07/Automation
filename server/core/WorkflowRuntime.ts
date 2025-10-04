/**
 * WorkflowRuntime - Server-side execution of workflows
 * This complements the Google Apps Script compiler by providing
 * server-side execution capabilities, especially for LLM nodes
 */

import { NodeGraph, GraphNode, ParameterContext } from '../../shared/nodeGraphSchema';
import {
  createWorkflowNodeMetadataSnapshot,
  type WorkflowMetadata,
  type WorkflowMetadataSource,
} from '../../shared/workflow/metadata';
import { runLLMGenerate, runLLMExtract, runLLMClassify, runLLMToolCall } from '../nodes/llm/executeLLM';
import { resolveAllParams } from './ParameterResolver';
import { retryManager, RetryPolicy } from './RetryManager';
import { runExecutionManager } from './RunExecutionManager';
import type { NodeExecution } from './RunExecutionManager';
import {
  nodeSandboxFactory,
  collectSecretStrings,
  SandboxPolicyViolationError,
} from '../runtime/NodeSandbox';
import type { SandboxTenancyOverrides, SandboxResourceLimits } from '../runtime/SandboxShared';
import { db, workflowTimers } from '../database/schema.js';
import type { WorkflowResumeState, WorkflowTimerPayload } from '../types/workflowTimers';
import type { APICredentials } from '../integrations/BaseAPIClient';
import { integrationManager } from '../integrations/IntegrationManager';
import { genericExecutor } from '../integrations/GenericExecutor';
import { env } from '../env';
import { connectionService } from '../services/ConnectionService';
import { getErrorMessage } from '../types/common';

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
  idempotencyKeys: Record<string, string>;
  requestHashes: Record<string, string>;
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
  deterministicKeys?: {
    idempotency?: Record<string, string>;
    request?: Record<string, string>;
  };
}

interface ConnectorCredentialResolution {
  credentials: APICredentials;
  connectionId?: string;
  additionalConfig?: Record<string, any>;
  source: 'inline' | 'connection';
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
      idempotencyKeys: resumeState?.idempotencyKeys ? { ...resumeState.idempotencyKeys } : {},
      requestHashes: resumeState?.requestHashes ? { ...resumeState.requestHashes } : {},
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

        const existingIdempotencyKey = context.idempotencyKeys[node.id];
        const nodeIdempotencyKey = existingIdempotencyKey ?? this.generateIdempotencyKey(node, context);
        context.idempotencyKeys[node.id] = nodeIdempotencyKey;

        // Start node execution tracking
        const nodeExecutionStart = await runExecutionManager.startNodeExecution(
          context.executionId,
          node,
          context.prevOutput,
          {
            timeoutMs: configuredTimeout,
            connectorId,
            idempotencyKey: nodeIdempotencyKey
          }
        );

        if (
          nodeExecutionStart?.metadata?.requestHash &&
          !context.requestHashes[node.id]
        ) {
          context.requestHashes[node.id] = nodeExecutionStart.metadata.requestHash;
        }

        const nodeAbortController = new AbortController();
        try {
          // Execute node with retry logic and idempotency
          const nodeResult = await retryManager.executeWithRetry(
            node.id,
            context.executionId,
            () => this.executeNode(node, context, { signal: nodeAbortController.signal, timeoutMs: configuredTimeout }),
            {
              policy: this.getRetryPolicyForNode(node),
              idempotencyKey: nodeIdempotencyKey,
              nodeType: node.type,
              connectorId,
              nodeLabel: node.label
            }
          );

          const isDelayResult = this.isDelayResult(nodeResult);
          const nodeOutput = isDelayResult ? nodeResult.output : nodeResult;
          this.captureNodeMetadataSnapshot(context, node, nodeOutput);
          this.captureNodeUsageMetadata(context, node, nodeOutput);
          context.outputs[node.id] = nodeOutput;
          context.prevOutput = nodeOutput;

          // Track successful completion
          const metadata = this.consumeNodeMetadata(context.executionId, node.id);
          const circuitState = connectorId ? retryManager.getCircuitState(connectorId, node.id) : undefined;
          const retryStatus = retryManager.getRetryStatus(context.executionId, node.id);
          const requestHash = retryManager.getRequestHash(context.executionId, node.id);
          if (requestHash) {
            context.requestHashes[node.id] = requestHash;
          }
          await runExecutionManager.completeNodeExecution(context.executionId, node.id, nodeOutput, {
            ...metadata,
            circuitState,
            idempotencyKey: nodeIdempotencyKey,
            requestHash,
            resultHash: retryStatus?.lastResultHash
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
                  deterministicKeys: {
                    idempotency: { ...context.idempotencyKeys },
                    request: { ...context.requestHashes },
                  },
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
        nodeOutputs: context.outputs,
        deterministicKeys: {
          idempotency: { ...context.idempotencyKeys },
          request: { ...context.requestHashes },
        },
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
        nodeOutputs: context.outputs,
        deterministicKeys: {
          idempotency: { ...context.idempotencyKeys },
          request: { ...context.requestHashes },
        },
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
      executionId: context.executionId,
      trigger: this.resolveTriggerOutput(context, node.id),
      steps: context.outputs,
      variables: this.extractRuntimeVariables(context),
    };

    const resolvedParams = await resolveAllParams(node.data, paramContext);
    const nodeContext = {
      ...context,
      nodeId: node.id,
      idempotencyKey: context.idempotencyKeys[node.id] ?? this.generateIdempotencyKey(node, context),
    };

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

      if (context.organizationId) {
        sandboxContext.organizationId = context.organizationId;
      }
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

      const tenancyOverrides: SandboxTenancyOverrides = {};

      if (Array.isArray(runtimeConfig.dependencyAllowlist)) {
        tenancyOverrides.dependencyAllowlist = runtimeConfig.dependencyAllowlist
          .map((value: any) => (typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : ''))
          .filter((value: string) => value.length > 0);
      }

      if (Array.isArray(runtimeConfig.secretScopes)) {
        tenancyOverrides.secretScopes = runtimeConfig.secretScopes
          .map((value: any) => (typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : ''))
          .filter((value: string) => value.length > 0);
      }

      const runtimeResourceLimits = this.normalizeRuntimeResourceLimits(runtimeConfig.resourceLimits);
      if (runtimeResourceLimits) {
        tenancyOverrides.resourceLimits = runtimeResourceLimits;
      }

      if (typeof runtimeConfig.policyVersion === 'string' && runtimeConfig.policyVersion.trim().length > 0) {
        tenancyOverrides.policyVersion = runtimeConfig.policyVersion.trim();
      }

      if (!tenancyOverrides.dependencyAllowlist?.length) {
        delete tenancyOverrides.dependencyAllowlist;
      }
      if (!tenancyOverrides.secretScopes?.length) {
        delete tenancyOverrides.secretScopes;
      }
      if (!tenancyOverrides.resourceLimits) {
        delete tenancyOverrides.resourceLimits;
      }
      if (!tenancyOverrides.policyVersion) {
        delete tenancyOverrides.policyVersion;
      }

      const sandboxInstance = nodeSandboxFactory.provision({
        scope: 'execution',
        organizationId: context.organizationId,
        executionId: context.executionId,
        workflowId: context.workflowId,
        nodeId: node.id,
      });

      try {
        const sandboxPromise = sandboxInstance.execute({
          code: runtimeConfig.code,
          entryPoint: runtimeConfig.entryPoint ?? runtimeConfig.entry ?? 'run',
          params: sandboxParams,
          context: sandboxContext,
          timeoutMs: effectiveTimeout,
          signal: combinedSignal,
          secrets,
          tenancy: Object.keys(tenancyOverrides).length > 0 ? tenancyOverrides : undefined,
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
        if (this.isConnectorNode(node, resolvedParams)) {
          return await this.executeConnectorNode(node, context, resolvedParams);
        }

        console.warn(`⚠️  Node type ${node.type} not supported in server-side execution`);
        return {
          message: `Node type ${node.type} executed successfully`,
          type: node.type,
          data: resolvedParams
        };
    }
  }

  private isConnectorNode(node: GraphNode, resolvedParams: Record<string, any>): boolean {
    const data = (node.data ?? {}) as Record<string, any>;
    const candidates = [
      (node as any)?.app,
      data.app,
      data.connectorId,
      data.application,
      resolvedParams?.app,
      resolvedParams?.connectorId,
      resolvedParams?.application,
    ];

    if (candidates.some(value => typeof value === 'string' && value.trim().length > 0)) {
      return true;
    }

    if (typeof node.type === 'string') {
      const lowerType = node.type.toLowerCase();
      if (lowerType.startsWith('action.')) {
        if (
          lowerType.startsWith('action.llm') ||
          lowerType.startsWith('action.http') ||
          lowerType.startsWith('action.transform')
        ) {
          return false;
        }
        return true;
      }
    }

    return false;
  }

  private async executeConnectorNode(
    node: GraphNode,
    context: ExecutionContext,
    resolvedParams: Record<string, any>
  ): Promise<any> {
    const data = (node.data ?? {}) as Record<string, any>;
    const appCandidate = this.selectString(
      (node as any)?.app,
      data.app,
      data.connectorId,
      data.application,
      resolvedParams?.app,
      resolvedParams?.connectorId,
      resolvedParams?.application,
      typeof node.type === 'string' ? node.type.split('.')?.[1] : undefined
    );

    if (!appCandidate) {
      const label = (node as any)?.label ?? node.id;
      throw new Error(`Unable to determine connector app for node "${label}"`);
    }

    const appId = appCandidate.trim();

    const functionCandidate = this.selectString(
      (node as any)?.function,
      data.function,
      data.operation,
      (node as any)?.op,
      resolvedParams?.function,
      resolvedParams?.operation,
      resolvedParams?.op,
      typeof node.type === 'string' ? node.type.split('.').pop() : undefined
    );

    const functionId = this.normalizeFunctionId(functionCandidate);
    if (!functionId) {
      const label = (node as any)?.label ?? node.id;
      throw new Error(`Unable to determine connector function for node "${label}"`);
    }

    const idempotencyKey = context.idempotencyKeys[node.id] ?? this.generateIdempotencyKey(node, context);
    const credentialResolution = await this.resolveConnectorCredentials(node, resolvedParams, context);
    const baseParameters = this.extractConnectorParameters(resolvedParams);
    if (credentialResolution.connectionId && baseParameters && typeof baseParameters === 'object') {
      if (baseParameters.connectionId == null) {
        baseParameters.connectionId = credentialResolution.connectionId;
      }
    }

    const metadata: NodeExecutionMetadataSnapshot = {
      connectorId: appId,
      appId,
      functionId,
      executor: 'integration',
      credentialSource: credentialResolution.source,
    };

    if (credentialResolution.connectionId) {
      metadata.connectionId = credentialResolution.connectionId;
    }

    const integrationParams = {
      appName: appId,
      functionId,
      parameters: this.cloneValue(baseParameters),
      credentials: credentialResolution.credentials,
      additionalConfig: credentialResolution.additionalConfig,
      connectionId: credentialResolution.connectionId,
      executionId: context.executionId,
      nodeId: String(node.id),
      idempotencyKey,
    };

    let executor: 'integration' | 'generic' = 'integration';
    let executionTime: number | undefined;
    let responseData: any;
    let fallbackError: string | undefined;

    if (!env.GENERIC_EXECUTOR_ENABLED) {
      const response = await integrationManager.executeFunction(integrationParams);
      if (!response.success) {
        throw new Error(response.error || `Failed to execute ${appId}.${functionId}`);
      }
      responseData = response.data ?? null;
      executionTime = response.executionTime;
    } else {
      const response = await integrationManager.executeFunction(integrationParams);
      if (response.success) {
        responseData = response.data ?? null;
        executionTime = response.executionTime;
      } else {
        fallbackError = response.error || undefined;
        const genericParams = this.prepareGenericParameters(baseParameters, idempotencyKey);
        const start = Date.now();
        const genericResult = await genericExecutor.execute({
          appId,
          functionId,
          parameters: genericParams,
          credentials: credentialResolution.credentials,
        });
        executor = 'generic';
        executionTime = Date.now() - start;
        if (!genericResult.success) {
          const message = genericResult.error || fallbackError || `Failed to execute ${appId}.${functionId}`;
          throw new Error(message);
        }
        responseData = genericResult.data ?? null;
      }
    }

    if (typeof executionTime === 'number' && Number.isFinite(executionTime)) {
      metadata.executionTimeMs = executionTime;
    }
    metadata.executor = executor;
    if (fallbackError && executor === 'generic') {
      metadata.integrationFallbackReason = fallbackError;
    }

    this.setNodeMetadata(context.executionId, node.id, metadata);

    return responseData;
  }

  private selectString(...values: Array<string | null | undefined>): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private normalizeFunctionId(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const raw = value.toString();
    const withoutNamespace = raw.split(':').pop() ?? raw;
    const segment = withoutNamespace.split('.').pop() ?? withoutNamespace;
    return segment
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }

  private extractInlineCredentials(node: GraphNode, resolvedParams: Record<string, any>): Record<string, any> | null {
    const data = (node.data ?? {}) as Record<string, any>;
    const candidates = [
      resolvedParams?.credentials,
      resolvedParams?.auth?.credentials,
      resolvedParams?.parameters?.credentials,
      (node as any)?.credentials,
      data.credentials,
      data.auth?.credentials,
      (node as any)?.params?.credentials,
      (node as any)?.parameters?.credentials,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      const keys = Object.keys(candidate);
      if (keys.length === 0) {
        continue;
      }
      return this.cloneValue(candidate);
    }

    return null;
  }

  private extractAdditionalConfig(
    node: GraphNode,
    resolvedParams: Record<string, any>,
    connectionMetadata?: Record<string, any>
  ): Record<string, any> | undefined {
    const merged: Record<string, any> = {};
    const push = (source: unknown) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return;
      }
      Object.assign(merged, source as Record<string, any>);
    };

    push(connectionMetadata?.additionalConfig);
    push(resolvedParams?.additionalConfig);
    push(resolvedParams?.config?.additionalConfig);
    push(resolvedParams?.parameters?.additionalConfig);
    push((node as any)?.additionalConfig);
    push((node.data as any)?.additionalConfig);
    push((node.data as any)?.config?.additionalConfig);

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private async resolveConnectorCredentials(
    node: GraphNode,
    resolvedParams: Record<string, any>,
    context: ExecutionContext
  ): Promise<ConnectorCredentialResolution> {
    const inlineCredentials = this.extractInlineCredentials(node, resolvedParams);
    const connectionId = this.selectString(
      resolvedParams?.auth?.connectionId,
      resolvedParams?.connectionId,
      resolvedParams?.parameters?.connectionId,
      resolvedParams?.config?.connectionId,
      (node as any)?.connectionId,
      (node as any)?.params?.connectionId,
      (node as any)?.parameters?.connectionId,
      (node.data as any)?.auth?.connectionId,
      (node.data as any)?.connectionId
    );

    if (inlineCredentials) {
      return {
        credentials: inlineCredentials as APICredentials,
        connectionId: connectionId ?? undefined,
        additionalConfig: this.extractAdditionalConfig(node, resolvedParams),
        source: 'inline',
      };
    }

    if (!connectionId) {
      const label = (node as any)?.label ?? node.id;
      throw new Error(`No connection configured for node "${label}"`);
    }

    if (!context.userId) {
      throw new Error('User context required to resolve stored connection credentials');
    }

    if (!context.organizationId) {
      throw new Error('Organization context required to resolve stored connection credentials');
    }

    try {
      const prepared = await connectionService.prepareConnectionForClient({
        connectionId,
        userId: context.userId,
        organizationId: context.organizationId,
      });

      if (!prepared) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      const credentials = this.cloneValue(prepared.credentials ?? {}) as APICredentials;

      if (prepared.networkPolicy) {
        (credentials as any).__organizationNetworkPolicy = prepared.networkPolicy;
        if (prepared.networkPolicy.allowlist) {
          (credentials as any).__organizationNetworkAllowlist = prepared.networkPolicy.allowlist;
        }
      } else if (prepared.networkAllowlist) {
        (credentials as any).__organizationNetworkAllowlist = prepared.networkAllowlist;
      }

      (credentials as any).__organizationId = prepared.connection.organizationId;
      (credentials as any).__connectionId = prepared.connection.id;
      if (context.userId) {
        (credentials as any).__userId = context.userId;
      }

      const additionalConfig = this.extractAdditionalConfig(
        node,
        resolvedParams,
        prepared.connection.metadata || {}
      );

      return {
        credentials,
        connectionId,
        additionalConfig,
        source: 'connection',
      };
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  private extractConnectorParameters(resolvedParams: Record<string, any>): Record<string, any> {
    if (!resolvedParams || typeof resolvedParams !== 'object') {
      return {};
    }

    const parameterSources = [
      resolvedParams.parameters,
      resolvedParams.params,
    ];

    for (const source of parameterSources) {
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        return this.cloneValue(source);
      }
    }

    const clone = this.cloneValue(resolvedParams);
    delete clone.credentials;
    delete clone.auth;
    delete clone.runtime;
    delete clone.metadata;
    return clone;
  }

  private prepareGenericParameters(
    parameters: Record<string, any>,
    idempotencyKey?: string
  ): Record<string, any> {
    const clone = this.cloneValue(parameters);
    if (!clone || typeof clone !== 'object') {
      return clone;
    }

    if (idempotencyKey) {
      if (clone.idempotency_key == null) {
        clone.idempotency_key = idempotencyKey;
      }
      if (clone.idempotencyKey == null) {
        clone.idempotencyKey = idempotencyKey;
      }
    }
    return clone;
  }

  private cloneValue<T>(value: T): T {
    try {
      if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
      }
    } catch (error) {
      console.warn('structuredClone failed, falling back to JSON clone:', error);
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
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
          idempotencyKeys: { ...params.context.idempotencyKeys },
          requestHashes: { ...params.context.requestHashes },
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
    const executionPart = String(context.executionId || '').trim() || 'execution';
    const nodePart = String(node.id || '').trim() || 'node';
    return `${executionPart}:${nodePart}`;
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

  private normalizeRuntimeResourceLimits(input: any): SandboxResourceLimits | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const limits: SandboxResourceLimits = {};

    if (typeof input.maxCpuMs === 'number' || typeof input.maxCpuMs === 'string') {
      const value = Number(input.maxCpuMs);
      if (Number.isFinite(value) && value >= 0) {
        limits.maxCpuMs = value;
      }
    }

    if (typeof input.cpuQuotaMs === 'number' || typeof input.cpuQuotaMs === 'string') {
      const value = Number(input.cpuQuotaMs);
      if (Number.isFinite(value) && value >= 0) {
        limits.cpuQuotaMs = value;
      }
    }

    if (typeof input.maxMemoryBytes === 'number' || typeof input.maxMemoryBytes === 'string') {
      const value = Number(input.maxMemoryBytes);
      if (Number.isFinite(value) && value >= 0) {
        limits.maxMemoryBytes = value;
      }
    }

    if (typeof input.cgroupRoot === 'string' && input.cgroupRoot.trim().length > 0) {
      limits.cgroupRoot = input.cgroupRoot.trim();
    }

    return Object.keys(limits).length > 0 ? limits : undefined;
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

  private captureNodeMetadataSnapshot(
    context: ExecutionContext,
    node: GraphNode,
    result: unknown
  ): void {
    const inputSources: WorkflowMetadataSource[] = [];
    const outputSources: WorkflowMetadataSource[] = [];

    const addSource = (value: unknown, collection: WorkflowMetadataSource[]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      collection.push(value as WorkflowMetadata);
    };

    addSource((node as any)?.metadata, inputSources);
    addSource((node.data as any)?.metadata, inputSources);
    addSource((node as any)?.outputMetadata, outputSources);
    addSource((node.data as any)?.outputMetadata, outputSources);

    const snapshot = createWorkflowNodeMetadataSnapshot({
      nodeId: node.id,
      inputs: inputSources,
      outputs: outputSources,
      runtimeOutput: result,
      timestamp: new Date(),
    });

    if (!snapshot) {
      return;
    }

    this.setNodeMetadata(context.executionId, node.id, {
      metadataSnapshots: [snapshot],
    });
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
    const merged: NodeExecutionMetadataSnapshot = { ...existing, ...metadata };
    if (metadata.metadataSnapshots && metadata.metadataSnapshots.length > 0) {
      const current = Array.isArray(existing.metadataSnapshots)
        ? existing.metadataSnapshots
        : [];
      merged.metadataSnapshots = [...current, ...metadata.metadataSnapshots];
    }
    this.nodeMetadata.set(key, merged);
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

  private resolveTriggerOutput(context: ExecutionContext, currentNodeId: string): any {
    const outputs = context.outputs ?? {};
    if (outputs.trigger !== undefined) {
      return outputs.trigger;
    }

    const normalizedId = currentNodeId.toLowerCase();
    if (normalizedId.startsWith('trigger') && outputs[currentNodeId] !== undefined) {
      return outputs[currentNodeId];
    }

    for (const [nodeId, value] of Object.entries(outputs)) {
      if (nodeId.toLowerCase().startsWith('trigger')) {
        return value;
      }
    }

    return context.prevOutput ?? null;
  }

  private extractRuntimeVariables(context: ExecutionContext): Record<string, any> | undefined {
    const initial = context.initialData;
    if (!initial || typeof initial !== 'object') {
      return undefined;
    }

    const variables = (initial as Record<string, any>).variables;
    if (variables && typeof variables === 'object') {
      return variables as Record<string, any>;
    }

    return undefined;
  }
}

export const workflowRuntime = new WorkflowRuntime();