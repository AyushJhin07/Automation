import { resolveAllParams } from '../core/ParameterResolver.js';
import { integrationManager } from '../integrations/IntegrationManager.js';
import type { APICredentials } from '../integrations/BaseAPIClient.js';
import type { ConnectionService } from '../services/ConnectionService.js';
import { getErrorMessage } from '../types/common.js';
import { db, workflows } from '../database/schema.js';
import { eq } from 'drizzle-orm';

interface WorkflowExecutionContext {
  workflowId: string;
  executionId: string;
  userId?: string;
  nodeOutputs: Record<string, any>;
  timezone?: string;
}

interface NodeExecutionResult {
  summary: string;
  output: any;
  preview?: any;
  logs: string[];
  parameters: Record<string, any>;
  diagnostics?: Record<string, any>;
}

interface TriggerDispatch {
  workflowId: string;
  triggerId: string;
  appId: string;
  payload: any;
  dedupeToken?: string;
  receivedAt?: Date;
  source?: 'webhook' | 'polling';
}

interface CredentialResolutionSuccess {
  success: true;
  credentials: APICredentials;
  source: 'inline' | 'connection';
  connectionId?: string;
  additionalConfig?: Record<string, any>;
}

interface CredentialResolutionFailure {
  success: false;
  error: string;
  reason: string;
  connectionId?: string;
  statusCode?: number;
}

type CredentialResolution = CredentialResolutionSuccess | CredentialResolutionFailure;

export class WorkflowNodeExecutionError extends Error {
  public readonly details?: Record<string, any>;

  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'WorkflowNodeExecutionError';
    this.details = details;
  }
}

export class WorkflowRuntimeService {
  private readonly appAliases: Map<string, string> = new Map([
    ['gmail-enhanced', 'gmail'],
    ['google-gmail', 'gmail'],
    ['google-mail', 'gmail'],
    ['gmail', 'gmail'],
    ['slack-enhanced', 'slack'],
    ['slack', 'slack'],
    ['notion-enhanced', 'notion'],
    ['notion', 'notion'],
    ['airtable-enhanced', 'airtable'],
    ['airtable', 'airtable'],
    ['shopify-enhanced', 'shopify'],
    ['shopify', 'shopify']
  ]);

  private cachedConnectionService: ConnectionService | null | undefined;
  private connectionServiceError?: string;
  private triggerQueue: TriggerDispatch[] = [];
  private processingTriggerQueue = false;

  public async executeNode(node: any, context: WorkflowExecutionContext): Promise<NodeExecutionResult> {
    const role = this.inferRole(node);
    const label = this.selectString(
      node?.data?.label,
      node?.label,
      node?.name,
      node?.id
    ) ?? 'Node';

    const rawParams = this.extractParameters(node);
    const resolvedParams = await resolveAllParams(rawParams, {
      nodeOutputs: context.nodeOutputs,
      currentNodeId: String(node.id),
      workflowId: context.workflowId,
      userId: context.userId,
      executionId: context.executionId
    });

    if (role === 'trigger') {
      const triggerOutput = this.buildTriggerOutput(node, resolvedParams);
      context.nodeOutputs[node.id] = triggerOutput;

      return {
        summary: `Prepared trigger ${label}`,
        output: triggerOutput,
        preview: this.buildPreview(triggerOutput),
        logs: [
          `Evaluated ${Object.keys(resolvedParams).length} parameter${Object.keys(resolvedParams).length === 1 ? '' : 's'}`,
          'Manual run uses provided sample data for triggers.'
        ],
        parameters: resolvedParams,
        diagnostics: {
          role,
          usedSample: Boolean(triggerOutput.__sampleSource)
        }
      };
    }

    if (role === 'transform') {
      const transformOutput = { ...resolvedParams };
      context.nodeOutputs[node.id] = transformOutput;

      return {
        summary: `Evaluated transform ${label}`,
        output: transformOutput,
        preview: this.buildPreview(transformOutput),
        logs: [
          'Transform node executed locally',
          `Produced ${Object.keys(transformOutput).length} field${Object.keys(transformOutput).length === 1 ? '' : 's'}`
        ],
        parameters: resolvedParams,
        diagnostics: { role }
      };
    }

    const appId = this.normalizeAppId(
      this.selectString(
        node?.app,
        node?.data?.app,
        node?.data?.connectorId,
        node?.data?.application,
        typeof node?.type === 'string' ? node.type.split('.')?.[1] : undefined,
        typeof node?.nodeType === 'string' ? node.nodeType.split('.')?.[1] : undefined
      )
    );

    if (!appId) {
      throw new WorkflowNodeExecutionError(`Unable to determine application for ${label}`, {
        reason: 'missing_app',
        nodeId: node?.id
      });
    }

    const functionId = this.normalizeFunctionId(
      this.selectString(
        node?.function,
        node?.data?.function,
        node?.data?.operation,
        node?.functionId,
        node?.op,
        typeof node?.type === 'string' ? node.type.split('.').pop() : undefined
      )
    );

    if (!functionId) {
      throw new WorkflowNodeExecutionError(`Unable to determine function for ${label}`, {
        reason: 'missing_function',
        nodeId: node?.id,
        appId
      });
    }

    const credentialResolution = await this.resolveCredentials(node, context.userId);
    if (!credentialResolution.success) {
      throw new WorkflowNodeExecutionError(credentialResolution.error, {
        reason: credentialResolution.reason,
        nodeId: node?.id,
        appId,
        connectionId: credentialResolution.connectionId
      });
    }

    const executionResponse = await integrationManager.executeFunction({
      appName: appId,
      functionId,
      parameters: resolvedParams,
      credentials: credentialResolution.credentials,
      additionalConfig: credentialResolution.additionalConfig,
      connectionId: credentialResolution.connectionId
    });

    if (!executionResponse.success) {
      throw new WorkflowNodeExecutionError(
        executionResponse.error || `Failed to execute ${appId}.${functionId}`,
        {
          reason: 'integration_error',
          nodeId: node?.id,
          appId,
          functionId,
          response: executionResponse
        }
      );
    }

    const output = executionResponse.data ?? null;
    context.nodeOutputs[node.id] = this.prepareContextOutput(output, resolvedParams);

    return {
      summary: `Executed ${appId}.${functionId}`,
      output,
      preview: this.buildPreview(output),
      logs: [
        `Resolved ${Object.keys(resolvedParams).length} parameter${Object.keys(resolvedParams).length === 1 ? '' : 's'}`,
        executionResponse.executionTime != null
          ? `Connector responded in ${executionResponse.executionTime}ms`
          : 'Connector execution completed'
      ],
      parameters: resolvedParams,
      diagnostics: {
        role,
        app: appId,
        functionId,
        credentialsSource: credentialResolution.source,
        executionTime: executionResponse.executionTime
      }
    };
  }

