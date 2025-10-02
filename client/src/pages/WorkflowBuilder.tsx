import { Helmet } from "react-helmet-async";
import { N8NStyleWorkflowBuilder } from "@/components/ai/N8NStyleWorkflowBuilder";
import WorkspaceGate from "@/components/workspaces/WorkspaceGate";

export default function WorkflowBuilder() {
  return (
    <>
      <Helmet>
        <title>Workflow Builder - Apps Script Studio</title>
        <meta name="description" content="Professional n8n-style workflow builder with AI assistance. Build automation workflows visually." />
      </Helmet>
      
      <div className="h-screen overflow-hidden">
        <WorkspaceGate>
          <N8NStyleWorkflowBuilder />
        </WorkspaceGate>
      </div>
    </>
  );
}