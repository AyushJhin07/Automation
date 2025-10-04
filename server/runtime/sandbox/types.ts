import type { SandboxScope, SandboxTenancyMetadata } from '../SandboxShared.js';
import type { OrganizationNetworkPolicy } from '../../services/ConnectionService.js';
import type { SandboxResourceLimits } from '../SandboxShared.js';

export interface SandboxProvisionRequest {
  scope: SandboxScope;
  organizationId?: string;
  executionId?: string;
  workflowId?: string;
  nodeId?: string;
}

export interface SandboxScopeDescriptor extends SandboxProvisionRequest {
  key: string;
}

export interface SandboxTenancyConfiguration {
  organizationId?: string;
  dependencyAllowlist: string[];
  secretScopes: string[];
  networkPolicy: OrganizationNetworkPolicy;
  resourceLimits?: SandboxResourceLimits;
  policyVersion?: string | null;
}

export interface SandboxTelemetryAttributes {
  scope: SandboxScope;
  organizationId?: string;
  executionId?: string;
  workflowId?: string;
  nodeId?: string;
}

export interface SandboxMetadataPayload {
  tenancy: SandboxTenancyMetadata;
}
