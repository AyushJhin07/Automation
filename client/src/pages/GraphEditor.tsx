import { Helmet } from "react-helmet-async";
import ProfessionalGraphEditor from "@/components/workflow/ProfessionalGraphEditor";
import useRequireOrganization from "@/hooks/useRequireOrganization";
import { useAuthStore } from "@/store/authStore";

export default function GraphEditor() {
  const hasOrganization = useRequireOrganization();
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized || !hasOrganization) {
    return (
      <>
        <Helmet>
          <title>Workflow Designer - Apps Script Studio</title>
          <meta name="description" content="Design and build automation workflows with our professional n8n-style visual editor. Drag, drop, and connect nodes to create powerful automations." />
        </Helmet>
        <div className="flex h-screen items-center justify-center text-muted-foreground">
          Select a workspace to design workflows.
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Workflow Designer - Apps Script Studio</title>
        <meta name="description" content="Design and build automation workflows with our professional n8n-style visual editor. Drag, drop, and connect nodes to create powerful automations." />
      </Helmet>
      
      <ProfessionalGraphEditor />
    </>
  );
}