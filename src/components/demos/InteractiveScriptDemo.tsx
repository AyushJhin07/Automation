import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Mail, 
  FileText, 
  Calendar,
  FolderCog,
  BarChart3,
  CheckCircle2,
  Clock,
  ArrowRight,
  Database,
  Send
} from "lucide-react";

interface DemoStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  duration: number;
  data?: any;
}

interface InteractiveScriptDemoProps {
  scriptId: string;
  scriptTitle: string;
  demoSteps: DemoStep[];
  finalOutput: any;
}

export function InteractiveScriptDemo({ 
  scriptId, 
  scriptTitle, 
  demoSteps, 
  finalOutput 
}: InteractiveScriptDemoProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stepData, setStepData] = useState<any[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const startDemo = () => {
    setIsRunning(true);
    setCurrentStep(0);
    setProgress(0);
    setStepData([]);
    setCompletedSteps(new Set());
    runDemo();
  };

  const runDemo = async () => {
    for (let i = 0; i < actualDemoSteps.length; i++) {
      setCurrentStep(i);
      const step = actualDemoSteps[i];
      
      // Simulate step execution
      for (let j = 0; j <= 100; j += 10) {
        setProgress((i * 100 + j) / actualDemoSteps.length);
        await new Promise(resolve => setTimeout(resolve, step.duration / 10));
      }
      
      // Add step data
      setStepData(prev => [...prev, step.data || generateSampleData(step.id)]);
      setCompletedSteps(prev => new Set([...prev, i]));
    }
    
    setIsRunning(false);
    setCurrentStep(actualDemoSteps.length);
  };

  const resetDemo = () => {
    setIsRunning(false);
    setCurrentStep(0);
    setProgress(0);
    setStepData([]);
    setCompletedSteps(new Set());
  };

  const generateSampleData = (stepId: string) => {
    switch (stepId) {
      case "email-fetch":
        return {
          emails: [
            { from: "client@company.com", subject: "Invoice Request", time: "2 min ago" },
            { from: "supplier@vendor.com", subject: "Quote #12345", time: "5 min ago" },
            { from: "team@startup.com", subject: "Project Update", time: "8 min ago" }
          ]
        };
      case "data-extract":
        return {
          extracted: [
            { field: "Invoice Number", value: "#INV-2024-001", confidence: 98 },
            { field: "Amount", value: "$1,250.00", confidence: 95 },
            { field: "Due Date", value: "2024-03-15", confidence: 92 }
          ]
        };
      case "sheet-update":
        return {
          rows: 3,
          lastUpdate: new Date().toLocaleTimeString(),
          sheetName: "Automation_Data"
        };
      case "notification":
        return {
          sent: true,
          recipients: ["manager@company.com", "team@company.com"],
          channel: "email"
        };
      default:
        return { status: "completed" };
    }
  };

  // Use the provided demo steps or generate default ones
  const actualDemoSteps = demoSteps.length > 0 ? demoSteps : getDemoStepsForScript(scriptId);

  const getDemoStepsForScript = (scriptId: string): DemoStep[] => {
    switch (scriptId) {
      case "email-automation":
        return [
          {
            id: "email-fetch",
            title: "Fetch New Emails",
            description: "Scanning Gmail for unread emails with specified criteria",
            icon: Mail,
            duration: 1500
          },
          {
            id: "data-extract",
            title: "Extract Data",
            description: "Using AI to parse and extract structured data from emails",
            icon: Database,
            duration: 2000
          },
          {
            id: "sheet-update",
            title: "Update Spreadsheet",
            description: "Adding extracted data to Google Sheets",
            icon: FileText,
            duration: 1000
          },
          {
            id: "notification",
            title: "Send Notifications",
            description: "Notifying team members about new data",
            icon: Send,
            duration: 800
          }
        ];
      case "report-generator":
        return [
          {
            id: "data-collect",
            title: "Collect Data",
            description: "Gathering data from multiple Google Sheets",
            icon: Database,
            duration: 1200
          },
          {
            id: "analyze",
            title: "Analyze & Calculate",
            description: "Processing data and generating insights",
            icon: BarChart3,
            duration: 1800
          },
          {
            id: "create-doc",
            title: "Create Document",
            description: "Generating PDF report from template",
            icon: FileText,
            duration: 1500
          },
          {
            id: "distribute",
            title: "Distribute Report",
            description: "Emailing report to stakeholders",
            icon: Send,
            duration: 1000
          }
        ];
      default:
        return [
          {
            id: "initialize",
            title: "Initialize",
            description: "Setting up the automation",
            icon: Play,
            duration: 1000
          },
          {
            id: "process",
            title: "Process",
            description: "Running the main automation logic",
            icon: Database,
            duration: 2000
          },
          {
            id: "complete",
            title: "Complete",
            description: "Finalizing and outputting results",
            icon: CheckCircle2,
            duration: 800
          }
        ];
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="size-5" />
          Interactive Demo: {scriptTitle}
        </CardTitle>
        <CardDescription>
          Watch how this automation works step by step
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Demo Controls */}
        <div className="flex gap-4 justify-center">
          <Button 
            onClick={startDemo} 
            disabled={isRunning}
            size="lg"
            className="hover-glow"
          >
            <Play className="size-4 mr-2" />
            {isRunning ? "Running..." : "Start Demo"}
          </Button>
          <Button variant="outline" onClick={resetDemo} disabled={isRunning}>
            <RotateCcw className="size-4 mr-2" />
            Reset
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

                 {/* Steps Visualization */}
         <div className="space-y-4">
           {actualDemoSteps.map((step, index) => (
            <div key={step.id} className="flex items-start gap-4">
              <div className={`
                size-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all
                ${completedSteps.has(index) ? 'bg-green-500 border-green-500 text-white' :
                  currentStep === index ? 'bg-primary border-primary text-white animate-pulse' :
                  'bg-muted border-muted-foreground text-muted-foreground'}
              `}>
                {completedSteps.has(index) ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <step.icon className="size-5" />
                )}
              </div>
              
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className={`font-semibold ${
                    currentStep === index ? 'text-primary' : 
                    completedSteps.has(index) ? 'text-green-600' : ''
                  }`}>
                    {step.title}
                  </h4>
                  {currentStep === index && isRunning && (
                    <Badge variant="secondary" className="animate-pulse">
                      <Clock className="size-3 mr-1" />
                      Processing...
                    </Badge>
                  )}
                  {completedSteps.has(index) && (
                    <Badge className="bg-green-500">
                      <CheckCircle2 className="size-3 mr-1" />
                      Complete
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{step.description}</p>
                
                {/* Show step data if available */}
                {stepData[index] && (
                  <Card className="p-3 bg-muted/50">
                    <div className="text-xs space-y-1">
                      {step.id === "email-fetch" && stepData[index].emails && (
                        <div>
                          <div className="font-semibold mb-1">Emails found:</div>
                          {stepData[index].emails.map((email: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span>{email.from}</span>
                              <span className="text-muted-foreground">{email.time}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {step.id === "data-extract" && stepData[index].extracted && (
                        <div>
                          <div className="font-semibold mb-1">Extracted data:</div>
                          {stepData[index].extracted.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span>{item.field}: {item.value}</span>
                              <span className="text-green-600">{item.confidence}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {step.id === "sheet-update" && (
                        <div className="text-xs">
                          <span className="font-semibold">Added {stepData[index].rows} rows</span> to {stepData[index].sheetName}
                        </div>
                      )}
                      
                      {step.id === "notification" && (
                        <div className="text-xs">
                          <span className="font-semibold">Sent to:</span> {stepData[index].recipients?.join(", ")}
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </div>
              
                             {index < actualDemoSteps.length - 1 && (
                <ArrowRight className={`size-4 mt-3 ${
                  completedSteps.has(index) ? 'text-green-500' : 'text-muted-foreground'
                }`} />
              )}
            </div>
          ))}
        </div>

                 {/* Final Output */}
         {currentStep >= actualDemoSteps.length && !isRunning && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="size-5" />
                Automation Complete!
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold">Results Summary:</h4>
                  <ul className="text-muted-foreground space-y-1">
                    <li>• Processed 3 emails successfully</li>
                    <li>• Extracted and validated data</li>
                    <li>• Updated Google Sheets automatically</li>
                    <li>• Sent notifications to team</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold">Performance:</h4>
                  <ul className="text-muted-foreground space-y-1">
                                         <li>• Execution time: {(actualDemoSteps.reduce((sum, step) => sum + step.duration, 0) / 1000).toFixed(1)}s</li>
                    <li>• Success rate: 100%</li>
                    <li>• Data accuracy: 95%+</li>
                    <li>• Time saved: ~45 minutes</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

export default InteractiveScriptDemo;