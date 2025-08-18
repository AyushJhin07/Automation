import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Pause,
  RotateCcw, 
  X, 
  Mail, 
  Search, 
  FileSpreadsheet, 
  Calendar, 
  FolderCog, 
  DollarSign, 
  CheckCircle2,
  Brain,
  Eye,
  Download,
  Send,
  Clock,
  Settings,
  Users,
  FileText,
  BarChart3,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  Star,
  Archive,
  Reply,
  Forward,
  Share,
  Video,
  Phone,
  MapPin,
  Link,
  File,
  Image,
  Film,
  Music,
  Code,
  Database,
  Cloud,
  Lock,
  Unlock,
  User,
  UserCheck,
  UserX,
  Users2,
  Building,
  Home,
  Briefcase,
  ShoppingCart,
  CreditCard,
  Receipt,
  Calculator,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Zap,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
  HelpCircle,
  ExternalLink,
  Copy,
  Save,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Grid,
  List,
  Layout,
  Sidebar,
  SidebarClose,
  Menu,
  Bell,
  Heart,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  PhoneCall,
  Camera,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero
} from "lucide-react";
import { DriveInterface, DocsInterface } from "./AdditionalInterfaces";

// Types
interface TutorialStep {
  id: string;
  title: string;
  description: string;
  duration: number;
  interface: 'gmail' | 'sheets' | 'calendar' | 'drive' | 'script-editor' | 'expense' | 'task';
  cursorPosition: { x: number; y: number };
  actions: TutorialAction[];
  data?: any;
}

interface TutorialAction {
  type: 'click' | 'type' | 'hover' | 'select' | 'drag' | 'drop' | 'open' | 'close' | 'process' | 'complete';
  target: string;
  data?: string;
  delay: number;
  duration: number;
  effect?: 'highlight' | 'pulse' | 'shake' | 'glow' | 'fade';
}

interface CursorState {
  x: number;
  y: number;
  isClicking: boolean;
  isTyping: boolean;
  isDragging: boolean;
  target?: string;
  effect?: string;
}

interface InterfaceState {
  currentApp: string;
  data: any;
  highlights: string[];
  loadingStates: string[];
  completedActions: string[];
}

