import { useState, useEffect, useRef } from "react";
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
  Send,
  DollarSign,
  Search,
  Filter,
  Download,
  Eye,
  Settings,
  Users,
  FileSpreadsheet,
  Brain,
  Maximize2,
  Minimize2,
  X,
  Square,
  Circle,
  MessageSquare,
  FolderOpen
} from "lucide-react";

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  duration: number;
  app: 'gmail' | 'sheets' | 'calendar' | 'drive' | 'expense' | 'task';
  actions: TutorialAction[];
}

interface TutorialAction {
  type: 'click' | 'type' | 'scroll' | 'highlight' | 'move';
  target: string;
  data?: string;
  delay: number;
  duration: number;
}

interface TutorialDemoProps {
  scriptId: string;
  scriptTitle: string;
  onClose: () => void;
}

// Browser Chrome Component
const BrowserChrome = ({ children, title }: { children: React.ReactNode; title: string }) => (
  <div className="border rounded-lg bg-white shadow-xl overflow-hidden">
    {/* Browser Header */}
    <div className="bg-gray-100 border-b px-4 py-2 flex items-center gap-2">
      <div className="flex gap-1">
        <div className="size-3 rounded-full bg-red-500"></div>
        <div className="size-3 rounded-full bg-yellow-500"></div>
        <div className="size-3 rounded-full bg-green-500"></div>
      </div>
      <div className="flex-1 mx-4">
        <div className="bg-white rounded-md px-3 py-1 text-sm border flex items-center gap-2">
          <div className="size-3 rounded-full bg-green-500"></div>
          <span className="text-gray-600">{title}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Minimize2 className="size-4 text-gray-500" />
        <Maximize2 className="size-4 text-gray-500" />
        <X className="size-4 text-gray-500" />
      </div>
    </div>
    {children}
  </div>
);

// Animated Cursor Component
const AnimatedCursor = ({ x, y, isClicking }: { x: number; y: number; isClicking: boolean }) => (
  <div 
    className="fixed pointer-events-none z-50 transition-all duration-200"
    style={{ left: x, top: y }}
  >
    <div className={`size-6 border-2 border-blue-500 rounded-full transition-all duration-150 ${
      isClicking ? 'scale-75 bg-blue-500' : 'scale-100'
    }`}>
      <div className="size-1 bg-blue-500 rounded-full absolute top-1 left-1"></div>
    </div>
  </div>
);

