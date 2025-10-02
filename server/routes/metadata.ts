import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { connectionService } from '../services/ConnectionService';
import { connectorMetadataService } from '../services/metadata/ConnectorMetadataService';
import { getErrorMessage } from '../types/common';

const router = Router();

router.post('/resolve', authenticateToken, async (req, res) => {
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

export default router;
