import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, 
  MessageSquare, 
  FileText, 
  TrendingUp, 
  Sparkles, 
  Mic, 
  Zap, 
  BarChart3,
  Crown,
  Lock
} from "lucide-react";
import { AIWorkflowBuilder } from "@/components/ai/AIWorkflowBuilder";
import { SmartSuggestions } from "@/components/ai/SmartSuggestions";
import { DocumentProcessor } from "@/components/ai/DocumentProcessor";
import { ConversationalAssistant } from "@/components/ai/ConversationalAssistant";
import { PredictiveAnalytics } from "@/components/ai/PredictiveAnalytics";
import { AIIntegrations } from "@/components/ai/AIIntegrations";

const aiFeatures = [
  {
    id: "workflow-builder",
    title: "Natural Language Workflow Builder",
    description: "Describe your automation needs in plain English and watch AI convert them into working Google Apps Script solutions.",
    icon: MessageSquare,
    tier: "Premium",
    price: "$97/month",
    features: [
      "Natural language to code conversion",
      "Real-time workflow visualization",
      "Instant code generation",
      "Multi-step automation planning"
    ]
  },
  {
    id: "smart-suggestions",
    title: "AI Workflow Suggestions",
    description: "Intelligent analysis of your Google Workspace to identify automation opportunities and suggest custom workflows.",
    icon: Brain,
    tier: "Premium",
    price: "$97/month",
    features: [
      "Workspace usage analysis",
      "Custom automation recommendations",
      "ROI calculations",
      "Priority scoring"
    ]
  },
  {
    id: "document-processor",
    title: "Intelligent Document Processing",
    description: "Advanced AI parsing, classification, and content generation for emails, documents, and spreadsheets.",
    icon: FileText,
    tier: "Enterprise",
    price: "$197/month",
    features: [
      "Smart email parsing",
      "Document classification",
      "Content generation",
      "Data extraction"
    ]
  },
  {
    id: "conversational-assistant",
    title: "Conversational AI Assistant",
    description: "Voice-enabled setup, 24/7 AI support, and intelligent workflow optimization coaching.",
    icon: Mic,
    tier: "Enterprise",
    price: "$197/month",
    features: [
      "Voice-controlled setup",
      "24/7 AI support bot",
      "Workflow optimization",
      "Real-time assistance"
    ]
  },
  {
    id: "predictive-analytics",
    title: "Predictive Analytics & Intelligence",
    description: "Smart scheduling, performance predictions, and anomaly detection for your automated workflows.",
    icon: TrendingUp,
    tier: "Enterprise",
    price: "$197/month",
    features: [
      "Performance predictions",
      "Smart scheduling",
      "Anomaly detection",
      "Usage optimization"
    ]
  },
  {
    id: "ai-integrations",
    title: "Advanced AI Integrations",
    description: "Multi-modal AI capabilities, real-time agents, and custom AI models for enterprise workflows.",
    icon: Sparkles,
    tier: "Enterprise",
    price: "$297/month",
    features: [
      "Multi-modal AI",
      "Real-time AI agents",
      "Custom AI models",
      "Advanced integrations"
    ]
  }
];

export default function AIPlatform() {
  const [activeFeature, setActiveFeature] = useState("workflow-builder");
  const [showDemo, setShowDemo] = useState(false);

  const currentFeature = aiFeatures.find(f => f.id === activeFeature);

  const handleUpgrade = (tier: string) => {
    // This would integrate with your payment system
    alert(`Upgrading to ${tier} tier. This would redirect to payment in production.`);
  };

  const renderFeatureComponent = () => {
    switch (activeFeature) {
      case "workflow-builder":
        return <AIWorkflowBuilder />;
      case "smart-suggestions":
        return <SmartSuggestions />;
      case "document-processor":
        return <DocumentProcessor />;
      case "conversational-assistant":
        return <ConversationalAssistant />;
      case "predictive-analytics":
        return <PredictiveAnalytics />;
      case "ai-integrations":
        return <AIIntegrations />;
      default:
        return <AIWorkflowBuilder />;
    }
  };

  return (
    <>
      <Helmet>
        <title>AI-Powered Automation Platform | Apps Script Studio</title>
        <meta 
          name="description" 
          content="Advanced AI features for Google Apps Script automation. Natural language workflow builder, intelligent document processing, and predictive analytics." 
        />
        <link rel="canonical" href="/ai-platform" />
      </Helmet>

      <main className="min-h-screen bg-hero">
        {/* Hero Section */}
        <section className="container mx-auto pt-24 pb-12">
          <div className="text-center mb-12">
            <Badge className="mb-4 glass-card">
              <Sparkles className="size-4 mr-2" />
              AI-Powered Platform
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground">
              Next-Generation AI
              <br />
              <span className="bg-gradient-to-r from-primary to-muted-foreground bg-clip-text text-transparent">
                Automation Platform
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Transform your Google Workspace with cutting-edge AI. From natural language workflow 
              creation to intelligent document processing and predictive analytics.
            </p>
            <div className="flex gap-4 justify-center">
              <Button size="lg" onClick={() => setShowDemo(true)} className="hover-glow">
                <Zap className="size-5 mr-2" />
                Try AI Demo
              </Button>
              <Button variant="outline" size="lg" className="glass-card">
                <BarChart3 className="size-5 mr-2" />
                View Pricing
              </Button>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="container mx-auto py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {aiFeatures.map((feature) => (
              <Card 
                key={feature.id}
                className={`glass-card hover-glow cursor-pointer transition-all ${
                  activeFeature === feature.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setActiveFeature(feature.id)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <feature.icon className="size-8 text-primary" />
                    <Badge variant={feature.tier === "Enterprise" ? "destructive" : "secondary"}>
                      <Crown className="size-3 mr-1" />
                      {feature.tier}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {feature.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <div className="size-1.5 rounded-full bg-primary" />
                        {feat}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-lg">{feature.price}</span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpgrade(feature.tier);
                      }}
                    >
                      <Lock className="size-3 mr-1" />
                      Upgrade
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Interactive Demo Section */}
        <section className="container mx-auto py-12">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">
                    {currentFeature?.title}
                  </CardTitle>
                  <CardDescription className="text-lg mt-2">
                    {currentFeature?.description}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-lg px-4 py-2">
                  {currentFeature?.tier} Feature
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeFeature} onValueChange={setActiveFeature}>
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-6">
                  {aiFeatures.map((feature) => (
                    <TabsTrigger key={feature.id} value={feature.id} className="text-xs">
                      <feature.icon className="size-4 mr-1" />
                      {feature.title.split(' ')[0]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {aiFeatures.map((feature) => (
                  <TabsContent key={feature.id} value={feature.id}>
                    {renderFeatureComponent()}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </section>

        {/* CTA Section */}
        <section className="container mx-auto py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Transform Your Workflows?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join industry leaders who are already leveraging AI to automate their Google Workspace 
            and increase productivity by up to 400%.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" className="hover-glow">
              Start Free Trial
            </Button>
            <Button variant="outline" size="lg" className="glass-card">
              Schedule Demo
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}