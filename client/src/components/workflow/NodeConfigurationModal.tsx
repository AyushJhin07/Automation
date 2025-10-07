// NODE CONFIGURATION MODAL - ENHANCED WITH DYNAMIC FORMS AND OAUTH
// Provides comprehensive node configuration with OAuth integration and real-time validation

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { 
  Settings, 
  Zap, 
  Link, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink,
  RefreshCw,
  Shield,
  Clock,
  DollarSign
} from 'lucide-react';
import { DynamicParameterForm, FunctionDefinition } from './DynamicParameterForm';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';

interface NodeData {
  id: string;
  type: 'trigger' | 'action';
  appName: string;
  functionId?: string;
  label: string;
  parameters?: Record<string, any>;
  connectionId?: string;
}

interface Connection {
  id: string;
  name: string;
  provider: string;
  status: 'connected' | 'expired' | 'error' | 'healthy' | 'active' | 'disconnected' | string;
  lastTested?: string;
  scopes?: string[];
  createdAt?: string | number;
  updatedAt?: string | number;
  lastUsedAt?: string | number;
  insertedAt?: string | number;
}

interface OAuthProvider {
  name: string;
  displayName: string;
  scopes: string[];
  configured: boolean;
}

interface NodeConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeData: NodeData;
  onSave: (updatedNodeData: NodeData) => void;
  availableFunctions: FunctionDefinition[];
  connections: Connection[];
  oauthProviders: OAuthProvider[];
  onConnectionCreated: (connectionId: string) => Connection | void | Promise<Connection | void>;
}

