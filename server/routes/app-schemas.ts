/**
 * P1-6: API routes for app parameter schemas
 */

import { Router } from 'express';
import { resolveAppSchemaKey, resolveSchemaOperationKey } from '@shared/appSchemaAlias';
import { APP_PARAMETER_SCHEMAS, getParameterSchema, validateParameters } from '../schemas/app-parameter-schemas.js';
import { authenticateToken } from '../middleware/auth';
import { connectionService } from '../services/ConnectionService';
import { connectorRegistry } from '../ConnectorRegistry';
import { getErrorMessage } from '../types/common';

const router = Router();

// Get all app schemas
router.get('/schemas', (req, res) => {
  try {
    res.json({
      success: true,
      schemas: APP_PARAMETER_SCHEMAS,
      totalApps: Object.keys(APP_PARAMETER_SCHEMAS).length
    });
  } catch (error) {
    console.error('Error fetching app schemas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app schemas'
    });
  }
});

// Get schema for a specific app
router.get('/schemas/:app', (req, res) => {
  try {
    const { app } = req.params;
    const resolvedApp = resolveAppSchemaKey(app) ?? app;
    const schema = APP_PARAMETER_SCHEMAS[resolvedApp];

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: `Schema not found for app: ${app}`
      });
    }

    res.json({
      success: true,
      app: resolvedApp,
      requestedApp: app,
      schema,
      operations: Object.keys(schema)
    });
  } catch (error) {
    console.error('Error fetching app schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app schema'
    });
  }
});

// Get schema for a specific app operation
router.get('/schemas/:app/:operation', (req, res) => {
  try {
    const { app, operation } = req.params;
    const resolvedApp = resolveAppSchemaKey(app) ?? app;
    const resolvedOperation = resolveSchemaOperationKey(operation);
    const schema = getParameterSchema(resolvedApp, resolvedOperation);

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: `Schema not found for ${app}:${operation}`
      });
    }

    res.json({
      success: true,
      app: resolvedApp,
      requestedApp: app,
      operation: resolvedOperation,
      requestedOperation: operation,
      parameters: schema
    });
  } catch (error) {
    console.error('Error fetching operation schema:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch operation schema'
    });
  }
});

// Validate parameters against schema
router.post('/schemas/:app/:operation/validate', (req, res) => {
  try {
    const { app, operation } = req.params;
    const resolvedApp = resolveAppSchemaKey(app) ?? app;
    const resolvedOperation = resolveSchemaOperationKey(operation);
    const { parameters } = req.body;

    if (!parameters || typeof parameters !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Parameters object is required'
      });
    }

    const validation = validateParameters(resolvedApp, resolvedOperation, parameters);

    res.json({
      success: true,
      app: resolvedApp,
      requestedApp: app,
      operation: resolvedOperation,
      requestedOperation: operation,
      validation: {
        isValid: validation.isValid,
        errors: validation.errors,
        errorCount: validation.errors.length
      }
    });
  } catch (error) {
    console.error('Error validating parameters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate parameters'
    });
  }
});

// Get available apps with schema support
router.get('/supported-apps', (req, res) => {
  try {
    const supportedApps = Object.keys(APP_PARAMETER_SCHEMAS).map(app => ({
      app,
      operations: Object.keys(APP_PARAMETER_SCHEMAS[app]),
      operationCount: Object.keys(APP_PARAMETER_SCHEMAS[app]).length
    }));

    res.json({
      success: true,
      supportedApps,
      totalApps: supportedApps.length,
      totalOperations: supportedApps.reduce((sum, app) => sum + app.operationCount, 0)
    });
  } catch (error) {
    console.error('Error fetching supported apps:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supported apps'
    });
  }
});

