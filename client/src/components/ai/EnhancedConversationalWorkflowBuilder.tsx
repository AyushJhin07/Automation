// ENHANCED CONVERSATIONAL WORKFLOW BUILDER
// Connected to professional ChatGPT-style backend architecture

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  Brain, 
  CheckCircle, 
  AlertCircle, 
  Code, 
  Download, 
  Play,
  Workflow,
  Zap,
  Settings,
  Eye,
  Copy,
  ExternalLink,
  Sparkles,
  Clock,
  HelpCircle
} from 'lucide-react';
import { NodeGraph, Question, ValidationError } from '../../../shared/nodeGraphSchema';

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  type?: 'question' | 'workflow' | 'code' | 'validation';
  data?: any;
}

interface WorkflowResult {
  workflow: {
    graph: NodeGraph;
    rationale: string;
    validation: {
      errors: ValidationError[];
      warnings: ValidationError[];
      isValid: boolean;
    };
  };
  code: {
    files: any[];
    entry: string;
    stats: {
      fileCount: number;
      totalLines: number;
    };
  };
  deployment: {
    instructions: string[];
    requiredSecrets: string[];
    requiredScopes: string[];
  };
  estimatedValue: string;
  complexity: string;
}

export default function EnhancedConversationalWorkflowBuilder() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null);
  const [showWorkflowPreview, setShowWorkflowPreview] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add welcome message
    setMessages([{
      id: '1',
      role: 'assistant',
      content: `🚀 **Welcome to AI Workflow Builder!**

I'm your AI automation assistant. I can help you create powerful Google Apps Script automations by just describing what you want to accomplish.

**What I can do:**
• Connect 500+ applications (Gmail, Sheets, Slack, Salesforce, etc.)
• Generate real, executable Google Apps Script code
• Create professional workflows with validation
• Provide complete deployment instructions

**Just tell me what automation you'd like to build!**

*Example: "Monitor my Gmail for invoices and log them to a Google Sheet"*`,
      timestamp: new Date(),
      type: 'system'
    }]);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = (message: Omit<ConversationMessage, 'id' | 'timestamp'>) => {
    const newMessage: ConversationMessage = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isProcessing) return;

    const userMessage = currentInput.trim();
    setCurrentInput('');

    // Add user message
    addMessage({
      role: 'user',
      content: userMessage
    });

    setIsProcessing(true);
    
    try {
      await generateCompleteWorkflow(userMessage);
    } catch (error) {
      console.error('Workflow generation error:', error);
      addMessage({
        role: 'assistant',
        content: `❌ **Error generating workflow**

${error.message || 'An unexpected error occurred. Please try again.'}

You can try:
• Simplifying your request
• Being more specific about the apps you want to use
• Checking your internet connection`,
        type: 'validation'
      });
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const generateCompleteWorkflow = async (prompt: string) => {
    try {
      setProcessingStep('🤔 Understanding your request...');
      
      // Call the complete workflow generation API
      const response = await fetch('/api/workflow/generate-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          answers: Object.keys(questionAnswers).length > 0 ? questionAnswers : undefined,
          skipQuestions: Object.keys(questionAnswers).length > 0
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate workflow');
      }

      // Check if we need to ask questions
      if (result.needsQuestions && result.questions) {
        setCurrentQuestions(result.questions);
        
        addMessage({
          role: 'assistant',
          content: `🤔 **I need some clarification to build the perfect automation:**

${result.questions.map((q: Question, index: number) => 
  `**${index + 1}.** ${q.text}${q.choices ? `\n   Options: ${q.choices.join(', ')}` : ''}`
).join('\n\n')}

Please answer these questions so I can create exactly what you need!`,
          type: 'question',
          data: { questions: result.questions }
        });

        return;
      }

      // Process the complete workflow result
      setProcessingStep('📋 Planning your workflow...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      setProcessingStep('✅ Validating workflow structure...');
      await new Promise(resolve => setTimeout(resolve, 800));

      setProcessingStep('🔨 Generating Google Apps Script code...');
      await new Promise(resolve => setTimeout(resolve, 1200));

      setProcessingStep('🚀 Preparing deployment instructions...');
      await new Promise(resolve => setTimeout(resolve, 600));

      // Store the workflow result
      setWorkflowResult(result);

      // Add success message with workflow summary
      const workflow = result.workflow.graph;
      const validation = result.workflow.validation;
      
      addMessage({
        role: 'assistant',
        content: `✅ **Workflow Generated Successfully!**

**"${workflow.name}"**
${result.workflow.rationale}

📊 **Workflow Stats:**
• **Nodes:** ${workflow.nodes.length} (${workflow.nodes.filter(n => n.type.startsWith('trigger.')).length} triggers, ${workflow.nodes.filter(n => n.type.startsWith('action.')).length} actions)
• **Complexity:** ${result.complexity}
• **Estimated Value:** ${result.estimatedValue}

🔍 **Validation:**
• **Status:** ${validation.isValid ? '✅ Valid' : '❌ Has Errors'}
• **Warnings:** ${validation.warnings.length}
• **Required Scopes:** ${workflow.scopes.length}

📝 **Generated Code:**
• **Files:** ${result.code.stats.fileCount}
• **Lines of Code:** ${result.code.stats.totalLines}
• **Entry Point:** ${result.code.entry}

🚀 **Ready for Deployment!**`,
        type: 'workflow',
        data: result
      });

    } catch (error) {
      throw error;
    }
  };

  const handleAnswerQuestion = (questionId: string, answer: string) => {
    setQuestionAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleSubmitAnswers = async () => {
    if (Object.keys(questionAnswers).length === 0) return;

    // Find the original user prompt (last user message before questions)
    const userMessages = messages.filter(m => m.role === 'user');
    const originalPrompt = userMessages[userMessages.length - 1]?.content || '';

    addMessage({
      role: 'user',
      content: `📝 **My answers:**\n\n${currentQuestions.map(q => 
        `**${q.text}**\n${questionAnswers[q.id] || 'Not answered'}`
      ).join('\n\n')}`
    });

    setCurrentQuestions([]);
    setIsProcessing(true);

    try {
      await generateCompleteWorkflow(originalPrompt);
    } catch (error) {
      console.error('Error with answers:', error);
      addMessage({
        role: 'assistant',
        content: `❌ **Error processing your answers**\n\n${error.message}`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewWorkflow = () => {
    setShowWorkflowPreview(true);
  };

  const handleViewCode = () => {
    setShowCodePreview(true);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      // Show success feedback
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const handleDeployWorkflow = () => {
    if (!workflowResult) return;
    
    // Open Google Apps Script in new tab
    window.open('https://script.google.com/home/start', '_blank');
    
    addMessage({
      role: 'assistant',
      content: `🚀 **Deployment Started!**

I've opened Google Apps Script for you. Here's what to do:

**Step 1:** Create a new project
**Step 2:** Copy the generated code files
**Step 3:** Follow the deployment instructions

Need help? I can guide you through each step!`
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI Workflow Builder</h1>
              <p className="text-sm text-slate-400">Powered by Advanced LLM Technology</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
              <Zap className="w-3 h-3 mr-1" />
              500+ Apps
            </Badge>
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              <Code className="w-3 h-3 mr-1" />
              Real Code
            </Badge>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-4xl rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.role === 'system'
                  ? 'bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 text-white'
                  : 'bg-slate-800 text-white border border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                {message.role === 'assistant' && (
                  <div className="p-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                )}
                
                <div className="flex-1">
                  <div className="prose prose-invert max-w-none">
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                  
                  {/* Workflow Action Buttons */}
                  {message.type === 'workflow' && message.data && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={handleViewWorkflow}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Workflow
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleViewCode}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Code className="w-4 h-4 mr-2" />
                        View Code
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDeployWorkflow}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Deploy Now
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Questions Interface */}
        {currentQuestions.length > 0 && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <HelpCircle className="w-5 h-5 text-blue-400" />
                Please Answer These Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentQuestions.map((question, index) => (
                <div key={question.id} className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">
                    {index + 1}. {question.text}
                  </label>
                  
                  {question.choices ? (
                    <select
                      className="w-full p-2 bg-slate-700 border border-slate-600 rounded text-white"
                      value={questionAnswers[question.id] || ''}
                      onChange={(e) => handleAnswerQuestion(question.id, e.target.value)}
                    >
                      <option value="">Select an option...</option>
                      {question.choices.map((choice) => (
                        <option key={choice} value={choice}>{choice}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      placeholder="Type your answer..."
                      value={questionAnswers[question.id] || ''}
                      onChange={(e) => handleAnswerQuestion(question.id, e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  )}
                </div>
              ))}
              
              <Button
                onClick={handleSubmitAnswers}
                disabled={Object.keys(questionAnswers).length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Answers
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex justify-center">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 text-white">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <span>{processingStep || 'Processing...'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-700 bg-slate-800/50 backdrop-blur-sm p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Textarea
              placeholder="Describe the automation you want to build... (e.g., 'Monitor Gmail for invoices and log to Google Sheets')"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isProcessing}
              className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 resize-none"
              rows={2}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!currentInput.trim() || isProcessing}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-6"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>Powered by {workflowResult ? 'Real LLM' : 'AI'} • 500+ Apps Supported</span>
        </div>
      </div>

      {/* Workflow Preview Modal */}
      {showWorkflowPreview && workflowResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="bg-slate-800 border-slate-700 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-blue-400" />
                  Workflow Preview
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowWorkflowPreview(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-white">
                <div>
                  <h3 className="font-semibold text-lg">{workflowResult.workflow.graph.name}</h3>
                  <p className="text-slate-400">{workflowResult.workflow.rationale}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Nodes ({workflowResult.workflow.graph.nodes.length})</h4>
                    <div className="space-y-1">
                      {workflowResult.workflow.graph.nodes.map(node => (
                        <div key={node.id} className="text-sm bg-slate-700 p-2 rounded">
                          <div className="font-medium">{node.label}</div>
                          <div className="text-slate-400">{node.type}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Connections ({workflowResult.workflow.graph.edges.length})</h4>
                    <div className="space-y-1">
                      {workflowResult.workflow.graph.edges.map((edge, index) => (
                        <div key={index} className="text-sm bg-slate-700 p-2 rounded">
                          {edge.from} → {edge.to}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Code Preview Modal */}
      {showCodePreview && workflowResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="bg-slate-800 border-slate-700 max-w-6xl w-full max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-green-400" />
                  Generated Code
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCodePreview(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {workflowResult.code.files.map(file => (
                  <div key={file.path} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-white">{file.path}</h4>
                      <Button
                        size="sm"
                        onClick={() => handleCopyCode(file.content)}
                        className="bg-slate-700 hover:bg-slate-600"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <pre className="bg-slate-900 p-4 rounded text-sm overflow-x-auto text-green-400">
                      <code>{file.content}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}