/**
 * ChatGPT Fix 1: Workflow Read Routes for Graph Editor Handoff
 */

import { Router } from 'express';
import { WorkflowStoreService } from '../workflow/workflow-store.js';

export const workflowReadRouter = Router();

// Get specific workflow for Graph Editor loading
workflowReadRouter.get('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID is required'
      });
    }

    const workflow = WorkflowStoreService.retrieve(id);
    
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: `Workflow not found: ${id}`,
        hint: 'Workflow may have expired or was never created'
      });
    }

    console.log(`📋 Serving workflow ${id} for Graph Editor handoff`);
    
    res.json({
      success: true,
      graph: workflow,
      metadata: {
        retrievedAt: new Date().toISOString(),
        workflowId: id
      }
    });

  } catch (error) {
    console.error('❌ Error retrieving workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflow'
    });
  }
});

// List all stored workflows (for debugging)
workflowReadRouter.get('/workflows', (req, res) => {
  try {
    const stats = WorkflowStoreService.getStats();
    
    res.json({
      success: true,
      stats,
      message: `${stats.totalWorkflows} workflows in store`
    });
  } catch (error) {
    console.error('Error getting workflow stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow statistics'
    });
  }
});

// Clear specific workflow
workflowReadRouter.delete('/workflows/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existed = WorkflowStoreService.clear(id);
    
    res.json({
      success: true,
      cleared: existed,
      message: existed ? `Workflow ${id} cleared` : `Workflow ${id} was not found`
    });
  } catch (error) {
    console.error('Error clearing workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear workflow'
    });
  }
});

export default workflowReadRouter;