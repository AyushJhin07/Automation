import { Helmet } from "react-helmet-async";
import ProfessionalGraphEditor from "@/components/workflow/ProfessionalGraphEditor";

export default function GraphEditor() {
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