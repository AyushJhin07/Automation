import { Router } from 'express';

import { authenticateToken, adminOnly } from '../middleware/auth';
import { usageMeteringService } from '../services/UsageMeteringService';
import { getErrorMessage } from '../types/common';

const router = Router();

router.get('/export', authenticateToken, adminOnly, async (req, res) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const planFilter = typeof req.query.plan === 'string' ? req.query.plan.split(',').map((value) => value.trim()).filter(Boolean) : undefined;
    const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
    const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;

    const report = await usageMeteringService.generateUsageExport({
      format,
      planCodes: planFilter,
      startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : undefined,
      endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined,
    });

    if (format === 'csv' && report.csv) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="usage-export-${report.period.startDate.toISOString().slice(0, 10)}.csv"`);
      return res.send(report.csv);
    }

    return res.json({ success: true, report });
  } catch (error) {
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

router.get('/alerts', authenticateToken, adminOnly, async (req, res) => {
  try {
    const threshold = Number.parseInt(String(req.query.threshold ?? '80'), 10);
    const alerts = await usageMeteringService.listUsageAlerts(Number.isFinite(threshold) ? threshold : 80);
    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