  public async enqueueTriggerEvent(event: TriggerDispatch): Promise<void> {
    this.triggerQueue.push({ ...event, receivedAt: event.receivedAt ?? new Date() });

    if (!this.processingTriggerQueue) {
      this.processingTriggerQueue = true;
      void this.processTriggerQueue();
    }
  }

  private async processTriggerQueue(): Promise<void> {
    try {
      while (this.triggerQueue.length > 0) {
        const next = this.triggerQueue.shift();
        if (!next) {
          continue;
        }

        try {
          await this.executeWorkflowForTrigger(next);
        } catch (error) {
          console.error('❌ Failed to process trigger event:', getErrorMessage(error));
        }
      }
    } finally {
      this.processingTriggerQueue = false;
    }
  }

  private async executeWorkflowForTrigger(event: TriggerDispatch): Promise<void> {
    if (!event.workflowId) {
      console.warn('⚠️ Trigger event missing workflowId; skipping execution');
      return;
    }

    if (!db) {
      console.warn('⚠️ Database unavailable; cannot load workflow for trigger execution');
      return;
    }

    let workflowRecord: { id: string; graph: any; userId: string } | undefined;
    try {
      const rows = await db
        .select({ id: workflows.id, graph: workflows.graph, userId: workflows.userId })
        .from(workflows)
        .where(eq(workflows.id, event.workflowId))
        .limit(1);
      workflowRecord = rows[0];
    } catch (error) {
      console.error('❌ Failed to load workflow for trigger execution:', getErrorMessage(error));
      return;
    }

    if (!workflowRecord) {
      console.warn(`⚠️ Workflow ${event.workflowId} not found; trigger ignored`);
      return;
    }

    const graph = workflowRecord.graph || {};
    const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];

    if (rawNodes.length === 0) {
      console.warn(`⚠️ Workflow ${event.workflowId} has no nodes to execute`);
      return;
    }

    const normalizedNodes = rawNodes.map((node: any, index: number) => ({
      ...node,
      id: String(node?.id ?? node?.data?.id ?? `node-${index}`),
    }));
    const nodeMap = new Map<string, any>(normalizedNodes.map((node: any) => [node.id, node]));
    const executionOrder = this.computeExecutionOrder(normalizedNodes, rawEdges);

    const executionId = `${event.workflowId}-${Date.now()}`;
    const nodeOutputs: Record<string, any> = {};
    const context: WorkflowExecutionContext = {
      workflowId: event.workflowId,
      executionId,
      userId: workflowRecord.userId,
      nodeOutputs,
    };

    const triggerPayload =
      event.payload && typeof event.payload === 'object'
        ? { ...event.payload }
        : { value: event.payload };

