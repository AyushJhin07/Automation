import { Router } from 'express';

import { ConnectorRegistry } from '../ConnectorRegistry';
import { getRuntimeCapabilities } from '../runtime/registry.js';
import { getErrorMessage } from '../types/common';

const router = Router();

router.get('/api/registry/capabilities', (_req, res) => {
  res.json({
    success: true,
    capabilities: getRuntimeCapabilities(),
  });
});

router.get('/api/registry/connectors', async (_req, res) => {
  try {
    const registry = ConnectorRegistry.getInstance();
    await registry.init();

    const connectors = await registry.listConnectors({
      includeExperimental: true,
      includeHidden: true,
      includeDisabled: true,
    });

    const payload = connectors.map((connector: any) => ({
      id: connector.id,
      name: connector.displayName ?? connector.name ?? connector.id,
      description: connector.description ?? '',
      category: connector.category ?? 'General',
      availability: connector.availability ?? 'experimental',
      hasImplementation: connector.hasImplementation === true,
      hasRegisteredClient: connector.hasRegisteredClient === true,
      actions: Array.isArray(connector.actions)
        ? connector.actions.map((action: any) => ({
            id: action.id,
            name: action.name,
            description: action.description,
            params: action.params ?? action.parameters ?? {},
            io: action.io ?? action.ioMetadata ?? action.metadata ?? undefined,
          }))
        : [],
      triggers: Array.isArray(connector.triggers)
        ? connector.triggers.map((trigger: any) => ({
            id: trigger.id,
            name: trigger.name,
            description: trigger.description,
            params: trigger.params ?? trigger.parameters ?? {},
            io: trigger.io ?? trigger.ioMetadata ?? trigger.metadata ?? undefined,
          }))
        : [],
    }));

    res.json({ success: true, connectors: payload });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
