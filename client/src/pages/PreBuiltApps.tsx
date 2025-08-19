import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Mail, 
  FileSpreadsheet, 
  Calendar, 
  FolderCog, 
  BarChart3, 
  CheckCircle2,
  Download,
  Play,
  Code,
  Clock,
  Users
} from "lucide-react";

const preBuiltApps = [
  {
    id: "email-automation",
    title: "Email to Sheets Automation",
    description: "Automatically extract data from Gmail emails and add to Google Sheets",
    icon: Mail,
    timeSaved: "15 min → 30 sec",
    complexity: "Beginner",
    features: ["Email parsing", "Data extraction", "Sheet updates", "Notifications"],
    price: "Free"
  },
  {
    id: "report-generator",
    title: "Automated Report Generator",
    description: "Generate PDF reports from Google Sheets data and email them",
    icon: BarChart3,
    timeSaved: "2 hrs → 5 min",
    complexity: "Intermediate",
    features: ["Data collection", "PDF generation", "Email distribution", "Scheduling"],
    price: "Free"
  },
  {
    id: "calendar-booking",
    title: "Smart Calendar Booking",
    description: "Automated booking system with confirmations and reminders",
    icon: Calendar,
    timeSaved: "10 min → 1 min",
    complexity: "Beginner",
    features: ["Availability checking", "Event creation", "Confirmations", "Reminders"],
    price: "Free"
  },
  {
    id: "file-organizer",
    title: "Drive File Organizer",
    description: "Automatically organize and categorize files in Google Drive",
    icon: FolderCog,
    timeSaved: "5 min → 10 sec",
    complexity: "Intermediate",
    features: ["File scanning", "Auto-categorization", "Folder creation", "Permissions"],
    price: "Free"
  },
  {
    id: "expense-tracker",
    title: "Expense Tracking System",
    description: "Process expense receipts and manage approval workflows",
    icon: CheckCircle2,
    timeSaved: "20 min → 2 min",
    complexity: "Advanced",
    features: ["Receipt processing", "Expense categorization", "Approval workflow", "Reporting"],
    price: "Free"
  },
  {
    id: "task-automation",
    title: "Task Management Automation",
    description: "Automate task assignments, reminders, and status updates",
    icon: Users,
    timeSaved: "30 min → 3 min",
    complexity: "Intermediate",
    features: ["Task tracking", "Automated reminders", "Status updates", "Team notifications"],
    price: "Free"
  }
];

const PreBuiltApps = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/pre-built-apps';

  const handleDownload = (appId: string) => {
    // This would trigger the download of the Google Apps Script file
    console.log(`Downloading ${appId} script...`);
    // In a real implementation, this would download the .gs file
  };

  const handleDemo = (appId: string) => {
    // This would show a live demo of the automation
    console.log(`Starting demo for ${appId}...`);
    // In a real implementation, this would open a demo modal
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case "Beginner": return "bg-green-500";
      case "Intermediate": return "bg-yellow-500";
      case "Advanced": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>Pre-Built Google Apps Script Automations | Apps Script Studio</title>
        <meta 
          name="description" 
          content="Download ready-to-use Google Apps Script automations for Gmail, Sheets, Calendar, and Drive. Free templates for common business workflows." 
        />
        <link rel="canonical" href={canonical} />
      </Helmet>

      {/* Header */}
      <div className="text-center mb-12">
        <Badge className="mb-4 glass-card">
          <Code className="size-4 mr-2" />
          Ready-to-Use Scripts
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold mb-6">
          Pre-Built Google Apps Script
          <br />
          <span className="bg-gradient-to-r from-primary to-muted-foreground bg-clip-text text-transparent">
            Automations
          </span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
          Skip the development time. Download working Google Apps Script prototypes that you can 
          implement in minutes. Perfect for teams who need automation NOW.
        </p>
      </div>

      {/* Apps Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {preBuiltApps.map((app) => (
          <Card key={app.id} className="glass-card hover-glow">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <app.icon className="size-8 text-primary" />
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs">
                    {app.price}
                  </Badge>
                  <Badge 
                    className={`text-xs text-white ${getComplexityColor(app.complexity)}`}
                  >
                    {app.complexity}
                  </Badge>
                </div>
              </div>
              <CardTitle className="text-lg">{app.title}</CardTitle>
              <CardDescription>{app.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-green-500" />
                  <span className="text-sm font-medium text-green-600">
                    Time Saved: {app.timeSaved}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Features:</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {app.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-xs">
                        <div className="size-1.5 rounded-full bg-primary" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleDownload(app.id)}
                  >
                    <Download className="size-3 mr-1" />
                    Download
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDemo(app.id)}
                  >
                    <Play className="size-3 mr-1" />
                    Demo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* How It Works */}
      <section className="py-12">
        <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="glass-card text-center p-6">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-primary">1</span>
            </div>
            <h3 className="font-semibold mb-2">Download Script</h3>
            <p className="text-sm text-muted-foreground">
              Get the complete Google Apps Script code with documentation
            </p>
          </Card>
          
          <Card className="glass-card text-center p-6">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-primary">2</span>
            </div>
            <h3 className="font-semibold mb-2">Configure & Deploy</h3>
            <p className="text-sm text-muted-foreground">
              Follow our setup guide to customize and deploy to your Google Workspace
            </p>
          </Card>
          
          <Card className="glass-card text-center p-6">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-xl font-bold text-primary">3</span>
            </div>
            <h3 className="font-semibold mb-2">Start Automating</h3>
            <p className="text-sm text-muted-foreground">
              Your automation runs automatically, saving hours every week
            </p>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 text-center">
        <Card className="glass-card border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold mb-4">Need Custom Automation?</h2>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              These pre-built scripts are great starting points, but every business has unique needs. 
              Let's build something custom for your specific workflows.
            </p>
            <div className="flex gap-4 justify-center">
              <Button size="lg" className="hover-glow">
                Schedule Custom Consultation
              </Button>
              <Button variant="outline" size="lg" className="glass-card">
                View Custom Examples
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default PreBuiltApps;