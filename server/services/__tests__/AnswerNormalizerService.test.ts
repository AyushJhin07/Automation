import assert from 'node:assert/strict';

import { AnswerNormalizerService } from '../AnswerNormalizerService.js';

const questions = [
  { id: 'trigger', question: 'How often should this run?' },
  { id: 'sheet_url', question: 'What sheet should we use?' }
];

const rawAnswers = {
  trigger: 'every 15 minutes',
  sheet_url: 'https://docs.google.com/spreadsheets/d/mock-sheet'
};

const mockResponse = {
  normalized: {
    trigger: { type: 'time', frequency: { value: 15, unit: 'minutes' } },
    apps: { source: ['gmail'], destination: ['sheets'] },
    sheets: {
      sheet_url: 'https://docs.google.com/spreadsheets/d/mock-sheet',
      sheet_name: 'Sheet1',
      columns: ['Column A', 'Column B']
    },
    mapping: {
      pairs: [
        { from: 'Column A', to: 'Column B', transform: null }
      ]
    }
  },
  __issues: []
};

AnswerNormalizerService.setGeminiJsonGenerator(async () => JSON.stringify(mockResponse));

const originalFallback = AnswerNormalizerService['fallbackNormalization'] as any;
let fallbackCalled = false;
AnswerNormalizerService['fallbackNormalization'] = ((...args: any[]) => {
  fallbackCalled = true;
  return originalFallback.apply(AnswerNormalizerService, args);
}) as typeof originalFallback;

try {
  const result = await AnswerNormalizerService.normalizeAnswersLLM(questions as any, rawAnswers, 'UTC');

  assert.equal(result.provider, 'gemini');
  assert.deepEqual(result.normalized, mockResponse.normalized);
  assert.deepEqual(result.__issues, mockResponse.__issues);
  assert.equal(fallbackCalled, false, 'should not use fallback when Gemini returns valid JSON');

  console.log('AnswerNormalizerService normalizeAnswersLLM handles Gemini JSON responses.');
} finally {
  AnswerNormalizerService.resetGeminiJsonGenerator();
  AnswerNormalizerService['fallbackNormalization'] = originalFallback;
}
