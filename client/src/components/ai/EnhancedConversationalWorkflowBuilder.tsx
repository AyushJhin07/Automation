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
  HelpCircle,
  ArrowRight,
  Mail,
  Sheet,
  Calendar,
  Filter,
  Globe
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

// Visual Workflow Preview Component
const WorkflowVisualPreview = ({ workflowData }: { workflowData: any }) => {
  if (!workflowData?.workflow?.graph) return null;

  const graph = workflowData.workflow.graph;
  
  const getNodeIcon = (nodeType: string, app: string) => {
    if (nodeType.includes('gmail') || app === 'Gmail') return Mail;
    if (nodeType.includes('sheets') || app === 'Google Sheets') return Sheet;
    if (nodeType.includes('calendar') || app === 'Google Calendar') return Calendar;
    if (nodeType.includes('transform')) return Filter;
    if (nodeType.includes('http')) return Globe;
    if (nodeType.includes('time')) return Clock;
    return Zap;
  };

  const getNodeColor = (nodeType: string) => {
    if (nodeType.startsWith('trigger.')) return 'from-green-500 to-emerald-600';
    if (nodeType.startsWith('action.')) return 'from-blue-500 to-indigo-600';
    if (nodeType.startsWith('transform.')) return 'from-purple-500 to-violet-600';
    return 'from-gray-500 to-slate-600';
  };

  return (
    <div className="bg-white rounded-lg p-4 border border-gray-100">
      <h3 className="text-gray-900 font-semibold mb-3 flex items-center gap-2">
        <Workflow className="w-4 h-4 text-blue-600" />
        Generated Workflow Structure
      </h3>
      
      <div className="flex items-center gap-4 overflow-x-auto pb-2">
        {graph.nodes.map((node: any, index: number) => {
          const IconComponent = getNodeIcon(node.type, node.app);
          const colorClass = getNodeColor(node.type);
          
          return (
            <div key={node.id} className="flex items-center gap-2 flex-shrink-0">
              {/* Node */}
              <div className={`
                bg-gradient-to-br ${colorClass} 
                rounded-lg p-3 min-w-[140px] text-center
                border border-white/20 shadow-lg
              `}>
                <div className="flex items-center justify-center mb-2">
                  <div className="p-1.5 bg-white/20 rounded-lg">
                    <IconComponent className="w-4 h-4 text-white" />
                  </div>
                </div>
                <h4 className="text-white font-medium text-sm">{node.label}</h4>
                <p className="text-white/70 text-xs mt-1">{node.app || 'Built-in'}</p>
                
                {/* Show key parameters */}
                {node.params && Object.keys(node.params).length > 0 && (
                  <div className="mt-2 text-xs text-white/60">
                    {Object.entries(node.params).slice(0, 2).map(([key, value]) => (
                      <div key={key} className="truncate">
                        {key}: {String(value).substring(0, 20)}...
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Arrow */}
              {index < graph.nodes.length - 1 && (
                <ArrowRight className="w-5 h-5 text-blue-400 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
      
      {/* Workflow Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div className="bg-green-50 border border-green-200 rounded p-2">
          <div className="text-lg font-bold text-green-600">
            {graph.nodes.filter((n: any) => n.type.startsWith('trigger.')).length}
          </div>
          <div className="text-xs text-gray-600">Triggers</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-2">
          <div className="text-lg font-bold text-blue-600">
            {graph.nodes.filter((n: any) => n.type.startsWith('action.')).length}
          </div>
          <div className="text-xs text-gray-600">Actions</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded p-2">
          <div className="text-lg font-bold text-purple-600">
            {graph.nodes.filter((n: any) => n.type.startsWith('transform.')).length}
          </div>
          <div className="text-xs text-gray-600">Transforms</div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            localStorage.setItem('ai_generated_workflow', JSON.stringify(workflowData));
            window.open('/graph-editor?from=ai-builder', '_blank');
          }}
          className="bg-green-600 hover:bg-green-700 flex-1"
        >
          <Settings className="w-4 h-4 mr-2" />
          Open in Graph Editor
        </Button>
        <Button
          size="sm"
          onClick={() => {
            // Generate and download code
            fetch('/api/workflow/generate-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ graph: workflowData.workflow.graph })
            })
            .then(response => response.json())
            .then(result => {
              if (result.success) {
                const codeContent = result.files.find((f: any) => f.path === 'Code.js')?.content || '';
                const blob = new Blob([codeContent], { type: 'text/javascript' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'automation-code.js';
                a.click();
                URL.revokeObjectURL(url);
              }
            });
          }}
          className="bg-purple-600 hover:bg-purple-700 flex-1"
        >
          <Download className="w-4 h-4 mr-2" />
          Download Code
        </Button>
      </div>
    </div>
  );
};

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
  const [apiKeys, setApiKeys] = useState<{gemini?: string; claude?: string; openai?: string}>({});
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [serverModels, setServerModels] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load API keys from localStorage
  useEffect(() => {
    const savedKeys = {
      gemini: localStorage.getItem('gemini_api_key') || '',
      claude: localStorage.getItem('claude_api_key') || '',
      openai: localStorage.getItem('openai_api_key') || ''
    };
    setApiKeys(savedKeys);
  }, []);

  // On mount, ask the server which models are available
  useEffect(() => {
    fetch('/api/ai/models')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setServerModels(data?.models ?? []))
      .catch(() => setServerModels([]));
  }, []);

  // Helper functions for server-aware API key checking
  const providerOf = (modelId: string) => {
    const id = (modelId || '').toLowerCase();
    if (id.includes('gemini')) return 'gemini';
    if (id.includes('claude')) return 'claude';
    if (id.includes('gpt') || id.includes('openai') || id.includes('4o')) return 'openai';
    return 'gemini'; // sensible default
  };

  const serverHasProvider = (provider: 'gemini' | 'claude' | 'openai') =>
    serverModels.some((m) =>
      (m.provider && m.provider.toLowerCase() === provider) ||
      (m.name && m.name.toLowerCase().includes(provider))
    );

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
      
      // Get API key for selected model
      const provider = providerOf(selectedModel);
      const currentApiKey =
        provider === 'gemini'  ? (apiKeys.gemini  || '') :
        provider === 'claude'  ? (apiKeys.claude  || '') :
        provider === 'openai'  ? (apiKeys.openai  || '') : '';

      const serverHasIt = serverHasProvider(provider);

      // Allow server-side keys OR local keys
      if (!currentApiKey && !serverHasIt) {
        throw new Error(`Please configure your ${selectedModel} API key in Admin Settings (/admin/settings)`);
      }

      // Only send apiKey if we have a local one, otherwise let server use its own
      const apiKeyToSend = currentApiKey || undefined;

      // Use the public AI workflow generation API
      const response = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          userId: 'demo-user', // For demo purposes
          preferredModel: selectedModel,
          apiKey: apiKeyToSend
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to process request');
      }

      console.log('🤖 API Response received:', result.tokensUsed || 0, 'tokens');

      // Handle clarification response (questions)
      if (Object.keys(questionAnswers).length === 0 && result.questions) {
        const questions: Question[] = result.questions.map((q: any, index: number) => ({
          id: q.id || `question_${index}`,
          text: q.text,
          kind: q.category || 'missingParam',
          choices: q.choices || []
        }));
        
        setCurrentQuestions(questions);
        
        addMessage({
          role: 'assistant',
          content: `🤔 **I need some clarification to build the perfect automation:**

${questions.map((q, i) => `**${i + 1}.** ${q.text}`).join('\n\n')}

Please answer these questions in the form below:`,
          type: 'question',
          data: { questions }
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

      // Create workflow result from new API response
      const workflowData = {
        workflow: {
          graph: {
            id: result.id,
            name: result.title,
            description: result.description,
            nodes: result.nodes || [],
            connections: result.connections || []
          },
          validation: result.validation || { valid: true, errors: [], warnings: [] }
        },
        code: result.appsScriptCode || 'No code generated',
        files: result.files || [],
        rationale: result.description || 'Generated automation workflow',
        deploymentInstructions: result.deploymentInstructions || ''
      };

      // Store the workflow result
      setWorkflowResult(workflowData);

      // Add success message with workflow summary
      const workflow = workflowData.workflow.graph;
      const validation = workflowData.workflow.validation;
      
      addMessage({
        role: 'assistant',
        content: `✅ **Workflow Generated Successfully!**

**"${workflow.name}"**
${result.description}

📊 **Workflow Stats:**
• **Nodes:** ${workflow.nodes.length} (${workflow.nodes.filter(n => n.function?.includes('search') || n.function?.includes('monitor')).length} triggers, ${workflow.nodes.filter(n => n.function?.includes('append') || n.function?.includes('create') || n.function?.includes('update')).length} actions)
• **Complexity:** ${result.complexity}
• **Estimated Value:** ${result.estimatedValue}

🔍 **Validation:**
• **Status:** ${validation.valid ? '✅ Valid' : '❌ Has Errors'}
• **Warnings:** ${validation.warnings?.length || 0}
• **Errors:** ${validation.errors?.length || 0}

📝 **Generated Code:**
• **Lines of Code:** ${result.appsScriptCode?.split('\n').length || 0}
• **Ready for Google Apps Script**

🚀 **Ready for Deployment!**`,
        type: 'workflow',
        data: result
      });

      // Add visual workflow preview message
      addMessage({
        role: 'assistant',
        content: `📊 **Visual Workflow Structure:**`,
        type: 'workflow-visual',
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
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Workflow Builder</h1>
              <p className="text-sm text-gray-600">Powered by Advanced LLM Technology</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-white border border-gray-300 text-gray-900 text-sm rounded px-2 py-1"
            >
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="claude-3.5-haiku">Claude 3.5 Haiku</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
            </select>
            <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
              <Zap className="w-3 h-3 mr-1" />
              500+ Apps
            </Badge>
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              <Code className="w-3 h-3 mr-1" />
              Real Code
            </Badge>
            {(() => {
              const provider = providerOf(selectedModel);
              const hasLocal = !!apiKeys[provider as keyof typeof apiKeys];
              const hasServer = serverHasProvider(provider as any);
              return (!hasLocal && !hasServer) ? (
                <Badge variant="secondary" className="bg-red-500/20 text-red-400 border-red-500/30">
                  ⚠️ API Key Required
                </Badge>
              ) : null;
            })()}
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
              className={`max-w-4xl rounded-2xl p-6 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.role === 'system'
                  ? 'bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 border-2 border-sky-300/80 text-gray-800 shadow-[inset_0_2px_8px_rgba(255,255,255,0.8),0_8px_32px_rgba(14,165,233,0.4),0_4px_16px_rgba(14,165,233,0.3)] ring-2 ring-sky-200/50'
                  : 'bg-white text-gray-900 border border-gray-200 shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                {message.role === 'assistant' && (
                  <div className="p-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                )}
                
                <div className="flex-1">
                  <div className={`prose max-w-none ${message.role === 'system' ? 'text-gray-800' : message.role === 'user' ? 'text-white' : 'text-gray-900'}`}>
                    <div className="whitespace-pre-wrap font-medium">{message.content}</div>
                  </div>
                  
                  {/* Visual Workflow Preview */}
                  {message.type === 'workflow-visual' && message.data && (
                    <div className="mt-4">
                      <WorkflowVisualPreview workflowData={message.data} />
                    </div>
                  )}

                  {/* Workflow Action Buttons */}
                  {message.type === 'workflow' && message.data && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={handleViewWorkflow}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          // Convert AI workflow to Graph Editor format
                          const graphData = {
                            id: message.data.id,
                            name: message.data.title,
                            description: message.data.description,
                            nodes: message.data.nodes.map((node: any) => ({
                              id: node.id,
                              type: node.app.toLowerCase().replace(/\s+/g, '-'),
                              position: node.position,
                              data: {
                                label: node.function || node.app,
                                app: node.app,
                                function: node.function,
                                parameters: node.parameters || {},
                                ...node
                              }
                            })),
                            edges: message.data.connections.map((conn: any) => ({
                              id: conn.id,
                              source: conn.source,
                              target: conn.target,
                              type: 'default'
                            }))
                          };
                          
                          // Save to localStorage and redirect
                          localStorage.setItem('ai_generated_workflow', JSON.stringify(graphData));
                          window.location.href = '/graph-builder';
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Edit in Graph Editor
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleViewCode}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Code className="w-4 h-4 mr-2" />
                        View Code
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDeployWorkflow}
                        className="bg-orange-600 hover:bg-orange-700"
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
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 shadow-lg">
            <CardHeader className="bg-white/80">
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <HelpCircle className="w-5 h-5 text-blue-600 animate-pulse" />
                🤔 Please Answer These Questions ({currentQuestions.length})
              </CardTitle>
              <p className="text-sm text-gray-600">
                Help me understand your automation requirements better:
              </p>
            </CardHeader>
            <CardContent className="space-y-6 bg-white/60">
              {currentQuestions.map((question, index) => (
                <div key={question.id} className="space-y-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                  <label className="text-sm font-medium text-gray-900 flex items-start gap-2">
                    <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <span className="flex-1">{question.text}</span>
                  </label>
                  
                                     {/* ALWAYS SHOW INPUT FIELD */}
                   <div className="space-y-3">
                     {/* Text input - always visible and prominent */}
                     <div className="space-y-2">
                       <Textarea
                         placeholder="Type your answer here... (Be as specific as possible)"
                         value={questionAnswers[question.id] || ''}
                         onChange={(e) => handleAnswerQuestion(question.id, e.target.value)}
                         className="bg-white border-2 border-blue-300 text-gray-900 placeholder-gray-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 text-base p-4 min-h-[80px]"
                         rows={3}
                       />
                       <div className="flex items-center justify-between text-xs">
                         <span className="text-gray-500">
                           💡 {question.kind === 'missingParam' && 'Be specific - this helps generate better automation'}
                           {question.kind === 'disambiguation' && 'Choose the option that best fits your needs'}
                           {question.kind === 'permission' && 'This affects what permissions are needed'}
                           {question.kind === 'volume' && 'This helps optimize performance'}
                           {!question.kind && 'Please provide details for this question'}
                         </span>
                         <span className={`font-medium ${questionAnswers[question.id] ? 'text-green-400' : 'text-yellow-400'}`}>
                           {questionAnswers[question.id] ? '✅ Answered' : '⏳ Please Answer'}
                         </span>
                       </div>
                     </div>
                     
                     {/* Choice buttons if available */}
                     {question.choices && question.choices.length > 0 && (
                       <div className="space-y-2">
                         <p className="text-xs text-gray-500 mb-2">Quick options (or type custom answer above):</p>
                         <div className="flex flex-wrap gap-2">
                           {question.choices.map((choice) => (
                             <button
                               key={choice}
                               onClick={() => handleAnswerQuestion(question.id, choice)}
                               className={`px-3 py-2 rounded-lg border transition-all text-sm ${
                                 questionAnswers[question.id] === choice
                                   ? 'bg-blue-600 border-blue-500 text-white'
                                   : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-blue-400'
                               }`}
                             >
                               {choice}
                             </button>
                           ))}
                         </div>
                       </div>
                     )}
                   </div>
                </div>
              ))}
              
              <div className="space-y-3">
                <div className="text-xs text-gray-500 text-center">
                  Answered: {Object.keys(questionAnswers).length} / {currentQuestions.length} questions
                </div>
                <Button
                  onClick={handleSubmitAnswers}
                  disabled={Object.keys(questionAnswers).length === 0 || isProcessing}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 p-4 text-base font-semibold"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generating Your Workflow...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Generate Workflow ({Object.keys(questionAnswers).length} answers)
                    </>
                  )}
                </Button>
                {Object.keys(questionAnswers).length === 0 && (
                  <p className="text-xs text-center text-gray-500">
                    Please answer at least one question to continue
                  </p>
                )}
              </div>
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
            <div className="relative">
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
                className="bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 border-2 border-sky-300/80 text-gray-800 placeholder-sky-700/80 resize-none rounded-2xl p-4 shadow-[inset_0_2px_8px_rgba(255,255,255,0.8),0_8px_32px_rgba(14,165,233,0.4),0_4px_16px_rgba(14,165,233,0.3)] ring-2 ring-sky-200/50 focus:border-sky-400 focus:ring-4 focus:ring-sky-300/40 transition-all duration-200"
                rows={2}
              />
            </div>
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!currentInput.trim() || isProcessing}
            className="bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 px-6 rounded-2xl shadow-[inset_0_2px_6px_rgba(255,255,255,0.4),0_8px_24px_rgba(14,165,233,0.5),0_4px_12px_rgba(14,165,233,0.4)] ring-2 ring-sky-300/50 transition-all duration-200 hover:scale-105 hover:shadow-[inset_0_2px_6px_rgba(255,255,255,0.5),0_12px_32px_rgba(14,165,233,0.6),0_6px_16px_rgba(14,165,233,0.5)]"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
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
                    <h4 className="font-medium mb-2">Connections ({workflowResult.workflow.graph.connections.length})</h4>
                    <div className="space-y-1">
                      {workflowResult.workflow.graph.connections.map((connection, index) => (
                        <div key={index} className="text-sm bg-slate-700 p-2 rounded">
                          {connection.source} → {connection.target}
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-white">Code.gs</h4>
                    <Button
                      size="sm"
                      onClick={() => handleCopyCode(workflowResult.code)}
                      className="bg-slate-700 hover:bg-slate-600"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <pre className="bg-slate-900 p-4 rounded text-sm overflow-x-auto text-green-400">
                    <code>{workflowResult.code}</code>
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}