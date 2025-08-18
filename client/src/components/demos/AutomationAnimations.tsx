import { useState, useEffect } from "react";
import { Mail, FileSpreadsheet, FileText, ArrowRight, CheckCircle2, Clock } from "lucide-react";

// Animation component for Forms → Sheets → Gmail
export const FormsToGmailAnimation = () => {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => (prev + 1) % 4);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between p-4 min-h-[120px] relative">
      <div className={`flex flex-col items-center transition-all duration-500 ${step >= 0 ? 'scale-110' : 'scale-100'}`}>
        <div className={`size-12 rounded-lg flex items-center justify-center mb-2 transition-all duration-500 ${
          step >= 0 ? 'bg-blue-100 text-blue-600 shadow-lg' : 'bg-secondary/50 text-muted-foreground'
        }`}>
          📝
        </div>
        <span className="text-xs text-center font-medium">Form<br/>Submission</span>
        {step >= 0 && <div className="w-1 h-1 bg-primary rounded-full mt-1 animate-pulse"></div>}
      </div>
      
      <div className={`progress-flow transition-all duration-300 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
        <ArrowRight className="size-6" />
      </div>
      
      <div className={`flex flex-col items-center transition-all duration-500 ${step >= 1 ? 'scale-110' : 'scale-100'}`}>
        <div className={`size-12 rounded-lg flex items-center justify-center mb-2 transition-all duration-500 ${
          step >= 1 ? 'bg-green-100 text-green-600 shadow-lg' : 'bg-secondary/50 text-muted-foreground'
        }`}>
          <FileSpreadsheet className="size-6" />
        </div>
        <span className="text-xs text-center font-medium">Auto-Added<br/>to Sheets</span>
        {step >= 1 && <div className="w-1 h-1 bg-primary rounded-full mt-1 animate-pulse"></div>}
      </div>
      
      <div className={`progress-flow transition-all duration-300 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
        <ArrowRight className="size-6" />
      </div>
      
      <div className={`flex flex-col items-center transition-all duration-500 ${step >= 2 ? 'scale-110' : 'scale-100'}`}>
        <div className={`size-12 rounded-lg flex items-center justify-center mb-2 transition-all duration-500 ${
          step >= 2 ? 'bg-purple-100 text-purple-600 shadow-lg' : 'bg-secondary/50 text-muted-foreground'
        }`}>
          <Mail className="size-6" />
        </div>
        <span className="text-xs text-center font-medium">Personalized<br/>Email Sent</span>
        {step >= 2 && <div className="w-1 h-1 bg-primary rounded-full mt-1 animate-pulse"></div>}
      </div>
      
      {step === 3 && (
        <div className="absolute inset-0 flex items-center justify-center bg-green-50/50 rounded-lg">
          <div className="text-center">
            <CheckCircle2 className="size-8 text-green-500 animate-bounce mx-auto" />
            <span className="text-xs font-semibold text-green-600 mt-1 block">Workflow Complete!</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Animation component for Sheets → Docs → PDF → Gmail
export const SheetsToPdfAnimation = () => {
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => (prev + 1) % 5);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4 p-4 min-h-[120px]">
      <div className="grid grid-cols-4 gap-2">
        <div className={`flex flex-col items-center transition-all duration-500 ${step >= 0 ? 'scale-105' : 'scale-100'}`}>
          <div className={`size-10 rounded-lg flex items-center justify-center mb-1 transition-all duration-500 ${
            step >= 0 ? 'bg-blue-100 text-blue-600 shadow-lg' : 'bg-secondary/50 text-muted-foreground'
          }`}>
            <FileSpreadsheet className="size-5" />
          </div>
          <span className="text-xs font-medium">Data</span>
          {step >= 0 && <div className="w-full h-0.5 bg-primary rounded mt-1 progress-flow"></div>}
        </div>
        <div className={`flex flex-col items-center transition-all duration-500 ${step >= 1 ? 'scale-105' : 'scale-100'}`}>
          <div className={`size-10 rounded-lg flex items-center justify-center mb-1 transition-all duration-500 ${
            step >= 1 ? 'bg-green-100 text-green-600 shadow-lg' : 'bg-secondary/50 text-muted-foreground'
          }`}>
            <FileText className="size-5" />
          </div>
          <span className="text-xs font-medium">Doc</span>
          {step >= 1 && <div className="w-full h-0.5 bg-primary rounded mt-1 progress-flow"></div>}
        </div>
        <div className={`flex flex-col items-center transition-all duration-500 ${step >= 2 ? 'scale-105' : 'scale-100'}`}>
          <div className={`size-10 rounded-lg flex items-center justify-center mb-1 transition-all duration-500 ${
            step >= 2 ? 'bg-purple-100 text-purple-600 shadow-lg' : 'bg-secondary/50 text-muted-foreground'
          }`}>
            📄
          </div>
          <span className="text-xs font-medium">PDF</span>
          {step >= 2 && <div className="w-full h-0.5 bg-primary rounded mt-1 progress-flow"></div>}
        </div>
        <div className={`flex flex-col items-center transition-all duration-500 ${step >= 3 ? 'scale-105' : 'scale-100'}`}>
          <div className={`size-10 rounded-lg flex items-center justify-center mb-1 transition-all duration-500 ${
            step >= 3 ? 'bg-orange-100 text-orange-600 shadow-lg' : 'bg-secondary/50 text-muted-foreground'
          }`}>
            <Mail className="size-5" />
          </div>
          <span className="text-xs font-medium">Email</span>
          {step >= 3 && <div className="w-full h-0.5 bg-primary rounded mt-1 progress-flow"></div>}
        </div>
      </div>
      <div className="text-center">
        <div className={`text-xs font-medium px-3 py-1 rounded-full transition-all duration-300 ${
          step === 4 ? 'bg-green-100 text-green-600' : 'text-muted-foreground'
        }`}>
          {step === 0 && "📊 Reading sheet data..."}
          {step === 1 && "✍️ Generating document..."}
          {step === 2 && "📄 Converting to PDF..."}
          {step === 3 && "📧 Sending via email..."}
          {step === 4 && "✅ Quote delivered automatically!"}
        </div>
      </div>
    </div>
  );
};

// Animation component for KPI Dashboards
export const KpiDashboardAnimation = () => {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => (prev + 10) % 110);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 space-y-4 min-h-[120px]">
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-2 text-center">
          <div className="text-lg font-bold text-primary">{Math.floor(progress * 1.2)}%</div>
          <div className="text-xs text-muted-foreground">Sales Target</div>
        </div>
        <div className="glass-card p-2 text-center">
          <div className="text-lg font-bold text-primary">{Math.floor(progress * 0.8)}</div>
          <div className="text-xs text-muted-foreground">New Leads</div>
        </div>
        <div className="glass-card p-2 text-center">
          <div className="text-lg font-bold text-primary">${Math.floor(progress * 150)}K</div>
          <div className="text-xs text-muted-foreground">Revenue</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-primary" />
        <span className="text-xs">Auto-refreshes every Monday at 9 AM</span>
      </div>
    </div>
  );
};

// Simple animation for other demos
export const SimpleWorkflowAnimation = ({ icon: Icon, steps }: { icon: any, steps: string[] }) => {
  const [currentStep, setCurrentStep] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % steps.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <div className="p-4 space-y-4 min-h-[120px]">
      <div className="flex items-center justify-center">
        <div className="size-16 rounded-full bg-secondary/50 flex items-center justify-center">
          <Icon className="size-8 text-primary" />
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{steps[currentStep]}</div>
        <div className="flex justify-center mt-2 space-x-1">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`size-2 rounded-full transition-all duration-300 ${
                idx === currentStep ? 'bg-primary' : 'bg-secondary/50'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};