import { resolveAllParams } from '../core/ParameterResolver.js';
import { integrationManager } from '../integrations/IntegrationManager.js';
import type { APICredentials } from '../integrations/BaseAPIClient.js';
import type { ConnectionService } from '../services/ConnectionService.js';
import { getErrorMessage } from '../types/common.js';
import { WorkflowRepository } from './WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';

interface WorkflowExecutionContext {
  workflowId: string;
  executionId: string;
  userId?: string;
  nodeOutputs: Record<string, any>;
  timezone?: string;
  nodeMap?: Map<string, any>;
  edges?: Array<Record<string, any>>;
  skipNodes?: Set<string>;
}

interface NodeExecutionResult {
  summary: string;
  output: any;
  preview?: any;
  logs: string[];
  parameters: Record<string, any>;
  diagnostics?: Record<string, any>;
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

interface TriggerWorkflowOptions {
  workflowId: string;
  triggerId: string;
  appId: string;
  source: 'webhook' | 'polling';
  payload: any;
  headers: Record<string, string>;
  timestamp: Date;
  dedupeToken?: string;
}

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

    if (role === 'loop') {
      return this.executeLoopNode(node, resolvedParams, context);
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

  private inferRole(node: any): 'trigger' | 'action' | 'transform' | 'loop' {
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
      if (value.includes('loop')) return 'loop';
    }

    return 'action';
  }

  private async executeLoopNode(
    node: any,
    resolvedParams: Record<string, any>,
    context: WorkflowExecutionContext
  ): Promise<NodeExecutionResult> {
    const rawCollection = resolvedParams.collection ?? resolvedParams.items ?? [];
    const items = this.normalizeLoopCollection(rawCollection);
    const alias = this.normalizeLoopAlias(
      this.selectString(
        resolvedParams.itemAlias,
        node?.data?.itemAlias,
        node?.data?.parameters?.itemAlias
      ) ?? 'item',
      'item'
    );
    const indexAlias = this.normalizeLoopAlias(
      this.selectString(resolvedParams.indexAlias, node?.data?.parameters?.indexAlias),
      'index',
      true
    );

    const bodyNodes = this.resolveLoopBodyNodes(node, context);
    const iterationOutputs: Array<{ index: number; item: any; outputs: Record<string, any> }> = [];
    const iterationLogs: string[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const loopState: Record<string, any> = {
        item,
        index,
        total: items.length,
        collection: items,
        [alias]: item
      };
      if (indexAlias) {
        loopState[indexAlias] = index;
      }
      context.nodeOutputs[node.id] = loopState;

      const perIterationOutputs: Record<string, any> = {};

      for (const bodyNode of bodyNodes) {
        const result = await this.executeNode(bodyNode, context);
        perIterationOutputs[bodyNode.id] = result.output;
        iterationLogs.push(
          `Item ${index + 1}/${items.length} → ${this.selectString(bodyNode?.label, bodyNode?.name, bodyNode?.id) ?? bodyNode.id}: ${result.summary}`
        );
      }

      iterationOutputs.push({ index, item, outputs: perIterationOutputs });
    }

    const loopOutput = {
      collection: items,
      alias,
      indexAlias: indexAlias || undefined,
      iterations: iterationOutputs,
      total: items.length,
      lastItem: items.length > 0 ? items[items.length - 1] : undefined
    };

    context.nodeOutputs[node.id] = loopOutput;

    if (context.skipNodes) {
      for (const bodyNode of bodyNodes) {
        context.skipNodes.add(String(bodyNode.id));
      }
    }

    const logLines = [
      `Prepared ${items.length} item${items.length === 1 ? '' : 's'} for iteration`,
      ...iterationLogs.slice(0, 10)
    ];

    return {
      summary: `Iterated ${items.length} item${items.length === 1 ? '' : 's'}`,
      output: loopOutput,
      preview: this.buildPreview(loopOutput),
      logs: logLines,
      parameters: resolvedParams,
      diagnostics: {
        role: 'loop',
        iterations: items.length
      }
    };
  }

