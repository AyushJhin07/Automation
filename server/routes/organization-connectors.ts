import { Router } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { connectorRegistry } from '../ConnectorRegistry';
import { connectorEntitlementService } from '../services/ConnectorEntitlementService';
import { getErrorMessage } from '../types/common';
import type { Permission } from '../../configs/rbac';

const router = Router();

const MANAGE_CONNECTORS_PERMISSION: Permission = 'connections:write';

const ensureOrganizationContext = (req: any, organizationId: string): boolean => {
  if (!req.organizationId || req.organizationId !== organizationId) {
    return false;
  }
  return true;
};

router.get(
  '/:organizationId/connectors/entitlements',
  authenticateToken,
  requirePermission(MANAGE_CONNECTORS_PERMISSION),
  async (req, res) => {
    try {
      const { organizationId } = req.params;

      if (!ensureOrganizationContext(req, organizationId)) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      const entitlements = await connectorEntitlementService.listOrganizationEntitlements(organizationId);
      const records = entitlements.map(entry => {
        const registryEntry = connectorRegistry.getConnector(entry.connectorId);
        const pricingTier = registryEntry?.pricingTier ?? 'starter';
        const name = registryEntry?.definition.name ?? entry.connectorId;
        const availability = registryEntry?.availability ?? 'experimental';
        const status = registryEntry?.status;
        const allowedByPlan = connectorRegistry.canAccessPricingTier(req.organizationPlan, pricingTier);

        return {
          connectorId: entry.connectorId,
          connectorName: name,
          pricingTier,
          availability,
          status,
          isEnabled: entry.isEnabled,
          enabledAt: entry.enabledAt,
          disabledAt: entry.disabledAt,
          updatedAt: entry.updatedAt,
          updatedBy: entry.updatedBy,
          metadata: entry.metadata ?? null,
          allowedByPlan,
          effective: entry.isEnabled || allowedByPlan,
        };
      });

      return res.json({
        success: true,
        organizationId,
        entitlements: records,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

router.patch(
  '/:organizationId/connectors/:connectorId',
  authenticateToken,
  requirePermission(MANAGE_CONNECTORS_PERMISSION),
  async (req, res) => {
    try {
      const { organizationId, connectorId } = req.params;
      const { enabled, reason, metadata } = req.body ?? {};

      if (!ensureOrganizationContext(req, organizationId)) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'Request body must include a boolean "enabled" field' });
      }

      const registryEntry = connectorRegistry.getConnector(connectorId);
      if (!registryEntry) {
        return res.status(404).json({
          success: false,
          error: `Connector not found: ${connectorId}`,
        });
      }

      const sanitizedMetadata = metadata && typeof metadata === 'object' ? metadata : undefined;

      const updated = await connectorEntitlementService.setConnectorAvailability({
        organizationId,
        connectorId,
        enabled,
        userId: req.user?.id,
        reason: typeof reason === 'string' ? reason : undefined,
        metadata: sanitizedMetadata ?? null,
      });

      const pricingTier = registryEntry.pricingTier;
      const allowedByPlan = connectorRegistry.canAccessPricingTier(req.organizationPlan, pricingTier);
      const effective = enabled || allowedByPlan;

      return res.json({
        success: true,
        organizationId,
        connectorId,
        entitlement: {
          connectorId,
          connectorName: registryEntry.definition.name,
          pricingTier,
          availability: registryEntry.availability,
          status: registryEntry.status,
          enabled,
          allowedByPlan,
          effective,
          enabledAt: updated.enabledAt,
          disabledAt: updated.disabledAt,
          updatedAt: updated.updatedAt,
          updatedBy: updated.updatedBy,
          metadata: updated.metadata ?? null,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

export default router;
