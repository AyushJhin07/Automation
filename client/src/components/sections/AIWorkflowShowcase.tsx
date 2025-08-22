import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Sheet, Calendar, Brain, Zap, ArrowRight, Sparkles, Workflow, FileText, FolderOpen, Play, CheckCircle2 } from 'lucide-react';

interface AIWorkflowShowcaseProps {
  className?: string;
}

const demoScenarios = [
  {
    prompt: "Track customer emails and create weekly reports",
    steps: [
      "🤖 AI analyzing your request...",
      "📧 Detected: Gmail monitoring needed",
      "📊 Detected: Report generation required", 
      "🔗 Connecting Gmail → AI Analysis → Sheets → Drive",
      "✨ Workflow generated successfully!"
    ],
    nodes: [
      { id: 'gmail', name: 'Gmail', icon: Mail, color: '#EA4335', function: 'Monitor Emails' },
      { id: 'ai', name: 'AI Analysis', icon: Brain, color: '#8B5CF6', function: 'Extract Data' },
      { id: 'sheets', name: 'Google Sheets', icon: Sheet, color: '#0F9D58', function: 'Store Data' },
      { id: 'report', name: 'Auto Report', icon: FileText, color: '#4285F4', function: 'Generate PDF' }
    ]
  },
  {
    prompt: "Send follow-ups to leads who don't respond in 3 days",
    steps: [
      "🤖 AI analyzing follow-up workflow...",
      "📧 Detected: Email tracking needed",
      "⏰ Detected: Time-based triggers required",
      "🔗 Connecting Gmail → Delay → Conditional → Follow-up",
      "✨ Smart follow-up system ready!"
    ],
    nodes: [
      { id: 'gmail', name: 'Gmail', icon: Mail, color: '#EA4335', function: 'Track Emails' },
      { id: 'ai', name: 'AI Logic', icon: Brain, color: '#8B5CF6', function: 'Check Response' },
      { id: 'calendar', name: 'Calendar', icon: Calendar, color: '#4285F4', function: '3-Day Delay' },
      { id: 'followup', name: 'Follow-up', icon: Zap, color: '#F59E0B', function: 'Send Email' }
    ]
  },
  {
    prompt: "Automatically organize project files and notify team",
    steps: [
      "🤖 AI analyzing file organization...",
      "📁 Detected: Google Drive monitoring needed",
      "👥 Detected: Team notification required",
      "🔗 Connecting Drive → AI Categorization → Sheets → Gmail",
      "✨ Smart file organization system created!"
    ],
    nodes: [
      { id: 'drive', name: 'Google Drive', icon: FolderOpen, color: '#4285F4', function: 'Monitor Files' },
      { id: 'ai', name: 'AI Sorting', icon: Brain, color: '#8B5CF6', function: 'Categorize' },
      { id: 'sheets', name: 'File Log', icon: Sheet, color: '#0F9D58', function: 'Track Changes' },
      { id: 'notify', name: 'Team Alert', icon: Mail, color: '#EA4335', function: 'Notify Team' }
    ]
  }
];

