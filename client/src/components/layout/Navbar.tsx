import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import AuthDialog from "@/components/auth/AuthDialog";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/ai-builder", label: "🤖 AI Builder" },
  { to: "/graph-editor", label: "🎨 Graph Editor" },
  { to: "/workspaces", label: "Workspaces" },
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
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);
  const organizations = useAuthStore((state) => state.organizations);
  const activeOrganizationId = useAuthStore((state) => state.activeOrganizationId);
  const [authOpen, setAuthOpen] = useState(false);
  const isAuthLoading = status === 'loading';

  const activeOrganization = organizations.find((org) => org.id === activeOrganizationId);

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
                      : item.label.includes("Graph Editor")
                        ? "bg-gradient-to-r from-green-600 to-teal-600 text-white hover:from-green-700 hover:to-teal-700 font-semibold"
                        : isActive || (item.to.includes("#") && location.hash === "#demos")
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                  )
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isAuthLoading}>
                  <span className="flex flex-col items-start">
                    <span>{user.name || user.email}</span>
                    {activeOrganization && (
                      <span className="text-xs text-muted-foreground">{activeOrganization.name}</span>
                    )}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {activeOrganization && (
                  <DropdownMenuItem disabled>
                    Active workspace: {activeOrganization.name}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/workspaces">Switch workspaces</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/settings">Account settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" onClick={() => setAuthOpen(true)} disabled={isAuthLoading}>
              Sign in
            </Button>
          )}
          <Button asChild variant="hero">
            <Link to="/schedule">Book a 30‑min call</Link>
          </Button>
        </div>
      </nav>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  );
};

export default Navbar;
