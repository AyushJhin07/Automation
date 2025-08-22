import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/ai-builder", label: "🤖 AI Builder" },
  { to: "/workflow-builder", label: "⚡ Workflow Builder" },
  { to: "/#demos", label: "Demos" },
  { to: "/pre-built-apps", label: "Pre-Built Apps" },
  { to: "/schedule", label: "Schedule" },
  { to: "/contact", label: "Contact" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
];

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all",
        scrolled ? "glass-card" : "bg-transparent"
      )}
    >
      <nav className="container mx-auto flex items-center justify-between py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-block h-8 w-8 rounded-md bg-gradient-to-br from-primary to-muted" aria-hidden />
          <span className="text-base font-semibold tracking-tight">Apps Script Studio</span>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                                  cn(
                    "px-3 py-2 rounded-md text-sm transition-colors",
                    item.label.includes("AI Builder") 
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 font-semibold"
                      : item.label.includes("Workflow Builder")
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 font-semibold"
                        : isActive || (item.to.includes("#") && location.hash === "#demos")
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                  )
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Button asChild variant="hero">
            <Link to="/schedule">Book a 30‑min call</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
