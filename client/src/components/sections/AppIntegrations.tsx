import React from 'react';
import { 
  Sheet, Mail, HardDrive, Calendar, FileText, Presentation, 
  FileEdit, MessageCircle, Slack, Users, Gamepad2, Video,
  Cloud, Heart, RotateCcw, TrendingUp, CheckSquare, Trello,
  BarChart3, Bug, DollarSign, PieChart, FileSpreadsheet,
  CreditCard, Building, Briefcase, Linkedin,
  Send, Radio, Facebook, Target, Package, CloudDrizzle,
  Folder, Github, GitBranch, ShoppingBag, ShoppingCart,
  Store, Square
} from "lucide-react";

// Integration apps with real brand colors for 3D effect
const integrations = [
  // Row 1 - Moving Right
  { name: "Google Sheets", icon: Sheet, color: "#0F9D58" },
  { name: "Gmail", icon: Mail, color: "#EA4335" },
  { name: "Slack", icon: Slack, color: "#4A154B" },
  { name: "Microsoft Teams", icon: Users, color: "#6264A7" },
  { name: "Salesforce", icon: Cloud, color: "#00A1E0" },
  { name: "HubSpot", icon: Heart, color: "#FF7A59" },
  { name: "Trello", icon: Trello, color: "#0079BF" },
  { name: "Asana", icon: CheckSquare, color: "#F06A6A" },
  { name: "Google Drive", icon: HardDrive, color: "#4285F4" },
  { name: "Zoom", icon: Video, color: "#2D8CFF" },
  { name: "Pipedrive", icon: RotateCcw, color: "#1A1A1A" },
  { name: "Monday.com", icon: BarChart3, color: "#FF3D57" },
  { name: "QuickBooks", icon: DollarSign, color: "#0077C5" },
  { name: "Mailchimp", icon: Send, color: "#FFE01B" },
  { name: "Shopify", icon: ShoppingBag, color: "#7AB55C" },
  
  // Row 2 - Moving Left  
  { name: "Google Calendar", icon: Calendar, color: "#4285F4" },
  { name: "Discord", icon: Gamepad2, color: "#5865F2" },
  { name: "Jira", icon: Bug, color: "#0052CC" },
  { name: "Stripe", icon: CreditCard, color: "#635BFF" },
  { name: "Dropbox", icon: Package, color: "#0061FF" },
  { name: "GitHub", icon: Github, color: "#181717" },
  { name: "LinkedIn", icon: Linkedin, color: "#0A66C2" },
  { name: "Facebook Ads", icon: Facebook, color: "#1877F2" },
  { name: "Google Docs", icon: FileText, color: "#4285F4" },
  { name: "Xero", icon: PieChart, color: "#13B5EA" },
  { name: "OneDrive", icon: CloudDrizzle, color: "#0078D4" },
  { name: "WooCommerce", icon: ShoppingCart, color: "#96588A" },
  { name: "BambooHR", icon: Building, color: "#8BC34A" },
  { name: "Google Ads", icon: Target, color: "#4285F4" },
  { name: "Box", icon: Folder, color: "#0061D5" },
  
  // Row 3 - Moving Right
  { name: "Google Slides", icon: Presentation, color: "#F9AB00" },
  { name: "Google Forms", icon: FileEdit, color: "#673AB7" },
  { name: "Zoho CRM", icon: TrendingUp, color: "#C83E3E" },
  { name: "FreshBooks", icon: FileSpreadsheet, color: "#0E6EFF" },
  { name: "Workday", icon: Briefcase, color: "#F5A623" },
  { name: "Constant Contact", icon: Radio, color: "#1F5AA8" },
  { name: "BigCommerce", icon: Store, color: "#121118" },
  { name: "GitLab", icon: GitBranch, color: "#FC6D26" },
  { name: "Square", icon: Square, color: "#3E4348" },
  { name: "AWS S3", icon: Package, color: "#FF9900" },
  { name: "Google Chat", icon: MessageCircle, color: "#00AC47" },
  { name: "Greenhouse", icon: Building, color: "#26C281" },
  { name: "Bitbucket", icon: Package, color: "#0052CC" },
  { name: "Airtable", icon: FileSpreadsheet, color: "#FCB400" },
  { name: "Notion", icon: FileText, color: "#000000" }
];

// Split integrations into 3 rows
const row1 = integrations.slice(0, 15);
const row2 = integrations.slice(15, 30);  
const row3 = integrations.slice(30, 45);

export const AppIntegrations = () => {
  return (
    <section className="container mx-auto py-12 md:py-16 overflow-hidden">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-semibold tracking-tight mb-4">
          Connect with 500+ applications
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Seamlessly integrate with your favorite tools and platforms. Our automation builder works with any service that has an API.
        </p>
      </div>

      {/* Animated Carousel - 3 Rows */}
      <div className="relative space-y-6">
        {/* Row 1 - Moving Right */}
        <div className="flex animate-scroll-right space-x-6">
          {[...row1, ...row1].map((app, index) => (
            <div
              key={`${app.name}-${index}`}
              className="flex-shrink-0 group cursor-pointer"
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110 hover:-translate-y-2 relative"
                style={{ 
                  backgroundColor: app.color,
                  boxShadow: `0 10px 25px ${app.color}20, 0 6px 12px ${app.color}15`
                }}
              >
                {/* 3D Effect Gradient Overlay */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                <app.icon className="w-8 h-8 text-white relative z-10" />
              </div>
              <p className="text-xs text-center mt-2 font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                {app.name}
              </p>
            </div>
          ))}
        </div>

        {/* Row 2 - Moving Left */}
        <div className="flex animate-scroll-left space-x-6">
          {[...row2, ...row2].map((app, index) => (
            <div
              key={`${app.name}-${index}`}
              className="flex-shrink-0 group cursor-pointer"
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110 hover:-translate-y-2 relative"
                style={{ 
                  backgroundColor: app.color,
                  boxShadow: `0 10px 25px ${app.color}20, 0 6px 12px ${app.color}15`
                }}
              >
                {/* 3D Effect Gradient Overlay */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                <app.icon className="w-8 h-8 text-white relative z-10" />
              </div>
              <p className="text-xs text-center mt-2 font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                {app.name}
              </p>
            </div>
          ))}
        </div>

        {/* Row 3 - Moving Right */}
        <div className="flex animate-scroll-right space-x-6">
          {[...row3, ...row3].map((app, index) => (
            <div
              key={`${app.name}-${index}`}
              className="flex-shrink-0 group cursor-pointer"
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110 hover:-translate-y-2 relative"
                style={{ 
                  backgroundColor: app.color,
                  boxShadow: `0 10px 25px ${app.color}20, 0 6px 12px ${app.color}15`
                }}
              >
                {/* 3D Effect Gradient Overlay */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                <app.icon className="w-8 h-8 text-white relative z-10" />
              </div>
              <p className="text-xs text-center mt-2 font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                {app.name}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Call to Action */}
      <div className="mt-16 text-center bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-8 border border-blue-100">
        <h3 className="text-2xl font-semibold mb-4">Ready to Connect Your Apps?</h3>
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
          Start building powerful automations today. Connect any app, create custom workflows, and watch your productivity soar.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors">
            🚀 Start Building
          </button>
          <button className="border border-gray-300 hover:border-gray-400 text-gray-700 font-semibold py-3 px-8 rounded-lg transition-colors">
            📞 Book Demo
          </button>
        </div>
      </div>
    </section>
  );
};