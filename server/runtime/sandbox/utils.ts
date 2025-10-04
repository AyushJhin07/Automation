import type { SandboxProvisionRequest, SandboxScopeDescriptor, SandboxTelemetryAttributes } from './types.js';

export function createSandboxScopeKey(request: SandboxProvisionRequest): string {
  const organization = request.organizationId ?? 'global';
  if (request.scope === 'tenant') {
    return `tenant:${organization}`;
  }
  const execution = request.executionId ?? 'execution';
  const workflow = request.workflowId ?? 'workflow';
  const node = request.nodeId ?? 'node';
  return `exec:${organization}:${execution}:${workflow}:${node}`;
}

export function mergeStringSets(...lists: Array<string[] | undefined | null>): string[] {
  const result = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const entry of list) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        result.add(trimmed);
      }
    }
  }
  return Array.from(result);
}

export function toTelemetryAttributes(descriptor: SandboxScopeDescriptor): SandboxTelemetryAttributes {
  return {
    scope: descriptor.scope,
    organizationId: descriptor.organizationId,
    executionId: descriptor.executionId,
    workflowId: descriptor.workflowId,
    nodeId: descriptor.nodeId,
  };
}
