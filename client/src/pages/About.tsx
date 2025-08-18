import { Helmet } from "react-helmet-async";

const About = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/about';
  
  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>About | Apps Script Automation Studio</title>
        <meta name="description" content="We craft Google Apps Script automations for HR, Finance, Sales, and Operations teams to save hours every week." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">About Us</h1>
        <div className="space-y-6">
          <div className="prose prose-lg max-w-none">
            <p className="text-lg text-muted-foreground mb-6">
              We're a specialized team of automation experts who believe that businesses should focus on what they do best, 
              not on repetitive manual tasks. Our mission is to help organizations unlock their full potential through 
              intelligent Google Workspace automation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass-card p-6 rounded-xl">
              <h2 className="text-xl font-semibold mb-4">Our Story</h2>
              <p className="text-muted-foreground">
                Founded by developers who experienced firsthand the frustration of manual workflows in growing businesses, 
                we started with a simple question: "Why are teams spending hours on tasks that Google Apps Script could 
                handle in minutes?" After helping dozens of companies save thousands of hours through automation, we realized 
                the massive untapped potential in Google Workspace.
              </p>
            </div>

            <div className="glass-card p-6 rounded-xl">
              <h2 className="text-xl font-semibold mb-4">Our Approach</h2>
              <p className="text-muted-foreground">
                We don't believe in one-size-fits-all solutions. Every business has unique workflows, and we take time to 
                understand your specific challenges before building anything. Our automations are designed to be intuitive 
                for your team while being powerful enough to handle complex business logic behind the scenes.
              </p>
            </div>
          </div>

          <div className="glass-card p-8 rounded-xl">
            <h2 className="text-2xl font-semibold mb-6">Why Google Apps Script?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2 text-primary">No Recurring Costs</h3>
                <p className="text-sm text-muted-foreground">
                  Unlike subscription-based platforms, Apps Script automations are one-time investments with no monthly fees.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-primary">Deep Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Native access to Google Workspace features that external platforms can't match, enabling more sophisticated workflows.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-primary">Enterprise Security</h3>
                <p className="text-sm text-muted-foreground">
                  Your data stays within Google's secure infrastructure, meeting enterprise security and compliance requirements.
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass-card p-6 rounded-xl">
              <h2 className="text-xl font-semibold mb-4">Our Expertise</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li>• 500+ successful automation projects delivered</li>
                <li>• Expertise across HR, Finance, Sales, and Operations</li>
                <li>• Google Cloud certified developers</li>
                <li>• Average client saves 25+ hours per week</li>
                <li>• 98% client satisfaction rate</li>
                <li>• Integrations with 200+ external applications</li>
              </ul>
            </div>

            <div className="glass-card p-6 rounded-xl">
              <h2 className="text-xl font-semibold mb-4">Our Commitment</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Transparent, project-based pricing</li>
                <li>• Complete source code ownership for clients</li>
                <li>• Comprehensive training and documentation</li>
                <li>• 30-day support guarantee on all projects</li>
                <li>• Ongoing maintenance and enhancement options</li>
                <li>• No lock-in contracts or hidden fees</li>
              </ul>
            </div>
          </div>

          <div className="glass-card p-8 rounded-xl text-center tint-a">
            <h2 className="text-2xl font-semibold mb-4">Ready to Transform Your Workflows?</h2>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Join hundreds of companies that have already automated their Google Workspace workflows. 
              Let's discuss how we can help your team save time and reduce errors.
            </p>
            <div className="flex gap-4 justify-center">
              <a href="/schedule" className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors">
                Schedule Consultation
              </a>
              <a href="/contact" className="border border-border px-6 py-3 rounded-lg hover:bg-accent transition-colors">
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default About;