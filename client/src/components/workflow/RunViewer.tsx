/**
 * RUN VIEWER - Production-grade execution observability
 * Comprehensive timeline view with input/output inspection, retry tracking, and debugging tools
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Search,
  Filter,
  Copy,
  Download,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Zap,
  DollarSign,
  Timer,
  Activity,
  BarChart3,
  Bug,
  ArrowRight,
  Layers,
  Database,
  CloudLightning
} from 'lucide-react';
import { format } from 'date-fns';

// Types matching server-side interfaces
interface NodeExecution {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'dlq';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  attempt: number;
  maxAttempts: number;
  input?: any;
  output?: any;
  error?: string;
  correlationId: string;
  retryHistory: Array<{
    attempt: number;
    timestamp: Date;
    error?: string;
    duration: number;
  }>;
  metadata: {
    idempotencyKey?: string;
    cacheHit?: boolean;
    costUSD?: number;
    tokensUsed?: number;
    httpStatusCode?: number;
    headers?: Record<string, string>;
  };
}

interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  workflowName: string;
  userId?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'partial';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  triggerType?: string;
  triggerData?: any;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  nodeExecutions: NodeExecution[];
  finalOutput?: any;
  error?: string;
  correlationId: string;
  tags: string[];
  metadata: {
    retryCount: number;
    totalCostUSD: number;
    totalTokensUsed: number;
    cacheHitRate: number;
    averageNodeDuration: number;
  };
}

interface RunViewerProps {
  executionId?: string;
  workflowId?: string;
  onClose?: () => void;
}

export const RunViewer: React.FC<RunViewerProps> = ({ 
  executionId: initialExecutionId, 
  workflowId: initialWorkflowId,
  onClose 
}) => {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showJsonView, setShowJsonView] = useState(false);

  // Load executions
  useEffect(() => {
    loadExecutions();
  }, [initialExecutionId, initialWorkflowId]);

  const loadExecutions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (initialExecutionId) params.set('executionId', initialExecutionId);
      if (initialWorkflowId) params.set('workflowId', initialWorkflowId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      
      const response = await fetch(`/api/executions?${params}`);
      const data = await response.json();
      
      setExecutions(data.executions || []);
      
      // Auto-select first execution or specific one
      if (data.executions?.length > 0) {
        const targetExecution = initialExecutionId 
          ? data.executions.find((e: WorkflowExecution) => e.executionId === initialExecutionId)
          : data.executions[0];
        setSelectedExecution(targetExecution || data.executions[0]);
      }
    } catch (error) {
      console.error('Failed to load executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const retryExecution = async (executionId: string) => {
    try {
      await fetch(`/api/executions/${executionId}/retry`, { method: 'POST' });
      loadExecutions(); // Refresh data
    } catch (error) {
      console.error('Failed to retry execution:', error);
    }
  };

  const retryNode = async (executionId: string, nodeId: string) => {
    try {
      await fetch(`/api/executions/${executionId}/nodes/${nodeId}/retry`, { method: 'POST' });
      loadExecutions(); // Refresh data
    } catch (error) {
      console.error('Failed to retry node:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const copyJsonPath = (obj: any, path: string[] = []): void => {
    const fullPath = path.length > 0 ? `$.${path.join('.')}` : '$';
    copyToClipboard(fullPath);
  };

  const toggleNodeExpansion = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'running': return <Play className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'succeeded': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'retrying': return <RefreshCw className="w-4 h-4 text-orange-500 animate-spin" />;
      case 'dlq': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'partial': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'running': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'succeeded': return 'bg-green-100 text-green-800 border-green-300';
      case 'failed': return 'bg-red-100 text-red-800 border-red-300';
      case 'retrying': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'dlq': return 'bg-red-200 text-red-900 border-red-400';
      case 'partial': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatCost = (cost?: number) => {
    if (!cost) return '$0.00';
    return `$${cost.toFixed(4)}`;
  };

  const JsonViewer: React.FC<{ data: any; path?: string[] }> = ({ data, path = [] }) => {
    if (data === null) return <span className="text-gray-500">null</span>;
    if (data === undefined) return <span className="text-gray-500">undefined</span>;
    if (typeof data === 'string') return <span className="text-green-600">"{data}"</span>;
    if (typeof data === 'number') return <span className="text-blue-600">{data}</span>;
    if (typeof data === 'boolean') return <span className="text-purple-600">{data.toString()}</span>;
    
    if (Array.isArray(data)) {
      return (
        <div className="ml-4">
          <span className="text-gray-600">[</span>
          {data.map((item, index) => (
            <div key={index} className="ml-4">
              <span className="text-gray-500">{index}:</span>
              <JsonViewer data={item} path={[...path, index.toString()]} />
            </div>
          ))}
          <span className="text-gray-600">]</span>
        </div>
      );
    }
    
    if (typeof data === 'object') {
      return (
        <div className="ml-4">
          <span className="text-gray-600">{'{'}</span>
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="ml-4 group">
              <span 
                className="text-blue-800 cursor-pointer hover:bg-blue-100 px-1 rounded"
                onClick={() => copyJsonPath(data, [...path, key])}
                title="Click to copy JSON path"
              >
                "{key}":
              </span>
              <JsonViewer data={value} path={[...path, key]} />
            </div>
          ))}
          <span className="text-gray-600">{'}'}</span>
        </div>
      );
    }
    
    return <span>{String(data)}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">Run Viewer</h2>
            </div>
            
            {selectedExecution && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={getStatusColor(selectedExecution.status)}>
                  {getStatusIcon(selectedExecution.status)}
                  <span className="ml-1 capitalize">{selectedExecution.status}</span>
                </Badge>
                <span className="text-sm text-gray-500">
                  {selectedExecution.workflowName}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadExecutions}
              className="text-gray-600"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
            
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-4 mt-4">
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search executions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md"
          >
            <option value="all">All Statuses</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Execution List */}
        <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-medium text-gray-900">Executions ({executions.length})</h3>
          </div>
          
          <div className="space-y-1 p-2">
            {executions.map((execution) => (
              <div
                key={execution.executionId}
                onClick={() => setSelectedExecution(execution)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedExecution?.executionId === execution.executionId
                    ? 'bg-blue-50 border-blue-200 border'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(execution.status)}
                    <span className="font-medium text-sm text-gray-900">
                      {execution.workflowName}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDuration(execution.duration)}
                  </span>
                </div>
                
                <div className="text-xs text-gray-500">
                  {format(new Date(execution.startTime), 'MMM d, HH:mm:ss')}
                </div>
                
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>{execution.completedNodes}/{execution.totalNodes} nodes</span>
                  {execution.metadata.totalCostUSD > 0 && (
                    <span>{formatCost(execution.metadata.totalCostUSD)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Execution Details */}
        {selectedExecution && (
          <div className="flex-1 overflow-hidden flex">
            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Execution Summary */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Execution Summary
                    <Badge variant="outline" className={getStatusColor(selectedExecution.status)}>
                      {selectedExecution.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">Duration</div>
                      <div className="font-medium">{formatDuration(selectedExecution.duration)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Nodes</div>
                      <div className="font-medium">
                        {selectedExecution.completedNodes}/{selectedExecution.totalNodes}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Cost</div>
                      <div className="font-medium">{formatCost(selectedExecution.metadata.totalCostUSD)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Cache Hit Rate</div>
                      <div className="font-medium">
                        {(selectedExecution.metadata.cacheHitRate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  {selectedExecution.error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-sm font-medium text-red-800">Error</div>
                      <div className="text-sm text-red-700 mt-1">{selectedExecution.error}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Node Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Node Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedExecution.nodeExecutions.map((node, index) => (
                      <div
                        key={node.nodeId}
                        className="border border-slate-200 rounded-lg overflow-hidden"
                      >
                        {/* Node Header */}
                        <div
                          onClick={() => toggleNodeExpansion(node.nodeId)}
                          className="flex items-center justify-between p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {expandedNodes.has(node.nodeId) ? 
                              <ChevronDown className="w-4 h-4 text-gray-500" /> : 
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            }
                            {getStatusIcon(node.status)}
                            <div>
                              <div className="font-medium text-gray-900">{node.nodeLabel}</div>
                              <div className="text-sm text-gray-500">{node.nodeType}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            {node.duration && (
                              <span className="flex items-center gap-1">
                                <Timer className="w-3 h-3" />
                                {formatDuration(node.duration)}
                              </span>
                            )}
                            {node.metadata.costUSD && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {formatCost(node.metadata.costUSD)}
                              </span>
                            )}
                            {node.attempt > 1 && (
                              <Badge variant="outline" className="bg-orange-100 text-orange-800">
                                Retry {node.attempt}/{node.maxAttempts}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        {/* Expanded Node Details */}
                        {expandedNodes.has(node.nodeId) && (
                          <div className="p-4 space-y-4">
                            {/* Node Actions */}
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedNode(node)}
                                className="text-blue-600"
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Inspect
                              </Button>
                              
                              {node.status === 'failed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => retryNode(selectedExecution.executionId, node.nodeId)}
                                  className="text-orange-600"
                                >
                                  <RefreshCw className="w-4 h-4 mr-1" />
                                  Retry
                                </Button>
                              )}
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(node.output, null, 2))}
                                className="text-gray-600"
                              >
                                <Copy className="w-4 h-4 mr-1" />
                                Copy Output
                              </Button>
                            </div>
                            
                            {/* Retry History */}
                            {node.retryHistory.length > 0 && (
                              <div>
                                <div className="text-sm font-medium text-gray-700 mb-2">Retry History</div>
                                <div className="space-y-2">
                                  {node.retryHistory.map((retry, i) => (
                                    <div key={i} className="flex items-center gap-2 text-sm">
                                      <span className="text-gray-500">Attempt {retry.attempt}:</span>
                                      <span className="text-red-600">{retry.error}</span>
                                      <span className="text-gray-400">
                                        at {format(new Date(retry.timestamp), 'HH:mm:ss')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Input/Output Preview */}
                            <div className="grid grid-cols-2 gap-4">
                              {node.input && (
                                <div>
                                  <div className="text-sm font-medium text-gray-700 mb-2">Input</div>
                                  <div className="bg-gray-50 p-3 rounded border text-xs font-mono max-h-32 overflow-y-auto">
                                    <JsonViewer data={node.input} />
                                  </div>
                                </div>
                              )}
                              
                              {node.output && (
                                <div>
                                  <div className="text-sm font-medium text-gray-700 mb-2">Output</div>
                                  <div className="bg-gray-50 p-3 rounded border text-xs font-mono max-h-32 overflow-y-auto">
                                    <JsonViewer data={node.output} />
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Error Details */}
                            {node.error && (
                              <div>
                                <div className="text-sm font-medium text-red-700 mb-2">Error</div>
                                <div className="bg-red-50 p-3 rounded border border-red-200 text-sm text-red-800">
                                  {node.error}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Node Inspector Panel */}
            {selectedNode && (
              <div className="w-96 bg-white border-l border-slate-200 overflow-y-auto">
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">Node Inspector</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedNode(null)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Node Info */}
                  <div>
                    <div className="text-sm font-medium text-gray-700">Node Information</div>
                    <div className="mt-2 space-y-2 text-sm">
                      <div><strong>Label:</strong> {selectedNode.nodeLabel}</div>
                      <div><strong>Type:</strong> {selectedNode.nodeType}</div>
                      <div><strong>Status:</strong> {selectedNode.status}</div>
                      <div><strong>Duration:</strong> {formatDuration(selectedNode.duration)}</div>
                      <div><strong>Attempts:</strong> {selectedNode.attempt}/{selectedNode.maxAttempts}</div>
                    </div>
                  </div>
                  
                  {/* Metadata */}
                  {Object.keys(selectedNode.metadata).length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-700">Metadata</div>
                      <div className="mt-2 space-y-1 text-sm">
                        {selectedNode.metadata.costUSD && (
                          <div><strong>Cost:</strong> {formatCost(selectedNode.metadata.costUSD)}</div>
                        )}
                        {selectedNode.metadata.tokensUsed && (
                          <div><strong>Tokens:</strong> {selectedNode.metadata.tokensUsed}</div>
                        )}
                        {selectedNode.metadata.cacheHit !== undefined && (
                          <div><strong>Cache Hit:</strong> {selectedNode.metadata.cacheHit ? 'Yes' : 'No'}</div>
                        )}
                        {selectedNode.metadata.httpStatusCode && (
                          <div><strong>HTTP Status:</strong> {selectedNode.metadata.httpStatusCode}</div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Full Input/Output */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-700">Data</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowJsonView(!showJsonView)}
                      >
                        {showJsonView ? 'Tree View' : 'JSON View'}
                      </Button>
                    </div>
                    
                    <div className="mt-2 space-y-4">
                      {selectedNode.input && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Input</div>
                          <div className="bg-gray-50 p-3 rounded border text-xs font-mono max-h-64 overflow-y-auto">
                            {showJsonView ? (
                              <pre>{JSON.stringify(selectedNode.input, null, 2)}</pre>
                            ) : (
                              <JsonViewer data={selectedNode.input} />
                            )}
                          </div>
                        </div>
                      )}
                      
                      {selectedNode.output && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Output</div>
                          <div className="bg-gray-50 p-3 rounded border text-xs font-mono max-h-64 overflow-y-auto">
                            {showJsonView ? (
                              <pre>{JSON.stringify(selectedNode.output, null, 2)}</pre>
                            ) : (
                              <JsonViewer data={selectedNode.output} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};