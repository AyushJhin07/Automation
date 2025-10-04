import { Router } from 'express';
import { authenticateToken, requirePermission, requireOrganizationContext } from '../middleware/auth';
import { connectionService } from '../services/ConnectionService';
import { connectorMetadataService } from '../services/metadata/ConnectorMetadataService';
import { auditLogService } from '../services/AuditLogService';
import { getErrorMessage } from '../types/common';
import { ConnectorRegistry } from '../ConnectorRegistry';

const normalizeLifecycleBadges = (entry: any) => {
  const badges: Array<{ id: string; label: string; tone: 'neutral' | 'success' | 'warning' | 'critical' }> = [];
  const status: string | undefined = typeof entry?.release?.status === 'string' ? entry.release.status : undefined;
  const lifecycleFlags = {
    beta: Boolean(entry?.status?.beta || status === 'beta' || entry?.release?.isBeta),
    alpha: Boolean(entry?.status?.privatePreview || status === 'alpha'),
    deprecated: Boolean(entry?.status?.deprecated || status === 'deprecated'),
    sunset: Boolean(status === 'sunset'),
  };

  if (lifecycleFlags.alpha) {
    badges.push({ id: 'alpha', label: 'Alpha', tone: 'warning' });
  }
  if (lifecycleFlags.beta) {
    badges.push({ id: 'beta', label: 'Beta', tone: 'warning' });
  }
  if (!lifecycleFlags.alpha && !lifecycleFlags.beta && entry?.status?.privatePreview) {
    badges.push({ id: 'preview', label: 'Preview', tone: 'warning' });
  }
  if (lifecycleFlags.deprecated) {
    badges.push({ id: 'deprecated', label: 'Deprecated', tone: 'critical' });
  }
  if (lifecycleFlags.sunset) {
    badges.push({ id: 'sunset', label: 'Sunset', tone: 'critical' });
  }

  if (badges.length === 0) {
    badges.push({ id: 'stable', label: 'Stable', tone: 'success' });
  }

  return {
    status: status ?? (lifecycleFlags.beta ? 'beta' : lifecycleFlags.alpha ? 'alpha' : lifecycleFlags.deprecated ? 'deprecated' : 'stable'),
    badges,
    raw: {
      release: entry?.release ?? null,
      status: entry?.status ?? null,
    },
  };
};

const serializeConnector = (entry: any) => {
  const lifecycle = normalizeLifecycleBadges(entry);
  return {
    id: entry.id,
    name: entry.displayName ?? entry.name ?? entry.id,
    description: entry.description ?? '',
    category: entry.category ?? 'General',
    categories: Array.isArray(entry.labels) ? entry.labels : [],
    icon: entry.icon ?? entry.id,
    color: entry.color ?? null,
    availability: entry.availability ?? 'stable',
    pricingTier: entry.pricingTier ?? 'free',
    lifecycle,
    release: entry.release ?? null,
    status: entry.status ?? null,
    hasImplementation: entry.hasImplementation ?? true,
    actions: Array.isArray(entry.actions)
      ? entry.actions.map((action: any) => ({
          id: action.id,
          name: action.name,
          description: action.description,
          params: action.params ?? action.parameters ?? {},
        }))
      : [],
    triggers: Array.isArray(entry.triggers)
      ? entry.triggers.map((trigger: any) => ({
          id: trigger.id,
          name: trigger.name,
          description: trigger.description,
          params: trigger.params ?? trigger.parameters ?? {},
        }))
      : [],
  };
};

const router = Router();

router.post(
  '/resolve',
  authenticateToken,
  requireOrganizationContext(),
  requirePermission('integration:metadata:read'),
  async (req, res) => {
  const userId = (req as any)?.user?.id;
  const organizationId = (req as any)?.organizationId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
  }

  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
  }

  const { connector, connectionId, credentials: inlineCredentials = {}, params = {}, options = {} } = req.body || {};

  if (!connector || typeof connector !== 'string') {
    return res.status(400).json({ success: false, error: 'MISSING_CONNECTOR' });
  }

  try {
    let credentials: Record<string, any> = { ...inlineCredentials };

    if (connectionId) {
      const connection = await connectionService.getConnection(String(connectionId), userId, organizationId);
      if (!connection) {
        return res.status(404).json({ success: false, error: 'CONNECTION_NOT_FOUND' });
      }
      credentials = { ...connection.credentials, ...credentials };
      auditLogService.record({
        action: 'connection.credentials.access',
        route: `${req.baseUrl}${req.path}`,
        userId,
        organizationId,
        metadata: { connectionId: String(connectionId) },
      });
    }

    const result = await connectorMetadataService.resolve(connector, {
      credentials,
      params,
      options,
    });

    if (!result.success) {
      const status = result.status && result.status >= 100 ? result.status : 502;
      return res.status(status).json({
        success: false,
        error: result.error || 'METADATA_RESOLUTION_FAILED',
        warnings: result.warnings,
      });
    }

    return res.json({
      success: true,
      connector: result.metadata?.derivedFrom?.[0]?.split(':')?.[1] || connector,
      metadata: result.metadata,
      extras: result.extras,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('Metadata resolution failed:', error);
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

router.get(
  '/v1/connectors',
  authenticateToken,
  requirePermission('integration:metadata:read'),
  async (req, res) => {
    try {
      const registry = ConnectorRegistry.getInstance();
      const connectors = await registry.listConnectors({
        includeExperimental: true,
        includeHidden: false,
        organizationId: (req as any)?.organizationId,
      });

      const payload = connectors.map(serializeConnector);
      return res.json({ success: true, data: { connectors: payload } });
    } catch (error) {
      console.error('Failed to list connector metadata:', error);
      return res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  }
);

export default router;