    const triggerMetadata = {
      appId: event.appId,
      triggerId: event.triggerId,
      dedupeToken: event.dedupeToken,
      source: event.source || 'webhook',
      receivedAt: (event.receivedAt || new Date()).toISOString(),
    };

    const triggerOutput = {
      ...triggerPayload,
      __trigger: triggerMetadata,
    };

    nodeOutputs['trigger'] = triggerOutput;

    const normalizedApp = this.normalizeAppId(event.appId);
    const normalizedTrigger = this.normalizeFunctionId(event.triggerId);

    for (const node of normalizedNodes) {
      if (this.inferRole(node) !== 'trigger') {
        continue;
      }

      const nodeApp = this.normalizeAppId(
        this.selectString(node?.app, node?.data?.app, node?.data?.application, node?.data?.connectorId),
      );
      const nodeTriggerId = this.normalizeFunctionId(
        this.selectString(node?.data?.triggerId, node?.data?.function, node?.data?.operation, node?.triggerId),
      );

      if (
        nodeApp === normalizedApp &&
        (normalizedTrigger === null || nodeTriggerId === null || nodeTriggerId === normalizedTrigger)
      ) {
        nodeOutputs[node.id] = triggerOutput;
      }
    }

    if (!normalizedNodes.some((node) => nodeOutputs[node.id])) {
      const firstTrigger = normalizedNodes.find((node) => this.inferRole(node) === 'trigger');
      if (firstTrigger) {
        nodeOutputs[firstTrigger.id] = triggerOutput;
      }
    }

    console.log(
      `🚀 Executing workflow ${event.workflowId} for trigger ${event.appId}.${event.triggerId} (nodes=${executionOrder.length})`,
    );

