/**
 * AIParameterEditor - Smart parameter editor supporting Static/AI/Reference modes
 * Transforms every parameter into an intelligent field that can be:
 * - Static: Normal value input
 * - Use AI: LLM-powered dynamic value generation
 * - Use Reference: Reference to previous node outputs
 */

import React, { useState } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent } from '../ui/card';
import { 
  Bot, 
  Link, 
  Type, 
  Sparkles, 
  Settings, 
  ChevronDown,
  ChevronUp,
  Cpu,
  Zap
} from 'lucide-react';

// Type definitions (matching server-side types)
export type ParamMode = 'static' | 'llm' | 'ref';

export interface AIParamValue {
  mode: ParamMode;
  value?: any;
  // LLM mode properties
  provider?: 'openai' | 'anthropic' | 'google';
  model?: string;
  prompt?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: any;
  cacheTtlSec?: number;
  // Reference mode properties
  nodeId?: string;
  path?: string;
}

interface AIParameterEditorProps {
  paramName: string;
  value: any;
  onChange: (newValue: any) => void;
  availableNodes?: Array<{ id: string; label: string }>;
  className?: string;
}

export const AIParameterEditor: React.FC<AIParameterEditorProps> = ({
  paramName,
  value,
  onChange,
  availableNodes = [],
  className = ""
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Determine current mode and parsed value
  const currentValue: AIParamValue = React.useMemo(() => {
    if (typeof value === 'object' && value !== null && 'mode' in value) {
      return value as AIParamValue;
    }
    // Default to static mode for backwards compatibility
    return { mode: 'static', value };
  }, [value]);

  const handleModeChange = (newMode: ParamMode) => {
    let newValue: AIParamValue;
    
    switch (newMode) {
      case 'static':
        newValue = {
          mode: 'static',
          value: typeof currentValue.value === 'string' ? currentValue.value : ''
        };
        break;
      case 'llm':
        newValue = {
          mode: 'llm',
          provider: 'openai',
          model: 'openai:gpt-4o-mini',
          prompt: '',
          temperature: 0.2,
          maxTokens: 512,
          cacheTtlSec: 300
        };
        break;
      case 'ref':
        newValue = {
          mode: 'ref',
          nodeId: availableNodes[0]?.id || '',
          path: '$'
        };
        break;
    }
    
    onChange(newValue);
  };

  const handleValueUpdate = (updates: Partial<AIParamValue>) => {
    onChange({ ...currentValue, ...updates });
  };

  const getModeIcon = (mode: ParamMode) => {
    switch (mode) {
      case 'static': return <Type className="w-4 h-4" />;
      case 'llm': return <Bot className="w-4 h-4" />;
      case 'ref': return <Link className="w-4 h-4" />;
    }
  };

  const getModeColor = (mode: ParamMode) => {
    switch (mode) {
      case 'static': return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
      case 'llm': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'ref': return 'bg-green-500/20 text-green-300 border-green-500/30';
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400 font-medium">{paramName}</label>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={`text-xs px-2 py-1 ${getModeColor(currentValue.mode)}`}>
            {getModeIcon(currentValue.mode)}
            <span className="ml-1 capitalize">{currentValue.mode === 'llm' ? 'AI' : currentValue.mode}</span>
          </Badge>
          {(currentValue.mode === 'llm' || currentValue.mode === 'ref') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 p-0 text-slate-400 hover:text-white"
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          )}
        </div>
      </div>

      {/* Mode Selection */}
      <div className="flex gap-1">
        {(['static', 'llm', 'ref'] as ParamMode[]).map((mode) => (
          <Button
            key={mode}
            variant={currentValue.mode === mode ? "default" : "outline"}
            size="sm"
            onClick={() => handleModeChange(mode)}
            className={`flex-1 text-xs h-8 ${
              currentValue.mode === mode 
                ? getModeColor(mode) 
                : 'bg-slate-800/50 border-slate-600/50 text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            {getModeIcon(mode)}
            <span className="ml-1">
              {mode === 'static' ? 'Static' : mode === 'llm' ? 'AI' : 'Ref'}
            </span>
          </Button>
        ))}
      </div>

      {/* Static Mode Editor */}
      {currentValue.mode === 'static' && (
        <div>
          <Input
            value={currentValue.value || ''}
            onChange={(e) => handleValueUpdate({ value: e.target.value })}
            placeholder={`Enter ${paramName}...`}
            className="bg-slate-800 border-slate-600 text-white text-sm"
          />
        </div>
      )}

      {/* Reference Mode Editor */}
      {currentValue.mode === 'ref' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Node</label>
              <Select
                value={currentValue.nodeId || ''}
                onValueChange={(nodeId) => handleValueUpdate({ nodeId })}
              >
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-600">
                  <SelectValue placeholder="Select node" />
                </SelectTrigger>
                <SelectContent>
                  {availableNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id} className="text-xs">
                      {node.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Path</label>
              <Input
                value={currentValue.path || '$'}
                onChange={(e) => handleValueUpdate({ path: e.target.value })}
                placeholder="$.field.path"
                className="h-8 text-xs bg-slate-800 border-slate-600 text-white"
              />
            </div>
          </div>
          {isExpanded && (
            <Card className="bg-slate-800/50 border-slate-600/50">
              <CardContent className="p-3">
                <div className="text-xs text-slate-400 space-y-1">
                  <div><strong>Examples:</strong></div>
                  <div>• <code>$</code> - entire output</div>
                  <div>• <code>email.subject</code> - nested field</div>
                  <div>• <code>items.0.name</code> - array index</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* LLM Mode Editor */}
      {currentValue.mode === 'llm' && (
        <div className="space-y-2">
          {/* Prompt */}
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              <Sparkles className="w-3 h-3 inline mr-1" />
              AI Prompt
            </label>
            <Textarea
              value={currentValue.prompt || ''}
              onChange={(e) => handleValueUpdate({ prompt: e.target.value })}
              placeholder={`Generate ${paramName} based on context...`}
              rows={2}
              className="bg-slate-800 border-slate-600 text-white text-sm resize-none"
            />
          </div>

          {/* Provider & Model */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Provider</label>
              <Select
                value={currentValue.provider || 'openai'}
                onValueChange={(provider) => handleValueUpdate({ provider: provider as any })}
              >
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Model</label>
              <Select
                value={currentValue.model || 'openai:gpt-4o-mini'}
                onValueChange={(model) => handleValueUpdate({ model })}
              >
                <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentValue.provider === 'openai' && (
                    <>
                      <SelectItem value="openai:gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="openai:gpt-4.1">GPT-4.1</SelectItem>
                      <SelectItem value="openai:o3-mini">O3 Mini</SelectItem>
                    </>
                  )}
                  {currentValue.provider === 'anthropic' && (
                    <>
                      <SelectItem value="anthropic:claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="anthropic:claude-3-haiku">Claude 3 Haiku</SelectItem>
                    </>
                  )}
                  {currentValue.provider === 'google' && (
                    <>
                      <SelectItem value="google:gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                      <SelectItem value="google:gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advanced Settings */}
          {isExpanded && (
            <Card className="bg-slate-800/50 border-slate-600/50">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                  <Settings className="w-3 h-3" />
                  <span>Advanced Settings</span>
                </div>
                
                {/* System Prompt */}
                <div>
                  <label className="text-xs text-slate-500 block mb-1">System Prompt</label>
                  <Textarea
                    value={currentValue.system || ''}
                    onChange={(e) => handleValueUpdate({ system: e.target.value })}
                    placeholder="You are a helpful assistant..."
                    rows={2}
                    className="bg-slate-700 border-slate-600 text-white text-xs resize-none"
                  />
                </div>

                {/* Temperature & Max Tokens */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Temperature</label>
                    <Input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={currentValue.temperature || 0.2}
                      onChange={(e) => handleValueUpdate({ temperature: parseFloat(e.target.value) })}
                      className="h-7 text-xs bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Max Tokens</label>
                    <Input
                      type="number"
                      min="1"
                      max="4000"
                      value={currentValue.maxTokens || 512}
                      onChange={(e) => handleValueUpdate({ maxTokens: parseInt(e.target.value) })}
                      className="h-7 text-xs bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                </div>

                {/* Cache TTL */}
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Cache Duration (seconds)</label>
                  <Input
                    type="number"
                    min="0"
                    max="3600"
                    value={currentValue.cacheTtlSec || 300}
                    onChange={(e) => handleValueUpdate({ cacheTtlSec: parseInt(e.target.value) })}
                    className="h-7 text-xs bg-slate-700 border-slate-600 text-white"
                  />
                </div>

                {/* Template Syntax Help */}
                <div className="text-xs text-slate-400 space-y-1">
                  <div><strong>Template Syntax:</strong></div>
                  <div>• <code>{`{{ref:nodeId.field}}`}</code> - reference node output</div>
                  <div>• <code>{`{{ref:nodeId}}`}</code> - entire node output</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};