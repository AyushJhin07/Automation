import { Helmet } from "react-helmet-async";

const Privacy = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/privacy';
  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>Privacy Policy | Apps Script Studio</title>
        <meta name="description" content="Privacy policy for our Google Apps Script automation services." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
      <div className="prose prose-neutral max-w-3xl">
        <p>Last updated: {new Date().toLocaleDateString()}</p>
        <p>
          We collect only the minimum information necessary to provide services
          and support. Project data remains your property. We will not sell or
          share your data with third parties except when required to deliver the
          service (e.g., secure hosting) or as required by law.
        </p>
        <h3>Data we may collect</h3>
        <ul>
          <li>Contact details you provide (name, email, company)</li>
          <li>Project requirements and workflow context</li>
          <li>Operational logs needed for debugging (if enabled)</li>
        </ul>
        <h3>Retention</h3>
        <p>We retain project files only for the duration of the engagement unless agreed otherwise.</p>
        <h3>Your rights</h3>
        <p>You can request access, correction, or deletion of your data at any time.</p>
      </div>
    </main>
  );
};

export default Privacy;
