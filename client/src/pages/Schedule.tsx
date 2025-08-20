import { Helmet } from "react-helmet-async";

const Schedule = () => {
  const canonical = typeof window !== 'undefined' ? window.location.href : '/schedule';
  return (
    <main className="container mx-auto py-12">
      <Helmet>
        <title>Book a 30‑min Google Apps Script Automation Call</title>
        <meta name="description" content="Schedule a 30‑minute discovery call to explore Google Apps Script and AI automation for HR, finance, sales, and ops." />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <h1 className="text-3xl font-bold mb-4">Book a 30‑minute consultation</h1>
      <p className="text-muted-foreground mb-6 max-w-2xl">
        Pick a time that works. We’ll discuss your workflows and map the highest‑ROI automations.
      </p>

      {/* Replace YOUR_CALENDAR_ID with your Google Calendar ID to enable embed. */}
      <div className="glass-card rounded-xl p-2">
        <iframe
          title="Google Calendar booking"
          src="https://calendar.google.com/calendar/embed?src=YOUR_CALENDAR_ID&ctz=UTC&mode=WEEK&showTabs=0&showCalendars=0&showTz=0"
          className="w-full h-[800px] rounded-lg"
          loading="lazy"
        />
      </div>
    </main>
  );
};

export default Schedule;