export const NodeConfigurationModal: React.FC<NodeConfigurationModalProps> = ({
  isOpen,
  onClose,
  nodeData,
  onSave,
  availableFunctions,
  connections,
  oauthProviders,
  onConnectionCreated
}) => {
  const [selectedFunction, setSelectedFunction] = useState<FunctionDefinition | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [activeTab, setActiveTab] = useState<'function' | 'connection' | 'parameters'>('function');
  const [parameterValues, setParameterValues] = useState<Record<string, any>>({});
  const [localConnections, setLocalConnections] = useState<Connection[]>(() => connections ?? []);
  const authFetch = useAuthStore((state) => state.authFetch);
  const handledConnectionRef = useRef<string | null>(null);
  const latestConnectionIdRef = useRef<string | null>(null);

  const isConnectionHealthy = useCallback((connection: Connection | null) => {
    if (!connection) return false;
    const status = String(connection.status || '').toLowerCase();
    return !status || status === 'connected' || status === 'healthy' || status === 'active';
  }, []);

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen && nodeData) {
      // Find selected function
      const func = availableFunctions.find(f => f.id === nodeData.functionId);
      setSelectedFunction(func || null);

      // Find selected connection
      setSelectedConnectionId(nodeData.connectionId || null);
      const conn = localConnections.find(c => c.id === (nodeData.connectionId || null));
      setSelectedConnection(conn || null);

      // Set parameter values
      setParameterValues(nodeData.parameters || {});

      // Set initial tab
      if (!func) {
        setActiveTab('function');
      } else if (!conn) {
        setActiveTab('connection');
      } else {
        setActiveTab('parameters');
      }
    }
  }, [isOpen, nodeData, availableFunctions, localConnections]);

  // Filter functions by node type
  const filteredFunctions = availableFunctions.filter(func => 
    func.category === nodeData.type || func.category === 'both'
  );

  // Filter connections by app
  const appConnections = localConnections.filter(conn =>
    conn.provider.toLowerCase() === nodeData.appName.toLowerCase()
  );

  // Get OAuth provider for this app
  const oauthProvider = oauthProviders.find(p => 
    p.name.toLowerCase() === nodeData.appName.toLowerCase()
  );

  // Handle function selection
  const handleFunctionSelect = (func: FunctionDefinition) => {
    setSelectedFunction(func);
    setParameterValues({}); // Reset parameters when function changes
    setActiveTab('connection');
  };

  // Handle connection selection
  const handleConnectionSelect = (conn: Connection) => {
    setSelectedConnectionId(conn.id);
    setSelectedConnection(conn);
    setActiveTab('parameters');
    if (typeof window !== 'undefined') {
      const detail = {
        nodeId: nodeData.id,
        connectionId: conn.id,
        app: nodeData.appName,
        status: conn.status,
        reason: 'connection',
      };
      window.dispatchEvent(new CustomEvent('automation:connection-selected', { detail }));
      window.dispatchEvent(new CustomEvent('automation:auth-complete', { detail }));
    }
  };

  // Test connection
  const handleTestConnection = async (connectionId: string) => {
    setIsTestingConnection(true);
    try {
      const response = await authFetch(`/api/connections/${connectionId}/test`, {
        method: 'POST'
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success('Connection test successful');
      } else {
        toast.error(`Connection test failed: ${result.error}`);
      }
    } catch (error) {
      toast.error('Failed to test connection');
    } finally {
      setIsTestingConnection(false);
    }
  };

  useEffect(() => {
    setLocalConnections((prev) => {
      const map = new Map(prev.map((conn) => [conn.id, conn] as const));
      for (const conn of connections) {
        map.set(conn.id, conn);
      }
      return Array.from(map.values());
    });
  }, [connections]);

  useEffect(() => {
    if (!selectedConnectionId) {
      setSelectedConnection(null);
      return;
    }

    const conn = localConnections.find((c) => c.id === selectedConnectionId);
    if (conn) {
      setSelectedConnection(conn);
    }
  }, [localConnections, selectedConnectionId]);

  useEffect(() => {
    if (!isOpen || selectedConnectionId) {
      return;
    }

    const targetProvider = nodeData.appName?.toLowerCase();
    if (!targetProvider) {
      return;
    }

    const viableConnections = appConnections.filter((conn) => {
      if (!conn) return false;
      const provider = String(conn.provider || '').toLowerCase();
      if (provider !== targetProvider) return false;
      return isConnectionHealthy(conn);
    });

    if (viableConnections.length === 0) {
      return;
    }

    const getTimestamp = (conn: Connection): number => {
      const candidates: Array<string | number | undefined> = [
        conn.updatedAt,
        conn.createdAt,
        conn.lastUsedAt,
        conn.insertedAt,
        conn.lastTested,
      ];

      for (const value of candidates) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }

        if (typeof value === 'string') {
          const ms = Date.parse(value);
          if (!Number.isNaN(ms)) {
            return ms;
          }
        }
      }

      return 0;
    };

    let preferred = viableConnections.find((conn) => conn.id === latestConnectionIdRef.current) || null;

    if (!preferred) {
      preferred = [...viableConnections].sort((a, b) => getTimestamp(b) - getTimestamp(a))[0] || null;
    }

    if (!preferred) {
      return;
    }

    latestConnectionIdRef.current = preferred.id;
    setSelectedConnectionId(preferred.id);
    setSelectedConnection(preferred);
    setActiveTab('parameters');
  }, [appConnections, isOpen, isConnectionHealthy, nodeData.appName, selectedConnectionId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'oauth:connection') {
        return;
      }

      const targetProvider = nodeData.appName.toLowerCase();
      if (data.provider && typeof data.provider === 'string') {
        const normalizedProvider = String(data.provider).toLowerCase();
        if (normalizedProvider !== targetProvider) {
          return;
        }
      }

      if (!data.success) {
        setIsLoading(false);
        const errorMessage = data?.error || data?.userInfoError || 'OAuth connection failed';
        toast.error(errorMessage);
        return;
      }

      if (!data.connectionId || typeof data.connectionId !== 'string') {
        setIsLoading(false);
        toast.error('OAuth connection completed, but no connection ID was returned.');
        return;
      }

      if (handledConnectionRef.current === data.connectionId) {
        setIsLoading(false);
        return;
      }

      handledConnectionRef.current = data.connectionId;
      latestConnectionIdRef.current = data.connectionId;

      const connectionId: string = data.connectionId;
      const connectionLabel: string | undefined = data.label;
      let resolvedConnection: Connection | null = null;

      setLocalConnections((prev) => {
        const incomingConnection: Partial<Connection> = {
          ...(typeof data.connection === 'object' && data.connection ? data.connection : {}),
        };

        if (!incomingConnection.id && typeof connectionId === 'string') {
          incomingConnection.id = connectionId;
        }

        const existing = prev.find((c) => c.id === connectionId) || null;
        const merged: Connection = {
          id: String(connectionId),
          name:
            (incomingConnection.name as string | undefined) ||
            connectionLabel ||
            existing?.name ||
            'New connection',
          provider:
            (incomingConnection.provider as string | undefined) ||
            (typeof data.provider === 'string' ? data.provider : undefined) ||
            existing?.provider ||
            nodeData.appName,
          status:
            (incomingConnection.status as Connection['status']) ||
            (typeof data.status === 'string' ? (data.status as Connection['status']) : undefined) ||
            existing?.status ||
            'connected',
          scopes: incomingConnection.scopes || existing?.scopes,
          lastTested: incomingConnection.lastTested || existing?.lastTested,
          createdAt: incomingConnection.createdAt || existing?.createdAt,
          updatedAt: incomingConnection.updatedAt || existing?.updatedAt,
          lastUsedAt: incomingConnection.lastUsedAt || existing?.lastUsedAt,
          insertedAt: incomingConnection.insertedAt || existing?.insertedAt,
        };

        resolvedConnection = merged;

        const map = new Map(prev.map((conn) => [conn.id, conn] as const));
        map.set(merged.id, { ...existing, ...merged });
        return Array.from(map.values());
      });

      if (resolvedConnection) {
        setSelectedConnectionId(resolvedConnection.id);
        setSelectedConnection(resolvedConnection);
        setActiveTab('parameters');
      }
      setIsLoading(false);
      toast.success(connectionLabel ? `Connected ${connectionLabel}` : 'Connection created successfully');

      Promise.resolve(onConnectionCreated(connectionId))
        .then((refreshedConnection) => {
          if (!refreshedConnection || typeof refreshedConnection !== 'object') {
            return;
          }

          const connection = refreshedConnection as Connection;
          latestConnectionIdRef.current = connection.id;
          setLocalConnections((prev) => {
            const map = new Map(prev.map((conn) => [conn.id, conn] as const));
            map.set(connection.id, { ...(map.get(connection.id) || {}), ...connection });
            return Array.from(map.values());
          });
          setSelectedConnection(connection);
        })
        .catch(() => {
          toast.error('Connection created, but failed to refresh the connection list.');
        });
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isOpen, nodeData.appName, onConnectionCreated]);

  useEffect(() => {
    if (!isOpen) {
      setIsLoading(false);
      handledConnectionRef.current = null;
    }
  }, [isOpen]);

  // Initiate OAuth flow
  const handleOAuthConnect = async () => {
    if (!oauthProvider) return;

    if (isConnectionHealthy(selectedConnection)) {
      setActiveTab('parameters');
      return;
    }

    setIsLoading(true);
    handledConnectionRef.current = null;
    let shouldResetLoading = true;
    try {
      const response = await authFetch('/api/oauth/authorize', {
        method: 'POST',
        body: JSON.stringify({
          provider: oauthProvider.name,
          additionalParams: nodeData.appName === 'shopify' ? { shop: 'your-shop' } : undefined
        })
      });

      const result = await response.json();

      if (result.success) {
        // Open OAuth popup
        const popup = window.open(
          result.data.authUrl,
          'oauth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
          toast.error('Unable to open OAuth window. Please enable pop-ups and try again.');
        } else {
          shouldResetLoading = false;
        }
      } else {
        toast.error(`OAuth initialization failed: ${result.error}`);
      }
    } catch (error) {
      toast.error('Failed to initialize OAuth flow');
    } finally {
      if (shouldResetLoading) {
        setIsLoading(false);
      }
    }
  };

  // Handle parameter form submission
  const handleParameterSubmit = (values: Record<string, any>) => {
    if (!selectedFunction) return;

    if (!selectedConnection || !isConnectionHealthy(selectedConnection)) {
      setActiveTab('connection');
      if (oauthProvider && !isLoading && !isConnectionHealthy(selectedConnection)) {
        void handleOAuthConnect();
      }
      return;
    }

    const updatedNodeData: NodeData = {
      ...nodeData,
      functionId: selectedFunction.id,
      connectionId: selectedConnection.id,
      parameters: values,
      label: `${nodeData.appName}: ${selectedFunction.name}`
    };

    onSave(updatedNodeData);
    onClose();
    toast.success('Node configured successfully');
  };

  // Check if configuration is complete
  const isConfigurationComplete = selectedFunction && selectedConnection;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configure {nodeData.appName} {nodeData.type}
            {isConfigurationComplete && (
              <Badge variant="default" className="ml-2">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ready
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="function" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Function
              {selectedFunction && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            </TabsTrigger>
            <TabsTrigger value="connection" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Connection
              {selectedConnection && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            </TabsTrigger>
            <TabsTrigger 
              value="parameters" 
              disabled={!selectedFunction}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Parameters
            </TabsTrigger>
          </TabsList>

          {/* Function Selection Tab */}
          <TabsContent value="function" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Select Function</CardTitle>
                <CardDescription>
                  Choose the {nodeData.type} function for {nodeData.appName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {filteredFunctions.map((func) => (
                      <Card 
                        key={func.id}
                        className={`cursor-pointer transition-colors hover:bg-accent ${
                          selectedFunction?.id === func.id ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => handleFunctionSelect(func)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold">{func.name}</h4>
                                <Badge variant={func.category === 'action' ? 'default' : 'secondary'}>
                                  {func.category}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {func.description}
                              </p>
                              
                              {/* Function metadata */}
                              <div className="flex flex-wrap gap-2">
                                {func.requiredScopes && (
                                  <Badge variant="outline" className="text-xs">
                                    <Shield className="h-3 w-3 mr-1" />
                                    {func.requiredScopes.length} scopes
                                  </Badge>
                                )}
                                {func.rateLimits && (
                                  <Badge variant="outline" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {func.rateLimits.requests}/{func.rateLimits.period}
                                  </Badge>
                                )}
                                {func.pricing && (
                                  <Badge variant="outline" className="text-xs">
                                    <DollarSign className="h-3 w-3 mr-1" />
                                    {func.pricing.cost} {func.pricing.currency}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {selectedFunction?.id === func.id && (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Connection Selection Tab */}
          <TabsContent value="connection" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Select Connection</CardTitle>
                <CardDescription>
                  Choose or create a connection for {nodeData.appName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Existing Connections */}
                {appConnections.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Existing Connections</h4>
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {appConnections.map((conn) => (
                          <Card 
                            key={conn.id}
                            className={`cursor-pointer transition-colors hover:bg-accent ${
                              selectedConnection?.id === conn.id ? 'ring-2 ring-primary' : ''
                            }`}
                            onClick={() => handleConnectionSelect(conn)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <h5 className="font-medium">{conn.name}</h5>
                                    <p className="text-xs text-muted-foreground">
                                      {conn.provider} • Last tested: {conn.lastTested || 'Never'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant={conn.status === 'connected' ? 'default' : 'destructive'}
                                    className="text-xs"
                                  >
                                    {conn.status}
                                  </Badge>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTestConnection(conn.id);
                                    }}
                                    disabled={isTestingConnection}
                                  >
                                    <RefreshCw className={`h-3 w-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
                                  </Button>
                                  {selectedConnection?.id === conn.id && (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <Separator />

                {/* Create New Connection */}
                <div>
                  <h4 className="font-semibold mb-3">Create New Connection</h4>
                  {oauthProvider ? (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="font-medium">{oauthProvider.displayName} OAuth</h5>
                            <p className="text-sm text-muted-foreground">
                              Secure OAuth2 authentication with {oauthProvider.scopes.length} scopes
                            </p>
                          </div>
                          <Button
                            onClick={handleOAuthConnect}
                            disabled={isLoading || !oauthProvider.configured}
                          >
                            {isLoading ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            ) : (
                              <ExternalLink className="h-4 w-4 mr-2" />
                            )}
                            Connect with OAuth
                          </Button>
                        </div>
                        {!oauthProvider.configured && (
                          <Alert className="mt-3">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              OAuth is not configured for {oauthProvider.displayName}. 
                              Contact your administrator to set up OAuth credentials.
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        OAuth is not available for {nodeData.appName}. 
                        You may need to configure API keys manually.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Parameters Tab */}
          <TabsContent value="parameters" className="mt-4">
            {selectedFunction ? (
              <>
                <DynamicParameterForm
                  app={nodeData.appName}
                  operation={selectedFunction.id}
                  parameters={parameterValues}
                  onChange={(p) => setParameterValues(p)}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button
                    onClick={() => handleParameterSubmit(parameterValues)}
                    disabled={!selectedConnection}
                  >
                    Save
                  </Button>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Select a Function First</h3>
                  <p className="text-muted-foreground">
                    Please select a function to configure its parameters.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
