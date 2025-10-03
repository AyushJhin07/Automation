import { Router } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { organizationService } from '../services/OrganizationService';
import { getErrorMessage } from '../types/common';
import { OrgRole } from '../../configs/rbac';

const router = Router();
const MANAGE_ROLE_PERMISSION = 'organization:manage_roles' as const;
const ASSIGNABLE_ROLES: OrgRole[] = ['owner', 'admin', 'member', 'viewer'];

router.get(
  '/:organizationId/roles',
  authenticateToken,
  requirePermission(MANAGE_ROLE_PERMISSION),
  async (req, res) => {
    try {
      const organizationId = req.params.organizationId;

      if (!req.organizationId || req.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      const roles = await organizationService.listRoleAssignments(organizationId);

      return res.json({
        success: true,
        organizationId,
        roles,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

router.post(
  '/:organizationId/roles',
  authenticateToken,
  requirePermission(MANAGE_ROLE_PERMISSION),
  async (req, res) => {
    try {
      const organizationId = req.params.organizationId;
      const { userId, role } = req.body ?? {};

      if (!req.organizationId || req.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      if (typeof userId !== 'string' || userId.length === 0) {
        return res.status(400).json({ success: false, error: 'userId is required' });
      }

      if (typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role as OrgRole)) {
        return res.status(400).json({ success: false, error: 'Invalid role' });
      }

      const assignment = await organizationService.updateMemberRole({
        organizationId,
        memberId: userId,
        role: role as OrgRole,
        requestedBy: req.user!.id,
      });

      return res.status(200).json({
        success: true,
        role: assignment,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

router.delete(
  '/:organizationId/roles/:userId',
  authenticateToken,
  requirePermission(MANAGE_ROLE_PERMISSION),
  async (req, res) => {
    try {
      const { organizationId, userId } = req.params;
      const fallbackRoleRaw = typeof req.query.fallbackRole === 'string' ? req.query.fallbackRole : undefined;
      const fallbackRole = fallbackRoleRaw && ASSIGNABLE_ROLES.includes(fallbackRoleRaw as OrgRole)
        ? (fallbackRoleRaw as OrgRole)
        : undefined;

      if (!req.organizationId || req.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: 'Active organization mismatch',
        });
      }

      const removed = await organizationService.removeRoleAssignment({
        organizationId,
        memberId: userId,
        requestedBy: req.user!.id,
        fallbackRole,
      });

      return res.json({
        success: removed,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

export default router;
