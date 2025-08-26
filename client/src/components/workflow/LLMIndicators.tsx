/**
 * LLMIndicators - Visual indicators for AI-powered fields in the workflow graph
 * Shows sparkle effects, badges, and status indicators for LLM-enhanced nodes
 */

import React from 'react';
import { Bot, Sparkles, Zap, Brain, Cpu, Eye, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export interface LLMIndicatorProps {
  mode: 'static' | 'llm' | 'ref';
  isExecuting?: boolean;
  hasError?: boolean;
  confidence?: number;
  provider?: string;
  cost?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export const LLMIndicator: React.FC<LLMIndicatorProps> = ({
  mode,
  isExecuting = false,
  hasError = false,
  confidence,
  provider,
  cost,
  className = '',
  size = 'md',
  animated = true
}) => {
  if (mode === 'static') return null;

  const sizeClasses = {
    sm: 'w-3 h-3 text-xs',
    md: 'w-4 h-4 text-sm',
    lg: 'w-5 h-5 text-base'
  };

  const baseClasses = `inline-flex items-center justify-center rounded-full ${sizeClasses[size]} ${className}`;

  if (mode === 'ref') {
    return (
      <div className={`${baseClasses} bg-blue-100 text-blue-600 border border-blue-200`}>
        <Zap className="w-full h-full" />
      </div>
    );
  }

  // LLM mode indicators
  const getStatusColor = () => {
    if (hasError) return 'text-red-500 bg-red-50 border-red-200';
    if (isExecuting) return 'text-blue-500 bg-blue-50 border-blue-200';
    return 'text-purple-500 bg-purple-50 border-purple-200';
  };

  const getStatusIcon = () => {
    if (hasError) return AlertCircle;
    if (isExecuting) return Clock;
    return Bot;
  };

  const StatusIcon = getStatusIcon();

  return (
    <div className={`${baseClasses} ${getStatusColor()} border relative group`}>
      <StatusIcon className="w-full h-full" />
      
      {animated && mode === 'llm' && !hasError && (
        <div className="absolute inset-0 rounded-full">
          <SparkleEffect />
        </div>
      )}

      {/* Tooltip with details */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
        <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
          <div className="flex items-center gap-1">
            {mode === 'llm' ? (
              <>
                <Bot className="w-3 h-3" />
                AI-Powered
                {provider && <span className="text-gray-300">({provider})</span>}
              </>
            ) : (
              <>
                <Zap className="w-3 h-3" />
                Reference
              </>
            )}
          </div>
          {confidence && (
            <div className="text-gray-300">
              Confidence: {Math.round(confidence * 100)}%
            </div>
          )}
          {cost && (
            <div className="text-gray-300">
              Est. cost: ${cost.toFixed(4)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface NodeLLMBadgeProps {
  nodeId: string;
  llmFieldCount: number;
  refFieldCount: number;
  isExecuting?: boolean;
  hasErrors?: boolean;
  totalCost?: number;
  className?: string;
}

export const NodeLLMBadge: React.FC<NodeLLMBadgeProps> = ({
  nodeId,
  llmFieldCount,
  refFieldCount,
  isExecuting = false,
  hasErrors = false,
  totalCost,
  className = ''
}) => {
  if (llmFieldCount === 0 && refFieldCount === 0) return null;

  const getBadgeColor = () => {
    if (hasErrors) return 'bg-red-500 text-white';
    if (isExecuting) return 'bg-blue-500 text-white animate-pulse';
    if (llmFieldCount > 0) return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white';
    return 'bg-blue-500 text-white';
  };

  const getIcon = () => {
    if (hasErrors) return AlertCircle;
    if (isExecuting) return Clock;
    if (llmFieldCount > 0) return Brain;
    return Zap;
  };

  const Icon = getIcon();
  const totalFields = llmFieldCount + refFieldCount;

  return (
    <div className={`absolute -top-2 -right-2 ${className}`}>
      <div className={`${getBadgeColor()} rounded-full px-2 py-1 text-xs font-medium flex items-center gap-1 shadow-lg`}>
        <Icon className="w-3 h-3" />
        {totalFields}
        {llmFieldCount > 0 && <SparkleIcon className="w-2 h-2" />}
      </div>
      
      {/* Detailed tooltip */}
      <div className="absolute top-full right-0 mt-1 opacity-0 hover:opacity-100 transition-opacity z-50 group">
        <div className="bg-gray-900 text-white text-xs rounded px-3 py-2 whitespace-nowrap">
          <div className="font-medium mb-1">AI-Enhanced Node</div>
          {llmFieldCount > 0 && (
            <div className="flex items-center gap-1 text-purple-300">
              <Brain className="w-3 h-3" />
              {llmFieldCount} AI field{llmFieldCount !== 1 ? 's' : ''}
            </div>
          )}
          {refFieldCount > 0 && (
            <div className="flex items-center gap-1 text-blue-300">
              <Zap className="w-3 h-3" />
              {refFieldCount} reference{refFieldCount !== 1 ? 's' : ''}
            </div>
          )}
          {totalCost && (
            <div className="text-gray-300 mt-1">
              Est. cost: ${totalCost.toFixed(4)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface LLMExecutionStatusProps {
  status: 'idle' | 'executing' | 'success' | 'error';
  progress?: number;
  message?: string;
  tokensUsed?: number;
  cost?: number;
  duration?: number;
  className?: string;
}

export const LLMExecutionStatus: React.FC<LLMExecutionStatusProps> = ({
  status,
  progress,
  message,
  tokensUsed,
  cost,
  duration,
  className = ''
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'executing':
        return {
          color: 'text-blue-500 bg-blue-50 border-blue-200',
          icon: Clock,
          label: 'Processing...'
        };
      case 'success':
        return {
          color: 'text-green-500 bg-green-50 border-green-200',
          icon: CheckCircle,
          label: 'Complete'
        };
      case 'error':
        return {
          color: 'text-red-500 bg-red-50 border-red-200',
          icon: AlertCircle,
          label: 'Error'
        };
      default:
        return {
          color: 'text-gray-500 bg-gray-50 border-gray-200',
          icon: Bot,
          label: 'Ready'
        };
    }
  };

  const { color, icon: Icon, label } = getStatusConfig();

  return (
    <div className={`rounded-lg border p-3 ${color} ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="font-medium">{label}</span>
        {status === 'executing' && progress && (
          <div className="flex-1 bg-gray-200 rounded-full h-2 ml-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>

      {message && (
        <div className="text-sm opacity-75 mb-2">{message}</div>
      )}

      {(tokensUsed || cost || duration) && (
        <div className="flex items-center gap-4 text-xs opacity-75">
          {tokensUsed && (
            <div className="flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {tokensUsed.toLocaleString()} tokens
            </div>
          )}
          {cost && (
            <div>${cost.toFixed(4)}</div>
          )}
          {duration && (
            <div>{duration}ms</div>
          )}
        </div>
      )}
    </div>
  );
};

export const WorkflowLLMSummary: React.FC<{
  totalLLMNodes: number;
  totalCost: number;
  isExecuting: boolean;
  executionTime?: number;
  className?: string;
}> = ({ totalLLMNodes, totalCost, isExecuting, executionTime, className = '' }) => {
  if (totalLLMNodes === 0) return null;

  return (
    <div className={`bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-purple-100 rounded-full">
            <Brain className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <div className="font-medium text-purple-800">
              AI-Enhanced Workflow
            </div>
            <div className="text-sm text-purple-600">
              {totalLLMNodes} AI-powered node{totalLLMNodes !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-medium text-purple-800">
            ${totalCost.toFixed(4)}
          </div>
          <div className="text-xs text-purple-600">
            estimated cost
          </div>
          {executionTime && (
            <div className="text-xs text-purple-600">
              {executionTime}ms
            </div>
          )}
        </div>
      </div>

      {isExecuting && (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-sm text-purple-600">
            <div className="animate-spin">
              <Sparkles className="w-3 h-3" />
            </div>
            Processing AI requests...
          </div>
        </div>
      )}
    </div>
  );
};

// Sparkle animation component
const SparkleEffect: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="sparkle sparkle-1">✨</div>
      <div className="sparkle sparkle-2">✨</div>
      <div className="sparkle sparkle-3">✨</div>
      <style jsx>{`
        .sparkle {
          position: absolute;
          animation: sparkle 2s infinite;
          font-size: 8px;
        }
        .sparkle-1 {
          top: -2px;
          left: -2px;
          animation-delay: 0s;
        }
        .sparkle-2 {
          top: -2px;
          right: -2px;
          animation-delay: 0.7s;
        }
        .sparkle-3 {
          bottom: -2px;
          left: 50%;
          transform: translateX(-50%);
          animation-delay: 1.4s;
        }
        @keyframes sparkle {
          0%, 20% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1); }
          80%, 100% { opacity: 0; transform: scale(0); }
        }
      `}</style>
    </div>
  );
};

const SparkleIcon: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor">
      <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" />
    </svg>
  );
};

// Hook for managing LLM indicators in nodes
export const useLLMIndicators = (nodeData: any) => {
  const analyzeLLMFields = React.useCallback(() => {
    if (!nodeData || !nodeData.params) {
      return { llmFieldCount: 0, refFieldCount: 0, estimatedCost: 0 };
    }

    let llmFieldCount = 0;
    let refFieldCount = 0;
    let estimatedCost = 0;

    const analyzeValue = (value: any) => {
      if (value && typeof value === 'object' && value.mode) {
        if (value.mode === 'llm') {
          llmFieldCount++;
          // Rough cost estimation
          const promptLength = (value.prompt || '').length;
          estimatedCost += Math.max(0.0001, promptLength * 0.00001);
        } else if (value.mode === 'ref') {
          refFieldCount++;
        }
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(analyzeValue);
      }
    };

    Object.values(nodeData.params).forEach(analyzeValue);

    return { llmFieldCount, refFieldCount, estimatedCost };
  }, [nodeData]);

  return analyzeLLMFields();
};