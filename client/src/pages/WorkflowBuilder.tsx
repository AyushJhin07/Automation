import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";

import { N8NStyleWorkflowBuilder } from "@/components/ai/N8NStyleWorkflowBuilder";
import WorkspaceGate from "@/components/workspaces/WorkspaceGate";
import { WorkflowVersionPanel } from "@/components/workflow/WorkflowVersionPanel";

export default function WorkflowBuilder() {
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get("workflowId");

  return (
    <>
      <Helmet>
        <title>Workflow Builder - Apps Script Studio</title>
        <meta name="description" content="Professional n8n-style workflow builder with AI assistance. Build automation workflows visually." />
      </Helmet>

      <div className="h-screen overflow-hidden bg-background">
        <WorkspaceGate>
          <div className="h-full w-full flex flex-col lg:flex-row">
            <div className="flex-1 min-h-0">
              <N8NStyleWorkflowBuilder />
            </div>
            <div className="w-full lg:w-96 lg:border-l border-t lg:border-t-0 min-h-[320px] lg:min-h-0">
              <WorkflowVersionPanel workflowId={workflowId} />
            </div>
          </div>
        </WorkspaceGate>
      </div>
    </>
  );
}