import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Brain, Code, Download, Wand2, Sparkles, 
  CheckCircle, AlertTriangle, Copy, Zap 
} from 'lucide-react';

interface ScriptGeneratorProps {
  onGenerate?: (script: string, config: any) => void;
}

export const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({ onGenerate }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');
  const [progress, setProgress] = useState(0);
  const [analysisResults, setAnalysisResults] = useState<any>(null);

  const generateScript = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setProgress(0);
    setAnalysisResults(null);
    
    try {
      // Simulate AI analysis and generation process
      const steps = [
        { message: 'Analyzing your requirements...', duration: 1000 },
        { message: 'Identifying Google services needed...', duration: 1500 },
        { message: 'Generating automation logic...', duration: 2000 },
        { message: 'Optimizing code structure...', duration: 1200 },
        { message: 'Adding error handling...', duration: 800 },
        { message: 'Finalizing script...', duration: 500 }
      ];
      
      for (let i = 0; i < steps.length; i++) {
        setProgress(((i + 1) / steps.length) * 100);
        await new Promise(resolve => setTimeout(resolve, steps[i].duration));
      }
      
      // Generate analysis results
      const analysis = analyzePrompt(prompt);
      setAnalysisResults(analysis);
      
      // Generate actual script
      const script = generateGoogleAppsScript(prompt, analysis);
      setGeneratedScript(script);
      
      onGenerate?.(script, analysis);
      
    } catch (error) {
      console.error('Script generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const analyzePrompt = (userPrompt: string) => {
    // AI-powered prompt analysis simulation
    const services = [];
    const complexity = Math.random() > 0.5 ? 'Medium' : 'High';
    const estimatedTime = Math.floor(Math.random() * 30) + 5;
    
    // Detect services mentioned
    if (userPrompt.toLowerCase().includes('gmail') || userPrompt.toLowerCase().includes('email')) {
      services.push({ name: 'Gmail API', confidence: 95, required: true });
    }
    if (userPrompt.toLowerCase().includes('sheet') || userPrompt.toLowerCase().includes('spreadsheet')) {
      services.push({ name: 'Google Sheets API', confidence: 90, required: true });
    }
    if (userPrompt.toLowerCase().includes('calendar')) {
      services.push({ name: 'Google Calendar API', confidence: 88, required: true });
    }
    if (userPrompt.toLowerCase().includes('drive') || userPrompt.toLowerCase().includes('file')) {
      services.push({ name: 'Google Drive API', confidence: 85, required: true });
    }
    
    // Add common auxiliary services
    if (services.length > 1) {
      services.push({ name: 'Utilities Service', confidence: 70, required: false });
    }
    
    return {
      services,
      complexity,
      estimatedTime,
      features: extractFeatures(userPrompt),
      recommendations: generateRecommendations(userPrompt)
    };
  };

  const extractFeatures = (prompt: string) => {
    const features = [];
    
    if (prompt.toLowerCase().includes('automat')) features.push('Automation');
    if (prompt.toLowerCase().includes('schedul')) features.push('Scheduling');
    if (prompt.toLowerCase().includes('notif')) features.push('Notifications');
    if (prompt.toLowerCase().includes('data') || prompt.toLowerCase().includes('extract')) features.push('Data Processing');
    if (prompt.toLowerCase().includes('report')) features.push('Reporting');
    if (prompt.toLowerCase().includes('ai') || prompt.toLowerCase().includes('smart')) features.push('AI Enhancement');
    
    return features;
  };

  const generateRecommendations = (prompt: string) => {
    return [
      'Add error handling for API rate limits',
      'Implement data validation before processing',
      'Consider adding logging for debugging',
      'Set up proper authorization scopes'
    ];
  };

  const generateGoogleAppsScript = (prompt: string, analysis: any) => {
    // This would integrate with an actual LLM API in production
    return `/**
 * Auto-generated Google Apps Script
 * Based on: "${prompt}"
 * Generated with AI assistance
 */

function main() {
  try {
    console.log('Starting automation...');
    
    // Initialize services
    ${analysis.services.map((service: any) => 
      service.name.includes('Gmail') ? 'const gmail = GmailApp;' :
      service.name.includes('Sheets') ? 'const sheets = SpreadsheetApp;' :
      service.name.includes('Calendar') ? 'const calendar = CalendarApp;' :
      service.name.includes('Drive') ? 'const drive = DriveApp;' : ''
    ).filter(Boolean).join('\n    ')}
    
    // Main automation logic
    ${generateMainLogic(prompt, analysis)}
    
    console.log('Automation completed successfully!');
    
  } catch (error) {
    console.error('Automation failed:', error);
    throw error;
  }
}

${generateHelperFunctions(analysis)}

// Trigger setup (uncomment to enable)
// function createTimeDrivenTrigger() {
//   ScriptApp.newTrigger('main')
//     .timeBased()
//     .everyHours(1)
//     .create();
// }`;
  };

  const generateMainLogic = (prompt: string, analysis: any) => {
    if (prompt.toLowerCase().includes('email') && prompt.toLowerCase().includes('sheet')) {
      return `// Process emails and update spreadsheet
    const emails = gmail.getInboxThreads(0, 10);
    const spreadsheet = sheets.openById('YOUR_SPREADSHEET_ID');
    const sheet = spreadsheet.getActiveSheet();
    
    emails.forEach(thread => {
      const messages = thread.getMessages();
      messages.forEach(message => {
        if (message.isUnread()) {
          const data = extractDataFromEmail(message);
          addDataToSheet(sheet, data);
          message.markRead();
        }
      });
    });`;
    }
    
    return `// Custom automation logic based on your requirements
    // TODO: Implement specific functionality for: ${analysis.features.join(', ')}`;
  };

  const generateHelperFunctions = (analysis: any) => {
    return `
/**
 * Extract structured data from email content
 */
function extractDataFromEmail(message) {
  const subject = message.getSubject();
  const body = message.getPlainBody();
  const sender = message.getFrom();
  
  // AI-powered data extraction would go here
  // For now, returning basic email info
  return {
    subject: subject,
    sender: sender,
    date: message.getDate(),
    content: body.substring(0, 100) + '...'
  };
}

/**
 * Add extracted data to spreadsheet
 */
function addDataToSheet(sheet, data) {
  const newRow = [
    data.date,
    data.sender,
    data.subject,
    data.content
  ];
  
  sheet.appendRow(newRow);
}

/**
 * Send notification email
 */
function sendNotification(message, recipients) {
  recipients.forEach(recipient => {
    GmailApp.sendEmail(recipient, 'Automation Update', message);
  });
}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedScript);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy script:', error);
    }
  };

  const downloadScript = () => {
    const blob = new Blob([generatedScript], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'automation-script.gs';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-5" />
            AI Script Generator
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Describe what you want to automate, and our AI will generate a complete Google Apps Script for you.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Describe your automation needs:</label>
            <Textarea
              placeholder="Example: I want to automatically extract invoice data from Gmail emails and add them to a Google Sheet, then send notifications to my team..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          
          <Button 
            onClick={generateScript}
            disabled={!prompt.trim() || isGenerating}
            className="w-full hover-glow"
            size="lg"
          >
            <Wand2 className="size-4 mr-2" />
            {isGenerating ? 'Generating Script...' : 'Generate Script with AI'}
          </Button>
          
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>AI is analyzing and generating your script...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {analysisResults && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5" />
              AI Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Detected Services:</h4>
                <div className="space-y-2">
                  {analysisResults.services.map((service: any, index: number) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm">{service.name}</span>
                      <Badge variant={service.required ? "default" : "secondary"}>
                        {service.confidence}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-2">Project Details:</h4>
                <div className="space-y-1 text-sm">
                  <div>Complexity: <Badge>{analysisResults.complexity}</Badge></div>
                  <div>Est. Development: {analysisResults.estimatedTime} minutes</div>
                  <div>Features: {analysisResults.features.join(', ')}</div>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Recommendations:</h4>
              <ul className="space-y-1">
                {analysisResults.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="text-sm flex items-start gap-2">
                    <CheckCircle className="size-3 text-green-500 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {generatedScript && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="size-5" />
              Generated Script
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="size-4 mr-1" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={downloadScript}>
                <Download className="size-4 mr-1" />
                Download
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm">
                <code>{generatedScript}</code>
              </pre>
            </div>
            
            <Alert className="mt-4">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                <strong>Next Steps:</strong> Copy this script to Google Apps Script editor, replace placeholder IDs with your actual spreadsheet/document IDs, and test thoroughly before deploying.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ScriptGenerator;