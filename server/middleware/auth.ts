import { Request, Response, NextFunction } from 'express';
import { getPermissionsForRole, Permission } from '../../configs/rbac';
import { authService, AuthOrganization } from '../services/AuthService';
import {
  OrganizationPlan,
  OrganizationStatus,
  OrganizationLimits,
  OrganizationUsageMetrics,
} from '../database/schema';
import { setRequestUser } from '../utils/ExecutionContext';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string;
        role: string;
        planType: string;
        isActive: boolean;
        emailVerified: boolean;
        monthlyApiCalls: number;
        monthlyTokensUsed: number;
        quotaApiCalls: number;
        quotaTokens: number;
        createdAt: Date;
        organizationId?: string;
        organizationRole?: string;
        organizationPlan?: OrganizationPlan;
        organizationStatus?: OrganizationStatus;
        organizationLimits?: OrganizationLimits;
        organizationUsage?: OrganizationUsageMetrics;
        activeOrganization?: AuthOrganization;
        organizations?: AuthOrganization[];
        permissions?: Permission[];
      };
      organizationId?: string;
      organizationRole?: string;
      organizationPlan?: OrganizationPlan;
      organizationStatus?: OrganizationStatus;
      organizationLimits?: OrganizationLimits;
      organizationUsage?: OrganizationUsageMetrics;
      permissions?: Permission[];
    }
  }
}

const buildDevUser = () => {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const userId = process.env.DEV_AUTO_USER_ID || 'dev-user';

  return {
    id: userId,
    email: process.env.DEV_AUTO_USER_EMAIL || 'developer@local.test',
    name: process.env.DEV_AUTO_USER_NAME || 'Local Developer',
    role: process.env.DEV_AUTO_USER_ROLE || 'developer',
    planType: process.env.DEV_AUTO_USER_PLAN || 'pro',
    isActive: true,
    emailVerified: true,
    monthlyApiCalls: 0,
    monthlyTokensUsed: 0,
    quotaApiCalls: 100000,
    quotaTokens: 1000000,
    createdAt: new Date(),
    organizationId: 'dev-org',
    organizationRole: 'owner',
    organizationPlan: 'enterprise',
    organizationStatus: 'active',
    organizationLimits: {
      maxWorkflows: 1000,
      maxExecutions: 1000000,
      maxUsers: 1000,
      maxStorage: 500 * 1024,
    },
    organizationUsage: {
      apiCalls: 0,
      workflowExecutions: 0,
      storageUsed: 0,
      usersActive: 1,
    },
    activeOrganization: {
      id: 'dev-org',
      name: 'Developer Workspace',
      domain: null,
      plan: 'enterprise',
      status: 'active',
      role: 'owner',
      isDefault: true,
      limits: {
        maxWorkflows: 1000,
        maxExecutions: 1000000,
        maxUsers: 1000,
        maxStorage: 500 * 1024,
      },
      usage: {
        apiCalls: 0,
        workflowExecutions: 0,
        storageUsed: 0,
        usersActive: 1,
      },
    },
    organizations: [],
    permissions: getPermissionsForRole('owner'),
  };
};

const devUser = buildDevUser();

const shouldUseDevFallback = () => process.env.NODE_ENV === 'development' && Boolean(devUser);

const DEFAULT_DEV_ORGANIZATION_ID = devUser?.organizationId ?? 'dev-org';
const DEFAULT_DEV_ORGANIZATION_ROLE = devUser?.organizationRole ?? 'owner';
const DEFAULT_DEV_ORGANIZATION_PLAN: OrganizationPlan =
  (devUser?.organizationPlan as OrganizationPlan | undefined) ?? 'enterprise';
const DEFAULT_DEV_ORGANIZATION_STATUS: OrganizationStatus =
  (devUser?.organizationStatus as OrganizationStatus | undefined) ?? 'active';
const DEFAULT_DEV_ORGANIZATION_LIMITS: OrganizationLimits =
  devUser?.organizationLimits ?? {
    maxWorkflows: 1000,
    maxExecutions: 1000000,
    maxUsers: 1000,
    maxStorage: 500 * 1024,
    maxConcurrentExecutions: 100,
    maxExecutionsPerMinute: 10000,
  };
const DEFAULT_DEV_ORGANIZATION_USAGE: OrganizationUsageMetrics =
  devUser?.organizationUsage ?? {
    workflowExecutions: 0,
    apiCalls: 0,
    storageUsed: 0,
    usersActive: 1,
    llmTokens: 0,
    llmCostUSD: 0,
    concurrentExecutions: 0,
    executionsInCurrentWindow: 0,
  };

