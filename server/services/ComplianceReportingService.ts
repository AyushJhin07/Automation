import { resolveWorkflowQueueName } from '../utils/region.js';
import { connectionService } from './ConnectionService';
import { organizationService } from './OrganizationService';
import { getAuditLogPath } from './ExecutionAuditService.js';

export interface ResidencyAssetRecord {
  type: 'workflowQueue' | 'scheduler' | 'connectionSecrets' | 'executionLogs';
  region: string;
  location: string;
  description: string;
  details?: Record<string, any>;
}

export interface OrganizationResidencyReport {
  organizationId: string;
  organizationName: string;
  primaryRegion: string;
  assets: ResidencyAssetRecord[];
  metadata: Record<string, any>;
}

class ComplianceReportingService {
  public async getOrganizationResidencyReport(organizationId: string): Promise<OrganizationResidencyReport> {
    const profile = await organizationService.getOrganizationProfile(organizationId);
    if (!profile) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const queueName = resolveWorkflowQueueName(profile.region);
    const connectionStorage = await connectionService.describeStorageLocation(organizationId);
    const auditLogPath = getAuditLogPath(profile.region);

    const assets: ResidencyAssetRecord[] = [
      {
        type: 'workflowQueue',
        region: profile.region,
        location: queueName,
        description: 'Primary workflow execution queue',
      },
      {
        type: 'scheduler',
        region: profile.region,
        location: `scheduler:${profile.region}`,
        description: 'Polling scheduler workers process triggers within this region',
      },
      {
        type: 'connectionSecrets',
        region: connectionStorage.region,
        location: connectionStorage.location,
        description:
          connectionStorage.backend === 'file'
            ? 'Encrypted connection secrets stored in regional filesystem enclave'
            : 'Encrypted connection secrets stored in regional database partition',
        details: {
          backend: connectionStorage.backend,
          metadata: connectionStorage.metadata ?? {},
        },
      },
      {
        type: 'executionLogs',
        region: profile.region,
        location: auditLogPath,
        description: 'Workflow execution audit logs written to region-scoped storage',
      },
    ];

    return {
      organizationId: profile.id,
      organizationName: profile.name,
      primaryRegion: profile.region,
      assets,
      metadata: {
        plan: profile.plan,
        status: profile.status,
        compliance: profile.compliance,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  public async listOrganizationResidencyReports(
    organizationIds: string[]
  ): Promise<OrganizationResidencyReport[]> {
    const reports: OrganizationResidencyReport[] = [];
    for (const id of organizationIds) {
      try {
        reports.push(await this.getOrganizationResidencyReport(id));
      } catch (error) {
        console.warn(
          `⚠️ Unable to generate residency report for organization ${id}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    return reports;
  }
}

export const complianceReportingService = new ComplianceReportingService();
