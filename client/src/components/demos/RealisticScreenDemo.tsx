import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Mail, 
  FileSpreadsheet, 
  Search, 
  Settings, 
  Play, 
  Eye, 
  Filter,
  Code2,
  MoreVertical,
  Plus,
  Send,
  Calendar,
  FileText,
  FolderOpen,
  BarChart3,
  CheckCircle2,
  MousePointer2
} from 'lucide-react';

interface CursorState {
  x: number;
  y: number;
  isClicking: boolean;
  isTyping: boolean;
  isDragging: boolean;
  isVisible: boolean;
}

interface DemoStep {
  id: string;
  title: string;
  description: string;
  duration: number;
  interface: 'gmail' | 'sheets' | 'script-editor' | 'calendar' | 'docs' | 'drive';
  cursorActions: {
    move: { x: number; y: number; duration: number }[];
    clicks: { x: number; y: number; delay: number }[];
    typing?: { text: string; delay: number; speed: number };
    highlights?: { target: string; duration: number }[];
  };
  dataChanges?: any;
}

const MouseCursor = ({ cursor }: { cursor: CursorState }) => (
  <div 
    className={`absolute pointer-events-none z-50 transition-all duration-200 ${
      cursor.isVisible ? 'opacity-100' : 'opacity-0'
    }`}
    style={{ 
      left: cursor.x, 
      top: cursor.y,
      transform: `translate(-4px, -4px) ${cursor.isClicking ? 'scale(0.9)' : 'scale(1)'}`
    }}
  >
    <MousePointer2 
      className={`size-6 ${
        cursor.isClicking ? 'text-blue-500' : 'text-gray-800'
      } drop-shadow-lg`}
    />
    {cursor.isClicking && (
      <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-75 size-3 top-1 left-1" />
    )}
  </div>
);

