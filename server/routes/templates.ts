/**
 * P2-1: Workflow Templates API Routes
 */

import { Router } from 'express';
import { 
  ALL_WORKFLOW_TEMPLATES,
  getTemplatesByCategory,
  getTemplatesByIndustry,
  getTemplatesByComplexity,
  searchTemplates,
  getTemplateById
} from '../templates/workflow-templates.js';

const router = Router();

// Get all workflow templates
router.get('/templates', (req, res) => {
  try {
    const { category, industry, complexity, search, limit } = req.query;
    
    let templates = ALL_WORKFLOW_TEMPLATES;
    
    // Apply filters
    if (category) {
      templates = getTemplatesByCategory(category as string);
    }
    
    if (industry) {
      templates = getTemplatesByIndustry(industry as string);
    }
    
    if (complexity) {
      templates = getTemplatesByComplexity(complexity as string);
    }
    
    if (search) {
      templates = searchTemplates(search as string);
    }
    
    // Apply limit
    if (limit) {
      templates = templates.slice(0, parseInt(limit as string));
    }

    // Return summary info (without full graph data for performance)
    const templateSummaries = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      industry: t.industry,
      complexity: t.complexity,
      estimatedSetupTime: t.estimatedSetupTime,
      requiredApps: t.requiredApps,
      optionalApps: t.optionalApps,
      businessValue: t.businessValue,
      roi: t.roi,
      tags: t.tags,
      nodeCount: t.graph.nodes.length,
      edgeCount: t.graph.edges.length,
      configurationSteps: t.configurationSteps.length
    }));

    res.json({
      success: true,
      templates: templateSummaries,
      total: templateSummaries.length,
      filters: {
        categories: [...new Set(ALL_WORKFLOW_TEMPLATES.map(t => t.category))],
        industries: [...new Set(ALL_WORKFLOW_TEMPLATES.flatMap(t => t.industry))],
        complexities: [...new Set(ALL_WORKFLOW_TEMPLATES.map(t => t.complexity))]
      }
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workflow templates'
    });
  }
});

// Get specific template with full graph data
router.get('/templates/:id', (req, res) => {
  try {
    const template = getTemplateById(req.params.id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${req.params.id}`
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template'
    });
  }
});

// Get template categories
router.get('/categories', (req, res) => {
  try {
    const categories = [...new Set(ALL_WORKFLOW_TEMPLATES.map(t => t.category))];
    const categoryStats = categories.map(cat => ({
      category: cat,
      count: ALL_WORKFLOW_TEMPLATES.filter(t => t.category === cat).length,
      templates: ALL_WORKFLOW_TEMPLATES
        .filter(t => t.category === cat)
        .map(t => ({ id: t.id, name: t.name, complexity: t.complexity }))
    }));

    res.json({
      success: true,
      categories: categoryStats,
      totalCategories: categories.length,
      totalTemplates: ALL_WORKFLOW_TEMPLATES.length
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template categories'
    });
  }
});

// Get templates by industry
router.get('/industries/:industry', (req, res) => {
  try {
    const industry = req.params.industry;
    const templates = getTemplatesByIndustry(industry);
    
    const templateSummaries = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      complexity: t.complexity,
      businessValue: t.businessValue,
      roi: t.roi,
      requiredApps: t.requiredApps
    }));

    res.json({
      success: true,
      industry,
      templates: templateSummaries,
      count: templates.length
    });
  } catch (error) {
    console.error('Error fetching industry templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch industry templates'
    });
  }
});

// Clone template to create new workflow
router.post('/templates/:id/clone', (req, res) => {
  try {
    const template = getTemplateById(req.params.id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${req.params.id}`
      });
    }

    // Create a new workflow based on template
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const clonedWorkflow = {
      id: workflowId,
      name: `${template.name} (Copy)`,
      description: template.description,
      graph: {
        ...template.graph,
        metadata: {
          ...template.graph.metadata,
          clonedFrom: template.id,
          clonedAt: new Date().toISOString(),
          workflowId
        }
      },
      requiredApps: template.requiredApps,
      configurationSteps: template.configurationSteps
    };

    res.json({
      success: true,
      workflow: clonedWorkflow,
      originalTemplate: template.id,
      message: `Workflow cloned from template: ${template.name}`
    });
  } catch (error) {
    console.error('Error cloning template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clone template'
    });
  }
});

// Get template statistics
router.get('/stats', (req, res) => {
  try {
    const stats = {
      totalTemplates: ALL_WORKFLOW_TEMPLATES.length,
      byCategory: Object.fromEntries(
        [...new Set(ALL_WORKFLOW_TEMPLATES.map(t => t.category))]
          .map(cat => [cat, ALL_WORKFLOW_TEMPLATES.filter(t => t.category === cat).length])
      ),
      byComplexity: Object.fromEntries(
        [...new Set(ALL_WORKFLOW_TEMPLATES.map(t => t.complexity))]
          .map(comp => [comp, ALL_WORKFLOW_TEMPLATES.filter(t => t.complexity === comp).length])
      ),
      byIndustry: Object.fromEntries(
        [...new Set(ALL_WORKFLOW_TEMPLATES.flatMap(t => t.industry))]
          .map(ind => [ind, ALL_WORKFLOW_TEMPLATES.filter(t => t.industry.includes(ind)).length])
      ),
      totalAppsUsed: [...new Set(ALL_WORKFLOW_TEMPLATES.flatMap(t => [...t.requiredApps, ...t.optionalApps]))].length,
      averageNodesPerTemplate: Math.round(
        ALL_WORKFLOW_TEMPLATES.reduce((sum, t) => sum + t.graph.nodes.length, 0) / ALL_WORKFLOW_TEMPLATES.length
      )
    };

    res.json({
      success: true,
      stats,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching template stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template statistics'
    });
  }
});

export default router;