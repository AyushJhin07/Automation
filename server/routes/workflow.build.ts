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
    console.log('🚀 /api/workflow/build called!');
    const { prompt = '', answers = {} } = req.body || {};
    console.log('📝 Prompt:', prompt);
    console.log('📋 Answers:', answers);
    
    const graph = answersToGraph(prompt, answers);
    console.log('📊 Generated graph:', JSON.stringify(graph, null, 2));
    
    const compiled = compileToAppsScript(graph);
    res.json({ success: true, ...compiled });
  } catch (e: any) {
    console.error('❌ Build error:', e);
    res.status(500).json({ success: false, error: e?.message || 'build_failed' });
  }
});