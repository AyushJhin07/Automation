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
const GmailInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => {
  const [searchText, setSearchText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  useEffect(() => {
    if (currentAction?.type === 'type' && currentAction.data) {
      // Simulate typing animation
      let currentText = '';
      const typeInterval = setInterval(() => {
        if (currentText.length < currentAction.data!.length) {
          currentText += currentAction.data![currentText.length];
          setSearchText(currentText);
        } else {
          clearInterval(typeInterval);
        }
      }, 50);
    }
  }, [currentAction]);

  useEffect(() => {
    if (currentAction?.target === 'email-1' && currentAction.type === 'highlight') {
      setIsProcessing(true);
      // Simulate data extraction
      setTimeout(() => {
        setExtractedData({
          company: 'Tech Corp',
          phone: '+1-555-0123',
          amount: '$2,500',
          dueDate: '2024-04-15'
        });
      }, 1000);
    }
  }, [currentAction]);

  return (
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
              value={searchText}
              readOnly
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
                {isProcessing && (
                  <Badge className="bg-green-500 text-white animate-pulse">
                    <Eye className="size-3 mr-1" />
                    Processing...
                  </Badge>
                )}
              </div>
              
              {/* Data Extraction Animation */}
              {extractedData && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg animate-in slide-in-from-top-2">
                  <div className="text-sm font-medium text-green-800 mb-2">Extracted Data:</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="font-medium">Company:</span> {extractedData.company}</div>
                    <div><span className="font-medium">Phone:</span> {extractedData.phone}</div>
                    <div><span className="font-medium">Amount:</span> {extractedData.amount}</div>
                    <div><span className="font-medium">Due Date:</span> {extractedData.dueDate}</div>
                  </div>
                </div>
              )}
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
};

// Google Sheets Interface
const SheetsInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => {
  const [newRowData, setNewRowData] = useState<any>(null);
  const [isAddingRow, setIsAddingRow] = useState(false);

  useEffect(() => {
    if (currentAction?.target === 'new-row' && currentAction.type === 'highlight') {
      setIsAddingRow(true);
      // Simulate row being added
      setTimeout(() => {
        setNewRowData({
          date: new Date().toLocaleDateString(),
          subject: 'Invoice Request',
          from: 'client@company.com',
          phone: '+1-555-0123',
          company: 'Tech Corp'
        });
      }, 800);
    }
  }, [currentAction]);

  return (
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
          <span>{isAddingRow ? 'Adding row...' : 'Ready'}</span>
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
            {newRowData && (
              <tr className="bg-green-50 animate-in slide-in-from-top-2">
                <td className="border p-2 text-sm font-medium bg-gray-50">3</td>
                <td className="border p-2 text-sm">{newRowData.date}</td>
                <td className="border p-2 text-sm">{newRowData.subject}</td>
                <td className="border p-2 text-sm">{newRowData.from}</td>
                <td className="border p-2 text-sm">{newRowData.phone}</td>
                <td className="border p-2 text-sm">{newRowData.company}</td>
              </tr>
            )}
            {isAddingRow && !newRowData && (
              <tr className="bg-blue-50 animate-pulse">
                <td className="border p-2 text-sm font-medium bg-gray-50">3</td>
                <td className="border p-2 text-sm">Loading...</td>
                <td className="border p-2 text-sm">Loading...</td>
                <td className="border p-2 text-sm">Loading...</td>
                <td className="border p-2 text-sm">Loading...</td>
                <td className="border p-2 text-sm">Loading...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Success Message */}
      {newRowData && (
        <div className="p-3 bg-green-50 border-t border-green-200">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="size-4" />
            <span className="text-sm font-medium">Row added successfully!</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Google Calendar Interface
const CalendarInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => {
  const [eventCreated, setEventCreated] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  useEffect(() => {
    if (currentAction?.target === 'date-15' && currentAction.type === 'click') {
      setIsCreatingEvent(true);
      // Simulate event creation
      setTimeout(() => {
        setEventCreated(true);
        setIsCreatingEvent(false);
      }, 1200);
    }
  }, [currentAction]);

  return (
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
              i === 14 && (isCreatingEvent || eventCreated) ? 'bg-blue-50 border-blue-300' : ''
            }`}>
              <div className="text-sm">{i + 1}</div>
              {i === 14 && isCreatingEvent && (
                <div className="mt-1">
                  <div className="bg-yellow-500 text-white text-xs p-1 rounded animate-pulse">
                    Creating...
                  </div>
                </div>
              )}
              {i === 14 && eventCreated && (
                <div className="mt-1">
                  <div className="bg-blue-500 text-white text-xs p-1 rounded animate-in slide-in-from-top-2">
                    Consultation Call
                  </div>
                  <div className="text-xs text-gray-500 mt-1">10:00 AM</div>
                  <div className="text-xs text-green-600 mt-1">✓ Meet Link</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Event Creation Status */}
      {isCreatingEvent && (
        <div className="p-3 bg-blue-50 border-t border-blue-200">
          <div className="flex items-center gap-2 text-blue-800">
            <div className="size-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium">Creating calendar event...</span>
          </div>
        </div>
      )}
      
      {eventCreated && (
        <div className="p-3 bg-green-50 border-t border-green-200">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="size-4" />
            <span className="text-sm font-medium">Event created successfully!</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Google Drive Interface
const DriveInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => (
  <div className="h-full bg-white">
    {/* Drive Header */}
    <div className="bg-yellow-500 text-white px-6 py-3 flex items-center gap-4">
      <FolderOpen className="size-6" />
      <span className="font-semibold text-lg">Google Drive</span>
      <div className="flex-1"></div>
      <div className="flex items-center gap-3">
        <div className="bg-white/20 rounded px-3 py-1 text-sm">New</div>
        <Settings className="size-5" />
      </div>
    </div>
    
    {/* Drive Toolbar */}
    <div className="border-b p-3 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Inbox Folder</span>
        <Badge className="bg-yellow-500 text-white text-xs">15 files</Badge>
      </div>
      <div className="flex-1"></div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded">Organize</button>
      </div>
    </div>
    
    {/* File Grid */}
    <div className="p-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { name: "Invoice.pdf", type: "PDF", size: "2.3 MB" },
          { name: "Report.docx", type: "DOCX", size: "1.8 MB" },
          { name: "Chart.xlsx", type: "XLSX", size: "3.1 MB" },
          { name: "Image.jpg", type: "JPG", size: "4.2 MB" },
          { name: "Presentation.pptx", type: "PPTX", size: "5.7 MB" },
          { name: "Data.csv", type: "CSV", size: "0.8 MB" },
          { name: "Logo.png", type: "PNG", size: "1.2 MB" },
          { name: "Contract.pdf", type: "PDF", size: "3.5 MB" }
        ].map((file, idx) => (
          <div key={idx} className={`p-3 border rounded-lg text-center transition-all duration-300 ${
            isActive && idx === 0 ? 'bg-yellow-50 border-yellow-300 shadow-md' : 'bg-gray-50'
          }`}>
            <div className="size-12 mx-auto mb-2 bg-gray-200 rounded flex items-center justify-center">
              <FileText className="size-6" />
            </div>
            <div className="text-xs font-medium">{file.name}</div>
            <div className="text-xs text-gray-500">{file.type} • {file.size}</div>
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

// Expense Tracker Interface
const ExpenseInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => (
  <div className="h-full bg-white">
    {/* Expense Header */}
    <div className="bg-green-600 text-white px-6 py-3 flex items-center gap-4">
      <DollarSign className="size-6" />
      <span className="font-semibold text-lg">Expense Tracker</span>
      <div className="flex-1"></div>
      <div className="flex items-center gap-3">
        <Badge className="bg-yellow-500 text-white">3 Pending</Badge>
        <Settings className="size-5" />
      </div>
    </div>
    
    {/* Expense Content */}
    <div className="p-4">
      <div className="space-y-4">
        {[
          { vendor: "Office Supplies Co", category: "Office Supplies", date: "2024-03-14", amount: "450.00", status: "Pending" },
          { vendor: "Travel Agency", category: "Travel", date: "2024-03-13", amount: "1,200.00", status: "Approved" },
          { vendor: "Software License", category: "Software", date: "2024-03-12", amount: "299.00", status: "Pending" }
        ].map((expense, idx) => (
          <div key={idx} className={`p-4 border rounded-lg transition-all duration-300 ${
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

// Task Management Interface
const TaskInterface = ({ isActive, currentAction }: { isActive: boolean; currentAction?: TutorialAction }) => (
  <div className="h-full bg-white">
    {/* Task Header */}
    <div className="bg-purple-600 text-white px-6 py-3 flex items-center gap-4">
      <CheckCircle2 className="size-6" />
      <span className="font-semibold text-lg">Project Tasks</span>
      <div className="flex-1"></div>
      <div className="flex items-center gap-3">
        <Badge className="bg-red-500 text-white">2 Due Today</Badge>
        <Settings className="size-5" />
      </div>
    </div>
    
    {/* Task Content */}
    <div className="p-4">
      <div className="space-y-4">
        {[
          { title: "Complete Project Proposal", assignee: "John Doe", deadline: "2024-03-15", priority: "High", completed: false },
          { title: "Review Code Changes", assignee: "Jane Smith", deadline: "2024-03-16", priority: "Medium", completed: true },
          { title: "Client Meeting Prep", assignee: "Mike Johnson", deadline: "2024-03-14", priority: "High", completed: false },
          { title: "Update Documentation", assignee: "Sarah Wilson", deadline: "2024-03-17", priority: "Low", completed: false }
        ].map((task, idx) => (
          <div key={idx} className={`p-4 border rounded-lg transition-all duration-300 ${
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
            id: "open-gmail",
            title: "Opening Gmail Interface",
            description: "Navigating to Gmail and preparing to scan for new emails",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'gmail-icon', delay: 200, duration: 500 },
              { type: 'click', target: 'gmail-icon', delay: 200, duration: 100 },
              { type: 'move', target: 'inbox-tab', delay: 300, duration: 300 },
              { type: 'click', target: 'inbox-tab', delay: 200, duration: 100 }
            ]
          },
          {
            id: "access-search",
            title: "Accessing Gmail Search",
            description: "Clicking on the search bar to enter search criteria",
            duration: 1200,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'search-bar', delay: 200, duration: 400 },
              { type: 'click', target: 'search-bar', delay: 200, duration: 100 },
              { type: 'highlight', target: 'search-bar', delay: 100, duration: 300 }
            ]
          },
          {
            id: "enter-search-query",
            title: "Entering Advanced Search Query",
            description: "Typing the search query to find relevant emails",
            duration: 2500,
            app: 'gmail',
            actions: [
              { type: 'type', target: 'search-bar', data: 'is:unread label:leads has:attachment', delay: 200, duration: 2000 },
              { type: 'move', target: 'search-button', delay: 300, duration: 300 },
              { type: 'click', target: 'search-button', delay: 200, duration: 100 }
            ]
          },
          {
            id: "review-results",
            title: "Reviewing Search Results",
            description: "Examining the filtered email results",
            duration: 2000,
            app: 'gmail',
            actions: [
              { type: 'highlight', target: 'email-results', delay: 200, duration: 1500 },
              { type: 'move', target: 'email-1', delay: 300, duration: 300 }
            ]
          },
          {
            id: "select-email",
            title: "Selecting Target Email",
            description: "Clicking on the first email to process",
            duration: 1000,
            app: 'gmail',
            actions: [
              { type: 'click', target: 'email-1', delay: 200, duration: 100 },
              { type: 'highlight', target: 'email-content', delay: 300, duration: 500 }
            ]
          },
          {
            id: "open-script-editor",
            title: "Opening Google Apps Script Editor",
            description: "Navigating to the script editor to run automation",
            duration: 2000,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'script-menu', delay: 200, duration: 400 },
              { type: 'click', target: 'script-menu', delay: 200, duration: 100 },
              { type: 'move', target: 'script-editor', delay: 300, duration: 500 },
              { type: 'click', target: 'script-editor', delay: 200, duration: 100 }
            ]
          },
          {
            id: "run-script",
            title: "Running the Email Processing Script",
            description: "Executing the automation script to process emails",
            duration: 3000,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'run-button', delay: 200, duration: 400 },
              { type: 'click', target: 'run-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'script-execution', delay: 300, duration: 2000 },
              { type: 'move', target: 'execution-complete', delay: 300, duration: 300 }
            ]
          },
          {
            id: "ai-processing",
            title: "AI Data Extraction Process",
            description: "AI analyzing email content and extracting structured data",
            duration: 3500,
            app: 'gmail',
            actions: [
              { type: 'highlight', target: 'ai-processing', delay: 200, duration: 2000 },
              { type: 'move', target: 'extraction-results', delay: 300, duration: 500 },
              { type: 'highlight', target: 'extracted-data', delay: 200, duration: 800 }
            ]
          },
          {
            id: "open-sheets",
            title: "Opening Google Sheets",
            description: "Navigating to the target spreadsheet",
            duration: 2000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'sheets-icon', delay: 200, duration: 400 },
              { type: 'click', target: 'sheets-icon', delay: 200, duration: 100 },
              { type: 'move', target: 'target-sheet', delay: 300, duration: 500 },
              { type: 'click', target: 'target-sheet', delay: 200, duration: 100 }
            ]
          },
          {
            id: "validate-data",
            title: "Validating Extracted Data",
            description: "Checking data quality before adding to spreadsheet",
            duration: 2000,
            app: 'sheets',
            actions: [
              { type: 'highlight', target: 'data-validation', delay: 200, duration: 1500 },
              { type: 'move', target: 'validation-pass', delay: 300, duration: 300 }
            ]
          },
          {
            id: "add-to-sheet",
            title: "Adding Data to Spreadsheet",
            description: "Inserting the extracted data into the target sheet",
            duration: 2500,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'new-row', delay: 200, duration: 400 },
              { type: 'highlight', target: 'new-row', delay: 200, duration: 1500 },
              { type: 'move', target: 'save-changes', delay: 300, duration: 300 },
              { type: 'click', target: 'save-changes', delay: 200, duration: 100 }
            ]
          },
          {
            id: "apply-formatting",
            title: "Applying Sheet Formatting",
            description: "Formatting the new row with proper styling",
            duration: 1800,
            app: 'sheets',
            actions: [
              { type: 'highlight', target: 'formatting-applied', delay: 200, duration: 1200 },
              { type: 'move', target: 'format-complete', delay: 300, duration: 300 }
            ]
          },
          {
            id: "return-gmail",
            title: "Returning to Gmail",
            description: "Going back to Gmail to complete the process",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'gmail-tab', delay: 200, duration: 400 },
              { type: 'click', target: 'gmail-tab', delay: 200, duration: 100 },
              { type: 'move', target: 'processed-email', delay: 300, duration: 500 }
            ]
          },
          {
            id: "apply-labels",
            title: "Applying Gmail Labels",
            description: "Adding labels to mark the email as processed",
            duration: 2000,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'label-menu', delay: 200, duration: 400 },
              { type: 'click', target: 'label-menu', delay: 200, duration: 100 },
              { type: 'move', target: 'processed-label', delay: 300, duration: 500 },
              { type: 'click', target: 'processed-label', delay: 200, duration: 100 },
              { type: 'highlight', target: 'label-applied', delay: 300, duration: 600 }
            ]
          },
          {
            id: "compose-notification",
            title: "Composing Team Notification",
            description: "Creating notification email for the team",
            duration: 2500,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'compose-button', delay: 200, duration: 400 },
              { type: 'click', target: 'compose-button', delay: 200, duration: 100 },
              { type: 'move', target: 'to-field', delay: 300, duration: 300 },
              { type: 'click', target: 'to-field', delay: 200, duration: 100 },
              { type: 'type', target: 'to-field', data: 'sales@company.com', delay: 200, duration: 800 }
            ]
          },
          {
            id: "write-notification",
            title: "Writing Notification Content",
            description: "Composing the notification email content",
            duration: 3000,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'subject-field', delay: 200, duration: 300 },
              { type: 'click', target: 'subject-field', delay: 200, duration: 100 },
              { type: 'type', target: 'subject-field', data: 'New Lead Captured: Tech Corp', delay: 200, duration: 1000 },
              { type: 'move', target: 'body-field', delay: 300, duration: 300 },
              { type: 'click', target: 'body-field', delay: 200, duration: 100 },
              { type: 'type', target: 'body-field', data: 'A new lead has been processed and added to our database. Company: Tech Corp, Contact: +1-555-0123', delay: 200, duration: 1200 }
            ]
          },
          {
            id: "send-notification",
            title: "Sending Team Notification",
            description: "Sending the notification email to the team",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'send-button', delay: 200, duration: 400 },
              { type: 'click', target: 'send-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'email-sent', delay: 300, duration: 800 }
            ]
          },
          {
            id: "completion-summary",
            title: "Process Completion Summary",
            description: "Reviewing the completed automation process",
            duration: 2000,
            app: 'gmail',
            actions: [
              { type: 'highlight', target: 'completion-status', delay: 200, duration: 1500 },
              { type: 'move', target: 'summary-details', delay: 300, duration: 300 }
            ]
          }
        ];
      case "report-generator":
        return [
          {
            id: "open-sheets",
            title: "Opening Google Sheets",
            description: "Navigating to the data source spreadsheet",
            duration: 1500,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'sheets-icon', delay: 200, duration: 400 },
              { type: 'click', target: 'sheets-icon', delay: 200, duration: 100 },
              { type: 'move', target: 'sales-data-sheet', delay: 300, duration: 500 },
              { type: 'click', target: 'sales-data-sheet', delay: 200, duration: 100 }
            ]
          },
          {
            id: "select-data-range",
            title: "Selecting Data Range",
            description: "Highlighting the data range to be analyzed",
            duration: 2000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'data-range-start', delay: 200, duration: 400 },
              { type: 'click', target: 'data-range-start', delay: 200, duration: 100 },
              { type: 'highlight', target: 'data-range', delay: 300, duration: 1200 },
              { type: 'move', target: 'range-end', delay: 300, duration: 300 }
            ]
          },
          {
            id: "open-script-editor",
            title: "Opening Google Apps Script Editor",
            description: "Accessing the script editor to run report generation",
            duration: 2000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'extensions-menu', delay: 200, duration: 400 },
              { type: 'click', target: 'extensions-menu', delay: 200, duration: 100 },
              { type: 'move', target: 'apps-script', delay: 300, duration: 500 },
              { type: 'click', target: 'apps-script', delay: 200, duration: 100 }
            ]
          },
          {
            id: "run-report-script",
            title: "Running Report Generation Script",
            description: "Executing the script to generate the report",
            duration: 3500,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'run-function', delay: 200, duration: 400 },
              { type: 'click', target: 'run-function', delay: 200, duration: 100 },
              { type: 'highlight', target: 'script-execution', delay: 300, duration: 2500 },
              { type: 'move', target: 'execution-complete', delay: 300, duration: 300 }
            ]
          },
          {
            id: "data-processing",
            title: "Processing Data and Calculations",
            description: "Running formulas and calculations on the data",
            duration: 3000,
            app: 'sheets',
            actions: [
              { type: 'highlight', target: 'calculations-running', delay: 200, duration: 2000 },
              { type: 'move', target: 'calculation-results', delay: 300, duration: 500 },
              { type: 'highlight', target: 'processed-data', delay: 200, duration: 500 }
            ]
          },
          {
            id: "create-charts",
            title: "Creating Visualization Charts",
            description: "Generating charts and graphs from the data",
            duration: 4000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'insert-menu', delay: 200, duration: 400 },
              { type: 'click', target: 'insert-menu', delay: 200, duration: 100 },
              { type: 'move', target: 'chart-option', delay: 300, duration: 500 },
              { type: 'click', target: 'chart-option', delay: 200, duration: 100 },
              { type: 'highlight', target: 'chart-creation', delay: 300, duration: 2000 },
              { type: 'move', target: 'chart-complete', delay: 300, duration: 500 }
            ]
          },
          {
            id: "open-docs",
            title: "Opening Google Docs Template",
            description: "Accessing the report template document",
            duration: 2000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'docs-icon', delay: 200, duration: 400 },
              { type: 'click', target: 'docs-icon', delay: 200, duration: 100 },
              { type: 'move', target: 'report-template', delay: 300, duration: 500 },
              { type: 'click', target: 'report-template', delay: 200, duration: 100 }
            ]
          },
          {
            id: "insert-data",
            title: "Inserting Data into Template",
            description: "Populating the template with processed data",
            duration: 3000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'template-placeholder', delay: 200, duration: 400 },
              { type: 'highlight', target: 'placeholder-highlight', delay: 200, duration: 800 },
              { type: 'move', target: 'insert-data-button', delay: 300, duration: 500 },
              { type: 'click', target: 'insert-data-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'data-inserted', delay: 300, duration: 1000 }
            ]
          },
          {
            id: "insert-charts",
            title: "Inserting Charts into Report",
            description: "Adding charts and visualizations to the document",
            duration: 2500,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'chart-placeholder', delay: 200, duration: 400 },
              { type: 'highlight', target: 'chart-placeholder-highlight', delay: 200, duration: 800 },
              { type: 'move', target: 'insert-chart-button', delay: 300, duration: 500 },
              { type: 'click', target: 'insert-chart-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'chart-inserted', delay: 300, duration: 800 }
            ]
          },
          {
            id: "format-document",
            title: "Formatting the Report Document",
            description: "Applying professional formatting and styling",
            duration: 2000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'format-menu', delay: 200, duration: 400 },
              { type: 'click', target: 'format-menu', delay: 200, duration: 100 },
              { type: 'highlight', target: 'formatting-applied', delay: 300, duration: 1200 },
              { type: 'move', target: 'format-complete', delay: 300, duration: 300 }
            ]
          },
          {
            id: "save-to-drive",
            title: "Saving Report to Google Drive",
            description: "Saving the completed report to Drive",
            duration: 2000,
            app: 'sheets',
            actions: [
              { type: 'move', target: 'file-menu', delay: 200, duration: 400 },
              { type: 'click', target: 'file-menu', delay: 200, duration: 100 },
              { type: 'move', target: 'save-as-pdf', delay: 300, duration: 500 },
              { type: 'click', target: 'save-as-pdf', delay: 200, duration: 100 },
              { type: 'highlight', target: 'pdf-saved', delay: 300, duration: 800 }
            ]
          },
          {
            id: "open-gmail",
            title: "Opening Gmail for Distribution",
            description: "Navigating to Gmail to send the report",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'gmail-icon', delay: 200, duration: 400 },
              { type: 'click', target: 'gmail-icon', delay: 200, duration: 100 },
              { type: 'move', target: 'compose-button', delay: 300, duration: 500 }
            ]
          },
          {
            id: "compose-email",
            title: "Composing Distribution Email",
            description: "Creating email to send the report",
            duration: 3000,
            app: 'gmail',
            actions: [
              { type: 'click', target: 'compose-button', delay: 200, duration: 100 },
              { type: 'move', target: 'to-field', delay: 300, duration: 300 },
              { type: 'click', target: 'to-field', delay: 200, duration: 100 },
              { type: 'type', target: 'to-field', data: 'stakeholders@company.com, management@company.com', delay: 200, duration: 1000 },
              { type: 'move', target: 'subject-field', delay: 300, duration: 300 },
              { type: 'click', target: 'subject-field', delay: 200, duration: 100 },
              { type: 'type', target: 'subject-field', data: 'Weekly Sales Performance Report - March 2024', delay: 200, duration: 1200 }
            ]
          },
          {
            id: "attach-report",
            title: "Attaching Report PDF",
            description: "Attaching the generated report to the email",
            duration: 2000,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'attach-button', delay: 200, duration: 400 },
              { type: 'click', target: 'attach-button', delay: 200, duration: 100 },
              { type: 'move', target: 'drive-attachment', delay: 300, duration: 500 },
              { type: 'click', target: 'drive-attachment', delay: 200, duration: 100 },
              { type: 'highlight', target: 'attachment-added', delay: 300, duration: 800 }
            ]
          },
          {
            id: "write-email-body",
            title: "Writing Email Body",
            description: "Composing the email content with report summary",
            duration: 3500,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'body-field', delay: 200, duration: 300 },
              { type: 'click', target: 'body-field', delay: 200, duration: 100 },
              { type: 'type', target: 'body-field', data: 'Dear Team,\n\nPlease find attached the weekly sales performance report for March 2024.\n\nKey Highlights:\n- Total Revenue: $125,000 (+15% vs last week)\n- New Customers: 45 (+8% vs last week)\n- Conversion Rate: 12.5% (+2% vs last week)\n\nBest regards,\nSales Team', delay: 200, duration: 2500 }
            ]
          },
          {
            id: "send-report",
            title: "Sending Report Email",
            description: "Sending the report to all stakeholders",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'move', target: 'send-button', delay: 200, duration: 400 },
              { type: 'click', target: 'send-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'email-sent', delay: 300, duration: 800 }
            ]
          },
          {
            id: "completion-summary",
            title: "Report Generation Complete",
            description: "Reviewing the completed report generation process",
            duration: 2000,
            app: 'gmail',
            actions: [
              { type: 'highlight', target: 'completion-status', delay: 200, duration: 1500 },
              { type: 'move', target: 'summary-details', delay: 300, duration: 300 }
            ]
          }
        ];
      case "calendar-booking":
        return [
          {
            id: "check-availability",
            title: "Checking Calendar Availability",
            description: "Scanning for available time slots",
            duration: 2000,
            app: 'calendar',
            actions: [
              { type: 'click', target: 'date-15', delay: 200, duration: 100 },
              { type: 'highlight', target: 'available-slots', delay: 300, duration: 1200 },
              { type: 'move', target: 'create-event', delay: 300, duration: 300 }
            ]
          },
          {
            id: "create-booking",
            title: "Creating Calendar Event",
            description: "Setting up meeting with Google Meet link",
            duration: 2000,
            app: 'calendar',
            actions: [
              { type: 'click', target: 'create-event', delay: 200, duration: 100 },
              { type: 'type', target: 'event-title', data: 'Consultation Call', delay: 300, duration: 600 },
              { type: 'highlight', target: 'meet-link', delay: 300, duration: 600 }
            ]
          },
          {
            id: "send-confirmation",
            title: "Sending Confirmation Email",
            description: "Emailing confirmation to participant",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'click', target: 'compose', delay: 200, duration: 100 },
              { type: 'type', target: 'email-body', data: 'Your meeting is confirmed', delay: 300, duration: 600 }
            ]
          },
          {
            id: "schedule-reminders",
            title: "Setting Up Reminders",
            description: "Scheduling automated reminder sequence",
            duration: 1500,
            app: 'calendar',
            actions: [
              { type: 'click', target: 'reminder-settings', delay: 200, duration: 100 },
              { type: 'highlight', target: 'reminder-list', delay: 300, duration: 800 }
            ]
          }
        ];
      case "file-organizer":
        return [
          {
            id: "scan-files",
            title: "Scanning Google Drive",
            description: "Analyzing files in source folder",
            duration: 2000,
            app: 'drive',
            actions: [
              { type: 'click', target: 'inbox-folder', delay: 200, duration: 100 },
              { type: 'highlight', target: 'file-list', delay: 300, duration: 1200 },
              { type: 'move', target: 'organize-button', delay: 300, duration: 300 }
            ]
          },
          {
            id: "categorize-files",
            title: "Categorizing Files by Type",
            description: "AI-powered file categorization",
            duration: 2000,
            app: 'drive',
            actions: [
              { type: 'click', target: 'organize-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'category-groups', delay: 300, duration: 1200 },
              { type: 'move', target: 'create-folders', delay: 300, duration: 300 }
            ]
          },
          {
            id: "create-folders",
            title: "Creating Organized Folders",
            description: "Setting up folder structure",
            duration: 2000,
            app: 'drive',
            actions: [
              { type: 'click', target: 'create-folders', delay: 200, duration: 100 },
              { type: 'highlight', target: 'folder-structure', delay: 300, duration: 1200 },
              { type: 'move', target: 'move-files', delay: 300, duration: 300 }
            ]
          },
          {
            id: "move-files",
            title: "Moving Files to Folders",
            description: "Automatically organizing files",
            duration: 1500,
            app: 'drive',
            actions: [
              { type: 'click', target: 'move-files', delay: 200, duration: 100 },
              { type: 'highlight', target: 'moving-files', delay: 300, duration: 800 }
            ]
          }
        ];
      case "expense-tracker":
        return [
          {
            id: "receive-receipt",
            title: "Receiving Receipt Email",
            description: "Email with receipt attachment received",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'click', target: 'receipt-email', delay: 200, duration: 100 },
              { type: 'highlight', target: 'attachment', delay: 300, duration: 800 }
            ]
          },
          {
            id: "extract-data",
            title: "Extracting Expense Data",
            description: "AI extracting details from receipt image",
            duration: 2000,
            app: 'expense',
            actions: [
              { type: 'click', target: 'extract-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'extracted-data', delay: 300, duration: 1200 },
              { type: 'move', target: 'categorize', delay: 300, duration: 300 }
            ]
          },
          {
            id: "categorize-expense",
            title: "Categorizing Expense",
            description: "Auto-categorizing expense type",
            duration: 1500,
            app: 'expense',
            actions: [
              { type: 'click', target: 'categorize', delay: 200, duration: 100 },
              { type: 'highlight', target: 'category-result', delay: 300, duration: 800 }
            ]
          },
          {
            id: "approval-workflow",
            title: "Sending for Approval",
            description: "Initiating approval workflow",
            duration: 1500,
            app: 'expense',
            actions: [
              { type: 'click', target: 'approve-button', delay: 200, duration: 100 },
              { type: 'highlight', target: 'approval-status', delay: 300, duration: 800 }
            ]
          }
        ];
      case "task-automation":
        return [
          {
            id: "scan-tasks",
            title: "Scanning Project Tasks",
            description: "Analyzing tasks and deadlines",
            duration: 2000,
            app: 'task',
            actions: [
              { type: 'click', target: 'project-sheet', delay: 200, duration: 100 },
              { type: 'highlight', target: 'task-list', delay: 300, duration: 1200 },
              { type: 'move', target: 'check-deadlines', delay: 300, duration: 300 }
            ]
          },
          {
            id: "check-deadlines",
            title: "Checking Task Deadlines",
            description: "Identifying overdue and due tasks",
            duration: 2000,
            app: 'task',
            actions: [
              { type: 'click', target: 'check-deadlines', delay: 200, duration: 100 },
              { type: 'highlight', target: 'overdue-tasks', delay: 300, duration: 1200 },
              { type: 'move', target: 'send-reminders', delay: 300, duration: 300 }
            ]
          },
          {
            id: "send-reminders",
            title: "Sending Deadline Reminders",
            description: "Automated reminder emails",
            duration: 1500,
            app: 'gmail',
            actions: [
              { type: 'click', target: 'compose', delay: 200, duration: 100 },
              { type: 'type', target: 'email-body', data: 'Task deadline reminder', delay: 300, duration: 600 }
            ]
          },
          {
            id: "update-status",
            title: "Updating Task Status",
            description: "Updating progress and generating reports",
            duration: 1500,
            app: 'task',
            actions: [
              { type: 'click', target: 'update-status', delay: 200, duration: 100 },
              { type: 'highlight', target: 'status-updates', delay: 300, duration: 800 }
            ]
          }
        ];
      default:
        return [
          {
            id: "data-collect",
            title: "Collecting Data",
            description: "Gathering data from multiple sources",
            duration: 2000,
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
        await new Promise(resolve => setTimeout(resolve, 100));
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
      
      // Shorter wait between steps for faster demo
      if (i < tutorialSteps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
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
      case 'drive':
        return (
          <BrowserChrome title="Google Drive - Inbox Folder">
            <DriveInterface isActive={isRunning} currentAction={currentAction} />
          </BrowserChrome>
        );
      case 'expense':
        return (
          <BrowserChrome title="Expense Tracker - Pending Approvals">
            <ExpenseInterface isActive={isRunning} currentAction={currentAction} />
          </BrowserChrome>
        );
      case 'task':
        return (
          <BrowserChrome title="Project Tasks - Due Today">
            <TaskInterface isActive={isRunning} currentAction={currentAction} />
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