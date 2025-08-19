import { Helmet } from "react-helmet-async";

const Resources = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/resources';
  const links = [
    { label: 'Apps Script official docs', href: 'https://developers.google.com/apps-script' },
    { label: 'Workspace APIs overview', href: 'https://developers.google.com/workspace' },
    { label: 'Card service (UI) overview', href: 'https://developers.google.com/apps-script/guides/card-service' },
    { label: 'Gmail API', href: 'https://developers.google.com/gmail/api' },
    { label: 'Drive API', href: 'https://developers.google.com/drive' },
  ];

  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>Resources | Google Apps Script</title>
        <meta name="description" content="Curated resources for Google Apps Script and Workspace APIs to help you plan automations." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <h1 className="text-3xl font-bold mb-4">Resources</h1>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <a className="hover:underline" href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
};

export default Resources;
