import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, 
  Brain, 
  Download, 
  Play, 
  Copy,
  Wand2,
  Code,
  Zap,
  CheckCircle
} from "lucide-react";

interface CustomizationOption {
  id: string;
  label: string;
  description: string;
  type: "text" | "select" | "textarea" | "prompt";
  defaultValue: string;
  options?: string[];
  aiEnhanced?: boolean;
}

interface ScriptCustomizerProps {
  scriptId: string;
  scriptTitle: string;
  baseCode: string;
  customizationOptions: CustomizationOption[];
  onDownload: (customizedCode: string, config: Record<string, string>) => void;
}

export function ScriptCustomizer({ 
  scriptId, 
  scriptTitle, 
  baseCode, 
  customizationOptions,
  onDownload 
}: ScriptCustomizerProps) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [aiPrompt, setAiPrompt] = useState("");
  const [customizedCode, setCustomizedCode] = useState(baseCode);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("config");

  const updateConfig = (optionId: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      [optionId]: value
    }));
  };

  const generateAICustomization = async () => {
    setIsGenerating(true);
    
    // Simulate AI customization
    setTimeout(() => {
      const enhancedCode = enhanceCodeWithAI(baseCode, config, aiPrompt);
      setCustomizedCode(enhancedCode);
      setIsGenerating(false);
      setActiveTab("preview");
    }, 2000);
  };

  const enhanceCodeWithAI = (code: string, userConfig: Record<string, string>, prompt: string) => {
    // This would integrate with actual LLM in production
    let enhanced = code;
    
    // Apply user configurations
    Object.entries(userConfig).forEach(([key, value]) => {
      if (value) {
        enhanced = enhanced.replace(
          new RegExp(`\\b${key.toUpperCase()}_PLACEHOLDER\\b`, 'g'), 
          value
        );
      }
    });

    // Add AI-generated enhancements based on prompt
    if (prompt) {
      enhanced += `

// AI-Enhanced Features based on: "${prompt}"
function aiEnhancedProcessor() {
  // AI-generated code would be inserted here
  // This could include:
  // - Custom email filtering logic
  // - Advanced data processing
  // - Integration with external APIs
  // - Custom notification systems
  
  Logger.log('AI Enhancement: ${prompt}');
}`;
    }

    return enhanced;
  };

  const handleDownload = () => {
    onDownload(customizedCode, config);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(customizedCode);
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            Customize Your {scriptTitle}
          </CardTitle>
          <CardDescription>
            Configure the script for your specific needs and enhance it with AI-powered features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="config">Basic Config</TabsTrigger>
              <TabsTrigger value="ai-enhance">AI Enhancement</TabsTrigger>
              <TabsTrigger value="preview">Code Preview</TabsTrigger>
              <TabsTrigger value="download">Download</TabsTrigger>
            </TabsList>
            
            <TabsContent value="config" className="space-y-4 mt-6">
              <div className="grid gap-4">
                {customizationOptions.map((option) => (
                  <div key={option.id} className="space-y-2">
                    <Label htmlFor={option.id} className="flex items-center gap-2">
                      {option.label}
                      {option.aiEnhanced && (
                        <Badge variant="secondary" className="text-xs">
                          <Brain className="size-3 mr-1" />
                          AI Enhanced
                        </Badge>
                      )}
                    </Label>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                    
                    {option.type === "text" && (
                      <Input
                        id={option.id}
                        placeholder={option.defaultValue}
                        value={config[option.id] || ""}
                        onChange={(e) => updateConfig(option.id, e.target.value)}
                      />
                    )}
                    
                    {option.type === "textarea" && (
                      <Textarea
                        id={option.id}
                        placeholder={option.defaultValue}
                        value={config[option.id] || ""}
                        onChange={(e) => updateConfig(option.id, e.target.value)}
                        rows={3}
                      />
                    )}
                    
                    {option.type === "select" && option.options && (
                      <select
                        id={option.id}
                        value={config[option.id] || option.defaultValue}
                        onChange={(e) => updateConfig(option.id, e.target.value)}
                        className="w-full p-2 border rounded-md"
                      >
                        {option.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="ai-enhance" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="size-5" />
                    AI-Powered Customization
                  </CardTitle>
                  <CardDescription>
                    Describe additional features you need and AI will enhance your script
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai-prompt">Describe your specific requirements:</Label>
                    <Textarea
                      id="ai-prompt"
                      placeholder="Example: I want to filter emails by sender domain, extract specific data patterns, send custom notifications to Slack, and create summary reports with charts..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={4}
                    />
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card className="p-4">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Zap className="size-4" />
                        AI Capabilities
                      </h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• Custom email filtering logic</li>
                        <li>• Advanced data processing</li>
                        <li>• External API integrations</li>
                        <li>• Smart notification systems</li>
                        <li>• Custom report generation</li>
                      </ul>
                    </Card>
                    
                    <Card className="p-4">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Code className="size-4" />
                        Enhancement Examples
                      </h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• "Add expense categorization"</li>
                        <li>• "Include approval workflows"</li>
                        <li>• "Connect to CRM system"</li>
                        <li>• "Generate PDF summaries"</li>
                        <li>• "Send Slack notifications"</li>
                      </ul>
                    </Card>
                  </div>
                  
                  <Button 
                    onClick={generateAICustomization}
                    disabled={!aiPrompt.trim() || isGenerating}
                    className="w-full hover-glow"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                        Generating AI Enhancements...
                      </>
                    ) : (
                      <>
                        <Wand2 className="size-4 mr-2" />
                        Generate AI-Enhanced Script
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="preview" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Code className="size-5" />
                      Your Customized Script
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={copyCode}>
                      <Copy className="size-4 mr-2" />
                      Copy Code
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm max-h-96">
                    <code>{customizedCode}</code>
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="download" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="size-5" />
                    Download Your Script
                  </CardTitle>
                  <CardDescription>
                    Get your customized Google Apps Script with setup instructions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card className="p-4">
                      <h4 className="font-semibold mb-2">What's included:</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="size-3 text-green-500" />
                          Customized Google Apps Script code
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="size-3 text-green-500" />
                          Step-by-step setup instructions
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="size-3 text-green-500" />
                          Configuration guide
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="size-3 text-green-500" />
                          AI-enhanced features
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="size-3 text-green-500" />
                          Testing and troubleshooting guide
                        </li>
                      </ul>
                    </Card>
                    
                    <Card className="p-4">
                      <h4 className="font-semibold mb-2">Your Configuration:</h4>
                      <div className="space-y-2 text-sm">
                        {Object.entries(config).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-mono">{value || "default"}</span>
                          </div>
                        ))}
                        {aiPrompt && (
                          <div className="mt-2 p-2 bg-muted rounded">
                            <span className="text-xs font-semibold">AI Enhancement:</span>
                            <p className="text-xs mt-1">{aiPrompt}</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex gap-4">
                    <Button onClick={handleDownload} size="lg" className="flex-1 hover-glow">
                      <Download className="size-4 mr-2" />
                      Download Complete Package
                    </Button>
                    <Button variant="outline" size="lg" className="flex-1">
                      <Play className="size-4 mr-2" />
                      Test in Sandbox
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default ScriptCustomizer;