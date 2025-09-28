import assert from 'node:assert/strict';

import { AutomationPlannerService } from '../AutomationPlannerService.ts';
import { MultiAIService } from '../../aiModels.ts';

type GenerateText = typeof MultiAIService.generateText;

async function runAllModeFallbackTest() {
  const prompt = 'Send urgent Slack alerts and open Jira bugs when customers escalate issues.';

  AutomationPlannerService.setGeminiJsonGenerator(async () => {
    throw new Error('Gemini unavailable');
  });

  const originalGenerateText: GenerateText = MultiAIService.generateText;
  MultiAIService.generateText = async () => {
    throw new Error('LLM failure');
  };

  try {
    const plan = await AutomationPlannerService.planAutomation(prompt, 'all');

    assert(plan.apps.includes('slack'), 'fallback should include Slack when allowed');
    assert(plan.apps.includes('jira'), 'fallback should include Jira when allowed');
    assert.equal(plan.description, prompt);

    console.log('AutomationPlannerService fallback honors dynamic heuristics in all mode.');
  } finally {
    AutomationPlannerService.resetGeminiJsonGenerator();
    MultiAIService.generateText = originalGenerateText;
  }
}

async function runGasOnlyFallbackTest() {
  const prompt = 'Send urgent Slack alerts and open Jira bugs when customers escalate issues.';

  AutomationPlannerService.setGeminiJsonGenerator(async () => {
    throw new Error('Gemini unavailable');
  });

  const originalGenerateText: GenerateText = MultiAIService.generateText;
  MultiAIService.generateText = async () => {
    throw new Error('LLM failure');
  };

  try {
    const plan = await AutomationPlannerService.planAutomation(prompt, 'gas-only');

    assert(!plan.apps.includes('slack'), 'gas-only fallback should exclude Slack');
    assert(!plan.apps.includes('jira'), 'gas-only fallback should exclude Jira');
    assert(plan.apps.includes('gmail'), 'gas-only fallback should still include Workspace apps');
    assert(plan.apps.includes('sheets'), 'gas-only fallback should still include Workspace apps');
    assert.equal(plan.description, prompt);

    console.log('AutomationPlannerService fallback respects gas-only mode allowlist.');
  } finally {
    AutomationPlannerService.resetGeminiJsonGenerator();
    MultiAIService.generateText = originalGenerateText;
  }
}

await runAllModeFallbackTest();
await runGasOnlyFallbackTest();
