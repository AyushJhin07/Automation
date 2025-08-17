import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Code2, 
  Download, 
  Play, 
  Copy,
  Mail, 
  Calendar,
  FileSpreadsheet, 
  FolderCog,
  BarChart3,
  CheckCircle2,
  Zap,
  Clock,
  DollarSign,
  Settings,
  Brain,
  Chrome
} from "lucide-react";
import { ScriptCustomizer } from "@/components/demos/ScriptCustomizer";
import { InteractiveScriptDemo } from "@/components/demos/InteractiveScriptDemo";
import { TutorialDemo } from "@/components/demos/TutorialDemo";

const preBuiltApps = [
  {
    id: "email-automation",
    title: "Smart Email Processor",
    description: "Automatically process emails, extract data, and update Google Sheets. Perfect for lead management and customer inquiries.",
    icon: Mail,
    category: "Email & Communication",
    complexity: "Beginner",
    setupTime: "15 minutes",
    monthlyValue: "$500+",
    features: [
      "Auto-extract email data to Sheets",
      "Smart email labeling and sorting", 
      "Automated follow-up sequences",
      "Attachment processing and filing"
    ],
         codePreview: `function processIncomingEmails() {
  const threads = GmailApp.search('is:unread label:EMAILLABEL_PLACEHOLDER');
  const sheet = SpreadsheetApp.openById('SHEETID_PLACEHOLDER').getActiveSheet();
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    const email = messages[0];
    
    // Extract email data
    const data = extractEmailData(email);
    
    // Add to sheet
    sheet.appendRow([
      new Date(),
      email.getSubject(),
      email.getFrom(),
      data.phoneNumber,
      data.company
    ]);
    
    // Mark as processed
    thread.addLabel(GmailApp.getUserLabelByName('Processed'));
  });
}`,
    useCases: [
      "Lead capture from contact forms",
      "Customer support ticket processing", 
      "Invoice and receipt management",
      "Event registration handling"
    ],
    customizationOptions: [
      {
        id: "emailLabel",
        label: "Gmail Label to Monitor",
        description: "Specific Gmail label to watch for incoming emails",
        type: "text" as const,
        defaultValue: "leads",
        aiEnhanced: true
      },
      {
        id: "sheetId",
        label: "Lead Database Sheet ID", 
        description: "Google Sheet where extracted lead data will be stored",
        type: "text" as const,
        defaultValue: "YOUR_LEADS_SHEET_ID"
      },
      {
        id: "subjectKeywords",
        label: "Email Subject Keywords",
        description: "Keywords in email subjects to trigger processing",
        type: "textarea" as const,
        defaultValue: "inquiry, lead, contact, quote request",
        aiEnhanced: true
      },
      {
        id: "extractionFields",
        label: "Data Fields to Extract",
        description: "Specific data points to extract from emails",
        type: "textarea" as const,
        defaultValue: "name, email, phone, company, message",
        aiEnhanced: true
      },
      {
        id: "autoReplyTemplate",
        label: "Auto-Reply Template",
        description: "Template for automatic response emails",
        type: "textarea" as const,
        defaultValue: "Thank you for your inquiry. We'll get back to you within 24 hours.",
        aiEnhanced: true
      },
      {
        id: "notificationEmails",
        label: "Team Notification Emails",
        description: "Email addresses to notify when new leads are captured",
        type: "textarea" as const,
        defaultValue: "sales@company.com, manager@company.com"
      }
    ],
    demoSteps: [
      {
        id: "email-fetch",
        title: "Fetch New Emails",
        description: "Scanning Gmail for unread emails with specified criteria",
        icon: Mail,
        duration: 1500
      },
      {
        id: "data-extract", 
        title: "Extract Data",
        description: "Using AI to parse and extract structured data from emails",
        icon: Brain,
        duration: 2000
      },
      {
        id: "sheet-update",
        title: "Update Spreadsheet", 
        description: "Adding extracted data to Google Sheets",
        icon: FileSpreadsheet,
        duration: 1000
      },
      {
        id: "notification",
        title: "Send Notifications",
        description: "Notifying team members about new data", 
        icon: Mail,
        duration: 800
      }
    ]
  },
  {
    id: "report-generator",
    title: "Automated Report Generator",
    description: "Generate beautiful PDF reports from Google Sheets data with charts, send via email on schedule.",
    icon: BarChart3,
    category: "Reporting & Analytics",
    complexity: "Intermediate", 
    setupTime: "30 minutes",
    monthlyValue: "$800+",
    features: [
      "Auto-generate PDF reports from Sheets",
      "Custom chart creation and styling",
      "Scheduled email distribution", 
      "Multiple report templates"
    ],
    codePreview: `function generateWeeklyReport() {
  const sheet = SpreadsheetApp.openById('DATA_SHEET_ID');
  const template = DriveApp.getFileById('TEMPLATE_DOC_ID');
  
  // Create report from template
  const reportDoc = template.makeCopy('Weekly Report - ' + new Date());
  const doc = DocumentApp.openById(reportDoc.getId());
  
  // Insert data and charts
  replaceTemplateVariables(doc, getReportData(sheet));
  insertCharts(doc, createCharts(sheet));
  
  // Convert to PDF and email
  const pdf = DriveApp.createFile(doc.getBlob().setName('Weekly Report.pdf'));
  
  GmailApp.sendEmail(
    'team@company.com',
    'Weekly Performance Report',
    'Please find attached this week\\'s performance report.',
    { attachments: [pdf.getBlob()] }
  );
}`,
    useCases: [
      "Weekly sales performance reports",
      "Monthly financial summaries", 
      "Project status updates",
      "KPI dashboard distributions"
    ],
    customizationOptions: [
      {
        id: "dataSheetId",
        label: "Sales Data Sheet ID",
        description: "Google Sheet containing sales performance data",
        type: "text" as const,
        defaultValue: "SALES_DATA_SHEET_ID"
      },
      {
        id: "templateDocId", 
        label: "Report Template Document ID",
        description: "Google Doc template with placeholders for data",
        type: "text" as const,
        defaultValue: "REPORT_TEMPLATE_DOC_ID"
      },
      {
        id: "reportFrequency",
        label: "Report Generation Schedule",
        description: "How often to automatically generate reports",
        type: "select" as const,
        defaultValue: "weekly",
        options: ["daily", "weekly", "bi-weekly", "monthly", "quarterly"]
      },
      {
        id: "kpiMetrics",
        label: "KPI Metrics to Track",
        description: "Key performance indicators to include in reports",
        type: "textarea" as const,
        defaultValue: "revenue, conversion rate, customer acquisition cost, sales velocity",
        aiEnhanced: true
      },
      {
        id: "chartTypes",
        label: "Visualization Charts",
        description: "Types of charts and graphs to include",
        type: "textarea" as const,
        defaultValue: "revenue trend line chart, conversion funnel, sales by region pie chart",
        aiEnhanced: true
      },
      {
        id: "recipients",
        label: "Stakeholder Email List",
        description: "Email addresses for report distribution",
        type: "textarea" as const,
        defaultValue: "sales@company.com, management@company.com, stakeholders@company.com"
      },
      {
        id: "reportTitle",
        label: "Report Title Template",
        description: "Template for report titles with date variables",
        type: "text" as const,
        defaultValue: "Sales Performance Report - {period}",
        aiEnhanced: true
      }
    ],
    demoSteps: [
      {
        id: "data-collect",
        title: "Collect Data",
        description: "Gathering data from multiple Google Sheets",
        icon: FileSpreadsheet,
        duration: 1200
      },
      {
        id: "analyze",
        title: "Analyze & Calculate", 
        description: "Processing data and generating insights",
        icon: BarChart3,
        duration: 1800
      },
      {
        id: "create-doc",
        title: "Create Document",
        description: "Generating PDF report from template",
        icon: Download,
        duration: 1500
      },
      {
        id: "distribute",
        title: "Distribute Report",
        description: "Emailing report to stakeholders",
        icon: Mail,
        duration: 1000
      }
    ]
  },
  {
    id: "calendar-booking",
    title: "Smart Calendar Booking System", 
    description: "Complete booking system with availability checking, confirmations, and automated reminders.",
    icon: Calendar,
    category: "Scheduling & Events",
    complexity: "Intermediate",
    setupTime: "25 minutes", 
    monthlyValue: "$600+",
    features: [
      "Real-time availability checking",
      "Automatic booking confirmations",
      "Smart reminder sequences",
      "Integration with Google Meet"
    ],
    codePreview: `function processBookingRequest(formResponse) {
  const responses = formResponse.getItemResponses();
  const email = responses[0].getResponse();
  const preferredTime = new Date(responses[1].getResponse());
  
  // Check availability
  const calendar = CalendarApp.getDefaultCalendar();
  const conflicts = calendar.getEvents(preferredTime, 
    new Date(preferredTime.getTime() + 60*60*1000));
  
  if (conflicts.length === 0) {
    // Create meeting
    const event = calendar.createEvent(
      'Consultation Call',
      preferredTime,
      new Date(preferredTime.getTime() + 60*60*1000),
      { guests: email }
    );
    
    // Send confirmation
    sendConfirmationEmail(email, event);
    scheduleReminders(email, preferredTime);
  } else {
    // Suggest alternative times
    suggestAlternativeTimes(email, preferredTime);
  }
}`,
    useCases: [
      "Client consultation bookings",
      "Service appointment scheduling",
      "Team meeting coordination", 
      "Event registration management"
    ],
    customizationOptions: [
      {
        id: "calendarId",
        label: "Booking Calendar ID",
        description: "Google Calendar where appointments will be scheduled",
        type: "text" as const,
        defaultValue: "primary"
      },
      {
        id: "meetingDuration",
        label: "Consultation Duration",
        description: "Length of each consultation session",
        type: "select" as const,
        defaultValue: "60",
        options: ["30", "45", "60", "90", "120"]
      },
      {
        id: "businessHours",
        label: "Available Business Hours",
        description: "Time slots available for bookings",
        type: "textarea" as const,
        defaultValue: "Monday-Friday: 9AM-5PM, Saturday: 10AM-2PM",
        aiEnhanced: true
      },
      {
        id: "bookingWindow",
        label: "Advance Booking Period",
        description: "How far in advance clients can book",
        type: "select" as const,
        defaultValue: "7",
        options: ["1", "3", "7", "14", "30"],
        aiEnhanced: true
      },
      {
        id: "reminderSchedule",
        label: "Appointment Reminders",
        description: "When to send reminder notifications",
        type: "textarea" as const,
        defaultValue: "24 hours before, 1 hour before, 15 minutes before",
        aiEnhanced: true
      },
      {
        id: "meetingTitle",
        label: "Appointment Title Format",
        description: "Template for calendar event titles",
        type: "text" as const,
        defaultValue: "Consultation: {client_name} - {service_type}",
        aiEnhanced: true
      },
      {
        id: "confirmationEmail",
        label: "Confirmation Email Template",
        description: "Template for booking confirmation emails",
        type: "textarea" as const,
        defaultValue: "Your consultation has been confirmed for {date} at {time}. We'll send you a Google Meet link 15 minutes before.",
        aiEnhanced: true
      },
      {
        id: "googleMeet",
        label: "Google Meet Integration",
        description: "Automatically add video call links to appointments",
        type: "select" as const,
        defaultValue: "auto",
        options: ["auto", "manual", "disabled"]
      }
    ],
    demoSteps: [
      {
        id: "check-availability",
        title: "Check Availability",
        description: "Scanning calendar for available slots",
        icon: Calendar,
        duration: 1200
      },
      {
        id: "create-booking",
        title: "Create Booking",
        description: "Creating calendar event and sending confirmation",
        icon: CheckCircle2,
        duration: 1500
      },
      {
        id: "send-reminders",
        title: "Schedule Reminders",
        description: "Setting up automated reminder sequence",
        icon: Clock,
        duration: 1000
      },
      {
        id: "meet-integration",
        title: "Google Meet Setup",
        description: "Adding video call link to event",
        icon: Play,
        duration: 800
      }
    ]
  },
  {
    id: "file-organizer",
    title: "Intelligent File Organizer",
    description: "Automatically organize Google Drive files by type, date, or content with smart folder structures.",
    icon: FolderCog,
    category: "File Management",
    complexity: "Beginner",
    setupTime: "20 minutes",
    monthlyValue: "$400+", 
    features: [
      "Auto-sort files by type and date",
      "Smart folder creation",
      "Duplicate file detection",
      "Permission management automation"
    ],
    codePreview: `function organizeFiles() {
  const folder = DriveApp.getFolderById('INBOX_FOLDER_ID');
  const files = folder.getFiles();
  
  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    const fileType = getFileType(file);
    const createDate = file.getDateCreated();
    
    // Determine target folder
    const targetFolder = getOrCreateFolder(fileType, createDate);
    
    // Move file and set permissions
    file.moveTo(targetFolder);
    setAppropriatePermissions(file, fileType);
    
    // Log activity
    logFileActivity(fileName, targetFolder.getName());
  }
}

function getOrCreateFolder(type, date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const folderPath = \`\${type}/\${year}/\${month.toString().padStart(2, '0')}\`;
  
  return createFolderPath(folderPath);
}`,
    useCases: [
      "Document management systems",
      "Project file organization",
      "Client deliverable sorting",
      "Archive and backup automation"
    ],
    customizationOptions: [
      {
        id: "sourceFolderId",
        label: "Inbox Folder ID",
        description: "Google Drive folder containing files to organize",
        type: "text" as const,
        defaultValue: "INBOX_FOLDER_ID"
      },
      {
        id: "organizationType",
        label: "File Organization Strategy",
        description: "How files should be categorized and sorted",
        type: "select" as const,
        defaultValue: "type-date",
        options: ["type-date", "date-type", "project-based", "client-based", "department-based"],
        aiEnhanced: true
      },
      {
        id: "fileCategories",
        label: "File Category Definitions",
        description: "Custom categories and their file extensions",
        type: "textarea" as const,
        defaultValue: "documents: .doc,.docx,.pdf,.txt\nimages: .jpg,.png,.gif,.svg\nspreadsheets: .xls,.xlsx,.csv\npresentations: .ppt,.pptx\nvideos: .mp4,.mov,.avi",
        aiEnhanced: true
      },
      {
        id: "folderStructure",
        label: "Folder Structure Template",
        description: "Template for creating organized folder hierarchy",
        type: "textarea" as const,
        defaultValue: "{category}/{year}/{month}/{project_name}",
        aiEnhanced: true
      },
      {
        id: "permissionLevel",
        label: "File Access Permissions",
        description: "Default sharing permissions for organized files",
        type: "select" as const,
        defaultValue: "view",
        options: ["view", "comment", "edit", "owner"]
      },
      {
        id: "archiveAge",
        label: "Auto-Archive Threshold",
        description: "Move files older than this many days to archive",
        type: "text" as const,
        defaultValue: "365"
      },
      {
        id: "duplicateHandling",
        label: "Duplicate File Handling",
        description: "How to handle duplicate files during organization",
        type: "select" as const,
        defaultValue: "rename",
        options: ["rename", "skip", "overwrite", "move-to-duplicates"]
      },
      {
        id: "notificationEmails",
        label: "Organization Notifications",
        description: "Email addresses to notify when files are organized",
        type: "textarea" as const,
        defaultValue: "admin@company.com, it@company.com"
      }
    ],
    demoSteps: [
      {
        id: "scan-files",
        title: "Scan Files",
        description: "Analyzing files in source folder",
        icon: FolderCog,
        duration: 1500
      },
      {
        id: "categorize",
        title: "Categorize Files",
        description: "Sorting files by type and content",
        icon: Brain,
        duration: 2000
      },
      {
        id: "create-folders",
        title: "Create Folders",
        description: "Setting up organized folder structure",
        icon: FolderCog,
        duration: 1200
      },
      {
        id: "move-files",
        title: "Move Files",
        description: "Moving files to appropriate folders",
        icon: Download,
        duration: 1000
      }
    ]
  },
  {
    id: "expense-tracker",
    title: "Expense Tracker & Approval",
    description: "Complete expense management with receipt parsing, approval workflows, and reimbursement tracking.",
    icon: DollarSign,
    category: "Finance & Operations",
    complexity: "Advanced",
    setupTime: "45 minutes",
    monthlyValue: "$1000+",
    features: [
      "Receipt email parsing and data extraction", 
      "Multi-level approval workflows",
      "Automatic expense categorization",
      "Reimbursement tracking and reporting"
    ],
    codePreview: `function processExpenseReceipt() {
  const emails = GmailApp.search('has:attachment subject:receipt');
  const sheet = SpreadsheetApp.openById('EXPENSE_SHEET_ID');
  
  emails.forEach(thread => {
    const message = thread.getMessages()[0];
    const attachments = message.getAttachments();
    
    attachments.forEach(attachment => {
      if (attachment.getContentType().includes('image')) {
        // Extract text from receipt using OCR
        const extractedData = extractReceiptData(attachment);
        
        // Add to expense sheet
        const row = [
          new Date(),
          message.getFrom(),
          extractedData.amount,
          extractedData.vendor,
          extractedData.category,
          'Pending Approval'
        ];
        
        sheet.appendRow(row);
        
        // Trigger approval workflow
        sendForApproval(extractedData, message.getFrom());
      }
    });
  });
}`,
    useCases: [
      "Employee expense management",
      "Vendor invoice processing", 
      "Travel expense tracking",
      "Project cost monitoring"
    ],
    customizationOptions: [
      {
        id: "expenseSheetId",
        label: "Expense Tracking Sheet ID",
        description: "Google Sheet for storing and tracking expense data",
        type: "text" as const,
        defaultValue: "EXPENSE_TRACKING_SHEET_ID"
      },
      {
        id: "approvalWorkflow",
        label: "Expense Approval Process",
        description: "Multi-level approval workflow for expense processing",
        type: "select" as const,
        defaultValue: "manager-finance",
        options: ["manager-only", "manager-finance", "multi-level", "auto-approve", "department-head"],
        aiEnhanced: true
      },
      {
        id: "expenseCategories",
        label: "Expense Category Definitions",
        description: "Custom categories for expense classification",
        type: "textarea" as const,
        defaultValue: "travel, meals, office supplies, software, training, marketing, utilities",
        aiEnhanced: true
      },
      {
        id: "approvalThresholds",
        label: "Approval Amount Thresholds",
        description: "Dollar amounts that trigger different approval levels",
        type: "textarea" as const,
        defaultValue: "$0-100: auto-approve\n$100-500: manager approval\n$500-1000: finance approval\n$1000+: executive approval"
      },
      {
        id: "receiptKeywords",
        label: "Receipt Email Identifiers",
        description: "Keywords to automatically identify receipt emails",
        type: "textarea" as const,
        defaultValue: "receipt, invoice, expense, bill, payment confirmation",
        aiEnhanced: true
      },
      {
        id: "reimbursementProcess",
        label: "Reimbursement Workflow",
        description: "Automated reimbursement processing steps",
        type: "textarea" as const,
        defaultValue: "approval → payment processing → confirmation email",
        aiEnhanced: true
      },
      {
        id: "expensePolicies",
        label: "Expense Policy Rules",
        description: "Company expense policy enforcement rules",
        type: "textarea" as const,
        defaultValue: "meals under $25 auto-approve, travel requires pre-approval, software needs IT review",
        aiEnhanced: true
      },
      {
        id: "notificationEmails",
        label: "Finance Team Notifications",
        description: "Email addresses for expense approval notifications",
        type: "textarea" as const,
        defaultValue: "finance@company.com, manager@company.com, hr@company.com"
      }
    ],
    demoSteps: [
      {
        id: "receive-receipt",
        title: "Receive Receipt",
        description: "Email with receipt attachment received",
        icon: Mail,
        duration: 1000
      },
      {
        id: "extract-data",
        title: "Extract Data",
        description: "Using AI to extract expense details",
        icon: Brain,
        duration: 2000
      },
      {
        id: "categorize",
        title: "Categorize Expense",
        description: "Automatically categorizing expense type",
        icon: DollarSign,
        duration: 1200
      },
      {
        id: "approval-workflow",
        title: "Approval Workflow",
        description: "Sending for manager approval",
        icon: CheckCircle2,
        duration: 1500
      }
    ]
  },
  {
    id: "task-automation",
    title: "Project Task Automator",
    description: "Automate project tasks, status updates, and team notifications based on Google Sheets data.",
    icon: CheckCircle2,
    category: "Project Management",
    complexity: "Intermediate",
    setupTime: "35 minutes", 
    monthlyValue: "$700+",
    features: [
      "Automatic task status updates",
      "Smart deadline reminders",
      "Progress report generation",
      "Team notification automation"
    ],
    codePreview: `function updateProjectTasks() {
  const sheet = SpreadsheetApp.openById('PROJECT_SHEET_ID');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const [task, assignee, deadline, status, priority] = data[i];
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
    
    // Send reminders based on deadline proximity
    if (daysUntilDeadline <= 3 && status !== 'Complete') {
      sendDeadlineReminder(assignee, task, daysUntilDeadline);
    }
    
    // Auto-update overdue tasks
    if (daysUntilDeadline < 0 && status !== 'Complete') {
      sheet.getRange(i + 1, 4).setValue('Overdue');
      notifyProjectManager(task, assignee);
    }
  }
  
  // Generate weekly progress report
  generateProgressReport(sheet);
}`,
    useCases: [
      "Project milestone tracking",
      "Team task coordination",
      "Client project updates", 
      "Resource allocation management"
    ],
    customizationOptions: [
      {
        id: "projectSheetId",
        label: "Project Task Sheet ID",
        description: "Google Sheet containing project tasks and milestones",
        type: "text" as const,
        defaultValue: "PROJECT_TASKS_SHEET_ID"
      },
      {
        id: "reminderSchedule",
        label: "Deadline Reminder Timing",
        description: "Days before deadline to send reminder notifications",
        type: "select" as const,
        defaultValue: "3",
        options: ["1", "2", "3", "5", "7"],
        aiEnhanced: true
      },
      {
        id: "notificationTypes",
        label: "Project Notification Types",
        description: "Types of automated notifications to send",
        type: "textarea" as const,
        defaultValue: "deadline-reminder, overdue-alert, completion-notice, milestone-reached",
        aiEnhanced: true
      },
      {
        id: "priorityLevels",
        label: "Task Priority Categories",
        description: "Priority levels for task classification",
        type: "textarea" as const,
        defaultValue: "low, medium, high, urgent, critical"
      },
      {
        id: "reportFrequency",
        label: "Progress Report Schedule",
        description: "How often to generate project progress reports",
        type: "select" as const,
        defaultValue: "weekly",
        options: ["daily", "weekly", "bi-weekly", "monthly"]
      },
      {
        id: "teamMembers",
        label: "Project Team Members",
        description: "Email addresses of project team members",
        type: "textarea" as const,
        defaultValue: "project-manager@company.com, team-lead@company.com, developer@company.com",
        aiEnhanced: true
      },
      {
        id: "milestoneTracking",
        label: "Milestone Tracking",
        description: "Key project milestones to track and report on",
        type: "textarea" as const,
        defaultValue: "project-kickoff, design-complete, development-start, testing-phase, launch-ready",
        aiEnhanced: true
      },
      {
        id: "escalationRules",
        label: "Escalation Rules",
        description: "Rules for escalating overdue or blocked tasks",
        type: "textarea" as const,
        defaultValue: "overdue 3 days → notify manager, overdue 7 days → escalate to director",
        aiEnhanced: true
      }
    ],
    demoSteps: [
      {
        id: "scan-tasks",
        title: "Scan Tasks",
        description: "Analyzing project tasks and deadlines",
        icon: CheckCircle2,
        duration: 1200
      },
      {
        id: "check-deadlines",
        title: "Check Deadlines",
        description: "Identifying tasks approaching deadlines",
        icon: Clock,
        duration: 1000
      },
      {
        id: "send-reminders",
        title: "Send Reminders",
        description: "Sending automated deadline reminders",
        icon: Mail,
        duration: 1500
      },
      {
        id: "update-status",
        title: "Update Status",
        description: "Updating task status and generating reports",
        icon: BarChart3,
        duration: 1200
      }
    ]
  }
];

