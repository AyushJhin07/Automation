import { Helmet } from "react-helmet-async";
import EnhancedConversationalWorkflowBuilder from "@/components/ai/EnhancedConversationalWorkflowBuilder";

export default function AIBuilder() {
  return (
    <>
      <Helmet>
        <title>AI Workflow Builder - Apps Script Studio</title>
        <meta name="description" content="Generate Google Apps Script automations with AI. Describe your workflow in plain English and our AI builds it instantly." />
      </Helmet>
      
      <EnhancedConversationalWorkflowBuilder />
    </>
  );
}