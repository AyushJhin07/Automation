import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/AuthService';

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
      };
    }
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token and get user
    const user = await authService.verifyToken(token);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Add user to request
    req.user = user;
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
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const user = await authService.verifyToken(token);
      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
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

/**
 * Quota checking middleware
 */
export const checkQuota = (apiCalls: number = 1, tokens: number = 0) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    try {
      const quotaCheck = await authService.checkQuota(req.user.id, apiCalls, tokens);
      
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