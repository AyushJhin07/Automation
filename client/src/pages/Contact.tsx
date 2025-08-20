import { Helmet } from "react-helmet-async";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import contactIllustration from "@/assets/contact-automation-illustration.jpg";

const Contact = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/contact';
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const firstName = String(formData.get('firstName') || '');
    const lastName = String(formData.get('lastName') || '');
    const email = String(formData.get('email') || '');
    const phone = String(formData.get('phone') || '');
    const company = String(formData.get('company') || '');
    const role = String(formData.get('role') || '');
    const discussion = String(formData.get('discussion') || '');

    const body = encodeURIComponent(`Name: ${firstName} ${lastName}\nEmail: ${email}\nPhone: ${phone}\nCompany: ${company}\nRole: ${role}\n\nDiscussion: ${discussion}`);
    const subject = encodeURIComponent('Automation inquiry');
    // TODO: Update recipient email below
    const mailto = `mailto:hello@yourdomain.com?subject=${subject}&body=${body}`;

    setLoading(true);
    window.location.href = mailto;
    setTimeout(() => {
      setLoading(false);
      toast({ title: 'Opening your email client…', description: 'We look forward to your message.' });
      e.currentTarget.reset();
    }, 400);
  };

  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>Contact | Google Apps Script Automation</title>
        <meta name="description" content="Contact us to discuss Google Apps Script automations for HR, finance, sales, and operations." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        {/* Left Side - Content */}
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-4">Let's Automate Your Workflows</h1>
            <p className="text-muted-foreground text-lg">
              Ready to save hours every week and eliminate manual errors? Tell us about your current workflows, 
              and we'll show you exactly how Google Apps Script can transform your operations.
            </p>
          </div>

          <div className="glass-card p-6 rounded-xl space-y-6">
            <h2 className="text-xl font-semibold">What to Expect from Our Call</h2>
            
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center mt-1 flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">1</span>
                </div>
                <div>
                  <h3 className="font-medium">Workflow Analysis</h3>
                  <p className="text-sm text-muted-foreground">We'll understand your current processes and identify automation opportunities that could save the most time.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center mt-1 flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">2</span>
                </div>
                <div>
                  <h3 className="font-medium">Custom Solution Design</h3>
                  <p className="text-sm text-muted-foreground">We'll propose a tailored automation strategy that fits your team's workflow and technical requirements.</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center mt-1 flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">3</span>
                </div>
                <div>
                  <h3 className="font-medium">Implementation Plan</h3>
                  <p className="text-sm text-muted-foreground">Clear timeline, pricing, and deliverables so you know exactly what to expect.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4">Ongoing Support & Success</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>30 days of free support and bug fixes</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Comprehensive training for your team</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Complete documentation and source code</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Future enhancement and scaling options</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>No lock-in contracts or recurring fees</span>
              </li>
            </ul>
          </div>

          <div className="relative">
            <img 
              src={contactIllustration} 
              alt="Automation consultation illustration with workflow icons"
              className="w-full h-48 object-cover rounded-xl opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/20 rounded-xl"></div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="glass-card rounded-xl p-8">
          <h2 className="text-2xl font-semibold mb-6">Get Started Today</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="text-sm font-medium">First Name</label>
                <Input id="firstName" name="firstName" required className="mt-1" />
              </div>
              <div>
                <label htmlFor="lastName" className="text-sm font-medium">Last Name</label>
                <Input id="lastName" name="lastName" required className="mt-1" />
              </div>
            </div>
            
            <div>
              <label htmlFor="email" className="text-sm font-medium">Work Email</label>
              <Input id="email" type="email" name="email" required className="mt-1" />
            </div>
            
            <div>
              <label htmlFor="phone" className="text-sm font-medium">Phone Number</label>
              <Input id="phone" type="tel" name="phone" className="mt-1" />
            </div>
            
            <div>
              <label htmlFor="company" className="text-sm font-medium">Company</label>
              <Input id="company" name="company" required className="mt-1" />
            </div>
            
            <div>
              <label htmlFor="role" className="text-sm font-medium">Role/Department</label>
              <select id="role" name="role" required className="mt-1 w-full px-3 py-2 border border-input bg-background rounded-md text-sm">
                <option value="">Select your role</option>
                <option value="hr">HR & People Operations</option>
                <option value="finance">Finance & Accounting</option>
                <option value="sales">Sales & Business Development</option>
                <option value="operations">Operations & Admin</option>
                <option value="marketing">Marketing</option>
                <option value="it">IT & Technology</option>
                <option value="legal">Legal & Compliance</option>
                <option value="executive">Executive & Leadership</option>
                <option value="project-management">Project Management</option>
                <option value="customer-success">Customer Success</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="discussion" className="text-sm font-medium">What would you like to discuss?</label>
              <Textarea 
                id="discussion" 
                name="discussion" 
                rows={4} 
                required 
                className="mt-1" 
                placeholder="Describe your current workflows and what you'd like to automate..."
              />
            </div>
            
            <Button type="submit" variant="hero" className="w-full" disabled={loading}>
              {loading ? 'Preparing…' : 'Send Message'}
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              We typically respond within 2 hours during business hours
            </p>
          </form>
        </div>
      </div>
    </main>
  );
};

export default Contact;