import { Card } from "@/components/ui/card";

import { 
  Sheet, Mail, HardDrive, Calendar, FileText, Presentation, 
  FileEdit, MessageCircle, Slack, Users, Gamepad2, Video,
  Cloud, Heart, RotateCw, TrendingUp, CheckSquare, Trello,
  BarChart3, Bug, DollarSign, PieChart, FileSpreadsheet,
  CreditCard, Building, Briefcase, Linkedin,
  Send, Radio, Facebook, Target, Package, CloudDrizzle,
  Folder, Github, GitBranch, ShoppingBag, ShoppingCart,
  Store, Square
} from "lucide-react";

const integrations = [
  // Google Workspace
  { name: "Google Sheets", category: "Google Workspace", icon: Sheet },
  { name: "Gmail", category: "Google Workspace", icon: Mail },
  { name: "Google Drive", category: "Google Workspace", icon: HardDrive },
  { name: "Google Calendar", category: "Google Workspace", icon: Calendar },
  { name: "Google Docs", category: "Google Workspace", icon: FileText },
  { name: "Google Slides", category: "Google Workspace", icon: Presentation },
  { name: "Google Forms", category: "Google Workspace", icon: FileEdit },
  { name: "Google Chat", category: "Google Workspace", icon: MessageCircle },
  
  // Communication
  { name: "Slack", category: "Communication", icon: Slack },
  { name: "Microsoft Teams", category: "Communication", icon: Users },
  { name: "Discord", category: "Communication", icon: Gamepad2 },
  { name: "Zoom", category: "Communication", icon: Video },
  
  // CRM & Sales
  { name: "Salesforce", category: "CRM & Sales", icon: Cloud },
  { name: "HubSpot", category: "CRM & Sales", icon: Heart },
  { name: "Pipedrive", category: "CRM & Sales", icon: RotateCw },
  { name: "Zoho CRM", category: "CRM & Sales", icon: TrendingUp },
  
  // Project Management
  { name: "Asana", category: "Project Management", icon: CheckSquare },
  { name: "Trello", category: "Project Management", icon: Trello },
  { name: "Monday.com", category: "Project Management", icon: BarChart3 },
  { name: "Jira", category: "Project Management", icon: Bug },
  
  // Finance & Accounting
  { name: "QuickBooks", category: "Finance", icon: DollarSign },
  { name: "Xero", category: "Finance", icon: PieChart },
  { name: "FreshBooks", category: "Finance", icon: FileSpreadsheet },
  { name: "Stripe", category: "Finance", icon: CreditCard },
  
  // HR & Recruiting
  { name: "BambooHR", category: "HR", icon: Building },
  { name: "Workday", category: "HR", icon: Briefcase },
  { name: "Greenhouse", category: "HR", icon: Building },
  { name: "LinkedIn", category: "HR", icon: Linkedin },
  
  // Marketing
  { name: "Mailchimp", category: "Marketing", icon: Send },
  { name: "Constant Contact", category: "Marketing", icon: Radio },
  { name: "Facebook Ads", category: "Marketing", icon: Facebook },
  { name: "Google Ads", category: "Marketing", icon: Target },
  
  // Storage & Files
  { name: "Dropbox", category: "Storage", icon: Package },
  { name: "OneDrive", category: "Storage", icon: CloudDrizzle },
  { name: "Box", category: "Storage", icon: Folder },
  { name: "AWS S3", category: "Storage", icon: Package },
  
  // Development
  { name: "GitHub", category: "Development", icon: Github },
  { name: "GitLab", category: "Development", icon: GitBranch },
  { name: "Bitbucket", category: "Development", icon: Package },
  { name: "Jira", category: "Development", icon: Bug },
  
  // E-commerce
  { name: "Shopify", category: "E-commerce", icon: ShoppingBag },
  { name: "WooCommerce", category: "E-commerce", icon: ShoppingCart },
  { name: "BigCommerce", category: "E-commerce", icon: Store },
  { name: "Square", category: "E-commerce", icon: Square }
];

const categories = [...new Set(integrations.map(app => app.category))];

export const AppIntegrations = () => {
  return (
    <section className="container mx-auto py-12 md:py-16">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-semibold tracking-tight mb-4">
          Connect with 500+ applications
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          We can integrate Google Apps Script with virtually any application that has an API or webhook capability. 
          Here are some popular applications our clients commonly connect with.
        </p>
      </div>

      <div className="space-y-8">
        {categories.map((category) => (
          <div key={category} className="space-y-4">
            <h3 className="text-xl font-semibold text-primary">{category}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {integrations
                .filter(app => app.category === category)
                .map((app) => (
                  <Card key={app.name} className="p-4 text-center hover-scale glass-card tint-a">
                    <div className="mb-2 flex justify-center">
                      <app.icon className="size-8 text-primary" />
                    </div>
                    <p className="text-sm font-medium">{app.name}</p>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <p className="text-muted-foreground">
          Don't see your application? No problem! We can integrate with any service that provides an API or webhook.
        </p>
      </div>
    </section>
  );
};