// Gmail Interface
const GmailInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => (
  <div className="h-full bg-white">
    {/* Gmail Header */}
    <div className="bg-red-500 text-white px-6 py-3 flex items-center gap-4">
      <MessageSquare className="size-6" />
      <span className="font-semibold text-lg">Gmail</span>
      <div className="flex-1 max-w-md">
        <div className="bg-white/20 rounded-lg px-4 py-2 flex items-center gap-2">
          <Search className="size-4" />
          <input 
            type="text" 
            placeholder="Search mail" 
            className="bg-transparent text-white placeholder-white/70 flex-1 outline-none"
            defaultValue={currentAction?.type === 'type' ? currentAction.data : ''}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Filter className="size-5" />
        <Settings className="size-5" />
        <div className="size-8 rounded-full bg-white/20"></div>
      </div>
    </div>
    
    {/* Gmail Content */}
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-gray-50 border-r p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-red-100 text-red-700">
            <Mail className="size-5" />
            <span className="font-medium">Inbox</span>
            <Badge className="ml-auto bg-red-500 text-white">3</Badge>
          </div>
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100">
            <Mail className="size-5 text-gray-500" />
            <span className="text-gray-700">Sent</span>
          </div>
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100">
            <Mail className="size-5 text-gray-500" />
            <span className="text-gray-700">Drafts</span>
          </div>
        </div>
      </div>
      
      {/* Email List */}
      <div className="flex-1">
        <div className="border-b p-4">
          <div className="flex items-center gap-4">
            <input type="checkbox" className="size-4" />
            <span className="text-sm text-gray-600">Select all</span>
            <span className="text-sm text-gray-600">•</span>
            <span className="text-sm text-gray-600">3 of 3</span>
          </div>
        </div>
        
        <div className="divide-y">
          <div className={`p-4 hover:bg-gray-50 transition-all duration-300 ${
            currentAction?.target === 'email-1' ? 'bg-blue-50 border-l-4 border-blue-500' : ''
          }`}>
            <div className="flex items-center gap-4">
              <input type="checkbox" className="size-4" />
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                  C
                </div>
                <div className="flex-1">
                  <div className="font-medium">Client Company</div>
                  <div className="text-sm text-gray-600">Invoice Request</div>
                  <div className="text-xs text-gray-500">2 minutes ago</div>
                </div>
              </div>
              {currentAction?.target === 'email-1' && (
                <Badge className="bg-green-500 text-white">
                  <Eye className="size-3 mr-1" />
                  Processing
                </Badge>
              )}
            </div>
          </div>
          
          <div className="p-4 hover:bg-gray-50">
            <div className="flex items-center gap-4">
              <input type="checkbox" className="size-4" />
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-green-500 flex items-center justify-center text-white font-semibold">
                  S
                </div>
                <div className="flex-1">
                  <div className="font-medium">Supplier Vendor</div>
                  <div className="text-sm text-gray-600">Quote #12345</div>
                  <div className="text-xs text-gray-500">5 minutes ago</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 hover:bg-gray-50">
            <div className="flex items-center gap-4">
              <input type="checkbox" className="size-4" />
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold">
                  T
                </div>
                <div className="flex-1">
                  <div className="font-medium">Team Startup</div>
                  <div className="text-sm text-gray-600">Project Update</div>
                  <div className="text-xs text-gray-500">8 minutes ago</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Google Sheets Interface
const SheetsInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => (
  <div className="h-full bg-white">
    {/* Sheets Header */}
    <div className="bg-green-600 text-white px-6 py-3 flex items-center gap-4">
      <FileSpreadsheet className="size-6" />
      <span className="font-semibold text-lg">Google Sheets</span>
      <span className="text-sm">Automation_Data</span>
      <div className="flex-1"></div>
      <div className="flex items-center gap-3">
        <div className="bg-white/20 rounded px-3 py-1 text-sm">Share</div>
        <Settings className="size-5" />
      </div>
    </div>
    
    {/* Sheets Toolbar */}
    <div className="border-b p-2 flex items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">A1</span>
      </div>
      <div className="flex-1"></div>
      <div className="flex items-center gap-1 text-sm">
        <span>Ready</span>
      </div>
    </div>
    
    {/* Sheets Grid */}
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left text-sm font-medium min-w-[100px]">A</th>
            <th className="border p-2 text-left text-sm font-medium min-w-[150px]">B</th>
            <th className="border p-2 text-left text-sm font-medium min-w-[200px]">C</th>
            <th className="border p-2 text-left text-sm font-medium min-w-[150px]">D</th>
            <th className="border p-2 text-left text-sm font-medium min-w-[100px]">E</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border p-2 text-sm font-medium bg-gray-50">1</td>
            <td className="border p-2 text-sm font-medium bg-gray-50">Date</td>
            <td className="border p-2 text-sm font-medium bg-gray-50">Subject</td>
            <td className="border p-2 text-sm font-medium bg-gray-50">From</td>
            <td className="border p-2 text-sm font-medium bg-gray-50">Phone</td>
            <td className="border p-2 text-sm font-medium bg-gray-50">Company</td>
          </tr>
          <tr>
            <td className="border p-2 text-sm font-medium bg-gray-50">2</td>
            <td className="border p-2 text-sm">2024-03-14</td>
            <td className="border p-2 text-sm">Quote #12345</td>
            <td className="border p-2 text-sm">supplier@vendor.com</td>
            <td className="border p-2 text-sm">+1-555-0456</td>
            <td className="border p-2 text-sm">Vendor Inc</td>
          </tr>
          {isActive && (
            <tr className="bg-blue-50 animate-pulse">
              <td className="border p-2 text-sm font-medium bg-gray-50">3</td>
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
);

// Google Calendar Interface
const CalendarInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => (
  <div className="h-full bg-white">
    {/* Calendar Header */}
    <div className="bg-blue-600 text-white px-6 py-3 flex items-center gap-4">
      <Calendar className="size-6" />
      <span className="font-semibold text-lg">Google Calendar</span>
      <div className="flex-1"></div>
      <div className="flex items-center gap-3">
        <div className="bg-white/20 rounded px-3 py-1 text-sm">Today</div>
        <div className="bg-white/20 rounded px-3 py-1 text-sm">+</div>
        <Settings className="size-5" />
      </div>
    </div>
    
    {/* Calendar Navigation */}
    <div className="border-b p-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-gray-100 rounded">‹</button>
        <h2 className="text-lg font-semibold">March 2024</h2>
        <button className="p-2 hover:bg-gray-100 rounded">›</button>
      </div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded">Month</button>
        <button className="px-3 py-1 text-sm hover:bg-gray-100 rounded">Week</button>
        <button className="px-3 py-1 text-sm hover:bg-gray-100 rounded">Day</button>
      </div>
    </div>
    
    {/* Calendar Grid */}
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1 text-sm">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 text-center font-medium bg-gray-100">{day}</div>
        ))}
        {Array.from({ length: 31 }, (_, i) => (
          <div key={i} className={`p-2 text-center border min-h-[80px] ${
            i === 14 && isActive ? 'bg-blue-50 border-blue-300' : ''
          }`}>
            <div className="text-sm">{i + 1}</div>
            {i === 14 && isActive && (
              <div className="mt-1">
                <div className="bg-blue-500 text-white text-xs p-1 rounded">
                  Consultation Call
                </div>
                <div className="text-xs text-gray-500 mt-1">10:00 AM</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export function TutorialDemo({ scriptId, scriptTitle, onClose }: TutorialDemoProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentAction, setCurrentAction] = useState<TutorialAction | null>(null);
  const [progress, setProgress] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ x: 100, y: 100 });
  const [isClicking, setIsClicking] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);

  const getTutorialSteps = (): TutorialStep[] => {
    switch (scriptId) {
      case "email-automation":
        return [
          {
            id: "gmail-scan",
            title: "Scanning Gmail for New Emails",
            description: "The automation searches for unread emails with specific criteria",
            duration: 3000,
            app: 'gmail',
            actions: [
              { type: 'click', target: 'search-bar', delay: 500, duration: 200 },
              { type: 'type', target: 'search-bar', data: 'is:unread label:leads', delay: 1000, duration: 1500 },
              { type: 'click', target: 'email-1', delay: 500, duration: 200 },
              { type: 'highlight', target: 'email-1', delay: 300, duration: 1000 }
            ]
          },
          {
            id: "data-extract",
            title: "Extracting Data with AI",
            description: "Using AI to parse and extract structured information from emails",
            duration: 4000,
            app: 'gmail',
            actions: [
              { type: 'highlight', target: 'email-content', delay: 500, duration: 2000 },
              { type: 'move', target: 'extract-button', delay: 1000, duration: 500 },
              { type: 'click', target: 'extract-button', delay: 500, duration: 200 }
            ]
          },
          {
            id: "sheets-update",
            title: "Updating Google Sheets",
            description: "Adding extracted data to the automation spreadsheet",
            duration: 3000,
            app: 'sheets',
            actions: [
              { type: 'highlight', target: 'new-row', delay: 500, duration: 2000 },
              { type: 'move', target: 'save-button', delay: 1000, duration: 500 }
            ]
          },
          {
            id: "notification",
            title: "Sending Notifications",
            description: "Notifying team members about new data",
            duration: 2000,
            app: 'gmail',
            actions: [
              { type: 'click', target: 'compose', delay: 500, duration: 200 },
              { type: 'type', target: 'email-body', data: 'New lead data has been processed', delay: 1000, duration: 1000 }
            ]
          }
        ];
      default:
        return [
          {
            id: "data-collect",
            title: "Collecting Data",
            description: "Gathering data from multiple sources",
            duration: 3000,
            app: 'sheets',
            actions: []
          }
        ];
    }
  };

  const tutorialSteps = getTutorialSteps();

  const animateCursor = (target: string) => {
    if (!demoRef.current) return;
    
    const targetElement = demoRef.current.querySelector(`[data-target="${target}"]`);
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      const demoRect = demoRef.current.getBoundingClientRect();
      
      setCursorPosition({
        x: rect.left - demoRect.left + rect.width / 2,
        y: rect.top - demoRect.top + rect.height / 2
      });
    }
  };

  const executeAction = async (action: TutorialAction) => {
    setCurrentAction(action);
    
    // Animate cursor to target
    animateCursor(action.target);
    
    // Wait for delay
    await new Promise(resolve => setTimeout(resolve, action.delay));
    
    // Execute action
    switch (action.type) {
      case 'click':
        setIsClicking(true);
        await new Promise(resolve => setTimeout(resolve, 200));
        setIsClicking(false);
        break;
      case 'type':
        // Type animation is handled by the input field
        break;
      case 'highlight':
        // Highlight animation is handled by CSS
        break;
    }
    
    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, action.duration));
  };

  const startDemo = async () => {
    setIsRunning(true);
    setCurrentStep(0);
    setProgress(0);
    setCurrentAction(null);
    
    for (let i = 0; i < tutorialSteps.length; i++) {
      setCurrentStep(i);
      const step = tutorialSteps[i];
      
      // Execute all actions in the step
      for (const action of step.actions) {
        await executeAction(action);
      }
      
      // Update progress
      setProgress(((i + 1) * 100) / tutorialSteps.length);
      
      // Wait between steps
      if (i < tutorialSteps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setIsRunning(false);
    setCurrentStep(tutorialSteps.length);
  };

  const resetDemo = () => {
    setIsRunning(false);
    setCurrentStep(0);
    setProgress(0);
    setCurrentAction(null);
    setCursorPosition({ x: 100, y: 100 });
    setIsClicking(false);
  };

  const currentStepData = tutorialSteps[currentStep];

  const renderCurrentApp = () => {
    if (!currentStepData) return null;
    
    switch (currentStepData.app) {
      case 'gmail':
        return (
          <BrowserChrome title="Gmail - client@company.com">
            <GmailInterface isActive={isRunning} currentAction={currentAction} />
          </BrowserChrome>
        );
      case 'sheets':
        return (
          <BrowserChrome title="Automation_Data - Google Sheets">
            <SheetsInterface isActive={isRunning} currentAction={currentAction} />
          </BrowserChrome>
        );
      case 'calendar':
        return (
          <BrowserChrome title="Google Calendar">
            <CalendarInterface isActive={isRunning} currentAction={currentAction} />
          </BrowserChrome>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-blue-500/5 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Play className="size-5" />
                Tutorial Demo: {scriptTitle}
              </CardTitle>
              <CardDescription>
                Watch a realistic screen recording of how this automation works
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
              {isRunning ? "Playing..." : "Start Tutorial"}
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
          {currentStepData && (
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">{currentStepData.title}</h3>
              <p className="text-muted-foreground">{currentStepData.description}</p>
            </div>
          )}

          {/* Tutorial Screen */}
          <div className="flex justify-center" ref={demoRef}>
            <div className="w-full max-w-4xl relative">
              {renderCurrentApp()}
              <AnimatedCursor x={cursorPosition.x} y={cursorPosition.y} isClicking={isClicking} />
            </div>
          </div>

          {/* Step Indicators */}
          <div className="flex justify-center gap-2">
            {tutorialSteps.map((step, idx) => (
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