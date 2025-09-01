/**
 * ChatGPT's LLM Answer Normalization API
 * 
 * POST /api/ai/normalize-answers
 * Converts free-form user answers to structured build-ready format
 */

import { Router } from 'express';
import { AnswerNormalizerService } from '../services/AnswerNormalizerService.js';

const router = Router();

// CRITICAL: LLM-powered answer normalization
router.post('/normalize-answers', async (req, res) => {
  try {
    const { questions, rawAnswers, timezone = 'UTC' } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        error: 'Questions array is required'
      });
    }

    if (!rawAnswers || typeof rawAnswers !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Raw answers object is required'
      });
    }

    console.log('🧠 LLM Answer Normalization request:', {
      questionCount: questions.length,
      rawAnswerKeys: Object.keys(rawAnswers),
      timezone
    });

    // Use LLM to intelligently normalize answers
    const result = await AnswerNormalizerService.normalizeAnswersLLM(
      questions,
      rawAnswers,
      timezone
    );

    // Validate the normalized result
    const validation = AnswerNormalizerService.validateNormalizedAnswers(result.normalized);

    console.log('✅ LLM normalization completed:', {
      provider: result.provider,
      processingTime: result.processingTime,
      normalizedKeys: Object.keys(result.normalized),
      issuesCount: result.__issues.length,
      validationPassed: validation.valid
    });

    res.json({
      success: true,
      normalized: result.normalized,
      __issues: result.__issues,
      validation: {
        valid: validation.valid,
        errors: validation.errors
      },
      metadata: {
        provider: result.provider,
        processingTime: result.processingTime,
        questionCount: questions.length,
        normalizedKeys: Object.keys(result.normalized)
      }
    });

  } catch (error) {
    console.error('❌ LLM answer normalization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to normalize answers',
      details: error.message
    });
  }
});

// Get normalization capabilities
router.get('/capabilities', (req, res) => {
  try {
    const capabilities = {
      supportedQuestionTypes: [
        'text', 'textarea', 'select', 'checkbox', 
        'data_mapping', 'schedule_config', 'notification_config', 'validation_rules'
      ],
      supportedCoercions: [
        'map_frequency_to_trigger',
        'extract_sheet_url',
        'parse_columns_from_text',
        'split_commas_to_array',
        'extract_emails',
        'normalize_slack_channels'
      ],
      supportedApps: [
        'gmail', 'sheets', 'slack', 'jira', 'salesforce', 'hubspot',
        'trello', 'asana', 'notion', 'calendly', 'mailchimp', 'stripe'
      ],
      normalizationFeatures: [
        'Intelligent text parsing',
        'Multi-line data mapping extraction',
        'Email and URL extraction',
        'Array conversion from comma-separated text',
        'Structured object creation from free text',
        'Validation and issue reporting'
      ]
    };

    res.json({
      success: true,
      capabilities,
      version: '2.0'
    });
  } catch (error) {
    console.error('Error fetching normalization capabilities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch capabilities'
    });
  }
});

// Test normalization with sample data
router.post('/test-normalization', async (req, res) => {
  try {
    const sampleQuestions = [
      {
        id: 'schedule_config',
        text: 'How often should this automation run?',
        type: 'schedule_config',
        required: true,
        expected: {
          jsonPointer: '/trigger',
          valueType: 'string',
          enum: ['time.every_5_minutes', 'time.every_15_minutes', 'time.every_hour'],
          coercions: ['map_frequency_to_trigger']
        }
      },
      {
        id: 'data_mapping',
        text: 'Where should the data be stored?',
        type: 'data_mapping',
        required: true,
        expected: {
          jsonPointer: '/sheets',
          valueType: 'object',
          requiredKeys: ['sheet_url', 'sheet_name', 'columns'],
          coercions: ['extract_sheet_url', 'parse_columns_from_text']
        }
      }
    ];

    const sampleAnswers = {
      schedule_config: 'every 15 minutes',
      data_mapping: `https://docs.google.com/spreadsheets/d/1TEST123/edit
Sheet1
Email Address, Subject, Date, Body`
    };

    const result = await AnswerNormalizerService.normalizeAnswersLLM(
      sampleQuestions,
      sampleAnswers,
      'UTC'
    );

    res.json({
      success: true,
      test: 'Sample normalization',
      input: { questions: sampleQuestions, answers: sampleAnswers },
      result
    });

  } catch (error) {
    console.error('Error testing normalization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test normalization'
    });
  }
});

export default router;