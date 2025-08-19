import { Helmet } from "react-helmet-async";

const Blog = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/blog';
  const posts = [
    { title: '5 high‑ROI Apps Script automations for HR', date: 'Coming soon' },
    { title: 'From Sheets to PDFs: quotes that send themselves', date: 'Coming soon' },
    { title: 'Email parsing to Sheets: structure the chaos', date: 'Coming soon' },
  ];

  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>Blog | Apps Script Automation Ideas</title>
        <meta name="description" content="Articles on Google Apps Script automation patterns, templates, and best practices." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <h1 className="text-3xl font-bold mb-4">Blog</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {posts.map((p) => (
          <article key={p.title} className="glass-card p-5 rounded-lg">
            <h3 className="font-semibold">{p.title}</h3>
            <p className="text-sm text-muted-foreground">{p.date}</p>
          </article>
        ))}
      </div>
    </main>
  );
};

export default Blog;
