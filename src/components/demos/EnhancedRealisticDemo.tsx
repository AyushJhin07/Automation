import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Mail, HardDrive, Calendar, FileText, MousePointer, 
  Eye, Type, ArrowDown, ArrowUp, Plus, Edit3, 
  Send, CheckCircle, AlertCircle, Clock,
  Database, BarChart3, Filter, Search, Settings
} from "lucide-react";

interface AnimatedAction {
  type: 'click' | 'type' | 'select' | 'scroll' | 'hover' | 'wait';
  target: string;
  value?: string;
  duration: number;
  description: string;
}

interface RealisticDemoProps {
  scriptId: string;
  title: string;
  onComplete?: () => void;
}

export const EnhancedRealisticDemo: React.FC<RealisticDemoProps> = ({ 
  scriptId, 
  title, 
  onComplete 
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentInterface, setCurrentInterface] = useState<'gmail' | 'sheets' | 'calendar' | 'drive'>('gmail');
  const [simulatedData, setSimulatedData] = useState<any>({});
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isTyping, setIsTyping] = useState(false);
  const [currentlyTyping, setCurrentlyTyping] = useState('');

  const getActionsForScript = (scriptId: string): AnimatedAction[] => {
    switch (scriptId) {
      case 'email-automation':
        return [
          { type: 'click', target: 'gmail-inbox', duration: 500, description: 'Opening Gmail inbox' },
          { type: 'wait', target: '', duration: 800, description: 'Loading emails...' },
          { type: 'scroll', target: 'email-list', duration: 1000, description: 'Scanning for new emails' },
          { type: 'click', target: 'email-1', duration: 300, description: 'Selecting first email' },
          { type: 'wait', target: '', duration: 1200, description: 'AI analyzing email content...' },
          { type: 'hover', target: 'extract-button', duration: 500, description: 'Preparing data extraction' },
          { type: 'click', target: 'extract-button', duration: 800, description: 'Extracting structured data' },
          { type: 'click', target: 'sheets-tab', duration: 500, description: 'Switching to Google Sheets' },
          { type: 'wait', target: '', duration: 600, description: 'Opening target spreadsheet' },
          { type: 'click', target: 'new-row', duration: 400, description: 'Adding new row' },
          { type: 'type', target: 'cell-a1', value: 'Invoice #INV-2024-001', duration: 1500, description: 'Entering invoice number' },
          { type: 'type', target: 'cell-b1', value: '$1,250.00', duration: 800, description: 'Entering amount' },
          { type: 'type', target: 'cell-c1', value: '2024-03-15', duration: 600, description: 'Entering due date' },
          { type: 'click', target: 'save-button', duration: 400, description: 'Saving changes' },
          { type: 'click', target: 'notification-send', duration: 600, description: 'Sending notification to team' }
        ];
      default:
        return [
          { type: 'wait', target: '', duration: 1000, description: 'Initializing automation' },
          { type: 'click', target: 'start-button', duration: 500, description: 'Starting process' },
          { type: 'wait', target: '', duration: 2000, description: 'Processing complete' }
        ];
    }
  };

  const actions = getActionsForScript(scriptId);

  const startDemo = async () => {
    setIsRunning(true);
    setCurrentActionIndex(0);
    setProgress(0);
    setSimulatedData({});

    for (let i = 0; i < actions.length; i++) {
      setCurrentActionIndex(i);
      const action = actions[i];
      
      // Animate mouse movement for clicks
      if (action.type === 'click' || action.type === 'hover') {
        await animateMouseToTarget(action.target);
      }
      
      // Perform the action
      await performAction(action);
      
      // Update progress
      setProgress(((i + 1) / actions.length) * 100);
      
      // Wait for action duration
      await new Promise(resolve => setTimeout(resolve, action.duration));
    }

    setIsRunning(false);
    onComplete?.();
  };

  const animateMouseToTarget = async (target: string): Promise<void> => {
    // Simulate mouse movement to target element
    const targetPositions: Record<string, { x: number; y: number }> = {
      'gmail-inbox': { x: 50, y: 100 },
      'email-1': { x: 200, y: 150 },
      'extract-button': { x: 300, y: 180 },
      'sheets-tab': { x: 150, y: 50 },
      'new-row': { x: 80, y: 200 },
      'cell-a1': { x: 120, y: 220 },
      'cell-b1': { x: 220, y: 220 },
      'cell-c1': { x: 320, y: 220 },
      'save-button': { x: 400, y: 250 },
      'notification-send': { x: 350, y: 300 }
    };

    const targetPos = targetPositions[target] || { x: 200, y: 200 };
    
    // Animate mouse movement
    const steps = 10;
    const currentPos = mousePosition;
    const deltaX = (targetPos.x - currentPos.x) / steps;
    const deltaY = (targetPos.y - currentPos.y) / steps;

    for (let i = 0; i < steps; i++) {
      setMousePosition({
        x: currentPos.x + deltaX * i,
        y: currentPos.y + deltaY * i
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    setMousePosition(targetPos);
  };

  const performAction = async (action: AnimatedAction): Promise<void> => {
    switch (action.type) {
      case 'click':
        // Handle interface switching
        if (action.target === 'sheets-tab') {
          setCurrentInterface('sheets');
        } else if (action.target === 'gmail-inbox') {
          setCurrentInterface('gmail');
        }
        
        // Simulate data updates
        if (action.target === 'extract-button') {
          setSimulatedData(prev => ({
            ...prev,
            extractedData: {
              invoiceNumber: '#INV-2024-001',
              amount: '$1,250.00',
              dueDate: '2024-03-15',
              confidence: 97
            }
          }));
        }
        break;
        
      case 'type':
        if (action.value) {
          setIsTyping(true);
          setCurrentlyTyping('');
          
          // Type character by character
          for (let i = 0; i <= action.value.length; i++) {
            setCurrentlyTyping(action.value.substring(0, i));
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          setIsTyping(false);
          
          // Update cell data
          if (action.target.includes('cell')) {
            setSimulatedData(prev => ({
              ...prev,
              sheetData: {
                ...prev.sheetData,
                [action.target]: action.value
              }
            }));
          }
        }
        break;
        
      case 'scroll':
        // Simulate scroll animation
        break;
        
      case 'wait':
        // Just wait, no additional action needed
        break;
    }
  };

  const getCurrentInterface = () => {
    switch (currentInterface) {
      case 'gmail':
        return <GmailInterface data={simulatedData} currentlyTyping={currentlyTyping} isTyping={isTyping} />;
      case 'sheets':
        return <SheetsInterface data={simulatedData} currentlyTyping={currentlyTyping} isTyping={isTyping} />;
      case 'calendar':
        return <CalendarInterface data={simulatedData} currentlyTyping={currentlyTyping} isTyping={isTyping} />;
      case 'drive':
        return <DriveInterface data={simulatedData} currentlyTyping={currentlyTyping} isTyping={isTyping} />;
      default:
        return <GmailInterface data={simulatedData} currentlyTyping={currentlyTyping} isTyping={isTyping} />;
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="size-5" />
          Live Demo: {title}
        </CardTitle>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Watch the automation work in real-time with realistic interactions
          </p>
          <Button onClick={startDemo} disabled={isRunning} className="hover-glow">
            {isRunning ? "Running Demo..." : "Start Demo"}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Progress and Current Action */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress: {actions[currentActionIndex]?.description || "Ready to start"}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Mouse Cursor */}
        {isRunning && (
          <div 
            className="absolute z-50 pointer-events-none transition-all duration-100"
            style={{ 
              left: `${mousePosition.x}px`, 
              top: `${mousePosition.y + 100}px`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <MousePointer className="size-5 text-primary animate-pulse" />
          </div>
        )}

        {/* Simulated Interface */}
        <div className="relative border-2 border-muted rounded-lg overflow-hidden min-h-[500px] bg-background">
          {getCurrentInterface()}
        </div>

        {/* Current Action Indicator */}
        {isRunning && actions[currentActionIndex] && (
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
            <Clock className="size-4 text-primary animate-spin" />
            <span className="text-sm font-medium">
              {actions[currentActionIndex].description}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Gmail Interface Component
const GmailInterface = ({ data, currentlyTyping, isTyping }: any) => (
  <div className="h-full bg-white">
    {/* Gmail Header */}
    <div className="bg-red-500 text-white p-3 flex items-center gap-2">
      <Mail className="size-5" />
      <span className="font-semibold">Gmail</span>
      <div className="ml-auto flex items-center gap-2">
        <Search className="size-4" />
        <Filter className="size-4" />
        <Settings className="size-4" />
      </div>
    </div>
    
    {/* Gmail Sidebar and Content */}
    <div className="flex h-full">
      <div className="w-48 bg-gray-50 p-4 space-y-2">
        <div className="p-2 bg-red-100 rounded text-sm font-medium">Inbox</div>
        <div className="p-2 text-sm">Sent</div>
        <div className="p-2 text-sm">Drafts</div>
      </div>
      
      <div className="flex-1 p-4">
        <div className="space-y-2">
          <div className="border-b pb-2 hover:bg-gray-50 p-2 rounded cursor-pointer">
            <div className="flex justify-between">
              <span className="font-medium">client@company.com</span>
              <span className="text-xs text-gray-500">2 min ago</span>
            </div>
            <div className="text-sm text-gray-600">Invoice Request - Urgent</div>
            <div className="text-xs text-gray-500">Please find attached invoice for services...</div>
          </div>
          
          {data.extractedData && (
            <Card className="p-3 bg-green-50 border-green-200">
              <div className="text-sm font-medium text-green-800 mb-2">AI Extracted Data:</div>
              <div className="space-y-1 text-xs">
                <div>Invoice: {data.extractedData.invoiceNumber}</div>
                <div>Amount: {data.extractedData.amount}</div>
                <div>Due Date: {data.extractedData.dueDate}</div>
                <div className="flex items-center gap-2">
                  <span>Confidence:</span>
                  <Badge className="bg-green-500 text-white">{data.extractedData.confidence}%</Badge>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  </div>
);

// Google Sheets Interface Component
const SheetsInterface = ({ data, currentlyTyping, isTyping }: any) => (
  <div className="h-full bg-white">
    {/* Sheets Header */}
    <div className="bg-green-500 text-white p-3 flex items-center gap-2">
      <FileText className="size-5" />
      <span className="font-semibold">Automation_Data - Google Sheets</span>
    </div>
    
    {/* Sheets Content */}
    <div className="p-4">
      <div className="grid grid-cols-4 gap-1 mb-2">
        <div className="p-2 bg-gray-100 font-medium text-sm">A</div>
        <div className="p-2 bg-gray-100 font-medium text-sm">B</div>
        <div className="p-2 bg-gray-100 font-medium text-sm">C</div>
        <div className="p-2 bg-gray-100 font-medium text-sm">D</div>
      </div>
      
      <div className="grid grid-cols-4 gap-1 mb-2">
        <div className="p-2 border text-sm">Invoice Number</div>
        <div className="p-2 border text-sm">Amount</div>
        <div className="p-2 border text-sm">Due Date</div>
        <div className="p-2 border text-sm">Status</div>
      </div>
      
      <div className="grid grid-cols-4 gap-1">
        <div className={`p-2 border text-sm ${isTyping ? 'bg-blue-50 border-blue-300' : ''}`}>
          {data.sheetData?.['cell-a1'] || (isTyping ? currentlyTyping : '')}
          {isTyping && <span className="animate-pulse">|</span>}
        </div>
        <div className={`p-2 border text-sm ${data.sheetData?.['cell-b1'] ? 'bg-green-50' : ''}`}>
          {data.sheetData?.['cell-b1'] || ''}
        </div>
        <div className={`p-2 border text-sm ${data.sheetData?.['cell-c1'] ? 'bg-green-50' : ''}`}>
          {data.sheetData?.['cell-c1'] || ''}
        </div>
        <div className="p-2 border text-sm">
          {data.sheetData?.['cell-c1'] ? (
            <Badge className="bg-green-500">Processed</Badge>
          ) : ''}
        </div>
      </div>
      
      {Object.keys(data.sheetData || {}).length > 0 && (
        <div className="mt-4 p-3 bg-green-50 rounded-lg">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="size-4" />
            <span className="text-sm font-medium">Data successfully added to spreadsheet</span>
          </div>
        </div>
      )}
    </div>
  </div>
);

// Calendar Interface Component
const CalendarInterface = ({ data, currentlyTyping, isTyping }: any) => (
  <div className="h-full bg-white">
    <div className="bg-blue-500 text-white p-3 flex items-center gap-2">
      <Calendar className="size-5" />
      <span className="font-semibold">Google Calendar</span>
    </div>
    <div className="p-4">
      <div className="text-center text-gray-500">Calendar interface simulation</div>
    </div>
  </div>
);

// Drive Interface Component
const DriveInterface = ({ data, currentlyTyping, isTyping }: any) => (
  <div className="h-full bg-white">
    <div className="bg-yellow-500 text-white p-3 flex items-center gap-2">
      <HardDrive className="size-5" />
      <span className="font-semibold">Google Drive</span>
    </div>
    <div className="p-4">
      <div className="text-center text-gray-500">Drive interface simulation</div>
    </div>
  </div>
);

export default EnhancedRealisticDemo;