export const AIWorkflowShowcase: React.FC<AIWorkflowShowcaseProps> = ({ className = "" }) => {
  const [currentScenario, setCurrentScenario] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [showNodes, setShowNodes] = useState<number[]>([]);
  const [showConnections, setShowConnections] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isTyping, setIsTyping] = useState(true);

  const scenario = demoScenarios[currentScenario];

  // Reset animation when scenario changes
  useEffect(() => {
    setTypedText("");
    setCurrentStep(0);
    setShowNodes([]);
    setShowConnections(false);
    setIsComplete(false);
    setIsTyping(true);
  }, [currentScenario]);

  // Realistic typing animation effect
  useEffect(() => {
    if (!isTyping) return;
    
    const targetText = scenario.prompt;
    if (typedText.length < targetText.length) {
      // Realistic typing with pauses at punctuation and spaces
      const nextChar = targetText[typedText.length];
      let delay = 60 + Math.random() * 40; // Base typing speed
      
      if (nextChar === ' ') delay += 50; // Pause at spaces
      if (nextChar === ',' || nextChar === '.') delay += 200; // Longer pause at punctuation
      if (Math.random() < 0.1) delay += 100; // Random thinking pauses
      
      const timeout = setTimeout(() => {
        setTypedText(targetText.slice(0, typedText.length + 1));
      }, delay);
      
      return () => clearTimeout(timeout);
    } else {
      // Typing complete, brief pause then start AI processing
      setIsTyping(false);
      setTimeout(() => setCurrentStep(1), 800);
    }
  }, [typedText, isTyping, scenario.prompt]);

  // AI processing and node creation animation
  useEffect(() => {
    if (currentStep === 0 || currentStep > scenario.steps.length) return;

    const timeout = setTimeout(() => {
      if (currentStep <= scenario.steps.length) {
        setCurrentStep(prev => prev + 1);
        
        // Show nodes progressively
        if (currentStep >= 2 && currentStep <= scenario.nodes.length + 1) {
          setShowNodes(prev => [...prev, currentStep - 2]);
        }
        
        // Show connections after all nodes
        if (currentStep === scenario.nodes.length + 2) {
          setShowConnections(true);
        }
        
        // Mark complete
        if (currentStep === scenario.steps.length) {
          setTimeout(() => setIsComplete(true), 1000);
        }
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [currentStep, scenario.steps.length, scenario.nodes.length]);

  // Auto-cycle through scenarios
  useEffect(() => {
    if (isComplete) {
      const timeout = setTimeout(() => {
        setCurrentScenario(prev => (prev + 1) % demoScenarios.length);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isComplete]);

  return (
    <div className={`bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 rounded-2xl p-8 border border-blue-200 ${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h2 className="text-2xl font-bold text-gray-900">AI Workflow Generator</h2>
          <Badge className="bg-purple-600 text-white">LIVE DEMO</Badge>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Watch how our AI instantly transforms your ideas into complete automation workflows
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Left Side - AI Input Simulation */}
        <div className="space-y-6">
                     {/* Typing Input Box */}
           <div className="bg-white rounded-xl border-2 border-blue-200 p-6 shadow-lg relative overflow-hidden">
             {/* Typing indicator */}
             {isTyping && (
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse"></div>
             )}
             
             <div className="flex items-center gap-2 mb-4">
               <div className={`w-3 h-3 rounded-full transition-colors ${
                 isTyping ? 'bg-blue-500 animate-pulse' : 
                 currentStep > 0 ? 'bg-purple-500 animate-pulse' : 'bg-green-500'
               }`}></div>
               <span className="text-sm font-medium text-gray-600">
                 {isTyping ? '✍️ User typing...' : 
                  currentStep > 0 ? '🤖 AI analyzing...' : 'AI Workflow Generator'}
               </span>
               {isTyping && (
                 <Badge className="bg-blue-100 text-blue-800 text-xs animate-pulse">LIVE</Badge>
               )}
             </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Describe what you want to automate:
              </label>
              <div className="relative">
                <div className="min-h-[80px] p-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50/50 text-gray-800 text-lg relative">
                  <span className="font-medium">{typedText}</span>
                  {(isTyping || typedText.length === 0) && (
                    <span className="inline-block w-0.5 h-6 bg-blue-600 ml-1 animate-pulse" style={{
                      animation: 'blink 1s infinite'
                    }}>|</span>
                  )}
                  {!isTyping && typedText.length > 0 && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-100/50 to-transparent animate-pulse"></div>
                  )}
                </div>
              </div>
            </div>

            {!isTyping && (
              <Button className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 animate-fade-in">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Workflow with AI
              </Button>
            )}
          </div>

          {/* AI Processing Steps */}
          {currentStep > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg animate-fade-in">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                AI Analysis
              </h3>
              
              <div className="space-y-3">
                {scenario.steps.slice(0, currentStep).map((step, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-3 animate-slide-in"
                    style={{ animationDelay: `${index * 0.2}s` }}
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-700">{step}</span>
                    {index === currentStep - 1 && (
                      <div className="ml-auto">
                        <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side - Live Workflow Building */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Workflow className="w-5 h-5 text-blue-600" />
              Generated Workflow
            </h3>
            {isComplete && (
              <Badge className="bg-green-600 text-white animate-bounce">
                ✅ Ready to Build
              </Badge>
            )}
          </div>

          {/* Workflow Canvas */}
          <div className="relative h-80 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden">
            {showNodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Workflow className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">AI will build your workflow here...</p>
                </div>
              </div>
            )}

                         {/* Animated Nodes */}
             {scenario.nodes.map((node, index) => (
               showNodes.includes(index) && (
                 <div
                   key={node.id}
                   className="absolute transform transition-all duration-1000"
                   style={{
                     left: `${20 + (index * 20)}%`,
                     top: `${25 + (index % 2) * 35}%`,
                     animation: `bounce 0.8s ease-out ${index * 0.4}s both, fade-in 0.6s ease-out ${index * 0.4}s both`
                   }}
                 >
                  <div 
                    className="w-20 h-20 rounded-xl flex flex-col items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-105"
                    style={{ 
                      backgroundColor: node.color,
                      boxShadow: `0 8px 20px ${node.color}30`
                    }}
                  >
                    <node.icon className="w-6 h-6 text-white mb-1" />
                    <span className="text-xs text-white font-medium text-center leading-tight">
                      {node.name}
                    </span>
                  </div>
                  
                  {/* Function Badge */}
                  <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
                    <Badge 
                      className="text-xs text-white shadow-lg"
                      style={{ backgroundColor: node.color }}
                    >
                      {node.function}
                    </Badge>
                  </div>
                </div>
              )
            ))}

            {/* Animated Connections */}
            {showConnections && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <marker id="aiArrowHead" markerWidth="8" markerHeight="6" 
                    refX="7" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#8B5CF6" />
                  </marker>
                </defs>
                
                {/* Connection lines between nodes */}
                {scenario.nodes.slice(0, -1).map((_, index) => (
                  <line
                    key={index}
                    x1={`${28 + (index * 22)}%`}
                    y1={`${35 + (index % 2) * 40}%`}
                    x2={`${42 + (index * 22)}%`}
                    y2={`${35 + ((index + 1) % 2) * 40}%`}
                    stroke="#8B5CF6"
                    strokeWidth="3"
                    markerEnd="url(#aiArrowHead)"
                    className="animate-pulse"
                    strokeDasharray="5,5"
                    style={{
                      animationDelay: `${index * 0.5}s`,
                      animationDuration: '2s'
                    }}
                  />
                ))}
              </svg>
            )}

            {/* AI Processing Indicator */}
            {currentStep > 0 && currentStep < scenario.steps.length && (
              <div className="absolute top-4 right-4">
                <div className="bg-white rounded-full px-3 py-2 shadow-lg border-2 border-purple-300 animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>
                    <span className="text-xs font-medium text-purple-600">AI Building...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Success Indicator */}
            {isComplete && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-green-500 text-white rounded-full px-4 py-2 shadow-lg animate-bounce">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-sm font-medium">Workflow Ready!</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Generated Workflow Summary */}
          {isComplete && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800">Workflow Generated Successfully!</span>
              </div>
              <p className="text-sm text-green-700">
                AI created a {scenario.nodes.length}-step automation with smart field mapping and error handling.
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="bg-green-600 hover:bg-green-700">
                  <Play className="w-3 h-3 mr-1" />
                  Build This Workflow
                </Button>
                <Button size="sm" variant="outline">
                  Customize Further
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scenario Selector */}
      <div className="mt-8 flex justify-center gap-3">
        {demoScenarios.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentScenario(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              currentScenario === index 
                ? 'bg-purple-600 scale-125' 
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
          />
        ))}
      </div>

      {/* Call to Action */}
      <div className="mt-8 text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Ready to Build Your AI-Powered Automation?
        </h3>
        <p className="text-gray-600 mb-4">
          Our AI can generate any workflow from your description. No technical skills required.
        </p>
        <div className="flex gap-4 justify-center">
          <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-8 py-3">
            <Sparkles className="w-4 h-4 mr-2" />
            Try AI Generator
          </Button>
          <Button variant="outline" className="text-lg px-8 py-3">
            📞 Book Demo Call
          </Button>
        </div>
      </div>
    </div>
  );
};