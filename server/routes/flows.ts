/**
 * ChatGPT Fix: Flow Storage API for AI Builder → Graph Editor Flow
 * 
 * Simple in-memory flow storage to persist generated workflows
 * for seamless handoff between AI Builder and Graph Editor.
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';

const router = Router();

// ChatGPT Fix: In-memory flow storage
const flows = new Map(); // Temp in-memory store

// Save generated flow
router.post('/save', (req, res) => {
  try {
    const flow = req.body;
    const flowId = randomUUID();
    flows.set(flowId, flow);
    
    console.log(`💾 Flow saved with ID: ${flowId}`);
    
    res.json({ 
      success: true,
      flowId 
    });
  } catch (error) {
    console.error('❌ Failed to save flow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save flow'
    });
  }
});

// Retrieve flow by ID
router.get('/:id', (req, res) => {
  try {
    const flow = flows.get(req.params.id);
    
    if (!flow) {
      return res.status(404).json({ 
        success: false,
        error: 'Flow not found' 
      });
    }
    
    console.log(`📋 Flow retrieved: ${req.params.id}`);
    
    res.json(flow);
  } catch (error) {
    console.error('❌ Failed to retrieve flow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve flow'
    });
  }
});

// List all flows (for debugging)
router.get('/', (req, res) => {
  try {
    const flowList = Array.from(flows.entries()).map(([id, flow]) => ({
      id,
      name: flow.workflow?.name || flow.graph?.name || 'Unnamed Workflow',
      createdAt: flow.metadata?.generatedAt || new Date().toISOString(),
      nodeCount: flow.graph?.nodes?.length || 0
    }));
    
    res.json({
      success: true,
      flows: flowList,
      total: flows.size
    });
  } catch (error) {
    console.error('❌ Failed to list flows:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list flows'
    });
  }
});

// Delete flow
router.delete('/:id', (req, res) => {
  try {
    const deleted = flows.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found'
      });
    }
    
    console.log(`🗑️ Flow deleted: ${req.params.id}`);
    
    res.json({
      success: true,
      message: 'Flow deleted successfully'
    });
  } catch (error) {
    console.error('❌ Failed to delete flow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete flow'
    });
  }
});

export default router;