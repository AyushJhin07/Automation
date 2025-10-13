import { resolveAllParams } from '../core/ParameterResolver.js';
import { integrationManager } from '../integrations/IntegrationManager.js';
import type { APICredentials } from '../integrations/BaseAPIClient.js';
import type { ConnectionService } from '../services/ConnectionService.js';
import { getErrorMessage } from '../types/common.js';
import { WorkflowRepository } from './WorkflowRepository.js';
import { workflowRuntime } from '../core/WorkflowRuntime.js';
import { getAppsScriptConnectorFlag } from '../runtime/appsScriptConnectorFlags.js';
import {
  resolveRuntime,
  type RuntimeAvailability,
  type RuntimeIdentifier,
  type RuntimeResolutionIssue,
} from '../runtime/registry.js';
import {
  createWorkflowNodeMetadataSnapshot,
  inferWorkflowMetadataFromValue,
  type WorkflowMetadata,
  type WorkflowMetadataSource,
  type WorkflowNodeMetadataSnapshot,
} from '@shared/workflow/metadata';

interface WorkflowExecutionContext {
  workflowId: string;
  executionId: string;
  userId?: string;
  organizationId?: string;
  nodeOutputs: Record<string, any>;
  timezone?: string;
  edges?: Array<Record<string, any>>;
}

