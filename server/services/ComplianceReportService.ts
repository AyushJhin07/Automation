import { and, eq } from 'drizzle-orm';

import {
  db,
  organizations,
  tenantIsolations,
  type DataRegion,
} from '../database/schema.js';
import { getErrorMessage } from '../types/common.js';

export interface ResidencyReport {
  organizationId: string;
  region: DataRegion;
  dataResidency: DataRegion;
  storage: {
    secretsNamespace: string;
    filePrefix: string;
    logPrefix: string;
  };
  workloads: {
    executionQueueRegion: DataRegion;
    schedulerRegion: DataRegion;
    webhookRegion: DataRegion;
  };
}

export class ComplianceReportService {
  public async getResidencyReport(organizationId: string): Promise<ResidencyReport | null> {
    if (!db) {
      return null;
    }

    try {
      const [row] = await db
        .select({
          id: organizations.id,
          region: organizations.region,
          compliance: organizations.compliance,
          isolationRegion: tenantIsolations.region,
          storagePrefix: tenantIsolations.storagePrefix,
          logPrefix: tenantIsolations.logPrefix,
        })
        .from(organizations)
        .leftJoin(
          tenantIsolations,
          and(eq(tenantIsolations.organizationId, organizations.id))
        )
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!row) {
        return null;
      }

      const orgRegion = (row.region as DataRegion) ?? 'us';
      const storageRegion = (row.isolationRegion as DataRegion) ?? orgRegion;
      const complianceResidency =
        (row.compliance as { dataResidency?: DataRegion })?.dataResidency ?? orgRegion;

      return {
        organizationId: row.id,
        region: orgRegion,
        dataResidency: complianceResidency,
        storage: {
          secretsNamespace: `${storageRegion}-secrets`,
          filePrefix: row.storagePrefix ?? `${storageRegion}/org_${organizationId}`,
          logPrefix: row.logPrefix ?? `${storageRegion}.org.${organizationId}`,
        },
        workloads: {
          executionQueueRegion: orgRegion,
          schedulerRegion: storageRegion,
          webhookRegion: orgRegion,
        },
      };
    } catch (error) {
      console.error(
        'Failed to build residency compliance report:',
        getErrorMessage(error)
      );
      throw error;
    }
  }
}

export const complianceReportService = new ComplianceReportService();
