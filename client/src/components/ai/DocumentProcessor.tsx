import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  FileText, 
  Mail, 
  Brain, 
  Upload, 
  Download,
  Lock,
  Sparkles,
  Zap,
  CheckCircle,
  AlertCircle
} from "lucide-react";

export function DocumentProcessor() {
  const [activeTab, setActiveTab] = useState("email-parser");
  const [processing, setProcessing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleProcess = () => {
    setProcessing(true);
    setShowUpgrade(true);
    setTimeout(() => setProcessing(false), 2000);
  };

  const features = [
    {
      id: "email-parser",
      title: "Smart Email Parser",
      description: "Extract structured data from emails using advanced AI",
      icon: Mail,
      capabilities: [
        "Invoice data extraction",
        "Contact information parsing",
        "Date and time recognition",
        "Automatic categorization"
      ]
    },
    {
      id: "document-classifier",
      title: "Document Classifier",
      description: "Automatically categorize and organize documents",
      icon: FileText,
      capabilities: [
        "Document type detection",
        "Content-based sorting",
        "Metadata extraction",
        "Folder organization"
      ]
    },
    {
      id: "content-generator",
      title: "Content Generator",
      description: "Generate documents, reports, and emails with AI",
      icon: Brain,
      capabilities: [
        "Report generation",
        "Email templates",
        "Data summaries",
        "Custom content"
      ]
    }
  ];

  const sampleResults = {
    "email-parser": {
      original: "Subject: Invoice #12345 from ABC Corp\nDue Date: March 15, 2024\nAmount: $1,250.00\nVendor: ABC Corporation",
      extracted: {
        invoice_number: "12345",
        vendor: "ABC Corporation", 
        amount: 1250.00,
        due_date: "2024-03-15",
        currency: "USD"
      }
    },
    "document-classifier": {
      classifications: [
        { name: "Invoice.pdf", category: "Financial", confidence: 98 },
        { name: "Contract.docx", category: "Legal", confidence: 95 },
        { name: "Report.xlsx", category: "Analytics", confidence: 92 }
      ]
    },
    "content-generator": {
      prompt: "Generate a weekly status report",
      generated: "Weekly Status Report - Week of March 11, 2024\n\nProject Progress:\n• Automation workflows: 85% complete\n• Documentation updates: 70% complete\n• Testing phase: 60% complete\n\nKey Achievements:\n• Implemented email processing system\n• Optimized workflow performance by 40%\n• Completed user training sessions"
    }
  };

  return (
    <div className="space-y-6">
      {/* Feature Selection */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          {features.map((feature) => (
            <TabsTrigger key={feature.id} value={feature.id} className="text-xs">
              <feature.icon className="size-4 mr-1" />
              {feature.title.split(' ')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        {features.map((feature) => (
          <TabsContent key={feature.id} value={feature.id}>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <feature.icon className="size-5" />
                  {feature.title}
                </CardTitle>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {feature.capabilities.map((capability, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <CheckCircle className="size-4 text-green-500" />
                      <span className="text-sm">{capability}</span>
                    </div>
                  ))}
                </div>

                {/* Demo Interface */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  {feature.id === "email-parser" && (
                    <div className="space-y-3">
                      <Label>Email Content to Parse</Label>
                      <textarea
                        className="w-full p-3 rounded border bg-background min-h-20"
                        placeholder="Paste email content here..."
                        defaultValue={sampleResults["email-parser"].original}
                        disabled={showUpgrade}
                      />
                    </div>
                  )}

                  {feature.id === "document-classifier" && (
                    <div className="space-y-3">
                      <Label>Upload Documents to Classify</Label>
                      <div className="border-2 border-dashed rounded-lg p-6 text-center">
                        <Upload className="size-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Drop files here or click to upload
                        </p>
                      </div>
                    </div>
                  )}

                  {feature.id === "content-generator" && (
                    <div className="space-y-3">
                      <Label>Content Generation Prompt</Label>
                      <Input
                        placeholder="Describe what content you want to generate..."
                        defaultValue={sampleResults["content-generator"].prompt}
                        disabled={showUpgrade}
                      />
                    </div>
                  )}

                  <Button 
                    onClick={handleProcess}
                    disabled={processing || showUpgrade}
                    className="w-full hover-glow"
                  >
                    {processing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Zap className="size-4 mr-2" />
                        Process with AI
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Premium Feature Overlay */}
      {showUpgrade && (
        <Card className="glass-card border-primary/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
          <CardContent className="p-8 text-center relative">
            <Lock className="size-12 mx-auto mb-4 text-primary" />
            <h3 className="text-2xl font-bold mb-2">Enterprise AI Processing</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Unlock intelligent document processing with advanced AI models for email parsing, 
              document classification, and content generation.
            </p>
            <div className="flex gap-4 justify-center mb-4">
              <Button size="lg" className="hover-glow">
                Upgrade to Enterprise - $197/month
              </Button>
              <Button variant="outline" size="lg">
                Try Free for 14 Days
              </Button>
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span>✓ Unlimited processing</span>
              <span>✓ Custom AI models</span>
              <span>✓ API access</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demo Results */}
      {!showUpgrade && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5" />
              Processing Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeTab === "email-parser" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Extracted Data</Label>
                  <pre className="bg-muted p-4 rounded-lg text-sm mt-2 overflow-x-auto">
                    {JSON.stringify(sampleResults["email-parser"].extracted, null, 2)}
                  </pre>
                </div>
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="size-3 mr-1" />
                  100% accuracy
                </Badge>
              </div>
            )}

            {activeTab === "document-classifier" && (
              <div className="space-y-3">
                {sampleResults["document-classifier"].classifications.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="size-4" />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.category}</Badge>
                      <span className="text-sm text-muted-foreground">{item.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "content-generator" && (
              <div>
                <Label className="text-sm font-medium">Generated Content</Label>
                <div className="bg-muted p-4 rounded-lg mt-2">
                  <pre className="whitespace-pre-wrap text-sm">
                    {sampleResults["content-generator"].generated}
                  </pre>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm">
                    <Download className="size-3 mr-1" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm">
                    Edit Content
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}