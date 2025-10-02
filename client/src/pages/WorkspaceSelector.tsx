import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const plans = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
  { value: "enterprise_plus", label: "Enterprise Plus" },
];

const WorkspaceSelector = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const organizations = useAuthStore((state) => state.organizations);
  const activeOrganizationId = useAuthStore((state) => state.activeOrganizationId);
  const fetchOrganizations = useAuthStore((state) => state.fetchOrganizations);
  const setActiveOrganization = useAuthStore((state) => state.setActiveOrganization);
  const createOrganization = useAuthStore((state) => state.createOrganization);
  const initialized = useAuthStore((state) => state.initialized);
  const status = useAuthStore((state) => state.status);

  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDomain, setWorkspaceDomain] = useState("");
  const [plan, setPlan] = useState("starter");

  const redirectPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("redirect") || "/workflow-builder";
  }, [location.search]);

  useEffect(() => {
    if (user) {
      fetchOrganizations();
    }
  }, [user, fetchOrganizations]);

  useEffect(() => {
    if (initialized && user && activeOrganizationId && location.pathname === "/workspaces") {
      // If the user already has an active organization and navigated here manually, do not auto-redirect.
    }
  }, [initialized, user, activeOrganizationId, location.pathname]);

  const handleSelect = async (organizationId: string) => {
    setSelectingId(organizationId);
    const result = await setActiveOrganization(organizationId);
    setSelectingId(null);
    if (result.success) {
      toast.success("Workspace selected");
      navigate(redirectPath, { replace: true });
    } else {
      toast.error(result.error || "Unable to switch workspace");
    }
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceName.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    setCreating(true);
    const result = await createOrganization({
      name: workspaceName.trim(),
      domain: workspaceDomain.trim() || undefined,
      plan,
      makeDefault: true,
    });
    setCreating(false);
    if (result.success) {
      toast.success("Workspace created");
      await fetchOrganizations();
      navigate(redirectPath, { replace: true });
    } else {
      toast.error(result.error || "Unable to create workspace");
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto max-w-4xl py-16">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to manage workspaces</CardTitle>
            <CardDescription>You must be authenticated to view and manage workspaces.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please sign in to continue. Once signed in, you will be able to create or select a workspace to access the workflow
              builder.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = status === "loading" || !initialized;

  return (
    <>
      <Helmet>
        <title>Select a Workspace - Apps Script Studio</title>
        <meta name="description" content="Choose or create a workspace before building automation workflows." />
      </Helmet>
      <div className="container mx-auto max-w-6xl py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Choose your workspace</h1>
          <p className="text-muted-foreground mt-2">
            Workspaces let you collaborate with your team, manage usage limits, and keep automation projects organized.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <Card className="border-muted">
            <CardHeader>
              <CardTitle>Available workspaces</CardTitle>
              <CardDescription>Select a workspace to continue building workflows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {organizations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have any workspaces yet. Create one using the form on the right to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {organizations.map((organization) => {
                    const isActive = organization.id === activeOrganizationId;
                    return (
                      <Card key={organization.id} className={isActive ? "border-primary/60" : "border-muted"}>
                        <CardHeader className="flex flex-row items-start justify-between space-y-0">
                          <div>
                            <CardTitle className="text-lg">{organization.name}</CardTitle>
                            <CardDescription className="mt-1 text-sm">
                              Plan: {organization.plan.replace(/_/g, ' ')} • Members can {organization.permissions.canManageUsers ? "manage users" : "collaborate"}
                            </CardDescription>
                          </div>
                          {isActive && <Badge>Active</Badge>}
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>Executions</span>
                            <span>{organization.usage.workflowExecutions} / {organization.limits.executions}</span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>API calls</span>
                            <span>{organization.usage.apiCalls} / {organization.limits.apiCalls}</span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>Members</span>
                            <span>{organization.usage.usersActive} / {organization.limits.users}</span>
                          </div>
                        </CardContent>
                        <CardFooter className="flex justify-end">
                          <Button
                            variant={isActive ? "secondary" : "default"}
                            disabled={isActive || selectingId === organization.id || isLoading}
                            onClick={() => handleSelect(organization.id)}
                          >
                            {isActive ? 'Current workspace' : selectingId === organization.id ? 'Switching…' : 'Use this workspace'}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardHeader>
              <CardTitle>Create a new workspace</CardTitle>
              <CardDescription>Spin up a new workspace for a client, department, or sandbox environment.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreate}>
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace name</Label>
                  <Input
                    id="workspace-name"
                    placeholder="Acme Corp Automation"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-domain">Company domain (optional)</Label>
                  <Input
                    id="workspace-domain"
                    placeholder="acme.com"
                    value={workspaceDomain}
                    onChange={(event) => setWorkspaceDomain(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-plan">Plan</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger id="workspace-plan">
                      <SelectValue placeholder="Select a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={creating || isLoading}>
                  {creating ? 'Creating workspace…' : 'Create workspace'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default WorkspaceSelector;
