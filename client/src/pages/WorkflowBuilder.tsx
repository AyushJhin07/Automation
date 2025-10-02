import { Helmet } from "react-helmet-async";
import { N8NStyleWorkflowBuilder } from "@/components/ai/N8NStyleWorkflowBuilder";
import useRequireOrganization from "@/hooks/useRequireOrganization";
import { useAuthStore } from "@/store/authStore";

export default function WorkflowBuilder() {
  const hasOrganization = useRequireOrganization();
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized || !hasOrganization) {
    return (
      <>
        <Helmet>
          <title>Workflow Builder - Apps Script Studio</title>
          <meta name="description" content="Professional n8n-style workflow builder with AI assistance. Build automation workflows visually." />
        </Helmet>
        <div className="flex h-screen items-center justify-center text-muted-foreground">
          Select a workspace to start building workflows.
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Workflow Builder - Apps Script Studio</title>
        <meta name="description" content="Professional n8n-style workflow builder with AI assistance. Build automation workflows visually." />
      </Helmet>
      
      <div className="h-screen overflow-hidden">
        <N8NStyleWorkflowBuilder />
      </div>
    </>
  );
}