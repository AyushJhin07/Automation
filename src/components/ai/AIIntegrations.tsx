import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
  Sparkles, 
  Eye, 
  Mic, 
  Bot, 
  Settings,
  Lock,
  Zap,
  Image,
  Video,
  FileText,
  Globe,
  Brain
} from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  features: string[];
  enabled: boolean;
  premium: boolean;
}

export function AIIntegrations() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "multimodal",
      name: "Multi-Modal AI",
      description: "Process images, videos, and documents with advanced AI understanding",
      icon: Eye,
      category: "Vision & Media",
      features: ["Image analysis", "Video processing", "OCR extraction", "Content understanding"],
      enabled: false,
      premium: true
    },
    {
      id: "realtime-agents",
      name: "Real-Time AI Agents",
      description: "Autonomous agents that monitor and respond to events in real-time",
      icon: Bot,
      category: "Automation",
      features: ["Event monitoring", "Autonomous responses", "Decision making", "Workflow execution"],
      enabled: false,
      premium: true
    },
    {
      id: "custom-models",
      name: "Custom AI Models", 
      description: "Deploy your own trained models for specialized automation tasks",
      icon: Brain,
      category: "Machine Learning",
      features: ["Model deployment", "Custom training", "Fine-tuning", "Performance optimization"],
      enabled: false,
      premium: true
    },
    {
      id: "voice-processing",
      name: "Advanced Voice Processing",
      description: "Sophisticated voice recognition and synthesis capabilities",
      icon: Mic,
      category: "Audio",
      features: ["Speech-to-text", "Text-to-speech", "Voice commands", "Audio analysis"],
      enabled: false,
      premium: true
    },
    {
      id: "global-apis",
      name: "Global AI APIs",
      description: "Access to cutting-edge AI services from multiple providers",
      icon: Globe,
      category: "External Services",
      features: ["OpenAI integration", "Google AI access", "Microsoft Cognitive", "Custom endpoints"],
      enabled: false,
      premium: true
    }
  ]);

  const handleToggleIntegration = (id: string) => {
    setShowUpgrade(true);
  };

  const categories = Array.from(new Set(integrations.map(i => i.category)));

  const getIntegrationsByCategory = (category: string) => {
    return integrations.filter(i => i.category === category);
  };

  return (
    <div className="space-y-6">
      {/* Integration Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5" />
            Advanced AI Integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <Image className="size-8 mx-auto mb-2 text-primary" />
              <div className="font-semibold">Multi-Modal</div>
              <div className="text-sm text-muted-foreground">Image & Video AI</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <Bot className="size-8 mx-auto mb-2 text-primary" />
              <div className="font-semibold">AI Agents</div>
              <div className="text-sm text-muted-foreground">Autonomous Systems</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <Brain className="size-8 mx-auto mb-2 text-primary" />
              <div className="font-semibold">Custom Models</div>
              <div className="text-sm text-muted-foreground">Specialized AI</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <Globe className="size-8 mx-auto mb-2 text-primary" />
              <div className="font-semibold">Global APIs</div>
              <div className="text-sm text-muted-foreground">AI Ecosystem</div>
            </div>
          </div>

          <Button 
            onClick={() => setShowUpgrade(true)}
            className="w-full hover-glow"
          >
            <Zap className="size-4 mr-2" />
            Enable Advanced Integrations
          </Button>
        </CardContent>
      </Card>

      {/* Integration Categories */}
      <Tabs defaultValue={categories[0]}>
        <TabsList className="grid w-full grid-cols-5">
          {categories.map((category) => (
            <TabsTrigger key={category} value={category} className="text-xs">
              {category.split(' ')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((category) => (
          <TabsContent key={category} value={category}>
            <div className="grid gap-4">
              {getIntegrationsByCategory(category).map((integration) => (
                <Card key={integration.id} className="glass-card">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <integration.icon className="size-6 text-primary" />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{integration.name}</h3>
                            {integration.premium && (
                              <Badge variant="outline" className="text-xs">
                                <Lock className="size-3 mr-1" />
                                Enterprise
                              </Badge>
                            )}
                          </div>
                          
                          <Switch
                            checked={integration.enabled}
                            onCheckedChange={() => handleToggleIntegration(integration.id)}
                            disabled={integration.premium}
                          />
                        </div>
                        
                        <p className="text-muted-foreground mb-4">{integration.description}</p>
                        
                        <div className="grid grid-cols-2 gap-2">
                          {integration.features.map((feature, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <div className="size-1.5 rounded-full bg-primary" />
                              {feature}
                            </div>
                          ))}
                        </div>
                        
                        {integration.premium && (
                          <div className="mt-4 p-3 bg-muted/50 rounded-lg border-l-4 border-l-primary">
                            <div className="text-sm font-medium mb-1">Enterprise Feature</div>
                            <div className="text-sm text-muted-foreground">
                              This advanced integration requires an Enterprise subscription for full access and support.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Use Cases Examples */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Integration Use Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-lg">Multi-Modal Processing</h4>
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="font-medium mb-1">Receipt Processing</div>
                  <div className="text-sm text-muted-foreground">
                    Automatically extract expense data from receipt photos in emails
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="font-medium mb-1">Document Analysis</div>
                  <div className="text-sm text-muted-foreground">
                    Analyze scanned documents and convert to structured data
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-lg">AI Agent Automation</h4>
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="font-medium mb-1">Smart Email Monitoring</div>
                  <div className="text-sm text-muted-foreground">
                    AI agents that intelligently respond to customer inquiries
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="font-medium mb-1">Proactive Maintenance</div>
                  <div className="text-sm text-muted-foreground">
                    Autonomous systems that detect and fix workflow issues
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Premium Feature Overlay */}
      {showUpgrade && (
        <Card className="glass-card border-primary/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
          <CardContent className="p-8 text-center relative">
            <Lock className="size-12 mx-auto mb-4 text-primary" />
            <h3 className="text-2xl font-bold mb-2">Enterprise AI Integrations</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Unlock the full power of advanced AI with multi-modal processing, autonomous agents, 
              custom models, and access to cutting-edge AI services from global providers.
            </p>
            <div className="flex gap-4 justify-center mb-4">
              <Button size="lg" className="hover-glow">
                Upgrade to Enterprise - $297/month
              </Button>
              <Button variant="outline" size="lg">
                Schedule Enterprise Demo
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Eye className="size-3" />
                <span>Multi-Modal AI</span>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="size-3" />
                <span>AI Agents</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="size-3" />
                <span>Custom Models</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="size-3" />
                <span>Global API Access</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}