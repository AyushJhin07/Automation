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
import EnhancedTutorialDemo from "@/components/demos/EnhancedTutorialDemo";

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
      // Gmail App Specific Options
      {
        id: "gmailSearchQuery",
        label: "Gmail Search Query",
        description: "Advanced Gmail search to find specific emails (e.g., 'from:contact@website.com has:attachment')",
        type: "textarea" as const,
        defaultValue: "is:unread label:leads",
        aiEnhanced: true
      },
      {
        id: "gmailLabels",
        label: "Gmail Labels to Apply",
        description: "Labels to automatically apply to processed emails",
        type: "textarea" as const,
        defaultValue: "Processed, Lead-Captured, Follow-Up-Needed",
        aiEnhanced: true
      },
      {
        id: "gmailAutoReply",
        label: "Gmail Auto-Reply Settings",
        description: "Configure automatic email responses",
        type: "select" as const,
        defaultValue: "immediate",
        options: ["immediate", "delayed", "none"],
        aiEnhanced: true
      },
      {
        id: "gmailAttachmentHandling",
        label: "Gmail Attachment Processing",
        description: "How to handle email attachments",
        type: "select" as const,
        defaultValue: "save-to-drive",
        options: ["save-to-drive", "extract-text", "ignore", "forward-to-team"],
        aiEnhanced: true
      },
      {
        id: "gmailThreadHandling",
        label: "Gmail Thread Management",
        description: "How to handle email threads and conversations",
        type: "select" as const,
        defaultValue: "process-latest",
        options: ["process-latest", "process-all", "skip-if-processed"],
        aiEnhanced: true
      },
      
      // Google Sheets App Specific Options
      {
        id: "sheetsTargetRange",
        label: "Google Sheets Target Range",
        description: "Specific range in sheet to add data (e.g., 'A:F' or 'Leads!A:F')",
        type: "text" as const,
        defaultValue: "A:F",
        aiEnhanced: true
      },
      {
        id: "sheetsDataValidation",
        label: "Google Sheets Data Validation",
        description: "Validate data before adding to sheets",
        type: "select" as const,
        defaultValue: "basic",
        options: ["basic", "strict", "none"],
        aiEnhanced: true
      },
      {
        id: "sheetsFormatting",
        label: "Google Sheets Auto-Formatting",
        description: "Apply formatting to new rows",
        type: "select" as const,
        defaultValue: "header-style",
        options: ["header-style", "alternating-colors", "conditional-formatting", "none"],
        aiEnhanced: true
      },
      {
        id: "sheetsNotifications",
        label: "Google Sheets Change Notifications",
        description: "Notify when data is added to sheets",
        type: "select" as const,
        defaultValue: "email",
        options: ["email", "slack", "none"],
        aiEnhanced: true
      },
      
      // Data Processing Options
      {
        id: "dataExtractionMethod",
        label: "Data Extraction Method",
        description: "How to extract data from emails",
        type: "select" as const,
        defaultValue: "ai-parsing",
        options: ["ai-parsing", "regex-patterns", "manual-mapping", "template-based"],
        aiEnhanced: true
      },
      {
        id: "dataMapping",
        label: "Data Field Mapping",
        description: "Map email fields to sheet columns (e.g., 'From:email, Subject:title')",
        type: "textarea" as const,
        defaultValue: "From:email, Subject:title, Body:message, Date:timestamp",
        aiEnhanced: true
      },
      {
        id: "dataCleaning",
        label: "Data Cleaning Rules",
        description: "Rules to clean extracted data",
        type: "textarea" as const,
        defaultValue: "remove-html-tags, trim-whitespace, validate-email-format",
        aiEnhanced: true
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
      // Google Sheets App Specific Options
      {
        id: "sheetsDataSources",
        label: "Google Sheets Data Sources",
        description: "Multiple sheet IDs to pull data from (comma-separated)",
        type: "textarea" as const,
        defaultValue: "SALES_DATA_SHEET_ID, CUSTOMER_DATA_SHEET_ID, METRICS_SHEET_ID",
        aiEnhanced: true
      },
      {
        id: "sheetsDataRanges",
        label: "Google Sheets Data Ranges",
        description: "Specific ranges to extract from each sheet (e.g., 'Sheet1!A1:D100')",
        type: "textarea" as const,
        defaultValue: "Sales!A1:F1000, Customers!A1:C500, Metrics!A1:B100",
        aiEnhanced: true
      },
      {
        id: "sheetsDataFilters",
        label: "Google Sheets Data Filters",
        description: "Filter criteria for data extraction",
        type: "textarea" as const,
        defaultValue: "date_range:last_30_days, status:active, region:all",
        aiEnhanced: true
      },
      {
        id: "sheetsCalculations",
        label: "Google Sheets Calculations",
        description: "Custom formulas to calculate in sheets",
        type: "textarea" as const,
        defaultValue: "SUM, AVERAGE, COUNT, GROWTH_RATE",
        aiEnhanced: true
      },
      
      // Google Docs App Specific Options
      {
        id: "docsTemplateId",
        label: "Google Docs Template ID",
        description: "Google Doc template with placeholders for data",
        type: "text" as const,
        defaultValue: "REPORT_TEMPLATE_DOC_ID"
      },
      {
        id: "docsPlaceholders",
        label: "Google Docs Placeholders",
        description: "Placeholder variables in template (e.g., {{TOTAL_REVENUE}}, {{CHART_1}})",
        type: "textarea" as const,
        defaultValue: "{{TOTAL_REVENUE}}, {{GROWTH_RATE}}, {{TOP_PERFORMERS}}, {{CHART_1}}, {{CHART_2}}",
        aiEnhanced: true
      },
      {
        id: "docsStyling",
        label: "Google Docs Styling",
        description: "Document styling and formatting options",
        type: "select" as const,
        defaultValue: "professional",
        options: ["professional", "minimal", "creative", "corporate"],
        aiEnhanced: true
      },
      {
        id: "docsSections",
        label: "Google Docs Report Sections",
        description: "Sections to include in the report",
        type: "textarea" as const,
        defaultValue: "executive-summary, key-metrics, detailed-analysis, recommendations, appendix",
        aiEnhanced: true
      },
      
      // Google Drive App Specific Options
      {
        id: "driveFolderId",
        label: "Google Drive Output Folder",
        description: "Folder to save generated reports",
        type: "text" as const,
        defaultValue: "REPORTS_FOLDER_ID"
      },
      {
        id: "driveFileNaming",
        label: "Google Drive File Naming",
        description: "Template for report file names",
        type: "text" as const,
        defaultValue: "Sales_Report_{date}_{period}.pdf",
        aiEnhanced: true
      },
      {
        id: "drivePermissions",
        label: "Google Drive File Permissions",
        description: "Who can access the generated reports",
        type: "select" as const,
        defaultValue: "team-view",
        options: ["public", "team-view", "specific-emails", "private"],
        aiEnhanced: true
      },
      
      // Gmail App Specific Options
      {
        id: "gmailRecipients",
        label: "Gmail Recipients",
        description: "Email addresses to send reports to",
        type: "textarea" as const,
        defaultValue: "sales@company.com, management@company.com, stakeholders@company.com"
      },
      {
        id: "gmailSubjectTemplate",
        label: "Gmail Subject Template",
        description: "Template for email subject line",
        type: "text" as const,
        defaultValue: "Sales Performance Report - {period} - {date}",
        aiEnhanced: true
      },
      {
        id: "gmailBodyTemplate",
        label: "Gmail Body Template",
        description: "Template for email body content",
        type: "textarea" as const,
        defaultValue: "Please find attached the {period} sales performance report. Key highlights: {highlights}",
        aiEnhanced: true
      },
      
      // Scheduling Options
      {
        id: "scheduleFrequency",
        label: "Report Generation Schedule",
        description: "How often to automatically generate reports",
        type: "select" as const,
        defaultValue: "weekly",
        options: ["daily", "weekly", "bi-weekly", "monthly", "quarterly", "custom"]
      },
      {
        id: "scheduleTime",
        label: "Report Generation Time",
        description: "Time of day to generate reports",
        type: "select" as const,
        defaultValue: "monday-9am",
        options: ["monday-9am", "friday-5pm", "daily-8am", "custom"],
        aiEnhanced: true
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
      // Google Calendar App Specific Options
      {
        id: "calendarId",
        label: "Google Calendar ID",
        description: "Primary calendar for booking appointments",
        type: "text" as const,
        defaultValue: "primary"
      },
      {
        id: "calendarEventColor",
        label: "Google Calendar Event Color",
        description: "Color coding for different types of appointments",
        type: "select" as const,
        defaultValue: "blue",
        options: ["blue", "green", "red", "yellow", "purple", "orange", "pink"],
        aiEnhanced: true
      },
      {
        id: "calendarAvailability",
        label: "Google Calendar Availability Rules",
        description: "Rules for determining available time slots",
        type: "textarea" as const,
        defaultValue: "exclude-existing-events, exclude-busy-times, buffer-before-after:15min",
        aiEnhanced: true
      },
      {
        id: "calendarEventDescription",
        label: "Google Calendar Event Description",
        description: "Template for event descriptions",
        type: "textarea" as const,
        defaultValue: "Client: {client_name}\nService: {service_type}\nNotes: {notes}\nContact: {phone}",
        aiEnhanced: true
      },
      {
        id: "calendarEventLocation",
        label: "Google Calendar Event Location",
        description: "Default location for appointments",
        type: "text" as const,
        defaultValue: "Google Meet",
        aiEnhanced: true
      },
      {
        id: "calendarRecurringSlots",
        label: "Google Calendar Recurring Slots",
        description: "Set up recurring availability slots",
        type: "select" as const,
        defaultValue: "weekly",
        options: ["none", "daily", "weekly", "monthly"],
        aiEnhanced: true
      },
      
      // Google Forms App Specific Options (for booking form)
      {
        id: "formsBookingFormId",
        label: "Google Forms Booking Form ID",
        description: "Form for clients to submit booking requests",
        type: "text" as const,
        defaultValue: "BOOKING_FORM_ID"
      },
      {
        id: "formsRequiredFields",
        label: "Google Forms Required Fields",
        description: "Required fields in booking form",
        type: "textarea" as const,
        defaultValue: "name, email, phone, service_type, preferred_date, preferred_time",
        aiEnhanced: true
      },
      {
        id: "formsValidationRules",
        label: "Google Forms Validation Rules",
        description: "Validation rules for form submissions",
        type: "textarea" as const,
        defaultValue: "email-format, phone-format, date-future-only, time-business-hours",
        aiEnhanced: true
      },
      
      // Google Sheets App Specific Options (for booking log)
      {
        id: "sheetsBookingLogId",
        label: "Google Sheets Booking Log ID",
        description: "Sheet to log all booking requests and confirmations",
        type: "text" as const,
        defaultValue: "BOOKING_LOG_SHEET_ID"
      },
      {
        id: "sheetsBookingColumns",
        label: "Google Sheets Booking Columns",
        description: "Columns to track in booking log",
        type: "textarea" as const,
        defaultValue: "timestamp, client_name, email, phone, service, requested_date, confirmed_date, status",
        aiEnhanced: true
      },
      
      // Gmail App Specific Options
      {
        id: "gmailConfirmationTemplate",
        label: "Gmail Confirmation Template",
        description: "Template for booking confirmation emails",
        type: "textarea" as const,
        defaultValue: "Hi {client_name},\n\nYour {service_type} appointment has been confirmed for {date} at {time}.\n\nGoogle Meet link: {meet_link}\n\nWe look forward to meeting with you!\n\nBest regards,\n{company_name}",
        aiEnhanced: true
      },
      {
        id: "gmailReminderTemplate",
        label: "Gmail Reminder Template",
        description: "Template for appointment reminder emails",
        type: "textarea" as const,
        defaultValue: "Hi {client_name},\n\nThis is a reminder for your {service_type} appointment tomorrow at {time}.\n\nGoogle Meet link: {meet_link}\n\nSee you soon!\n\nBest regards,\n{company_name}",
        aiEnhanced: true
      },
      {
        id: "gmailCancellationTemplate",
        label: "Gmail Cancellation Template",
        description: "Template for appointment cancellation emails",
        type: "textarea" as const,
        defaultValue: "Hi {client_name},\n\nYour appointment for {date} at {time} has been cancelled as requested.\n\nTo reschedule, please visit: {booking_link}\n\nBest regards,\n{company_name}",
        aiEnhanced: true
      },
      
      // Google Meet App Specific Options
      {
        id: "meetAutoCreate",
        label: "Google Meet Auto-Create",
        description: "Automatically create Google Meet links for appointments",
        type: "select" as const,
        defaultValue: "auto",
        options: ["auto", "manual", "disabled"]
      },
      {
        id: "meetSettings",
        label: "Google Meet Settings",
        description: "Settings for Google Meet calls",
        type: "textarea" as const,
        defaultValue: "mute-on-entry:true, video-off:false, waiting-room:true, recording:false",
        aiEnhanced: true
      },
      
      // Scheduling Logic Options
      {
        id: "bookingDuration",
        label: "Appointment Duration",
        description: "Default duration for appointments",
        type: "select" as const,
        defaultValue: "60",
        options: ["30", "45", "60", "90", "120"]
      },
      {
        id: "bookingBuffer",
        label: "Booking Buffer Time",
        description: "Buffer time between appointments",
        type: "select" as const,
        defaultValue: "15",
        options: ["0", "15", "30", "45"]
      },
      {
        id: "bookingAdvanceNotice",
        label: "Advance Booking Notice",
        description: "How far in advance clients can book",
        type: "select" as const,
        defaultValue: "7",
        options: ["1", "3", "7", "14", "30"],
        aiEnhanced: true
      }
    ],
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
      // Google Drive App Specific Options
      {
        id: "driveSourceFolderId",
        label: "Google Drive Source Folder",
        description: "Primary folder to monitor for new files",
        type: "text" as const,
        defaultValue: "INBOX_FOLDER_ID"
      },
      {
        id: "driveWatchFolders",
        label: "Google Drive Watch Folders",
        description: "Additional folders to monitor (comma-separated)",
        type: "textarea" as const,
        defaultValue: "UPLOADS_FOLDER_ID, SHARED_FOLDER_ID, TEAM_FOLDER_ID",
        aiEnhanced: true
      },
      {
        id: "driveFileTypes",
        label: "Google Drive File Type Filters",
        description: "File types to process (leave empty for all)",
        type: "textarea" as const,
        defaultValue: "documents, images, spreadsheets, presentations, videos, pdfs",
        aiEnhanced: true
      },
      {
        id: "driveFileSizeLimit",
        label: "Google Drive File Size Limit",
        description: "Maximum file size to process (in MB)",
        type: "text" as const,
        defaultValue: "100",
        aiEnhanced: true
      },
      {
        id: "driveFolderStructure",
        label: "Google Drive Folder Structure",
        description: "Template for organizing files into folders",
        type: "textarea" as const,
        defaultValue: "{file_type}/{year}/{month}/{project_name}",
        aiEnhanced: true
      },
      {
        id: "drivePermissions",
        label: "Google Drive File Permissions",
        description: "Default permissions for organized files",
        type: "select" as const,
        defaultValue: "team-view",
        options: ["private", "team-view", "team-edit", "public-view", "public-edit"],
        aiEnhanced: true
      },
      {
        id: "driveSharingRules",
        label: "Google Drive Sharing Rules",
        description: "Rules for sharing files with specific people",
        type: "textarea" as const,
        defaultValue: "finance-files:finance-team@company.com, hr-files:hr-team@company.com, client-files:client@company.com",
        aiEnhanced: true
      },
      {
        id: "driveArchiveRules",
        label: "Google Drive Archive Rules",
        description: "Rules for archiving old files",
        type: "textarea" as const,
        defaultValue: "older-than:365-days, move-to:archive-folder, compress:true",
        aiEnhanced: true
      },
      {
        id: "driveDuplicateHandling",
        label: "Google Drive Duplicate Handling",
        description: "How to handle duplicate files",
        type: "select" as const,
        defaultValue: "rename-with-timestamp",
        options: ["rename-with-timestamp", "skip", "overwrite", "move-to-duplicates-folder", "compare-content"],
        aiEnhanced: true
      },
      {
        id: "driveBackupRules",
        label: "Google Drive Backup Rules",
        description: "Backup rules for important files",
        type: "textarea" as const,
        defaultValue: "important-files:backup-daily, all-files:backup-weekly, retention:30-days",
        aiEnhanced: true
      },
      
      // Google Sheets App Specific Options (for file log)
      {
        id: "sheetsFileLogId",
        label: "Google Sheets File Log ID",
        description: "Sheet to log all file organization activities",
        type: "text" as const,
        defaultValue: "FILE_LOG_SHEET_ID"
      },
      {
        id: "sheetsLogColumns",
        label: "Google Sheets Log Columns",
        description: "Columns to track in file log",
        type: "textarea" as const,
        defaultValue: "timestamp, filename, original_location, new_location, file_type, file_size, action_taken",
        aiEnhanced: true
      },
      
      // Gmail App Specific Options (for notifications)
      {
        id: "gmailNotificationRecipients",
        label: "Gmail Notification Recipients",
        description: "Email addresses to notify about file organization",
        type: "textarea" as const,
        defaultValue: "admin@company.com, it@company.com, team-lead@company.com"
      },
      {
        id: "gmailNotificationTemplate",
        label: "Gmail Notification Template",
        description: "Template for file organization notifications",
        type: "textarea" as const,
        defaultValue: "File Organization Report\n\nFiles processed: {count}\nFiles moved: {moved}\nFiles archived: {archived}\nDuplicates found: {duplicates}",
        aiEnhanced: true
      },
      
      // File Processing Options
      {
        id: "fileProcessingRules",
        label: "File Processing Rules",
        description: "Rules for processing different file types",
        type: "textarea" as const,
        defaultValue: "images:compress-if-large, documents:extract-text, spreadsheets:validate-data, videos:generate-thumbnail",
        aiEnhanced: true
      },
      {
        id: "fileNamingConvention",
        label: "File Naming Convention",
        description: "Template for renaming files during organization",
        type: "text" as const,
        defaultValue: "{date}_{original_name}_{category}",
        aiEnhanced: true
      },
      {
        id: "fileMetadataExtraction",
        label: "File Metadata Extraction",
        description: "Extract metadata from files for better organization",
        type: "select" as const,
        defaultValue: "basic",
        options: ["none", "basic", "detailed", "full"],
        aiEnhanced: true
      }
    ],
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
      // Google Sheets App Specific Options
      {
        id: "sheetsExpenseTrackerId",
        label: "Google Sheets Expense Tracker ID",
        description: "Primary sheet for tracking all expenses",
        type: "text" as const,
        defaultValue: "EXPENSE_TRACKER_SHEET_ID"
      },
      {
        id: "sheetsApprovalLogId",
        label: "Google Sheets Approval Log ID",
        description: "Sheet to log all approval activities",
        type: "text" as const,
        defaultValue: "APPROVAL_LOG_SHEET_ID"
      },
      {
        id: "sheetsReimbursementLogId",
        label: "Google Sheets Reimbursement Log ID",
        description: "Sheet to track reimbursement status",
        type: "text" as const,
        defaultValue: "REIMBURSEMENT_LOG_SHEET_ID"
      },
      {
        id: "sheetsExpenseColumns",
        label: "Google Sheets Expense Columns",
        description: "Columns in expense tracker sheet",
        type: "textarea" as const,
        defaultValue: "date, employee, category, amount, vendor, receipt_id, status, approver, notes",
        aiEnhanced: true
      },
      {
        id: "sheetsApprovalColumns",
        label: "Google Sheets Approval Columns",
        description: "Columns in approval log sheet",
        type: "textarea" as const,
        defaultValue: "timestamp, expense_id, approver, action, amount, comments, next_approver",
        aiEnhanced: true
      },
      {
        id: "sheetsBudgetTracking",
        label: "Google Sheets Budget Tracking",
        description: "Track expenses against department budgets",
        type: "select" as const,
        defaultValue: "enabled",
        options: ["enabled", "disabled"],
        aiEnhanced: true
      },
      
      // Gmail App Specific Options
      {
        id: "gmailReceiptSearch",
        label: "Gmail Receipt Search Query",
        description: "Gmail search to find receipt emails",
        type: "textarea" as const,
        defaultValue: "has:attachment subject:(receipt OR invoice OR expense) from:(noreply@* OR receipts@*)",
        aiEnhanced: true
      },
      {
        id: "gmailReceiptLabels",
        label: "Gmail Receipt Labels",
        description: "Labels to apply to processed receipt emails",
        type: "textarea" as const,
        defaultValue: "Processed, Expense-Approved, Expense-Rejected, Receipt-Processed",
        aiEnhanced: true
      },
      {
        id: "gmailApprovalNotifications",
        label: "Gmail Approval Notifications",
        description: "Email templates for approval notifications",
        type: "textarea" as const,
        defaultValue: "approval-request:manager@company.com, approval-approved:employee@company.com, approval-rejected:employee@company.com",
        aiEnhanced: true
      },
      {
        id: "gmailReceiptProcessing",
        label: "Gmail Receipt Processing",
        description: "How to process receipt attachments",
        type: "select" as const,
        defaultValue: "ocr-extract",
        options: ["ocr-extract", "manual-review", "forward-to-finance", "save-to-drive"],
        aiEnhanced: true
      },
      
      // Google Drive App Specific Options
      {
        id: "driveReceiptFolderId",
        label: "Google Drive Receipt Folder",
        description: "Folder to store receipt attachments",
        type: "text" as const,
        defaultValue: "RECEIPTS_FOLDER_ID"
      },
      {
        id: "driveReceiptNaming",
        label: "Google Drive Receipt Naming",
        description: "Template for naming receipt files",
        type: "text" as const,
        defaultValue: "{date}_{employee}_{vendor}_{amount}_receipt.pdf",
        aiEnhanced: true
      },
      {
        id: "driveReceiptPermissions",
        label: "Google Drive Receipt Permissions",
        description: "Who can access receipt files",
        type: "select" as const,
        defaultValue: "finance-team",
        options: ["private", "finance-team", "employee-only", "managers"],
        aiEnhanced: true
      },
      {
        id: "driveReceiptArchive",
        label: "Google Drive Receipt Archive",
        description: "Archive rules for old receipts",
        type: "textarea" as const,
        defaultValue: "older-than:7-years, move-to:archive-folder, compress:true",
        aiEnhanced: true
      },
      
      // Google Forms App Specific Options (for expense submission)
      {
        id: "formsExpenseFormId",
        label: "Google Forms Expense Form ID",
        description: "Form for employees to submit expenses",
        type: "text" as const,
        defaultValue: "EXPENSE_SUBMISSION_FORM_ID"
      },
      {
        id: "formsExpenseFields",
        label: "Google Forms Expense Fields",
        description: "Required fields in expense submission form",
        type: "textarea" as const,
        defaultValue: "employee_name, expense_date, category, amount, vendor, business_purpose, receipt_upload",
        aiEnhanced: true
      },
      {
        id: "formsValidationRules",
        label: "Google Forms Validation Rules",
        description: "Validation rules for expense submissions",
        type: "textarea" as const,
        defaultValue: "amount-positive, date-not-future, category-valid, receipt-required-above-25",
        aiEnhanced: true
      },
      
      // Approval Workflow Options
      {
        id: "approvalWorkflow",
        label: "Approval Workflow Configuration",
        description: "Multi-level approval workflow setup",
        type: "select" as const,
        defaultValue: "manager-finance",
        options: ["manager-only", "manager-finance", "multi-level", "auto-approve", "department-head"],
        aiEnhanced: true
      },
      {
        id: "approvalThresholds",
        label: "Approval Amount Thresholds",
        description: "Dollar amounts for different approval levels",
        type: "textarea" as const,
        defaultValue: "$0-25: auto-approve\n$25-100: manager approval\n$100-500: finance approval\n$500+: executive approval",
        aiEnhanced: true
      },
      {
        id: "approvalTimeouts",
        label: "Approval Timeout Rules",
        description: "Auto-approval if no response within timeframe",
        type: "textarea" as const,
        defaultValue: "manager:3-days, finance:5-days, executive:7-days",
        aiEnhanced: true
      },
      
      // Expense Categories and Policies
      {
        id: "expenseCategories",
        label: "Expense Categories",
        description: "Custom expense categories and rules",
        type: "textarea" as const,
        defaultValue: "travel:requires-pre-approval, meals:max-25-per-day, office-supplies:auto-approve, software:it-review-required",
        aiEnhanced: true
      },
      {
        id: "expensePolicies",
        label: "Expense Policy Rules",
        description: "Company expense policy enforcement",
        type: "textarea" as const,
        defaultValue: "meals-require-receipt, travel-needs-advance-approval, software-requires-it-approval, no-personal-expenses",
        aiEnhanced: true
      },
      {
        id: "reimbursementProcess",
        label: "Reimbursement Process",
        description: "Automated reimbursement workflow",
        type: "textarea" as const,
        defaultValue: "approval → payment-processing → confirmation-email → receipt-archive",
        aiEnhanced: true
      }
    ],
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
      // Google Sheets App Specific Options
      {
        id: "sheetsProjectTrackerId",
        label: "Google Sheets Project Tracker ID",
        description: "Primary sheet for tracking project tasks and milestones",
        type: "text" as const,
        defaultValue: "PROJECT_TRACKER_SHEET_ID"
      },
      {
        id: "sheetsTaskLogId",
        label: "Google Sheets Task Log ID",
        description: "Sheet to log all task activities and updates",
        type: "text" as const,
        defaultValue: "TASK_LOG_SHEET_ID"
      },
      {
        id: "sheetsTeamDashboardId",
        label: "Google Sheets Team Dashboard ID",
        description: "Dashboard sheet for team overview and metrics",
        type: "text" as const,
        defaultValue: "TEAM_DASHBOARD_SHEET_ID"
      },
      {
        id: "sheetsTaskColumns",
        label: "Google Sheets Task Columns",
        description: "Columns in project tracker sheet",
        type: "textarea" as const,
        defaultValue: "task_id, task_name, assignee, priority, status, deadline, progress, dependencies, notes",
        aiEnhanced: true
      },
      {
        id: "sheetsMilestoneColumns",
        label: "Google Sheets Milestone Columns",
        description: "Columns for milestone tracking",
        type: "textarea" as const,
        defaultValue: "milestone_id, milestone_name, due_date, status, completion_date, responsible_person, deliverables",
        aiEnhanced: true
      },
      {
        id: "sheetsAutomationRules",
        label: "Google Sheets Automation Rules",
        description: "Rules for automatic sheet updates",
        type: "textarea" as const,
        defaultValue: "status-change:update-timestamp, deadline-passed:mark-overdue, completion:update-progress",
        aiEnhanced: true
      },
      
      // Google Calendar App Specific Options
      {
        id: "calendarProjectId",
        label: "Google Calendar Project Calendar ID",
        description: "Calendar for project events and deadlines",
        type: "text" as const,
        defaultValue: "PROJECT_CALENDAR_ID"
      },
      {
        id: "calendarTaskEvents",
        label: "Google Calendar Task Events",
        description: "Create calendar events for tasks",
        type: "select" as const,
        defaultValue: "deadlines-only",
        options: ["none", "deadlines-only", "all-tasks", "milestones-only"],
        aiEnhanced: true
      },
      {
        id: "calendarEventTemplates",
        label: "Google Calendar Event Templates",
        description: "Templates for calendar events",
        type: "textarea" as const,
        defaultValue: "task-deadline:Task Due - {task_name}, milestone:Milestone - {milestone_name}, team-meeting:Team Sync - {project_name}",
        aiEnhanced: true
      },
      {
        id: "calendarReminderSettings",
        label: "Google Calendar Reminder Settings",
        description: "Calendar reminder configuration",
        type: "textarea" as const,
        defaultValue: "task-deadline:1-day-before, milestone:3-days-before, team-meeting:15-minutes-before",
        aiEnhanced: true
      },
      
      // Gmail App Specific Options
      {
        id: "gmailTaskNotifications",
        label: "Gmail Task Notifications",
        description: "Email notifications for task updates",
        type: "textarea" as const,
        defaultValue: "task-assigned:assignee@company.com, task-completed:manager@company.com, deadline-reminder:assignee@company.com",
        aiEnhanced: true
      },
      {
        id: "gmailProjectUpdates",
        label: "Gmail Project Updates",
        description: "Email templates for project updates",
        type: "textarea" as const,
        defaultValue: "daily-digest:team@company.com, weekly-report:stakeholders@company.com, milestone-reached:management@company.com",
        aiEnhanced: true
      },
      {
        id: "gmailEscalationEmails",
        label: "Gmail Escalation Emails",
        description: "Email escalation rules",
        type: "textarea" as const,
        defaultValue: "overdue-3-days:manager@company.com, overdue-7-days:director@company.com, blocked-task:project-manager@company.com",
        aiEnhanced: true
      },
      {
        id: "gmailTeamDigest",
        label: "Gmail Team Digest",
        description: "Daily/weekly team digest emails",
        type: "select" as const,
        defaultValue: "daily",
        options: ["none", "daily", "weekly", "bi-weekly"],
        aiEnhanced: true
      },
      
      // Google Docs App Specific Options
      {
        id: "docsProjectTemplateId",
        label: "Google Docs Project Template ID",
        description: "Template for project documentation",
        type: "text" as const,
        defaultValue: "PROJECT_TEMPLATE_DOC_ID"
      },
      {
        id: "docsStatusReportId",
        label: "Google Docs Status Report ID",
        description: "Template for status reports",
        type: "text" as const,
        defaultValue: "STATUS_REPORT_TEMPLATE_ID"
      },
      {
        id: "docsAutoGenerate",
        label: "Google Docs Auto-Generate",
        description: "Automatically generate project documents",
        type: "select" as const,
        defaultValue: "status-reports",
        options: ["none", "status-reports", "project-docs", "meeting-notes", "all"],
        aiEnhanced: true
      },
      {
        id: "docsUpdateFrequency",
        label: "Google Docs Update Frequency",
        description: "How often to update project documents",
        type: "select" as const,
        defaultValue: "weekly",
        options: ["daily", "weekly", "bi-weekly", "monthly", "on-change"],
        aiEnhanced: true
      },
      
      // Google Drive App Specific Options
      {
        id: "driveProjectFolderId",
        label: "Google Drive Project Folder ID",
        description: "Main folder for project files",
        type: "text" as const,
        defaultValue: "PROJECT_FOLDER_ID"
      },
      {
        id: "driveFileOrganization",
        label: "Google Drive File Organization",
        description: "Organize project files automatically",
        type: "select" as const,
        defaultValue: "by-task",
        options: ["none", "by-task", "by-date", "by-type", "by-assignee"],
        aiEnhanced: true
      },
      {
        id: "drivePermissionRules",
        label: "Google Drive Permission Rules",
        description: "Rules for file permissions",
        type: "textarea" as const,
        defaultValue: "task-files:assignee-edit, project-files:team-view, sensitive-files:manager-only",
        aiEnhanced: true
      },
      
      // Task Management Options
      {
        id: "taskPriorityLevels",
        label: "Task Priority Levels",
        description: "Priority categories for tasks",
        type: "textarea" as const,
        defaultValue: "low, medium, high, urgent, critical, blocker",
        aiEnhanced: true
      },
      {
        id: "taskStatusWorkflow",
        label: "Task Status Workflow",
        description: "Allowed status transitions",
        type: "textarea" as const,
        defaultValue: "todo → in-progress → review → done, todo → blocked → in-progress → done",
        aiEnhanced: true
      },
      {
        id: "taskDependencies",
        label: "Task Dependencies",
        description: "Handle task dependencies automatically",
        type: "select" as const,
        defaultValue: "enabled",
        options: ["enabled", "disabled"],
        aiEnhanced: true
      },
      {
        id: "taskTimeTracking",
        label: "Task Time Tracking",
        description: "Track time spent on tasks",
        type: "select" as const,
        defaultValue: "optional",
        options: ["disabled", "optional", "required"],
        aiEnhanced: true
      },
      
      // Notification and Reporting Options
      {
        id: "notificationSchedule",
        label: "Notification Schedule",
        description: "When to send notifications",
        type: "textarea" as const,
        defaultValue: "deadline-reminder:3-days-before, overdue-alert:daily, completion-notice:immediate",
        aiEnhanced: true
      },
      {
        id: "reportGeneration",
        label: "Report Generation",
        description: "Automated report generation",
        type: "textarea" as const,
        defaultValue: "daily-digest:8am, weekly-report:monday-9am, monthly-summary:first-monday",
        aiEnhanced: true
      },
      {
        id: "escalationRules",
        label: "Escalation Rules",
        description: "Rules for escalating issues",
        type: "textarea" as const,
        defaultValue: "overdue-3-days:notify-manager, overdue-7-days:escalate-director, blocked-2-days:notify-project-manager",
        aiEnhanced: true
      }
    ],
  }
];

