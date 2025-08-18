import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, TrendingUp, Zap } from "lucide-react";

interface AutomationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  demo: {
    title: string;
    desc: string;
    img: string;
    animation: React.ReactNode;
    metrics: {
      timeSaved: string;
      efficiency: number;
      automationLevel: number;
      monthlyHours: string;
    };
    otherPlatformsComparison: {
      feature: string;
      apps: string;
      advantages: string[];
    };
  };
}

export const AutomationDialog = ({ isOpen, onClose, demo }: AutomationDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Zap className="size-6 text-primary" />
            {demo.title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid lg:grid-cols-2 gap-6 mt-4">
          {/* Animation & Preview */}
          <div className="space-y-4">
            <div className="glass-card p-4 rounded-lg">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="size-4" />
                Visual Automation Flow
              </h3>
              {demo.animation}
            </div>
            
            <div className="glass-card p-4 rounded-lg">
              <img 
                src={demo.img} 
                alt={`${demo.title} example`} 
                className="w-full rounded-md" 
              />
            </div>
          </div>

          {/* Metrics & Comparison */}
          <div className="space-y-4">
            {/* Efficiency Metrics */}
            <div className="glass-card p-4 rounded-lg space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="size-4" />
                Efficiency Metrics
              </h3>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Time Saved per Task</span>
                    <span className="font-semibold text-primary">{demo.metrics.timeSaved}</span>
                  </div>
                  <Progress value={demo.metrics.efficiency} className="h-2" />
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Automation Level</span>
                    <span className="font-semibold text-primary">{demo.metrics.automationLevel}%</span>
                  </div>
                  <Progress value={demo.metrics.automationLevel} className="h-2" />
                </div>
                
                <div className="pt-2 border-t border-border/50">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Monthly Hours Saved</span>
                    <Badge variant="secondary" className="font-semibold">
                      {demo.metrics.monthlyHours}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Platform Comparison */}
            <div className="glass-card p-4 rounded-lg space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="size-4" />
                vs. Other Automation Platforms
              </h3>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Our Solution:</strong> {demo.otherPlatformsComparison.feature}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Other Platforms:</strong> {demo.otherPlatformsComparison.apps}
                  </p>
                </div>
                
                <div className="pt-2 border-t border-border/50">
                  <p className="text-sm font-medium mb-2">Key Advantages:</p>
                  <ul className="space-y-1">
                    {demo.otherPlatformsComparison.advantages.map((advantage, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <CheckCircle2 className="size-3 mt-0.5 text-primary flex-shrink-0" />
                        {advantage}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Cost Comparison */}
            <div className="glass-card p-4 rounded-lg tint-a">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">$0/month</p>
                  <p className="text-xs text-muted-foreground">Google Apps Script</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-muted-foreground line-through">$50+/month</p>
                  <p className="text-xs text-muted-foreground">Other Platforms</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};