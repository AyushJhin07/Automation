import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import heroImage from "@/assets/hero-automation-interconnected.jpg";
import { Link } from "react-router-dom";
import {
  Mail, CalendarRange, FileSpreadsheet, FileText, BarChart3, FolderCog,
  Inbox, CheckCircle2, Workflow, Code2, Download, Play
} from "lucide-react";
import { useCallback, useState } from "react";
import { AutomationDialog } from "@/components/demos/AutomationDialog";
import { 
  FormsToGmailAnimation, 
  SheetsToPdfAnimation, 
  KpiDashboardAnimation, 
  SimpleWorkflowAnimation 
} from "@/components/demos/AutomationAnimations";
import { WorkflowButtons } from "@/components/sections/WorkflowButtons";
import { AIShowcase } from "@/components/sections/AIShowcase";
import { AppIntegrations } from "@/components/sections/AppIntegrations";

// Demo preview assets
import imgFormsSheets from "@/assets/demos/forms-sheets-gmail.jpg";
import imgSheetsDocs from "@/assets/demos/sheets-docs-pdf-gmail.jpg";
import imgKpi from "@/assets/demos/kpi-dashboards.jpg";
import imgCalendar from "@/assets/demos/calendar-workflows.jpg";
import imgDrive from "@/assets/demos/drive-automation.jpg";
import imgGmail from "@/assets/demos/gmail-parsing.jpg";
import imgApproval from "@/assets/demos/approval-flows.jpg";
import imgSlides from "@/assets/demos/slides-auto-report.jpg";

interface DemoItem {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
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
}

const demos: DemoItem[] = [
  { 
    title: "Forms → Sheets → Gmail", 
    desc: "Capture leads and auto‑send personalized follow‑ups.", 
    icon: Mail, 
    img: imgFormsSheets,
    animation: <FormsToGmailAnimation />,
    metrics: {
      timeSaved: "15 min → 30 sec",
      efficiency: 97,
      automationLevel: 95,
      monthlyHours: "40+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Single Apps Script with native Google integrations",
      apps: "Requires Google Forms + Sheets + Gmail + 2-3 automation steps",
      advantages: [
        "No monthly subscription fees",
        "Faster execution (no API delays)",
        "Advanced email templating with Google Docs",
        "Custom business logic and data validation"
      ]
    }
  },
  { 
    title: "Sheets → Docs → PDF → Gmail", 
    desc: "Generate quotes/invoices as PDFs and email them.", 
    icon: FileText, 
    img: imgSheetsDocs,
    animation: <SheetsToPdfAnimation />,
    metrics: {
      timeSaved: "25 min → 2 min",
      efficiency: 92,
      automationLevel: 88,
      monthlyHours: "60+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Native Google Workspace PDF generation",
      apps: "Requires Sheets + Docs + PDF converter + Gmail + storage",
      advantages: [
        "Perfect Google Docs formatting",
        "No file size limits",
        "Custom PDF templates",
        "Automatic version control"
      ]
    }
  },
  { 
    title: "Scheduled KPI Dashboards", 
    desc: "Auto‑refresh dashboards and email summaries.", 
    icon: BarChart3, 
    img: imgKpi,
    animation: <KpiDashboardAnimation />,
    metrics: {
      timeSaved: "2 hrs → 5 min",
      efficiency: 96,
      automationLevel: 98,
      monthlyHours: "30+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Built-in Google Sheets charts and time-based triggers",
      apps: "Requires data source + BI tool + scheduler + email service",
      advantages: [
        "Real-time Google Sheets integration",
        "Custom chart generation",
        "No data export/import delays",
        "Advanced conditional formatting"
      ]
    }
  },
  { 
    title: "Calendar Workflows", 
    desc: "Bookings, reminders, and post‑meeting follow‑ups.", 
    icon: CalendarRange, 
    img: imgCalendar,
    animation: <SimpleWorkflowAnimation icon={CalendarRange} steps={["New booking", "Auto-confirmation", "Reminder sent", "Follow-up email"]} />,
    metrics: {
      timeSaved: "10 min → 1 min",
      efficiency: 90,
      automationLevel: 85,
      monthlyHours: "25+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Native Google Calendar API integration",
      apps: "Requires Calendar + Email service + Scheduler + Forms",
      advantages: [
        "Deep calendar integration",
        "Meeting link generation",
        "Attendee management",
        "Timezone handling"
      ]
    }
  },
  { 
    title: "Drive Automation", 
    desc: "Auto‑sort, rename, and set permissions on files.", 
    icon: FolderCog, 
    img: imgDrive,
    animation: <SimpleWorkflowAnimation icon={FolderCog} steps={["File uploaded", "Auto-sorting", "Permissions set", "Team notified"]} />,
    metrics: {
      timeSaved: "5 min → 10 sec",
      efficiency: 97,
      automationLevel: 94,
      monthlyHours: "20+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Full Google Drive API access with batch operations",
      apps: "Requires Drive + File management service + Permissions tool",
      advantages: [
        "Bulk file operations",
        "Advanced permission management",
        "Custom folder structures",
        "File content analysis"
      ]
    }
  },
  { 
    title: "Gmail Parsing", 
    desc: "Extract data from emails into Sheets + labeling.", 
    icon: Inbox, 
    img: imgGmail,
    animation: <SimpleWorkflowAnimation icon={Inbox} steps={["Email received", "Data extracted", "Added to Sheets", "Email labeled"]} />,
    metrics: {
      timeSaved: "8 min → 30 sec",
      efficiency: 94,
      automationLevel: 91,
      monthlyHours: "35+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Advanced Gmail API with custom parsing logic",
      apps: "Requires Gmail + Parser + Sheets + Label manager",
      advantages: [
        "Complex email parsing",
        "Custom extraction rules",
        "Attachment handling",
        "Thread management"
      ]
    }
  },
  { 
    title: "Approval Flows", 
    desc: "One‑click approve/deny via email/Chat.", 
    icon: CheckCircle2, 
    img: imgApproval,
    animation: <SimpleWorkflowAnimation icon={CheckCircle2} steps={["Request submitted", "Approver notified", "Decision made", "Status updated"]} />,
    metrics: {
      timeSaved: "20 min → 1 min",
      efficiency: 95,
      automationLevel: 89,
      monthlyHours: "50+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Google Apps Script with Gmail/Chat integration",
      apps: "Requires Forms + Approval tool + Email + Notifications",
      advantages: [
        "Custom approval logic",
        "Email & Chat integration",
        "Audit trail in Sheets",
        "Role-based permissions"
      ]
    }
  },
  { 
    title: "Slides Auto‑Reports", 
    desc: "Build decks from Sheets data on a schedule.", 
    icon: Workflow, 
    img: imgSlides,
    animation: <SimpleWorkflowAnimation icon={Workflow} steps={["Data updated", "Charts generated", "Slides created", "Report shared"]} />,
    metrics: {
      timeSaved: "3 hrs → 15 min",
      efficiency: 92,
      automationLevel: 87,
      monthlyHours: "45+ hrs"
    },
    otherPlatformsComparison: {
      feature: "Native Google Slides API with chart generation",
      apps: "Requires Sheets + Presentation tool + Scheduler + Sharing",
      advantages: [
        "Google Slides template system",
        "Dynamic chart embedding",
        "Auto-formatting",
        "Brand consistency"
      ]
    }
  },
];

