/**
 * P1-7: AI assist button functionality for parameter suggestions
 */

import { Router } from 'express';
import { MultiAIService } from '../llm/MultiAIService.js';

const router = Router();

// ChatGPT Fix: AI field assist endpoint
router.post('/field-assist', async (req, res) => {
  try {
    const { app, op, field, sampleContext, userText } = req.body;
    
    const prompt = `You are helping a user fill out a field for an automation workflow.
    
App: ${app}
Operation: ${op}
Field: ${field}
Context: ${sampleContext || 'No context provided'}
User's current text: ${userText || 'Empty'}

Provide a helpful value for this field. Respond with JSON only:
{
  "value": "suggested field value",
  "confidence": 0.85,
  "rationale": "Why this value makes sense"
}`;

    const aiResponse = await MultiAIService.generateText({
      model: 'gemini-2.0-flash-exp',
      prompt
    });

    let result;
    try {
      result = JSON.parse(aiResponse);
    } catch (e) {
      // Fallback if not JSON
      result = {
        value: aiResponse.substring(0, 100),
        confidence: 0.5,
        rationale: 'AI suggested this value'
      };
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('AI field assist error:', error);
    res.status(500).json({
      success: false,
      error: 'AI field assist failed'
    });
  }
});

// AI assist for parameter suggestions
router.post('/suggest-parameters', async (req, res) => {
  try {
    const { app, operation, context, userInput } = req.body;

    if (!app || !operation) {
      return res.status(400).json({
        success: false,
        error: 'App and operation are required'
      });
    }

    // Generate AI suggestions based on context
    const prompt = `You are an automation expert helping users configure ${app} ${operation} parameters.

Context: ${JSON.stringify(context || {})}
User input: ${userInput || 'No specific input provided'}

Based on the context and user input, suggest appropriate parameter values for ${app} ${operation}.

Respond with a JSON object containing parameter suggestions:
{
  "suggestions": {
    "parameterName": {
      "value": "suggested value",
      "reasoning": "why this value makes sense"
    }
  },
  "tips": ["helpful tip 1", "helpful tip 2"]
}`;

    const aiResponse = await MultiAIService.generateText({
      model: 'gemini-2.0-flash-exp',
      prompt
    });

    // Try to parse AI response as JSON
    let suggestions;
    try {
      suggestions = JSON.parse(aiResponse);
    } catch {
      // If not valid JSON, provide fallback suggestions
      suggestions = {
        suggestions: {},
        tips: [`AI suggestion: ${aiResponse.substring(0, 200)}...`]
      };
    }

    res.json({
      success: true,
      app,
      operation,
      suggestions: suggestions.suggestions || {},
      tips: suggestions.tips || [],
      aiResponse: aiResponse.substring(0, 500) // Truncated for debugging
    });

  } catch (error) {
    console.error('AI assist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI suggestions'
    });
  }
});

// AI assist for workflow optimization
router.post('/optimize-workflow', async (req, res) => {
  try {
    const { graph, userGoal } = req.body;

    if (!graph || !graph.nodes) {
      return res.status(400).json({
        success: false,
        error: 'Workflow graph is required'
      });
    }

    const prompt = `You are an automation expert. Analyze this workflow and suggest optimizations.

User Goal: ${userGoal || 'Improve workflow efficiency'}

Current Workflow:
${JSON.stringify(graph, null, 2)}

Provide optimization suggestions in JSON format:
{
  "optimizations": [
    {
      "type": "performance|reliability|cost|usability",
      "description": "What to optimize",
      "impact": "high|medium|low",
      "implementation": "How to implement this optimization"
    }
  ],
  "score": {
    "current": 7,
    "potential": 9,
    "reasoning": "Why this score"
  }
}`;

    const aiResponse = await MultiAIService.generateText({
      model: 'gemini-2.0-flash-exp',
      prompt
    });

    let analysis;
    try {
      analysis = JSON.parse(aiResponse);
    } catch {
      analysis = {
        optimizations: [],
        score: { current: 7, potential: 8, reasoning: 'Analysis in progress' },
        rawResponse: aiResponse
      };
    }

    res.json({
      success: true,
      analysis,
      nodeCount: graph.nodes.length,
      edgeCount: (graph.edges || []).length
    });

  } catch (error) {
    console.error('Workflow optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate workflow optimization'
    });
  }
});

// AI assist for error diagnosis
router.post('/diagnose-error', async (req, res) => {
  try {
    const { error, context, nodeInfo } = req.body;

    if (!error) {
      return res.status(400).json({
        success: false,
        error: 'Error information is required'
      });
    }

    const prompt = `You are a technical support expert for automation workflows. Diagnose this error and provide solutions.

Error: ${error.message || error}
Context: ${JSON.stringify(context || {})}
Node Info: ${JSON.stringify(nodeInfo || {})}

Provide a diagnosis in JSON format:
{
  "diagnosis": {
    "category": "authentication|configuration|api|network|data",
    "severity": "critical|high|medium|low",
    "rootCause": "Most likely cause of the error",
    "confidence": 0.8
  },
  "solutions": [
    {
      "title": "Solution title",
      "steps": ["step 1", "step 2"],
      "difficulty": "easy|medium|hard",
      "successProbability": 0.9
    }
  ],
  "prevention": "How to prevent this error in the future"
}`;

    const aiResponse = await MultiAIService.generateText({
      model: 'gemini-2.0-flash-exp',
      prompt
    });

    let diagnosis;
    try {
      diagnosis = JSON.parse(aiResponse);
    } catch {
      diagnosis = {
        diagnosis: {
          category: 'unknown',
          severity: 'medium',
          rootCause: 'Analysis in progress',
          confidence: 0.5
        },
        solutions: [{
          title: 'General troubleshooting',
          steps: ['Check credentials', 'Verify network connection', 'Review configuration'],
          difficulty: 'medium',
          successProbability: 0.7
        }],
        rawResponse: aiResponse
      };
    }

    res.json({
      success: true,
      diagnosis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error diagnosis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to diagnose error'
    });
  }
});

// AI assist for natural language to parameters
router.post('/parse-natural-language', async (req, res) => {
  try {
    const { app, operation, naturalLanguage } = req.body;

    if (!app || !operation || !naturalLanguage) {
      return res.status(400).json({
        success: false,
        error: 'App, operation, and natural language input are required'
      });
    }

    const prompt = `Extract parameter values from natural language for ${app} ${operation}.

User said: "${naturalLanguage}"

Based on this input, extract parameter values and respond with JSON:
{
  "parameters": {
    "parameterName": "extracted value"
  },
  "confidence": 0.8,
  "missingInfo": ["what additional info is needed"],
  "clarifyingQuestions": ["question to ask user for missing info"]
}

For example:
- "Send email to john@example.com about meeting" → {"to": "john@example.com", "subject": "meeting"}
- "Create a task called 'Review proposal' due tomorrow" → {"title": "Review proposal", "dueDate": "tomorrow"}`;

    const aiResponse = await MultiAIService.generateText({
      model: 'gemini-2.0-flash-exp',
      prompt
    });

    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch {
      parsed = {
        parameters: {},
        confidence: 0.3,
        missingInfo: ['Could not parse natural language'],
        clarifyingQuestions: ['Could you be more specific about the parameters?'],
        rawResponse: aiResponse
      };
    }

    res.json({
      success: true,
      app,
      operation,
      naturalLanguage,
      parsed
    });

  } catch (error) {
    console.error('Natural language parsing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to parse natural language'
    });
  }
});

export default router;