import { Helmet } from "react-helmet-async";

const Terms = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/terms';
  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>Terms & Conditions | Apps Script Studio</title>
        <meta name="description" content="Terms and conditions for our Google Apps Script automation services." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <h1 className="text-3xl font-bold mb-4">Terms & Conditions</h1>
      <div className="prose prose-neutral max-w-3xl">
        <p>By engaging our services, you agree to the following terms.</p>
        <h3>Scope</h3>
        <p>Work is delivered according to the mutually agreed proposal and timeline.</p>
        <h3>Confidentiality</h3>
        <p>We treat your data and business information as confidential.</p>
        <h3>Intellectual property</h3>
        <p>Upon full payment, you own the deliverables created for your project.</p>
        <h3>Warranties</h3>
        <p>We warrant that deliverables will function as specified at the time of delivery.</p>
        <h3>Liability</h3>
        <p>Our liability is limited to the fees paid for the services provided.</p>
      </div>
    </main>
  );
};

export default Terms;
