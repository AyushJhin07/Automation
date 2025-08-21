import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Mail, Sheet, Calendar, FolderOpen, DollarSign, CheckSquare, Settings, Trash2, Brain } from 'lucide-react';

interface AutomationDemo {
  id: string;
  title: string;
  description: string;
  apps: string[];
  workflow: DemoStep[];
}

interface DemoStep {
  id: number;
  title: string;
  description: string;
  duration: number;
  component: React.ReactNode;
}

const automationDemos: AutomationDemo[] = [
  {
    id: "email-automation",
    title: "Smart Email Processor",
    description: "Automatically process emails, extract data, and update Google Sheets",
    apps: ["Gmail", "Google Sheets"],
    workflow: [
      {
        id: 1,
        title: "Drag Gmail",
        description: "Customer drags Gmail to monitor incoming emails",
        duration: 3000,
        component: <EmailProcessorDemo step={1} />
      },
      {
        id: 2, 
        title: "Configure Email Search",
        description: "Set up to monitor 'is:unread label:leads' emails",
        duration: 4000,
        component: <EmailProcessorDemo step={2} />
      },
      {
        id: 3,
        title: "Add Google Sheets",
        description: "Drag Sheets to store extracted email data",
        duration: 3000,
        component: <EmailProcessorDemo step={3} />
      },
      {
        id: 4,
        title: "Configure Sheets",
        description: "Set up 'Append Row' to add email data",
        duration: 4000,
        component: <EmailProcessorDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & AI Sync",
        description: "Connect apps - AI maps email fields to sheet columns",
        duration: 4000,
        component: <EmailProcessorDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "New email automatically processed and added to sheet",
        duration: 5000,
        component: <EmailProcessorResults />
      }
    ]
  },
  {
    id: "report-automation", 
    title: "Automated Report Generator",
    description: "Generate and distribute reports from Google Sheets data",
    apps: ["Google Sheets", "Gmail", "Google Drive"],
    workflow: [
      {
        id: 1,
        title: "Drag Google Sheets",
        description: "Customer drags Sheets to read data for reports",
        duration: 3000,
        component: <ReportGeneratorDemo step={1} />
      },
      {
        id: 2,
        title: "Configure Data Reading", 
        description: "Set up 'Read Range' to get sales/analytics data",
        duration: 4000,
        component: <ReportGeneratorDemo step={2} />
      },
      {
        id: 3,
        title: "Add Google Drive",
        description: "Drag Drive to create PDF reports",
        duration: 3000,
        component: <ReportGeneratorDemo step={3} />
      },
      {
        id: 4,
        title: "Add Gmail",
        description: "Drag Gmail to email reports to stakeholders",
        duration: 3000,
        component: <ReportGeneratorDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & Generate",
        description: "AI connects data flow: Sheets → Drive → Gmail",
        duration: 4000,
        component: <ReportGeneratorDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "PDF report created and emailed automatically",
        duration: 5000,
        component: <ReportGeneratorResults />
      }
    ]
  },
  {
    id: "calendar-automation",
    title: "Smart Calendar Booking System", 
    description: "Automate calendar bookings with email confirmations",
    apps: ["Google Calendar", "Gmail", "Google Sheets"],
    workflow: [
      {
        id: 1,
        title: "Drag Google Calendar",
        description: "Customer drags Calendar to manage bookings",
        duration: 3000,
        component: <CalendarBookingDemo step={1} />
      },
      {
        id: 2,
        title: "Configure Event Creation",
        description: "Set up 'Create Event' function for appointments",
        duration: 4000,
        component: <CalendarBookingDemo step={2} />
      },
      {
        id: 3,
        title: "Add Gmail",
        description: "Drag Gmail for confirmation emails",
        duration: 3000,
        component: <CalendarBookingDemo step={3} />
      },
      {
        id: 4,
        title: "Add Google Sheets",
        description: "Drag Sheets to log all bookings",
        duration: 3000,
        component: <CalendarBookingDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & AI Sync",
        description: "AI maps: Calendar → Gmail → Sheets automatically",
        duration: 4000,
        component: <CalendarBookingDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "Booking created, email sent, data logged",
        duration: 5000,
        component: <CalendarBookingResults />
      }
    ]
  },
  {
    id: "file-automation",
    title: "Intelligent File Organizer",
    description: "Automatically organize and process files in Google Drive",
    apps: ["Google Drive", "Google Sheets", "Gmail"],
    workflow: [
      {
        id: 1,
        title: "Drag Google Drive",
        description: "Customer drags Drive to monitor new files",
        duration: 3000,
        component: <FileOrganizerDemo step={1} />
      },
      {
        id: 2,
        title: "Configure File Monitoring",
        description: "Set up 'List Files' to watch for new uploads",
        duration: 4000,
        component: <FileOrganizerDemo step={2} />
      },
      {
        id: 3,
        title: "Add Google Sheets",
        description: "Drag Sheets to log file activities",
        duration: 3000,
        component: <FileOrganizerDemo step={3} />
      },
      {
        id: 4,
        title: "Add Gmail",
        description: "Drag Gmail to notify about file changes",
        duration: 3000,
        component: <FileOrganizerDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & AI Sync",
        description: "AI maps: Drive → Sheets → Gmail for notifications",
        duration: 4000,
        component: <FileOrganizerDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "Files organized, logged, and team notified",
        duration: 5000,
        component: <FileOrganizerResults />
      }
    ]
  },
  {
    id: "expense-automation",
    title: "Expense Tracker & Approval",
    description: "Track expenses, generate reports, and automate approval workflows",
    apps: ["Google Sheets", "Gmail", "Google Drive"],
    workflow: [
      {
        id: 1,
        title: "Drag Google Sheets",
        description: "Customer drags Sheets to track expense entries",
        duration: 3000,
        component: <ExpenseTrackerDemo step={1} />
      },
      {
        id: 2,
        title: "Configure Expense Tracking",
        description: "Set up 'Append Row' for new expense entries",
        duration: 4000,
        component: <ExpenseTrackerDemo step={2} />
      },
      {
        id: 3,
        title: "Add Gmail",
        description: "Drag Gmail for approval notifications",
        duration: 3000,
        component: <ExpenseTrackerDemo step={3} />
      },
      {
        id: 4,
        title: "Add Google Drive",
        description: "Drag Drive to store receipt files",
        duration: 3000,
        component: <ExpenseTrackerDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & AI Sync",
        description: "AI creates approval workflow automatically",
        duration: 4000,
        component: <ExpenseTrackerDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "Expense logged, receipt stored, manager notified",
        duration: 5000,
        component: <ExpenseTrackerResults />
      }
    ]
  },
  {
    id: "task-automation",
    title: "Project Task Automator", 
    description: "Automate project task management and team notifications",
    apps: ["Google Sheets", "Gmail", "Google Calendar"],
    workflow: [
      {
        id: 1,
        title: "Drag Google Sheets",
        description: "Customer drags Sheets to manage project tasks",
        duration: 3000,
        component: <TaskAutomatorDemo step={1} />
      },
      {
        id: 2,
        title: "Configure Task Management",
        description: "Set up 'Update Range' for task status changes",
        duration: 4000,
        component: <TaskAutomatorDemo step={2} />
      },
      {
        id: 3,
        title: "Add Gmail",
        description: "Drag Gmail for team notifications",
        duration: 3000,
        component: <TaskAutomatorDemo step={3} />
      },
      {
        id: 4,
        title: "Add Google Calendar",
        description: "Drag Calendar for deadline tracking",
        duration: 3000,
        component: <TaskAutomatorDemo step={4} />
      },
      {
        id: 5,
        title: "Connect & AI Sync",
        description: "AI creates complete task workflow",
        duration: 4000,
        component: <TaskAutomatorDemo step={5} />
      },
      {
        id: 6,
        title: "See Results",
        description: "Task updated, team notified, deadlines tracked",
        duration: 5000,
        component: <TaskAutomatorResults />
      }
    ]
  }
];