    for (const nodeId of executionOrder) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }

      const role = this.inferRole(node);
      if (role === 'trigger') {
        if (!nodeOutputs[nodeId]) {
          nodeOutputs[nodeId] = triggerOutput;
        }
        continue;
      }

      try {
        const result = await this.executeNode(node, context);
        nodeOutputs[nodeId] = result.output;
      } catch (error) {
        console.error(
          `❌ Error executing node ${nodeId} in workflow ${event.workflowId}:`,
          getErrorMessage(error),
        );
      }
    }
  }

  private computeExecutionOrder(nodes: any[], edges: any[]): string[] {
    const indegree = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>();

    for (const node of nodes) {
      indegree.set(node.id, 0);
      adjacency.set(node.id, new Set());
    }

    for (const edge of edges) {
      const source = String(edge?.source ?? edge?.from ?? '');
      const target = String(edge?.target ?? edge?.to ?? '');
      if (!adjacency.has(source) || !indegree.has(target)) {
        continue;
      }
      const neighbours = adjacency.get(source)!;
      if (!neighbours.has(target)) {
        neighbours.add(target);
        indegree.set(target, (indegree.get(target) || 0) + 1);
      }
    }

    const queue: string[] = [];
    indegree.forEach((value, key) => {
      if (value === 0) {
        queue.push(key);
      }
    });

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      const neighbours = adjacency.get(current);
      if (!neighbours) {
        continue;
      }

      for (const neighbour of neighbours) {
        const nextValue = (indegree.get(neighbour) || 0) - 1;
        indegree.set(neighbour, nextValue);
        if (nextValue === 0) {
          queue.push(neighbour);
        }
      }
    }

    for (const node of nodes) {
      if (!order.includes(node.id)) {
        order.push(node.id);
      }
    }

    return order;
  }

  private inferRole(node: any): 'trigger' | 'action' | 'transform' {
    const candidates = [
      node?.data?.role,
      node?.role,
      node?.type,
      node?.nodeType,
      typeof node?.type === 'string' ? node.type.split('.')?.[0] : undefined,
      typeof node?.nodeType === 'string' ? node.nodeType.split('.')?.[0] : undefined
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const value = candidate.toLowerCase();
      if (value.includes('trigger')) return 'trigger';
      if (value.includes('transform')) return 'transform';
      if (value.includes('action')) return 'action';
    }

    return 'action';
  }

  private extractParameters(node: any): Record<string, any> {
    const sources = [
      node?.params,
      node?.parameters,
      node?.data?.parameters,
      node?.data?.params,
      node?.config,
      node?.data?.config
    ];

    const merged: Record<string, any> = {};
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      Object.assign(merged, source);
    }

    return this.clone(merged);
  }

  private buildTriggerOutput(node: any, params: Record<string, any>): Record<string, any> {
    const metadata = node?.data?.metadata || {};
    const samples = [
      metadata.sample,
      metadata.sampleRow,
      metadata.example,
      node?.data?.sample,
      node?.data?.outputSample
    ];

    const output: Record<string, any> = { ...params, triggeredAt: new Date().toISOString() };
    for (const sample of samples) {
      if (!sample) continue;
      if (Array.isArray(sample)) {
        output.sample = sample;
        output.__sampleSource = 'array';
      } else if (typeof sample === 'object') {
        Object.assign(output, sample);
        output.__sampleSource = 'object';
      } else {
        output.sample = sample;
        output.__sampleSource = 'value';
      }
      break;
    }

    return output;
  }

  private normalizeAppId(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.toLowerCase().trim();
    if (this.appAliases.has(normalized)) {
      return this.appAliases.get(normalized)!;
    }
    if (normalized.endsWith('-enhanced')) {
      const base = normalized.replace(/-enhanced$/, '');
      return this.appAliases.get(base) ?? base;
    }
    return normalized;
  }

  private normalizeFunctionId(value?: string | null): string | null {
    if (!value) return null;
    const raw = value.toString().split(':').pop() || value.toString();
    const lastSegment = raw.split('.').pop() || raw;
    return lastSegment
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }

  private selectString(...values: Array<string | null | undefined>): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private clone<T>(value: T): T {
    try {
      if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
      }
    } catch {}

    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  private buildPreview(output: any): any {
    if (output == null) {
      return null;
    }

    if (typeof output !== 'object') {
      return { value: output };
    }

    if (Array.isArray(output)) {
      return output.slice(0, 5);
    }

    const keys = Object.keys(output);
    if (keys.length <= 10) {
      return this.clone(output);
    }

    const preview: Record<string, any> = {};
    for (const key of keys.slice(0, 10)) {
      preview[key] = output[key];
    }
    preview.__truncated = keys.length - 10;
    return preview;
  }

  private prepareContextOutput(output: any, params: Record<string, any>): any {
    if (output && typeof output === 'object') {
      return output;
    }
    return { value: output, parameters: params };
  }

  private extractInlineCredentials(node: any): Record<string, any> | null {
    const sources = [
      node?.data?.credentials,
      node?.credentials,
      node?.params?.credentials,
      node?.parameters?.credentials,
      node?.data?.config?.credentials
    ];

    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const keys = Object.keys(source);
      if (keys.length === 0) continue;
      return this.clone(source);
    }

    return null;
  }

  private extractAdditionalConfig(node: any, connectionMetadata?: Record<string, any>): Record<string, any> | undefined {
    const merged: Record<string, any> = {};
    const sources = [
      connectionMetadata?.additionalConfig,
      node?.data?.additionalConfig,
      node?.additionalConfig,
      node?.data?.config?.additionalConfig
    ];

    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      Object.assign(merged, source);
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private async resolveCredentials(node: any, userId?: string): Promise<CredentialResolution> {
    const inlineCredentials = this.extractInlineCredentials(node);
    const connectionId = this.selectString(
      node?.data?.connectionId,
      node?.connectionId,
      node?.params?.connectionId,
      node?.parameters?.connectionId
    );

    if (inlineCredentials) {
      return {
        success: true,
        credentials: inlineCredentials,
        source: 'inline',
        connectionId,
        additionalConfig: this.extractAdditionalConfig(node)
      };
    }

    if (!connectionId) {
      return {
        success: false,
        error: 'No connection configured for this node',
        reason: 'missing_connection'
      };
    }

    if (!userId) {
      return {
        success: false,
        error: 'You must be signed in to use stored connections',
        reason: 'unauthenticated',
        connectionId
      };
    }

    try {
      const service = await this.getConnectionService();
      if (!service) {
        return {
          success: false,
          error: this.connectionServiceError || 'Connection service unavailable',
          reason: 'connection_service_unavailable',
          connectionId
        };
      }

      const connection = await service.getConnection(connectionId, userId);
      if (!connection) {
        return {
          success: false,
          error: `Connection not found: ${connectionId}`,
          reason: 'connection_not_found',
          connectionId
        };
      }

      return {
        success: true,
        credentials: this.clone(connection.credentials),
        source: 'connection',
        connectionId,
        additionalConfig: this.extractAdditionalConfig(node, connection.metadata || {})
      };
    } catch (error: any) {
      const message = getErrorMessage(error);
      const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : undefined;
      const reason = statusCode === 501 ? 'connection_service_unavailable' : 'connection_error';
      return {
        success: false,
        error: message,
        reason,
        connectionId,
        statusCode
      };
    }
  }

  private async getConnectionService(): Promise<ConnectionService | null> {
    if (this.cachedConnectionService !== undefined) {
      return this.cachedConnectionService;
    }

    try {
      const module = await import('../services/ConnectionService.js');
      this.cachedConnectionService = module.connectionService;
      return this.cachedConnectionService;
    } catch (error) {
      const message = getErrorMessage(error);
      console.warn('⚠️ Connection service unavailable:', message);
      this.connectionServiceError = message;
      this.cachedConnectionService = null;
      return null;
    }
  }
}

export const workflowRuntimeService = new WorkflowRuntimeService();