const applyDevelopmentOrganizationDefaults = (req: Request) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const activeOrganization = req.user?.activeOrganization;

  const resolvedOrganizationId =
    req.organizationId ||
    req.user?.organizationId ||
    activeOrganization?.id ||
    DEFAULT_DEV_ORGANIZATION_ID;

  const resolvedRole =
    req.organizationRole ||
    req.user?.organizationRole ||
    activeOrganization?.role ||
    DEFAULT_DEV_ORGANIZATION_ROLE;

  const resolvedPlan: OrganizationPlan =
    req.organizationPlan ||
    (req.user?.organizationPlan as OrganizationPlan | undefined) ||
    (activeOrganization?.plan as OrganizationPlan | undefined) ||
    DEFAULT_DEV_ORGANIZATION_PLAN;

  const resolvedStatus: OrganizationStatus =
    req.organizationStatus ||
    (req.user?.organizationStatus as OrganizationStatus | undefined) ||
    (activeOrganization?.status as OrganizationStatus | undefined) ||
    DEFAULT_DEV_ORGANIZATION_STATUS;

  const resolvedLimits: OrganizationLimits =
    req.organizationLimits ||
    req.user?.organizationLimits ||
    activeOrganization?.limits ||
    DEFAULT_DEV_ORGANIZATION_LIMITS;

  const resolvedUsage: OrganizationUsageMetrics =
    req.organizationUsage ||
    req.user?.organizationUsage ||
    activeOrganization?.usage ||
    DEFAULT_DEV_ORGANIZATION_USAGE;

  req.organizationId = resolvedOrganizationId;
  req.organizationRole = resolvedRole;
  req.organizationPlan = resolvedPlan;
  req.organizationStatus = resolvedStatus || 'active';
  req.organizationLimits = resolvedLimits;
  req.organizationUsage = resolvedUsage;

  const resolvedPermissions =
    (req.permissions && req.permissions.length > 0)
      ? req.permissions
      : (req.user?.permissions && req.user.permissions.length > 0)
        ? req.user.permissions
        : getPermissionsForRole(resolvedRole || DEFAULT_DEV_ORGANIZATION_ROLE);
  req.permissions = resolvedPermissions;

  if (req.user) {
    req.user = {
      ...req.user,
      organizationId: req.user.organizationId ?? resolvedOrganizationId,
      organizationRole: req.user.organizationRole ?? resolvedRole,
      organizationPlan: req.user.organizationPlan ?? resolvedPlan,
      organizationStatus: req.user.organizationStatus ?? resolvedStatus,
      organizationLimits: req.user.organizationLimits ?? resolvedLimits,
      organizationUsage: req.user.organizationUsage ?? resolvedUsage,
      permissions: req.user.permissions ?? resolvedPermissions,
    };
  }
};

