import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, Users, Briefcase, TrendingUp, Settings, UserCheck, Clipboard } from "lucide-react";

interface WorkflowItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  gradient: string;
}

const workflows: WorkflowItem[] = [
  {
    title: "HR Workflows",
    icon: Users,
    description: "Onboarding, leave requests, emails & approvals.",
    gradient: "tint-a"
  },
  {
    title: "Finance Ops", 
    icon: Briefcase,
    description: "Quotes, invoices, reconciliations, monthly reports.",
    gradient: "tint-b"
  },
  {
    title: "Sales Automation",
    icon: TrendingUp, 
    description: "Lead intake, follow-ups, proposals, reminders.",
    gradient: "tint-c"
  },
  {
    title: "Operations",
    icon: Settings,
    description: "Docs, Drive, and calendar workflows at scale.",
    gradient: "tint-a"
  },
  {
    title: "Recruiter",
    icon: UserCheck,
    description: "Candidate tracking, interview scheduling, automated communications.",
    gradient: "tint-b"
  },
  {
    title: "Project Managers", 
    icon: Clipboard,
    description: "Task automation, progress tracking, team coordination workflows.",
    gradient: "tint-c"
  }
];

export const WorkflowButtons = () => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <section className="container mx-auto py-12 md:py-16 relative overflow-visible">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10 overflow-visible">
        {workflows.map((workflow, index) => (
          <div key={workflow.title} className="relative overflow-visible">
            <Card 
              className={`relative p-6 button-3d hover-scale ${workflow.gradient} rounded-xl cursor-pointer h-24 overflow-visible`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex items-center justify-between h-full">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <workflow.icon className="size-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">{workflow.title}</h3>
                </div>
                
                <div className="relative">
                  <div className={`size-8 rounded-full bg-primary/10 flex items-center justify-center transition-transform duration-200 ${
                    hoveredIndex === index ? 'rotate-180' : ''
                  }`}>
                    <ChevronDown className="size-4 text-primary" />
                  </div>
                </div>
              </div>
            </Card>
            
            {/* Tooltip Description - Moved outside Card */}
            {hoveredIndex === index && (
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-64 p-4 bg-popover border border-border rounded-lg shadow-lg animate-fade-in z-[99999] pointer-events-none">
                <p className="text-sm text-popover-foreground">{workflow.description}</p>
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-popover border-l border-t border-border rotate-45"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