  private resolveLoopBodyNodes(node: any, context: WorkflowExecutionContext): any[] {
    const idSources = [
      node?.data?.bodyNodeIds,
      node?.data?.loop?.bodyNodeIds,
      node?.data?.parameters?.bodyNodeIds
    ];

    const ids = new Set<string>();
    for (const source of idSources) {
      if (!Array.isArray(source)) continue;
      for (const id of source) {
        if (typeof id === 'string' && id.trim().length > 0) {
          ids.add(id.trim());
        }
      }
    }

    if (ids.size === 0) {
      return [];
    }

    const resolved: any[] = [];
    if (context.nodeMap instanceof Map) {
      for (const id of ids) {
        const found = context.nodeMap.get(id) ?? context.nodeMap.get(String(id));
        if (found) {
          resolved.push(found);
        }
      }
    }

    if (resolved.length === 0 && Array.isArray((context as any)?.nodes)) {
      const allNodes = (context as any).nodes as any[];
      for (const id of ids) {
        const found = allNodes.find(n => String(n.id) === id);
        if (found) {
          resolved.push(found);
        }
      }
    }

    if (resolved.length === 0) {
      return [];
    }

    return this.computeLoopBodyOrder(resolved, context.edges ?? []);
  }

  private computeLoopBodyOrder(nodes: any[], edges: Array<Record<string, any>>): any[] {
    if (nodes.length <= 1) {
      return nodes;
    }

    const idSet = new Set(nodes.map(n => String(n.id)));
    const adjacency = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();

    for (const node of nodes) {
      const id = String(node.id);
      adjacency.set(id, new Set());
      indegree.set(id, 0);
    }

    for (const edge of edges) {
      const source = this.selectString(edge.source, edge.from);
      const target = this.selectString(edge.target, edge.to);
      if (!source || !target) continue;
      if (!idSet.has(source) || !idSet.has(target)) continue;

      const neighbours = adjacency.get(source)!;
      if (!neighbours.has(target)) {
        neighbours.add(target);
        indegree.set(target, (indegree.get(target) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of indegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const orderedIds: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      orderedIds.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        const nextDegree = (indegree.get(neighbour) ?? 0) - 1;
        indegree.set(neighbour, nextDegree);
        if (nextDegree === 0) {
          queue.push(neighbour);
        }
      }
    }

    for (const id of idSet) {
      if (!orderedIds.includes(id)) {
        orderedIds.push(id);
      }
    }

    return orderedIds
      .map(id => nodes.find(node => String(node.id) === id))
      .filter((node): node is any => Boolean(node));
  }

  private normalizeLoopCollection(value: any): any[] {
    if (Array.isArray(value)) {
      return value;
    }
    if (value == null) {
      return [];
    }
    if (typeof value === 'object') {
      return Object.values(value);
    }
    return [value];
  }

  private normalizeLoopAlias(value: string | undefined | null, fallback: string, allowEmptyFallback = false): string {
    const candidate =
      typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : allowEmptyFallback
          ? ''
          : fallback;
    const sanitized = candidate.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!sanitized && !allowEmptyFallback) {
      return fallback;
    }
    return sanitized;
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

  public async triggerWorkflowExecution(options: TriggerWorkflowOptions): Promise<{ success: boolean; error?: string }> {
    try {
      const workflow = await WorkflowRepository.getWorkflowById(options.workflowId);
      if (!workflow) {
        return { success: false, error: `Workflow not found: ${options.workflowId}` };
      }

      if (!workflow.graph) {
        return { success: false, error: 'Workflow graph is not available for execution' };
      }

      const initialData = {
        trigger: {
          id: options.triggerId,
          appId: options.appId,
          source: options.source,
          payload: options.payload,
          headers: options.headers,
          dedupeToken: options.dedupeToken,
          timestamp: options.timestamp.toISOString(),
        },
        payload: options.payload,
      };

      const execution = await workflowRuntime.executeWorkflow(workflow.graph as any, initialData, workflow.userId);
      return {
        success: execution.success,
        error: execution.success ? undefined : execution.error,
      };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }
}

export const workflowRuntimeService = new WorkflowRuntimeService();