const Index = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/';
  const [selectedDemo, setSelectedDemo] = useState<DemoItem | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--x', `${x}px`);
    e.currentTarget.style.setProperty('--y', `${y}px`);
  }, []);

  return (
    <main>
      <Helmet>
        <title>Google Apps Script Automation for HR, Finance, Sales | Book a Call</title>
        <meta name="description" content="Automate Google Sheets, Gmail, Drive, Calendar with Apps Script + AI. HR, finance, sales & ops workflows. Book a 30‑min consultation." />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content="Google Apps Script Automation for HR, Finance, Sales" />
        <meta property="og:description" content="Automate Google Workspace with Apps Script + AI. Book a 30‑min consultation." />
      </Helmet>

      {/* Hero */}
      <section className="relative bg-hero">
        <div className="radial-spotlight" onMouseMove={handleMouseMove}>
          <div className="container mx-auto grid lg:grid-cols-2 gap-8 py-16 md:py-24 items-center">
            <div className="animate-fade-in">
              <Badge variant="secondary" className="mb-4">Google Workspace Automation</Badge>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Automate Google Workspace with Apps Script + AI
              </h1>
              <p className="text-lg text-muted-foreground mb-6 max-w-xl">
                We build high‑impact automations for HR, Finance, Sales, and Operations teams using Google Apps Script—so your team saves hours every week.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="hero" className="hover-scale">
                  <Link to="/schedule">Book a 30‑min call</Link>
                </Button>
                <Button asChild variant="outline" className="hover-scale">
                  <a href="#demos">Explore demos</a>
                </Button>
              </div>
            </div>
            <div className="relative animate-scale-in">
            <div className="relative">
              <img
                src={heroImage}
                alt="Dynamic automation workflow with floating Google Workspace icons and flowing data streams"
                className="w-full rounded-xl shadow-md glass-card animate-scale-in animate-pulse"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-primary/10 rounded-xl pointer-events-none animate-pulse"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/5 to-transparent rounded-xl pointer-events-none animate-ping opacity-20"></div>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3D Workflow Buttons */}
      <WorkflowButtons />

      {/* AI Automation Showcase */}
      <AIShowcase />

      {/* Pre-Built Apps Callout */}
      <section className="container mx-auto py-16">
        <Card className="glass-card border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                  <Code2 className="size-4 mr-2" />
                  New: Ready-to-Use Scripts
                </Badge>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Skip the Wait. Get
                  <br />
                  <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                    Pre-Built Solutions
                  </span>
                </h2>
                <p className="text-muted-foreground text-lg mb-6">
                  Download working Google Apps Script prototypes that you can implement in minutes. 
                  Perfect for teams who need automation NOW, not in weeks.
                </p>
                <div className="flex gap-4">
                  <Button asChild size="lg" className="hover-glow">
                    <Link to="/pre-built-apps">
                      <Download className="size-5 mr-2" />
                      Browse Pre-Built Apps
                    </Link>
                  </Button>
                  <Button variant="outline" size="lg" className="glass-card">
                    <Play className="size-5 mr-2" />
                    See Live Demos
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-primary mb-1">6</div>
                  <div className="text-sm text-muted-foreground">Ready Scripts</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 mb-1">15min</div>
                  <div className="text-sm text-muted-foreground">Setup Time</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600 mb-1">$0</div>
                  <div className="text-sm text-muted-foreground">Monthly Fees</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600 mb-1">100%</div>
                  <div className="text-sm text-muted-foreground">Customizable</div>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Interactive Demos */}
      <section id="demos" className="container mx-auto py-12 md:py-16">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold tracking-tight">What we can automate</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">Click any card to see animations, metrics, and how we compare to other platforms.</p>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {demos.map((demo, idx) => (
            <Card 
              key={demo.title}
              className="p-6 glass-card hover-glow hover-scale h-full cursor-pointer transition-all duration-300"
              onClick={() => setSelectedDemo(demo)}
            >
              <div className="flex items-start gap-4">
                <div className={`size-10 rounded-md flex items-center justify-center ${idx % 3 === 0 ? 'tint-a' : idx % 3 === 1 ? 'tint-b' : 'tint-c'}`}>
                  <demo.icon className="size-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold leading-tight">{demo.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{demo.desc}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {demo.metrics.timeSaved}
                    </Badge>
                    <Badge className="text-xs efficiency-badge">
                      {demo.metrics.efficiency}% efficient
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
        
        {/* Automation Dialog */}
        {selectedDemo && (
          <AutomationDialog
            isOpen={!!selectedDemo}
            onClose={() => setSelectedDemo(null)}
            demo={selectedDemo}
          />
        )}
      </section>

      {/* Process */}
      <section className="container mx-auto py-12 md:py-16">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="text-muted-foreground mt-2">Simple, fast, outcome‑focused.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Discovery call", desc: "Understand your workflow and metrics of success." },
            { step: "2", title: "Prototype", desc: "We build a small slice you can try within days." },
            { step: "3", title: "Automate", desc: "Production‑grade build, docs, and training." },
          ].map((s, i) => (
            <Card key={s.step} className={`p-6 glass-card hover-glow text-center hover-scale ${i % 3 === 0 ? 'tint-a' : i % 3 === 1 ? 'tint-b' : 'tint-c'}`}>
              <div className="mx-auto mb-2 size-10 rounded-full bg-secondary flex items-center justify-center font-semibold">
                {s.step}
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* App Integrations */}
      <AppIntegrations />

      {/* CTA */}
      <section className="container mx-auto py-12 md:py-16">
        <div className="glass-card rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold">Contact for pricing</h3>
            <p className="text-muted-foreground">No lock‑in. Clear outcomes. Fast delivery.</p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="hero" className="hover-scale"><Link to="/schedule">Book a 30‑min call</Link></Button>
            <Button asChild variant="outline" className="hover-scale"><Link to="/contact">Contact us</Link></Button>
          </div>
        </div>
      </section>

      {/* JSON‑LD */}
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Apps Script Studio',
            url: canonical,
            sameAs: [],
          })}
        </script>
      </Helmet>
    </main>
  );
};

export default Index;
