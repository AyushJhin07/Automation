import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PaywallModal } from '@/components/auth/PaywallModal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { 
  Brain, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Mail, 
  Sheet, 
  Calendar, 
  FolderOpen,
  Zap,
  ArrowRight,
  Code2,
  Workflow
} from 'lucide-react';

interface GeneratedWorkflow {
  id: string;
  title: string;
  description: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  appsScriptCode: string;
  estimatedValue: string;
}

interface AIWorkflowBuilderProps {
  initialWorkflow?: GeneratedWorkflow | null;
}

interface WorkflowNode {
  id: string;
  type: string;
  app: string;
  function: string;
  parameters: Record<string, any>;
  position: { x: number; y: number };
  icon: React.ComponentType<any>;
  color: string;
}

interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export const AIWorkflowBuilder: React.FC<AIWorkflowBuilderProps> = ({ initialWorkflow = null }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(initialWorkflow);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPaidUser, setIsPaidUser] = useState(false); // TODO: Replace with real auth check
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [questions, setQuestions] = useState<Array<{ id: string; text: string; type: 'text' | 'choice' | 'number'; choices?: string[]; required?: boolean }>>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'input' | 'questions' | 'ready'>('input');
  const [currentPlan, setCurrentPlan] = useState<any>(null); // Store automation plan
  const [isCheckingDeploySupport, setIsCheckingDeploySupport] = useState(true);
  const [deploySupported, setDeploySupported] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState<{ variant: 'default' | 'destructive'; message: string } | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Load available AI models on component mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch('/api/ai/models');
        if (response.ok) {
          const data = await response.json();
          setAvailableModels(data.models);
        }
      } catch (err) {
        console.log('Could not load AI models, using fallback');
      }
    };
    
    loadModels();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkDeploymentSupport = async () => {
      setIsCheckingDeploySupport(true);
      try {
        const response = await fetch('/api/deployment/prerequisites');
        if (!isMounted) return;

        if (!response.ok) {
          setDeploySupported(false);
          setDeployFeedback({
            variant: 'destructive',
            message: 'Google deployment is unavailable right now. Please try again later.'
          });
          return;
        }

        const payload = await response.json().catch(() => ({ success: false }));
        const prerequisites = payload?.data ?? {};
        const canDeploy = Boolean(
          (payload?.success ?? false) &&
          (typeof prerequisites.valid === 'boolean'
            ? prerequisites.valid
            : typeof prerequisites.canDeploy === 'boolean'
              ? prerequisites.canDeploy
              : true)
        );

        setDeploySupported(canDeploy);
        if (!canDeploy) {
          const issues: string[] = Array.isArray(prerequisites?.issues)
            ? prerequisites.issues
            : [];
          setDeployFeedback({
            variant: 'destructive',
            message: issues.length
              ? `Deployment prerequisites missing: ${issues.join(', ')}`
              : 'Please finish configuring deployment prerequisites before deploying to Google.'
          });
        } else {
          setDeployFeedback(null);
        }
      } catch (error) {
        if (!isMounted) return;
        console.warn('Deployment support check failed', error);
        setDeploySupported(false);
        setDeployFeedback({
          variant: 'destructive',
          message: 'We could not verify deployment support. Manual deployment is recommended for now.'
        });
      } finally {
        if (isMounted) {
          setIsCheckingDeploySupport(false);
        }
      }
    };

    checkDeploymentSupport();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleGenerateWorkflow = async () => {
    if (!prompt.trim()) return;
    
    // Admin mode check (bypass paywall for testing)
    const adminKey = new URLSearchParams(window.location.search).get('admin');
    const isAdmin = adminKey === 'test123' || isAdminMode;
    
    // Check if user is paid (for now, allow 1 free trial)
    const hasUsedTrial = localStorage.getItem('ai-builder-trial-used');
    if (!isPaidUser && hasUsedTrial && !isAdmin) {
      setShowPaywall(true);
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    // Mark trial as used for demo purposes (unless admin)
    if (!isPaidUser && !isAdmin) {
      localStorage.setItem('ai-builder-trial-used', 'true');
    }
    
    try {
      // CRITICAL FIX: Use LLM automation planner instead of static Q&A
      const response = await fetch('/api/ai-planner/plan-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          userId: 'demo-user'
        }),
      });

      if (!response.ok) throw new Error('Failed to plan automation');

      const data = await response.json();
      
      if (data.success) {
        // Store the automation plan
        setCurrentPlan(data.plan);
        
        if (data.isComplete && !data.needsQuestions) {
          // Plan is complete, build directly
          if (data.directBuild) {
            await buildFromAnswers({});
          } else if (data.plan?.workflowGraph) {
            // Use the generated workflow graph
            const compiled = {
              success: true,
              graph: data.plan.workflowGraph,
              plan: data.plan
            };
            localStorage.setItem('lastCompile', JSON.stringify(compiled));
            setStep('ready');
            window.open('/graph-editor?from=ai-builder', '_blank');
          }
          return;
        }
        
        // Set dynamic questions from plan
        const qs = data.questions || data.plan?.missing_inputs || [];
        if (qs.length > 0) {
          setQuestions(qs);
          setStep('questions');
          return;
        }
      }

      // If no questions needed, proceed to build directly
      await buildFromAnswers({});

    } catch (err) {
      console.error('Error generating workflow:', err);
      setError('Failed to generate workflow. Please try again.');
      
      // Fallback to demo workflow for now
      setGeneratedWorkflow(createDemoWorkflow(prompt));
    } finally {
      setIsGenerating(false);
    }
  };

  const buildFromAnswers = async (providedAnswers: Record<string, string>) => {
    try {
      // CRITICAL FIX: Use planning refinement if we have a plan
      if (currentPlan) {
        // Refine the plan with user answers
        const refineResponse = await fetch('/api/ai-planner/refine-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            plan: currentPlan, 
            answers: providedAnswers 
          })
        });

        if (!refineResponse.ok) throw new Error('Plan refinement failed');
        
        const refinementResult = await refineResponse.json();
        
        if (!refinementResult.isComplete) {
          // Still need more information
          if (refinementResult.additionalQuestions) {
            setQuestions(refinementResult.additionalQuestions);
            setCurrentPlan(refinementResult.updatedPlan || currentPlan);
            return; // Stay in questions step
          }
        }

        // Plan is complete, use the workflow graph
        const compiled = {
          success: true,
          graph: refinementResult.workflowGraph,
          code: '', // Will be generated by compiler
          plan: refinementResult.updatedPlan || currentPlan
        };

        localStorage.setItem('lastCompile', JSON.stringify(compiled));
        setStep('ready');
        window.open('/graph-editor?from=ai-builder', '_blank');
        return;
      }

      // Fallback to original build flow if no plan
      const res = await fetch('/api/workflow/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), answers: providedAnswers })
      });
      if (!res.ok) throw new Error('Build failed');
      const compiled = await res.json();
      // Persist for Graph Editor to load
      localStorage.setItem('lastCompile', JSON.stringify(compiled));
      setStep('ready');
      window.open('/graph-editor?from=ai-builder', '_blank');
    } catch (e) {
      console.error('Build error:', e);
      setError('Failed to build workflow. Please check your inputs and try again.');
    }
  };

  const createDemoWorkflow = (userPrompt: string): GeneratedWorkflow => {
    // Demo workflow generation based on prompt keywords
    const isEmailRelated = userPrompt.toLowerCase().includes('email');
    const isReportRelated = userPrompt.toLowerCase().includes('report');
    const isLeadRelated = userPrompt.toLowerCase().includes('lead');

    if (isEmailRelated && isReportRelated) {
      return {
        id: 'email-report-workflow',
        title: 'Email Report Automation',
        description: 'Automatically process emails and generate weekly reports',
        estimatedValue: '$2,400/month time savings',
        nodes: [
          {
            id: 'gmail-1',
            type: 'gmail',
            app: 'Gmail',
            function: 'Search Emails',
            parameters: { query: 'is:unread label:customers', fields: ['from', 'subject', 'body'] },
            position: { x: 100, y: 100 },
            icon: Mail,
            color: '#EA4335'
          },
          {
            id: 'ai-analysis',
            type: 'ai',
            app: 'AI Analysis',
            function: 'Extract Data',
            parameters: { prompt: 'Extract customer name, company, and inquiry type', format: 'structured' },
            position: { x: 300, y: 100 },
            icon: Brain,
            color: '#8B5CF6'
          },
          {
            id: 'sheets-1',
            type: 'sheets',
            app: 'Google Sheets',
            function: 'Append Row',
            parameters: { spreadsheetId: 'auto-create', range: 'A:E', values: 'from AI analysis' },
            position: { x: 500, y: 100 },
            icon: Sheet,
            color: '#0F9D58'
          }
        ],
        connections: [
          { id: 'conn-1', source: 'gmail-1', target: 'ai-analysis' },
          { id: 'conn-2', source: 'ai-analysis', target: 'sheets-1' }
        ],
        appsScriptCode: `
function processCustomerEmails() {
  // Search for unread customer emails
  const threads = GmailApp.search('is:unread label:customers');
  
  // Process each email with AI analysis
  threads.forEach(thread => {
    const message = thread.getMessages()[0];
    const emailData = {
      from: message.getFrom(),
      subject: message.getSubject(),
      body: message.getPlainBody()
    };
    
    // AI analysis would happen here
    const extractedData = analyzeEmailWithAI(emailData);
    
    // Add to spreadsheet
    const sheet = SpreadsheetApp.openById('YOUR_SHEET_ID').getActiveSheet();
    sheet.appendRow([
      new Date(),
      extractedData.customerName,
      extractedData.company,
      extractedData.inquiryType,
      message.getSubject()
    ]);
    
    // Mark as processed
    thread.addLabel(GmailApp.getUserLabelByName('processed'));
  });
}
        `
      };
    }

    // Default workflow for other prompts
    return {
      id: 'basic-workflow',
      title: 'Custom Automation',
      description: 'AI-generated workflow based on your description',
      estimatedValue: '$1,200/month time savings',
      nodes: [
        {
          id: 'trigger',
          type: 'gmail',
          app: 'Gmail',
          function: 'Monitor Emails',
          parameters: { query: 'auto-detected from prompt' },
          position: { x: 100, y: 100 },
          icon: Mail,
          color: '#EA4335'
        },
        {
          id: 'action',
          type: 'sheets',
          app: 'Google Sheets',
          function: 'Process Data',
          parameters: { action: 'auto-configured' },
          position: { x: 300, y: 100 },
          icon: Sheet,
          color: '#0F9D58'
        }
      ],
      connections: [
        { id: 'conn-1', source: 'trigger', target: 'action' }
      ],
      appsScriptCode: `// Generated Google Apps Script code would appear here`
    };
  };

  const handleBuildWorkflow = async () => {
    // If we have questions, require answers; otherwise build immediately
    if (questions.length > 0) {
      await buildFromAnswers(answers);
      return;
    }
    await buildFromAnswers({});
  };

  const handleDeployToGoogle = async () => {
    if (!generatedWorkflow || !deploySupported || isDeploying) return;

    setIsDeploying(true);
    setDeployFeedback(null);

    try {
      const response = await fetch('/api/workflow/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: generatedWorkflow.appsScriptCode ? [
            {
              name: 'Code.gs',
              content: generatedWorkflow.appsScriptCode,
              type: 'gas'
            }
          ] : [],
          options: { projectName: generatedWorkflow.title }
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        const errorMessage = result?.error || `Deployment failed with status ${response.status}.`;
        toast({
          title: 'Deployment failed',
          description: errorMessage,
          variant: 'destructive'
        });
        setDeployFeedback({
          variant: 'destructive',
          message: 'Automatic deployment is unavailable. Please follow the manual deployment instructions below.'
        });
        return;
      }

      toast({
        title: 'Deployment started',
        description: 'Your workflow is being pushed to Google Apps Script.'
      });
      setDeployFeedback({
        variant: 'default',
        message: 'Deployment request sent successfully. Check Google Apps Script for status updates.'
      });
    } catch (err: any) {
      console.error('Deployment failed', err);
      toast({
        title: 'Deployment unavailable',
        description: err?.message || 'We were unable to reach the deployment service.',
        variant: 'destructive'
      });
      setDeploySupported(false);
      setDeployFeedback({
        variant: 'destructive',
        message: 'Automatic deployment is currently unavailable. Please deploy manually using the provided code.'
      });
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Brain className="w-8 h-8 text-purple-600" />
          <h1 className="text-3xl font-bold text-gray-900">AI Workflow Builder</h1>
          <Badge className="bg-purple-600 text-white">BETA</Badge>
        </div>
                 <p className="text-gray-600 max-w-2xl mx-auto">
           Describe your automation in plain English. Our AI supports <strong>500+ applications</strong> and will build the complete workflow and Google Apps Script code for you.
         </p>
         <div className="flex justify-center gap-4 mt-4">
           <Badge className="bg-blue-100 text-blue-800">500+ Apps Supported</Badge>
           <Badge className="bg-green-100 text-green-800">Gemini + Claude + GPT-4</Badge>
           <Badge className="bg-purple-100 text-purple-800">Real Google Apps Script</Badge>
           <button 
             onClick={() => setIsAdminMode(!isAdminMode)}
             className={`px-3 py-1 rounded text-xs ${isAdminMode ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'}`}
           >
             {isAdminMode ? '🔓 Admin Mode ON' : '🔒 Enable Admin Mode'}
           </button>
         </div>
      </div>

      {/* AI Input Section */}
      <Card className="border-2 border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Describe Your Automation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Example: I want to track customer emails, extract key information, and automatically add them to a Google Sheet with follow-up reminders..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[120px] text-lg"
            disabled={isGenerating}
          />
          
          <div className="space-y-3">
            {/* AI Model Selection */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">AI Model:</label>
              <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                disabled={isGenerating}
              >
                <option value="auto">🤖 Auto (Cheapest Available)</option>
                <option value="Gemini Pro">💎 Gemini Pro (Fastest & Cheapest)</option>
                <option value="Claude 3 Haiku">🧠 Claude Haiku (Most Accurate)</option>
                <option value="GPT-4o Mini">⚡ GPT-4o Mini (Balanced)</option>
                <option value="Local Fallback">🏠 Local Analysis (Free)</option>
              </select>
              <Badge className="bg-green-100 text-green-800 text-xs">
                Cost: ~$0.001 per request
              </Badge>
            </div>
            
            <Button 
              onClick={handleGenerateWorkflow}
              disabled={!prompt.trim() || isGenerating}
              className="bg-purple-600 hover:bg-purple-700 w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  AI Generating Workflow...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Generate Workflow with AI
                </>
              )}
            </Button>
          </div>

                     {/* Example Prompts */}
           <div className="flex flex-wrap gap-2">
             <span className="text-sm text-gray-500">Try these examples:</span>
             {[
               "Add Salesforce leads to Mailchimp when HubSpot deals close",
               "Create Trello cards from Slack messages and notify via Teams",
               "Sync Shopify orders to QuickBooks and send Stripe receipts",
               "Post GitHub commits to Discord and update Asana tasks",
               "Track Zendesk tickets in Google Sheets and calendar follow-ups"
             ].map((example, index) => (
              <button
                key={index}
                onClick={() => setPrompt(example)}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full transition-colors"
                disabled={isGenerating}
              >
                {example}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Follow-up Questions */}
      {step === 'questions' && questions.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              A few quick details to build the perfect workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  {q.text}{q.required ? ' *' : ''}
                </label>
                {q.type === 'choice' ? (
                  <select
                    className="px-3 py-2 border rounded w-full"
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    {(q.choices || []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Type your answer"
                  />
                )}
              </div>
            ))}

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setStep('input')}
              >
                Back
              </Button>
              <Button
                onClick={async () => {
                  // simple required validation
                  const missing = questions.filter(q => q.required && !answers[q.id]);
                  if (missing.length > 0) {
                    setError('Please fill required fields.');
                    return;
                  }
                  await buildFromAnswers(answers);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Build Workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Workflow Display */}
      {generatedWorkflow && (
        <div className="space-y-6">
          {/* Workflow Overview */}
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="w-5 h-5" />
                Workflow Generated Successfully!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h3 className="font-semibold text-lg mb-2">{generatedWorkflow.title}</h3>
              <p className="text-gray-600 mb-4">{generatedWorkflow.description}</p>
                             <div className="flex gap-2 flex-wrap">
                 <Badge className="bg-green-600 text-white">
                   {generatedWorkflow.nodes.length} Steps
                 </Badge>
                 <Badge className="bg-blue-600 text-white">
                   {generatedWorkflow.estimatedValue}
                 </Badge>
                 {(generatedWorkflow as any).aiAnalysis && (
                   <Badge className="bg-purple-600 text-white">
                     {(generatedWorkflow as any).aiAnalysis.modelUsed}
                   </Badge>
                 )}
                 {(generatedWorkflow as any).aiAnalysis && (
                   <Badge className="bg-gray-600 text-white">
                     {((generatedWorkflow as any).aiAnalysis.confidence * 100).toFixed(0)}% Confidence
                   </Badge>
                 )}
               </div>
            </CardContent>
          </Card>

                     {/* Professional Workflow Preview */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <Workflow className="w-5 h-5 text-blue-600" />
                 Generated Workflow Preview
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="relative h-80 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border border-blue-200 overflow-hidden">
                 {/* Professional Node Layout */}
                 {generatedWorkflow.nodes.map((node, index) => {
                   const x = 80 + (index % 3) * 200;
                   const y = 60 + Math.floor(index / 3) * 120;
                   
                   return (
                     <div
                       key={node.id}
                       className="absolute animate-fade-in"
                       style={{
                         left: `${x}px`,
                         top: `${y}px`,
                         animationDelay: `${index * 0.2}s`
                       }}
                     >
                       {/* Professional Node Design */}
                       <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-4 w-40 hover:shadow-xl transition-all">
                         <div className="flex items-center gap-2 mb-2">
                           <div 
                             className="w-8 h-8 rounded-lg flex items-center justify-center"
                             style={{ backgroundColor: node.color }}
                           >
                             <node.icon className="w-5 h-5 text-white" />
                           </div>
                           <div className="flex-1">
                             <div className="font-medium text-sm text-gray-900">{node.app}</div>
                             <div className="text-xs text-gray-500">{node.type}</div>
                           </div>
                         </div>
                         
                         <Badge 
                           className="w-full text-xs text-white"
                           style={{ backgroundColor: node.color }}
                         >
                           {node.function}
                         </Badge>
                         
                         {/* Connection Points */}
                         <div className="absolute -right-2 top-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg transform -translate-y-1/2"></div>
                         {index > 0 && (
                           <div className="absolute -left-2 top-1/2 w-4 h-4 bg-gray-400 rounded-full border-2 border-white shadow-lg transform -translate-y-1/2"></div>
                         )}
                       </div>
                     </div>
                   );
                 })}

                 {/* Professional Connection Lines */}
                 <svg className="absolute inset-0 w-full h-full pointer-events-none">
                   <defs>
                     <marker id="professionalArrow" markerWidth="10" markerHeight="8" 
                       refX="9" refY="4" orient="auto">
                       <polygon points="0 0, 10 4, 0 8" fill="#3B82F6" />
                     </marker>
                   </defs>
                   {generatedWorkflow.connections.map((conn, index) => {
                     const sourceIndex = generatedWorkflow.nodes.findIndex(n => n.id === conn.source);
                     const targetIndex = generatedWorkflow.nodes.findIndex(n => n.id === conn.target);
                     
                     if (sourceIndex === -1 || targetIndex === -1) return null;
                     
                     const sourceX = 80 + (sourceIndex % 3) * 200 + 160; // Right edge of source node
                     const sourceY = 60 + Math.floor(sourceIndex / 3) * 120 + 40; // Center of source node
                     const targetX = 80 + (targetIndex % 3) * 200; // Left edge of target node  
                     const targetY = 60 + Math.floor(targetIndex / 3) * 120 + 40; // Center of target node
                     
                     return (
                       <g key={conn.id}>
                         <line
                           x1={sourceX}
                           y1={sourceY}
                           x2={targetX}
                           y2={targetY}
                           stroke="#3B82F6"
                           strokeWidth="3"
                           markerEnd="url(#professionalArrow)"
                           className="animate-pulse"
                           strokeDasharray="0"
                         />
                         {/* Data Flow Animation */}
                         <circle
                           r="4"
                           fill="#3B82F6"
                           className="animate-pulse"
                         >
                           <animateMotion
                             dur="2s"
                             repeatCount="indefinite"
                             path={`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`}
                           />
                         </circle>
                       </g>
                     );
                   })}
                 </svg>

                 {/* Workflow Stats */}
                 <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 border">
                   <div className="text-xs text-gray-600 space-y-1">
                     <div>📊 {generatedWorkflow.nodes.length} Apps Connected</div>
                     <div>⚡ {generatedWorkflow.connections.length} Data Flows</div>
                     <div>🎯 {generatedWorkflow.complexity} Complexity</div>
                   </div>
                 </div>
               </div>
             </CardContent>
           </Card>

          {/* Generated Google Apps Script Code */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="w-5 h-5" />
                Generated Google Apps Script Code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto font-mono">
                {generatedWorkflow.appsScriptCode}
              </pre>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col items-center gap-4">
            {deployFeedback && (
              <Alert
                className="max-w-xl"
                variant={deployFeedback.variant}
                data-testid="deploy-feedback"
              >
                <AlertDescription>{deployFeedback.message}</AlertDescription>
              </Alert>
            )}
            {!deployFeedback && !deploySupported && !isCheckingDeploySupport && (
              <Alert className="max-w-xl" variant="destructive" data-testid="deploy-unavailable">
                <AlertDescription>
                  Automatic deployment is currently unavailable. You can still copy the generated code and deploy manually.
                </AlertDescription>
              </Alert>
            )}
            {isCheckingDeploySupport && (
              <Alert className="max-w-xl" data-testid="deploy-checking">
                <AlertDescription>
                  Checking deployment prerequisites…
                </AlertDescription>
              </Alert>
            )}
            <div className="flex gap-4 justify-center">
              <Button
                onClick={handleBuildWorkflow}
                className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-3"
              >
                <Zap className="w-4 h-4 mr-2" />
                Open in Drag & Drop Builder
              </Button>

              <Button
                onClick={handleDeployToGoogle}
              className="bg-green-600 hover:bg-green-700 text-lg px-8 py-3"
              disabled={!deploySupported || isCheckingDeploySupport || isDeploying}
              data-testid="deploy-button"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Deploy to Google Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Value Proposition */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-8 text-center">
          <h3 className="text-2xl font-semibold mb-4">
            Why Choose Our AI-Enhanced Builder?
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">50x</div>
              <div className="text-sm text-gray-600">Cheaper than AI agents</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">10x</div>
              <div className="text-sm text-gray-600">Faster than manual building</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">100%</div>
              <div className="text-sm text-gray-600">Control over your automations</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paywall Modal */}
      <PaywallModal 
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="AI Workflow Builder"
      />
    </div>
  );
};
