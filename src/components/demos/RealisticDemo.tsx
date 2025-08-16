import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Mail, 
  FileText, 
  Calendar,
  FolderCog,
  BarChart3,
  CheckCircle2,
  Clock,
  ArrowRight,
  Database,
  Send,
  DollarSign,
  Search,
  Filter,
  Download,
  Eye,
  Settings,
  Users,
  FileSpreadsheet,
  Gmail,
  Drive,
  Chrome
} from "lucide-react";

interface DemoStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  duration: number;
  uiComponent: React.ComponentType<{ isActive: boolean; data?: any }>;
}

interface RealisticDemoProps {
  scriptId: string;
  scriptTitle: string;
  onClose: () => void;
}

// Gmail Interface Component
const GmailInterface = ({ isActive, data }: { isActive: boolean; data?: any }) => (
  <div className={`border rounded-lg bg-white shadow-lg transition-all duration-500 ${isActive ? 'scale-105' : 'scale-100'}`}>
    {/* Gmail Header */}
    <div className="bg-red-500 text-white p-3 rounded-t-lg flex items-center gap-2">
      <Gmail className="size-5" />
      <span className="font-semibold">Gmail</span>
      <div className="ml-auto flex items-center gap-2">
        <Search className="size-4" />
        <Filter className="size-4" />
        <Settings className="size-4" />
      </div>
    </div>
    
    {/* Gmail Content */}
    <div className="p-4">
      <div className="space-y-2">
        {data?.emails?.map((email: any, idx: number) => (
          <div key={idx} className={`p-3 border rounded-lg transition-all duration-300 ${
            isActive && idx === 0 ? 'bg-blue-50 border-blue-200 shadow-md' : 'bg-gray-50'
          }`}>
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-gray-300 flex items-center justify-center">
                <Mail className="size-4" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{email.from}</div>
                <div className="text-sm text-gray-600">{email.subject}</div>
                <div className="text-xs text-gray-500">{email.time}</div>
              </div>
              {isActive && idx === 0 && (
                <Badge className="bg-green-500 text-white text-xs">
                  <Eye className="size-3 mr-1" />
                  Processing
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Google Sheets Interface Component
const SheetsInterface = ({ isActive, data }: { isActive: boolean; data?: any }) => (
  <div className={`border rounded-lg bg-white shadow-lg transition-all duration-500 ${isActive ? 'scale-105' : 'scale-100'}`}>
    {/* Sheets Header */}
    <div className="bg-green-600 text-white p-3 rounded-t-lg flex items-center gap-2">
      <FileSpreadsheet className="size-5" />
      <span className="font-semibold">Google Sheets</span>
      <span className="text-sm ml-auto">Automation_Data</span>
    </div>
    
    {/* Sheets Content */}
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left text-sm font-medium">Date</th>
              <th className="border p-2 text-left text-sm font-medium">Subject</th>
              <th className="border p-2 text-left text-sm font-medium">From</th>
              <th className="border p-2 text-left text-sm font-medium">Phone</th>
              <th className="border p-2 text-left text-sm font-medium">Company</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows?.map((row: any, idx: number) => (
              <tr key={idx} className={`transition-all duration-300 ${
                isActive && idx === data.rows.length - 1 ? 'bg-green-50' : ''
              }`}>
                <td className="border p-2 text-sm">{row.date}</td>
                <td className="border p-2 text-sm">{row.subject}</td>
                <td className="border p-2 text-sm">{row.from}</td>
                <td className="border p-2 text-sm">{row.phone}</td>
                <td className="border p-2 text-sm">{row.company}</td>
              </tr>
            ))}
            {isActive && (
              <tr className="bg-blue-50 animate-pulse">
                <td className="border p-2 text-sm">{new Date().toLocaleDateString()}</td>
                <td className="border p-2 text-sm">Invoice Request</td>
                <td className="border p-2 text-sm">client@company.com</td>
                <td className="border p-2 text-sm">+1-555-0123</td>
                <td className="border p-2 text-sm">Tech Corp</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// Google Calendar Interface Component
const CalendarInterface = ({ isActive, data }: { isActive: boolean; data?: any }) => (
  <div className={`border rounded-lg bg-white shadow-lg transition-all duration-500 ${isActive ? 'scale-105' : 'scale-100'}`}>
    {/* Calendar Header */}
    <div className="bg-blue-600 text-white p-3 rounded-t-lg flex items-center gap-2">
      <Calendar className="size-5" />
      <span className="font-semibold">Google Calendar</span>
      <span className="text-sm ml-auto">March 2024</span>
    </div>
    
    {/* Calendar Content */}
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1 text-sm">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 text-center font-medium bg-gray-100">{day}</div>
        ))}
        {Array.from({ length: 31 }, (_, i) => (
          <div key={i} className={`p-2 text-center border min-h-[60px] ${
            i === 14 && isActive ? 'bg-blue-50 border-blue-300' : ''
          }`}>
            <div className="text-sm">{i + 1}</div>
            {i === 14 && isActive && (
              <div className="mt-1">
                <div className="bg-blue-500 text-white text-xs p-1 rounded">
                  Consultation Call
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Google Drive Interface Component
const DriveInterface = ({ isActive, data }: { isActive: boolean; data?: any }) => (
  <div className={`border rounded-lg bg-white shadow-lg transition-all duration-500 ${isActive ? 'scale-105' : 'scale-100'}`}>
    {/* Drive Header */}
    <div className="bg-yellow-500 text-white p-3 rounded-t-lg flex items-center gap-2">
      <Drive className="size-5" />
      <span className="font-semibold">Google Drive</span>
      <span className="text-sm ml-auto">Inbox Folder</span>
    </div>
    
    {/* Drive Content */}
    <div className="p-4">
      <div className="grid grid-cols-4 gap-4">
        {data?.files?.map((file: any, idx: number) => (
          <div key={idx} className={`p-3 border rounded-lg text-center transition-all duration-300 ${
            isActive && idx === 0 ? 'bg-yellow-50 border-yellow-300 shadow-md' : 'bg-gray-50'
          }`}>
            <div className="size-12 mx-auto mb-2 bg-gray-200 rounded flex items-center justify-center">
              <FileText className="size-6" />
            </div>
            <div className="text-xs font-medium">{file.name}</div>
            <div className="text-xs text-gray-500">{file.type}</div>
            {isActive && idx === 0 && (
              <Badge className="bg-yellow-500 text-white text-xs mt-1">
                <FolderCog className="size-3 mr-1" />
                Moving...
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Expense Processing Interface Component
const ExpenseInterface = ({ isActive, data }: { isActive: boolean; data?: any }) => (
  <div className={`border rounded-lg bg-white shadow-lg transition-all duration-500 ${isActive ? 'scale-105' : 'scale-100'}`}>
    {/* Expense Header */}
    <div className="bg-green-600 text-white p-3 rounded-t-lg flex items-center gap-2">
      <DollarSign className="size-5" />
      <span className="font-semibold">Expense Tracker</span>
      <span className="text-sm ml-auto">Pending: {data?.pending || 0}</span>
    </div>
    
    {/* Expense Content */}
    <div className="p-4">
      <div className="space-y-3">
        {data?.expenses?.map((expense: any, idx: number) => (
          <div key={idx} className={`p-3 border rounded-lg transition-all duration-300 ${
            isActive && idx === 0 ? 'bg-green-50 border-green-200 shadow-md' : 'bg-gray-50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{expense.vendor}</div>
                <div className="text-sm text-gray-600">{expense.category}</div>
                <div className="text-xs text-gray-500">{expense.date}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-lg">${expense.amount}</div>
                <Badge className={`text-xs ${
                  expense.status === 'Pending' ? 'bg-yellow-500' : 
                  expense.status === 'Approved' ? 'bg-green-500' : 'bg-red-500'
                } text-white`}>
                  {expense.status}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Task Management Interface Component
const TaskInterface = ({ isActive, data }: { isActive: boolean; data?: any }) => (
  <div className={`border rounded-lg bg-white shadow-lg transition-all duration-500 ${isActive ? 'scale-105' : 'scale-100'}`}>
    {/* Task Header */}
    <div className="bg-purple-600 text-white p-3 rounded-t-lg flex items-center gap-2">
      <CheckCircle2 className="size-5" />
      <span className="font-semibold">Project Tasks</span>
      <span className="text-sm ml-auto">Due Today: {data?.dueToday || 0}</span>
    </div>
    
    {/* Task Content */}
    <div className="p-4">
      <div className="space-y-3">
        {data?.tasks?.map((task: any, idx: number) => (
          <div key={idx} className={`p-3 border rounded-lg transition-all duration-300 ${
            isActive && idx === 0 ? 'bg-purple-50 border-purple-200 shadow-md' : 'bg-gray-50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`size-4 rounded-full border-2 ${
                  task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}>
                  {task.completed && <CheckCircle2 className="size-3 text-white" />}
                </div>
                <div>
                  <div className="font-medium">{task.title}</div>
                  <div className="text-sm text-gray-600">Assigned to: {task.assignee}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Due: {task.deadline}</div>
                <Badge className={`text-xs ${
                  task.priority === 'High' ? 'bg-red-500' : 
                  task.priority === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                } text-white`}>
                  {task.priority}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export function RealisticDemo({ scriptId, scriptTitle, onClose }: RealisticDemoProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stepData, setStepData] = useState<any[]>([]);

  const getDemoSteps = (): DemoStep[] => {
    switch (scriptId) {
      case "email-automation":
        return [
          {
            id: "gmail-scan",
            title: "Scanning Gmail",
            description: "Searching for unread emails with specific criteria",
            icon: Mail,
            duration: 2000,
            uiComponent: GmailInterface
          },
          {
            id: "data-extract",
            title: "Extracting Data",
            description: "Using AI to parse and extract structured information",
            icon: Brain,
            duration: 2500,
            uiComponent: GmailInterface
          },
          {
            id: "sheets-update",
            title: "Updating Spreadsheet",
            description: "Adding extracted data to Google Sheets",
            icon: FileSpreadsheet,
            duration: 1800,
            uiComponent: SheetsInterface
          },
          {
            id: "notification",
            title: "Sending Notifications",
            description: "Notifying team members about new data",
            icon: Send,
            duration: 1200,
            uiComponent: GmailInterface
          }
        ];
      case "calendar-booking":
        return [
          {
            id: "check-availability",
            title: "Checking Calendar",
            description: "Scanning for available time slots",
            icon: Calendar,
            duration: 2000,
            uiComponent: CalendarInterface
          },
          {
            id: "create-booking",
            title: "Creating Event",
            description: "Setting up calendar event with meeting link",
            icon: CheckCircle2,
            duration: 1800,
            uiComponent: CalendarInterface
          },
          {
            id: "send-confirmation",
            title: "Sending Confirmation",
            description: "Emailing confirmation to participant",
            icon: Mail,
            duration: 1500,
            uiComponent: GmailInterface
          },
          {
            id: "schedule-reminders",
            title: "Scheduling Reminders",
            description: "Setting up automated reminder sequence",
            icon: Clock,
            duration: 1200,
            uiComponent: CalendarInterface
          }
        ];
      case "file-organizer":
        return [
          {
            id: "scan-files",
            title: "Scanning Drive",
            description: "Analyzing files in source folder",
            icon: Drive,
            duration: 2000,
            uiComponent: DriveInterface
          },
          {
            id: "categorize",
            title: "Categorizing Files",
            description: "Sorting files by type and content",
            icon: FolderCog,
            duration: 2500,
            uiComponent: DriveInterface
          },
          {
            id: "create-folders",
            title: "Creating Folders",
            description: "Setting up organized folder structure",
            icon: FolderCog,
            duration: 1800,
            uiComponent: DriveInterface
          },
          {
            id: "move-files",
            title: "Moving Files",
            description: "Moving files to appropriate folders",
            icon: Download,
            duration: 1500,
            uiComponent: DriveInterface
          }
        ];
      case "expense-tracker":
        return [
          {
            id: "receive-receipt",
            title: "Receiving Receipt",
            description: "Email with receipt attachment received",
            icon: Mail,
            duration: 1500,
            uiComponent: GmailInterface
          },
          {
            id: "extract-data",
            title: "Extracting Data",
            description: "Using AI to extract expense details",
            icon: Brain,
            duration: 2500,
            uiComponent: ExpenseInterface
          },
          {
            id: "categorize",
            title: "Categorizing Expense",
            description: "Automatically categorizing expense type",
            icon: DollarSign,
            duration: 1800,
            uiComponent: ExpenseInterface
          },
          {
            id: "approval-workflow",
            title: "Approval Workflow",
            description: "Sending for manager approval",
            icon: Users,
            duration: 2000,
            uiComponent: ExpenseInterface
          }
        ];
      case "task-automation":
        return [
          {
            id: "scan-tasks",
            title: "Scanning Tasks",
            description: "Analyzing project tasks and deadlines",
            icon: CheckCircle2,
            duration: 2000,
            uiComponent: TaskInterface
          },
          {
            id: "check-deadlines",
            title: "Checking Deadlines",
            description: "Identifying tasks approaching deadlines",
            icon: Clock,
            duration: 1800,
            uiComponent: TaskInterface
          },
          {
            id: "send-reminders",
            title: "Sending Reminders",
            description: "Sending automated deadline reminders",
            icon: Mail,
            duration: 2000,
            uiComponent: GmailInterface
          },
          {
            id: "update-status",
            title: "Updating Status",
            description: "Updating task status and generating reports",
            icon: BarChart3,
            duration: 1500,
            uiComponent: TaskInterface
          }
        ];
      default:
        return [
          {
            id: "data-collect",
            title: "Collecting Data",
            description: "Gathering data from multiple sources",
            icon: Database,
            duration: 2000,
            uiComponent: SheetsInterface
          },
          {
            id: "analyze",
            title: "Analyzing Data",
            description: "Processing data and generating insights",
            icon: BarChart3,
            duration: 2500,
            uiComponent: SheetsInterface
          },
          {
            id: "create-report",
            title: "Creating Report",
            description: "Generating PDF report from template",
            icon: FileText,
            duration: 2000,
            uiComponent: SheetsInterface
          },
          {
            id: "distribute",
            title: "Distributing Report",
            description: "Emailing report to stakeholders",
            icon: Send,
            duration: 1500,
            uiComponent: GmailInterface
          }
        ];
    }
  };

  const generateStepData = (stepId: string) => {
    switch (stepId) {
      case "gmail-scan":
        return {
          emails: [
            { from: "client@company.com", subject: "Invoice Request", time: "2 min ago" },
            { from: "supplier@vendor.com", subject: "Quote #12345", time: "5 min ago" },
            { from: "team@startup.com", subject: "Project Update", time: "8 min ago" }
          ]
        };
      case "sheets-update":
        return {
          rows: [
            { date: "2024-03-14", subject: "Invoice Request", from: "client@company.com", phone: "+1-555-0123", company: "Tech Corp" },
            { date: "2024-03-14", subject: "Quote #12345", from: "supplier@vendor.com", phone: "+1-555-0456", company: "Vendor Inc" }
          ]
        };
      case "scan-files":
        return {
          files: [
            { name: "Invoice.pdf", type: "PDF" },
            { name: "Report.docx", type: "DOCX" },
            { name: "Chart.xlsx", type: "XLSX" },
            { name: "Image.jpg", type: "JPG" }
          ]
        };
      case "extract-data":
        return {
          expenses: [
            { vendor: "Office Supplies Co", category: "Office Supplies", date: "2024-03-14", amount: "450.00", status: "Pending" },
            { vendor: "Travel Agency", category: "Travel", date: "2024-03-13", amount: "1,200.00", status: "Approved" }
          ]
        };
      case "scan-tasks":
        return {
          tasks: [
            { title: "Complete Project Proposal", assignee: "John Doe", deadline: "2024-03-15", priority: "High", completed: false },
            { title: "Review Code Changes", assignee: "Jane Smith", deadline: "2024-03-16", priority: "Medium", completed: true },
            { title: "Client Meeting Prep", assignee: "Mike Johnson", deadline: "2024-03-14", priority: "High", completed: false }
          ],
          dueToday: 2
        };
      default:
        return {};
    }
  };

  const demoSteps = getDemoSteps();

  const startDemo = () => {
    setIsRunning(true);
    setCurrentStep(0);
    setProgress(0);
    setStepData([]);
    runDemo();
  };

  const runDemo = async () => {
    for (let i = 0; i < demoSteps.length; i++) {
      setCurrentStep(i);
      const step = demoSteps[i];
      
      // Simulate step execution
      for (let j = 0; j <= 100; j += 10) {
        setProgress((i * 100 + j) / demoSteps.length);
        await new Promise(resolve => setTimeout(resolve, step.duration / 10));
      }
      
      // Add step data
      setStepData(prev => [...prev, generateStepData(step.id)]);
    }
    
    setIsRunning(false);
    setCurrentStep(demoSteps.length);
  };

  const resetDemo = () => {
    setIsRunning(false);
    setCurrentStep(0);
    setProgress(0);
    setStepData([]);
  };

  const currentStepData = stepData[currentStep] || generateStepData(demoSteps[currentStep]?.id || "");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-blue-500/5 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Play className="size-5" />
                Realistic Demo: {scriptTitle}
              </CardTitle>
              <CardDescription>
                Watch how this automation works in real Google Apps
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 space-y-6">
          {/* Demo Controls */}
          <div className="flex gap-4 justify-center">
            <Button 
              onClick={startDemo} 
              disabled={isRunning}
              size="lg"
              className="hover-glow"
            >
              <Play className="size-4 mr-2" />
              {isRunning ? "Running..." : "Start Demo"}
            </Button>
            <Button variant="outline" onClick={resetDemo} disabled={isRunning}>
              <RotateCcw className="size-4 mr-2" />
              Reset
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Current Step Info */}
          {demoSteps[currentStep] && (
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <demoSteps[currentStep].icon className="size-5 text-primary" />
                <h3 className="text-lg font-semibold">{demoSteps[currentStep].title}</h3>
              </div>
              <p className="text-muted-foreground">{demoSteps[currentStep].description}</p>
            </div>
          )}

          {/* UI Simulation */}
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              {demoSteps[currentStep] && (
                <demoSteps[currentStep].uiComponent 
                  isActive={isRunning && currentStep < demoSteps.length} 
                  data={currentStepData}
                />
              )}
            </div>
          </div>

          {/* Step Indicators */}
          <div className="flex justify-center gap-2">
            {demoSteps.map((step, idx) => (
              <div
                key={step.id}
                className={`size-3 rounded-full transition-all duration-300 ${
                  idx < currentStep ? 'bg-green-500' :
                  idx === currentStep ? 'bg-primary' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}