export default function PreBuiltApps() {
  const [activeApp, setActiveApp] = useState("email-automation");
  const [showCode, setShowCode] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showTutorialDemo, setShowTutorialDemo] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const currentApp = preBuiltApps.find(app => app.id === activeApp);
  const categories = Array.from(new Set(preBuiltApps.map(app => app.category)));

  const handleDownload = (appId: string) => {
    // This would integrate with your delivery system
    alert(`Downloading ${currentApp?.title}. This would provide the complete Google Apps Script code and setup instructions.`);
  };

  const handleCustomize = (appId: string) => {
    setActiveApp(appId);
    setActiveTab("customize");
    setShowCustomizer(true);
  };

  const handleTryDemo = (appId: string) => {
    setActiveApp(appId);
    setActiveTab("demo");
    setShowDemo(true);
  };

  const handleCopyCode = () => {
    if (currentApp?.codePreview) {
      navigator.clipboard.writeText(currentApp.codePreview)
        .then(() => {
          // You could add a toast notification here
          alert('Code copied to clipboard!');
        })
        .catch((err) => {
          console.error('Failed to copy code: ', err);
          alert('Failed to copy code to clipboard');
        });
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case "Beginner": return "bg-green-500";
      case "Intermediate": return "bg-yellow-500"; 
      case "Advanced": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <>
      <Helmet>
        <title>Pre-Built Google Apps Script Solutions | Apps Script Studio</title>
        <meta 
          name="description" 
          content="Ready-to-use Google Apps Script prototypes for email automation, reporting, scheduling, and more. No monthly fees, instant setup." 
        />
        <link rel="canonical" href="/pre-built-apps" />
      </Helmet>

      <main className="min-h-screen bg-hero">
        {/* Hero Section */}
        <section className="container mx-auto pt-24 pb-12">
          <div className="text-center mb-12">
            <Badge className="mb-4 glass-card">
              <Code2 className="size-4 mr-2" />
              Ready-to-Use Scripts
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground">
              Pre-Built Google Apps Script
              <br />
              <span className="bg-gradient-to-r from-primary to-muted-foreground bg-clip-text text-transparent">
                Solutions
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Skip the development time. Get working Google Apps Script prototypes that you can 
              implement immediately. No monthly fees, no vendor lock-in, just powerful automation.
            </p>
            <div className="flex gap-4 justify-center">
              <Button size="lg" onClick={() => setShowCode(true)} className="hover-glow">
                <Play className="size-5 mr-2" />
                Try Live Demo
              </Button>
              <Button variant="outline" size="lg" className="glass-card">
                <Download className="size-5 mr-2" />
                Download Samples
              </Button>
            </div>
          </div>
        </section>

        {/* Category Filter */}
        <section className="container mx-auto py-6">
          <div className="flex flex-wrap gap-2 justify-center">
            <Button 
              variant="outline" 
              size="sm"
              className="glass-card"
            >
              All Categories
            </Button>
            {categories.map((category) => (
              <Button 
                key={category}
                variant="ghost" 
                size="sm"
                className="text-sm"
              >
                {category}
              </Button>
            ))}
          </div>
        </section>

        {/* Apps Grid */}
        <section className="container mx-auto py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {preBuiltApps.map((app) => (
              <Card 
                key={app.id}
                className={`
                  relative glass-card hover-glow cursor-pointer transition-all duration-300 
                  transform hover:scale-105 hover:shadow-2xl
                  bg-gradient-to-br from-white via-gray-50 to-gray-100
                  border-2 rounded-2xl overflow-hidden
                  ${activeApp === app.id ? 'ring-2 ring-primary shadow-lg scale-105' : 'hover:shadow-xl'}
                  before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:pointer-events-none
                `}
                onClick={() => setActiveApp(app.id)}
              >
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="size-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shadow-inner">
                      <app.icon className="size-6 text-primary" />
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs bg-white/80 backdrop-blur">
                        <Clock className="size-3 mr-1" />
                        {app.setupTime}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                    {app.title}
                  </CardTitle>
                  <CardDescription className="text-gray-600 mt-2 leading-relaxed">
                    {app.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge 
                        className={`${getComplexityColor(app.complexity)} text-white text-xs px-3 py-1 rounded-full shadow-sm`}
                      >
                        {app.complexity}
                      </Badge>
                      <Badge variant="outline" className="text-xs px-3 py-1 rounded-full bg-white/80 backdrop-blur">
                        {app.category}
                      </Badge>
                      {app.customizationOptions?.some(opt => opt.aiEnhanced) && (
                        <Badge className="bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs px-3 py-1 rounded-full shadow-lg">
                          <Brain className="size-3 mr-1" />
                          AI Enhanced
                        </Badge>
                      )}
                      <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs px-3 py-1 rounded-full shadow-lg">
                        <Play className="size-3 mr-1" />
                        Live Demo
                      </Badge>
                    </div>
                    
                                        <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                      <div className="text-sm font-bold text-green-700">
                        💰 Value: {app.monthlyValue}/month saved
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {app.features.slice(0, 3).map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-sm text-gray-700">
                          <div className="size-2 rounded-full bg-gradient-to-r from-primary to-blue-500 shadow-sm" />
                          {feature}
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mt-6">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="rounded-xl border-2 hover:border-primary hover:bg-primary/5 transition-all duration-200 shadow-sm hover:shadow-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTryDemo(app.id);
                        }}
                      >
                        <Play className="size-3 mr-1" />
                        Try Demo
                      </Button>
                      <Button 
                        size="sm"
                        className="rounded-xl bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCustomize(app.id);
                        }}
                      >
                        <Settings className="size-3 mr-1" />
                        Customize
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Detailed View */}
        <section className="container mx-auto py-12">
          <Card className="glass-card border-2 rounded-3xl overflow-hidden bg-gradient-to-br from-white via-gray-50 to-blue-50 shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-blue-500/5 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {currentApp && (
                    <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/10 to-blue-500/10 flex items-center justify-center shadow-lg">
                      <currentApp.icon className="size-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-primary bg-clip-text text-transparent">
                      {currentApp?.title}
                    </CardTitle>
                    <CardDescription className="text-lg mt-2 text-gray-600">
                      {currentApp?.description}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="outline" className="text-lg px-6 py-3 rounded-full bg-white/80 backdrop-blur border-2">
                    {currentApp?.complexity}
                  </Badge>
                  <Badge className="text-lg px-6 py-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
                    💰 {currentApp?.monthlyValue} Value
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="demo">Live Demo</TabsTrigger>
                  <TabsTrigger value="customize">Customize</TabsTrigger>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="code">Code Preview</TabsTrigger>
                  <TabsTrigger value="use-cases">Use Cases</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-6 mt-6">
                  <div className="grid md:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Clock className="size-5" />
                          Setup Time
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-primary">{currentApp?.setupTime}</div>
                        <p className="text-sm text-muted-foreground">From download to working automation</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <DollarSign className="size-5" />
                          Monthly Value
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">{currentApp?.monthlyValue}</div>
                        <p className="text-sm text-muted-foreground">Time & cost savings per month</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Zap className="size-5" />
                          Complexity
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{currentApp?.complexity}</div>
                        <p className="text-sm text-muted-foreground">Technical skill level required</p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="demo" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Play className="size-5" />
                        Live Demo
                      </CardTitle>
                      <CardDescription>
                        Experience how this automation works in real-time with realistic Google Apps interfaces
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="text-center py-6 border rounded-lg">
                          <Play className="size-12 mx-auto text-primary/50 mb-3" />
                          <h3 className="text-lg font-semibold mb-2">Interactive Demo</h3>
                          <p className="text-muted-foreground mb-4 text-sm">
                            Watch step-by-step how this automation processes data
                          </p>
                          <Button onClick={() => setShowDemo(true)} className="hover-glow">
                            <Play className="size-4 mr-2" />
                            Start Demo
                          </Button>
                        </div>
                        <div className="text-center py-6 border rounded-lg">
                          <Chrome className="size-12 mx-auto text-blue-500 mb-3" />
                          <h3 className="text-lg font-semibold mb-2">Tutorial Demo</h3>
                          <p className="text-muted-foreground mb-4 text-sm">
                            Realistic screen recording style demo with Google Apps
                          </p>
                          <Button onClick={() => setShowTutorialDemo(true)} className="hover-glow">
                            <Play className="size-4 mr-2" />
                            Start Tutorial
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {showDemo && currentApp?.demoSteps && (
                    <InteractiveScriptDemo
                      scriptId={currentApp.id}
                      scriptTitle={currentApp.title}
                      demoSteps={currentApp.demoSteps}
                      finalOutput={{}}
                    />
                  )}
                  
                  {showTutorialDemo && (
                    <TutorialDemo
                      scriptId={currentApp?.id || ""}
                      scriptTitle={currentApp?.title || ""}
                      onClose={() => setShowTutorialDemo(false)}
                    />
                  )}
                </TabsContent>

                <TabsContent value="customize" className="mt-6">
                  {currentApp?.customizationOptions && (
                    <ScriptCustomizer
                      scriptId={currentApp.id}
                      scriptTitle={currentApp.title}
                      baseCode={currentApp.codePreview}
                      
                      onDownload={(customizedCode, config) => {
                        // This would handle the download with customizations
                        console.log("Downloading customized script:", { customizedCode, config });
                        alert("Custom script download would start here with your AI enhancements!");
                      }}
                    />
                  )}
                </TabsContent>
                
                <TabsContent value="features" className="mt-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    {currentApp?.features.map((feature, idx) => (
                      <Card key={idx} className="border-l-4 border-l-primary">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="size-5 text-green-500" />
                            <span className="font-medium">{feature}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="code" className="mt-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Code2 className="size-5" />
                          Google Apps Script Preview
                        </CardTitle>
                        <Button variant="outline" size="sm" onClick={handleCopyCode}>
                          <Copy className="size-4 mr-2" />
                          Copy Code
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                        <code>{currentApp?.codePreview}</code>
                      </pre>
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Note:</strong> This is a simplified preview. The complete script includes 
                          error handling, configuration options, and detailed comments for easy customization.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="use-cases" className="mt-6">
                  <div className="space-y-4">
                    {currentApp?.useCases.map((useCase, idx) => (
                      <Card key={idx}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-xs font-bold text-primary">{idx + 1}</span>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-1">{useCase}</h4>
                              <p className="text-sm text-muted-foreground">
                                Perfect for teams looking to automate repetitive tasks and improve efficiency.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        {/* CTA Section */}
        <section className="container mx-auto py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Why Choose Pre-Built Apps Script Solutions?
          </h2>
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="space-y-4">
              <div className="size-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <Clock className="size-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Instant Implementation</h3>
              <p className="text-muted-foreground">
                Download and deploy in minutes, not weeks. No development time required.
              </p>
            </div>
            <div className="space-y-4">
              <div className="size-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <DollarSign className="size-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold">No Monthly Fees</h3>
              <p className="text-muted-foreground">
                One-time setup, lifetime value. Unlike expensive AI agents that charge monthly.
              </p>
            </div>
            <div className="space-y-4">
              <div className="size-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                <Code2 className="size-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold">Full Customization</h3>
              <p className="text-muted-foreground">
                Get the complete source code. Modify and extend to fit your exact needs.
              </p>
            </div>
          </div>
          <div className="flex gap-4 justify-center">
            <Button size="lg" className="hover-glow">
              Download Sample Pack
            </Button>
            <Button variant="outline" size="lg" className="glass-card">
              Schedule Consultation
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}