/**
 * Authentication middleware - verifies JWT token
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const requestedOrgHeader = req.headers['x-organization-id'];
    const requestedOrganizationId = Array.isArray(requestedOrgHeader)
      ? requestedOrgHeader[0]
      : requestedOrgHeader;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : undefined;

    if (!token || token === 'null' || token === 'undefined') {
      if (shouldUseDevFallback() && devUser) {
        const permissions = getPermissionsForRole(devUser.organizationRole);
        req.user = { ...devUser, permissions };
        req.organizationId = devUser.organizationId;
        req.organizationRole = devUser.organizationRole;
        req.organizationPlan = devUser.organizationPlan as OrganizationPlan;
        req.organizationStatus = devUser.organizationStatus as OrganizationStatus;
        req.organizationLimits = devUser.organizationLimits;
        req.organizationUsage = devUser.organizationUsage;
        req.permissions = permissions;
        setRequestUser(devUser.id);
        applyDevelopmentOrganizationDefaults(req);
        return next();
      }
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token and get user
    const user = await authService.verifyToken(token, requestedOrganizationId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Add user to request
    const permissions = getPermissionsForRole(user.organizationRole);
    req.user = { ...user, permissions };
    req.organizationId = user.organizationId;
    req.organizationRole = user.organizationRole;
    req.organizationPlan = user.organizationPlan;
    req.organizationStatus = user.organizationStatus;
    req.organizationLimits = user.organizationLimits;
    req.organizationUsage = user.organizationUsage;
    req.permissions = permissions;
    setRequestUser(user.id);
    applyDevelopmentOrganizationDefaults(req);
    next();

  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const requestedOrgHeader = req.headers['x-organization-id'];
    const requestedOrganizationId = Array.isArray(requestedOrgHeader)
      ? requestedOrgHeader[0]
      : requestedOrgHeader;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : undefined;

    if (token && token !== 'null' && token !== 'undefined') {
      const user = await authService.verifyToken(token, requestedOrganizationId);
      if (user) {
        const permissions = getPermissionsForRole(user.organizationRole);
        req.user = { ...user, permissions };
        req.organizationId = user.organizationId;
        req.organizationRole = user.organizationRole;
        req.organizationPlan = user.organizationPlan;
        req.organizationStatus = user.organizationStatus;
        req.organizationLimits = user.organizationLimits;
        req.organizationUsage = user.organizationUsage;
        req.permissions = permissions;
        setRequestUser(user.id);
      } else if (shouldUseDevFallback() && devUser) {
        const permissions = getPermissionsForRole(devUser.organizationRole);
        req.user = { ...devUser, permissions };
        req.organizationId = devUser.organizationId;
        req.organizationRole = devUser.organizationRole;
        req.organizationPlan = devUser.organizationPlan as OrganizationPlan;
        req.organizationStatus = devUser.organizationStatus as OrganizationStatus;
        req.organizationLimits = devUser.organizationLimits;
        req.organizationUsage = devUser.organizationUsage;
        req.permissions = permissions;
        setRequestUser(devUser.id);
      }
    } else if (shouldUseDevFallback() && devUser) {
      const permissions = getPermissionsForRole(devUser.organizationRole);
      req.user = { ...devUser, permissions };
      req.organizationId = devUser.organizationId;
      req.organizationRole = devUser.organizationRole;
      req.organizationPlan = devUser.organizationPlan as OrganizationPlan;
      req.organizationStatus = devUser.organizationStatus as OrganizationStatus;
      req.organizationLimits = devUser.organizationLimits;
      req.organizationUsage = devUser.organizationUsage;
      req.permissions = permissions;
      setRequestUser(devUser.id);
    }

    applyDevelopmentOrganizationDefaults(req);
    next();
  } catch (error) {
    if (shouldUseDevFallback() && devUser) {
      const permissions = getPermissionsForRole(devUser.organizationRole);
      req.user = { ...devUser, permissions };
      req.organizationId = devUser.organizationId;
      req.organizationRole = devUser.organizationRole;
      req.organizationPlan = devUser.organizationPlan as OrganizationPlan;
      req.organizationStatus = devUser.organizationStatus as OrganizationStatus;
      req.organizationLimits = devUser.organizationLimits;
      req.organizationUsage = devUser.organizationUsage;
      req.permissions = permissions;
      setRequestUser(devUser.id);
      applyDevelopmentOrganizationDefaults(req);
      next();
    } else {
      next();
    }
  }
};

export const requireOrganizationContext = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const activeOrganizationId = req.user.organizationId || req.user.activeOrganization?.id;
    const requestOrganizationId = req.organizationId || activeOrganizationId;

    if (!requestOrganizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization context required'
      });
    }

    if (req.user.organizations && req.user.organizations.length > 0) {
      const matchedOrg = req.user.organizations.find((org) => org.id === requestOrganizationId);
      if (!matchedOrg) {
        return res.status(403).json({
          success: false,
          error: 'Organization access denied'
        });
      }

      req.organizationRole = matchedOrg.role;
      req.organizationPlan = matchedOrg.plan as OrganizationPlan;
      req.organizationStatus = matchedOrg.status as OrganizationStatus;
      req.organizationLimits = matchedOrg.limits;
      req.organizationUsage = matchedOrg.usage;
    }

    req.organizationId = requestOrganizationId;
    if (!req.permissions || req.permissions.length === 0) {
      req.permissions = req.user.permissions ?? getPermissionsForRole(req.organizationRole || req.user.organizationRole);
    }

    next();
  };
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * Plan-based authorization middleware
 */
export const requirePlan = (plans: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!plans.includes(req.user.planType)) {
      return res.status(403).json({
        success: false,
        error: 'Upgrade required for this feature',
        requiredPlan: plans,
        currentPlan: req.user.planType
      });
    }

    next();
  };
};

export const requirePermission = (required: Permission | Permission[]) => {
  const requiredPermissions = Array.isArray(required) ? required : [required];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const permissions = req.permissions || req.user.permissions || [];
    const hasAllPermissions = requiredPermissions.every((permission) => permissions.includes(permission));

    if (!hasAllPermissions) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: requiredPermissions,
        role: req.organizationRole || req.user.organizationRole || null,
      });
    }

    next();
  };
};

/**
 * Quota checking middleware
 */
export const checkQuota = (apiCalls: number = 1, tokens: number = 0) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip quota check for unauthenticated users in development
    if (!req.user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ Skipping quota check for unauthenticated dev user');
        return next();
      }
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    try {
      const quotaCheck = await authService.checkQuota(req.user.id, apiCalls, tokens, req.organizationId);
      
      if (!quotaCheck.hasQuota) {
        return res.status(429).json({
          success: false,
          error: 'Quota exceeded',
          quotaType: quotaCheck.quotaExceeded,
          usage: {
            apiCalls: req.user.monthlyApiCalls,
            tokens: req.user.monthlyTokensUsed,
            quotaApiCalls: req.user.quotaApiCalls,
            quotaTokens: req.user.quotaTokens
          }
        });
      }

      next();
    } catch (error) {
      console.error('❌ Quota check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Quota check failed'
      });
    }
  };
};

/**
 * Rate limiting middleware (basic implementation)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export const rateLimit = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    
    const userLimit = rateLimitStore.get(key);
    
    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new limit
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }
    
    if (userLimit.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }
    
    userLimit.count++;
    next();
  };
};

/**
 * Admin only middleware
 */
export const adminOnly = requireRole(['admin']);

/**
 * Pro plan or higher middleware
 */
export const proOrHigher = requirePlan(['pro', 'enterprise']);

/**
 * Enterprise plan only middleware
 */
export const enterpriseOnly = requirePlan(['enterprise']);
