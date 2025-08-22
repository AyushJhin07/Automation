import { Helmet } from "react-helmet-async";
import { AIWorkflowBuilder } from "@/components/ai/AIWorkflowBuilder";

export default function AIBuilder() {
  return (
    <>
      <Helmet>
        <title>AI Workflow Builder - Apps Script Studio</title>
        <meta name="description" content="Generate Google Apps Script automations with AI. Describe your workflow in plain English and our AI builds it instantly." />
      </Helmet>
      
      <main className="min-h-screen bg-gray-50 py-8">
        <AIWorkflowBuilder />
      </main>
    </>
  );
}