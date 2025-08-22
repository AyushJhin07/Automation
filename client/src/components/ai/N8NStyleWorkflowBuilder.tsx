import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  NodeTypes,
  ReactFlowProvider,
  ReactFlowInstance,
  MarkerType,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Brain, 
  Sparkles, 
  Loader2, 
  Settings, 
  Play,
  Save,
  Download,
  Zap,
  Mail,
  Sheet,
  Calendar,
  MessageSquare,
  CreditCard,
  ShoppingBag,
  CheckSquare,
  Trello as TrelloIcon,
  Cloud,
  Heart,
  X,
  Plus,
  Trash2
} from 'lucide-react';

// N8N-Style Custom Node Component
const N8NNode = ({ data }: { data: any }) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const getAppIcon = (appName: string) => {
    const iconMap: Record<string, any> = {
      'Gmail': Mail,
      'Google Sheets': Sheet,
      'Google Calendar': Calendar,
      'Slack': MessageSquare,
      'Stripe': CreditCard,
      'Shopify': ShoppingBag,
      'Asana': CheckSquare,
      'Trello': TrelloIcon,
      'Salesforce': Cloud,
      'HubSpot': Heart
    };
    
    const IconComponent = iconMap[appName] || Zap;
    return <IconComponent className="w-6 h-6 text-white" />;
  };

  return (
    <>
      <div 
        className="relative bg-gray-800 border border-gray-600 rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer group"
        style={{ width: '200px', minHeight: '80px' }}
        onClick={() => setIsConfigOpen(true)}
      >
        {/* Node Header */}
        <div 
          className="flex items-center gap-3 p-3 rounded-t-lg"
          style={{ backgroundColor: data.color || '#6366f1' }}
        >
          {getAppIcon(data.appName)}
          <div className="flex-1">
            <div className="text-white font-medium text-sm">{data.appName}</div>
            <div className="text-white/80 text-xs">{data.category || 'App'}</div>
          </div>
          <Settings className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
        </div>

        {/* Node Content */}
        <div className="p-3 bg-gray-800 rounded-b-lg">
          <div className="text-white text-sm font-medium mb-1">
            {data.selectedFunction || 'Click to configure'}
          </div>
          <div className="text-gray-400 text-xs">
            {data.functionDescription || 'No function selected'}
          </div>
          
          {/* Status Indicators */}
          <div className="flex gap-1 mt-2">
            <div className={`w-2 h-2 rounded-full ${data.configured ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <div className={`w-2 h-2 rounded-full ${data.connected ? 'bg-blue-500' : 'bg-gray-500'}`} />
            <div className={`w-2 h-2 rounded-full ${data.aiOptimized ? 'bg-purple-500' : 'bg-gray-500'}`} />
          </div>
        </div>

        {/* Connection Points */}
        <div className="absolute -left-2 top-1/2 w-4 h-4 bg-gray-600 border-2 border-gray-400 rounded-full transform -translate-y-1/2" />
        <div className="absolute -right-2 top-1/2 w-4 h-4 bg-gray-600 border-2 border-gray-400 rounded-full transform -translate-y-1/2" />
      </div>

      {/* Configuration Modal */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="max-w-2xl bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: data.color }}
              >
                {getAppIcon(data.appName)}
              </div>
              <div>
                <div className="text-white font-semibold">{data.appName} Configuration</div>
                <div className="text-gray-400 text-sm">Configure function and parameters</div>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Function Selection */}
            <div>
              <Label className="text-white mb-2 block">Function</Label>
              <Select value={data.selectedFunction} onValueChange={() => {}}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="Select function..." />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  {/* Gmail Functions */}
                  {data.appName === 'Gmail' && (
                    <>
                      <SelectItem value="send_email">Send Email</SelectItem>
                      <SelectItem value="search_emails">Search Emails</SelectItem>
                      <SelectItem value="set_auto_reply">Set Auto Reply</SelectItem>
                      <SelectItem value="reply_to_email">Reply to Email</SelectItem>
                      <SelectItem value="add_label">Add Label</SelectItem>
                    </>
                  )}
                  
                  {/* Google Sheets Functions */}
                  {data.appName === 'Google Sheets' && (
                    <>
                      <SelectItem value="append_row">Append Row</SelectItem>
                      <SelectItem value="read_range">Read Range</SelectItem>
                      <SelectItem value="update_range">Update Range</SelectItem>
                      <SelectItem value="create_chart">Create Chart</SelectItem>
                    </>
                  )}
                  
                  {/* Slack Functions */}
                  {data.appName === 'Slack' && (
                    <>
                      <SelectItem value="send_message">Send Message</SelectItem>
                      <SelectItem value="create_channel">Create Channel</SelectItem>
                      <SelectItem value="upload_file">Upload File</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* AI Assistant */}
            <div className="bg-purple-900/50 p-4 rounded-lg border border-purple-600">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-5 h-5 text-purple-400" />
                <span className="text-purple-300 font-medium">AI Assistant</span>
                <Badge className="bg-purple-600 text-white">Smart Config</Badge>
              </div>
              <p className="text-gray-300 text-sm mb-3">
                Let AI configure this node based on your workflow context
              </p>
              <Button 
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => {
                  // Trigger AI configuration
                  console.log('AI configuring node...');
                }}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Configure with AI
              </Button>
            </div>

            {/* Parameters */}
            <div>
              <Label className="text-white mb-2 block">Parameters</Label>
              <div className="space-y-3">
                {data.selectedFunction === 'send_email' && (
                  <>
                    <div>
                      <Label className="text-gray-300 text-sm">To</Label>
                      <Input 
                        className="bg-gray-800 border-gray-600 text-white"
                        placeholder="recipient@example.com"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Subject</Label>
                      <Input 
                        className="bg-gray-800 border-gray-600 text-white"
                        placeholder="Email subject"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Body</Label>
                      <Textarea 
                        className="bg-gray-800 border-gray-600 text-white"
                        placeholder="Email content"
                      />
                    </div>
                  </>
                )}
                
                {data.selectedFunction === 'set_auto_reply' && (
                  <>
                    <div>
                      <Label className="text-gray-300 text-sm">Auto Reply Message</Label>
                      <Textarea 
                        className="bg-gray-800 border-gray-600 text-white"
                        placeholder="Thank you for your email. I will respond as soon as possible."
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Duration</Label>
                      <Select>
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                          <SelectValue placeholder="Select duration..." />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-600">
                          <SelectItem value="1hour">1 Hour</SelectItem>
                          <SelectItem value="1day">1 Day</SelectItem>
                          <SelectItem value="1week">1 Week</SelectItem>
                          <SelectItem value="indefinite">Until Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-700">
              <Button 
                className="bg-green-600 hover:bg-green-700 flex-1"
                onClick={() => setIsConfigOpen(false)}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </Button>
              <Button 
                variant="outline" 
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
                onClick={() => setIsConfigOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const nodeTypes: NodeTypes = {
  n8nNode: N8NNode,
};

interface AIThinkingStep {
  step: number;
  title: string;
  description: string;
  duration: number;
  status: 'pending' | 'processing' | 'complete';
}

export const N8NStyleWorkflowBuilder: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  // AI Workflow Generation State
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<AIThinkingStep[]>([]);
  const [currentThinkingStep, setCurrentThinkingStep] = useState(0);
  const [showAIPanel, setShowAIPanel] = useState(true);

  const onConnect = useCallback(
    (params: Connection) => {
      const edge = {
        ...params,
        type: 'smoothstep',
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  const generateWorkflowWithThinking = async () => {
    if (!prompt.trim()) return;

    setIsThinking(true);
    setCurrentThinkingStep(0);
    
    // Define AI thinking steps
    const steps: AIThinkingStep[] = [
      {
        step: 1,
        title: 'Analyzing Request',
        description: 'Understanding your automation requirements...',
        duration: 2000,
        status: 'processing'
      },
      {
        step: 2,
        title: 'Identifying Apps',
        description: 'Determining which applications are needed...',
        duration: 1500,
        status: 'pending'
      },
      {
        step: 3,
        title: 'Mapping Data Flow',
        description: 'Planning how data will flow between apps...',
        duration: 2500,
        status: 'pending'
      },
      {
        step: 4,
        title: 'Selecting Functions',
        description: 'Choosing optimal functions for each app...',
        duration: 2000,
        status: 'pending'
      },
      {
        step: 5,
        title: 'Generating Workflow',
        description: 'Creating visual workflow and connections...',
        duration: 1500,
        status: 'pending'
      },
      {
        step: 6,
        title: 'Code Generation',
        description: 'Generating Google Apps Script code...',
        duration: 1000,
        status: 'pending'
      }
    ];

    setThinkingSteps(steps);

    // Execute thinking steps with realistic timing
    for (let i = 0; i < steps.length; i++) {
      setCurrentThinkingStep(i);
      
      // Update current step to processing
      setThinkingSteps(prev => prev.map((step, idx) => ({
        ...step,
        status: idx === i ? 'processing' : idx < i ? 'complete' : 'pending'
      })));

      await new Promise(resolve => setTimeout(resolve, steps[i].duration));

      // Mark current step as complete
      setThinkingSteps(prev => prev.map((step, idx) => ({
        ...step,
        status: idx <= i ? 'complete' : 'pending'
      })));
    }

    // Generate actual workflow
    try {
      const response = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          userId: 'admin-user',
          preferredModel: selectedModel
        }),
      });

      if (response.ok) {
        const workflow = await response.json();
        
        // Convert to n8n-style nodes
        const n8nNodes = workflow.nodes.map((node: any, index: number) => ({
          id: node.id,
          type: 'n8nNode',
          position: { x: 100 + (index * 250), y: 100 + (index % 2) * 150 },
          data: {
            appName: node.app,
            selectedFunction: node.function,
            functionDescription: node.aiReason,
            color: node.color,
            configured: true,
            connected: index > 0,
            aiOptimized: true,
            parameters: node.parameters
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left
        }));

        // Convert to n8n-style edges
        const n8nEdges = workflow.connections.map((conn: any) => ({
          id: conn.id,
          source: conn.source,
          target: conn.target,
          type: 'smoothstep',
          style: { stroke: '#6366f1', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
          label: conn.dataType || 'data',
          labelStyle: { fill: '#9CA3AF', fontSize: 12 },
          labelBgStyle: { fill: '#1F2937', fillOpacity: 0.8 }
        }));

        setNodes(n8nNodes);
        setEdges(n8nEdges);
      }
    } catch (error) {
      console.error('Error generating workflow:', error);
    } finally {
      setIsThinking(false);
      setShowAIPanel(false);
    }
  };

  const clearWorkflow = () => {
    setNodes([]);
    setEdges([]);
    setPrompt('');
    setShowAIPanel(true);
  };

  return (
    <div className="h-screen bg-gray-900 flex">
      {/* Left Sidebar - AI Panel */}
      {showAIPanel && (
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-6 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-2">AI Workflow Generator</h2>
            <p className="text-gray-400 text-sm">
              Describe your automation and watch AI build it step by step
            </p>
          </div>

          {/* AI Model Selection */}
          <div className="mb-6">
            <Label className="text-white mb-2 block">AI Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="gemini">💎 Gemini Pro (Fastest & Cheapest)</SelectItem>
                <SelectItem value="claude">🧠 Claude Haiku (Most Accurate)</SelectItem>
                <SelectItem value="gpt4">⚡ GPT-4o Mini (Balanced)</SelectItem>
                <SelectItem value="local">🏠 Local Analysis (Free)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Prompt Input */}
          <div className="mb-6">
            <Label className="text-white mb-2 block">Describe Your Automation</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: Create an automatic email responder that replies to customer inquiries with a professional message..."
              className="bg-gray-700 border-gray-600 text-white min-h-[120px]"
              disabled={isThinking}
            />
          </div>

          {/* Generate Button */}
          <Button 
            onClick={generateWorkflowWithThinking}
            disabled={!prompt.trim() || isThinking}
            className="w-full bg-purple-600 hover:bg-purple-700 mb-6"
          >
            {isThinking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                AI Thinking...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Generate Workflow
              </>
            )}
          </Button>

          {/* AI Thinking Process */}
          {isThinking && (
            <div className="space-y-3">
              <h3 className="text-white font-medium">AI Thinking Process</h3>
              {thinkingSteps.map((step, index) => (
                <div 
                  key={step.step}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    step.status === 'complete' ? 'bg-green-900/50 border-green-600' :
                    step.status === 'processing' ? 'bg-blue-900/50 border-blue-600' :
                    'bg-gray-800 border-gray-600'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.status === 'complete' ? 'bg-green-600 text-white' :
                    step.status === 'processing' ? 'bg-blue-600 text-white' :
                    'bg-gray-600 text-gray-300'
                  }`}>
                    {step.status === 'processing' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      step.step
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">{step.title}</div>
                    <div className="text-gray-400 text-xs">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Example Prompts */}
          {!isThinking && (
            <div>
              <h3 className="text-white font-medium mb-3">Example Automations</h3>
              <div className="space-y-2">
                {[
                  "Create automatic email responder for customer inquiries",
                  "Track leads from Gmail and add to Salesforce",
                  "Notify Slack when Shopify orders are received",
                  "Generate weekly reports from Google Sheets data"
                ].map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setPrompt(example)}
                    className="w-full text-left p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded text-sm transition-colors"
                    disabled={isThinking}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Workflow Canvas */}
      <div className="flex-1 relative">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-900"
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
            defaultEdgeOptions={{
              style: { stroke: '#6366f1', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
            }}
          >
            <Background color="#374151" gap={20} />
            <Controls className="bg-gray-800 border-gray-600" />
          </ReactFlow>
        </ReactFlowProvider>

        {/* Top Toolbar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-white text-xl font-bold">Workflow Builder</h1>
            <Badge className="bg-purple-600 text-white">AI-Powered</Badge>
          </div>
          
          <div className="flex items-center gap-3">
            {!showAIPanel && (
              <Button 
                onClick={() => setShowAIPanel(true)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Brain className="w-4 h-4 mr-2" />
                AI Assistant
              </Button>
            )}
            
            <Button 
              onClick={clearWorkflow}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
            
            <Button 
              className="bg-green-600 hover:bg-green-700"
              disabled={nodes.length === 0}
            >
              <Play className="w-4 h-4 mr-2" />
              Deploy
            </Button>
          </div>
        </div>

        {/* Empty State */}
        {nodes.length === 0 && !isThinking && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-white text-xl font-semibold mb-2">
                Start with AI Workflow Generation
              </h3>
              <p className="text-gray-400 mb-6 max-w-md">
                Describe your automation in plain English and watch AI build a professional workflow for you
              </p>
              {!showAIPanel && (
                <Button 
                  onClick={() => setShowAIPanel(true)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Open AI Assistant
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};