// NODE CONFIGURATION MODAL - ENHANCED WITH DYNAMIC FORMS AND OAUTH
// Provides comprehensive node configuration with OAuth integration and real-time validation

import React, { useState, useEffect } from 'react';
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
  status: 'connected' | 'expired' | 'error';
  lastTested?: string;
  scopes?: string[];
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
}

export const NodeConfigurationModal: React.FC<NodeConfigurationModalProps> = ({
  isOpen,
  onClose,
  nodeData,
  onSave,
  availableFunctions,
  connections,
  oauthProviders
}) => {
  const [selectedFunction, setSelectedFunction] = useState<FunctionDefinition | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [activeTab, setActiveTab] = useState<'function' | 'connection' | 'parameters'>('function');
  const [parameterValues, setParameterValues] = useState<Record<string, any>>({});

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen && nodeData) {
      // Find selected function
      const func = availableFunctions.find(f => f.id === nodeData.functionId);
      setSelectedFunction(func || null);

      // Find selected connection
      const conn = connections.find(c => c.id === nodeData.connectionId);
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
  }, [isOpen, nodeData, availableFunctions, connections]);

  // Filter functions by node type
  const filteredFunctions = availableFunctions.filter(func => 
    func.category === nodeData.type || func.category === 'both'
  );

  // Filter connections by app
  const appConnections = connections.filter(conn => 
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
    setSelectedConnection(conn);
    setActiveTab('parameters');
  };

  // Test connection
  const handleTestConnection = async (connectionId: string) => {
    setIsTestingConnection(true);
    try {
      const response = await fetch('/api/connections/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ connectionId })
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

  // Initiate OAuth flow
  const handleOAuthConnect = async () => {
    if (!oauthProvider) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
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

        // Listen for OAuth completion
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            // Refresh connections list
            window.location.reload();
          }
        }, 1000);
      } else {
        toast.error(`OAuth initialization failed: ${result.error}`);
      }
    } catch (error) {
      toast.error('Failed to initialize OAuth flow');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle parameter form submission
  const handleParameterSubmit = (values: Record<string, any>) => {
    if (!selectedFunction || !selectedConnection) return;

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
              <DynamicParameterForm
                functionDef={selectedFunction}
                initialValues={parameterValues}
                onSubmit={handleParameterSubmit}
                onCancel={onClose}
                isLoading={isLoading}
              />
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