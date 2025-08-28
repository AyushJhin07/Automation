import { Router } from 'express';
import { answersToGraph } from '../workflow/answers-to-graph';
import { compileToAppsScript } from '../workflow/compile-to-appsscript';

export const workflowBuildRouter = Router();

/**
 * POST /api/workflow/build
 * body: { prompt: string, answers: object }
 * returns: CompileResult { files, graph, stats, workflowId }
 */
workflowBuildRouter.post('/build', async (req, res) => {
  try {
    const { prompt = '', answers = {} } = req.body || {};
    const graph = answersToGraph(prompt, answers);
    const compiled = compileToAppsScript(graph);
    res.json({ success: true, ...compiled });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'build_failed' });
  }
});