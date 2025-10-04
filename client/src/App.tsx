import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AuthInitializer from "@/components/auth/AuthInitializer";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Schedule from "./pages/Schedule";
import Contact from "./pages/Contact";
import About from "./pages/About";
import FAQ from "./pages/FAQ";
import Blog from "./pages/Blog";
import Resources from "./pages/Resources";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import PreBuiltApps from "./pages/PreBuiltApps";
import AIBuilder from "./pages/AIBuilder";
import AdminSettings from "./pages/AdminSettings";
import AdminUsage from "./pages/AdminUsage";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import GraphEditor from "./pages/GraphEditor";
import OAuthCallback from "./pages/OAuthCallback";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthInitializer />
          <Navbar />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/ai-builder" element={<AIBuilder />} />
            <Route path="/workflow-builder" element={<WorkflowBuilder />} />
            <Route path="/graph-editor" element={<GraphEditor />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/usage" element={<AdminUsage />} />
            <Route path="/pre-built-apps" element={<PreBuiltApps />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/oauth/callback/:provider" element={<OAuthCallback />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
