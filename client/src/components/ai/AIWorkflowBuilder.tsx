import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  MessageSquare, 
  Code, 
  Play, 
  Download, 
  Sparkles, 
  Lock,
  Zap,
  ArrowRight
} from "lucide-react";

export function AIWorkflowBuilder() {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [workflow, setWorkflow] = useState<any>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleBuildWorkflow = async () => {
    if (!input.trim()) return;
    
    setIsProcessing(true);
    setShowUpgrade(true);
    
    // Simulate AI processing
    setTimeout(() => {
      setWorkflow({
        title: "Email to Sheets Automation",
        description: "Automatically extract email data and add to Google Sheets",
        steps: [
          "Monitor Gmail for new emails with specific criteria",
          "Extract relevant data using AI parsing",
          "Format and validate the extracted data",
          "Add new row to designated Google Sheet",
          "Send confirmation notification"
        ],
        code: `function processEmails() {
  // AI-generated Google Apps Script code
  const emails = Gmail.search('label:important');
  // ... processing logic ...
}`,
        complexity: "Medium",
        estimatedTime: "15 minutes"
      });
      setIsProcessing(false);
    }, 2000);
  };

  const samplePrompts = [
    "Create a workflow that automatically saves Gmail attachments to Google Drive and logs them in a spreadsheet",
    "Build automation to parse expense receipts from emails and categorize them in Google Sheets",
    "Set up a system to automatically create calendar events from form submissions",
    "Generate reports from Google Sheets data and email them weekly to stakeholders"
  ];

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            Describe Your Automation Need
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Example: I want to automatically save email attachments from my boss to a specific Google Drive folder and log the details in a spreadsheet..."
            className="min-h-24 resize-none"
            disabled={showUpgrade}
          />
          
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">
                <Sparkles className="size-3 mr-1" />
                AI-Powered
              </Badge>
              <Badge variant="outline" className="text-xs">Natural Language</Badge>
            </div>
            
            <Button 
              onClick={handleBuildWorkflow}
              disabled={!input.trim() || isProcessing || showUpgrade}
              className="hover-glow"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  Building...
                </>
              ) : (
                <>
                  <Zap className="size-4 mr-2" />
                  Build Workflow
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sample Prompts */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Try These Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {samplePrompts.map((prompt, idx) => (
              <Button
                key={idx}
                variant="ghost"
                className="text-left h-auto p-3 justify-start whitespace-normal"
                onClick={() => !showUpgrade && setInput(prompt)}
                disabled={showUpgrade}
              >
                <ArrowRight className="size-4 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{prompt}</span>
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
            <h3 className="text-2xl font-bold mb-2">Premium AI Feature</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Unlock the Natural Language Workflow Builder and transform your ideas into working 
              Google Apps Script automations instantly.
            </p>
            <div className="flex gap-4 justify-center mb-4">
              <Button size="lg" className="hover-glow">
                Upgrade to Premium - $97/month
              </Button>
              <Button variant="outline" size="lg">
                Try Free for 7 Days
              </Button>
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span>✓ Unlimited AI workflows</span>
              <span>✓ Advanced code generation</span>
              <span>✓ Real-time support</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Workflow Preview (Demo) */}
      {workflow && !showUpgrade && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="size-5" />
              Generated Workflow: {workflow.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{workflow.description}</p>
            
            <div className="flex gap-4">
              <Badge variant="outline">{workflow.complexity} Complexity</Badge>
              <Badge variant="outline">{workflow.estimatedTime} to implement</Badge>
            </div>

            <Separator />

            <div>
              <h4 className="font-semibold mb-3">Workflow Steps:</h4>
              <div className="space-y-2">
                {workflow.steps.map((step: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold">{idx + 1}</span>
                    </div>
                    <p className="text-sm">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-semibold mb-3">Generated Code Preview:</h4>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{workflow.code}</code>
              </pre>
            </div>

            <div className="flex gap-3">
              <Button className="hover-glow">
                <Play className="size-4 mr-2" />
                Test Workflow
              </Button>
              <Button variant="outline">
                <Download className="size-4 mr-2" />
                Download Code
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}