import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Sheet, Mail, Calendar, FolderOpen } from 'lucide-react';

interface DemoStep {
  id: number;
  title: string;
  description: string;
  duration: number;
  component: React.ReactNode;
}

export const AutomationScreenRecording = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const demoSteps: DemoStep[] = [
    {
      id: 1,
      title: "Step 1: Open Automation Builder",
      description: "Customer opens the automation platform",
      duration: 3000,
      component: <WebsiteInterface step={1} />
    },
    {
      id: 2,
      title: "Step 2: Drag Google Sheets",
      description: "Customer drags Google Sheets onto the canvas",
      duration: 4000,
      component: <WebsiteInterface step={2} />
    },
    {
      id: 3,
      title: "Step 3: Configure Sheets Function",
      description: "Customer selects 'Append Row' function and configures it",
      duration: 5000,
      component: <WebsiteInterface step={3} />
    },
    {
      id: 4,
      title: "Step 4: Add Gmail Node",
      description: "Customer drags Gmail and selects 'Send Email' function",
      duration: 4000,
      component: <WebsiteInterface step={4} />
    },
    {
      id: 5,
      title: "Step 5: Connect Applications",
      description: "Customer connects Sheets to Gmail - AI automatically maps fields",
      duration: 4000,
      component: <WebsiteInterface step={5} />
    },
    {
      id: 6,
      title: "Step 6: Generate Script",
      description: "Customer generates the Google Apps Script automation",
      duration: 3000,
      component: <WebsiteInterface step={6} />
    },
    {
      id: 7,
      title: "Step 7: See Results in Google Sheets",
      description: "New row appears in the actual Google Sheets",
      duration: 4000,
      component: <GoogleSheetsInterface />
    },
    {
      id: 8,
      title: "Step 8: Email Sent via Gmail",
      description: "Email automatically sent based on the new row data",
      duration: 4000,
      component: <GmailInterface />
    },
    {
      id: 9,
      title: "Step 9: Calendar Event Created",
      description: "Calendar event automatically created from the data",
      duration: 4000,
      component: <GoogleCalendarInterface />
    },
    {
      id: 10,
      title: "Step 10: Files Organized in Drive",
      description: "Related files automatically organized in Google Drive",
      duration: 3000,
      component: <GoogleDriveInterface />
    }
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying) {
      interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 100;
          if (newProgress >= demoSteps[currentStep].duration) {
            // Move to next step
            if (currentStep < demoSteps.length - 1) {
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
  }, [isPlaying, currentStep, demoSteps]);

  const handlePlay = () => setIsPlaying(!isPlaying);
  const handleReset = () => {
    setCurrentStep(0);
    setProgress(0);
    setIsPlaying(false);
  };

  const progressPercentage = (progress / demoSteps[currentStep]?.duration) * 100;

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      {/* Demo Controls */}
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold mb-4">🎬 Live Automation Demo</h2>
        <p className="text-gray-600 mb-6">
          Watch how customers build intelligent automations with our platform
        </p>
        
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
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-100"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        {/* Step Info */}
        <div className="text-sm text-gray-600">
          Step {currentStep + 1} of {demoSteps.length}: {demoSteps[currentStep]?.title}
        </div>
      </div>

      {/* Demo Screen */}
      <Card className="w-full h-[600px] overflow-hidden border-2 border-gray-300 rounded-lg shadow-2xl">
        <CardContent className="p-0 h-full">
          {/* Browser Chrome */}
          <div className="bg-gray-100 p-2 border-b flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="flex-1 bg-white rounded px-3 py-1 text-sm text-gray-600">
              🌐 localhost:5001/pre-built-apps
            </div>
          </div>
          
          {/* Demo Content */}
          <div className="h-full bg-white">
            {demoSteps[currentStep]?.component}
          </div>
        </CardContent>
      </Card>

      {/* Step Description */}
      <div className="mt-4 text-center">
        <h3 className="text-xl font-semibold mb-2">{demoSteps[currentStep]?.title}</h3>
        <p className="text-gray-600">{demoSteps[currentStep]?.description}</p>
      </div>

      {/* Step Navigation */}
      <div className="mt-6 flex justify-center gap-2">
        {demoSteps.map((step, index) => (
          <button
            key={step.id}
            onClick={() => {
              setCurrentStep(index);
              setProgress(0);
              setIsPlaying(false);
            }}
            className={`w-3 h-3 rounded-full transition-colors ${
              index === currentStep 
                ? 'bg-blue-600' 
                : index < currentStep 
                  ? 'bg-green-500' 
                  : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

// Website Interface Component
const WebsiteInterface = ({ step }: { step: number }) => {
  return (
    <div className="h-full bg-gray-50 relative overflow-hidden">
      {/* Website Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AS</span>
          </div>
          <span className="font-semibold">Apps Script Studio</span>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-blue-600 font-medium">Pre-Built Apps</span>
          <span>Demos</span>
          <span>Contact</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">🔧 Visual Automation Builder</h1>
        <p className="text-gray-600 mb-6">Create your custom automation workflow by connecting Google Workspace applications</p>

        <div className="flex h-96">
          {/* Sidebar */}
          <div className="w-80 bg-white border rounded-l-lg p-4">
            <h3 className="font-semibold mb-4">Google Apps</h3>
            
            {/* Google Sheets */}
            <div className={`p-3 border rounded-lg mb-3 transition-all cursor-pointer ${
              step >= 2 ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-blue-300'
            }`}>
              <div className="flex items-center gap-2">
                <Sheet className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-sm">Google Sheets</div>
                  <div className="text-xs text-gray-500">7 functions</div>
                </div>
              </div>
              {step >= 2 && (
                <div className="mt-2 text-xs text-green-600">✅ Added to canvas</div>
              )}
            </div>

            {/* Gmail */}
            <div className={`p-3 border rounded-lg mb-3 transition-all cursor-pointer ${
              step >= 4 ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-blue-300'
            }`}>
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-red-600" />
                <div>
                  <div className="font-medium text-sm">Gmail</div>
                  <div className="text-xs text-gray-500">26 functions</div>
                </div>
              </div>
              {step >= 4 && (
                <div className="mt-2 text-xs text-red-600">✅ Added to canvas</div>
              )}
            </div>

            {/* Other Apps */}
            <div className="p-3 border border-gray-200 rounded-lg mb-3 opacity-50">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="font-medium text-sm">Google Calendar</div>
                  <div className="text-xs text-gray-500">12 functions</div>
                </div>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-gray-100 border rounded-r-lg relative">
            {step >= 2 && (
              <div className={`absolute transition-all duration-1000 ${
                step >= 5 ? 'left-20 top-20' : 'left-32 top-32'
              }`}>
                <SheetsNodeDemo configured={step >= 3} />
              </div>
            )}
            
            {step >= 4 && (
              <div className={`absolute transition-all duration-1000 ${
                step >= 5 ? 'right-20 top-20' : 'right-32 top-32'
              }`}>
                <GmailNodeDemo configured={step >= 4} connected={step >= 5} />
              </div>
            )}

            {/* Connection Line */}
            {step >= 5 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                    refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                  </marker>
                </defs>
                <line
                  x1="180"
                  y1="80"
                  x2="320"
                  y2="80"
                  stroke="#6366f1"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead)"
                  className="animate-pulse"
                />
              </svg>
            )}

            {step >= 5 && (
              <div className="absolute top-4 right-4">
                <Badge className="bg-green-500 text-white animate-pulse">
                  🧠 AI Smart Sync Active
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Status Messages */}
        <div className="mt-4 h-8">
          {step === 1 && (
            <div className="text-blue-600 animate-fade-in">
              👋 Welcome! Let's build an automation that sends emails when new rows are added to Google Sheets...
            </div>
          )}
          {step === 2 && (
            <div className="text-green-600 animate-fade-in">
              📊 Google Sheets added! Now let's configure it to monitor for new rows...
            </div>
          )}
          {step === 3 && (
            <div className="text-green-600 animate-fade-in">
              ⚙️ Sheets configured with "Append Row" function. It will detect new customer data...
            </div>
          )}
          {step === 4 && (
            <div className="text-red-600 animate-fade-in">
              📧 Gmail added! Let's configure it to send welcome emails...
            </div>
          )}
          {step === 5 && (
            <div className="text-purple-600 animate-fade-in">
              🎯 Connected! AI automatically mapped: Column B→Email, Column A→Name, Column C→Message
            </div>
          )}
          {step === 6 && (
            <div className="text-blue-600 animate-fade-in">
              🚀 Script generated! The automation is ready to run in Google Apps Script...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Individual Node Demos
const SheetsNodeDemo = ({ configured }: { configured: boolean }) => (
  <div className="w-64 bg-white border-2 border-green-300 rounded-lg shadow-lg p-3">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Sheet className="w-4 h-4 text-green-600" />
        <span className="font-medium text-sm">Google Sheets</span>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
      </div>
    </div>
    {configured ? (
      <div>
        <Badge className="text-xs mb-1 bg-green-500">Append Row</Badge>
        <div className="text-xs text-gray-500">Monitor for new customer data</div>
      </div>
    ) : (
      <div className="text-xs text-gray-500">Click settings to configure</div>
    )}
  </div>
);

const GmailNodeDemo = ({ configured, connected }: { configured: boolean; connected: boolean }) => (
  <div className="w-64 bg-white border-2 border-red-300 rounded-lg shadow-lg p-3">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-red-600" />
        <span className="font-medium text-sm">Gmail</span>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
      </div>
    </div>
    {configured ? (
      <div>
        <Badge className="text-xs mb-1 bg-red-500">Send Email</Badge>
        {connected && <Badge className="text-xs mb-1 ml-1 bg-blue-500">AI Mapped</Badge>}
        <div className="text-xs text-gray-500">
          {connected ? 'Auto-mapped to Sheets data' : 'Send welcome emails to customers'}
        </div>
      </div>
    ) : (
      <div className="text-xs text-gray-500">Click settings to configure</div>
    )}
  </div>
);

// Google Apps Interface Simulations
const GoogleSheetsInterface = () => (
  <div className="h-full bg-white p-4">
    <div className="mb-4 flex items-center gap-2">
      <Sheet className="w-6 h-6 text-green-600" />
      <h3 className="text-lg font-semibold">Google Sheets - Customer Database</h3>
    </div>
    
    <div className="border rounded-lg overflow-hidden">
      {/* Spreadsheet Header */}
      <div className="bg-gray-50 border-b p-2 flex">
        <div className="w-12 text-center text-xs font-medium border-r">#</div>
        <div className="w-32 text-center text-xs font-medium border-r">Name (A)</div>
        <div className="w-48 text-center text-xs font-medium border-r">Email (B)</div>
        <div className="w-48 text-center text-xs font-medium">Message (C)</div>
      </div>
      
      {/* Existing Data */}
      <div className="bg-white">
        <div className="p-2 flex border-b">
          <div className="w-12 text-center text-xs border-r">1</div>
          <div className="w-32 text-xs border-r px-2">John Smith</div>
          <div className="w-48 text-xs border-r px-2">john@example.com</div>
          <div className="w-48 text-xs px-2">Welcome to our service!</div>
        </div>
        <div className="p-2 flex border-b">
          <div className="w-12 text-center text-xs border-r">2</div>
          <div className="w-32 text-xs border-r px-2">Sarah Johnson</div>
          <div className="w-48 text-xs border-r px-2">sarah@company.com</div>
          <div className="w-48 text-xs px-2">Thank you for signing up!</div>
        </div>
        
        {/* New Row Animation */}
        <div className="p-2 flex border-b bg-green-50 border-green-200 animate-pulse">
          <div className="w-12 text-center text-xs border-r">3</div>
          <div className="w-32 text-xs border-r px-2 font-medium text-green-700">Mike Davis</div>
          <div className="w-48 text-xs border-r px-2 font-medium text-green-700">mike@startup.com</div>
          <div className="w-48 text-xs px-2 font-medium text-green-700">Welcome aboard!</div>
        </div>
      </div>
    </div>
    
    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
      <div className="text-sm text-green-800 font-medium">✅ New Row Detected!</div>
      <div className="text-xs text-green-700">Automation triggered: Sending welcome email to mike@startup.com</div>
    </div>
  </div>
);

const GmailInterface = () => (
  <div className="h-full bg-white p-4">
    <div className="mb-4 flex items-center gap-2">
      <Mail className="w-6 h-6 text-red-600" />
      <h3 className="text-lg font-semibold">Gmail - Automated Email</h3>
    </div>
    
    {/* Gmail Compose Window */}
    <div className="border rounded-lg overflow-hidden shadow-lg">
      <div className="bg-red-600 text-white p-3 flex items-center justify-between">
        <span className="font-medium">Compose Email</span>
        <Badge className="bg-green-500">Auto-Generated</Badge>
      </div>
      
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium w-16">To:</span>
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded px-3 py-1 text-sm">
            mike@startup.com
            <span className="ml-2 text-xs text-blue-600">(from Column B)</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium w-16">Subject:</span>
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded px-3 py-1 text-sm">
            Welcome Mike Davis!
            <span className="ml-2 text-xs text-blue-600">(from Column A)</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <span className="text-sm font-medium w-16">Body:</span>
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded p-3 text-sm">
            <div>Welcome aboard!</div>
            <div className="text-xs text-blue-600 mt-1">(from Column C)</div>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-50 p-3 border-t">
        <Button className="bg-red-600 hover:bg-red-700 text-white">
          📤 Email Sent Automatically
        </Button>
      </div>
    </div>
    
    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
      <div className="text-sm text-red-800 font-medium">📧 Email Sent Successfully!</div>
      <div className="text-xs text-red-700">Welcome email automatically sent to mike@startup.com</div>
    </div>
  </div>
);

const GoogleCalendarInterface = () => (
  <div className="h-full bg-white p-4">
    <div className="mb-4 flex items-center gap-2">
      <Calendar className="w-6 h-6 text-blue-600" />
      <h3 className="text-lg font-semibold">Google Calendar - Auto Event</h3>
    </div>
    
    {/* Calendar Grid */}
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-blue-600 text-white p-3">
        <span className="font-medium">August 2025</span>
      </div>
      
      <div className="grid grid-cols-7 gap-px bg-gray-200">
        {/* Calendar Days */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="bg-gray-50 p-2 text-xs font-medium text-center">
            {day}
          </div>
        ))}
        
        {/* Calendar Dates */}
        {Array.from({ length: 21 }, (_, i) => (
          <div key={i} className="bg-white p-2 h-16 text-xs">
            <div className="text-gray-600">{i + 10}</div>
            {i === 11 && (
              <div className="mt-1 bg-green-100 border border-green-300 rounded px-1 py-0.5 text-green-700 animate-pulse">
                <div className="text-xs font-medium">Follow-up</div>
                <div className="text-xs">Mike Davis</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    
    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="text-sm text-blue-800 font-medium">📅 Calendar Event Created!</div>
      <div className="text-xs text-blue-700">Follow-up meeting scheduled automatically for new customer Mike Davis</div>
    </div>
  </div>
);

const GoogleDriveInterface = () => (
  <div className="h-full bg-white p-4">
    <div className="mb-4 flex items-center gap-2">
      <FolderOpen className="w-6 h-6 text-blue-600" />
      <h3 className="text-lg font-semibold">Google Drive - Auto Organization</h3>
    </div>
    
    {/* Drive File List */}
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-blue-600 text-white p-3">
        <span className="font-medium">Customer Files / Mike Davis</span>
      </div>
      
      <div className="divide-y">
        <div className="p-3 flex items-center gap-3 bg-green-50 border-green-200 animate-pulse">
          <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
            📄
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">Welcome_Package_Mike_Davis.pdf</div>
            <div className="text-xs text-gray-500">Auto-generated • Just now</div>
          </div>
          <Badge className="bg-green-500 text-white text-xs">New</Badge>
        </div>
        
        <div className="p-3 flex items-center gap-3 bg-green-50 border-green-200 animate-pulse">
          <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
            📊
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">Customer_Data_Mike_Davis.xlsx</div>
            <div className="text-xs text-gray-500">Auto-backup • Just now</div>
          </div>
          <Badge className="bg-blue-500 text-white text-xs">Backup</Badge>
        </div>
        
        <div className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
            📁
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">Customer_Archive</div>
            <div className="text-xs text-gray-500">Folder • 2 items</div>
          </div>
        </div>
      </div>
    </div>
    
    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="text-sm text-blue-800 font-medium">📁 Files Auto-Organized!</div>
      <div className="text-xs text-blue-700">Customer folder created and files automatically organized for Mike Davis</div>
    </div>
  </div>
);

export default AutomationScreenRecording;