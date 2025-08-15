import { useState } from "react"
import { Card } from "@/components/ui/card"
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card"
import {
  ChevronDown,
  Users,
  Briefcase,
  TrendingUp,
  Settings,
  UserCheck,
  Clipboard,
} from "lucide-react"

interface WorkflowItem {
  title: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  gradient: string
}

const workflows: WorkflowItem[] = [
  { title: "HR Workflows", icon: Users, description: "Onboarding, leave requests, emails & approvals.", gradient: "tint-a" },
  { title: "Finance Ops", icon: Briefcase, description: "Quotes, invoices, reconciliations, monthly reports.", gradient: "tint-b" },
  { title: "Sales Automation", icon: TrendingUp, description: "Lead intake, follow-ups, proposals, reminders.", gradient: "tint-c" },
  { title: "Operations", icon: Settings, description: "Docs, Drive, and calendar workflows at scale.", gradient: "tint-a" },
  { title: "Recruiter", icon: UserCheck, description: "Candidate tracking, interview scheduling, automated communications.", gradient: "tint-b" },
  { title: "Project Managers", icon: Clipboard, description: "Task automation, progress tracking, team coordination workflows.", gradient: "tint-c" },
]

export const WorkflowButtons = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="container mx-auto py-12 md:py-16 relative">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map((workflow, index) => (
          <Card
            key={workflow.title}
            className={`relative p-6 button-3d hover-scale ${workflow.gradient} rounded-xl cursor-pointer h-24`}
          >
            <div className="flex items-center justify-between h-full">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <workflow.icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{workflow.title}</h3>
              </div>

              {/* Use HoverCard so the panel stays open while hovering content */}
              <HoverCard
                open={openIndex === index}
                onOpenChange={(open) => setOpenIndex(open ? index : (openIndex === index ? null : openIndex))}
              >
                <HoverCardTrigger asChild>
                  <div
                    className={`relative size-8 rounded-full bg-primary/10 flex items-center justify-center transition-transform duration-200 ${
                      openIndex === index ? "rotate-180" : ""
                    }`}
                  >
                    <ChevronDown className="size-4 text-primary" />
                  </div>
                </HoverCardTrigger>

                <HoverCardContent
                  side="bottom"
                  align="center"
                  className="w-64 p-3 glass-card rounded-lg border border-border/50 shadow-xl bg-background backdrop-blur-sm z-[9999]"
                >
                  <p className="text-sm text-muted-foreground">{workflow.description}</p>
                </HoverCardContent>
              </HoverCard>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}

// If your pages import a default export, uncomment:
// export default WorkflowButtons
