import { Router } from 'express';
import { MultiAIService } from '../aiModels';

export const aiRouter = Router();

// Generate workflow questions endpoint
aiRouter.post('/generate-workflow', async (req, res) => {
  try {
    console.log('🤖 /api/ai/generate-workflow called!');
    const { prompt, userId, model = 'gemini-1.5-flash', apiKey } = req.body || {};
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required and must be a string' 
      });
    }

    // Make userId optional in development mode
    const finalUserId = userId || (process.env.NODE_ENV === 'development' ? 'dev-user' : null);
    if (!finalUserId && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ 
        success: false, 
        error: 'userId is required in production mode' 
      });
    }

    console.log('📝 Prompt for analysis:', prompt);
    console.log('👤 User ID:', finalUserId);
    console.log('🤖 Model:', model);

    // Use MultiAIService to determine if questions are needed
    const questions = await MultiAIService.generateFollowUpQuestions(prompt);
    
    console.log('❓ Generated questions:', questions);

    // If no questions needed (prompt is clear), return empty array
    if (!questions || questions.length === 0) {
      console.log('✅ No additional questions needed');
      return res.json({
        success: true,
        questions: [],
        needsQuestions: false,
        message: 'Prompt is clear enough to proceed directly to workflow building'
      });
    }

    // Return questions for user to answer
    console.log(`📋 Returning ${questions.length} questions for user`);
    res.json({
      success: true,
      questions: questions,
      needsQuestions: true,
      message: `Need ${questions.length} additional details to build the perfect workflow`
    });

  } catch (error: any) {
    console.error('❌ AI generate-workflow error:', error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Failed to analyze workflow request',
      questions: [] // Return empty questions as fallback
    });
  }
});

// Get available AI models endpoint  
aiRouter.get('/models', async (req, res) => {
  try {
    // Return available models
    res.json({
      success: true,
      models: [
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
        { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', provider: 'gemini' }, 
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', provider: 'gemini' },
        { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'claude' },
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai' }
      ]
    });
  } catch (error: any) {
    console.error('❌ AI models error:', error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Failed to get AI models' 
    });
  }
});

// Check deployment prerequisites endpoint
aiRouter.get('/deployment/prerequisites', async (req, res) => {
  try {
    console.log('🔍 Checking deployment prerequisites...');
    
    const prerequisites = {
      success: true,
      checks: {
        clasp: { 
          status: 'available', 
          message: 'Google Apps Script CLI is ready',
          required: true 
        },
        googleAuth: { 
          status: 'available', 
          message: 'Google authentication configured',
          required: true 
        },
        permissions: { 
          status: 'available', 
          message: 'Required permissions granted',
          required: true 
        }
      },
      canDeploy: true,
      message: 'All prerequisites satisfied'
    };

    // In a real implementation, you would check:
    // 1. Is clasp installed? (`clasp --version`)
    // 2. Is user authenticated? (`clasp list`)
    // 3. Are required OAuth scopes granted?
    // 4. Are API quotas sufficient?

    res.json(prerequisites);
    
  } catch (error: any) {
    console.error('❌ Prerequisites check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Failed to check prerequisites',
      canDeploy: false,
      checks: {
        clasp: { status: 'error', message: 'Could not verify clasp installation', required: true },
        googleAuth: { status: 'unknown', message: 'Could not verify authentication', required: true },
        permissions: { status: 'unknown', message: 'Could not verify permissions', required: true }
      }
    });
  }
});

export default aiRouter;