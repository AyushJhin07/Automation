import { Router } from 'express';

import { getRuntimeCapabilities } from '../runtime/registry.js';

const router = Router();

router.get('/api/registry/capabilities', (_req, res) => {
  res.json({
    success: true,
    capabilities: getRuntimeCapabilities(),
  });
});

export default router;