export const PreBuiltAutomationDemos = () => {
  const [activeDemo, setActiveDemo] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const currentAutomation = automationDemos[activeDemo];
  const currentWorkflowStep = currentAutomation.workflow[currentStep];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying && currentWorkflowStep) {
      interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 100;
          if (newProgress >= currentWorkflowStep.duration) {
            // Move to next step
            if (currentStep < currentAutomation.workflow.length - 1) {
              setCurrentStep(curr => curr + 1);
              return 0;
            } else {
              setIsPlaying(false);
              return 0;
            }
          }
          return newProgress;
        });
      }, 100);
    }

    return () => clearInterval(interval);
  }, [isPlaying, currentStep, currentWorkflowStep, currentAutomation]);

  const handlePlay = () => setIsPlaying(!isPlaying);
  const handleReset = () => {
    setCurrentStep(0);
    setProgress(0);
    setIsPlaying(false);
  };

  const progressPercentage = currentWorkflowStep ? (progress / currentWorkflowStep.duration) * 100 : 0;

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      {/* Demo Selection */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-center mb-6">🎬 Live Automation Demos</h2>
        <p className="text-center text-gray-600 mb-6">
          Watch how each pre-built automation works with your actual Google Workspace apps
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {automationDemos.map((demo, index) => (
            <Card 
              key={demo.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                activeDemo === index ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => {
                setActiveDemo(index);
                setCurrentStep(0);
                setProgress(0);
                setIsPlaying(false);
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{demo.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">{demo.description}</p>
                <div className="flex gap-1 flex-wrap">
                  {demo.apps.map(app => (
                    <Badge key={app} variant="secondary" className="text-xs">
                      {app}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Demo Controls */}
      <div className="mb-6 text-center">
        <h3 className="text-xl font-semibold mb-4">{currentAutomation.title}</h3>
        
        <div className="flex justify-center gap-4 mb-4">
          <Button onClick={handlePlay} className="flex items-center gap-2">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause Demo' : 'Play Demo'}
          </Button>
          <Button onClick={handleReset} variant="outline" className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset Demo
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-100"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        {/* Step Info */}
        <div className="text-sm text-gray-600">
          Step {currentStep + 1} of {currentAutomation.workflow.length}: {currentWorkflowStep?.title}
        </div>
      </div>

      {/* Demo Screen */}
      <Card className="w-full h-[700px] overflow-hidden border-2 border-gray-300 rounded-xl shadow-2xl">
        <CardContent className="p-0 h-full">
          {/* Browser Chrome */}
          <div className="bg-gray-100 p-3 border-b flex items-center gap-3">
            <div className="flex gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="flex-1 bg-white rounded-lg px-4 py-2 text-sm text-gray-600 flex items-center gap-2">
              🔒 <span className="font-mono">localhost:5001/pre-built-apps</span>
            </div>
            <div className="text-xs text-gray-500">Apps Script Studio</div>
          </div>
          
          {/* Demo Content */}
          <div className="h-full bg-gray-50">
            {currentWorkflowStep?.component}
          </div>
        </CardContent>
      </Card>

      {/* Step Description */}
      <div className="mt-6 text-center">
        <h4 className="text-lg font-semibold mb-2">{currentWorkflowStep?.title}</h4>
        <p className="text-gray-600 mb-4">{currentWorkflowStep?.description}</p>
        
        {/* Step Navigation */}
        <div className="flex justify-center gap-2">
          {currentAutomation.workflow.map((step, index) => (
            <button
              key={step.id}
              onClick={() => {
                setCurrentStep(index);
                setProgress(0);
                setIsPlaying(false);
              }}
              className={`w-4 h-4 rounded-full transition-all ${
                index === currentStep 
                  ? 'bg-blue-600 scale-125' 
                  : index < currentStep 
                    ? 'bg-green-500' 
                    : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Call to Action */}
      <div className="mt-8 text-center bg-gradient-to-r from-blue-50 to-purple-50 p-8 rounded-2xl border border-blue-200">
        <h3 className="text-2xl font-semibold mb-4">Ready to Build This Automation?</h3>
        <p className="text-gray-700 mb-6">
          See how this automation can transform your workflow. Book a 30-minute call to discuss your specific needs.
        </p>
        <div className="flex gap-4 justify-center">
          <Button className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-3">
            📞 Book a 30-min Call
          </Button>
          <Button variant="outline" className="text-lg px-8 py-3">
            🚀 Try Live Demo
          </Button>
        </div>
      </div>
    </div>
  );
};

// Individual Automation Demo Components
const EmailProcessorDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6">
    {/* Website Header */}
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <span className="text-white font-bold">AS</span>
        </div>
        <div>
          <h1 className="text-xl font-bold">Visual Automation Builder</h1>
          <p className="text-sm text-gray-600">Smart Email Processor</p>
        </div>
      </div>
    </div>

    <div className="flex h-96">
      {/* Sidebar */}
      <div className="w-72 bg-white border rounded-l-lg p-4 mr-4">
        <h3 className="font-semibold mb-4">Google Apps</h3>
        
        {/* Gmail */}
        <div className={`p-3 border rounded-lg mb-3 transition-all ${
          step >= 1 ? 'border-red-300 bg-red-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-red-600" />
            <div>
              <div className="font-medium text-sm">Gmail</div>
              <div className="text-xs text-gray-500">26 functions</div>
            </div>
          </div>
          {step >= 1 && (
            <div className="mt-2 text-xs text-red-600 animate-pulse">✅ Monitoring emails</div>
          )}
        </div>

        {/* Google Sheets */}
        <div className={`p-3 border rounded-lg mb-3 transition-all ${
          step >= 3 ? 'border-green-300 bg-green-50' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Sheet className="w-5 h-5 text-green-600" />
            <div>
              <div className="font-medium text-sm">Google Sheets</div>
              <div className="text-xs text-gray-500">7 functions</div>
            </div>
          </div>
          {step >= 3 && (
            <div className="mt-2 text-xs text-green-600 animate-pulse">✅ Storing data</div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 bg-gray-100 border rounded-r-lg relative overflow-hidden">
        {step >= 1 && (
          <div className={`absolute transition-all duration-1000 ${
            step >= 5 ? 'left-16 top-16' : 'left-24 top-24'
          }`}>
            <AutomationNode 
              app="Gmail" 
              icon={<Mail className="w-4 h-4 text-red-600" />}
              color="#EA4335"
              configured={step >= 2}
              function={step >= 2 ? "Search Emails" : undefined}
            />
          </div>
        )}
        
        {step >= 3 && (
          <div className={`absolute transition-all duration-1000 ${
            step >= 5 ? 'right-16 top-16' : 'right-24 top-24'
          }`}>
            <AutomationNode 
              app="Google Sheets" 
              icon={<Sheet className="w-4 h-4 text-green-600" />}
              color="#0F9D58"
              configured={step >= 4}
              function={step >= 4 ? "Append Row" : undefined}
              connected={step >= 5}
            />
          </div>
        )}

        {/* Connection Animation */}
        {step >= 5 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
              </marker>
            </defs>
            <line
              x1="200"
              y1="80"
              x2="350"
              y2="80"
              stroke="#6366f1"
              strokeWidth="3"
              markerEnd="url(#arrowhead)"
              className="animate-pulse"
            />
            <text x="275" y="70" fill="#6366f1" fontSize="12" textAnchor="middle" className="font-medium">
              AI Smart Sync
            </text>
          </svg>
        )}

        {step >= 5 && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-green-500 text-white animate-pulse">
              🧠 Email → Sheets Mapping Active
            </Badge>
          </div>
        )}
      </div>
    </div>

    {/* Status Message */}
    <div className="mt-4 h-12 flex items-center justify-center">
      {step === 1 && (
        <div className="text-red-600 animate-fade-in text-center">
          📧 Gmail added! This will monitor incoming emails with the label 'leads'...
        </div>
      )}
      {step === 2 && (
        <div className="text-red-600 animate-fade-in text-center">
          ⚙️ Gmail configured to search 'is:unread label:leads' and extract customer data...
        </div>
      )}
      {step === 3 && (
        <div className="text-green-600 animate-fade-in text-center">
          📊 Google Sheets added! This will store all extracted email data...
        </div>
      )}
      {step === 4 && (
        <div className="text-green-600 animate-fade-in text-center">
          ⚙️ Sheets configured to append new rows with: Date, Subject, From, Phone, Company...
        </div>
      )}
      {step >= 5 && (
        <div className="text-purple-600 animate-fade-in text-center">
          🎯 AI Connected! Email data automatically flows to Sheets: From→Column A, Subject→Column B, Body→Column C
        </div>
      )}
    </div>
  </div>
);

const EmailProcessorResults = () => (
  <div className="h-full bg-white p-6">
    <div className="grid grid-cols-2 gap-6 h-full">
      {/* Gmail Interface */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-6 h-6 text-red-600" />
          <h3 className="text-lg font-semibold">Gmail - Processed Email</h3>
        </div>
        
        <div className="border rounded-lg p-4 bg-red-50 border-red-200">
          <div className="text-sm mb-2">
            <strong>From:</strong> sarah@newcustomer.com
          </div>
          <div className="text-sm mb-2">
            <strong>Subject:</strong> Interested in your services
          </div>
          <div className="text-sm mb-3">
            <strong>Body:</strong> Hi, I'm Sarah from TechCorp. We need automation help...
          </div>
          <Badge className="bg-green-500 text-white">✅ Processed & Extracted</Badge>
        </div>
      </div>

      {/* Sheets Interface */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sheet className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold">Google Sheets - Lead Database</h3>
        </div>
        
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 p-2 text-xs font-medium flex">
            <div className="w-24 border-r">Date</div>
            <div className="w-32 border-r">Name</div>
            <div className="w-40 border-r">Email</div>
            <div className="w-32">Company</div>
          </div>
          <div className="bg-green-50 p-2 text-xs flex animate-pulse border border-green-300">
            <div className="w-24 border-r">Aug 21, 2025</div>
            <div className="w-32 border-r font-medium">Sarah</div>
            <div className="w-40 border-r font-medium">sarah@newcustomer.com</div>
            <div className="w-32 font-medium">TechCorp</div>
          </div>
        </div>
        
        <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded text-xs text-green-800">
          ✅ New lead automatically captured and organized!
        </div>
      </div>
    </div>
  </div>
);

// Reusable Automation Node Component
const AutomationNode = ({ 
  app, 
  icon, 
  color, 
  configured, 
  function: func, 
  connected 
}: { 
  app: string; 
  icon: React.ReactNode; 
  color: string; 
  configured?: boolean; 
  function?: string;
  connected?: boolean;
}) => (
  <div className="w-56 bg-white border-2 rounded-lg shadow-lg p-3" style={{ borderColor: color + '50' }}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm">{app}</span>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full" title="AI Smart Sync"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full" title="Settings"></div>
        <div className="w-2 h-2 bg-red-500 rounded-full" title="Delete"></div>
      </div>
    </div>
    
    {configured && func ? (
      <div>
        <Badge className="text-xs mb-1" style={{ backgroundColor: color }}>
          {func}
        </Badge>
        {connected && (
          <Badge className="text-xs mb-1 ml-1 bg-blue-500">AI Mapped</Badge>
        )}
        <div className="text-xs text-gray-500">
          {connected ? 'Auto-synced with connected apps' : 'Function configured and ready'}
        </div>
      </div>
    ) : (
      <div className="text-xs text-gray-500">Click settings to configure</div>
    )}
  </div>
);

// Additional demo components for other automations...
const ReportGeneratorDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6">
    <div className="text-center">
      <h3 className="text-lg font-semibold mb-2">Report Generator Demo - Step {step}</h3>
      <p className="text-gray-600">Sheets → Drive → Gmail workflow for automated reporting</p>
    </div>
  </div>
);

const ReportGeneratorResults = () => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold text-green-600">📊 Report Generated & Emailed!</h3>
    <p className="text-gray-600">PDF report created in Drive and sent to stakeholders</p>
  </div>
);

const CalendarBookingDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold mb-2">Calendar Booking Demo - Step {step}</h3>
    <p className="text-gray-600">Calendar → Gmail → Sheets workflow for booking management</p>
  </div>
);

const CalendarBookingResults = () => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold text-blue-600">📅 Booking Confirmed & Logged!</h3>
    <p className="text-gray-600">Calendar event created, confirmation sent, booking logged</p>
  </div>
);

const FileOrganizerDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold mb-2">File Organizer Demo - Step {step}</h3>
    <p className="text-gray-600">Drive → Sheets → Gmail workflow for file management</p>
  </div>
);

const FileOrganizerResults = () => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold text-blue-600">📁 Files Organized & Team Notified!</h3>
    <p className="text-gray-600">Files sorted, activities logged, notifications sent</p>
  </div>
);

const ExpenseTrackerDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold mb-2">Expense Tracker Demo - Step {step}</h3>
    <p className="text-gray-600">Sheets → Gmail → Drive workflow for expense management</p>
  </div>
);

const ExpenseTrackerResults = () => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold text-green-600">💰 Expense Tracked & Approved!</h3>
    <p className="text-gray-600">Expense logged, receipt stored, manager notified</p>
  </div>
);

const TaskAutomatorDemo = ({ step }: { step: number }) => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold mb-2">Task Automator Demo - Step {step}</h3>
    <p className="text-gray-600">Sheets → Gmail → Calendar workflow for task management</p>
  </div>
);

const TaskAutomatorResults = () => (
  <div className="h-full p-6 text-center">
    <h3 className="text-lg font-semibold text-purple-600">✅ Tasks Automated & Team Notified!</h3>
    <p className="text-gray-600">Task updated, team notified, deadlines tracked</p>
  </div>
);

export default PreBuiltAutomationDemos;