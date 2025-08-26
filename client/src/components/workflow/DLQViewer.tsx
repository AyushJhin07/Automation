/**
 * DLQ VIEWER - Dead Letter Queue management interface
 * Displays failed executions that require manual intervention or replay
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { 
  AlertTriangle,
  RefreshCw,
  Trash2,
  Eye,
  Play,
  Clock,
  XCircle,
  Search,
  Filter,
  Download,
  BarChart3,
  AlertCircle,
  Settings,
  Bug,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';

interface DLQItem {
  nodeId: string;
  executionId: string;
  attempts: Array<{
    attempt: number;
    timestamp: Date;
    error?: string;
    nextRetryAt?: Date;
  }>;
  policy: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterEnabled: boolean;
    retryableErrors: string[];
  };
  status: 'pending' | 'retrying' | 'succeeded' | 'failed' | 'dlq';
  idempotencyKey?: string;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DLQViewerProps {
  onClose?: () => void;
}

export const DLQViewer: React.FC<DLQViewerProps> = ({ onClose }) => {
  const [dlqItems, setDlqItems] = useState<DLQItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<DLQItem | null>(null);
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDLQItems();
  }, []);

  const loadDLQItems = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dlq');
      const data = await response.json();
      setDlqItems(data.items || []);
    } catch (error) {
      console.error('Failed to load DLQ items:', error);
    } finally {
      setLoading(false);
    }
  };

  const replayItem = async (executionId: string, nodeId: string) => {
    const itemKey = `${executionId}:${nodeId}`;
    setProcessingItems(prev => new Set(prev).add(itemKey));
    
    try {
      const response = await fetch(`/api/executions/${executionId}/nodes/${nodeId}/retry`, {
        method: 'POST'
      });
      
      if (response.ok) {
        await loadDLQItems(); // Refresh the list
      } else {
        throw new Error('Failed to replay item');
      }
    } catch (error) {
      console.error('Failed to replay DLQ item:', error);
    } finally {
      setProcessingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemKey);
        return newSet;
      });
    }
  };

  const deleteItem = async (executionId: string, nodeId: string) => {
    const itemKey = `${executionId}:${nodeId}`;
    setProcessingItems(prev => new Set(prev).add(itemKey));
    
    try {
      // TODO: Implement DLQ item deletion API
      console.log('Delete DLQ item:', itemKey);
      await loadDLQItems();
    } catch (error) {
      console.error('Failed to delete DLQ item:', error);
    } finally {
      setProcessingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemKey);
        return newSet;
      });
    }
  };

  const replayAll = async () => {
    setLoading(true);
    try {
      // Replay all items in parallel with a delay between them
      for (const item of dlqItems) {
        await replayItem(item.executionId, item.nodeId);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    } catch (error) {
      console.error('Failed to replay all items:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = async () => {
    if (!confirm('Are you sure you want to clear all DLQ items? This action cannot be undone.')) {
      return;
    }
    
    setLoading(true);
    try {
      // TODO: Implement clear all API
      console.log('Clear all DLQ items');
      await loadDLQItems();
    } catch (error) {
      console.error('Failed to clear all items:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportDLQData = () => {
    const csvData = dlqItems.map(item => ({
      executionId: item.executionId,
      nodeId: item.nodeId,
      lastError: item.lastError,
      attempts: item.attempts.length,
      createdAt: format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      updatedAt: format(new Date(item.updatedAt), 'yyyy-MM-dd HH:mm:ss')
    }));
    
    const csv = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dlq-items-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredItems = dlqItems.filter(item => 
    !searchTerm || 
    item.nodeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.executionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.lastError?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getErrorCategory = (error?: string) => {
    if (!error) return 'Unknown';
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('timeout') || errorLower.includes('timed out')) return 'Timeout';
    if (errorLower.includes('rate limit') || errorLower.includes('429')) return 'Rate Limit';
    if (errorLower.includes('network') || errorLower.includes('connection')) return 'Network';
    if (errorLower.includes('authentication') || errorLower.includes('unauthorized')) return 'Auth';
    if (errorLower.includes('validation') || errorLower.includes('schema')) return 'Validation';
    if (errorLower.includes('500') || errorLower.includes('internal server')) return 'Server Error';
    
    return 'Other';
  };

  const getErrorCategoryColor = (category: string) => {
    switch (category) {
      case 'Timeout': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'Rate Limit': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Network': return 'bg-red-100 text-red-800 border-red-300';
      case 'Auth': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'Validation': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Server Error': return 'bg-red-200 text-red-900 border-red-400';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (loading && dlqItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
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
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">Dead Letter Queue</h2>
              <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                {dlqItems.length} items
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportDLQData}
              disabled={dlqItems.length === 0}
              className="text-gray-600"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={replayAll}
              disabled={dlqItems.length === 0 || loading}
              className="text-green-600"
            >
              <Play className="w-4 h-4 mr-1" />
              Replay All
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={dlqItems.length === 0 || loading}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={loadDLQItems}
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
        
        {/* Search and Stats */}
        <div className="flex items-center gap-4 mt-4">
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search by node, execution, or error..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>
          
          <div className="text-sm text-gray-500">
            {filteredItems.length} of {dlqItems.length} items
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* DLQ Items List */}
        <div className="flex-1 overflow-y-auto p-6">
          {dlqItems.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Items in DLQ</h3>
              <p className="text-gray-500">
                All workflow executions are running smoothly. Failed items will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItems.map((item) => {
                const itemKey = `${item.executionId}:${item.nodeId}`;
                const isProcessing = processingItems.has(itemKey);
                const errorCategory = getErrorCategory(item.lastError);
                
                return (
                  <Card key={itemKey} className="border-l-4 border-l-red-500">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <XCircle className="w-5 h-5 text-red-500" />
                          <div>
                            <CardTitle className="text-base">{item.nodeId}</CardTitle>
                            <div className="text-sm text-gray-500">
                              Execution: {item.executionId}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={getErrorCategoryColor(errorCategory)}>
                            {errorCategory}
                          </Badge>
                          
                          <Badge variant="outline" className="bg-red-100 text-red-800">
                            {item.attempts.length} attempts
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      {/* Error Details */}
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-1">Last Error</div>
                        <div className="bg-red-50 p-3 rounded border border-red-200 text-sm text-red-800">
                          {item.lastError}
                        </div>
                      </div>
                      
                      {/* Attempt History */}
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-2">Attempt History</div>
                        <div className="space-y-2">
                          {item.attempts.map((attempt, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              <span className="text-gray-500">#{attempt.attempt}:</span>
                              <span className="text-red-600 flex-1">{attempt.error}</span>
                              <span className="text-gray-400">
                                {format(new Date(attempt.timestamp), 'MMM d, HH:mm:ss')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Metadata */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Created:</span>
                          <span className="ml-2">{format(new Date(item.createdAt), 'MMM d, HH:mm:ss')}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Updated:</span>
                          <span className="ml-2">{format(new Date(item.updatedAt), 'MMM d, HH:mm:ss')}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Max Attempts:</span>
                          <span className="ml-2">{item.policy.maxAttempts}</span>
                        </div>
                        {item.idempotencyKey && (
                          <div>
                            <span className="text-gray-500">Idempotency:</span>
                            <span className="ml-2 font-mono text-xs">{item.idempotencyKey}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedItem(item)}
                          className="text-blue-600"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Inspect
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => replayItem(item.executionId, item.nodeId)}
                          disabled={isProcessing}
                          className="text-green-600"
                        >
                          {isProcessing ? (
                            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 mr-1" />
                          )}
                          Replay
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteItem(item.executionId, item.nodeId)}
                          disabled={isProcessing}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Item Inspector */}
        {selectedItem && (
          <div className="w-96 bg-white border-l border-slate-200 overflow-y-auto">
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">DLQ Item Details</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItem(null)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Basic Info */}
              <div>
                <div className="text-sm font-medium text-gray-700">Item Information</div>
                <div className="mt-2 space-y-2 text-sm">
                  <div><strong>Node ID:</strong> {selectedItem.nodeId}</div>
                  <div><strong>Execution ID:</strong> {selectedItem.executionId}</div>
                  <div><strong>Status:</strong> {selectedItem.status}</div>
                  <div><strong>Total Attempts:</strong> {selectedItem.attempts.length}</div>
                </div>
              </div>
              
              {/* Policy Details */}
              <div>
                <div className="text-sm font-medium text-gray-700">Retry Policy</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div><strong>Max Attempts:</strong> {selectedItem.policy.maxAttempts}</div>
                  <div><strong>Initial Delay:</strong> {selectedItem.policy.initialDelayMs}ms</div>
                  <div><strong>Max Delay:</strong> {selectedItem.policy.maxDelayMs}ms</div>
                  <div><strong>Backoff Multiplier:</strong> {selectedItem.policy.backoffMultiplier}</div>
                  <div><strong>Jitter Enabled:</strong> {selectedItem.policy.jitterEnabled ? 'Yes' : 'No'}</div>
                </div>
              </div>
              
              {/* Retryable Errors */}
              <div>
                <div className="text-sm font-medium text-gray-700">Retryable Errors</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedItem.policy.retryableErrors.map((error, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {error}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {/* Full Error History */}
              <div>
                <div className="text-sm font-medium text-gray-700">Complete Error History</div>
                <div className="mt-2 space-y-2">
                  {selectedItem.attempts.map((attempt, index) => (
                    <div key={index} className="border border-gray-200 rounded p-2">
                      <div className="text-xs text-gray-500 mb-1">
                        Attempt #{attempt.attempt} - {format(new Date(attempt.timestamp), 'MMM d, yyyy HH:mm:ss')}
                      </div>
                      <div className="text-sm text-red-700 font-mono">
                        {attempt.error}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};