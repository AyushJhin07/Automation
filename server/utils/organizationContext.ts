import type { Request, Response } from 'express';

export interface ResolvedOrganizationContext {
  organizationId: string | null;
  organizationStatus: string | null;
  injectedFallback: boolean;
}

const DEFAULT_DEV_ORGANIZATION_ID = 'dev-org';

/**
 * Resolves the active organization context for a request.
 *
 * In development environments (NODE_ENV !== 'production'), a default organization is
 * returned when none is attached to the request so that local workflows can execute
 * without explicit authentication.
 */
export const resolveOrganizationContext = (
  req: Request,
  res: Response,
): ResolvedOrganizationContext => {
  const requestWithOrg = req as Partial<Request> & {
    organizationId?: string;
    organizationStatus?: string;
  };

  const existingOrganizationId = requestWithOrg.organizationId ?? null;
  const existingOrganizationStatus = requestWithOrg.organizationStatus ?? null;

  if (!existingOrganizationId) {
    if (process.env.NODE_ENV !== 'production') {
      return {
        organizationId: DEFAULT_DEV_ORGANIZATION_ID,
        organizationStatus: 'active',
        injectedFallback: true,
      };
    }

    res.status(403).json({ success: false, error: 'Organization context is required' });
    return {
      organizationId: null,
      organizationStatus: null,
      injectedFallback: false,
    };
  }

  if (existingOrganizationStatus && existingOrganizationStatus !== 'active') {
    if (process.env.NODE_ENV !== 'production') {
      return {
        organizationId: existingOrganizationId ?? DEFAULT_DEV_ORGANIZATION_ID,
        organizationStatus: 'active',
        injectedFallback: true,
      };
    }

    res.status(403).json({ success: false, error: 'Organization is not active' });
    return {
      organizationId: null,
      organizationStatus: existingOrganizationStatus,
      injectedFallback: false,
    };
  }

  return {
    organizationId: existingOrganizationId,
    organizationStatus: existingOrganizationStatus,
    injectedFallback: false,
  };
};

export const applyResolvedOrganizationToRequest = (
  req: Request,
  context: ResolvedOrganizationContext,
): void => {
  if (!context.injectedFallback || !context.organizationId) {
    return;
  }

  const requestWithOrg = req as Partial<Request> & {
    organizationId?: string;
    organizationStatus?: string;
  };

  requestWithOrg.organizationId = context.organizationId;
  requestWithOrg.organizationStatus = context.organizationStatus ?? 'active';
};

