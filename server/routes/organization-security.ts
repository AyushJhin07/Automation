import { Router, type Request } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { organizationService } from '../services/OrganizationService';
import { connectionService } from '../services/ConnectionService';
import { getErrorMessage } from '../types/common';

const router = Router();

const MANAGE_SECURITY_PERMISSION = 'organization:manage_security' as const;
const VIEW_SECURITY_AUDIT_PERMISSION = 'organization:view_security_audit' as const;

const ensureOrganizationContext = (req: Request, organizationId: string) => {
  if (!req.organizationId || req.organizationId !== organizationId) {
    return false;
  }
  return true;
};

router.get(
  '/:organizationId/security/allowlist',
  authenticateToken,
  requirePermission(MANAGE_SECURITY_PERMISSION),
  async (req, res) => {
    try {
      const { organizationId } = req.params;

      if (!ensureOrganizationContext(req, organizationId)) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      const security = await organizationService.getSecuritySettings(organizationId);

      return res.json({
        success: true,
        organizationId,
        allowlist: {
          domains: security.allowedDomains,
          ipRanges: security.allowedIpRanges,
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

router.put(
  '/:organizationId/security/allowlist',
  authenticateToken,
  requirePermission(MANAGE_SECURITY_PERMISSION),
  async (req, res) => {
    try {
      const { organizationId } = req.params;
      const { allowedDomains, allowedIpRanges } = req.body ?? {};

      if (!ensureOrganizationContext(req, organizationId)) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      if (
        allowedDomains !== undefined &&
        !Array.isArray(allowedDomains)
      ) {
        return res.status(400).json({ success: false, error: 'allowedDomains must be an array of strings' });
      }

      if (
        allowedIpRanges !== undefined &&
        !Array.isArray(allowedIpRanges)
      ) {
        return res.status(400).json({ success: false, error: 'allowedIpRanges must be an array of strings' });
      }

      const updated = await organizationService.updateNetworkAllowlist(organizationId, {
        allowedDomains,
        allowedIpRanges,
      });

      connectionService.invalidateOrganizationSecurityCache(organizationId);

      return res.json({
        success: true,
        organizationId,
        allowlist: {
          domains: updated.allowedDomains,
          ipRanges: updated.allowedIpRanges,
        },
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

router.get(
  '/:organizationId/security/allowlist/audit',
  authenticateToken,
  requirePermission(VIEW_SECURITY_AUDIT_PERMISSION),
  async (req, res) => {
    try {
      const { organizationId } = req.params;
      const limitRaw = req.query.limit;
      const limit = typeof limitRaw === 'string' ? Number(limitRaw) : undefined;

      if (!ensureOrganizationContext(req, organizationId)) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      const entries = connectionService.getDeniedNetworkAccess(
        organizationId,
        Number.isFinite(limit) && limit !== undefined ? Math.max(Number(limit), 1) : 50
      );

      return res.json({
        success: true,
        organizationId,
        entries,
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
