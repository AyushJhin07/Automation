import assert from 'node:assert/strict';

import { AutomationPlannerService } from '../AutomationPlannerService.js';
import { MultiAIService } from '../../aiModels.js';

const mockFailure = async () => {
  throw new Error('LLM failure');
};

// Test: all mode should surface prompt-specific apps when the LLM fails.
{
  const originalGenerateText = MultiAIService.generateText;
  try {
    AutomationPlannerService.setGeminiJsonGenerator(() => Promise.reject(new Error('Gemini unavailable')));
    (MultiAIService as any).generateText = mockFailure;

    const prompt = 'When Jira has a new ticket, post an update to Slack and notify the support channel.';
    const plan = await AutomationPlannerService.planAutomation(prompt, 'all');

    assert(plan.apps.includes('slack'), 'fallback plan should include Slack when mentioned in prompt');
    assert(plan.apps.includes('jira'), 'fallback plan should include Jira when mentioned in prompt');
    assert.equal(plan.description, prompt, 'fallback description should echo the user prompt');
    assert(plan.follow_up_questions?.some(q => q.id === 'slack_channel'), 'should ask for Slack channel configuration');
    assert.notDeepEqual(
      [...plan.apps].sort(),
      ['gmail', 'sheets'].sort(),
      'fallback should not revert to the static Gmail/Sheets recipe in all mode'
    );

    console.log('AutomationPlannerService uses heuristic fallback for all-mode failures.');
  } finally {
    AutomationPlannerService.resetGeminiJsonGenerator();
    (MultiAIService as any).generateText = originalGenerateText;
  }
}

// Test: gas-only mode should constrain fallback to Google Workspace apps.
{
  const originalGenerateText = MultiAIService.generateText;
  try {
    AutomationPlannerService.setGeminiJsonGenerator(() => Promise.reject(new Error('Gemini unavailable')));
    (MultiAIService as any).generateText = mockFailure;

    const prompt = 'Send Slack alerts when a new support email arrives.';
    const plan = await AutomationPlannerService.planAutomation(prompt, 'gas-only');

    assert(plan.apps.every(app => ['gmail', 'sheets'].includes(app)), 'gas-only fallback should stay within Workspace apps');
    assert(!plan.apps.includes('slack'), 'gas-only fallback must omit non-Google connectors');
    assert.equal(plan.description, prompt, 'gas-only fallback should still reference the prompt');

    console.log('AutomationPlannerService respects gas-only mode when falling back.');
  } finally {
    AutomationPlannerService.resetGeminiJsonGenerator();
    (MultiAIService as any).generateText = originalGenerateText;
  }
}