router.post(
  '/schemas/:app/:operation/options/:parameter',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = (req as any)?.user?.id;
      const organizationId = (req as any)?.organizationId;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      }

      if (!organizationId) {
        return res.status(400).json({ success: false, error: 'ORGANIZATION_REQUIRED' });
      }

      const { app, operation, parameter } = req.params;
      const resolvedApp = resolveAppSchemaKey(app) ?? app;
      const resolvedOperation = resolveSchemaOperationKey(operation);

      const requestedTypeRaw = typeof req.body?.type === 'string' ? String(req.body.type).toLowerCase() : undefined;
      const candidateTypes: Array<'action' | 'trigger'> =
        requestedTypeRaw === 'trigger'
          ? ['trigger']
          : requestedTypeRaw === 'action'
            ? ['action']
            : ['action', 'trigger'];

      let matchedConfig = undefined;
      let resolvedType: 'action' | 'trigger' = 'action';
      for (const type of candidateTypes) {
        const config = connectorRegistry.getDynamicOptionConfig(resolvedApp, type, resolvedOperation, parameter);
        if (config) {
          matchedConfig = config;
          resolvedType = type;
          break;
        }
      }

      if (!matchedConfig) {
        return res.status(404).json({
          success: false,
          error: `Dynamic options not defined for ${resolvedApp}:${resolvedOperation}.${parameter}`,
        });
      }

      const connectionId = typeof req.body?.connectionId === 'string' ? req.body.connectionId.trim() : undefined;
      if (!connectionId) {
        return res.status(400).json({ success: false, error: 'CONNECTION_ID_REQUIRED' });
      }

      const dependenciesInput = req.body?.dependencies;
      const dependencies =
        dependenciesInput && typeof dependenciesInput === 'object' ? { ...dependenciesInput } : {} as Record<string, any>;

      if (matchedConfig.dependsOn?.length) {
        const missingDeps = matchedConfig.dependsOn.filter(key => {
          const value = dependencies[key];
          return value === undefined || value === null || value === '';
        });

        if (missingDeps.length > 0) {
          return res.status(400).json({
            success: false,
            error: `Missing dependent values: ${missingDeps.join(', ')}`,
            missing: missingDeps,
          });
        }
      }

      const search = typeof req.body?.search === 'string' ? req.body.search : undefined;
      const cursor = typeof req.body?.cursor === 'string' ? req.body.cursor : undefined;
      const limitRaw = req.body?.limit;
      const limit = Number.isFinite(limitRaw) ? Number(limitRaw) : undefined;
      const additionalContext = req.body?.context;
      const forceRefresh = Boolean(req.body?.forceRefresh);
      const includeRaw = Boolean(req.body?.includeRaw);

      const handlerContext: DynamicOptionHandlerContext = {
        ...(additionalContext && typeof additionalContext === 'object' ? additionalContext : {}),
        dependencies,
      };

      if (search !== undefined) handlerContext.search = search;
      if (cursor !== undefined) handlerContext.cursor = cursor;
      if (limit !== undefined) handlerContext.limit = limit;

      const result = await connectionService.fetchDynamicOptions({
        connectionId,
        userId,
        organizationId,
        appId: resolvedApp,
        handlerId: matchedConfig.handler,
        operationType: resolvedType,
        operationId: resolvedOperation,
        parameterPath: matchedConfig.parameterPath,
        context: handlerContext,
        cacheTtlMs: matchedConfig.cacheTtlMs,
        forceRefresh,
        additionalConfig: req.body?.additionalConfig,
      });

      const status = result.success ? 200 : 502;

      return res.status(status).json({
        success: result.success,
        cached: result.cached,
        cacheKey: result.cacheKey,
        cacheExpiresAt: result.cacheExpiresAt ?? null,
        options: result.options,
        nextCursor: result.nextCursor ?? null,
        totalCount: result.totalCount ?? null,
        error: result.success ? undefined : result.error,
        raw: includeRaw ? result.raw : undefined,
        metadata: {
          app: resolvedApp,
          requestedApp: app,
          operation: resolvedOperation,
          requestedOperation: operation,
          operationType: resolvedType,
          parameter: matchedConfig.parameterPath,
          requestedParameter: parameter,
          handler: matchedConfig.handler,
          labelField: matchedConfig.labelField,
          valueField: matchedConfig.valueField,
          searchParam: matchedConfig.searchParam,
          dependsOn: matchedConfig.dependsOn ?? [],
          cacheTtlMs: matchedConfig.cacheTtlMs ?? null,
        },
      });
    } catch (error) {
      const statusCode = typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
      console.error('Error fetching dynamic options:', error);
      return res.status(statusCode).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }
);

export default router;