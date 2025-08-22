import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Brain, 
  Send, 
  Loader2, 
  MessageCircle,
  User,
  Bot,
  Sparkles,
  Settings,
  Zap
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  needsMoreInfo?: boolean;
  followUpQuestions?: string[];
  tokensUsed?: number;
  cost?: number;
}

interface ConversationalWorkflowBuilderProps {
  onWorkflowGenerated?: (workflow: any) => void;
}

export const ConversationalWorkflowBuilder: React.FC<ConversationalWorkflowBuilderProps> = ({
  onWorkflowGenerated
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load API key from admin settings
  useEffect(() => {
    const storedKeys = localStorage.getItem('ai-api-keys');
    if (storedKeys) {
      const keys = JSON.parse(storedKeys);
      if (selectedModel === 'gemini' && keys.gemini) {
        setApiKey(keys.gemini);
      } else if (selectedModel === 'claude' && keys.claude) {
        setApiKey(keys.claude);
      } else if (selectedModel === 'openai' && keys.openai) {
        setApiKey(keys.openai);
      }
    }
  }, [selectedModel]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial AI greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: `Hi! I'm your AI automation consultant. I'll help you build the perfect workflow by understanding exactly what you need.

Tell me about the automation you want to create. For example:
• "I want to automatically follow up with candidates from my Google Sheets"
• "Create an email responder for customer inquiries"  
• "Sync Shopify orders with my accounting system"

What would you like to automate?`,
        timestamp: new Date()
      }]);
    }
  }, []);

  const sendMessage = async () => {
    if (!currentMessage.trim() || isProcessing) return;
    if (!apiKey) {
      alert(`Please configure your ${selectedModel} API key in Admin Settings first!`);
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: currentMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setIsProcessing(true);

    // Add thinking message
    const thinkingMessage: ChatMessage = {
      id: `thinking-${Date.now()}`,
      role: 'assistant',
      content: `🧠 Analyzing your request with ${selectedModel === 'gemini' ? 'Gemini Pro' : selectedModel === 'claude' ? 'Claude Haiku' : 'GPT-4o Mini'}...`,
      timestamp: new Date(),
      isThinking: true
    };

    setMessages(prev => [...prev, thinkingMessage]);

    try {
      // Call REAL AI API
      const response = await fetch('/api/ai/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentMessage,
          model: selectedModel,
          apiKey: apiKey,
          userId: 'conversation-user'
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const aiResponse = await response.json();
      console.log('🎯 Real AI Response:', aiResponse);

      // Remove thinking message
      setMessages(prev => prev.filter(m => m.id !== thinkingMessage.id));

      // Parse AI response
      let parsedAI;
      try {
        parsedAI = JSON.parse(aiResponse.response.replace(/```json\n?|\n?```/g, ''));
      } catch {
        // If not JSON, treat as regular conversation
        parsedAI = { action: 'continue_conversation', response: aiResponse.response };
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: parsedAI.action === 'ask_questions' 
          ? `I need a bit more information to build the perfect automation for you:\n\n${parsedAI.questions?.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n\n')}\n\n${parsedAI.reasoning ? `Why I'm asking: ${parsedAI.reasoning}` : ''}`
          : parsedAI.action === 'generate_workflow'
            ? `Perfect! I understand your automation needs. Let me build this workflow for you:\n\n**Intent**: ${parsedAI.intent}\n**Apps**: ${parsedAI.apps?.join(', ')}\n\nGenerating your workflow now...`
            : aiResponse.response,
        timestamp: new Date(),
        needsMoreInfo: aiResponse.needsMoreInfo,
        followUpQuestions: aiResponse.followUpQuestions,
        tokensUsed: aiResponse.tokensUsed,
        cost: aiResponse.cost
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If AI has enough info, generate workflow
      if (parsedAI.action === 'generate_workflow') {
        setTimeout(() => {
          if (onWorkflowGenerated) {
            onWorkflowGenerated(parsedAI);
          }
        }, 1000);
      }

    } catch (error) {
      console.error('❌ Conversation error:', error);
      
      // Remove thinking message
      setMessages(prev => prev.filter(m => m.id !== thinkingMessage.id));
      
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ Sorry, I encountered an error: ${error.message}\n\nPlease check your API key in Admin Settings and try again.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    // Re-add greeting
    setTimeout(() => {
      setMessages([{
        id: 'greeting',
        role: 'assistant',
        content: `Hi! I'm your AI automation consultant. What automation would you like to build today?`,
        timestamp: new Date()
      }]);
    }, 100);
  };

  return (
    <div className="h-full bg-gray-900 flex flex-col">
      {/* Chat Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold">AI Automation Consultant</h2>
              <p className="text-gray-400 text-sm">Powered by {selectedModel === 'gemini' ? 'Gemini Pro' : selectedModel === 'claude' ? 'Claude Haiku' : 'GPT-4o Mini'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="bg-gray-700 border-gray-600 text-white w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="gemini">💎 Gemini Pro</SelectItem>
                <SelectItem value="claude">🧠 Claude Haiku</SelectItem>
                <SelectItem value="openai">⚡ GPT-4o Mini</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              onClick={clearConversation}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Clear Chat
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                {message.isThinking ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
            )}
            
            <div className={`max-w-2xl ${message.role === 'user' ? 'order-1' : ''}`}>
              <div className={`p-4 rounded-lg ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-white border border-gray-700'
              }`}>
                <div className="whitespace-pre-wrap">{message.content}</div>
                
                {/* Usage Info */}
                {message.tokensUsed && (
                  <div className="mt-2 pt-2 border-t border-gray-600 text-xs text-gray-400">
                    {message.tokensUsed} tokens • ${message.cost?.toFixed(4)} cost
                  </div>
                )}
              </div>
              
              <div className="text-xs text-gray-500 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>

            {message.role === 'user' && (
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex gap-3">
          <Input
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe your automation or answer AI's questions..."
            className="flex-1 bg-gray-700 border-gray-600 text-white"
            disabled={isProcessing}
          />
          <Button 
            onClick={sendMessage}
            disabled={!currentMessage.trim() || isProcessing || !apiKey}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        {!apiKey && (
          <div className="mt-2 p-2 bg-yellow-900/50 border border-yellow-600 rounded text-yellow-300 text-sm">
            ⚠️ Please configure your {selectedModel} API key in <a href="/admin/settings" className="underline">Admin Settings</a> to use real AI
          </div>
        )}
      </div>
    </div>
  );
};