import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, Plus, Building2 } from 'lucide-react';

interface WorkspaceGateProps {
  children: React.ReactNode;
}

const WorkspaceGate = ({ children }: WorkspaceGateProps) => {
  const {
    user,
    organizations,
    activeOrganization,
    activeOrganizationId,
    refreshOrganizations,
    selectOrganization,
    createOrganization,
  } = useAuthStore((state) => ({
    user: state.user,
    organizations: state.organizations,
    activeOrganization: state.activeOrganization,
    activeOrganizationId: state.activeOrganizationId,
    refreshOrganizations: state.refreshOrganizations,
    selectOrganization: state.selectOrganization,
    createOrganization: state.createOrganization,
  }));

  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOrganizations = useMemo(() => (organizations?.length || 0) > 0, [organizations]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        setLoading(true);
        setError(null);
        await refreshOrganizations();
      } catch (err: any) {
        setError(err?.message || 'Unable to load workspaces');
      } finally {
        setLoading(false);
      }
    };

    if (user && !organizations) {
      load();
    }
  }, [user, organizations, refreshOrganizations]);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>
              You need to sign in to access workspaces and workflows.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>Loading workspaces…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Unable to load workspaces</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => { setError(null); refreshOrganizations().catch(() => null); }}>
              Retry
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!hasOrganizations || !activeOrganizationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>{hasOrganizations ? 'Select a workspace' : 'Create your first workspace'}</CardTitle>
            <CardDescription>
              Workspaces let you organize workflows and manage usage with your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasOrganizations ? (
              <div className="space-y-2">
                {organizations?.map((org) => (
                  <Card key={org.id} className="border border-dashed">
                    <CardContent className="flex items-center justify-between gap-2 py-4">
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-sm text-muted-foreground">{org.plan.toUpperCase()} • {org.role}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const result = await selectOrganization(org.id);
                          if (!result.success) {
                            setError(result.error);
                          } else {
                            setError(null);
                          }
                        }}
                      >
                        Switch
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Workspace name</label>
                  <Input
                    placeholder="Acme Corp"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Company domain (optional)</label>
                  <Input
                    placeholder="acme.com"
                    value={newDomain}
                    onChange={(event) => setNewDomain(event.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button
              variant={hasOrganizations ? 'ghost' : 'outline'}
              onClick={() => setShowCreate((prev) => !prev)}
            >
              {showCreate ? 'Back to workspaces' : 'Create new workspace'}
            </Button>
            <div className="flex items-center gap-2">
              {showCreate || !hasOrganizations ? (
                <Button
                  onClick={async () => {
                    if (!newName.trim()) {
                      setError('Workspace name is required');
                      return;
                    }
                    setCreating(true);
                    const result = await createOrganization({ name: newName.trim(), domain: newDomain.trim() || undefined });
                    setCreating(false);
                    if (!result.success) {
                      setError(result.error);
                    } else {
                      setError(null);
                      setNewName('');
                      setNewDomain('');
                    }
                  }}
                  disabled={creating}
                >
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create workspace
                </Button>
              ) : null}
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-muted/40 px-6 py-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="font-medium text-foreground">{activeOrganization?.name}</span>
          <span className="text-xs uppercase">{activeOrganization?.plan}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowCreate((prev) => !prev)}>
            <Plus className="mr-2 h-4 w-4" /> New workspace
          </Button>
          <Button variant="outline" size="sm" onClick={() => refreshOrganizations().catch(() => null)}>
            Refresh
          </Button>
        </div>
      </div>
      {showCreate && (
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">Workspace name</label>
              <Input
                placeholder="New workspace"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">Company domain (optional)</label>
              <Input
                placeholder="workspace.com"
                value={newDomain}
                onChange={(event) => setNewDomain(event.target.value)}
              />
            </div>
            <Button
              onClick={async () => {
                if (!newName.trim()) {
                  setError('Workspace name is required');
                  return;
                }
                setCreating(true);
                const result = await createOrganization({ name: newName.trim(), domain: newDomain.trim() || undefined });
                setCreating(false);
                if (!result.success) {
                  setError(result.error);
                } else {
                  setError(null);
                  setShowCreate(false);
                  setNewName('');
                  setNewDomain('');
                }
              }}
              disabled={creating}
              className="whitespace-nowrap"
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="border-b bg-red-50 px-6 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
};

export default WorkspaceGate;
