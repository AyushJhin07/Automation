import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Mail, Sheet, Calendar, FolderOpen, DollarSign, CheckSquare, Settings, Trash2, Brain, Headphones, MessageSquare } from 'lucide-react';

interface AutomationDemo {
  id: string;
  title: string;
  description: string;
  apps: string[];
  workflow: DemoStep[];
}

interface DemoStep {
  id: number;
  title: string;
  description: string;
  duration: number;
  component: React.ReactNode;
}

// ===== ALL COMPONENT DEFINITIONS FIRST =====

// Reusable Automation Node Component
const AutomationNode = ({ 
  app, 
  icon, 
  color, 
  configured, 
  function: func, 
  connected 
}: { 
  app: string; 
  icon: React.ReactNode; 
  color: string; 
  configured?: boolean; 
  function?: string;
  connected?: boolean;
}) => (
  <div className="w-56 bg-white border-2 rounded-lg shadow-lg p-3" style={{ borderColor: color + '50' }}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm">{app}</span>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full" title="AI Smart Sync"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full" title="Settings"></div>
        <div className="w-2 h-2 bg-red-500 rounded-full" title="Delete"></div>
      </div>
    </div>
    
    {configured && func ? (
      <div>
        <Badge className="text-xs mb-1" style={{ backgroundColor: color }}>
          {func}
        </Badge>
        {connected && (
          <Badge className="text-xs mb-1 ml-1 bg-blue-500">AI Mapped</Badge>
        )}
        <div className="text-xs text-gray-500">
          {connected ? 'Auto-synced with connected apps' : 'Function configured and ready'}
        </div>
      </div>
    ) : (
      <div className="text-xs text-gray-500">Click settings to configure</div>
    )}
  </div>
);

// ===== AI EMAIL ASSISTANT DEMO COMPONENTS =====

const AIEmailAssistantDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6">
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <span className="text-white font-bold">AS</span>
        </div>
        <div>
          <h1 className="text-xl font-bold">Visual Automation Builder</h1>
          <p className="text-sm text-gray-600">🤖 Intelligent Email Assistant with LLM</p>
        </div>
      </div>
    </div>

    <div className="flex h-96">
      <div className="w-72 bg-white border rounded-l-lg p-4 mr-4">
        <h3 className="font-semibold mb-4">Apps & APIs</h3>
        
        <div className={`p-3 border rounded-lg mb-2 transition-all ${
          step >= 2 ? 'border-red-300 bg-red-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-red-600" />
            <div className="text-xs">
              <div className="font-medium">Gmail</div>
              <div className="text-gray-500">Email processing</div>
            </div>
          </div>
        </div>

        <div className={`p-3 border rounded-lg mb-2 transition-all ${
          step >= 4 ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-600" />
            <div className="text-xs">
              <div className="font-medium">OpenAI/Claude</div>
              <div className="text-gray-500">AI analysis</div>
            </div>
          </div>
        </div>

        <div className={`p-3 border rounded-lg mb-2 transition-all ${
          step >= 7 ? 'border-green-300 bg-green-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Sheet className="w-4 h-4 text-green-600" />
            <div className="text-xs">
              <div className="font-medium">Sheets</div>
              <div className="text-gray-500">Analytics</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 border rounded-r-lg relative overflow-hidden">
        {step >= 2 && (
          <div className={`absolute transition-all duration-1000 ${
            step === 2 ? 'left-1/2 top-1/4 scale-110 animate-bounce' : ''
          }`} style={{left: '20px', top: '20px'}}>
            <div className="w-36 bg-white border-2 border-red-300 rounded-lg shadow p-3">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-red-600" />
                <span className="text-xs font-medium">Gmail Input</span>
              </div>
              {step >= 3 && <Badge className="text-xs bg-red-500">Search Emails</Badge>}
            </div>
          </div>
        )}

        {step >= 4 && (
          <div className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ${
            step === 4 ? 'scale-110 animate-bounce' : ''
          }`}>
            <div className="w-40 bg-gradient-to-r from-purple-100 to-blue-100 border-2 border-purple-400 rounded-lg shadow-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium">AI Processing</span>
              </div>
              {step >= 5 && <Badge className="text-xs bg-purple-500">LLM Analysis</Badge>}
            </div>
          </div>
        )}

        {step >= 6 && (
          <div className={`absolute transition-all duration-1000 ${
            step === 6 ? 'right-1/4 top-1/4 scale-110 animate-bounce' : ''
          }`} style={{right: '20px', top: '20px'}}>
            <div className="w-36 bg-white border-2 border-red-300 rounded-lg shadow p-3">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-red-600" />
                <span className="text-xs font-medium">Gmail Response</span>
              </div>
              {step >= 6 && <Badge className="text-xs bg-red-500">Send Email</Badge>}
            </div>
          </div>
        )}

        {step >= 7 && (
          <div className={`absolute transition-all duration-1000 ${
            step === 7 ? 'right-1/4 bottom-1/4 scale-110 animate-bounce' : ''
          }`} style={{right: '20px', bottom: '20px'}}>
            <div className="w-36 bg-white border-2 border-green-300 rounded-lg shadow p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sheet className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium">Analytics</span>
              </div>
              {step >= 7 && <Badge className="text-xs bg-green-500">Append Row</Badge>}
            </div>
          </div>
        )}

        {(step === 3 || step === 5) && (
          <div className="absolute left-1/2 top-1/3 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-64 bg-white border-2 border-blue-400 rounded-lg shadow-lg p-4 animate-pulse">
              <div className="text-center text-blue-600 font-medium">
                {step === 3 ? '⚙️ Configuring Email Search...' : '🤖 Setting up AI Prompts...'}
              </div>
              <div className="text-xs text-center text-gray-500 mt-1">
                {step === 3 ? 'Monitoring customer support emails' : 'Custom AI instructions and knowledge base'}
              </div>
            </div>
          </div>
        )}

        {step >= 8 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="aiArrow" markerWidth="8" markerHeight="6" 
                refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#8B5CF6" />
              </marker>
            </defs>
            <line x1="85" y1="35" x2="180" y2="100" stroke="#8B5CF6" strokeWidth="2" markerEnd="url(#aiArrow)" 
                  className={step === 8 ? 'animate-pulse' : ''} strokeDasharray={step === 8 ? '3,3' : '0'} />
            <line x1="220" y1="100" x2="315" y2="35" stroke="#8B5CF6" strokeWidth="2" markerEnd="url(#aiArrow)"
                  className={step === 8 ? 'animate-pulse' : ''} strokeDasharray={step === 8 ? '3,3' : '0'} />
            <line x1="220" y1="120" x2="315" y2="185" stroke="#8B5CF6" strokeWidth="2" markerEnd="url(#aiArrow)"
                  className={step === 8 ? 'animate-pulse' : ''} strokeDasharray={step === 8 ? '3,3' : '0'} />
          </svg>
        )}

        {step >= 9 && (
          <div className="absolute left-1/2 bottom-4 transform -translate-x-1/2">
            <div className="bg-white rounded-full px-4 py-2 shadow-lg border-2 border-purple-300 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-ping"></div>
                <span className="text-sm font-medium">🤖 AI Processing Email...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    <div className="mt-4 h-16 flex items-center justify-center">
      {step === 1 && <div className="text-blue-600 text-center">🚀 Setting up AI Email Assistant monitoring system...</div>}
      {step === 2 && <div className="text-red-600 text-center">📧 Gmail input node added - will receive customer emails...</div>}
      {step === 3 && <div className="text-red-600 text-center">⚙️ Configuring to search 'label:customer-support is:unread'...</div>}
      {step === 4 && <div className="text-purple-600 text-center">🧠 AI Processing node added - will analyze emails with LLM...</div>}
      {step === 5 && <div className="text-purple-600 text-center">🤖 AI configured with custom prompts and company knowledge...</div>}
      {step === 6 && <div className="text-red-600 text-center">📤 Gmail response node added - will send AI-generated replies...</div>}
      {step === 7 && <div className="text-green-600 text-center">📊 Analytics tracking added - will log interactions and sentiment...</div>}
      {step >= 8 && <div className="text-purple-600 text-center">🎯 AI Pipeline Connected! Email → AI Analysis → Intelligent Response → Analytics</div>}
    </div>
  </div>
);

const AIEmailAssistantResults = ({ step }: { step: number }) => (
  <div className="h-full bg-white p-6">
    {step === 1 && (
      <div className="grid grid-cols-2 gap-6 h-full">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-6 h-6 text-red-600" />
            <h3 className="text-lg font-semibold">Customer Email</h3>
          </div>
          
          <div className="border rounded-lg p-4 bg-red-50 border-red-200">
            <div className="text-sm mb-2"><strong>From:</strong> sarah@techcorp.com</div>
            <div className="text-sm mb-2"><strong>Subject:</strong> API Integration Help Needed</div>
            <div className="text-sm mb-3">
              <strong>Body:</strong> Hi, I'm having trouble with your API. Getting 404 errors on webhook setup. Can you help?
            </div>
            <Badge className="bg-orange-500 text-white">⏳ Awaiting AI Response</Badge>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-6 h-6 text-purple-600" />
            <h3 className="text-lg font-semibold">AI Generated Response</h3>
          </div>
          
          <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
            <div className="text-sm mb-3 bg-white p-3 rounded border">
              Hi Sarah,<br/><br/>
              I understand you're experiencing 404 errors with webhook setup. This typically indicates an endpoint configuration issue.<br/><br/>
              Here's how to resolve this:<br/>
              1. Verify your webhook URL in the dashboard<br/>
              2. Ensure your API key has webhook permissions<br/>
              3. Check that your endpoint accepts POST requests<br/><br/>
              I've also scheduled a technical consultation for you.<br/><br/>
              Best regards,<br/>
              Technical Support Team
            </div>
            <Badge className="bg-green-500 text-white">✅ AI Response Sent</Badge>
          </div>
        </div>
      </div>
    )}

    {step === 2 && (
      <div className="h-full">
        <div className="flex items-center gap-2 mb-4">
          <Sheet className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold">AI Analytics Dashboard</h3>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-green-600 text-white p-2 text-sm font-medium">Response Quality</div>
            <div className="p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Customer Satisfaction:</span>
                <span className="font-medium text-green-600">4.9/5.0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Response Accuracy:</span>
                <span className="font-medium">96%</span>
              </div>
            </div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-purple-600 text-white p-2 text-sm font-medium">AI Performance</div>
            <div className="p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Avg Response Time:</span>
                <span className="font-medium">1.8 seconds</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Auto-Resolution:</span>
                <span className="font-medium text-purple-600">82%</span>
              </div>
            </div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-blue-600 text-white p-2 text-sm font-medium">Business Impact</div>
            <div className="p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cost Savings:</span>
                <span className="font-medium text-green-600">$2,400/mo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Time Saved:</span>
                <span className="font-medium">120 hrs/mo</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {step === 3 && (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-2xl">
          <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Brain className="w-12 h-12 text-white" />
          </div>
          <h3 className="text-3xl font-bold text-purple-600 mb-4">🤖 AI Email Assistant Complete!</h3>
          <p className="text-gray-600 text-lg mb-6">
            Your intelligent email assistant is now handling customer inquiries with advanced AI, 
            providing professional responses in multiple languages with 96% accuracy.
          </p>
          <div className="flex gap-6 justify-center">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">82%</div>
              <div className="text-sm text-gray-600">Auto-Resolution</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">1.8s</div>
              <div className="text-sm text-gray-600">Response Time</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">$2.4K</div>
              <div className="text-sm text-gray-600">Monthly Savings</div>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);



// ===== CUSTOMER SUPPORT DEMO COMPONENTS =====

const CustomerSupportDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6">
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <span className="text-white font-bold">AS</span>
        </div>
        <div>
          <h1 className="text-xl font-bold">Visual Automation Builder</h1>
          <p className="text-sm text-gray-600">🎧 Advanced Customer Support Automation</p>
        </div>
      </div>
    </div>

    <div className="text-center h-full flex items-center justify-center">
      <div>
        <h3 className="text-lg font-semibold mb-2">Customer Support Demo - Step {step}</h3>
        <p className="text-gray-600">Gmail → AI Triage → Sheets → Calendar workflow</p>
        <div className="mt-4">
          <Badge className="bg-blue-500 text-white">Step {step} of 12</Badge>
        </div>
      </div>
    </div>
  </div>
);

const CustomerSupportResults = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center flex items-center justify-center">
    <div>
      <h3 className="text-lg font-semibold text-blue-600 mb-2">🎧 Support System Results</h3>
      <p className="text-gray-600">AI-powered support with intelligent triage and responses</p>
      <Badge className="mt-4 bg-green-500 text-white">✅ Support Automation Active</Badge>
    </div>
  </div>
);

// ===== SLACK BRIDGE DEMO COMPONENTS =====

const SlackBridgeDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6">
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <span className="text-white font-bold">AS</span>
        </div>
        <div>
          <h1 className="text-xl font-bold">Visual Automation Builder</h1>
          <p className="text-sm text-gray-600">💬 Slack-Google Workspace Bridge</p>
        </div>
      </div>
    </div>

    <div className="text-center h-full flex items-center justify-center">
      <div>
        <h3 className="text-lg font-semibold mb-2">Slack Bridge Demo - Step {step}</h3>
        <p className="text-gray-600">Slack → Google Workspace integration workflow</p>
        <div className="mt-4">
          <Badge className="bg-purple-500 text-white">Step {step} of 12</Badge>
        </div>
      </div>
    </div>
  </div>
);

const SlackBridgeResults = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center flex items-center justify-center">
    <div>
      <h3 className="text-lg font-semibold text-purple-600 mb-2">💬 Slack Bridge Results</h3>
      <p className="text-gray-600">Complete Slack-Google Workspace synchronization</p>
      <Badge className="mt-4 bg-purple-500 text-white">✅ Integration Bridge Active</Badge>
    </div>
  </div>
);

// ===== EMAIL PROCESSOR DEMO COMPONENTS (EXISTING) =====

const EmailProcessorDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6">
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <span className="text-white font-bold">AS</span>
        </div>
        <div>
          <h1 className="text-xl font-bold">Visual Automation Builder</h1>
          <p className="text-sm text-gray-600">Smart Email Processor</p>
        </div>
      </div>
    </div>

    <div className="flex h-96">
      <div className="w-72 bg-white border rounded-l-lg p-4 mr-4">
        <h3 className="font-semibold mb-4">Google Apps</h3>
        
        <div className={`p-3 border rounded-lg mb-3 transition-all ${
          step >= 1 ? 'border-red-300 bg-red-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-red-600" />
            <div>
              <div className="font-medium text-sm">Gmail</div>
              <div className="text-xs text-gray-500">26 functions</div>
            </div>
          </div>
          {step >= 1 && (
            <div className="mt-2 text-xs text-red-600">✅ Monitoring emails</div>
          )}
        </div>

        <div className={`p-3 border rounded-lg mb-3 transition-all ${
          step >= 3 ? 'border-green-300 bg-green-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Sheet className="w-5 h-5 text-green-600" />
            <div>
              <div className="font-medium text-sm">Google Sheets</div>
              <div className="text-xs text-gray-500">7 functions</div>
            </div>
          </div>
          {step >= 3 && (
            <div className="mt-2 text-xs text-green-600">✅ Storing data</div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-gray-100 border rounded-r-lg relative overflow-hidden">
        {step >= 1 && (
          <div className={`absolute transition-all duration-1000 ${
            step === 1 ? 'left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 scale-110 animate-bounce' : 'left-16 top-16'
          }`}>
            <AutomationNode 
              app="Gmail" 
              icon={<Mail className="w-4 h-4 text-red-600" />}
              color="#EA4335"
              configured={step >= 2}
              function={step >= 2 ? "Search Emails" : undefined}
            />
            {step === 1 && (
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs bg-red-500 text-white px-2 py-1 rounded animate-pulse">
                Dragging Gmail...
              </div>
            )}
          </div>
        )}
        
        {step >= 3 && (
          <div className={`absolute transition-all duration-1000 ${
            step === 3 ? 'right-1/3 top-1/2 transform -translate-x-1/2 -translate-y-1/2 scale-110 animate-bounce' : 'right-16 top-16'
          }`}>
            <AutomationNode 
              app="Google Sheets" 
              icon={<Sheet className="w-4 h-4 text-green-600" />}
              color="#0F9D58"
              configured={step >= 4}
              function={step >= 4 ? "Append Row" : undefined}
              connected={step >= 5}
            />
            {step === 3 && (
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs bg-green-500 text-white px-2 py-1 rounded animate-pulse">
                Adding Sheets...
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="absolute left-16 top-16">
            <div className="w-56 bg-white border-2 border-red-400 rounded-lg shadow-lg p-3 animate-pulse">
              <div className="text-center text-red-600 font-medium">⚙️ Configuring...</div>
              <div className="text-xs text-center text-gray-500">Setting up email search</div>
            </div>
          </div>
        )}

        {step >= 5 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
              </marker>
            </defs>
            <line x1="200" y1="80" x2="350" y2="80" stroke="#6366f1" strokeWidth="3" markerEnd="url(#arrowhead)" 
                  className={step === 5 ? 'animate-pulse' : ''} strokeDasharray={step === 5 ? '5,5' : '0'} />
            <text x="275" y="70" fill="#6366f1" fontSize="12" textAnchor="middle" className="font-medium">
              {step === 5 ? '🔄 Connecting...' : 'AI Smart Sync'}
            </text>
          </svg>
        )}

        {step >= 5 && (
          <div className="absolute top-4 right-4">
            <Badge className={`text-white ${step === 5 ? 'bg-orange-500 animate-bounce' : 'bg-green-500 animate-pulse'}`}>
              {step === 5 ? '🔄 AI Analyzing...' : '🧠 Email → Sheets Mapping Active'}
            </Badge>
          </div>
        )}

        {step >= 5 && (
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-lg animate-pulse">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
              <span className="text-sm font-medium">Data Flowing...</span>
            </div>
          </div>
        )}
      </div>
    </div>

    <div className="mt-4 h-12 flex items-center justify-center">
      {step === 1 && (
        <div className="text-red-600 text-center">
          📧 Gmail added! This will monitor incoming emails with the label 'leads'...
        </div>
      )}
      {step === 2 && (
        <div className="text-red-600 text-center">
          ⚙️ Gmail configured to search 'is:unread label:leads' and extract customer data...
        </div>
      )}
      {step === 3 && (
        <div className="text-green-600 text-center">
          📊 Google Sheets added! This will store all extracted email data...
        </div>
      )}
      {step === 4 && (
        <div className="text-green-600 text-center">
          ⚙️ Sheets configured to append new rows with: Date, Subject, From, Phone, Company...
        </div>
      )}
      {step >= 5 && (
        <div className="text-purple-600 text-center">
          🎯 AI Connected! Email data automatically flows to Sheets: From→Column A, Subject→Column B, Body→Column C
        </div>
      )}
    </div>
  </div>
);

const EmailProcessorResults = () => (
  <div className="h-full bg-white p-6">
    <div className="grid grid-cols-2 gap-6 h-full">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-6 h-6 text-red-600" />
          <h3 className="text-lg font-semibold">Gmail - Processed Email</h3>
        </div>
        
        <div className="border rounded-lg p-4 bg-red-50 border-red-200">
          <div className="text-sm mb-2">
            <strong>From:</strong> sarah@newcustomer.com
          </div>
          <div className="text-sm mb-2">
            <strong>Subject:</strong> Interested in your services
          </div>
          <div className="text-sm mb-3">
            <strong>Body:</strong> Hi, I'm Sarah from TechCorp. We need automation help...
          </div>
          <Badge className="bg-green-500 text-white">✅ Processed & Extracted</Badge>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sheet className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold">Google Sheets - Lead Database</h3>
        </div>
        
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-2 text-xs font-medium flex">
            <div className="w-24 border-r">Date</div>
            <div className="w-32 border-r">Name</div>
            <div className="w-40 border-r">Email</div>
            <div className="w-32">Company</div>
          </div>
          <div className="bg-green-50 p-2 text-xs flex animate-pulse border border-green-300">
            <div className="w-24 border-r">Aug 21, 2025</div>
            <div className="w-32 border-r font-medium">Sarah</div>
            <div className="w-40 border-r font-medium">sarah@newcustomer.com</div>
            <div className="w-32 font-medium">TechCorp</div>
          </div>
        </div>
        
        <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded text-xs text-green-800">
          ✅ New lead automatically captured and organized!
        </div>
      </div>
    </div>
  </div>
);

// ===== REPORT GENERATOR DEMO COMPONENTS (EXISTING) =====

const ReportGeneratorDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center flex items-center justify-center">
    <div>
      <h3 className="text-lg font-semibold mb-2">Report Generator Demo - Step {step}</h3>
      <p className="text-gray-600">Sheets → Drive → Gmail workflow for automated reporting</p>
      <div className="mt-4">
        <Badge className="bg-green-500 text-white">Step {step} of 6</Badge>
      </div>
    </div>
  </div>
);

const ReportGeneratorResults = () => (
  <div className="h-full p-6 text-center flex items-center justify-center">
    <div>
      <h3 className="text-lg font-semibold text-green-600">📊 Report Generated & Emailed!</h3>
      <p className="text-gray-600">PDF report created in Drive and sent to stakeholders</p>
    </div>
  </div>
);

// ===== CALENDAR BOOKING DEMO COMPONENTS (EXISTING) =====

const CalendarBookingDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center flex items-center justify-center">
    <div>
      <h3 className="text-lg font-semibold mb-2">Calendar Booking Demo - Step {step}</h3>
      <p className="text-gray-600">Calendar → Gmail → Sheets workflow for booking management</p>
      <div className="mt-4">
        <Badge className="bg-blue-500 text-white">Step {step} of 6</Badge>
      </div>
    </div>
  </div>
);

const CalendarBookingResults = () => (
  <div className="h-full p-6 text-center flex items-center justify-center">
    <div>
      <h3 className="text-lg font-semibold text-blue-600">📅 Booking Confirmed & Logged!</h3>
      <p className="text-gray-600">Calendar event created, confirmation sent, booking logged</p>
    </div>
  </div>
);

// ===== AUTOMATION DEMOS CONFIGURATION =====

const automationDemos: AutomationDemo[] = [
  {
    id: "email-automation",
    title: "Smart Email Processor",
    description: "Automatically process emails, extract data, and update Google Sheets",
    apps: ["Gmail", "Google Sheets"],
    workflow: [
      {
        id: 1,
        title: "Drag Gmail",
        description: "Customer drags Gmail to monitor incoming emails",
        duration: 3000,
        component: <EmailProcessorDemo step={1} />
      },
      {
        id: 2, 
        title: "Configure Email Search",
        description: "Set up to monitor 'is:unread label:leads' emails",
        duration: 4000,
        component: <EmailProcessorDemo step={2} />
      },
      {
        id: 3,
        title: "Add Google Sheets",
        description: "Drag Sheets to store extracted email data",
        duration: 3000,
        component: <EmailProcessorDemo step={3} />
      },
      {
        id: 4,
        title: "Configure Sheets",
        description: "Set up 'Append Row' to add email data",
        duration: 4000,
        component: <EmailProcessorDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & AI Sync",
        description: "Connect apps - AI maps email fields to sheet columns",
        duration: 4000,
        component: <EmailProcessorDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "New email automatically processed and added to sheet",
        duration: 5000,
        component: <EmailProcessorResults />
      }
    ]
  },
  {
    id: "report-automation", 
    title: "Automated Report Generator",
    description: "Generate and distribute reports from Google Sheets data",
    apps: ["Google Sheets", "Gmail", "Google Drive"],
    workflow: [
      {
        id: 1,
        title: "Drag Google Sheets",
        description: "Customer drags Sheets to read data for reports",
        duration: 3000,
        component: <ReportGeneratorDemo step={1} />
      },
      {
        id: 2,
        title: "Configure Data Reading", 
        description: "Set up 'Read Range' to get sales/analytics data",
        duration: 4000,
        component: <ReportGeneratorDemo step={2} />
      },
      {
        id: 3,
        title: "Add Google Drive",
        description: "Drag Drive to create PDF reports",
        duration: 3000,
        component: <ReportGeneratorDemo step={3} />
      },
      {
        id: 4,
        title: "Add Gmail",
        description: "Drag Gmail to email reports to stakeholders",
        duration: 3000,
        component: <ReportGeneratorDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & Generate",
        description: "AI connects data flow: Sheets → Drive → Gmail",
        duration: 4000,
        component: <ReportGeneratorDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "PDF report created and emailed automatically",
        duration: 5000,
        component: <ReportGeneratorResults />
      }
    ]
  },
  {
    id: "calendar-automation",
    title: "Smart Calendar Booking System", 
    description: "Automate calendar bookings with email confirmations",
    apps: ["Google Calendar", "Gmail", "Google Sheets"],
    workflow: [
      {
        id: 1,
        title: "Drag Google Calendar",
        description: "Customer drags Calendar to manage bookings",
        duration: 3000,
        component: <CalendarBookingDemo step={1} />
      },
      {
        id: 2,
        title: "Configure Event Creation",
        description: "Set up 'Create Event' function for appointments",
        duration: 4000,
        component: <CalendarBookingDemo step={2} />
      },
      {
        id: 3,
        title: "Add Gmail",
        description: "Drag Gmail for confirmation emails",
        duration: 3000,
        component: <CalendarBookingDemo step={3} />
      },
      {
        id: 4,
        title: "Add Google Sheets",
        description: "Drag Sheets to log all bookings",
        duration: 3000,
        component: <CalendarBookingDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & AI Sync",
        description: "AI maps: Calendar → Gmail → Sheets automatically",
        duration: 4000,
        component: <CalendarBookingDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "Booking created, email sent, data logged",
        duration: 5000,
        component: <CalendarBookingResults />
      }
    ]
  },
  {
    id: "ai-email-assistant",
    title: "Intelligent Email Assistant with LLM",
    description: "AI-powered email responses using advanced language models",
    apps: ["Gmail", "OpenAI API", "Google Sheets"],
    workflow: [
      {
        id: 1,
        title: "Setup Gmail Monitoring",
        description: "Customer configures Gmail to monitor customer emails",
        duration: 3000,
        component: <AIEmailAssistantDemo step={1} />
      },
      {
        id: 2,
        title: "Drag Gmail Node",
        description: "Add Gmail node to automation canvas",
        duration: 3000,
        component: <AIEmailAssistantDemo step={2} />
      },
      {
        id: 3,
        title: "Configure Email Search",
        description: "Set up 'Search Emails' to find customer inquiries",
        duration: 4000,
        component: <AIEmailAssistantDemo step={3} />
      },
      {
        id: 4,
        title: "Add AI Processing Node",
        description: "Add LLM API integration for intelligent analysis",
        duration: 4000,
        component: <AIEmailAssistantDemo step={4} />
      },
      {
        id: 5,
        title: "Configure AI Prompts",
        description: "Set up custom prompts and company knowledge base",
        duration: 5000,
        component: <AIEmailAssistantDemo step={5} />
      },
      {
        id: 6,
        title: "Add Response Gmail Node",
        description: "Add second Gmail node for sending AI responses",
        duration: 3000,
        component: <AIEmailAssistantDemo step={6} />
      },
      {
        id: 7,
        title: "Add Google Sheets Logging",
        description: "Add Sheets to track all AI interactions",
        duration: 3000,
        component: <AIEmailAssistantDemo step={7} />
      },
      {
        id: 8,
        title: "Connect AI Pipeline",
        description: "Connect all nodes - AI analyzes and responds",
        duration: 4000,
        component: <AIEmailAssistantDemo step={8} />
      },
      {
        id: 9,
        title: "Test AI Response",
        description: "Watch AI generate intelligent email response",
        duration: 5000,
        component: <AIEmailAssistantDemo step={9} />
      },
      {
        id: 10,
        title: "See Email Results",
        description: "Customer receives AI-generated professional response",
        duration: 4000,
        component: <AIEmailAssistantResults step={1} />
      },
      {
        id: 11,
        title: "See Analytics Dashboard",
        description: "View AI interaction analytics and sentiment tracking",
        duration: 4000,
        component: <AIEmailAssistantResults step={2} />
      },
      {
        id: 12,
        title: "Complete AI Workflow",
        description: "Full AI email assistant system in action",
        duration: 3000,
        component: <AIEmailAssistantResults step={3} />
      }
    ]
  },
  {
    id: "ai-customer-support",
    title: "Advanced Customer Support Automation",
    description: "AI-powered customer support with intelligent triage and responses",
    apps: ["Gmail", "AI/LLM", "Google Sheets", "Google Calendar"],
    workflow: [
      {
        id: 1,
        title: "Setup Support Email Monitoring",
        description: "Configure Gmail to monitor support@company.com",
        duration: 3000,
        component: <CustomerSupportDemo step={1} />
      },
      {
        id: 2,
        title: "Drag Gmail Input Node",
        description: "Add Gmail node to receive customer emails",
        duration: 3000,
        component: <CustomerSupportDemo step={2} />
      },
      {
        id: 3,
        title: "Configure Email Filtering",
        description: "Set up 'Search Emails' for support tickets",
        duration: 4000,
        component: <CustomerSupportDemo step={3} />
      },
      {
        id: 4,
        title: "Add AI Triage Node",
        description: "Add LLM API for intelligent email analysis",
        duration: 4000,
        component: <CustomerSupportDemo step={4} />
      },
      {
        id: 5,
        title: "Configure AI Analysis",
        description: "Set up sentiment analysis and categorization",
        duration: 5000,
        component: <CustomerSupportDemo step={5} />
      },
      {
        id: 6,
        title: "Add Ticket Tracking",
        description: "Add Google Sheets for support ticket database",
        duration: 3000,
        component: <CustomerSupportDemo step={6} />
      },
      {
        id: 7,
        title: "Add Response Gmail",
        description: "Add Gmail node for sending AI responses",
        duration: 3000,
        component: <CustomerSupportDemo step={7} />
      },
      {
        id: 8,
        title: "Add Escalation Calendar",
        description: "Add Calendar for scheduling follow-ups",
        duration: 3000,
        component: <CustomerSupportDemo step={8} />
      },
      {
        id: 9,
        title: "Connect AI Pipeline",
        description: "Connect all nodes for intelligent support flow",
        duration: 4000,
        component: <CustomerSupportDemo step={9} />
      },
      {
        id: 10,
        title: "Test AI Triage",
        description: "Watch AI analyze and categorize support email",
        duration: 5000,
        component: <CustomerSupportDemo step={10} />
      },
      {
        id: 11,
        title: "See Support Results",
        description: "Customer receives intelligent AI response",
        duration: 4000,
        component: <CustomerSupportResults step={1} />
      },
      {
        id: 12,
        title: "View Support Dashboard",
        description: "Complete support analytics and ticket tracking",
        duration: 4000,
        component: <CustomerSupportResults step={2} />
      }
    ]
  },
  {
    id: "slack-workspace-bridge",
    title: "Slack-Google Workspace Bridge",
    description: "Advanced integration bridge connecting Slack with Google Workspace",
    apps: ["Slack Webhooks", "Google Sheets", "Gmail", "Google Calendar", "Google Drive"],
    workflow: [
      {
        id: 1,
        title: "Setup Slack Webhook",
        description: "Configure Slack webhook to monitor messages",
        duration: 3000,
        component: <SlackBridgeDemo step={1} />
      },
      {
        id: 2,
        title: "Add Slack Integration Node",
        description: "Add Slack webhook receiver to automation",
        duration: 3000,
        component: <SlackBridgeDemo step={2} />
      },
      {
        id: 3,
        title: "Configure Message Filtering",
        description: "Set up filters for important Slack messages",
        duration: 4000,
        component: <SlackBridgeDemo step={3} />
      },
      {
        id: 4,
        title: "Add AI Processing",
        description: "Add LLM for extracting action items from Slack",
        duration: 4000,
        component: <SlackBridgeDemo step={4} />
      },
      {
        id: 5,
        title: "Add Google Sheets Archive",
        description: "Add Sheets to archive important messages",
        duration: 3000,
        component: <SlackBridgeDemo step={5} />
      },
      {
        id: 6,
        title: "Add Calendar Integration",
        description: "Add Calendar for action item scheduling",
        duration: 3000,
        component: <SlackBridgeDemo step={6} />
      },
      {
        id: 7,
        title: "Add Drive File Organization",
        description: "Add Drive to organize Slack file shares",
        duration: 3000,
        component: <SlackBridgeDemo step={7} />
      },
      {
        id: 8,
        title: "Add Gmail Notifications",
        description: "Add Gmail for email summaries of Slack activity",
        duration: 3000,
        component: <SlackBridgeDemo step={8} />
      },
      {
        id: 9,
        title: "Connect Integration Pipeline",
        description: "Connect all nodes for complete Slack-Workspace sync",
        duration: 4000,
        component: <SlackBridgeDemo step={9} />
      },
      {
        id: 10,
        title: "Test Slack Message Processing",
        description: "Watch Slack message trigger Google Workspace actions",
        duration: 5000,
        component: <SlackBridgeDemo step={10} />
      },
      {
        id: 11,
        title: "See Integration Results",
        description: "View Slack data synchronized across Google Workspace",
        duration: 4000,
        component: <SlackBridgeResults step={1} />
      },
      {
        id: 12,
        title: "Complete Bridge System",
        description: "Full Slack-Google Workspace integration in action",
        duration: 3000,
        component: <SlackBridgeResults step={2} />
      }
    ]
  }
];

// ===== MAIN COMPONENT =====

export const PreBuiltAutomationDemos = () => {
  const [activeDemo, setActiveDemo] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const currentAutomation = automationDemos[activeDemo];
  const currentWorkflowStep = currentAutomation.workflow[currentStep];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying && currentWorkflowStep) {
      interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 100;
          if (newProgress >= currentWorkflowStep.duration) {
            if (currentStep < currentAutomation.workflow.length - 1) {
              setCurrentStep(curr => curr + 1);
              return 0;
            } else {
              setIsPlaying(false);
              return 0;
            }
          }
          return newProgress;
        });
      }, 100);
    }

    return () => clearInterval(interval);
  }, [isPlaying, currentStep, currentWorkflowStep, currentAutomation]);

  const handlePlay = () => setIsPlaying(!isPlaying);
  const handleReset = () => {
    setCurrentStep(0);
    setProgress(0);
    setIsPlaying(false);
  };

  const progressPercentage = currentWorkflowStep ? (progress / currentWorkflowStep.duration) * 100 : 0;

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      {/* Demo Selection */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-center mb-6">🎬 Advanced AI Automation Demos</h2>
        <p className="text-center text-gray-600 mb-6">
          Watch how each advanced automation works with AI-powered workflows and enterprise integrations
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {automationDemos.map((demo, index) => (
            <Card 
              key={demo.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                activeDemo === index ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => {
                setActiveDemo(index);
                setCurrentStep(0);
                setProgress(0);
                setIsPlaying(false);
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{demo.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">{demo.description}</p>
                <div className="flex gap-1 flex-wrap">
                  {demo.apps.map(app => (
                    <Badge key={app} variant="secondary" className="text-xs">
                      {app}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Demo Controls */}
      <div className="mb-6 text-center">
        <h3 className="text-xl font-semibold mb-4">{currentAutomation.title}</h3>
        
        <div className="flex justify-center gap-4 mb-4">
          <Button onClick={handlePlay} className="flex items-center gap-2">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause Demo' : 'Play Demo'}
          </Button>
          <Button onClick={handleReset} variant="outline" className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset Demo
          </Button>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-100"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        <div className="text-sm text-gray-600">
          Step {currentStep + 1} of {currentAutomation.workflow.length}: {currentWorkflowStep?.title}
        </div>
      </div>

      {/* Demo Screen */}
      <Card className="w-full h-[700px] overflow-hidden border-2 border-gray-300 rounded-xl shadow-2xl">
        <CardContent className="p-0 h-full">
          <div className="bg-gray-100 p-3 border-b flex items-center gap-3">
            <div className="flex gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="flex-1 bg-white rounded-lg px-4 py-2 text-sm text-gray-600 flex items-center gap-2">
              🔒 <span className="font-mono">localhost:5001/pre-built-apps</span>
            </div>
            <div className="text-xs text-gray-500">Apps Script Studio</div>
          </div>
          
          <div className="h-full bg-gray-50">
            {currentWorkflowStep?.component}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 text-center">
        <h4 className="text-lg font-semibold mb-2">{currentWorkflowStep?.title}</h4>
        <p className="text-gray-600 mb-4">{currentWorkflowStep?.description}</p>
        
        <div className="flex justify-center gap-2">
          {currentAutomation.workflow.map((step, index) => (
            <button
              key={step.id}
              onClick={() => {
                setCurrentStep(index);
                setProgress(0);
                setIsPlaying(false);
              }}
              className={`w-4 h-4 rounded-full transition-all ${
                index === currentStep 
                  ? 'bg-blue-600 scale-125' 
                  : index < currentStep 
                    ? 'bg-green-500' 
                    : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 text-center bg-gradient-to-r from-blue-50 to-purple-50 p-8 rounded-2xl border border-blue-200">
        <h3 className="text-2xl font-semibold mb-4">Ready to Build This Advanced Automation?</h3>
        <p className="text-gray-700 mb-6">
          See how this AI-powered automation can transform your workflow. Book a 30-minute call to discuss your specific needs.
        </p>
        <div className="flex gap-4 justify-center">
          <Button className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-3">
            📞 Book a 30-min Call
          </Button>
          <Button variant="outline" className="text-lg px-8 py-3">
            🚀 Try Live Demo
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PreBuiltAutomationDemos;