import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Brain, Zap, Clock, TrendingUp } from "lucide-react";
import aiShowcaseImage from "@/assets/ai-automation-showcase.jpg";

export const AIShowcase = () => {
  return (
    <section className="container mx-auto py-16 md:py-24">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        {/* Content */}
        <div className="space-y-6">
          <Badge variant="secondary" className="mb-4">
            <Brain className="size-4 mr-2" />
            AI-Powered Automation
          </Badge>
          
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            The Future of Workflow Automation is Here
          </h2>
          
          <p className="text-lg text-muted-foreground">
            Our AI-driven Google Apps Script solutions don't just automate tasks—they learn, adapt, and optimize your workflows for maximum efficiency. Experience the next generation of business automation.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-4 tint-a">
              <div className="flex items-center gap-3">
                <Zap className="size-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Instant Automation</h3>
                  <p className="text-sm text-muted-foreground">Deploy in minutes, not weeks</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4 tint-b">
              <div className="flex items-center gap-3">
                <Clock className="size-8 text-primary" />
                <div>
                  <h3 className="font-semibold">24/7 Operations</h3>
                  <p className="text-sm text-muted-foreground">Never miss a workflow trigger</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4 tint-c">
              <div className="flex items-center gap-3">
                <TrendingUp className="size-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Smart Optimization</h3>
                  <p className="text-sm text-muted-foreground">AI learns and improves over time</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4 tint-a">
              <div className="flex items-center gap-3">
                <Brain className="size-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Intelligent Insights</h3>
                  <p className="text-sm text-muted-foreground">Data-driven recommendations</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Showcase Image */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded-2xl"></div>
          <img
            src={aiShowcaseImage}
            alt="AI-powered automation showcase with futuristic robot managing Google Workspace workflows"
            className="w-full rounded-2xl shadow-2xl glass-card"
            loading="lazy"
          />
          
          {/* Floating metrics */}
          <div className="absolute top-4 right-4 glass-card p-3 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">300%</div>
              <div className="text-xs text-muted-foreground">Efficiency Boost</div>
            </div>
          </div>
          
          <div className="absolute bottom-4 left-4 glass-card p-3 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">95%</div>
              <div className="text-xs text-muted-foreground">Automation Rate</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};