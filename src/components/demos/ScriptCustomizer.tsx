import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { 
  Settings, 
  Brain, 
  Download, 
  Copy,
  Wand2,
  Code,
  Zap,
  CheckCircle,
  Mail,
  FileSpreadsheet,
  Calendar,
  FolderCog,
  Users,
  Bell,
  Filter,
  Database
} from "lucide-react";

interface GoogleFunction {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  options?: { [key: string]: any };
  category: "gmail" | "sheets" | "calendar" | "drive" | "notifications";
}

interface CustomizationOption {
  id: string;
  label: string;
  description: string;
  type: 'text' | 'select' | 'boolean' | 'textarea' | 'number';
  defaultValue: any;
  options?: { label: string; value: string }[];
  aiEnhanced?: boolean;
  category: string;
}

interface ScriptCustomizerProps {
  scriptId: string;
  scriptTitle: string;
  baseCode: string;
  onDownload: (customizedCode: string, config: Record<string, any>) => void;
}

export function ScriptCustomizer({ 
  scriptId, 
  scriptTitle, 
  baseCode, 
  onDownload 
}: ScriptCustomizerProps) {
  const [activeTab, setActiveTab] = useState("functions");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Initialize Google Workspace functions based on script type
  const [googleFunctions, setGoogleFunctions] = useState<GoogleFunction[]>(() => 
    getAvailableFunctions(scriptId)
  );
  
  const [basicConfig, setBasicConfig] = useState({
    sheetId: "",
    emailLabel: "leads",
    triggerFrequency: "5 minutes",
    notificationEmail: ""
  });

  function getAvailableFunctions(scriptType: string): GoogleFunction[] {
    const baseFunctions = [
      // Gmail Functions
      {
        id: "gmail-search",
        name: "Gmail Search & Filter",
        description: "Search emails by labels, subject, sender, or content",
        enabled: true,
        category: "gmail" as const,
        options: {
          searchQuery: "is:unread label:leads",
          maxResults: 50,
          includeSpam: false
        }
      },
      {
        id: "gmail-extract-data",
        name: "Email Data Extraction",
        description: "Extract structured data from email content",
        enabled: true,
        category: "gmail" as const,
        options: {
          extractNames: true,
          extractEmails: true,
          extractPhones: true,
          extractCompanies: true,
          customPatterns: ""
        }
      },
      {
        id: "gmail-auto-reply",
        name: "Auto Reply & Labels",
        description: "Automatically reply to emails and apply labels",
        enabled: false,
        category: "gmail" as const,
        options: {
          replyTemplate: "Thank you for your email. We'll get back to you soon!",
          applyLabel: "processed",
          markAsRead: true
        }
      },
      
      // Google Sheets Functions
      {
        id: "sheets-append-row",
        name: "Add New Rows",
        description: "Append data to the end of a spreadsheet",
        enabled: true,
        category: "sheets" as const,
        options: {
          sheetName: "Sheet1",
          includeTimestamp: true,
          headerRow: 1
        }
      },
      {
        id: "sheets-update-cell",
        name: "Update Specific Cells",
        description: "Update data in specific cells or ranges",
        enabled: false,
        category: "sheets" as const,
        options: {
          updateMode: "overwrite",
          findAndReplace: false
        }
      },
      {
        id: "sheets-create-charts",
        name: "Auto-Create Charts",
        description: "Generate charts and graphs from data",
        enabled: false,
        category: "sheets" as const,
        options: {
          chartType: "column",
          dataRange: "A1:C10",
          includeTitle: true
        }
      },
      
      // Calendar Functions
      {
        id: "calendar-create-event",
        name: "Create Calendar Events",
        description: "Automatically create calendar events",
        enabled: false,
        category: "calendar" as const,
        options: {
          defaultDuration: 60,
          sendInvites: true,
          location: ""
        }
      },
      
      // Drive Functions
      {
        id: "drive-organize",
        name: "File Organization",
        description: "Automatically organize files in Google Drive",
        enabled: false,
        category: "drive" as const,
        options: {
          sortBy: "date",
          createFolders: true,
          moveFiles: true
        }
      },
      
      // Notification Functions
      {
        id: "email-notifications",
        name: "Email Notifications",
        description: "Send email notifications to team members",
        enabled: true,
        category: "notifications" as const,
        options: {
          recipients: "",
          subject: "Automation Update",
          includeData: true
        }
      },
      {
        id: "slack-notifications",
        name: "Slack Integration",
        description: "Send notifications to Slack channels",
        enabled: false,
        category: "notifications" as const,
        options: {
          webhookUrl: "",
          channel: "#general",
          username: "Automation Bot"
        }
      }
    ];

    // Filter functions based on script type
    if (scriptType === "email-automation") {
      return baseFunctions.filter(f => 
        f.category === "gmail" || f.category === "sheets" || f.category === "notifications"
      );
    } else if (scriptType === "report-generator") {
      return baseFunctions.filter(f => 
        f.category === "sheets" || f.category === "notifications" || f.category === "drive"
      );
    }
    
    return baseFunctions;
  }

  const updateFunctionEnabled = (functionId: string, enabled: boolean) => {
    setGoogleFunctions(prev => 
      prev.map(f => f.id === functionId ? { ...f, enabled } : f)
    );
  };

  const updateFunctionOption = (functionId: string, optionKey: string, value: any) => {
    setGoogleFunctions(prev => 
      prev.map(f => 
        f.id === functionId 
          ? { ...f, options: { ...f.options, [optionKey]: value } }
          : f
      )
    );
  };

  const generateCustomScript = () => {
    setIsGenerating(true);
    
    setTimeout(() => {
      const enabledFunctions = googleFunctions.filter(f => f.enabled);
      const customCode = generateCodeFromFunctions(enabledFunctions, basicConfig, aiPrompt);
      onDownload(customCode, { functions: enabledFunctions, config: basicConfig, aiPrompt });
      setIsGenerating(false);
    }, 2000);
  };

  const generateCodeFromFunctions = (functions: GoogleFunction[], config: any, prompt: string) => {
    let code = `// Auto-generated Google Apps Script
// Script: ${scriptTitle}
// Generated on: ${new Date().toLocaleString()}

`;

    // Add configuration constants
    code += `// Configuration
const CONFIG = {
  SHEET_ID: '${config.sheetId || 'YOUR_SHEET_ID'}',
  EMAIL_LABEL: '${config.emailLabel || 'leads'}',
  NOTIFICATION_EMAIL: '${config.notificationEmail || 'your-email@company.com'}',
  TRIGGER_FREQUENCY: '${config.triggerFrequency || '5 minutes'}'
};

`;

    // Add main function
    code += `function main() {
  try {
    Logger.log('Starting automation...');
`;

    functions.forEach(func => {
      switch (func.id) {
        case "gmail-search":
          code += `
    // Gmail Search & Filter
    const emails = GmailApp.search('${func.options?.searchQuery || 'is:unread'}', 0, ${func.options?.maxResults || 50});
    Logger.log(\`Found \${emails.length} emails\`);
`;
          break;
        case "gmail-extract-data":
          code += `
    // Extract data from emails
    const extractedData = [];
    emails.forEach(thread => {
      const messages = thread.getMessages();
      messages.forEach(message => {
        const data = {
          from: message.getFrom(),
          subject: message.getSubject(),
          date: message.getDate(),
          ${func.options?.extractNames ? 'name: extractName(message.getBody()),' : ''}
          ${func.options?.extractEmails ? 'email: extractEmail(message.getBody()),' : ''}
          ${func.options?.extractPhones ? 'phone: extractPhone(message.getBody()),' : ''}
          body: message.getPlainBody()
        };
        extractedData.push(data);
      });
    });
`;
          break;
        case "sheets-append-row":
          code += `
    // Add data to Google Sheets
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName('${func.options?.sheetName || 'Sheet1'}');
    extractedData.forEach(data => {
      const row = [
        ${func.options?.includeTimestamp ? 'new Date(),' : ''}
        data.from,
        data.subject,
        data.name || '',
        data.email || '',
        data.phone || ''
      ];
      sheet.appendRow(row);
    });
`;
          break;
        case "email-notifications":
          code += `
    // Send email notifications
    if (extractedData.length > 0) {
      const subject = '${func.options?.subject || 'Automation Update'}';
      const body = \`Processing complete. \${extractedData.length} items processed.\`;
      GmailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, subject, body);
    }
`;
          break;
      }
    });

    code += `
    Logger.log('Automation completed successfully');
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    // Send error notification
    GmailApp.sendEmail(CONFIG.NOTIFICATION_EMAIL, 'Automation Error', error.toString());
  }
}

`;

    // Add helper functions if needed
    if (functions.some(f => f.id === "gmail-extract-data" && f.options?.extractNames)) {
      code += `// Helper function to extract names from email content
function extractName(emailBody) {
  // Simple name extraction logic
  const nameMatch = emailBody.match(/name[:\\s]+(\\w+\\s+\\w+)/i);
  return nameMatch ? nameMatch[1] : '';
}

`;
    }

    if (functions.some(f => f.id === "gmail-extract-data" && f.options?.extractEmails)) {
      code += `// Helper function to extract email addresses
function extractEmail(emailBody) {
  const emailMatch = emailBody.match(/\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b/);
  return emailMatch ? emailMatch[0] : '';
}

`;
    }

    // Add AI-generated enhancements
    if (prompt) {
      code += `
// AI-Enhanced Features based on: "${prompt}"
function aiEnhancedProcessor() {
  // Custom logic would be generated here based on your requirements
  // This could include:
  // - Advanced data processing
  // - Custom integrations
  // - Specialized filtering logic
  // - Advanced notifications
  
  Logger.log('AI Enhancement: ${prompt}');
}
`;
    }

    return code;
  };

  const getFunctionsByCategory = (category: string) => {
    return googleFunctions.filter(f => f.category === category);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "gmail": return Mail;
      case "sheets": return FileSpreadsheet;
      case "calendar": return Calendar;
      case "drive": return FolderCog;
      case "notifications": return Bell;
      default: return Settings;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-5 text-primary" />
            Customize Your {scriptTitle}
          </CardTitle>
          <CardDescription>
            Configure Google Workspace functions and add AI-powered enhancements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="functions">Google Functions</TabsTrigger>
              <TabsTrigger value="config">Basic Settings</TabsTrigger>
              <TabsTrigger value="ai-enhance">AI Enhancement</TabsTrigger>
              <TabsTrigger value="generate">Generate & Download</TabsTrigger>
            </TabsList>
            
            <TabsContent value="functions" className="space-y-6 mt-6">
              <div className="space-y-6">
                {["gmail", "sheets", "calendar", "drive", "notifications"].map(category => {
                  const categoryFunctions = getFunctionsByCategory(category);
                  if (categoryFunctions.length === 0) return null;
                  
                  const CategoryIcon = getCategoryIcon(category);
                  
                  return (
                    <Card key={category} className="border border-gray-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg capitalize">
                          <CategoryIcon className="size-5" />
                          Google {category}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {categoryFunctions.map(func => (
                          <div key={func.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Switch
                                  checked={func.enabled}
                                  onCheckedChange={(enabled) => updateFunctionEnabled(func.id, enabled)}
                                />
                                <div>
                                  <h4 className="font-semibold">{func.name}</h4>
                                  <p className="text-sm text-gray-600">{func.description}</p>
                                </div>
                              </div>
                            </div>
                            
                            {func.enabled && func.options && (
                              <div className="ml-8 space-y-3 pt-3 border-t">
                                {Object.entries(func.options).map(([key, value]) => (
                                  <div key={key} className="grid grid-cols-3 gap-3 items-center">
                                    <Label className="text-sm capitalize">
                                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                                    </Label>
                                    {typeof value === "boolean" ? (
                                      <Switch
                                        checked={value}
                                        onCheckedChange={(newValue) => updateFunctionOption(func.id, key, newValue)}
                                      />
                                    ) : typeof value === "string" && key.includes("Template") ? (
                                      <Textarea
                                        value={value}
                                        onChange={(e) => updateFunctionOption(func.id, key, e.target.value)}
                                        rows={2}
                                        className="col-span-2"
                                      />
                                    ) : (
                                      <Input
                                        value={value.toString()}
                                        onChange={(e) => updateFunctionOption(func.id, key, e.target.value)}
                                        className="col-span-2"
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
            
            <TabsContent value="config" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Configuration</CardTitle>
                  <CardDescription>Set up basic parameters for your automation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sheetId">Google Sheet ID</Label>
                      <Input
                        id="sheetId"
                        value={basicConfig.sheetId}
                        onChange={(e) => setBasicConfig(prev => ({...prev, sheetId: e.target.value}))}
                        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                      />
                      <p className="text-xs text-gray-500">
                        Found in the URL of your Google Sheet
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="emailLabel">Gmail Label to Monitor</Label>
                      <Input
                        id="emailLabel"
                        value={basicConfig.emailLabel}
                        onChange={(e) => setBasicConfig(prev => ({...prev, emailLabel: e.target.value}))}
                        placeholder="leads"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="triggerFrequency">Automation Frequency</Label>
                      <select
                        id="triggerFrequency"
                        value={basicConfig.triggerFrequency}
                        onChange={(e) => setBasicConfig(prev => ({...prev, triggerFrequency: e.target.value}))}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="1 minute">Every minute</option>
                        <option value="5 minutes">Every 5 minutes</option>
                        <option value="15 minutes">Every 15 minutes</option>
                        <option value="1 hour">Every hour</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="notificationEmail">Notification Email</Label>
                      <Input
                        id="notificationEmail"
                        type="email"
                        value={basicConfig.notificationEmail}
                        onChange={(e) => setBasicConfig(prev => ({...prev, notificationEmail: e.target.value}))}
                        placeholder="your-email@company.com"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="ai-enhance" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="size-5 text-purple-500" />
                    AI-Powered Enhancement
                  </CardTitle>
                  <CardDescription>
                    Describe additional features you need and AI will enhance your script
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai-prompt">Describe your specific requirements:</Label>
                    <Textarea
                      id="ai-prompt"
                      placeholder="Example: I want to categorize emails by priority, send different notifications based on sender domain, create weekly summary reports with charts, and integrate with our CRM system..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={6}
                    />
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card className="p-4 bg-blue-50">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Zap className="size-4 text-blue-500" />
                        AI Capabilities
                      </h4>
                      <ul className="text-sm space-y-1 text-gray-600">
                        <li>• Advanced email categorization</li>
                        <li>• Smart data validation</li>
                        <li>• Custom notification logic</li>
                        <li>• External API integrations</li>
                        <li>• Intelligent error handling</li>
                        <li>• Performance optimization</li>
                      </ul>
                    </Card>
                    
                    <Card className="p-4 bg-green-50">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Code className="size-4 text-green-500" />
                        Enhancement Examples
                      </h4>
                      <ul className="text-sm space-y-1 text-gray-600">
                        <li>• "Prioritize VIP customer emails"</li>
                        <li>• "Create charts in Google Sheets"</li>
                        <li>• "Integrate with Salesforce"</li>
                        <li>• "Send Slack notifications"</li>
                        <li>• "Generate PDF reports"</li>
                        <li>• "Add approval workflows"</li>
                      </ul>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="generate" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="size-5" />
                    Generate Your Custom Script
                  </CardTitle>
                  <CardDescription>
                    Review your configuration and download your customized Google Apps Script
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">Enabled Functions:</h4>
                      <div className="space-y-2">
                        {googleFunctions.filter(f => f.enabled).map(func => (
                          <div key={func.id} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="size-4 text-green-500" />
                            {func.name}
                          </div>
                        ))}
                      </div>
                    </Card>
                    
                    <Card className="p-4">
                      <h4 className="font-semibold mb-3">Configuration:</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Sheet ID:</span>
                          <span className="font-mono text-xs">{basicConfig.sheetId || "Not set"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Email Label:</span>
                          <span>{basicConfig.emailLabel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Frequency:</span>
                          <span>{basicConfig.triggerFrequency}</span>
                        </div>
                        {aiPrompt && (
                          <div className="mt-2 p-2 bg-purple-50 rounded text-xs">
                            <span className="font-semibold">AI Enhancement:</span>
                            <p className="mt-1">{aiPrompt.substring(0, 100)}...</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                  
                  <Separator />
                  
                  <div className="text-center">
                    <Button 
                      onClick={generateCustomScript} 
                      disabled={isGenerating || googleFunctions.filter(f => f.enabled).length === 0}
                      size="lg" 
                      className="px-8 py-3 hover-glow"
                    >
                      {isGenerating ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current mr-2" />
                          Generating Custom Script...
                        </>
                      ) : (
                        <>
                          <Wand2 className="size-5 mr-2" />
                          Generate & Download Script
                        </>
                      )}
                    </Button>
                    
                    {googleFunctions.filter(f => f.enabled).length === 0 && (
                      <p className="text-sm text-red-500 mt-2">
                        Please enable at least one Google function to generate your script
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default ScriptCustomizer;