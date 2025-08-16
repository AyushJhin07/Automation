import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  Zap,
  Lock,
  BarChart3,
  Users,
  FileText,
  Calendar
} from "lucide-react";

interface Suggestion {
  id: string;
  title: string;
  description: string;
  impact: "High" | "Medium" | "Low";
  effort: "Low" | "Medium" | "High";
  roi: string;
  timeSaved: string;
  category: string;
  icon: any;
  priority: number;
}

export function SmartSuggestions() {
  const [analyzing, setAnalyzing] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    // Simulate AI analysis
    setTimeout(() => {
      setSuggestions([
        {
          id: "1",
          title: "Automated Expense Report Processing",
          description: "Automatically extract data from receipt emails, categorize expenses, and update monthly reports.",
          impact: "High",
          effort: "Medium",
          roi: "300%",
          timeSaved: "8 hours/week",
          category: "Finance",
          icon: DollarSign,
          priority: 95
        },
        {
          id: "2", 
          title: "Smart Meeting Scheduler",
          description: "Analyze calendar patterns and automatically suggest optimal meeting times based on attendee availability.",
          impact: "High",
          effort: "Low",
          roi: "250%",
          timeSaved: "5 hours/week",
          category: "Scheduling",
          icon: Calendar,
          priority: 90
        },
        {
          id: "3",
          title: "Document Version Control",
          description: "Automatically backup document versions and track changes across your Google Drive.",
          impact: "Medium",
          effort: "Low",
          roi: "180%",
          timeSaved: "3 hours/week",
          category: "Document Management",
          icon: FileText,
          priority: 75
        },
        {
          id: "4",
          title: "Team Performance Dashboard",
          description: "Generate automated reports from multiple data sources for weekly team performance insights.",
          impact: "High",
          effort: "High",
          roi: "400%",
          timeSaved: "12 hours/week",
          category: "Analytics",
          icon: BarChart3,
          priority: 85
        }
      ]);
      setAnalyzing(false);
      setShowUpgrade(true);
    }, 3000);
  }, []);

  const handleAnalyzeWorkspace = () => {
    setAnalyzing(true);
    setShowUpgrade(true);
    setTimeout(() => setAnalyzing(false), 2000);
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "High": return "bg-green-500";
      case "Medium": return "bg-yellow-500";
      case "Low": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case "Low": return "bg-green-500";
      case "Medium": return "bg-yellow-500";
      case "High": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      {/* Analysis Controls */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-5" />
            Workspace Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                AI analyzes your Google Workspace usage patterns to identify automation opportunities
              </p>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline" className="text-xs">Gmail Analysis</Badge>
                <Badge variant="outline" className="text-xs">Drive Patterns</Badge>
                <Badge variant="outline" className="text-xs">Calendar Insights</Badge>
                <Badge variant="outline" className="text-xs">Sheets Usage</Badge>
              </div>
            </div>
            <Button 
              onClick={handleAnalyzeWorkspace}
              disabled={analyzing}
              className="hover-glow"
            >
              {analyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="size-4 mr-2" />
                  Analyze Workspace
                </>
              )}
            </Button>
          </div>

          {analyzing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Scanning Gmail patterns...</span>
                <span>67%</span>
              </div>
              <Progress value={67} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Premium Feature Overlay */}
      {showUpgrade && (
        <Card className="glass-card border-primary/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
          <CardContent className="p-8 text-center relative">
            <Lock className="size-12 mx-auto mb-4 text-primary" />
            <h3 className="text-2xl font-bold mb-2">Premium AI Analysis</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Unlock intelligent workspace analysis and get personalized automation recommendations 
              based on your actual usage patterns.
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
              <span>✓ Real workspace analysis</span>
              <span>✓ Priority recommendations</span>
              <span>✓ ROI calculations</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demo Suggestions */}
      {!showUpgrade && suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recommended Automations</h3>
            <Badge variant="outline" className="text-sm">
              {suggestions.length} opportunities found
            </Badge>
          </div>

          <div className="grid gap-4">
            {suggestions.map((suggestion) => (
              <Card key={suggestion.id} className="glass-card hover-glow">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <suggestion.icon className="size-6 text-primary" />
                    </div>
                    
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-lg">{suggestion.title}</h4>
                          <p className="text-muted-foreground text-sm mt-1">{suggestion.description}</p>
                        </div>
                        <Badge variant="outline" className="ml-4">
                          {suggestion.category}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-sm font-medium">Impact</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`size-2 rounded-full ${getImpactColor(suggestion.impact)}`} />
                            <span className="text-sm">{suggestion.impact}</span>
                          </div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-sm font-medium">Effort</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`size-2 rounded-full ${getEffortColor(suggestion.effort)}`} />
                            <span className="text-sm">{suggestion.effort}</span>
                          </div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-sm font-medium">ROI</div>
                          <div className="flex items-center gap-1 mt-1">
                            <TrendingUp className="size-3 text-green-500" />
                            <span className="text-sm font-semibold text-green-600">{suggestion.roi}</span>
                          </div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-sm font-medium">Time Saved</div>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="size-3 text-blue-500" />
                            <span className="text-sm font-semibold text-blue-600">{suggestion.timeSaved}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Priority Score:</span>
                          <Progress value={suggestion.priority} className="w-20 h-2" />
                          <span className="text-sm font-semibold">{suggestion.priority}%</span>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            Learn More
                          </Button>
                          <Button size="sm" className="hover-glow">
                            Build Automation
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}