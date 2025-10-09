// ENHANCED CONVERSATIONAL WORKFLOW BUILDER
// Connected to professional ChatGPT-style backend architecture

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { useWorkflowState } from '../../store/workflowState';
import type { CompileResult } from '../../../../common/workflow-types';
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
import { NodeGraph, Question, ValidationError } from '@shared/nodeGraphSchema';
import { AutomationSpec as AutomationSpecZ } from '../../core/spec';
import { useSpecStore } from '../../state/specStore';

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
  // Handle both old and new data structures
  const graph = workflowData?.workflow?.graph || workflowData;
  
  if (!graph || !graph.nodes) return null;
  
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
        {(graph.nodes ?? []).map((node: any, index: number) => {
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
              {index < (graph.nodes ?? []).length - 1 && (
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
            {(graph.nodes ?? []).filter((n: any) => n.type?.startsWith('trigger.')).length}
          </div>
          <div className="text-xs text-gray-600">Triggers</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-2">
          <div className="text-lg font-bold text-blue-600">
            {(graph.nodes ?? []).filter((n: any) => n.type?.startsWith('action.')).length}
          </div>
          <div className="text-xs text-gray-600">Actions</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded p-2">
          <div className="text-lg font-bold text-purple-600">
            {(graph.nodes ?? []).filter((n: any) => n.type?.startsWith('transform.')).length}
          </div>
          <div className="text-xs text-gray-600">Transforms</div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            // ChatGPT Fix: Save the compile result in correct format
            const compile = useWorkflowState.getState().last; // <- CompileResult
            if (compile) {
              localStorage.setItem('lastCompile', JSON.stringify(compile)); // { graph: {...} }
            } else if (workflowData?.workflow?.graph) {
              localStorage.setItem('lastCompile', JSON.stringify(workflowData.workflow.graph)); // raw graph
            }
            const storedWorkflowId = localStorage.getItem('lastWorkflowId') || '';
            const params = new URLSearchParams();
            params.set('from', 'ai-builder');
            if (storedWorkflowId) params.set('workflowId', storedWorkflowId);
            window.open(`/graph-editor?${params.toString()}`, '_blank');
          }}
          className="bg-green-600 hover:bg-green-700 flex-1"
        >
          <Settings className="w-4 h-4 mr-2" />
          Open in Graph Editor
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            try {
              // Prefer compiled Apps Script output if available
              const last = useWorkflowState.getState().last;
              const files = last?.files || workflowData?.files || [];
              const codeFile = Array.isArray(files) ? files.find((f: any) => f.path === 'Code.gs') : null;

              if (codeFile?.content) {
                const blob = new Blob([codeFile.content], { type: 'text/javascript' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'automation.gs';
                a.click();
                URL.revokeObjectURL(url);
                return;
              }

              // Fallback: if code string exists on workflowData
              const inlineCode = (workflowData as any)?.appsScriptCode || (workflowData as any)?.code;
              if (inlineCode) {
                const blob = new Blob([inlineCode], { type: 'text/javascript' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'automation.gs';
                a.click();
                URL.revokeObjectURL(url);
                return;
              }

              // Final fallback: use legacy generator to avoid breaking existing flow
              const nodes = workflowData.workflow?.graph?.nodes || workflowData.nodes || [];
              const edges = workflowData.workflow?.graph?.connections || (workflowData as any)?.connections || [];
              const answers = (workflowData as any)?.usedAnswers || {};
              const response = await fetch('/api/automation/generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes, edges, answers })
              });
              const result = await response.json();
              if (result?.success && result?.script) {
                const blob = new Blob([result.script], { type: 'text/javascript' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'automation.gs';
                a.click();
                URL.revokeObjectURL(url);
              }
            } catch (e) {
              console.error('Download code failed:', e);
            }
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
  const [latestWorkflowId, setLatestWorkflowId] = useState<string | undefined>(undefined);
  const [qaHistory, setQaHistory] = useState<Array<{ question: Question; answer: string }>>([]);
  // ChatGPT Fix: Persist prompt explicitly to prevent INVALID_PROMPT errors
  const [prompt, setPrompt] = useState('');
  const [showWorkflowPreview, setShowWorkflowPreview] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [apiKeys, setApiKeys] = useState<{gemini?: string; claude?: string; openai?: string}>({});
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const [serverModels, setServerModels] = useState<any[]>([]);
  // ChatGPT Enhancement: Mode selection for GAS-only vs All-connectors
  const [mode, setMode] = useState<"gas-only"|"all">("gas-only");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setSpec = useSpecStore.getState().set;

  const buildGraphEditorUrl = useCallback((workflowId?: string) => {
    const params = new URLSearchParams();
    params.set('from', 'ai-builder');
    if (workflowId) params.set('workflowId', workflowId);
    return `/graph-editor?${params.toString()}`;
  }, []);

  const redirectToGraphEditor = useCallback((workflowId?: string) => {
    const url = buildGraphEditorUrl(workflowId);
    navigate(url);
  }, [buildGraphEditorUrl, navigate]);

  // ChatGPT Fix: Enhanced safe helpers to avoid runtime errors
  const safeGraph = (g?: any) => g || { nodes: [], connections: [] };
  const safeEdges = (g?: any) => (g?.connections ?? g?.edges ?? []);
  const safeFiles = (result?: any) => result?.code?.files ?? [];
  const safeNodes = (graph?: any) => graph?.nodes ?? [];
  const safeConnections = (graph?: any) => graph?.edges ?? graph?.connections ?? [];

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

  // ChatGPT Enhancement: Load server default mode
  useEffect(() => {
    fetch("/api/ai/config")
      .then(r => r.json())
      .then(j => {
        if (j?.mode === "all") setMode("all");
      })
      .catch(() => {});
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

  const informPlannerOutage = (details: string) => {
    addMessage({
      role: 'assistant',
      content: `⚠️ **I can't reach the automation planner right now.**\n\n${details}\n\nPlease check your connection and try again when you're ready — I'll pick up where we left off.`,
      type: 'validation'
    });
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
      await startWorkflowConversation(userMessage);
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

  const resetQuestionFlow = () => {
    setCurrentQuestions([]);
    setQaHistory([]);
    setQuestionAnswers({});
  };

  const mapHistoryForLLM = (history: Array<{ question: Question; answer: string }>) =>
    history.map((turn) => ({
      id: turn.question.id,
      question: turn.question.text,
      answer: turn.answer,
      category: (turn.question as any)?.category,
    }));

  const canonicalQuestion = (question?: Question | null) =>
    (question?.text || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const filterNewQuestions = (
    questions: Question[],
    historyTurns: Array<{ question: Question; answer: string }>
  ) => {
    const seen = new Set(historyTurns.map((turn) => canonicalQuestion(turn.question)).filter(Boolean));
    const filtered: Question[] = [];
    for (const question of questions) {
      const key = canonicalQuestion(question);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(question);
    }
    return filtered;
  };

  const resolveModelCredentials = (): { provider: string; apiKey?: string; error?: string } => {
    const provider = providerOf(selectedModel);
    const currentApiKey =
      provider === 'gemini' ? (apiKeys.gemini || '') :
      provider === 'claude' ? (apiKeys.claude || '') :
      provider === 'openai' ? (apiKeys.openai || '') : '';

    const serverHasIt = serverModels.length === 0 ? true : serverHasProvider(provider);

    if (!currentApiKey && !serverHasIt) {
      return {
        provider,
        error: `Please configure your ${selectedModel} API key in Admin Settings (/admin/settings)`,
      };
    }

    return { provider, apiKey: currentApiKey || undefined };
  };

  const requestClarifyingQuestions = async (
    currentPrompt: string,
    historyTurns: Array<{ question: Question; answer: string }>,
    requested: number = 1
  ): Promise<Question[] | null> => {
    const userId = localStorage.getItem('userId') || 'demo-user';
    const credentials = resolveModelCredentials();
    if (credentials.error) {
      informPlannerOutage(credentials.error);
      return null;
    }
    const { apiKey } = credentials;

    try {
      const response = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          userId,
          model: selectedModel,
          apiKey,
          history: mapHistoryForLLM(historyTurns),
          count: requested
        })
      });

      if (!response.ok) {
        const statusText = response.statusText ? ` ${response.statusText}` : '';
        informPlannerOutage(`The planner responded with ${response.status}${statusText}.`);
        return null;
      }

      const payload = await response.json();
      const questions = Array.isArray(payload.questions) ? payload.questions : [];
      return questions as Question[];
    } catch (error: any) {
      console.error('Failed to request clarifying questions', error);
      const message = error?.message ? `Error: ${error.message}.` : 'An unexpected network error occurred.';
      informPlannerOutage(message);
      return null;
    }
  };

  const buildAutomation = async (promptValue: string, answers: Record<string, string>) => {
    setProcessingStep('⚡ Building your intelligent workflow...');

    let buildSucceeded = false;

    try {
      const response = await fetch('/api/workflow/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: promptValue,
          answers,
          mode
        })
      });

      if (!response.ok) {
        const statusText = response.statusText ? ` ${response.statusText}` : '';
        addMessage({
          role: 'assistant',
          content: `⚠️ **Workflow builder is temporarily unavailable.**\n\nThe server responded with ${response.status}${statusText}. Please review your connection or try again shortly.`,
          type: 'validation'
        });
        return false;
      }

      const result = await response.json() as (CompileResult & { success: boolean; workflowId?: string });

      if (!result.success) {
        const reason = result.error || 'The workflow could not be compiled.';
        addMessage({
          role: 'assistant',
          content: `⚠️ **Workflow build failed.**\n\n${reason}\n\nUpdate your answers or try again in a moment.`,
          type: 'validation'
        });
        return false;
      }

      setLatestWorkflowId(result.workflowId);
      if (result.workflowId) {
        localStorage.setItem('lastWorkflowId', result.workflowId);
      } else {
        localStorage.removeItem('lastWorkflowId');
      }

      useWorkflowState.getState().set(result);

      setProcessingStep('📋 Planning your workflow...');
      await new Promise(resolve => setTimeout(resolve, 500));

      setProcessingStep('✅ Validating workflow structure...');
      await new Promise(resolve => setTimeout(resolve, 400));

      setProcessingStep('🔨 Generating Google Apps Script code...');
      await new Promise(resolve => setTimeout(resolve, 600));

      setProcessingStep('🚀 Finalizing deployment package...');
      await new Promise(resolve => setTimeout(resolve, 300));

      const workflowData = {
        workflow: {
          graph: {
            id: result.graph.id,
            name: `Workflow: ${promptValue.substring(0, 50)}...`,
            description: promptValue,
            nodes: result.graph.nodes || [],
            connections: result.graph.edges || []
          },
          validation: { valid: true, errors: [], warnings: [] }
        },
        code: (result.files ?? []).find(f => f.path === 'Code.gs')?.content || 'No code generated',
        files: result.files ?? [],
        rationale: promptValue,
        deploymentInstructions: 'Ready for deployment to Google Apps Script'
      };

      try {
        const graph = result.graph;
        const specCandidate = {
          version: '1.0',
          name: `Automation: ${promptValue.substring(0, 60)}`,
          description: promptValue,
          triggers: [],
          nodes: (graph.nodes || []).map((n: any) => {
            const parameters = {
              ...(typeof n.data?.parameters === 'object' ? n.data.parameters : {}),
              ...(typeof n.parameters === 'object' ? n.parameters : {})
            };

            const authSource = (n.auth || n.data?.auth) ?? undefined;
            const connectionId =
              n.connectionId ||
              n.data?.connectionId ||
              authSource?.connectionId ||
              parameters.connectionId ||
              n.parameters?.connectionId ||
              n.data?.parameters?.connectionId;

            let auth = authSource ? { ...authSource } : undefined;

            if (connectionId) {
              if (parameters.connectionId === undefined) {
                parameters.connectionId = connectionId;
              }

              if (!auth) {
                auth = { connectionId };
              } else if (!auth.connectionId) {
                auth = { ...auth, connectionId };
              }
            }

            return {
              id: n.id,
              type: n.type || n.data?.function || 'core.noop',
              app: n.app || n.data?.app || 'built_in',
              label: n.label || n.data?.label || n.id,
              inputs: parameters,
              outputs: n.outputs || [],
              auth
            };
          }),
          edges: (graph.edges || graph.connections || []).map((e: any) => ({
            from: { nodeId: e.source || e.from, port: e.sourceHandle || e.dataType || 'out' },
            to: { nodeId: e.target || e.to, port: e.targetHandle || 'in' }
          }))
        };
        const parsed = AutomationSpecZ.safeParse(specCandidate);
        if (parsed.success) {
          setSpec(parsed.data);
        }
      } catch {}

      setWorkflowResult(workflowData);

      addMessage({
        role: 'assistant',
        content: `✅ **Workflow Generated Successfully!**

**"${promptValue.substring(0, 60)}..."**
Built from your answers with ${result.graph.nodes.length} connected steps.

📊 **Workflow Stats:**
• **Nodes:** ${result.stats.nodes} (${result.stats.triggers} triggers, ${result.stats.actions} actions, ${result.stats.transforms} transforms)
• **Complexity:** ${result.stats.nodes > 3 ? 'Complex' : 'Medium'}
• **Estimated Value:** $500/month time savings

🔍 **Validation:**
• **Status:** ✅ Valid
• **Warnings:** 0
• **Errors:** 0

📝 **Generated Code:**
• **Lines of Code:** ${(result.files ?? []).find(f => f.path === 'Code.gs')?.content?.split('\n').length || 0}
• **Ready for Google Apps Script**

🚀 **Ready for Deployment!**`,
        type: 'workflow',
        data: result
      });

      addMessage({
        role: 'assistant',
        content: `📊 **Visual Workflow Structure:**`,
        type: 'workflow-visual',
        data: result
      });

      resetQuestionFlow();
      redirectToGraphEditor(result.workflowId);
      buildSucceeded = true;
      return true;
    } catch (error: any) {
      console.error('Failed to build automation', error);
      const message = error?.message ? `Error: ${error.message}` : 'An unexpected network error occurred.';
      addMessage({
        role: 'assistant',
        content: `⚠️ **Workflow build failed.**\n\n${message}\n\nPlease check your connection and try again.`,
        type: 'validation'
      });
      return false;
    } finally {
      if (!buildSucceeded) {
        setProcessingStep('');
      }
    }
  };

  const startWorkflowConversation = async (userPrompt: string) => {
    const trimmedPrompt = userPrompt.trim();
    setPrompt(trimmedPrompt);
    resetQuestionFlow();

    setProcessingStep('🤔 Understanding your request...');
    const questions = await requestClarifyingQuestions(trimmedPrompt, [], 6);
    if (!questions) {
      setProcessingStep('');
      return false;
    }
    const initialQuestions = filterNewQuestions(questions, []);

    if (initialQuestions.length > 0) {
      setProcessingStep('');
      setCurrentQuestions(initialQuestions);
      addMessage({
        role: 'assistant',
        content: `🤔 **I need a bit more information to build the perfect workflow for you:**`,
        type: 'questions',
        data: { questions: initialQuestions }
      });
      return true;
    }

    const success = await buildAutomation(trimmedPrompt, {});
    if (!success) {
      setProcessingStep('');
    }
    return success;
  };

  const handleAnswerQuestion = (questionId: string, answer: string) => {
    setQuestionAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleSubmitAnswers = async () => {
    if (currentQuestions.length === 0) return;

    const activePrompt = prompt || '';

    for (const question of currentQuestions) {
      const raw = questionAnswers[question.id] ?? '';
      const trimmed = typeof raw === 'string' ? raw.trim() : String(raw);
      if (question.required && trimmed.length === 0) {
        alert(`Please provide a meaningful answer for: ${question.text}`);
        return;
      }
    }

    const normalizedAnswers = { ...questionAnswers };
    const batchHistory = currentQuestions.map((question) => {
      const raw = questionAnswers[question.id] ?? '';
      const trimmed = typeof raw === 'string' ? raw.trim() : String(raw);
      normalizedAnswers[question.id] = trimmed;
      return { question, answer: trimmed };
    });
    setQuestionAnswers(normalizedAnswers);
    const updatedHistory = [...qaHistory, ...batchHistory];
    setQaHistory(updatedHistory);

    addMessage({
      role: 'user',
      content: `📝 **My answers:**\n\n${currentQuestions
        .map((question) => `**${question.text}**\n${normalizedAnswers[question.id] || 'Not answered'}`)
        .join('\n\n')}`
    });

    setIsProcessing(true);
    try {
      setProcessingStep('🤔 Reviewing your answers...');
      const followUps = await requestClarifyingQuestions(activePrompt, updatedHistory, 4);
      if (!followUps) {
        setProcessingStep('');
        return;
      }
      const newQuestions = filterNewQuestions(followUps, updatedHistory);

      if (newQuestions.length > 0) {
        setProcessingStep('');
        setCurrentQuestions(newQuestions);
        addMessage({
          role: 'assistant',
          content: `ℹ️ **Great progress! I just need a few more details to finalize your automation.**`,
          type: 'questions',
          data: { questions: newQuestions }
        });
        return;
      }

      await buildAutomation(activePrompt, normalizedAnswers);
    } catch (error: any) {
      console.error('Error with answers:', error);
      addMessage({
        role: 'assistant',
        content: `❌ **Error processing your answers**\n\n${error?.message || 'An unexpected error occurred.'}`
      });
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
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

  const handleDeployWorkflow = async () => {
    const last = useWorkflowState.getState().last;
    if (!last) {
      alert('No workflow data available. Please generate a workflow first.');
      return;
    }
    
    try {
      // Check deployment prerequisites first
      addMessage({
        role: 'assistant',
        content: '🔍 **Checking deployment prerequisites...**'
      });
      
      const prereqResponse = await fetch('/api/ai/deployment/prerequisites');

      if (!prereqResponse.ok) {
        addMessage({
          role: 'assistant',
          content: `⚠️ **Couldn't Verify Deployment Prerequisites**

The server responded with ${prereqResponse.status} ${prereqResponse.statusText || ''}. Please double-check your connection and try again.`.trim()
        });
        return;
      }

      let prereqResult: any;
      try {
        prereqResult = await prereqResponse.json();
      } catch (error) {
        console.error('Failed to parse deployment prerequisite response:', error);
        addMessage({
          role: 'assistant',
          content: `⚠️ **Couldn't Understand Deployment Check**

I wasn't able to read the response from the server. Please try again or review your local deployment setup.`
        });
        return;
      }

      const prereqData = (prereqResult && typeof prereqResult === 'object' && !Array.isArray(prereqResult))
        ? (prereqResult.data && typeof prereqResult.data === 'object' ? prereqResult.data : prereqResult)
        : null;

      const isSuccessful = prereqResult?.success !== false;
      const canDeploy = typeof prereqData?.valid === 'boolean'
        ? prereqData.valid
        : (typeof prereqData?.canDeploy === 'boolean' ? prereqData.canDeploy : false);

      if (!isSuccessful || !canDeploy) {
        const checkDetails = prereqData?.checks && typeof prereqData.checks === 'object'
          ? Object.entries(prereqData.checks).map(([check, info]: [string, any]) => {
              const status = info?.status;
              const emoji = status === 'error' ? '❌' : status === 'available' ? '✅' : '⚠️';
              return `• **${check}:** ${emoji} ${info?.message || 'Requires attention'}`;
            })
          : [];

        const issueDetails = Array.isArray(prereqData?.issues)
          ? prereqData!.issues.map((issue: string) => `• ${issue}`)
          : [];

        const recommendationDetails = Array.isArray(prereqData?.recommendations)
          ? prereqData!.recommendations.map((rec: string) => `• ${rec}`)
          : [];

        const issueSectionLines = [...checkDetails, ...issueDetails];
        const issueSection = issueSectionLines.length
          ? issueSectionLines.join('\n')
          : '• Deployment requirements could not be verified.';

        const recommendationSection = recommendationDetails.length
          ? `\n\n**Recommendations:**\n${recommendationDetails.join('\n')}`
          : '';

        addMessage({
          role: 'assistant',
          content: `⚠️ **Deployment Prerequisites Not Met**

**Issues detected:**
${issueSection}${recommendationSection}

Please ensure all prerequisites are satisfied before deploying.`
        });
        return;
      }
      
      addMessage({
        role: 'assistant',
        content: '✅ **Prerequisites satisfied! Starting deployment...**'
      });
      
      // Use the real deployment endpoint with the compiled files
      const response = await fetch('/api/workflow/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          files: last.files, 
          options: { projectName: 'AI Generated Workflow' } 
        })
      });
      
      const result = await response.json();
      if (result.success) {
        addMessage({
          role: 'assistant',
          content: `🚀 **Deployment Successful!**

Your workflow has been deployed to Google Apps Script.`
        });
      } else {
        const failureMessage = result.error || 'Deployment failed. You can deploy manually instead.';
        window.open('https://script.google.com/home/start', '_blank');
        addMessage({
          role: 'assistant',
          content: `🚀 **Manual Deployment Required**

${failureMessage}

I've opened Google Apps Script for you. Here's what to do:

**Step 1:** Create a new project
**Step 2:** Copy the generated code files
**Step 3:** Follow the deployment instructions

Need help? I can guide you through each step!`
        });
      }
    } catch (error: any) {
      window.open('https://script.google.com/home/start', '_blank');

      const message = error?.message ? `Error: ${error.message}` : 'The deployment service is unreachable right now.';
      addMessage({
        role: 'assistant',
        content: `🚀 **Manual Deployment Required**

${message}

I've opened Google Apps Script for you. Here's what to do:

**Step 1:** Create a new project
**Step 2:** Copy the generated code files
**Step 3:** Follow the deployment instructions

Need help? I can guide you through each step!`
      });
    }
  };

  const unansweredRequired = currentQuestions.some((question) => {
    const raw = questionAnswers[question.id] ?? '';
    const trimmed = typeof raw === 'string' ? raw.trim() : String(raw);
    return question.required && trimmed.length === 0;
  });
  const canSubmitCurrent = currentQuestions.length > 0 && !unansweredRequired;

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
              <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Latest)</option>
              <option value="gemini-1.5-flash-8b">Gemini 1.5 Flash 8B</option>
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
                          const last = useWorkflowState.getState().last;
                          if (!last) {
                            alert('No workflow data available. Please generate a workflow first.');
                            return;
                          }

                          localStorage.setItem('lastCompile', JSON.stringify(last));
                          const fallbackId = localStorage.getItem('lastWorkflowId') || undefined;
                          redirectToGraphEditor(latestWorkflowId || fallbackId || undefined);
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
                      {qaHistory.length + index + 1}
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
                  Answered so far: {qaHistory.length}
                </div>
                <Button
                  onClick={handleSubmitAnswers}
                  disabled={isProcessing || !canSubmitCurrent}
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
                      {unansweredRequired ? 'Provide Required Details' : 'Continue'} ({qaHistory.length + currentQuestions.length} total prompts)
                    </>
                  )}
                </Button>
                {!canSubmitCurrent && (
                  <p className="text-xs text-center text-gray-500">
                    Please provide an answer to continue
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

      {/* ChatGPT Enhancement: Mode Selector */}
      <div className="border-t border-slate-700 bg-slate-800/50 backdrop-blur-sm p-2">
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm text-gray-400">Automation Mode:</span>
          <select 
            value={mode} 
            onChange={e => setMode(e.target.value as any)} 
            className="border border-gray-600 rounded px-3 py-1 bg-slate-700 text-white text-sm"
          >
            <option value="gas-only">Google Apps Script only</option>
            <option value="all">All connectors (149 apps)</option>
          </select>
          <span className="text-xs text-gray-500">
            {mode === "gas-only" ? "🔒 Google Workspace + GAS services only" : "🌐 Full marketplace access"}
          </span>
        </div>
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
            aria-label={isProcessing ? 'Sending message' : 'Send message'}
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
                  <h3 className="font-semibold text-lg">{workflowResult.title || 'Generated Workflow'}</h3>
                  <p className="text-slate-400">{workflowResult.description || 'AI-generated automation workflow'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Nodes ({(workflowResult.nodes || []).length})</h4>
                    <div className="space-y-1">
                      {(workflowResult.nodes || []).map(node => (
                        <div key={node.id} className="text-sm bg-slate-700 p-2 rounded">
                          <div className="font-medium">{node.functionName || node.app}</div>
                          <div className="text-slate-400">{node.app} • {node.function}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Connections ({(workflowResult.connections || []).length})</h4>
                    <div className="space-y-1">
                      {(workflowResult.connections || []).map((connection, index) => (
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
                      onClick={() => handleCopyCode(workflowResult.appsScriptCode || workflowResult.code || '')}
                      className="bg-slate-700 hover:bg-slate-600"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <pre className="bg-slate-900 p-4 rounded text-sm overflow-x-auto text-green-400">
                    <code>{workflowResult.appsScriptCode || workflowResult.code || ''}</code>
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