const GmailInterface = ({ isActive, data, highlights }: { 
  isActive: boolean; 
  data?: any; 
  highlights?: string[]; 
}) => (
  <div className={`border rounded-lg bg-white shadow-2xl transition-all duration-500 ${
    isActive ? 'scale-105 shadow-2xl' : 'scale-100'
  }`}>
    {/* Gmail Header */}
    <div className="bg-[#EA4335] text-white p-3 rounded-t-lg flex items-center gap-2">
      <Mail className="size-5" />
      <span className="font-semibold">Gmail</span>
      <div className="ml-auto flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 ${
          highlights?.includes('search-bar') ? 'ring-2 ring-yellow-300 animate-pulse' : ''
        }`}>
          <Search className="size-4" />
          <input 
            className="bg-transparent placeholder-white/70 text-sm w-48 outline-none"
            placeholder={data?.searchQuery || "Search mail"}
            value={data?.searchQuery || ""}
            readOnly
          />
        </div>
        <Settings className="size-4 cursor-pointer hover:bg-white/10 p-1 rounded" />
      </div>
    </div>
    
    {/* Gmail Sidebar */}
    <div className="flex">
      <div className="w-48 bg-gray-50 p-3 border-r">
        <Button className={`w-full justify-start gap-2 mb-3 ${
          highlights?.includes('compose') ? 'ring-2 ring-blue-400 animate-pulse' : ''
        }`}>
          <Plus className="size-4" />
          Compose
        </Button>
        <div className="space-y-1">
          <div className={`p-2 hover:bg-gray-200 rounded cursor-pointer flex items-center gap-2 ${
            highlights?.includes('inbox') ? 'bg-blue-100 border border-blue-300' : ''
          }`}>
            <span>📥</span>
            <span className="text-sm">Inbox</span>
            <Badge variant="secondary" className="ml-auto text-xs">
              {data?.unreadCount || 12}
            </Badge>
          </div>
          <div className="p-2 hover:bg-gray-200 rounded cursor-pointer flex items-center gap-2">
            <span>📤</span>
            <span className="text-sm">Sent</span>
          </div>
          <div className={`p-2 hover:bg-gray-200 rounded cursor-pointer flex items-center gap-2 ${
            highlights?.includes('leads-label') ? 'bg-green-100 border border-green-300' : ''
          }`}>
            <span>🏷️</span>
            <span className="text-sm">Leads</span>
            <Badge variant="secondary" className="ml-auto text-xs">
              {data?.leadCount || 3}
            </Badge>
          </div>
        </div>
      </div>
      
      {/* Gmail Email List */}
      <div className="flex-1 p-4">
        <div className="space-y-2">
          {data?.emails?.map((email: any, idx: number) => (
            <div key={idx} className={`p-4 border rounded-lg transition-all duration-300 cursor-pointer ${
              isActive && email.selected ? 'bg-blue-50 border-blue-300 shadow-md' : 
              email.unread ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100'
            } ${highlights?.includes(`email-${idx}`) ? 'ring-2 ring-yellow-300 animate-pulse' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                  {email.from.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm ${email.unread ? 'font-bold' : ''}`}>
                      {email.from}
                    </span>
                    <span className="text-xs text-gray-500">{email.time}</span>
                    {email.unread && <div className="size-2 bg-blue-500 rounded-full" />}
                  </div>
                  <div className={`text-sm ${email.unread ? 'font-semibold' : 'text-gray-600'}`}>
                    {email.subject}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-1">
                    {email.preview}
                  </div>
                </div>
                {isActive && email.selected && (
                  <Badge className="bg-green-500 text-white text-xs animate-pulse">
                    <Eye className="size-3 mr-1" />
                    Processing
                  </Badge>
                )}
              </div>
            </div>
          ))}
          
          {isActive && data?.processingEmail && (
            <div className="p-4 border-2 border-dashed border-green-300 rounded-lg bg-green-50 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="size-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-green-700">
                  Extracting email data...
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);

const SheetsInterface = ({ isActive, data, highlights }: { 
  isActive: boolean; 
  data?: any; 
  highlights?: string[]; 
}) => (
  <div className={`border rounded-lg bg-white shadow-2xl transition-all duration-500 ${
    isActive ? 'scale-105 shadow-2xl' : 'scale-100'
  }`}>
    {/* Sheets Header */}
    <div className="bg-[#34A853] text-white p-3 rounded-t-lg flex items-center gap-2">
      <FileSpreadsheet className="size-5" />
      <span className="font-semibold">Google Sheets</span>
      <span className="text-sm ml-auto bg-white/20 px-2 py-1 rounded">
        {data?.sheetName || 'Lead_Management_System'}
      </span>
    </div>
    
    {/* Sheets Toolbar */}
    <div className="bg-gray-50 p-2 border-b flex items-center gap-2">
      <Button size="sm" variant="ghost" className="text-xs">File</Button>
      <Button size="sm" variant="ghost" className="text-xs">Edit</Button>
      <Button size="sm" variant="ghost" className="text-xs">Insert</Button>
      <Button size="sm" variant="ghost" className="text-xs">Format</Button>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" className={`text-xs ${
          highlights?.includes('share-button') ? 'ring-2 ring-blue-400' : ''
        }`}>
          Share
        </Button>
      </div>
    </div>
    
    {/* Sheets Content */}
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-3 text-left font-medium w-8 bg-gray-200">A</th>
              <th className="border border-gray-300 p-3 text-left font-medium w-32 bg-gray-200">B</th>
              <th className="border border-gray-300 p-3 text-left font-medium w-40 bg-gray-200">C</th>
              <th className="border border-gray-300 p-3 text-left font-medium w-32 bg-gray-200">D</th>
              <th className="border border-gray-300 p-3 text-left font-medium w-32 bg-gray-200">E</th>
            </tr>
            <tr className="bg-blue-50">
              <th className="border border-gray-300 p-2 text-left font-medium">1</th>
              <th className="border border-gray-300 p-2 text-left font-medium">Date</th>
              <th className="border border-gray-300 p-2 text-left font-medium">Subject</th>
              <th className="border border-gray-300 p-2 text-left font-medium">From</th>
              <th className="border border-gray-300 p-2 text-left font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows?.map((row: any, idx: number) => (
              <tr key={idx} className={`transition-all duration-500 ${
                isActive && row.isNew ? 'bg-green-100 animate-pulse border-green-300' : 'hover:bg-gray-50'
              } ${highlights?.includes(`row-${idx}`) ? 'ring-2 ring-yellow-300' : ''}`}>
                <td className="border border-gray-300 p-2 font-mono text-gray-500">{idx + 2}</td>
                <td className="border border-gray-300 p-2">{row.date}</td>
                <td className="border border-gray-300 p-2">{row.subject}</td>
                <td className="border border-gray-300 p-2">{row.from}</td>
                <td className="border border-gray-300 p-2">{row.phone}</td>
              </tr>
            ))}
            
            {isActive && data?.addingRow && (
              <tr className="bg-green-50 animate-pulse border-2 border-green-300">
                <td className="border border-gray-300 p-2 font-mono text-gray-500">
                  {(data?.rows?.length || 0) + 2}
                </td>
                <td className="border border-gray-300 p-2">
                  <div className="flex items-center gap-2">
                    <div className="size-3 bg-green-500 rounded-full animate-ping" />
                    <span className="text-green-700 font-medium">Adding data...</span>
                  </div>
                </td>
                <td className="border border-gray-300 p-2 text-gray-400">Processing...</td>
                <td className="border border-gray-300 p-2 text-gray-400">Processing...</td>
                <td className="border border-gray-300 p-2 text-gray-400">Processing...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const ScriptEditorInterface = ({ isActive, data, highlights }: { 
  isActive: boolean; 
  data?: any; 
  highlights?: string[]; 
}) => (
  <div className={`border rounded-lg bg-white shadow-2xl transition-all duration-500 ${
    isActive ? 'scale-105 shadow-2xl' : 'scale-100'
  }`}>
    {/* Script Editor Header */}
    <div className="bg-[#4285F4] text-white p-3 rounded-t-lg flex items-center gap-2">
      <Code2 className="size-5" />
      <span className="font-semibold">Google Apps Script</span>
      <span className="text-sm ml-auto bg-white/20 px-2 py-1 rounded">
        {data?.projectName || 'Email_Automation_Script'}
      </span>
    </div>
    
    {/* Script Editor Toolbar */}
    <div className="bg-gray-50 p-2 border-b flex items-center gap-3">
      <Button 
        size="sm" 
        className={`bg-green-600 hover:bg-green-700 text-white ${
          highlights?.includes('run-button') ? 'ring-4 ring-green-300 animate-pulse' : ''
        }`}
      >
        <Play className="size-4 mr-1" />
        Run
      </Button>
      <Button size="sm" variant="ghost" className="text-xs">Debug</Button>
      <Button size="sm" variant="ghost" className="text-xs">Deploy</Button>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-gray-600">Last saved: just now</span>
      </div>
    </div>
    
    {/* Script Content */}
    <div className="p-4 bg-gray-900 text-green-400 font-mono text-sm">
      <div className="space-y-1">
        <div className="text-gray-500">// Email Automation Script</div>
        <div className="text-blue-300">function <span className="text-yellow-300">processIncomingEmails</span>() {'{'}
        </div>
        <div className="ml-4 text-gray-300">
          const threads = <span className="text-purple-300">GmailApp</span>.search(<span className="text-orange-300">'is:unread label:leads'</span>);
        </div>
        <div className="ml-4 text-gray-300">
          const sheet = <span className="text-purple-300">SpreadsheetApp</span>.openById(<span className="text-orange-300">'SHEET_ID'</span>);
        </div>
        <div className="ml-4">...</div>
        <div className="text-blue-300">{'}'}</div>
        
        {isActive && data?.executing && (
          <div className="mt-4 p-3 bg-green-900/50 border border-green-400 rounded">
            <div className="flex items-center gap-2">
              <div className="size-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-green-300 font-medium">Executing script...</span>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Processing emails → Extracting data → Updating sheets...
            </div>
          </div>
        )}
        
        {isActive && data?.completed && (
          <div className="mt-4 p-3 bg-blue-900/50 border border-blue-400 rounded">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-blue-400" />
              <span className="text-blue-300 font-medium">Execution completed!</span>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Processed 3 emails • Added 3 rows to sheet • Sent 3 confirmations
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);

const CalendarInterface = ({ isActive, data, highlights }: { 
  isActive: boolean; 
  data?: any; 
  highlights?: string[]; 
}) => (
  <div className={`border rounded-lg bg-white shadow-2xl transition-all duration-500 ${
    isActive ? 'scale-105 shadow-2xl' : 'scale-100'
  }`}>
    {/* Calendar Header */}
    <div className="bg-[#4285F4] text-white p-3 rounded-t-lg flex items-center gap-2">
      <Calendar className="size-5" />
      <span className="font-semibold">Google Calendar</span>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm bg-white/20 px-2 py-1 rounded">
          December 2025
        </span>
        <Settings className="size-4 cursor-pointer hover:bg-white/10 p-1 rounded" />
      </div>
    </div>
    
    {/* Calendar Content */}
    <div className="p-4">
      <div className="grid grid-cols-7 gap-2 mb-4">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-600 p-2">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {[...Array(35)].map((_, i) => {
          const date = i - 5 + 1; // Start from Dec 1
          const isToday = date === 20;
          const hasEvent = [15, 20, 28].includes(date);
          const isTargetDate = date === 28;
          
          return (
            <div 
              key={i} 
              className={`
                min-h-16 p-2 border rounded cursor-pointer transition-all duration-300
                ${date <= 0 || date > 31 ? 'text-gray-300' : ''}
                ${isToday ? 'bg-blue-100 border-blue-300 font-bold' : 'hover:bg-gray-50'}
                ${isTargetDate && highlights?.includes('target-date') ? 'ring-2 ring-yellow-300 animate-pulse' : ''}
                ${highlights?.includes('time-slot') && hasEvent ? 'ring-2 ring-green-300' : ''}
              `}
            >
              {date > 0 && date <= 31 && (
                <>
                  <div className="text-sm">{date}</div>
                  {hasEvent && (
                    <div className={`text-xs mt-1 p-1 rounded ${
                      date === 28 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {date === 28 ? 'Available' : date === 20 ? 'Meeting' : 'Busy'}
                    </div>
                  )}
                  {data?.newEvent && isTargetDate && (
                    <div className="text-xs mt-1 p-1 rounded bg-purple-100 text-purple-700 animate-pulse">
                      {data.newEvent.title.split(' - ')[0]}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      
      {isActive && data?.calendarEvents && (
        <div className="mt-4 space-y-2">
          <h4 className="font-medium text-sm text-gray-700">Available Time Slots:</h4>
          {data.calendarEvents.map((event: any, idx: number) => (
            <div key={idx} className={`p-2 rounded border ${
              event.available 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{event.time}</span>
                <span className="text-xs">{event.title}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const DriveInterface = ({ isActive, data, highlights }: { 
  isActive: boolean; 
  data?: any; 
  highlights?: string[]; 
}) => (
  <div className={`border rounded-lg bg-white shadow-2xl transition-all duration-500 ${
    isActive ? 'scale-105 shadow-2xl' : 'scale-100'
  }`}>
    {/* Drive Header */}
    <div className="bg-[#FBBC04] text-white p-3 rounded-t-lg flex items-center gap-2">
      <FolderOpen className="size-5" />
      <span className="font-semibold">Google Drive</span>
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span>Storage: 8.2 GB / 15 GB</span>
        </div>
        <Settings className="size-4 cursor-pointer hover:bg-yellow-600/20 p-1 rounded" />
      </div>
    </div>
    
    {/* Drive Navigation */}
    <div className="bg-gray-50 p-2 border-b flex items-center gap-2">
      <Button size="sm" variant="ghost" className="text-xs">My Drive</Button>
      <span className="text-gray-400">/</span>
      <Button size="sm" variant="ghost" className={`text-xs ${
        highlights?.includes('inbox-folder') ? 'ring-2 ring-blue-400' : ''
      }`}>
        Inbox
      </Button>
    </div>
    
    {/* Drive Content */}
    <div className="p-4">
      <div className="space-y-3">
        {data?.files?.map((file: any, idx: number) => (
          <div key={idx} className={`p-3 border rounded-lg transition-all duration-300 cursor-pointer ${
            file.processing ? 'bg-blue-50 border-blue-300 animate-pulse' : 'hover:bg-gray-50'
          } ${highlights?.includes(`file-${idx}`) ? 'ring-2 ring-yellow-300 animate-pulse' : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-lg flex items-center justify-center ${
                file.type === 'PDF' ? 'bg-red-100 text-red-600' :
                file.type === 'DOC' ? 'bg-blue-100 text-blue-600' :
                file.type === 'XLS' ? 'bg-green-100 text-green-600' :
                file.type === 'PPT' ? 'bg-orange-100 text-orange-600' :
                'bg-gray-100 text-gray-600'
              }`}>
                {file.type === 'PDF' ? '📄' :
                 file.type === 'DOC' ? '📝' :
                 file.type === 'XLS' ? '📊' :
                 file.type === 'PPT' ? '📽️' : '📁'}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{file.name}</div>
                <div className="text-xs text-gray-500">{file.size} • {file.date}</div>
                {file.folder && (
                  <div className="text-xs text-blue-600 mt-1">Moving to: {file.folder}</div>
                )}
              </div>
              {file.processing && (
                <div className="size-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>
        ))}
        
        {data?.organizing && (
          <div className="p-3 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50">
            <div className="flex items-center gap-3">
              <div className="size-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-blue-700">
                Organizing files by type and date...
              </span>
            </div>
          </div>
        )}
        
        {data?.folderStructure && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-medium text-sm text-green-800 mb-2">Files Organized:</h4>
            {data.folderStructure.map((folder: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-sm text-green-700">
                <span>📁 {folder.name}</span>
                <span>{folder.fileCount} files</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

export default function RealisticScreenDemo({ 
  automationId, 
  onClose 
}: { 
  automationId: string; 
  onClose: () => void; 
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursor, setCursor] = useState<CursorState>({
    x: 100,
    y: 100,
    isClicking: false,
    isTyping: false,
    isDragging: false,
    isVisible: true
  });
  const [interfaceData, setInterfaceData] = useState<any>({});
  const [highlights, setHighlights] = useState<string[]>([]);
  const [currentInterface, setCurrentInterface] = useState<string>('gmail');

  // Demo scenarios for each automation type
  const getDemoSteps = (automationId: string): DemoStep[] => {
    switch (automationId) {
      case 'email-automation':
        return [
          {
            id: 'open-gmail',
            title: 'Opening Gmail',
            description: 'User opens Gmail to check for new lead emails',
            duration: 2000,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 150, y: 80, duration: 800 }],
              clicks: [{ x: 150, y: 80, delay: 500 }],
              highlights: [{ target: 'inbox', duration: 1000 }]
            },
            dataChanges: {
              emails: [
                { 
                  from: 'John Smith', 
                  subject: 'Inquiry about web development services', 
                  preview: 'Hi, I need a quote for a new website project...',
                  time: '2 min ago',
                  unread: true,
                  selected: false
                },
                { 
                  from: 'Sarah Johnson', 
                  subject: 'Product demo request', 
                  preview: 'Could we schedule a demo of your automation platform?',
                  time: '5 min ago',
                  unread: true,
                  selected: false
                },
                { 
                  from: 'Michael Chen', 
                  subject: 'Partnership opportunity', 
                  preview: 'We have an interesting partnership proposal...',
                  time: '1 hour ago',
                  unread: true,
                  selected: false
                }
              ],
              unreadCount: 12,
              leadCount: 3
            }
          },
          {
            id: 'search-leads',
            title: 'Searching for Lead Emails',
            description: 'User searches for emails with lead-related keywords',
            duration: 3000,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 400, y: 100, duration: 500 }],
              clicks: [{ x: 400, y: 100, delay: 200 }],
              typing: { text: 'label:leads is:unread', delay: 800, speed: 100 },
              highlights: [{ target: 'search-bar', duration: 2000 }]
            },
            dataChanges: {
              searchQuery: 'label:leads is:unread',
              emails: [
                { 
                  from: 'John Smith', 
                  subject: 'Inquiry about web development services', 
                  preview: 'Hi, I need a quote for a new website project...',
                  time: '2 min ago',
                  unread: true,
                  selected: true
                }
              ]
            }
          },
          {
            id: 'process-email',
            title: 'Processing Email Data',
            description: 'Script automatically extracts data from the selected email',
            duration: 2500,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 300, y: 200, duration: 400 }],
              clicks: [{ x: 300, y: 200, delay: 200 }],
              highlights: [{ target: 'email-0', duration: 2000 }]
            },
            dataChanges: {
              processingEmail: true,
              emails: [
                { 
                  from: 'John Smith', 
                  subject: 'Inquiry about web development services', 
                  preview: 'Hi, I need a quote for a new website project...',
                  time: '2 min ago',
                  unread: true,
                  selected: true
                }
              ]
            }
          },
          {
            id: 'open-sheets',
            title: 'Opening Google Sheets',
            description: 'Script opens the lead management spreadsheet',
            duration: 2000,
            interface: 'sheets',
            cursorActions: {
              move: [{ x: 200, y: 100, duration: 600 }],
              clicks: [],
              highlights: [{ target: 'share-button', duration: 1000 }]
            },
            dataChanges: {
              sheetName: 'Lead_Management_System',
              rows: [
                { date: '2025-08-18', subject: 'Service inquiry', from: 'alice@company.com', phone: '+1-555-0101' },
                { date: '2025-08-19', subject: 'Quote request', from: 'bob@startup.com', phone: '+1-555-0102' },
                { date: '2025-08-20', subject: 'Demo request', from: 'carol@enterprise.com', phone: '+1-555-0103' }
              ]
            }
          },
          {
            id: 'add-data',
            title: 'Adding Email Data to Sheet',
            description: 'Extracted email data is automatically added to the spreadsheet',
            duration: 3000,
            interface: 'sheets',
            cursorActions: {
              move: [{ x: 300, y: 250, duration: 500 }],
              clicks: [],
              highlights: [{ target: 'row-3', duration: 2000 }]
            },
            dataChanges: {
              addingRow: true,
              rows: [
                { date: '2025-08-18', subject: 'Service inquiry', from: 'alice@company.com', phone: '+1-555-0101' },
                { date: '2025-08-19', subject: 'Quote request', from: 'bob@startup.com', phone: '+1-555-0102' },
                { date: '2025-08-20', subject: 'Demo request', from: 'carol@enterprise.com', phone: '+1-555-0103' },
                { 
                  date: '2025-08-20', 
                  subject: 'Inquiry about web development services', 
                  from: 'john.smith@company.com', 
                  phone: '+1-555-0199',
                  isNew: true
                }
              ]
            }
          },
          {
            id: 'run-script',
            title: 'Running the Automation Script',
            description: 'User clicks Run in Google Apps Script to execute the automation',
            duration: 4000,
            interface: 'script-editor',
            cursorActions: {
              move: [{ x: 150, y: 120, duration: 800 }],
              clicks: [{ x: 150, y: 120, delay: 500 }],
              highlights: [{ target: 'run-button', duration: 3000 }]
            },
            dataChanges: {
              projectName: 'Email_Automation_Script',
              executing: true
            }
          },
          {
            id: 'complete',
            title: 'Automation Complete',
            description: 'Script execution completes successfully with summary',
            duration: 2000,
            interface: 'script-editor',
            cursorActions: {
              move: [],
              clicks: [],
              highlights: []
            },
            dataChanges: {
              executing: false,
              completed: true
            }
          }
        ];
      
      case 'report-generator':
        return [
          {
            id: 'open-sheets-data',
            title: 'Opening Data Spreadsheet',
            description: 'User opens Google Sheets containing sales data for report generation',
            duration: 2000,
            interface: 'sheets',
            cursorActions: {
              move: [{ x: 200, y: 100, duration: 800 }],
              clicks: [{ x: 200, y: 100, delay: 500 }],
              highlights: [{ target: 'share-button', duration: 1000 }]
            },
            dataChanges: {
              sheetName: 'Sales_Data_Q4_2025',
              rows: [
                { date: '2025-10-15', subject: 'Product A Sales', from: '$45,200', phone: 'Q4' },
                { date: '2025-11-20', subject: 'Product B Sales', from: '$32,800', phone: 'Q4' },
                { date: '2025-12-10', subject: 'Product C Sales', from: '$67,500', phone: 'Q4' },
                { date: '2025-12-15', subject: 'Holiday Campaign', from: '$89,300', phone: 'Q4' }
              ]
            }
          },
          {
            id: 'select-data-range',
            title: 'Selecting Report Data Range',
            description: 'User selects the data range for automated report generation',
            duration: 2500,
            interface: 'sheets',
            cursorActions: {
              move: [{ x: 150, y: 180, duration: 400 }, { x: 450, y: 300, duration: 600 }],
              clicks: [{ x: 150, y: 180, delay: 200 }],
              highlights: [{ target: 'row-0', duration: 1500 }, { target: 'row-3', duration: 1000 }]
            },
            dataChanges: {
              rows: [
                { date: '2025-10-15', subject: 'Product A Sales', from: '$45,200', phone: 'Q4', isNew: true },
                { date: '2025-11-20', subject: 'Product B Sales', from: '$32,800', phone: 'Q4', isNew: true },
                { date: '2025-12-10', subject: 'Product C Sales', from: '$67,500', phone: 'Q4', isNew: true },
                { date: '2025-12-15', subject: 'Holiday Campaign', from: '$89,300', phone: 'Q4', isNew: true }
              ]
            }
          },
          {
            id: 'run-report-script',
            title: 'Running Report Generation Script',
            description: 'User clicks Run in Google Apps Script to generate the PDF report',
            duration: 4000,
            interface: 'script-editor',
            cursorActions: {
              move: [{ x: 150, y: 120, duration: 800 }],
              clicks: [{ x: 150, y: 120, delay: 500 }],
              highlights: [{ target: 'run-button', duration: 3000 }]
            },
            dataChanges: {
              projectName: 'Automated_Report_Generator',
              executing: true
            }
          },
          {
            id: 'email-report',
            title: 'Emailing Generated Report',
            description: 'Script automatically emails the PDF report to stakeholders',
            duration: 3000,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 300, y: 200, duration: 600 }],
              clicks: [],
              highlights: [{ target: 'compose', duration: 2000 }]
            },
            dataChanges: {
              emails: [
                { 
                  from: 'Automated Reports <reports@company.com>', 
                  subject: 'Q4 Sales Performance Report - Dec 2025', 
                  preview: 'Please find attached the quarterly sales report...',
                  time: 'just now',
                  unread: false,
                  selected: true
                }
              ]
            }
          }
        ];

      case 'calendar-booking':
        return [
          {
            id: 'form-submission',
            title: 'Client Booking Form Submission',
            description: 'Client submits a booking request through Google Forms',
            duration: 2000,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 200, y: 150, duration: 800 }],
              clicks: [{ x: 200, y: 150, delay: 500 }],
              highlights: [{ target: 'inbox', duration: 1000 }]
            },
            dataChanges: {
              emails: [
                { 
                  from: 'Google Forms <forms-noreply@google.com>', 
                  subject: 'New consultation booking request', 
                  preview: 'Sarah Johnson has requested a consultation for Dec 28, 2025...',
                  time: '1 min ago',
                  unread: true,
                  selected: true
                }
              ]
            }
          },
          {
            id: 'check-calendar',
            title: 'Checking Calendar Availability',
            description: 'Script automatically checks Google Calendar for availability',
            duration: 2500,
            interface: 'calendar',
            cursorActions: {
              move: [{ x: 300, y: 200, duration: 600 }],
              clicks: [],
              highlights: [{ target: 'time-slot', duration: 2000 }]
            },
            dataChanges: {
              calendarEvents: [
                { time: '10:00 AM', title: 'Available', available: true },
                { time: '11:00 AM', title: 'Team Meeting', available: false },
                { time: '2:00 PM', title: 'Available', available: true }
              ]
            }
          },
          {
            id: 'create-appointment',
            title: 'Creating Calendar Appointment',
            description: 'Script creates the appointment and sends confirmation',
            duration: 3000,
            interface: 'calendar',
            cursorActions: {
              move: [{ x: 250, y: 300, duration: 500 }],
              clicks: [{ x: 250, y: 300, delay: 200 }],
              highlights: [{ target: 'create-event', duration: 2000 }]
            },
            dataChanges: {
              newEvent: {
                title: 'Consultation - Sarah Johnson',
                time: '2:00 PM - 3:00 PM',
                date: 'Dec 28, 2025',
                status: 'confirmed'
              }
            }
          },
          {
            id: 'send-confirmation',
            title: 'Sending Confirmation Email',
            description: 'Automated confirmation email with Google Meet link sent to client',
            duration: 2000,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 400, y: 200, duration: 600 }],
              clicks: [],
              highlights: [{ target: 'compose', duration: 1500 }]
            },
            dataChanges: {
              emails: [
                { 
                  from: 'Booking System <bookings@company.com>', 
                  subject: 'Consultation Confirmed - Dec 28, 2:00 PM', 
                  preview: 'Your consultation has been confirmed. Google Meet link: meet.google.com/xyz-abc-def',
                  time: 'sending...',
                  unread: false,
                  selected: false
                }
              ]
            }
          }
        ];

      case 'file-organizer':
        return [
          {
            id: 'scan-drive-files',
            title: 'Scanning Google Drive Files',
            description: 'Script scans the inbox folder for new unorganized files',
            duration: 2000,
            interface: 'drive',
            cursorActions: {
              move: [{ x: 200, y: 150, duration: 800 }],
              clicks: [{ x: 200, y: 150, delay: 500 }],
              highlights: [{ target: 'inbox-folder', duration: 1000 }]
            },
            dataChanges: {
              files: [
                { name: 'project_proposal_v2.pdf', type: 'PDF', size: '2.4 MB', date: 'Dec 20, 2025' },
                { name: 'client_meeting_notes.docx', type: 'DOC', size: '156 KB', date: 'Dec 20, 2025' },
                { name: 'budget_spreadsheet.xlsx', type: 'XLS', size: '892 KB', date: 'Dec 19, 2025' },
                { name: 'presentation_draft.pptx', type: 'PPT', size: '15.2 MB', date: 'Dec 19, 2025' }
              ]
            }
          },
          {
            id: 'categorize-files',
            title: 'Categorizing Files by Type',
            description: 'Script automatically categorizes files by type and date',
            duration: 3000,
            interface: 'drive',
            cursorActions: {
              move: [{ x: 300, y: 250, duration: 600 }],
              clicks: [],
              highlights: [{ target: 'file-0', duration: 1000 }, { target: 'file-1', duration: 1000 }]
            },
            dataChanges: {
              organizing: true,
              files: [
                { name: 'project_proposal_v2.pdf', type: 'PDF', folder: 'Documents/2025/12/', processing: true },
                { name: 'client_meeting_notes.docx', type: 'DOC', folder: 'Documents/2025/12/', processing: true },
                { name: 'budget_spreadsheet.xlsx', type: 'XLS', folder: 'Spreadsheets/2025/12/', processing: true },
                { name: 'presentation_draft.pptx', type: 'PPT', folder: 'Presentations/2025/12/', processing: true }
              ]
            }
          },
          {
            id: 'move-files',
            title: 'Moving Files to Organized Folders',
            description: 'Files are moved to their appropriate categorized folders',
            duration: 2500,
            interface: 'drive',
            cursorActions: {
              move: [{ x: 350, y: 200, duration: 500 }],
              clicks: [],
              highlights: [{ target: 'folder-structure', duration: 2000 }]
            },
            dataChanges: {
              organizing: false,
              organized: true,
              folderStructure: [
                { name: 'Documents/2025/12/', fileCount: 2 },
                { name: 'Spreadsheets/2025/12/', fileCount: 1 },
                { name: 'Presentations/2025/12/', fileCount: 1 }
              ]
            }
          }
        ];

      case 'form-automation':
        return [
          {
            id: 'form-response',
            title: 'New Form Response Received',
            description: 'Customer submits contact form with inquiry details',
            duration: 2000,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 180, y: 120, duration: 800 }],
              clicks: [{ x: 180, y: 120, delay: 500 }],
              highlights: [{ target: 'inbox', duration: 1000 }]
            },
            dataChanges: {
              emails: [
                { 
                  from: 'Contact Form <noreply@website.com>', 
                  subject: 'New Contact Form Submission - Quote Request', 
                  preview: 'Name: Michael Chen, Email: michael@techstartup.com, Service: Web Development...',
                  time: '30 seconds ago',
                  unread: true,
                  selected: true
                }
              ]
            }
          },
          {
            id: 'extract-form-data',
            title: 'Extracting Form Data',
            description: 'Script parses form submission and extracts key information',
            duration: 2500,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 300, y: 180, duration: 500 }],
              clicks: [{ x: 300, y: 180, delay: 200 }],
              highlights: [{ target: 'email-0', duration: 2000 }]
            },
            dataChanges: {
              processingEmail: true,
              extractedData: {
                name: 'Michael Chen',
                email: 'michael@techstartup.com',
                service: 'Web Development',
                budget: '$50,000',
                timeline: '3 months'
              }
            }
          },
          {
            id: 'add-to-crm-sheet',
            title: 'Adding Lead to CRM Sheet',
            description: 'Extracted data is automatically added to the lead management spreadsheet',
            duration: 3000,
            interface: 'sheets',
            cursorActions: {
              move: [{ x: 250, y: 200, duration: 600 }],
              clicks: [],
              highlights: [{ target: 'row-4', duration: 2000 }]
            },
            dataChanges: {
              sheetName: 'Lead_Management_CRM',
              addingRow: true,
              rows: [
                { date: '2025-12-18', subject: 'Web Dev Quote', from: 'alice@company.com', phone: '+1-555-0101' },
                { date: '2025-12-19', subject: 'App Development', from: 'bob@startup.com', phone: '+1-555-0102' },
                { date: '2025-12-20', subject: 'E-commerce Site', from: 'carol@retail.com', phone: '+1-555-0103' },
                { date: '2025-12-20', subject: 'Web Development', from: 'michael@techstartup.com', phone: '+1-555-0199', isNew: true }
              ]
            }
          },
          {
            id: 'send-auto-reply',
            title: 'Sending Personalized Auto-Reply',
            description: 'Script sends a personalized response with next steps',
            duration: 2000,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 350, y: 220, duration: 600 }],
              clicks: [],
              highlights: [{ target: 'compose', duration: 1500 }]
            },
            dataChanges: {
              emails: [
                { 
                  from: 'Sales Team <sales@company.com>', 
                  subject: 'Re: Quote Request - Next Steps for Your Web Development Project', 
                  preview: 'Hi Michael, Thank you for your interest in our web development services...',
                  time: 'sending...',
                  unread: false,
                  selected: false
                }
              ]
            }
          }
        ];

      case 'workflow-automation':
        return [
          {
            id: 'task-reminder',
            title: 'Task Deadline Approaching',
            description: 'Script checks calendar and identifies tasks with approaching deadlines',
            duration: 2000,
            interface: 'calendar',
            cursorActions: {
              move: [{ x: 250, y: 150, duration: 800 }],
              clicks: [],
              highlights: [{ target: 'deadline-task', duration: 1000 }]
            },
            dataChanges: {
              tasks: [
                { title: 'Project Proposal Due', deadline: 'Tomorrow', status: 'pending', urgent: true },
                { title: 'Client Meeting Prep', deadline: 'Dec 22', status: 'in-progress', urgent: false },
                { title: 'Budget Review', deadline: 'Dec 23', status: 'pending', urgent: false }
              ]
            }
          },
          {
            id: 'create-reminder-email',
            title: 'Creating Reminder Notification',
            description: 'Script composes reminder email with task details and deadlines',
            duration: 2500,
            interface: 'gmail',
            cursorActions: {
              move: [{ x: 320, y: 180, duration: 600 }],
              clicks: [{ x: 320, y: 180, delay: 300 }],
              highlights: [{ target: 'compose', duration: 2000 }]
            },
            dataChanges: {
              composingEmail: true,
              emailDraft: {
                to: 'team@company.com',
                subject: 'Urgent: Project Proposal Deadline Tomorrow',
                body: 'Reminder: The project proposal is due tomorrow. Please review and submit...'
              }
            }
          },
          {
            id: 'update-task-tracker',
            title: 'Updating Task Tracker Sheet',
            description: 'Script logs the reminder action in the project tracking spreadsheet',
            duration: 2000,
            interface: 'sheets',
            cursorActions: {
              move: [{ x: 280, y: 220, duration: 500 }],
              clicks: [],
              highlights: [{ target: 'row-2', duration: 1500 }]
            },
            dataChanges: {
              sheetName: 'Project_Task_Tracker',
              rows: [
                { date: '2025-12-20', subject: 'Proposal Draft', from: 'In Progress', phone: 'John D.' },
                { date: '2025-12-20', subject: 'Client Review', from: 'Pending', phone: 'Sarah M.' },
                { date: '2025-12-20', subject: 'Reminder Sent', from: 'Completed', phone: 'Auto', isNew: true }
              ]
            }
          }
        ];

      default:
        return [];
    }
  };

  const steps = getDemoSteps(automationId);
  const currentStepData = steps[currentStep];

  // Execute a demo step
  const playStep = async (step: DemoStep) => {
    setCurrentInterface(step.interface);
    setInterfaceData(step.dataChanges || {});
    
    // Move cursor
    for (const move of step.cursorActions.move) {
      setCursor((prev: CursorState) => ({ ...prev, x: move.x, y: move.y }));
      await new Promise(resolve => setTimeout(resolve, move.duration));
    }
    
    // Execute clicks
    for (const click of step.cursorActions.clicks) {
      await new Promise(resolve => setTimeout(resolve, click.delay));
      setCursor((prev: CursorState) => ({ ...prev, x: click.x, y: click.y, isClicking: true }));
      await new Promise(resolve => setTimeout(resolve, 200));
      setCursor((prev: CursorState) => ({ ...prev, isClicking: false }));
    }
    
    // Handle typing
    if (step.cursorActions.typing) {
      const { text, delay, speed } = step.cursorActions.typing;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      setCursor((prev: CursorState) => ({ ...prev, isTyping: true }));
      for (let i = 0; i <= text.length; i++) {
        setInterfaceData((prev: any) => ({
          ...prev,
          searchQuery: text.substring(0, i)
        }));
        await new Promise(resolve => setTimeout(resolve, speed));
      }
      setCursor((prev: CursorState) => ({ ...prev, isTyping: false }));
    }
    
    // Apply highlights
    if (step.cursorActions.highlights) {
      for (const highlight of step.cursorActions.highlights) {
        setHighlights([highlight.target]);
        await new Promise(resolve => setTimeout(resolve, highlight.duration));
        setHighlights([]);
      }
    }
  };

  // Auto-play demo
  useEffect(() => {
    if (isPlaying && currentStep < steps.length) {
      const timer = setTimeout(async () => {
        await playStep(steps[currentStep]);
        setCurrentStep(prev => prev + 1);
      }, 1000);
      
      return () => clearTimeout(timer);
    } else if (currentStep >= steps.length) {
      setIsPlaying(false);
      setCurrentStep(0);
    }
  }, [isPlaying, currentStep, steps]);

  const renderCurrentInterface = () => {
    switch (currentInterface) {
      case 'gmail':
        return <GmailInterface isActive={isPlaying} data={interfaceData} highlights={highlights} />;
      case 'sheets':
        return <SheetsInterface isActive={isPlaying} data={interfaceData} highlights={highlights} />;
      case 'script-editor':
        return <ScriptEditorInterface isActive={isPlaying} data={interfaceData} highlights={highlights} />;
      case 'calendar':
        return <CalendarInterface isActive={isPlaying} data={interfaceData} highlights={highlights} />;
      case 'drive':
        return <DriveInterface isActive={isPlaying} data={interfaceData} highlights={highlights} />;
      default:
        return <GmailInterface isActive={isPlaying} data={interfaceData} highlights={highlights} />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Demo Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Live Demo: {currentStepData?.title || 'Email Automation'}</h2>
            <p className="text-sm opacity-90">
              {currentStepData?.description || 'Watch how the automation works in real-time'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsPlaying(!isPlaying)}
              className="bg-white text-black hover:bg-gray-100"
            >
              <Play className="size-4 mr-1" />
              {isPlaying ? 'Pause' : 'Play Demo'}
            </Button>
            <Button onClick={onClose} variant="ghost" className="text-white hover:bg-white/10">
              ✕
            </Button>
          </div>
        </div>
        
        {/* Demo Progress */}
        <div className="bg-gray-50 p-3 border-b">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium">Progress:</span>
            <span className="text-sm text-gray-600">
              Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / steps.length) * 100}%` }}
            />
          </div>
        </div>
        
        {/* Demo Interface */}
        <div className="relative p-6 bg-gray-100 min-h-[500px]">
          <MouseCursor cursor={cursor} />
          {renderCurrentInterface()}
        </div>
        
        {/* Demo Controls */}
        <div className="bg-white p-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              variant="outline"
              size="sm"
            >
              Previous
            </Button>
            <Button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              disabled={currentStep >= steps.length - 1}
              variant="outline"
              size="sm"
            >
              Next
            </Button>
          </div>
          <div className="text-sm text-gray-600">
            This demo shows exactly how users interact with Google Workspace apps
          </div>
        </div>
      </div>
    </div>
  );
}