export default function PreBuiltApps() {
  const [activeApp, setActiveApp] = useState("email-automation");
  const [showCode, setShowCode] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showEnhancedTutorialDemo, setShowEnhancedTutorialDemo] = useState(false);
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
    setShowEnhancedTutorialDemo(true);
  };

  const handleTryEnhancedDemo = (appId: string) => {
    setActiveApp(appId);
    setShowEnhancedTutorialDemo(true);
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
                          handleTryEnhancedDemo(app.id);
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

                      </div>
                    </CardContent>
                  </Card>
                  
                  <div className="text-center py-12">
                    <div className="max-w-md mx-auto">
                      <div className="size-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <Play className="size-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Interactive Demo</h3>
                      <p className="text-muted-foreground mb-6">
                        Click the "Try Demo" button above to see the enhanced tutorial demo with realistic visual progression.
                      </p>
                      <Button 
                        onClick={() => setShowEnhancedTutorialDemo(true)}
                        className="hover-glow"
                      >
                        <Play className="size-4 mr-2" />
                        Launch Enhanced Demo
                      </Button>
                    </div>
                  </div>
                  

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

        {/* Enhanced Tutorial Demo Modal */}
        {showEnhancedTutorialDemo && (
          <EnhancedTutorialDemo
            scriptId={currentApp?.id || ""}
            scriptTitle={currentApp?.title || ""}
            onClose={() => setShowEnhancedTutorialDemo(false)}
          />
        )}
      </main>
    </>
  );
}