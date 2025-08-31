// PURE AI-DRIVEN WORKFLOW GENERATOR
// NO PRESETS, NO TEMPLATES - ONLY AI INTELLIGENCE

import { WorkflowGraph, WorkflowNode, WorkflowEdge } from './types';

export async function generatePureAIWorkflow(prompt: string, answers: Record<string, string>): Promise<WorkflowGraph> {
  console.log('🤖 PURE AI GENERATION - No presets, templates, or hardcoded patterns');
  
  // Construct intelligent AI prompt that analyzes user intent
  const aiAnalysisPrompt = `
TASK: Analyze this automation request and create a workflow JSON.

USER REQUEST: "${prompt}"
USER ANSWERS: ${JSON.stringify(answers, null, 2)}

AVAILABLE APPS: gmail, sheets, drive, calendar, forms, slack, salesforce, hubspot, mailchimp, shopify, stripe, jenkins, docker-hub, kubernetes, terraform-cloud, azure-devops, ansible, prometheus, grafana, and 140+ other business applications.

INSTRUCTIONS:
1. Analyze what the user ACTUALLY wants (ignore my predefined categories)
2. Choose apps based on user's SPECIFIC needs and mentions
3. Create operations that solve their EXACT problem
4. Use their actual parameters from answers
5. Be creative - don't follow templates

RESPOND WITH VALID JSON:
{
  "analysis": "Your reasoning about what the user wants",
  "selectedApps": ["app1", "app2"],
  "workflow": {
    "id": "wf-generated",
    "name": "Descriptive name based on user request",
    "nodes": [
      {
        "id": "trigger-1",
        "type": "trigger", 
        "app": "chosen_based_on_user_needs",
        "name": "User-friendly name",
        "op": "app.operation_that_solves_user_problem",
        "params": {"key": "value_from_user_answers"}
      }
    ],
    "edges": [
      {"id": "edge-1", "source": "trigger-1", "target": "action-1"}
    ],
    "meta": {
      "automationType": "ai_generated",
      "userIntent": "What the user actually wants to accomplish"
    }
  }
}`;

  try {
    // Use LLM to analyze and generate workflow
    const { MultiAIService } = await import('../aiModels');
    
    console.log('🧠 Asking AI to analyze user intent...');
    const aiResponse = await MultiAIService.generateText(aiAnalysisPrompt, {
      model: 'gemini-1.5-flash',
      maxTokens: 2000,
      temperature: 0.4
    });
    
    console.log('🤖 AI Analysis Response:', aiResponse);
    
    // Parse AI response
    const aiResult = JSON.parse(aiResponse);
    console.log('🎯 AI Analysis:', aiResult.analysis);
    console.log('🏢 AI Selected Apps:', aiResult.selectedApps);
    
    // Return AI-generated workflow
    const workflow = aiResult.workflow;
    workflow.id = `ai-${Date.now()}`;
    
    return workflow;
    
  } catch (error) {
    console.error('❌ Pure AI generation failed:', error);
    
    // Ultra-simple fallback that just uses user's exact words
    return generateFromUserWordsOnly(prompt, answers);
  }
}

function generateFromUserWordsOnly(prompt: string, answers: Record<string, string>): WorkflowGraph {
  console.log('📝 Generating workflow from user words only (no AI, no presets)');
  
  // Just parse what the user literally said
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  
  // Find trigger from user's words
  const triggerText = answers.trigger || prompt;
  if (triggerText.toLowerCase().includes('email')) {
    nodes.push({
      id: 'trigger-1',
      type: 'trigger',
      app: 'gmail',
      name: 'Email Trigger',
      op: 'gmail.email_received',
      params: {
        query: answers.filter_criteria ? buildQueryFromCriteria(answers.filter_criteria) : 'is:unread'
      }
    });
  }
  
  // Find actions from user's words
  let actionCount = 0;
  Object.entries(answers).forEach(([key, value]) => {
    if (key.includes('response') || value.toLowerCase().includes('reply')) {
      actionCount++;
      nodes.push({
        id: `action-${actionCount}`,
        type: 'action',
        app: 'gmail',
        name: 'Send Reply',
        op: 'gmail.send_reply',
        params: { responseTemplate: value }
      });
      
      edges.push({
        id: `edge-${actionCount}`,
        source: actionCount === 1 ? 'trigger-1' : `action-${actionCount - 1}`,
        target: `action-${actionCount}`
      });
    }
    
    if (key.includes('sheet') || value.toLowerCase().includes('log')) {
      actionCount++;
      nodes.push({
        id: `action-${actionCount}`,
        type: 'action',
        app: 'sheets',
        name: 'Log Data',
        op: 'sheets.append_row',
        params: {
          spreadsheetId: extractSheetId(value),
          columns: answers.sheet_columns || 'Default'
        }
      });
      
      edges.push({
        id: `edge-${actionCount}`,
        source: actionCount === 1 ? 'trigger-1' : `action-${actionCount - 1}`,
        target: `action-${actionCount}`
      });
    }
  });
  
  return {
    id: `user-${Date.now()}`,
    name: `User Request: ${prompt.substring(0, 30)}...`,
    nodes,
    edges,
    meta: {
      automationType: 'user_driven',
      description: 'Generated directly from user words without presets',
      userPrompt: prompt
    }
  };
}

function buildQueryFromCriteria(criteria: string): string {
  // Extract exact words user mentioned
  const match = criteria.match(/(?:include|contain|words?)[:\s]*([^.]+)/i);
  if (match && match[1]) {
    const words = match[1].split(/[,\s]+/).filter(w => w.trim().length > 1);
    return `is:unread subject:(${words.map(w => `"${w.trim()}"`).join(' OR ')})`;
  }
  return 'is:unread';
}

function extractSheetId(text: string): string {
  const match = text.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}