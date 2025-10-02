import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { authService, OrganizationPlan } from '../services/AuthService';
import { getErrorMessage } from '../types/common';
import { securityService } from '../services/SecurityService';
import { db, organizationMembers, organizationInvites } from '../database/schema';

const router = Router();

router.use(authenticateToken);

router.get('/', (req, res) => {
  return res.json({
    success: true,
    organizations: req.organizations ?? [],
    activeOrganizationId: req.organizationId ?? null,
  });
});

router.post(
  '/',
  securityService.validateInput([
    { field: 'name', type: 'string', required: true, maxLength: 255, sanitize: true },
    { field: 'domain', type: 'string', required: false, maxLength: 255, sanitize: true },
    {
      field: 'plan',
      type: 'string',
      required: false,
      allowedValues: ['starter', 'professional', 'enterprise', 'enterprise_plus'],
    },
    { field: 'makeDefault', type: 'boolean', required: false },
  ]),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const plan = (req.body.plan || 'starter') as OrganizationPlan;
      const result = await authService.createOrganization(req.user.id, {
        name: req.body.name,
        domain: req.body.domain,
        plan,
        makeDefault: req.body.makeDefault ?? true,
      });

      req.organizations = result.organizations;
      req.organizationId = result.activeOrganizationId ?? null;
      req.organizationRole = result.activeOrganization?.role;
      req.organizationPermissions = result.activeOrganization?.permissions;
      req.user.activeOrganizationId = result.activeOrganizationId ?? null;
      req.user.organizationRole = result.activeOrganization?.role;
      req.user.organizationPermissions = result.activeOrganization?.permissions;

      return res.json({
        success: true,
        organizations: result.organizations,
        activeOrganizationId: result.activeOrganizationId,
        createdOrganization: result.createdOrganization,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      return res.status(400).json({ success: false, error: message });
    }
  }
);

router.post('/:organizationId/activate', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await authService.setActiveOrganization(req.user.id, token, req.params.organizationId);

    req.organizations = result.organizations;
    req.organizationId = result.activeOrganizationId ?? null;
    req.organizationRole = result.activeOrganization?.role;
    req.organizationPermissions = result.activeOrganization?.permissions;
    req.user.activeOrganizationId = result.activeOrganizationId ?? null;
    req.user.organizationRole = result.activeOrganization?.role;
    req.user.organizationPermissions = result.activeOrganization?.permissions;

    return res.json({
      success: true,
      organizations: result.organizations,
      activeOrganizationId: result.activeOrganizationId,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    return res.status(400).json({ success: false, error: message });
  }
});

router.post(
  '/:organizationId/invite',
  securityService.validateInput([
    { field: 'email', type: 'email', required: true, sanitize: true },
    {
      field: 'role',
      type: 'string',
      required: false,
      allowedValues: ['owner', 'admin', 'member', 'viewer'],
    },
    { field: 'expiresInDays', type: 'number', required: false, min: 1, max: 90 },
  ]),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const membership = (req.organizations || []).find((org) => org.id === req.params.organizationId);
      if (!membership) {
        return res.status(403).json({ success: false, error: 'Not a member of this organization' });
      }
      if (!membership.permissions.canManageUsers) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      const invite = await authService.inviteToOrganization(req.user.id, req.params.organizationId, {
        email: req.body.email,
        role: req.body.role,
        expiresInDays: req.body.expiresInDays,
        metadata: req.body.metadata,
      });

      return res.json({ success: true, invite });
    } catch (error) {
      const message = getErrorMessage(error);
      return res.status(400).json({ success: false, error: message });
    }
  }
);

router.post('/:organizationId/invites/:inviteId/revoke', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const membership = (req.organizations || []).find((org) => org.id === req.params.organizationId);
    if (!membership) {
      return res.status(403).json({ success: false, error: 'Not a member of this organization' });
    }
    if (!membership.permissions.canManageUsers) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    await authService.revokeInvite(req.user.id, req.params.organizationId, req.params.inviteId);
    return res.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error);
    return res.status(400).json({ success: false, error: message });
  }
});

router.delete('/:organizationId/members/:membershipId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const membership = (req.organizations || []).find((org) => org.id === req.params.organizationId);
    if (!membership) {
      return res.status(403).json({ success: false, error: 'Not a member of this organization' });
    }
    if (!membership.permissions.canManageUsers) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    await authService.removeMember(req.user.id, req.params.organizationId, req.params.membershipId);
    const organizations = await authService.listUserOrganizations(req.user.id);
    req.organizations = organizations;
    req.organizationId = organizations.find((org) => org.isDefault)?.id ?? req.organizationId ?? null;
    req.user.activeOrganizationId = req.organizationId ?? null;
    req.organizationRole = organizations.find((org) => org.id === req.organizationId)?.role;
    req.organizationPermissions = organizations.find((org) => org.id === req.organizationId)?.permissions;

    return res.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error);
    return res.status(400).json({ success: false, error: message });
  }
});

router.get('/:organizationId/members', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const membership = (req.organizations || []).find((org) => org.id === req.params.organizationId);
    if (!membership) {
      return res.status(403).json({ success: false, error: 'Not a member of this organization' });
    }

    const members = await db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        email: organizationMembers.email,
        firstName: organizationMembers.firstName,
        lastName: organizationMembers.lastName,
        role: organizationMembers.role,
        status: organizationMembers.status,
        mfaEnabled: organizationMembers.mfaEnabled,
        isDefault: organizationMembers.isDefault,
        lastLoginAt: organizationMembers.lastLoginAt,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, req.params.organizationId));

    return res.json({ success: true, members });
  } catch (error) {
    const message = getErrorMessage(error);
    return res.status(400).json({ success: false, error: message });
  }
});

router.get('/:organizationId/invites', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const membership = (req.organizations || []).find((org) => org.id === req.params.organizationId);
    if (!membership) {
      return res.status(403).json({ success: false, error: 'Not a member of this organization' });
    }

    const invites = await db
      .select({
        id: organizationInvites.id,
        email: organizationInvites.email,
        role: organizationInvites.role,
        status: organizationInvites.status,
        expiresAt: organizationInvites.expiresAt,
        createdAt: organizationInvites.createdAt,
        revokedAt: organizationInvites.revokedAt,
      })
      .from(organizationInvites)
      .where(eq(organizationInvites.organizationId, req.params.organizationId));

    return res.json({ success: true, invites });
  } catch (error) {
    const message = getErrorMessage(error);
    return res.status(400).json({ success: false, error: message });
  }
});

export default router;
