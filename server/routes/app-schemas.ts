/**
 * P1-6: API routes for app parameter schemas
 */

import { Router } from 'express';
import { APP_PARAMETER_SCHEMAS, getParameterSchema, validateParameters } from '../schemas/app-parameter-schemas.js';

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
    const schema = APP_PARAMETER_SCHEMAS[app];
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        error: `Schema not found for app: ${app}`
      });
    }

    res.json({
      success: true,
      app,
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
    const schema = getParameterSchema(app, operation);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        error: `Schema not found for ${app}:${operation}`
      });
    }

    res.json({
      success: true,
      app,
      operation,
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
    const { parameters } = req.body;

    if (!parameters || typeof parameters !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Parameters object is required'
      });
    }

    const validation = validateParameters(app, operation, parameters);

    res.json({
      success: true,
      app,
      operation,
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

export default router;