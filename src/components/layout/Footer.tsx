import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";

const Footer = () => {
  return (
    <footer className="mt-16">
      <div className="container mx-auto">
        <div className="glass-card rounded-lg p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Apps Script Studio. All rights reserved.
            </p>
            <nav className="flex items-center gap-6 text-sm">
              <Link to="/privacy" className="hover:underline">Privacy</Link>
              <Link to="/terms" className="hover:underline">Terms</Link>
              <Link to="/contact" className="hover:underline">Contact</Link>
            </nav>
          </div>
          <Separator className="my-4" />
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>Built with Google Apps Script expertise + automation best practices.</p>
            <p>Monochrome glass UI theme.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
