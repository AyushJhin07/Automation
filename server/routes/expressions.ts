import { Router } from 'express';
import { expressionEvaluator, getExpressionTypeHint, SAMPLE_NODE_OUTPUTS } from '../core/ExpressionEvaluator.js';

const router = Router();

const DEFAULT_CONTEXT = Object.freeze({
  currentNodeId: 'preview-node',
  workflowId: 'preview-workflow',
  executionId: 'preview-execution',
});

router.get('/sample-node-outputs', (_req, res) => {
  res.json({
    success: true,
    nodeOutputs: SAMPLE_NODE_OUTPUTS,
  });
});

router.post('/validate', (req, res) => {
  try {
    const { expression, nodeOutputs, vars, currentNodeId } = req.body ?? {};

    if (!expression || typeof expression !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Expression is required',
      });
    }

    const safeNodeOutputs =
      nodeOutputs && typeof nodeOutputs === 'object' ? nodeOutputs : SAMPLE_NODE_OUTPUTS;

    const result = expressionEvaluator.evaluate(expression, {
      nodeOutputs: safeNodeOutputs,
      currentNodeId: typeof currentNodeId === 'string' ? currentNodeId : DEFAULT_CONTEXT.currentNodeId,
      workflowId: DEFAULT_CONTEXT.workflowId,
      executionId: DEFAULT_CONTEXT.executionId,
      userId: undefined,
      vars: vars && typeof vars === 'object' ? vars : undefined,
    });

    return res.json({
      success: true,
      result,
      typeHint: getExpressionTypeHint(result),
      usedSampleData: !(nodeOutputs && typeof nodeOutputs === 'object'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to evaluate expression';
    return res.status(400).json({
      success: false,
      error: message,
    });
  }
});

router.post('/type-hint', (req, res) => {
  try {
    const { sampleValue } = req.body ?? {};
    const typeHint = getExpressionTypeHint(sampleValue);
    return res.json({
      success: true,
      typeHint,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to derive type hint';
    return res.status(400).json({
      success: false,
      error: message,
    });
  }
});

export default router;
