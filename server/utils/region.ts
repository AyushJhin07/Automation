import type { OrganizationRegion } from '../database/schema.js';
import type { WorkflowQueueName } from '../queue/types.js';

const DEFAULT_REGION = normalizeInput(process.env.DEFAULT_ORGANIZATION_REGION) ?? 'us';

function normalizeInput(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function normalizeRegion(
  region?: string | null,
  fallback: OrganizationRegion = DEFAULT_REGION as OrganizationRegion
): OrganizationRegion {
  const normalized = normalizeInput(region);
  if (normalized) {
    return normalized as OrganizationRegion;
  }
  return fallback;
}

export function isWildcardRegion(region: string | null | undefined): boolean {
  const normalized = normalizeInput(region);
  if (!normalized) {
    return false;
  }
  return normalized === 'global' || normalized === 'any' || normalized === 'all';
}

export function resolveWorkerRegion(): OrganizationRegion {
  const configured =
    normalizeInput(process.env.WORKER_REGION) ?? normalizeInput(process.env.EXECUTION_WORKER_REGION);
  return normalizeRegion(configured);
}

export function resolveWorkflowQueueName(region: string | null | undefined): WorkflowQueueName {
  const normalized = normalizeRegion(region);
  return isWildcardRegion(normalized) ? 'workflow.execute' : (`workflow.execute.${normalized}` as WorkflowQueueName);
}

export const defaultRegion: OrganizationRegion = normalizeRegion(DEFAULT_REGION);