// Enhanced Tutorial Demo Component
export default function EnhancedTutorialDemo({ 
  scriptId, 
  scriptTitle, 
  onClose 
}: { 
  scriptId: string; 
  scriptTitle: string; 
  onClose: () => void; 
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursor, setCursor] = useState<CursorState>({
    x: 100,
    y: 100,
    isClicking: false,
    isTyping: false,
    isDragging: false
  });
  const [interfaceState, setInterfaceState] = useState<InterfaceState>({
    currentApp: 'gmail',
    data: {},
    highlights: [],
    loadingStates: [],
    completedActions: []
  });

  // Tutorial steps for different workflows
  const getTutorialSteps = (scriptId: string): TutorialStep[] => {
    switch (scriptId) {
      case 'email-automation':
        return [
          {
            id: 'open-gmail',
            title: 'Opening Gmail',
            description: 'Navigating to Gmail interface',
            duration: 2000,
            interface: 'gmail',
            cursorPosition: { x: 120, y: 60 },
            actions: [
              { type: 'click', target: 'gmail-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'search-emails',
            title: 'Searching for Lead Emails',
            description: 'Typing search query to find lead emails',
            duration: 3000,
            interface: 'gmail',
            cursorPosition: { x: 320, y: 90 },
            actions: [
              { type: 'click', target: 'search-bar', delay: 200, duration: 100 },
              { type: 'type', target: 'search-bar', data: 'subject:(lead OR inquiry OR quote)', delay: 300, duration: 1500 }
            ]
          },
          {
            id: 'select-email',
            title: 'Selecting Target Email',
            description: 'Clicking on the lead email to process',
            duration: 2000,
            interface: 'gmail',
            cursorPosition: { x: 180, y: 160 },
            actions: [
              { type: 'click', target: 'email-item', delay: 200, duration: 100 }
            ],
            data: { selectedEmail: 'lead-email-1' }
          },
          {
            id: 'open-script',
            title: 'Opening Google Apps Script',
            description: 'Accessing the script editor to run automation',
            duration: 2500,
            interface: 'script-editor',
            cursorPosition: { x: 100, y: 50 },
            actions: [
              { type: 'click', target: 'script-menu', delay: 200, duration: 100 },
              { type: 'click', target: 'script-editor', delay: 300, duration: 100 }
            ]
          },
          {
            id: 'run-script',
            title: 'Running Email Processing Script',
            description: 'Executing the script to extract lead data',
            duration: 4000,
            interface: 'script-editor',
            cursorPosition: { x: 500, y: 300 },
            actions: [
              { type: 'click', target: 'run-button', delay: 200, duration: 100 },
              { type: 'process', target: 'script-execution', delay: 500, duration: 3000 }
            ],
            data: { 
              extractedData: {
                name: 'John Smith',
                email: 'john.smith@company.com',
                phone: '+1-555-0123',
                company: 'Tech Corp',
                message: 'Interested in your services'
              }
            }
          },
          {
            id: 'open-sheets',
            title: 'Opening Google Sheets',
            description: 'Accessing the leads database sheet',
            duration: 2000,
            interface: 'sheets',
            cursorPosition: { x: 200, y: 100 },
            actions: [
              { type: 'click', target: 'sheets-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'add-lead-data',
            title: 'Adding Lead Data to Sheet',
            description: 'Inserting extracted lead information into the database',
            duration: 3000,
            interface: 'sheets',
            cursorPosition: { x: 300, y: 250 },
            actions: [
              { type: 'click', target: 'new-row', delay: 200, duration: 100 },
              { type: 'type', target: 'name-cell', data: 'John Smith', delay: 300, duration: 500 },
              { type: 'type', target: 'email-cell', data: 'john.smith@company.com', delay: 300, duration: 500 },
              { type: 'type', target: 'phone-cell', data: '+1-555-0123', delay: 300, duration: 500 },
              { type: 'type', target: 'company-cell', data: 'Tech Corp', delay: 300, duration: 500 }
            ]
          }
        ];

      case 'calendar-booking':
        return [
          {
            id: 'open-calendar',
            title: 'Opening Google Calendar',
            description: 'Navigating to Google Calendar interface',
            duration: 2000,
            interface: 'calendar',
            cursorPosition: { x: 150, y: 80 },
            actions: [
              { type: 'click', target: 'calendar-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'navigate-date',
            title: 'Navigating to Target Date',
            description: 'Moving to the specific date for booking',
            duration: 2500,
            interface: 'calendar',
            cursorPosition: { x: 400, y: 150 },
            actions: [
              { type: 'click', target: 'date-navigation', delay: 200, duration: 100 },
              { type: 'click', target: 'target-date', delay: 300, duration: 100 }
            ]
          },
          {
            id: 'check-availability',
            title: 'Checking Available Time Slots',
            description: 'Scanning calendar for available booking slots',
            duration: 3000,
            interface: 'calendar',
            cursorPosition: { x: 300, y: 250 },
            actions: [
              { type: 'click', target: 'time-slot', delay: 200, duration: 100 },
              { type: 'process', target: 'availability-check', delay: 500, duration: 2000 }
            ]
          },
          {
            id: 'create-event',
            title: 'Creating Calendar Event',
            description: 'Setting up the booking appointment',
            duration: 3500,
            interface: 'calendar',
            cursorPosition: { x: 450, y: 300 },
            actions: [
              { type: 'click', target: 'create-event', delay: 200, duration: 100 },
              { type: 'type', target: 'event-title', data: 'Client Consultation', delay: 300, duration: 800 },
              { type: 'type', target: 'event-description', data: 'Initial consultation call with client', delay: 300, duration: 1000 }
            ]
          }
        ];

      case 'report-generator':
        return [
          {
            id: 'open-sheets',
            title: 'Opening Google Sheets',
            description: 'Accessing the data source spreadsheet',
            duration: 2000,
            interface: 'sheets',
            cursorPosition: { x: 150, y: 80 },
            actions: [
              { type: 'click', target: 'sheets-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'select-data-range',
            title: 'Selecting Data Range',
            description: 'Selecting the data range for report generation',
            duration: 2500,
            interface: 'sheets',
            cursorPosition: { x: 300, y: 200 },
            actions: [
              { type: 'click', target: 'data-range', delay: 200, duration: 100 },
              { type: 'drag', target: 'select-range', delay: 300, duration: 1000 }
            ]
          },
          {
            id: 'open-script-editor',
            title: 'Opening Google Apps Script',
            description: 'Accessing the script editor to run report generation',
            duration: 2500,
            interface: 'script-editor',
            cursorPosition: { x: 100, y: 50 },
            actions: [
              { type: 'click', target: 'script-menu', delay: 200, duration: 100 },
              { type: 'click', target: 'script-editor', delay: 300, duration: 100 }
            ]
          },
          {
            id: 'run-report-script',
            title: 'Running Report Generation Script',
            description: 'Executing the script to generate the report',
            duration: 4000,
            interface: 'script-editor',
            cursorPosition: { x: 500, y: 300 },
            actions: [
              { type: 'click', target: 'run-button', delay: 200, duration: 100 },
              { type: 'process', target: 'script-execution', delay: 500, duration: 3000 }
            ],
            data: { 
              reportData: {
                totalRevenue: '$125,000',
                growthRate: '15.2%',
                topProducts: ['Product A', 'Product B', 'Product C'],
                chartData: 'Revenue trends and growth metrics'
              }
            }
          },
          {
            id: 'open-docs',
            title: 'Opening Google Docs',
            description: 'Accessing the report template document',
            duration: 2000,
            interface: 'drive',
            cursorPosition: { x: 200, y: 100 },
            actions: [
              { type: 'click', target: 'docs-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'insert-report-data',
            title: 'Inserting Report Data',
            description: 'Adding generated data to the report document',
            duration: 3000,
            interface: 'drive',
            cursorPosition: { x: 400, y: 250 },
            actions: [
              { type: 'click', target: 'insert-data', delay: 200, duration: 100 },
              { type: 'type', target: 'revenue-cell', data: '$125,000', delay: 300, duration: 500 },
              { type: 'type', target: 'growth-cell', data: '15.2%', delay: 300, duration: 500 }
            ]
          },
          {
            id: 'generate-charts',
            title: 'Generating Charts',
            description: 'Creating visual charts for the report',
            duration: 3500,
            interface: 'drive',
            cursorPosition: { x: 350, y: 300 },
            actions: [
              { type: 'click', target: 'insert-chart', delay: 200, duration: 100 },
              { type: 'process', target: 'chart-generation', delay: 500, duration: 2500 }
            ]
          },
          {
            id: 'save-to-drive',
            title: 'Saving Report to Drive',
            description: 'Saving the completed report to Google Drive',
            duration: 2000,
            interface: 'drive',
            cursorPosition: { x: 450, y: 200 },
            actions: [
              { type: 'click', target: 'save-button', delay: 200, duration: 100 },
              { type: 'type', target: 'filename', data: 'Monthly_Report_March_2024.pdf', delay: 300, duration: 800 }
            ]
          }
        ];

      case 'file-organizer':
        return [
          {
            id: 'open-drive',
            title: 'Opening Google Drive',
            description: 'Navigating to Google Drive interface',
            duration: 2000,
            interface: 'drive',
            cursorPosition: { x: 150, y: 80 },
            actions: [
              { type: 'click', target: 'drive-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'navigate-to-inbox',
            title: 'Navigating to Inbox Folder',
            description: 'Accessing the source folder to organize',
            duration: 2500,
            interface: 'drive',
            cursorPosition: { x: 250, y: 150 },
            actions: [
              { type: 'click', target: 'inbox-folder', delay: 200, duration: 100 },
              { type: 'click', target: 'folder-content', delay: 300, duration: 100 }
            ]
          },
          {
            id: 'scan-files',
            title: 'Scanning Files in Folder',
            description: 'Analyzing files for organization',
            duration: 3000,
            interface: 'drive',
            cursorPosition: { x: 300, y: 200 },
            actions: [
              { type: 'process', target: 'file-scanning', delay: 500, duration: 2000 }
            ],
            data: { 
              fileCount: 15,
              fileTypes: ['documents', 'images', 'spreadsheets', 'presentations']
            }
          },
          {
            id: 'open-script-editor',
            title: 'Opening Google Apps Script',
            description: 'Accessing the script editor to run organization',
            duration: 2500,
            interface: 'script-editor',
            cursorPosition: { x: 100, y: 50 },
            actions: [
              { type: 'click', target: 'script-menu', delay: 200, duration: 100 },
              { type: 'click', target: 'script-editor', delay: 300, duration: 100 }
            ]
          },
          {
            id: 'run-organization-script',
            title: 'Running File Organization Script',
            description: 'Executing the script to organize files',
            duration: 4000,
            interface: 'script-editor',
            cursorPosition: { x: 500, y: 300 },
            actions: [
              { type: 'click', target: 'run-button', delay: 200, duration: 100 },
              { type: 'process', target: 'script-execution', delay: 500, duration: 3000 }
            ]
          },
          {
            id: 'create-folders',
            title: 'Creating Folder Structure',
            description: 'Automatically creating organized folder hierarchy',
            duration: 3000,
            interface: 'drive',
            cursorPosition: { x: 200, y: 250 },
            actions: [
              { type: 'process', target: 'folder-creation', delay: 500, duration: 2000 }
            ]
          },
          {
            id: 'move-files',
            title: 'Moving Files to Folders',
            description: 'Moving files to appropriate organized folders',
            duration: 3500,
            interface: 'drive',
            cursorPosition: { x: 350, y: 300 },
            actions: [
              { type: 'process', target: 'file-movement', delay: 500, duration: 2500 }
            ]
          },
          {
            id: 'open-sheets-log',
            title: 'Opening Activity Log Sheet',
            description: 'Accessing the log sheet to record activities',
            duration: 2000,
            interface: 'sheets',
            cursorPosition: { x: 200, y: 100 },
            actions: [
              { type: 'click', target: 'sheets-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'log-activities',
            title: 'Logging Organization Activities',
            description: 'Recording all file organization activities',
            duration: 2500,
            interface: 'sheets',
            cursorPosition: { x: 300, y: 250 },
            actions: [
              { type: 'click', target: 'new-row', delay: 200, duration: 100 },
              { type: 'type', target: 'activity-cell', data: 'Files organized: 15 files moved to 4 folders', delay: 300, duration: 1000 }
            ]
          }
        ];

      case 'expense-tracker':
        return [
          {
            id: 'open-gmail',
            title: 'Opening Gmail for Receipts',
            description: 'Navigating to Gmail to check for receipt emails',
            duration: 2000,
            interface: 'gmail',
            cursorPosition: { x: 150, y: 80 },
            actions: [
              { type: 'click', target: 'gmail-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'search-receipts',
            title: 'Searching for Receipt Emails',
            description: 'Searching Gmail for receipt emails with attachments',
            duration: 3000,
            interface: 'gmail',
            cursorPosition: { x: 400, y: 120 },
            actions: [
              { type: 'click', target: 'search-bar', delay: 200, duration: 100 },
              { type: 'type', target: 'search-bar', data: 'has:attachment subject:(receipt OR invoice OR expense)', delay: 200, duration: 1500 }
            ]
          },
          {
            id: 'find-receipt-email',
            title: 'Finding Receipt Email',
            description: 'Locating the receipt email in search results',
            duration: 2000,
            interface: 'gmail',
            cursorPosition: { x: 250, y: 200 },
            actions: [
              { type: 'click', target: 'receipt-email', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'download-attachment',
            title: 'Downloading Receipt Attachment',
            description: 'Downloading the receipt image for processing',
            duration: 2500,
            interface: 'gmail',
            cursorPosition: { x: 300, y: 250 },
            actions: [
              { type: 'click', target: 'attachment', delay: 200, duration: 100 },
              { type: 'process', target: 'download-progress', delay: 500, duration: 1500 }
            ]
          },
          {
            id: 'open-script-editor',
            title: 'Opening Google Apps Script',
            description: 'Accessing the script editor to process receipt',
            duration: 2500,
            interface: 'script-editor',
            cursorPosition: { x: 100, y: 50 },
            actions: [
              { type: 'click', target: 'script-menu', delay: 200, duration: 100 },
              { type: 'click', target: 'script-editor', delay: 300, duration: 100 }
            ]
          },
          {
            id: 'run-expense-script',
            title: 'Running Expense Processing Script',
            description: 'Executing the script to process the receipt',
            duration: 4000,
            interface: 'script-editor',
            cursorPosition: { x: 500, y: 300 },
            actions: [
              { type: 'click', target: 'run-button', delay: 200, duration: 100 },
              { type: 'process', target: 'script-execution', delay: 500, duration: 3000 }
            ],
            data: { 
              extractedData: {
                amount: '$450.00',
                vendor: 'Office Supplies Co',
                date: '2024-03-14',
                category: 'Office Supplies',
                receiptNumber: 'INV-2024-001'
              }
            }
          },
          {
            id: 'open-expense-sheet',
            title: 'Opening Expense Tracking Sheet',
            description: 'Accessing the expense tracking spreadsheet',
            duration: 2000,
            interface: 'sheets',
            cursorPosition: { x: 200, y: 100 },
            actions: [
              { type: 'click', target: 'sheets-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'add-expense-data',
            title: 'Adding Expense to Sheet',
            description: 'Adding the validated expense to tracking sheet',
            duration: 3000,
            interface: 'sheets',
            cursorPosition: { x: 300, y: 250 },
            actions: [
              { type: 'click', target: 'new-row', delay: 200, duration: 100 },
              { type: 'type', target: 'amount-cell', data: '$450.00', delay: 300, duration: 500 },
              { type: 'type', target: 'vendor-cell', data: 'Office Supplies Co', delay: 300, duration: 500 },
              { type: 'type', target: 'category-cell', data: 'Office Supplies', delay: 300, duration: 500 }
            ]
          },
          {
            id: 'check-approval-threshold',
            title: 'Checking Approval Threshold',
            description: 'Checking if expense requires approval',
            duration: 2000,
            interface: 'sheets',
            cursorPosition: { x: 400, y: 300 },
            actions: [
              { type: 'process', target: 'threshold-check', delay: 500, duration: 1500 }
            ]
          },
          {
            id: 'send-approval-email',
            title: 'Sending Approval Email',
            description: 'Sending approval request to manager',
            duration: 3000,
            interface: 'gmail',
            cursorPosition: { x: 350, y: 200 },
            actions: [
              { type: 'click', target: 'compose-button', delay: 200, duration: 100 },
              { type: 'type', target: 'to-field', data: 'manager@company.com', delay: 300, duration: 800 },
              { type: 'type', target: 'subject-field', data: 'Expense Approval Required - $450.00', delay: 300, duration: 1000 }
            ]
          }
        ];

      case 'task-automation':
        return [
          {
            id: 'open-project-sheet',
            title: 'Opening Project Task Sheet',
            description: 'Navigating to the project task tracking spreadsheet',
            duration: 2000,
            interface: 'sheets',
            cursorPosition: { x: 150, y: 80 },
            actions: [
              { type: 'click', target: 'sheets-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'scan-project-tasks',
            title: 'Scanning Project Tasks',
            description: 'Analyzing all tasks and their current status',
            duration: 3000,
            interface: 'sheets',
            cursorPosition: { x: 300, y: 200 },
            actions: [
              { type: 'process', target: 'task-scanning', delay: 500, duration: 2000 }
            ],
            data: { 
              totalTasks: 25,
              overdueTasks: 3,
              dueToday: 5
            }
          },
          {
            id: 'check-task-deadlines',
            title: 'Checking Task Deadlines',
            description: 'Identifying tasks approaching deadlines',
            duration: 2500,
            interface: 'sheets',
            cursorPosition: { x: 400, y: 250 },
            actions: [
              { type: 'process', target: 'deadline-check', delay: 500, duration: 1500 }
            ]
          },
          {
            id: 'open-script-editor',
            title: 'Opening Google Apps Script',
            description: 'Accessing the script editor to run task automation',
            duration: 2500,
            interface: 'script-editor',
            cursorPosition: { x: 100, y: 50 },
            actions: [
              { type: 'click', target: 'script-menu', delay: 200, duration: 100 },
              { type: 'click', target: 'script-editor', delay: 300, duration: 100 }
            ]
          },
          {
            id: 'run-task-script',
            title: 'Running Task Automation Script',
            description: 'Executing the script to process tasks',
            duration: 4000,
            interface: 'script-editor',
            cursorPosition: { x: 500, y: 300 },
            actions: [
              { type: 'click', target: 'run-button', delay: 200, duration: 100 },
              { type: 'process', target: 'script-execution', delay: 500, duration: 3000 }
            ]
          },
          {
            id: 'update-task-status',
            title: 'Updating Task Status',
            description: 'Automatically updating status of overdue tasks',
            duration: 2500,
            interface: 'sheets',
            cursorPosition: { x: 350, y: 300 },
            actions: [
              { type: 'process', target: 'status-update', delay: 500, duration: 1500 }
            ]
          },
          {
            id: 'open-calendar',
            title: 'Opening Google Calendar',
            description: 'Accessing calendar to create task events',
            duration: 2000,
            interface: 'calendar',
            cursorPosition: { x: 200, y: 100 },
            actions: [
              { type: 'click', target: 'calendar-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'create-task-events',
            title: 'Creating Calendar Events',
            description: 'Creating calendar events for task deadlines',
            duration: 3000,
            interface: 'calendar',
            cursorPosition: { x: 300, y: 250 },
            actions: [
              { type: 'process', target: 'event-creation', delay: 500, duration: 2000 }
            ]
          },
          {
            id: 'send-reminder-email',
            title: 'Sending Reminder Email',
            description: 'Sending deadline reminder email',
            duration: 3000,
            interface: 'gmail',
            cursorPosition: { x: 350, y: 200 },
            actions: [
              { type: 'click', target: 'compose-button', delay: 200, duration: 100 },
              { type: 'type', target: 'to-field', data: 'john.doe@company.com', delay: 300, duration: 800 },
              { type: 'type', target: 'subject-field', data: 'Task Deadline Reminder - Project Proposal', delay: 300, duration: 1000 }
            ]
          },
          {
            id: 'open-docs',
            title: 'Opening Google Docs',
            description: 'Accessing Google Docs to generate status report',
            duration: 2000,
            interface: 'docs',
            cursorPosition: { x: 200, y: 100 },
            actions: [
              { type: 'click', target: 'docs-icon', delay: 200, duration: 100 }
            ]
          },
          {
            id: 'generate-status-report',
            title: 'Generating Status Report',
            description: 'Creating automated project status report',
            duration: 3500,
            interface: 'docs',
            cursorPosition: { x: 400, y: 250 },
            actions: [
              { type: 'process', target: 'report-generation', delay: 500, duration: 2500 }
            ]
          }
        ];

      default:
        return [];
    }
  };

  const steps = getTutorialSteps(scriptId);
  const currentStepData = steps[currentStep];

  // Play a single step
  const playStep = async (step: TutorialStep) => {
    // Update interface state
    setInterfaceState(prev => ({
      ...prev,
      currentApp: step.interface,
      data: step.data || {},
      highlights: [],
      loadingStates: [],
      completedActions: []
    }));

    // Execute each action in the step
    for (let i = 0; i < step.actions.length; i++) {
      const action = step.actions[i];
      
      // Move cursor to position
      setCursor(prev => ({
        ...prev,
        x: step.cursorPosition.x,
        y: step.cursorPosition.y,
        target: action.target,
        effect: action.effect
      }));

      // Execute action
      switch (action.type) {
        case 'click':
          setCursor(prev => ({ ...prev, isClicking: true }));
          await new Promise(resolve => setTimeout(resolve, 200));
          setCursor(prev => ({ ...prev, isClicking: false }));
          break;
        
        case 'type':
          setCursor(prev => ({ ...prev, isTyping: true }));
          await new Promise(resolve => setTimeout(resolve, action.duration));
          setCursor(prev => ({ ...prev, isTyping: false }));
          break;
        
        case 'process':
          setInterfaceState(prev => ({
            ...prev,
            loadingStates: [...prev.loadingStates, action.target]
          }));
          await new Promise(resolve => setTimeout(resolve, action.duration));
          setInterfaceState(prev => ({
            ...prev,
            loadingStates: prev.loadingStates.filter(s => s !== action.target),
            completedActions: [...prev.completedActions, action.target]
          }));
          break;
        
        default:
          await new Promise(resolve => setTimeout(resolve, action.duration));
      }

      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, action.delay));
    }
  };

  // Play entire tutorial
  const playTutorial = async () => {
    setIsPlaying(true);
    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      await playStep(steps[i]);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Pause between steps
    }
    setIsPlaying(false);
  };

  // Reset tutorial
  const resetTutorial = () => {
    setCurrentStep(0);
    setIsPlaying(false);
    setCursor({
      x: 100,
      y: 100,
      isClicking: false,
      isTyping: false,
      isDragging: false
    });
    setInterfaceState({
      currentApp: 'gmail',
      data: {},
      highlights: [],
      loadingStates: [],
      completedActions: []
    });
  };

  // Auto-play when component mounts
  useEffect(() => {
    if (steps.length > 0) {
      playTutorial();
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-11/12 h-5/6 max-w-6xl flex flex-col">
        {/* Header */}
        <div className="border-b p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{scriptTitle}</h2>
            <p className="text-gray-600">Enhanced Interactive Tutorial Demo</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button onClick={isPlaying ? () => setIsPlaying(false) : playTutorial}>
                {isPlaying ? <Pause className="size-4 mr-2" /> : <Play className="size-4 mr-2" />}
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button onClick={resetTutorial} variant="outline">
                <RotateCcw className="size-4 mr-2" />
                Reset
              </Button>
            </div>
            <Button onClick={onClose} variant="ghost">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-gray-600">
              {currentStepData?.title}
            </span>
          </div>
          <Progress value={(currentStep / (steps.length - 1)) * 100} className="w-full" />
        </div>

        {/* Demo Area */}
        <div className="flex-1 p-6 relative overflow-hidden">
          <div className="h-full relative bg-gray-50 rounded-lg border">
            {/* Interface Container with Smooth Transitions */}
            <div className="h-full relative overflow-hidden">
              {/* Render current interface based on interfaceState.currentApp with smooth transitions */}
              <div className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                interfaceState.currentApp === 'gmail' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
              }`}>
                <GmailInterface 
                  data={interfaceState.data}
                  highlights={interfaceState.highlights}
                  loadingStates={interfaceState.loadingStates}
                  completedActions={interfaceState.completedActions}
                />
              </div>
              
              <div className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                interfaceState.currentApp === 'sheets' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
              }`}>
                <SheetsInterface 
                  data={interfaceState.data}
                  highlights={interfaceState.highlights}
                  loadingStates={interfaceState.loadingStates}
                  completedActions={interfaceState.completedActions}
                />
              </div>
              
              <div className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                interfaceState.currentApp === 'calendar' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
              }`}>
                <CalendarInterface 
                  data={interfaceState.data}
                  highlights={interfaceState.highlights}
                  loadingStates={interfaceState.loadingStates}
                  completedActions={interfaceState.completedActions}
                />
              </div>
              
              <div className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                interfaceState.currentApp === 'script-editor' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
              }`}>
                <ScriptEditorInterface 
                  data={interfaceState.data}
                  highlights={interfaceState.highlights}
                  loadingStates={interfaceState.loadingStates}
                  completedActions={interfaceState.completedActions}
                />
              </div>
              
              <div className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                interfaceState.currentApp === 'drive' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
              }`}>
                <DriveInterface 
                  data={interfaceState.data}
                  highlights={interfaceState.highlights}
                  loadingStates={interfaceState.loadingStates}
                  completedActions={interfaceState.completedActions}
                />
              </div>
              
              <div className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                interfaceState.currentApp === 'docs' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
              }`}>
                <DocsInterface 
                  data={interfaceState.data}
                  highlights={interfaceState.highlights}
                  loadingStates={interfaceState.loadingStates}
                  completedActions={interfaceState.completedActions}
                />
              </div>
            </div>

            {/* Enhanced Animated Cursor with Realistic Movement */}
            <div 
              className={`fixed pointer-events-none z-50 transition-all duration-500 ease-out ${
                cursor.effect === 'pulse' ? 'animate-pulse' : 
                cursor.effect === 'shake' ? 'animate-shake' : ''
              }`}
              style={{ 
                left: cursor.x, 
                top: cursor.y,
                transform: `translate(-50%, -50%)`
              }}
            >
              <div className={`size-6 border-2 border-blue-500 rounded-full transition-all duration-200 ${
                cursor.isClicking ? 'scale-75 bg-blue-500 shadow-lg' : 
                cursor.isTyping ? 'scale-90 bg-blue-400 shadow-md' :
                cursor.isDragging ? 'scale-110 bg-blue-600 shadow-xl' : 'scale-100 shadow-sm'
              }`}>
                <div className="size-1 bg-blue-500 rounded-full absolute top-1 left-1"></div>
              </div>
              {cursor.target && (
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
                  {cursor.target}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step Info */}
        <div className="border-t p-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-2">{currentStepData?.title}</h3>
              <p className="text-gray-600">{currentStepData?.description}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Current Interface</div>
              <div className="font-semibold capitalize">{interfaceState.currentApp}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Interface Components
function GmailInterface({ data, highlights, loadingStates, completedActions }: any) {
  return (
    <div className="border rounded-lg bg-white shadow-lg overflow-hidden h-full">
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
            <span className="text-gray-600">Gmail - Inbox</span>
          </div>
        </div>
      </div>
      
      {/* Gmail Interface */}
      <div className="h-full bg-white">
        {/* Gmail Header */}
        <div className="bg-red-500 text-white px-6 py-3 flex items-center gap-4">
          <Mail className="size-6" />
          <span className="font-semibold text-lg">Gmail</span>
          <div className="flex-1 max-w-md">
            <div className={`bg-white/20 rounded-lg px-4 py-2 flex items-center gap-2 transition-all duration-300 ${
              highlights.includes('search-bar') ? 'ring-2 ring-white ring-opacity-50' : ''
            }`}>
              <Search className="size-4" />
              <input 
                type="text" 
                placeholder="Search mail" 
                className="bg-transparent text-white placeholder-white/70 flex-1 outline-none"
                readOnly
              />
            </div>
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
                <span className="ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded">3</span>
              </div>
            </div>
          </div>
          
          {/* Email List */}
          <div className="flex-1">
            <div className="divide-y">
              <div className={`p-4 hover:bg-gray-50 transition-all duration-300 ${
                highlights.includes('email-item') ? 'bg-blue-50 border-l-4 border-blue-500' : ''
              }`}>
                <div className="flex items-center gap-4">
                  <input type="checkbox" className="size-4" />
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                      J
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">John Smith</div>
                      <div className="text-sm text-gray-600">Lead Inquiry - Tech Corp</div>
                      <div className="text-xs text-gray-500">2 minutes ago</div>
                    </div>
                  </div>
                  {loadingStates.includes('script-execution') && (
                    <Badge className="bg-green-500 text-white animate-pulse">
                      <Brain className="size-3 mr-1" />
                      Processing...
                    </Badge>
                  )}
                </div>
                
                {/* Extracted Data Display */}
                {data.extractedData && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg animate-in slide-in-from-top-2">
                    <div className="text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
                      <Brain className="size-4" />
                      AI Data Extraction Complete
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="font-medium">Name:</span> {data.extractedData.name}</div>
                      <div><span className="font-medium">Email:</span> {data.extractedData.email}</div>
                      <div><span className="font-medium">Phone:</span> {data.extractedData.phone}</div>
                      <div><span className="font-medium">Company:</span> {data.extractedData.company}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SheetsInterface({ data, highlights, loadingStates, completedActions }: any) {
  return (
    <div className="border rounded-lg bg-white shadow-lg overflow-hidden h-full">
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
            <span className="text-gray-600">Google Sheets - Leads Database</span>
          </div>
        </div>
      </div>
      
      {/* Sheets Interface */}
      <div className="h-full bg-white">
        {/* Sheets Header */}
        <div className="bg-green-600 text-white px-6 py-3 flex items-center gap-4">
          <FileSpreadsheet className="size-6" />
          <span className="font-semibold text-lg">Google Sheets</span>
          <span className="text-sm">Leads_Database</span>
        </div>
        
        {/* Sheets Grid */}
        <div className="p-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left border-b">Name</th>
                  <th className="px-4 py-2 text-left border-b">Email</th>
                  <th className="px-4 py-2 text-left border-b">Phone</th>
                  <th className="px-4 py-2 text-left border-b">Company</th>
                  <th className="px-4 py-2 text-left border-b">Date Added</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2 border-b">John Smith</td>
                  <td className="px-4 py-2 border-b">john.smith@company.com</td>
                  <td className="px-4 py-2 border-b">+1-555-0123</td>
                  <td className="px-4 py-2 border-b">Tech Corp</td>
                  <td className="px-4 py-2 border-b">2024-03-15</td>
                </tr>
                {data.extractedData && (
                  <tr className={`hover:bg-gray-50 transition-all duration-300 ${
                    highlights.includes('new-row') ? 'bg-green-50 border-l-4 border-green-500' : ''
                  }`}>
                    <td className="px-4 py-2 border-b">{data.extractedData.name}</td>
                    <td className="px-4 py-2 border-b">{data.extractedData.email}</td>
                    <td className="px-4 py-2 border-b">{data.extractedData.phone}</td>
                    <td className="px-4 py-2 border-b">{data.extractedData.company}</td>
                    <td className="px-4 py-2 border-b">{new Date().toLocaleDateString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarInterface({ data, highlights, loadingStates, completedActions }: any) {
  return (
    <div className="border rounded-lg bg-white shadow-lg overflow-hidden h-full">
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
            <span className="text-gray-600">Google Calendar - March 2024</span>
          </div>
        </div>
      </div>
      
      {/* Calendar Interface */}
      <div className="h-full bg-white">
        {/* Calendar Header */}
        <div className="bg-blue-600 text-white px-6 py-3 flex items-center gap-4">
          <Calendar className="size-6" />
          <span className="font-semibold text-lg">Google Calendar</span>
          <span className="text-sm">March 2024</span>
        </div>
        
        {/* Calendar Grid */}
        <div className="p-4">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, i) => (
              <div 
                key={i + 1}
                className={`p-2 border rounded text-center cursor-pointer hover:bg-gray-50 transition-all duration-300 ${
                  highlights.includes('target-date') && i === 14 ? 'bg-blue-100 border-blue-500' : ''
                }`}
              >
                {i + 1}
                {i === 14 && data.eventTitle && (
                  <div className="text-xs bg-blue-500 text-white rounded px-1 mt-1">
                    {data.eventTitle}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScriptEditorInterface({ data, highlights, loadingStates, completedActions }: any) {
  return (
    <div className="border rounded-lg bg-white shadow-lg overflow-hidden h-full">
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
            <span className="text-gray-600">Google Apps Script Editor</span>
          </div>
        </div>
      </div>
      
      {/* Script Editor Interface */}
      <div className="h-full bg-gray-900 text-white">
        {/* Editor Header */}
        <div className="bg-gray-800 px-4 py-2 flex items-center gap-4">
          <Code className="size-5" />
          <span className="font-semibold">Code.gs</span>
          <div className="flex-1"></div>
          <Button 
            size="sm" 
            className={`${
              highlights.includes('run-button') ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Run
          </Button>
        </div>
        
        {/* Code Editor */}
        <div className="p-4 font-mono text-sm">
          <div className="text-gray-400">function processEmailAutomation() {'{'}</div>
          <div className="text-gray-400 ml-4">// Search for lead emails</div>
          <div className="text-gray-400 ml-4">const threads = GmailApp.search('subject:(lead OR inquiry)');</div>
          <div className="text-gray-400 ml-4"></div>
          <div className="text-gray-400 ml-4">// Extract data from emails</div>
          <div className="text-gray-400 ml-4">threads.forEach(thread =&gt; {'{'}</div>
          <div className="text-gray-400 ml-8">const messages = thread.getMessages();</div>
          <div className="text-gray-400 ml-8">// Process each message...</div>
          <div className="text-gray-400 ml-4">{'}'}</div>
          <div className="text-gray-400">{'}'}</div>
          
          {loadingStates.includes('script-execution') && (
            <div className="mt-4 p-3 bg-blue-900 border border-blue-700 rounded">
              <div className="flex items-center gap-2 text-blue-300">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-300"></div>
                Executing script...
              </div>
            </div>
          )}
          
          {completedActions.includes('script-execution') && (
            <div className="mt-4 p-3 bg-green-900 border border-green-700 rounded">
              <div className="flex items-center gap-2 text-green-300">
                <CheckCircle className="size-4" />
                Script executed successfully!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}