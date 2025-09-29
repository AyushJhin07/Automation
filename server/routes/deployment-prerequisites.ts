import type { Express, Request, Response } from 'express';

import { productionDeployer } from '../core/ProductionDeployer';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { getErrorMessage } from '../types/common';

export function registerDeploymentPrerequisiteRoutes(app: Express) {
  const deploymentPrerequisiteAuth = process.env.NODE_ENV === 'development' ? optionalAuth : authenticateToken;

  const deploymentPrerequisiteHandler = async (req: Request, res: Response) => {
    try {
      const result = await productionDeployer.validatePrerequisites();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  app.get('/api/deployment/prerequisites', deploymentPrerequisiteAuth, deploymentPrerequisiteHandler);
  app.get('/api/ai/deployment/prerequisites', deploymentPrerequisiteAuth, deploymentPrerequisiteHandler);
}
