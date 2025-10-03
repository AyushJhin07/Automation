import { and, eq } from 'drizzle-orm';
import {
  db,
  organizationConnectorEntitlements,
  organizationConnectorEntitlementAudit,
} from '../database/schema';

type ConnectorEntitlementAction = 'enabled' | 'disabled';

export interface ConnectorEntitlementRecord {
  organizationId: string;
  connectorId: string;
  isEnabled: boolean;
  enabledAt: Date | null;
  disabledAt: Date | null;
  updatedAt: Date | null;
  updatedBy?: string | null;
  metadata?: Record<string, any> | null;
}

export interface UpdateConnectorEntitlementInput {
  organizationId: string;
  connectorId: string;
  enabled: boolean;
  userId?: string;
  reason?: string;
  metadata?: Record<string, any> | null;
}

class ConnectorEntitlementService {
  private ensureDatabase() {
    if (!db) {
      throw new Error('Connector entitlement operations require a configured database');
    }
    return db;
  }

  public async getOrganizationOverrides(organizationId: string): Promise<Map<string, boolean>> {
    if (!db) {
      return new Map();
    }

    const rows = await db
      .select({
        connectorId: organizationConnectorEntitlements.connectorId,
        isEnabled: organizationConnectorEntitlements.isEnabled,
      })
      .from(organizationConnectorEntitlements)
      .where(eq(organizationConnectorEntitlements.organizationId, organizationId));

    const overrides = new Map<string, boolean>();
    for (const row of rows) {
      overrides.set(row.connectorId, row.isEnabled);
    }
    return overrides;
  }

  public async listOrganizationEntitlements(organizationId: string): Promise<ConnectorEntitlementRecord[]> {
    if (!db) {
      return [];
    }

    const rows = await db
      .select({
        organizationId: organizationConnectorEntitlements.organizationId,
        connectorId: organizationConnectorEntitlements.connectorId,
        isEnabled: organizationConnectorEntitlements.isEnabled,
        enabledAt: organizationConnectorEntitlements.enabledAt,
        disabledAt: organizationConnectorEntitlements.disabledAt,
        updatedAt: organizationConnectorEntitlements.updatedAt,
        updatedBy: organizationConnectorEntitlements.updatedBy,
        metadata: organizationConnectorEntitlements.metadata,
      })
      .from(organizationConnectorEntitlements)
      .where(eq(organizationConnectorEntitlements.organizationId, organizationId));

    return rows.map(row => ({
      organizationId: row.organizationId,
      connectorId: row.connectorId,
      isEnabled: row.isEnabled,
      enabledAt: row.enabledAt,
      disabledAt: row.disabledAt,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      metadata: row.metadata ?? null,
    }));
  }

  public async setConnectorAvailability(input: UpdateConnectorEntitlementInput): Promise<ConnectorEntitlementRecord> {
    const database = this.ensureDatabase();
    const { organizationId, connectorId, enabled, userId, reason, metadata } = input;
    const now = new Date();
    const sanitizedMetadata = metadata === null
      ? null
      : (metadata && typeof metadata === 'object' ? metadata : undefined);

    const existing = await database
      .select()
      .from(organizationConnectorEntitlements)
      .where(
        and(
          eq(organizationConnectorEntitlements.organizationId, organizationId),
          eq(organizationConnectorEntitlements.connectorId, connectorId),
        ),
      )
      .limit(1);

    const record = existing[0];

    if (record) {
      await database
        .update(organizationConnectorEntitlements)
        .set({
          isEnabled: enabled,
          enabledAt: enabled ? now : record.enabledAt ?? null,
          disabledAt: enabled ? null : now,
          updatedAt: now,
          updatedBy: userId ?? null,
          metadata: sanitizedMetadata !== undefined ? sanitizedMetadata : record.metadata ?? null,
        })
        .where(
          and(
            eq(organizationConnectorEntitlements.organizationId, organizationId),
            eq(organizationConnectorEntitlements.connectorId, connectorId),
          ),
        );
    } else {
      await database.insert(organizationConnectorEntitlements).values({
        organizationId,
        connectorId,
        isEnabled: enabled,
        enabledAt: enabled ? now : null,
        disabledAt: enabled ? null : now,
        updatedAt: now,
        updatedBy: userId ?? null,
        metadata: sanitizedMetadata ?? null,
      });
    }

    await this.appendAuditLog({
      organizationId,
      connectorId,
      action: enabled ? 'enabled' : 'disabled',
      performedBy: userId,
      reason,
      metadata,
    });

    return {
      organizationId,
      connectorId,
      isEnabled: enabled,
      enabledAt: enabled ? now : record?.enabledAt ?? null,
      disabledAt: enabled ? null : now,
      updatedAt: now,
      updatedBy: userId ?? null,
      metadata: sanitizedMetadata !== undefined ? sanitizedMetadata : record?.metadata ?? null,
    };
  }

  private async appendAuditLog(params: {
    organizationId: string;
    connectorId: string;
    action: ConnectorEntitlementAction;
    performedBy?: string;
    reason?: string;
    metadata?: Record<string, any> | null;
  }): Promise<void> {
    if (!db) {
      return;
    }

    const { organizationId, connectorId, action, performedBy, reason, metadata } = params;

    await db.insert(organizationConnectorEntitlementAudit).values({
      organizationId,
      connectorId,
      action,
      performedBy: performedBy ?? null,
      reason: reason ?? null,
      metadata: metadata ?? null,
    });
  }
}

export const connectorEntitlementService = new ConnectorEntitlementService();
