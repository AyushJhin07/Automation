import { Card } from "@/components/ui/card";

const integrations = [
  // Google Workspace
  { name: "Google Sheets", category: "Google Workspace", logo: "📊" },
  { name: "Gmail", category: "Google Workspace", logo: "📧" },
  { name: "Google Drive", category: "Google Workspace", logo: "💾" },
  { name: "Google Calendar", category: "Google Workspace", logo: "📅" },
  { name: "Google Docs", category: "Google Workspace", logo: "📄" },
  { name: "Google Slides", category: "Google Workspace", logo: "📽️" },
  { name: "Google Forms", category: "Google Workspace", logo: "📝" },
  { name: "Google Chat", category: "Google Workspace", logo: "💬" },
  
  // Communication
  { name: "Slack", category: "Communication", logo: "💬" },
  { name: "Microsoft Teams", category: "Communication", logo: "👥" },
  { name: "Discord", category: "Communication", logo: "🎮" },
  { name: "Zoom", category: "Communication", logo: "📹" },
  
  // CRM & Sales
  { name: "Salesforce", category: "CRM & Sales", logo: "☁️" },
  { name: "HubSpot", category: "CRM & Sales", logo: "🧡" },
  { name: "Pipedrive", category: "CRM & Sales", logo: "🔄" },
  { name: "Zoho CRM", category: "CRM & Sales", logo: "📈" },
  
  // Project Management
  { name: "Asana", category: "Project Management", logo: "✅" },
  { name: "Trello", category: "Project Management", logo: "📋" },
  { name: "Monday.com", category: "Project Management", logo: "📊" },
  { name: "Jira", category: "Project Management", logo: "🐛" },
  
  // Finance & Accounting
  { name: "QuickBooks", category: "Finance", logo: "💰" },
  { name: "Xero", category: "Finance", logo: "📊" },
  { name: "FreshBooks", category: "Finance", logo: "📄" },
  { name: "Stripe", category: "Finance", logo: "💳" },
  
  // HR & Recruiting
  { name: "BambooHR", category: "HR", logo: "🎋" },
  { name: "Workday", category: "HR", logo: "👔" },
  { name: "Greenhouse", category: "HR", logo: "🌱" },
  { name: "LinkedIn", category: "HR", logo: "💼" },
  
  // Marketing
  { name: "Mailchimp", category: "Marketing", logo: "🐵" },
  { name: "Constant Contact", category: "Marketing", logo: "📮" },
  { name: "Facebook Ads", category: "Marketing", logo: "📘" },
  { name: "Google Ads", category: "Marketing", logo: "🎯" },
  
  // Storage & Files
  { name: "Dropbox", category: "Storage", logo: "📦" },
  { name: "OneDrive", category: "Storage", logo: "☁️" },
  { name: "Box", category: "Storage", logo: "📁" },
  { name: "AWS S3", category: "Storage", logo: "🪣" },
  
  // Development
  { name: "GitHub", category: "Development", logo: "🐙" },
  { name: "GitLab", category: "Development", logo: "🦊" },
  { name: "Bitbucket", category: "Development", logo: "🪣" },
  { name: "Jira", category: "Development", logo: "🛠️" },
  
  // E-commerce
  { name: "Shopify", category: "E-commerce", logo: "🛍️" },
  { name: "WooCommerce", category: "E-commerce", logo: "🛒" },
  { name: "BigCommerce", category: "E-commerce", logo: "🏪" },
  { name: "Square", category: "E-commerce", logo: "⬜" }
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
                    <div className="text-2xl mb-2">{app.logo}</div>
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