import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  BarChart3,
  Calendar,
  Lock,
  Zap,
  Target,
  Activity,
  BrainCircuit
} from "lucide-react";

interface Metric {
  label: string;
  value: number;
  trend: "up" | "down" | "stable";
  prediction: number;
}

interface Anomaly {
  id: string;
  type: string;
  severity: "high" | "medium" | "low";
  description: string;
  timestamp: Date;
  recommendation: string;
}

export function PredictiveAnalytics() {
  const [activeTab, setActiveTab] = useState("performance");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  useEffect(() => {
    // Simulate loading analytics data
    setMetrics([
      { label: "Workflow Efficiency", value: 87, trend: "up", prediction: 92 },
      { label: "Processing Speed", value: 156, trend: "up", prediction: 180 },
      { label: "Error Rate", value: 2.3, trend: "down", prediction: 1.8 },
      { label: "Resource Usage", value: 68, trend: "stable", prediction: 70 }
    ]);

    setAnomalies([
      {
        id: "1",
        type: "Performance Degradation",
        severity: "high",
        description: "Email processing workflow showing 40% slower performance",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        recommendation: "Consider optimizing Gmail API calls and implementing caching"
      },
      {
        id: "2", 
        type: "Unusual Pattern",
        severity: "medium",
        description: "Spike in document processing requests during off-hours",
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
        recommendation: "Review automation triggers for potential optimization"
      },
      {
        id: "3",
        type: "Resource Limit",
        severity: "low", 
        description: "Approaching daily API quota limit for Google Sheets",
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
        recommendation: "Implement batching for sheet operations"
      }
    ]);
  }, []);

  const handleAnalyze = () => {
    setShowUpgrade(true);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "bg-red-500";
      case "medium": return "bg-yellow-500"; 
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="size-4 text-green-500" />;
      case "down": return <TrendingUp className="size-4 text-red-500 rotate-180" />;
      case "stable": return <Activity className="size-4 text-gray-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Analytics Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="size-5" />
            Predictive Analytics Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {metrics.map((metric, idx) => (
              <Card key={idx} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{metric.label}</span>
                  {getTrendIcon(metric.trend)}
                </div>
                <div className="text-2xl font-bold mb-1">{metric.value}</div>
                <div className="text-xs text-muted-foreground">
                  Predicted: {metric.prediction} (next week)
                </div>
                <Progress 
                  value={(metric.value / metric.prediction) * 100} 
                  className="h-1 mt-2"
                />
              </Card>
            ))}
          </div>

          <Button 
            onClick={handleAnalyze}
            className="w-full hover-glow"
          >
            <Zap className="size-4 mr-2" />
            Generate Advanced Analytics
          </Button>
        </CardContent>
      </Card>

      {/* Detailed Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="performance">
            <BarChart3 className="size-4 mr-1" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="scheduling">
            <Calendar className="size-4 mr-1" />
            Smart Scheduling
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            <AlertTriangle className="size-4 mr-1" />
            Anomalies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Performance Predictions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-2">Weekly Forecast</h4>
                    <div className="grid grid-cols-7 gap-2 text-center text-xs">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, idx) => (
                        <div key={day} className="space-y-1">
                          <div className="font-medium">{day}</div>
                          <div className="h-16 bg-primary/20 rounded relative">
                            <div 
                              className="absolute bottom-0 w-full bg-primary rounded"
                              style={{ height: `${Math.random() * 80 + 20}%` }}
                            />
                          </div>
                          <div className="text-muted-foreground">{85 + idx * 2}%</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-2">Optimization Opportunities</h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                          <Target className="size-3 text-green-500" />
                          Batch email processing: +15% efficiency
                        </li>
                        <li className="flex items-center gap-2">
                          <Target className="size-3 text-blue-500" />
                          Cache API responses: +22% speed
                        </li>
                        <li className="flex items-center gap-2">
                          <Target className="size-3 text-yellow-500" />
                          Optimize triggers: +8% reliability
                        </li>
                      </ul>
                    </div>

                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-2">Resource Planning</h4>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>API Quota Usage</span>
                            <span>67%</span>
                          </div>
                          <Progress value={67} className="h-2" />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Storage Usage</span>
                            <span>23%</span>
                          </div>
                          <Progress value={23} className="h-2" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduling">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Smart Scheduling Optimization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold mb-3">Optimal Execution Times</h4>
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between p-3 bg-background rounded">
                      <div>
                        <div className="font-medium">Email Processing</div>
                        <div className="text-sm text-muted-foreground">High volume workflow</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">2:00 AM - 4:00 AM</div>
                        <div className="text-sm text-green-600">98% success rate</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-background rounded">
                      <div>
                        <div className="font-medium">Report Generation</div>
                        <div className="text-sm text-muted-foreground">CPU intensive task</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">6:00 AM - 8:00 AM</div>
                        <div className="text-sm text-green-600">95% success rate</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-background rounded">
                      <div>
                        <div className="font-medium">Data Backup</div>
                        <div className="text-sm text-muted-foreground">Low priority task</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">11:00 PM - 1:00 AM</div>
                        <div className="text-sm text-green-600">92% success rate</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold mb-3">Smart Recommendations</h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Clock className="size-4 text-blue-500 mt-0.5" />
                      <span>Reschedule document processing to off-peak hours for 30% faster execution</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Calendar className="size-4 text-green-500 mt-0.5" />
                      <span>Enable weekend batch processing for non-urgent workflows</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <TrendingUp className="size-4 text-yellow-500 mt-0.5" />
                      <span>Increase backup frequency during high-activity periods</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Anomaly Detection & Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {anomalies.map((anomaly) => (
                  <div key={anomaly.id} className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`size-3 rounded-full ${getSeverityColor(anomaly.severity)}`} />
                        <div>
                          <h4 className="font-semibold">{anomaly.type}</h4>
                          <p className="text-sm text-muted-foreground">
                            {anomaly.timestamp.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant={anomaly.severity === "high" ? "destructive" : "outline"}>
                        {anomaly.severity.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <p className="text-sm mb-3">{anomaly.description}</p>
                    
                    <div className="p-3 bg-background rounded border-l-4 border-l-primary">
                      <div className="text-sm font-medium mb-1">Recommendation:</div>
                      <div className="text-sm text-muted-foreground">{anomaly.recommendation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Premium Feature Overlay */}
      {showUpgrade && (
        <Card className="glass-card border-primary/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
          <CardContent className="p-8 text-center relative">
            <Lock className="size-12 mx-auto mb-4 text-primary" />
            <h3 className="text-2xl font-bold mb-2">Enterprise Predictive Analytics</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Unlock advanced predictive analytics with performance forecasting, smart scheduling 
              optimization, and real-time anomaly detection for your automation workflows.
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
                <BarChart3 className="size-3" />
                <span>Performance Predictions</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="size-3" />
                <span>Smart Scheduling</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3" />
                <span>Anomaly Detection</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="size-3" />
                <span>Usage Optimization</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}