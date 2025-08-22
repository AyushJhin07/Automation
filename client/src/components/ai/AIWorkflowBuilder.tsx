import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
  Code2
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

export const AIWorkflowBuilder: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('auto');

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

  const handleGenerateWorkflow = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      // Call our backend API to generate workflow
      const response = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          userId: 'demo-user', // TODO: Replace with real user ID
          preferredModel: selectedModel !== 'auto' ? selectedModel : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate workflow');
      }

      const workflow = await response.json();
      setGeneratedWorkflow(workflow);
      
    } catch (err) {
      console.error('Error generating workflow:', err);
      setError('Failed to generate workflow. Please try again.');
      
      // Fallback to demo workflow for now
      setGeneratedWorkflow(createDemoWorkflow(prompt));
    } finally {
      setIsGenerating(false);
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

  const handleBuildWorkflow = () => {
    if (generatedWorkflow) {
      // Store the generated workflow in localStorage for the builder to pick up
      localStorage.setItem('ai-generated-workflow', JSON.stringify(generatedWorkflow));
      
      // Navigate to the drag-and-drop builder
      window.open('/pre-built-apps', '_blank');
    }
  };

  const handleDeployToGoogle = async () => {
    if (!generatedWorkflow) return;
    
    try {
      // TODO: Deploy to user's Google Apps Script
      const response = await fetch('/api/google/deploy-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: generatedWorkflow,
          userId: 'demo-user'
        })
      });
      
      if (response.ok) {
        alert('Automation deployed to your Google account!');
      }
    } catch (err) {
      alert('Deployment feature coming soon!');
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
          Describe your automation in plain English. Our AI will build the complete workflow and Google Apps Script code for you.
        </p>
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
              "Track customer emails and create reports",
              "Send follow-ups to leads who don't respond",
              "Organize project files automatically"
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

          {/* Visual Workflow Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden">
                {/* Render generated nodes */}
                {generatedWorkflow.nodes.map((node, index) => (
                  <div
                    key={node.id}
                    className="absolute"
                    style={{
                      left: `${node.position.x}px`,
                      top: `${node.position.y}px`,
                    }}
                  >
                    <div 
                      className="w-24 h-24 rounded-xl flex flex-col items-center justify-center shadow-lg"
                      style={{ 
                        backgroundColor: node.color,
                        boxShadow: `0 8px 20px ${node.color}30`
                      }}
                    >
                      <node.icon className="w-6 h-6 text-white mb-1" />
                      <span className="text-xs text-white font-medium text-center">
                        {node.app}
                      </span>
                    </div>
                    <Badge 
                      className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs"
                      style={{ backgroundColor: node.color }}
                    >
                      {node.function}
                    </Badge>
                  </div>
                ))}

                {/* Render connections */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <defs>
                    <marker id="workflowArrow" markerWidth="8" markerHeight="6" 
                      refX="7" refY="3" orient="auto">
                      <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
                    </marker>
                  </defs>
                  {generatedWorkflow.connections.map((conn, index) => {
                    const sourceNode = generatedWorkflow.nodes.find(n => n.id === conn.source);
                    const targetNode = generatedWorkflow.nodes.find(n => n.id === conn.target);
                    
                    if (!sourceNode || !targetNode) return null;
                    
                    return (
                      <line
                        key={conn.id}
                        x1={sourceNode.position.x + 48}
                        y1={sourceNode.position.y + 48}
                        x2={targetNode.position.x + 48}
                        y2={targetNode.position.y + 48}
                        stroke="#6366f1"
                        strokeWidth="3"
                        markerEnd="url(#workflowArrow)"
                        className="animate-pulse"
                      />
                    );
                  })}
                </svg>
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
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Deploy to Google Account
            </Button>
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
    </div>
  );
};