interface NodeExecutionResult {
  summary: string;
  output: any;
  preview?: any;
  logs: string[];
  parameters: Record<string, any>;
  diagnostics?: Record<string, any>;
  metadataSnapshot?: WorkflowNodeMetadataSnapshot;
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

interface RuntimeSelectionInfo {
  availability: RuntimeAvailability;
  runtime: RuntimeIdentifier | null;
  issues: RuntimeResolutionIssue[];
  nativeRuntimes: RuntimeIdentifier[];
  fallbackRuntimes: RuntimeIdentifier[];
}

interface TriggerWorkflowOptions {
  workflowId: string;
  triggerId: string;
  appId: string;
  source: 'webhook' | 'polling';
  payload: any;
  headers: Record<string, string>;
  timestamp: Date;
  dedupeToken?: string;
  organizationId: string;
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
      const metadataSnapshot = this.buildMetadataSnapshot(node, resolvedParams, triggerOutput);

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
        },
        metadataSnapshot
      };
    }

    if (role === 'transform') {
      const transformOutput = { ...resolvedParams };
      context.nodeOutputs[node.id] = transformOutput;
      const metadataSnapshot = this.buildMetadataSnapshot(node, resolvedParams, transformOutput);

      return {
        summary: `Evaluated transform ${label}`,
        output: transformOutput,
        preview: this.buildPreview(transformOutput),
        logs: [
          'Transform node executed locally',
          `Produced ${Object.keys(transformOutput).length} field${Object.keys(transformOutput).length === 1 ? '' : 's'}`
        ],
        parameters: resolvedParams,
        diagnostics: { role },
        metadataSnapshot
      };
    }

    if (role === 'condition') {
      const conditionResult = this.executeCondition(node, resolvedParams, context, label);
      context.nodeOutputs[node.id] = conditionResult.output;

      return conditionResult;
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

    const operationKind: 'action' | 'trigger' = role === 'trigger' ? 'trigger' : 'action';
    const runtimeInfo = this.resolveConnectorRuntimeSelection({
      role: operationKind,
      appId,
      functionId,
    });

    this.ensureAppsScriptConnectorEnabled(appId, functionId, runtimeInfo);

    const credentialResolution = await this.resolveCredentials(
      node,
      context.userId,
      context.organizationId
    );
    if (!credentialResolution.success) {
      throw new WorkflowNodeExecutionError(credentialResolution.error, {
        reason: credentialResolution.reason,
        nodeId: node?.id,
        appId,
        connectionId: credentialResolution.connectionId
      });
    }

    const idempotencyKey = this.buildIdempotencyKey(context.executionId, node.id);

    const executionResponse = await integrationManager.executeFunction({
      appName: appId,
      functionId,
      parameters: resolvedParams,
      credentials: credentialResolution.credentials,
      additionalConfig: credentialResolution.additionalConfig,
      connectionId: credentialResolution.connectionId,
      executionId: context.executionId,
      nodeId: String(node.id),
      idempotencyKey
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
    const metadataSnapshot = this.buildMetadataSnapshot(node, resolvedParams, output);

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
        executionTime: executionResponse.executionTime,
        runtime: runtimeInfo.runtime ?? null,
        runtimeAvailability: runtimeInfo.availability,
      },
      metadataSnapshot
    };
  }

  private inferRole(node: any): 'trigger' | 'action' | 'transform' | 'condition' {
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
      if (value.includes('condition')) return 'condition';
      if (value.includes('action')) return 'action';
    }

    return 'action';
  }

  private buildIdempotencyKey(executionId: string, nodeId: string | number): string {
    const executionPart = String(executionId || '').trim() || 'execution';
    const nodePart = String(nodeId ?? '').trim() || 'node';
    return `${executionPart}:${nodePart}`;
  }

  private executeCondition(
    node: any,
    params: Record<string, any>,
    context: WorkflowExecutionContext,
    label: string
  ): NodeExecutionResult {
    const logs: string[] = [];
    const evaluations: Array<Record<string, any>> = [];

    const branches = this.collectConditionBranches(node, context.edges ?? []);
    const rules = this.normalizeConditionRules(node, params);

    const expression = this.selectString(
      typeof params.rule === 'string' ? params.rule : undefined,
      typeof params.expression === 'string' ? params.expression : undefined,
      typeof params.condition === 'string' ? params.condition : undefined,
      typeof node?.data?.config?.rule === 'string' ? node.data.config.rule : undefined,
      typeof node?.data?.rule === 'string' ? node.data.rule : undefined
    );

    let matchedBranchValue: string | null = null;
    let matchedEdgeId: string | null = null;
    let matchedTargetId: string | null = null;
    let matchedLabel: string | null = null;
    let evaluationError: string | null = null;

    const scope = this.buildConditionScope(params, context);

    const evaluate = (candidate: any, branchValueHint?: string | null) => {
      const result = this.evaluateConditionExpression(candidate, scope);
      evaluations.push({
        expression: typeof candidate === 'string' ? candidate : undefined,
        raw: result.raw,
        result: result.value,
        error: result.error,
        branchValue: branchValueHint ?? null
      });
      if (result.error) {
        evaluationError = result.error;
        logs.push(`Error evaluating condition: ${result.error}`);
      }
      return result.value;
    };

    if (rules.length > 0) {
      for (const rule of rules) {
        const { expression: candidateExpression, branchValue, label: ruleLabel, isDefault } = rule;
        if (candidateExpression == null && !isDefault) {
          continue;
        }

        const evaluation = candidateExpression == null ? true : evaluate(candidateExpression, branchValue);
        if (evaluation) {
          matchedBranchValue = branchValue ?? (isDefault ? 'true' : null);
          matchedLabel = ruleLabel ?? null;
          break;
        }
      }
    }

    if (!matchedBranchValue && expression) {
      const evaluation = evaluate(expression);
      matchedBranchValue = evaluation ? 'true' : 'false';
    } else if (typeof params.rule === 'boolean') {
      matchedBranchValue = params.rule ? 'true' : 'false';
      evaluations.push({ expression: 'boolean', raw: params.rule, result: params.rule, branchValue: matchedBranchValue });
    } else if (typeof params.rule === 'number') {
      matchedBranchValue = params.rule ? 'true' : 'false';
      evaluations.push({ expression: 'number', raw: params.rule, result: Boolean(params.rule), branchValue: matchedBranchValue });
    } else if (params.rule && typeof params.rule === 'object' && 'value' in params.rule && typeof params.rule.value === 'boolean') {
      matchedBranchValue = params.rule.value ? 'true' : 'false';
      evaluations.push({
        expression: 'object',
        raw: params.rule.value,
        result: Boolean(params.rule.value),
        branchValue: matchedBranchValue
      });
    } else if (expression) {
      const evaluation = evaluate(expression);
      matchedBranchValue = evaluation ? 'true' : 'false';
    }

    if (!matchedBranchValue && branches.length === 1) {
      matchedBranchValue = branches[0].value ?? 'true';
      matchedLabel = branches[0].label ?? matchedLabel;
    }

    if (!matchedBranchValue) {
      const defaultBranch = branches.find(branch => branch.isDefault);
      if (defaultBranch) {
        matchedBranchValue = defaultBranch.value ?? null;
        matchedLabel = defaultBranch.label ?? matchedLabel;
      }
    }

    if (matchedBranchValue) {
      const branch = this.findMatchingBranch(branches, matchedBranchValue, matchedLabel);
      if (branch) {
        matchedBranchValue = branch.value ?? matchedBranchValue;
        matchedEdgeId = branch.edgeId ?? null;
        matchedTargetId = branch.targetId ?? null;
        matchedLabel = branch.label ?? matchedLabel;
      }
    }

    if (!matchedEdgeId && branches.length === 1) {
      matchedEdgeId = branches[0].edgeId ?? null;
      matchedTargetId = branches[0].targetId ?? null;
      matchedLabel = branches[0].label ?? matchedLabel;
      matchedBranchValue = branches[0].value ?? matchedBranchValue;
    }

    logs.push(
      `Evaluated ${evaluations.length} condition${evaluations.length === 1 ? '' : 's'}${matchedBranchValue ? ` → matched "${matchedBranchValue}"` : ''}`
    );

    const output = {
      expression: expression ?? null,
      evaluations,
      result: matchedBranchValue === 'true',
      matchedBranch: matchedBranchValue,
      matchedLabel,
      selectedEdgeId: matchedEdgeId,
      selectedTargetId: matchedTargetId,
      availableBranches: branches,
      error: evaluationError
    };

    const summary = matchedBranchValue
      ? `Condition matched branch ${matchedLabel ? `"${matchedLabel}"` : matchedBranchValue}`
      : `Evaluated condition ${label}`;

    const metadataSnapshot = this.buildMetadataSnapshot(node, params, output);

    return {
      summary,
      output,
      preview: this.buildPreview(output),
      logs,
      parameters: params,
      diagnostics: {
        role: 'condition',
        expression: expression ?? null,
        matchedBranch: matchedBranchValue,
        matchedEdgeId,
        matchedTargetId,
        result: matchedBranchValue === 'true',
        availableBranches: branches,
        evaluationError
      },
      metadataSnapshot
    };
  }

  private normalizeConditionRules(node: any, params: Record<string, any>): Array<{
    expression?: any;
    branchValue?: string | null;
    label?: string | null;
    isDefault?: boolean;
  }> {
    const sources: Array<any> = [
      params?.rules,
      params?.branches,
      node?.rules,
      node?.data?.rules,
      node?.data?.branches,
      node?.data?.config?.rules,
      node?.data?.config?.branches
    ];

    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      return source.map((rule: any) => {
        const branchValue = this.normalizeBranchValue(
          this.selectString(
            typeof rule?.value === 'string' ? rule.value : undefined,
            typeof rule?.branchValue === 'string' ? rule.branchValue : undefined,
            typeof rule?.branch === 'string' ? rule.branch : undefined,
            typeof rule?.label === 'string' ? rule.label : undefined,
            typeof rule?.id === 'string' ? rule.id : undefined
          )
        );

        return {
          expression: rule?.expression ?? rule?.rule ?? rule?.condition ?? rule?.when ?? null,
          branchValue,
          label: this.selectString(rule?.label, rule?.name, rule?.branch, rule?.value, rule?.id) ?? null,
          isDefault: Boolean(rule?.default || rule?.isDefault || rule?.fallback)
        };
      });
    }

    return [];
  }

  private collectConditionBranches(node: any, edges: Array<Record<string, any>>): Array<{
    edgeId: string | null;
    targetId: string | null;
    label: string | null;
    value: string | null;
    isDefault: boolean;
  }> {
    const nodeId = String(node?.id ?? '');
    if (!nodeId) return [];

    const outgoing = edges.filter(edge => String(edge.source ?? edge.from ?? '') === nodeId);
    const mapped = outgoing.map(edge => {
      const label = this.selectString(
        typeof edge?.label === 'string' ? edge.label : undefined,
        typeof edge?.branchLabel === 'string' ? edge.branchLabel : undefined,
        typeof edge?.data?.label === 'string' ? edge.data.label : undefined,
        typeof edge?.data?.branchLabel === 'string' ? edge.data.branchLabel : undefined,
        typeof edge?.metadata?.label === 'string' ? edge.metadata.label : undefined
      );

      const branchValueRaw = this.selectString(
        typeof edge?.branchValue === 'string' ? edge.branchValue : undefined,
        typeof edge?.data?.branchValue === 'string' ? edge.data.branchValue : undefined,
        typeof edge?.condition?.value === 'string' ? edge.condition.value : undefined,
        typeof edge?.data?.value === 'string' ? edge.data.value : undefined,
        label
      );

      return {
        edgeId: edge?.id ? String(edge.id) : null,
        targetId: edge?.target ? String(edge.target) : edge?.to ? String(edge.to) : null,
        label: label ?? null,
        value: this.normalizeBranchValue(branchValueRaw),
        isDefault: Boolean(
          edge?.isDefault ||
            edge?.default ||
            edge?.data?.isDefault ||
            edge?.data?.default ||
            edge?.metadata?.default ||
            (branchValueRaw && branchValueRaw.toLowerCase() === 'default')
        )
      };
    });

    if (mapped.length === 1) {
      mapped[0].value = mapped[0].value ?? 'true';
      mapped[0].isDefault = true;
    }

    if (mapped.length === 2) {
      const hasTrue = mapped.some(branch => branch.value === 'true');
      const hasFalse = mapped.some(branch => branch.value === 'false');
      if (!hasTrue || !hasFalse) {
        mapped[0].value = mapped[0].value ?? 'true';
        mapped[1].value = mapped[1].value ?? 'false';
      }
    }

    return mapped;
  }

  private findMatchingBranch(
    branches: Array<{ edgeId: string | null; targetId: string | null; label: string | null; value: string | null; isDefault: boolean }>,
    branchValue: string,
    branchLabel: string | null
  ) {
    const normalizedValue = this.normalizeBranchValue(branchValue);
    let match = branches.find(branch => branch.value === normalizedValue);
    if (!match && branchLabel) {
      match = branches.find(branch => (branch.label ?? '').toLowerCase() === branchLabel.toLowerCase());
    }
    if (!match) {
      match = branches.find(branch => branch.isDefault);
    }
    return match ?? null;
  }

  private buildConditionScope(params: Record<string, any>, context: WorkflowExecutionContext) {
    const nodeOutputs = context.nodeOutputs ?? {};
    const scope = {
      params,
      parameters: params,
      data: params,
      inputs: nodeOutputs,
      nodes: nodeOutputs,
      nodeOutputs,
      timezone: context.timezone,
      workflowId: context.workflowId,
      executionId: context.executionId
    } as Record<string, any>;

    for (const [key, value] of Object.entries(params)) {
      if (typeof key === 'string') {
        scope[key] = value;
      }
    }

    return scope;
  }

  private evaluateConditionExpression(expression: any, scope: Record<string, any>): { value: boolean; raw: any; error?: string } {
    if (typeof expression === 'boolean') {
      return { value: expression, raw: expression };
    }

    if (typeof expression === 'number') {
      return { value: expression !== 0, raw: expression };
    }

    if (expression == null) {
      return { value: false, raw: expression, error: 'No condition expression provided' };
    }

    if (typeof expression === 'object' && 'value' in expression && typeof expression.value !== 'undefined') {
      const raw = (expression as any).value;
      return { value: Boolean(raw), raw };
    }

    const text = String(expression);
    const preparedExpression = this.normalizeConditionExpressionText(text);

    try {
      const evaluator = Function(
        'scope',
        'nodeOutputs',
        'with(scope) { return (function() { return eval(arguments[0]); }).call(scope, arguments[2]); }'
      );

      const raw = evaluator(scope, scope.nodeOutputs, preparedExpression);
      return { value: Boolean(raw), raw };
    } catch (error: any) {
      return {
        value: false,
        raw: undefined,
        error: typeof error?.message === 'string' ? error.message : String(error ?? 'Condition evaluation failed')
      };
    }
  }



  private normalizeConditionExpressionText(expression: string): string {
    return expression.replace(/\[([^\]\s"'`]+)\]/g, (_match, group) => {
      const key = String(group).trim();
      if (!key) {
        return '[]';
      }
      if (/^['"]/.test(key) || /^\d+$/.test(key)) {
        return `[${key}]`;
      }
      const safe = key.replace(/\\/g, '\\').replace(/'/g, "\'");
      return `['${safe}']`;
    });
  }

  private normalizeBranchValue(value?: string | null): string | null {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (value == null) {
      return null;
    }

    const text = String(value).trim();
    if (!text) {
      return null;
    }

    const normalized = text.toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) {
      return 'true';
    }
    if (['false', 'no', 'n', '0'].includes(normalized)) {
      return 'false';
    }
    if (normalized === 'default') {
      return 'default';
    }
    return text;
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

  private resolveConnectorRuntimeSelection(args: {
    role: 'action' | 'trigger';
    appId: string;
    functionId: string;
  }): RuntimeSelectionInfo {
    const resolution = resolveRuntime({
      kind: args.role,
      appId: args.appId,
      operationId: args.functionId,
    });

    return {
      availability: resolution.availability,
      runtime: resolution.runtime,
      issues: resolution.issues,
      nativeRuntimes: resolution.nativeRuntimes,
      fallbackRuntimes: resolution.fallbackRuntimes,
    };
  }

  private ensureAppsScriptConnectorEnabled(
    appId: string,
    functionId: string,
    runtimeInfo: RuntimeSelectionInfo,
  ): void {
    const gatingIssue = runtimeInfo.issues.find(
      issue => issue.code === 'runtime.apps_script_connector_disabled',
    );
    if (gatingIssue) {
      const flag = getAppsScriptConnectorFlag(appId);
      const message =
        gatingIssue.message ??
        `Apps Script runtime disabled for ${appId}.${functionId}; set ${flag.envKey}=true to enable.`;
      throw new WorkflowNodeExecutionError(message, {
        reason: 'apps_script_disabled',
        appId,
        functionId,
        envKey: flag.envKey,
      });
    }

    if (runtimeInfo.availability === 'unavailable') {
      const issueMessage = runtimeInfo.issues[0]?.message;
      const message =
        issueMessage ??
        `Execution for ${appId}.${functionId} is not available in this environment.`;
      throw new WorkflowNodeExecutionError(message, {
        reason: 'runtime_unavailable',
        appId,
        functionId,
      });
    }
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

  private toMetadataSource(value: unknown): WorkflowMetadata | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as WorkflowMetadata;
  }

  private buildMetadataSnapshot(
    node: any,
    params: Record<string, any>,
    output: unknown
  ): WorkflowNodeMetadataSnapshot | undefined {
    const inputs: WorkflowMetadataSource[] = [];
    const outputs: WorkflowMetadataSource[] = [];

    const pushSource = (collection: WorkflowMetadataSource[], candidate: unknown) => {
      const source = this.toMetadataSource(candidate);
      if (source) {
        collection.push(source);
      }
    };

    pushSource(inputs, node?.metadata);
    pushSource(inputs, node?.data?.metadata);

    const paramMetadata = inferWorkflowMetadataFromValue(params);
    if (paramMetadata) {
      inputs.push(paramMetadata);
    }

    pushSource(outputs, node?.outputMetadata);
    pushSource(outputs, node?.data?.outputMetadata);

    const snapshot = createWorkflowNodeMetadataSnapshot({
      nodeId: node?.id ? String(node.id) : undefined,
      inputs,
      outputs,
      runtimeOutput: output,
      timestamp: new Date(),
    });

    return snapshot ?? undefined;
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

  /**
   * Resolve credentials for a node by inspecting supported connection references.
   * Serializers should populate one of the following locations when using stored connections:
   * - node.data.auth.connectionId
   * - node.data.connectionId
   * - node.connectionId
   * - node.params.connectionId
   * - node.parameters.connectionId
   * - node.data.parameters.connectionId
   */
  private async resolveCredentials(
    node: any,
    userId?: string,
    organizationId?: string
  ): Promise<CredentialResolution> {
    const inlineCredentials = this.extractInlineCredentials(node);
    const connectionId = this.selectString(
      node?.data?.auth?.connectionId,
      node?.data?.connectionId,
      node?.connectionId,
      node?.params?.connectionId,
      node?.parameters?.connectionId,
      node?.data?.parameters?.connectionId
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

    if (!organizationId) {
      return {
        success: false,
        error: 'Missing organization context for stored connection',
        reason: 'missing_organization',
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

      const context = await service.prepareConnectionForClient({
        connectionId,
        userId,
        organizationId,
      });
      if (!context) {
        return {
          success: false,
          error: `Connection not found: ${connectionId}`,
          reason: 'connection_not_found',
          connectionId
        };
      }

      const credentials = { ...context.credentials };

      if (context.networkPolicy) {
        (credentials as APICredentials).__organizationNetworkPolicy = context.networkPolicy;
        if (context.networkPolicy.allowlist) {
          (credentials as APICredentials).__organizationNetworkAllowlist =
            context.networkPolicy.allowlist;
        }
      } else if (context.networkAllowlist) {
        (credentials as APICredentials).__organizationNetworkAllowlist = context.networkAllowlist;
      }

      (credentials as APICredentials).__organizationId = context.connection.organizationId;
      (credentials as APICredentials).__connectionId = context.connection.id;
      if (userId) {
        (credentials as APICredentials).__userId = userId;
      }

      return {
        success: true,
        credentials,
        source: 'connection',
        connectionId,
        additionalConfig: this.extractAdditionalConfig(node, context.connection.metadata || {})
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
      const workflow = await WorkflowRepository.getWorkflowById(options.workflowId, options.organizationId);
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
