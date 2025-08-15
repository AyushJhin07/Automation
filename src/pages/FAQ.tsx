import { Helmet } from "react-helmet-async";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQ = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/faq';
  const faqs = [
    {
      q: "What is Google Apps Script and why should I use it?",
      a: "Google Apps Script is a powerful cloud-based platform developed by Google that allows you to automate and extend Google Workspace applications like Sheets, Gmail, Drive, Calendar, and more. Unlike other automation platforms that require monthly subscriptions and have limitations, Apps Script runs directly within Google's ecosystem, providing faster execution, deeper integration, and no monthly fees. It's particularly valuable for businesses already using Google Workspace, as it can create sophisticated workflows that would be expensive or impossible with other tools."
    },
    {
      q: "How much does automation cost and what's included?",
      a: "Our pricing is project-based and depends on the complexity of your automation needs. A simple workflow (like form to email automation) typically starts around $500-1000, while complex multi-step automations with AI integration can range from $2000-5000. This is a one-time cost with no recurring fees. Every project includes: complete development, testing, documentation, training for your team, 30 days of free support, and source code ownership. Unlike subscription-based platforms that can cost $50-500+ monthly, our solutions pay for themselves quickly."
    },
    {
      q: "How long does implementation take?",
      a: "Most automations are delivered within 1-3 weeks depending on complexity. Simple automations (3-5 steps) typically take 3-7 days, while complex workflows with multiple integrations may take 2-3 weeks. We follow a proven process: Discovery call (1 day) → Prototype development (2-5 days) → Full implementation and testing (1-2 weeks) → Training and handover (1-2 days). We provide regular updates throughout the process and can often deliver working prototypes within 48 hours."
    },
    {
      q: "Can you integrate with applications outside Google Workspace?",
      a: "Absolutely! While Google Apps Script excels at Google Workspace integration, it can connect to virtually any external service through APIs and webhooks. We regularly integrate with Slack, Salesforce, HubSpot, QuickBooks, Shopify, and hundreds of other applications. We can also create custom integrations with your proprietary systems. The key advantage is that Google Apps Script acts as the central hub, reducing complexity and costs compared to using multiple automation platforms."
    },
    {
      q: "What happens if something breaks or needs updates?",
      a: "All our automations include 30 days of free support and bug fixes. After that, we offer maintenance packages starting at $100/month or one-time fixes starting at $150. Since you own the source code, you're never locked in - you can modify it yourself, hire another developer, or continue working with us. We also provide comprehensive documentation and can train your team to make simple updates. Most of our automations are very stable since they run on Google's infrastructure."
    },
    {
      q: "How is this different from other automation platforms?",
      a: "The key differences are cost, performance, and capabilities. Other platforms charge $50-500+ monthly and have limitations on executions, integrations, and data processing. Google Apps Script has no recurring fees, processes data much faster (no API delays), and provides deeper access to Google Workspace features. For example, creating PDF invoices from Google Docs templates with custom formatting is simple in Apps Script but complex/expensive in other platforms. You also get complete customization and aren't limited by pre-built templates."
    },
    {
      q: "Do I need technical knowledge to use the automations?",
      a: "Not at all! We design our automations to be user-friendly for non-technical teams. Most automations work entirely in the background or through simple interfaces like Google Forms or buttons in Google Sheets. We provide comprehensive training (usually 30-60 minutes) covering how to use, monitor, and troubleshoot your automations. We also create documentation with screenshots and step-by-step instructions. If you want to make modifications later, we can provide additional training or handle updates for you."
    },
    {
      q: "Can you handle data security and privacy requirements?",
      a: "Yes, data security is a top priority. Google Apps Script runs within your Google Workspace environment, so your data never leaves Google's secure infrastructure. We follow security best practices including: encrypted data transmission, minimal permission requests, secure authentication methods, audit logging, and compliance with GDPR/CCPA requirements. We can also sign NDAs and work within your organization's security frameworks. For highly sensitive data, we can implement additional encryption layers."
    },
    {
      q: "What if my needs change or I want to add features later?",
      a: "That's very common! Since you own the source code, adding features is straightforward. We offer enhancement packages starting at $200 for simple additions (new fields, email templates) up to $1000+ for major features (new integrations, AI capabilities). We maintain detailed documentation of our code structure, making future modifications efficient. Many clients start with basic automations and gradually add features as they see the value. We're always available to discuss enhancements and provide quotes."
    },
    {
      q: "Can you migrate existing automations from other platforms?",
      a: "Absolutely! We specialize in migrating clients from platforms like other automation tools, Microsoft Power Automate, and others. The migration process typically takes 1-2 weeks and includes: analyzing your current workflows, recreating them in Apps Script with improvements, testing thoroughly, and training your team. In most cases, the migrated automations are faster, more reliable, and include features that weren't possible on the previous platform. The one-time migration cost is usually recovered within 3-6 months through eliminated subscription fees."
    }
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>FAQ | Apps Script Automation</title>
        <meta name="description" content="Answers about Google Apps Script automation services, timelines, tools, and process." />
        <link rel="canonical" href={canonical} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <h1 className="text-3xl font-bold mb-6">Frequently asked questions</h1>
      <Accordion type="single" collapsible className="max-w-3xl">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger>{f.q}</AccordionTrigger>
            <AccordionContent>{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </main>
  );
};

export default FAQ;
