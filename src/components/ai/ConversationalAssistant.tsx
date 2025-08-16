import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, 
  Mic, 
  MicOff, 
  Send, 
  Bot, 
  User,
  Lock,
  Headphones,
  Zap,
  Settings
} from "lucide-react";

interface Message {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  voice?: boolean;
}

export function ConversationalAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "assistant", 
      content: "Hello! I'm your AI automation assistant. I can help you set up workflows using voice commands or text. Try saying 'Create a workflow to process my email attachments' or ask me anything about Google Apps Script automation.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    setShowUpgrade(true);

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: "I'd love to help you with that automation! However, this conversational AI assistant is a premium feature. With the upgrade, I can provide real-time voice guidance, workflow optimization tips, and 24/7 support for all your automation needs.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleVoiceInput = () => {
    if (!isListening) {
      setIsListening(true);
      setShowUpgrade(true);
      // Simulate voice recording
      setTimeout(() => {
        setIsListening(false);
      }, 3000);
    } else {
      setIsListening(false);
    }
  };

  const sampleCommands = [
    "Create a workflow to backup my important emails",
    "Set up automated expense report processing", 
    "Help me optimize my calendar scheduling",
    "Build a document approval workflow"
  ];

  return (
    <div className="space-y-6">
      {/* Assistant Chat Interface */}
      <Card className="glass-card h-96">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-5" />
            AI Automation Assistant
            <Badge variant="outline" className="ml-auto">
              <Headphones className="size-3 mr-1" />
              Voice Enabled
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-80 px-4">
            <div className="space-y-4 pb-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.type === "assistant" && (
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="size-4 text-primary" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-xs lg:max-w-sm px-3 py-2 rounded-lg ${
                      message.type === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    <span className="text-xs opacity-70 mt-1 block">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>

                  {message.type === "user" && (
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="size-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              
              {isTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="size-4 text-primary" />
                  </div>
                  <div className="bg-muted px-3 py-2 rounded-lg">
                    <div className="flex gap-1">
                      <div className="size-2 rounded-full bg-primary/50 animate-pulse" />
                      <div className="size-2 rounded-full bg-primary/50 animate-pulse delay-100" />
                      <div className="size-2 rounded-full bg-primary/50 animate-pulse delay-200" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Input Controls */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me about automation or use voice commands..."
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                disabled={showUpgrade}
                className="pr-12"
              />
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1 h-8 w-8 p-0"
                onClick={handleVoiceInput}
                disabled={showUpgrade}
              >
                {isListening ? (
                  <MicOff className="size-4 text-red-500" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            </div>
            <Button 
              onClick={handleSendMessage}
              disabled={!input.trim() || showUpgrade}
              className="hover-glow"
            >
              <Send className="size-4" />
            </Button>
          </div>

          {isListening && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-500">
              <div className="size-2 rounded-full bg-red-500 animate-pulse" />
              Listening... (Premium feature demo)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sample Commands */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Try These Voice Commands</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {sampleCommands.map((command, idx) => (
              <Button
                key={idx}
                variant="ghost"
                className="text-left h-auto p-3 justify-start whitespace-normal"
                onClick={() => !showUpgrade && setInput(command)}
                disabled={showUpgrade}
              >
                <MessageSquare className="size-4 mr-2 flex-shrink-0" />
                <span className="text-sm">"{command}"</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Premium Feature Overlay */}
      {showUpgrade && (
        <Card className="glass-card border-primary/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
          <CardContent className="p-8 text-center relative">
            <Lock className="size-12 mx-auto mb-4 text-primary" />
            <h3 className="text-2xl font-bold mb-2">Enterprise AI Assistant</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Unlock the full conversational AI experience with voice commands, real-time workflow 
              optimization, and 24/7 intelligent support for all your automation needs.
            </p>
            <div className="flex gap-4 justify-center mb-4">
              <Button size="lg" className="hover-glow">
                Upgrade to Enterprise - $197/month
              </Button>
              <Button variant="outline" size="lg">
                Try Free for 14 Days
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mic className="size-3" />
                <span>Voice Commands</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="size-3" />
                <span>Real-time Optimization</span>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="size-3" />
                <span>24/7 AI Support</span>
              </div>
              <div className="flex items-center gap-2">
                <Settings className="size-3" />
                <span>Workflow Coaching</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}