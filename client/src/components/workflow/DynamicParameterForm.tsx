/**
 * P2 Fix: Dynamic Parameter Forms using Schema-Driven Fields
 * 
 * Replaces generic JSON.stringify parameter inputs with proper
 * schema-driven forms based on app-specific parameter definitions.
 */

import React, { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { 
  Bot, 
  HelpCircle, 
  AlertCircle, 
  CheckCircle,
  Loader2,
  Sparkles
} from 'lucide-react';

interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'select' | 'textarea' | 'password';
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  defaultValue?: any;
}

interface DynamicParameterFormProps {
  app: string;
  operation: string;
  parameters: Record<string, any>;
  onChange: (parameters: Record<string, any>) => void;
  className?: string;
}

export const DynamicParameterForm: React.FC<DynamicParameterFormProps> = ({
  app,
  operation,
  parameters,
  onChange,
  className = ""
}) => {
  const [schema, setSchema] = useState<Record<string, ParameterSchema> | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  // Load parameter schema for the app/operation
  useEffect(() => {
    const loadSchema = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/app-schemas/schemas/${app}/${operation}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setSchema(result.parameters);
          }
        }
      } catch (error) {
        console.error('Failed to load parameter schema:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSchema();
  }, [app, operation]);

  // Validate parameters against schema
  const validateParameters = async () => {
    if (!schema) return;

    setValidationStatus('validating');
    try {
      const response = await fetch(`/api/app-schemas/schemas/${app}/${operation}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const newErrors: Record<string, string> = {};
          result.validation.errors.forEach((error: any) => {
            newErrors[error.field] = error.message;
          });
          setErrors(newErrors);
          setValidationStatus(result.validation.isValid ? 'valid' : 'invalid');
        }
      }
    } catch (error) {
      console.error('Validation failed:', error);
      setValidationStatus('invalid');
    }
  };

  // Handle parameter value change
  const handleParameterChange = (paramName: string, value: any) => {
    const newParameters = { ...parameters, [paramName]: value };
    onChange(newParameters);
    
    // Clear error for this field
    if (errors[paramName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[paramName];
        return newErrors;
      });
    }
  };

  // AI assist for specific parameter
  const handleAIAssist = async (paramName: string) => {
    try {
      const response = await fetch('/api/ai-assist/suggest-parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app,
          operation,
          context: {
            parameterName: paramName,
            currentParameters: parameters,
            userGoal: `optimize ${paramName} parameter`
          },
          userInput: `Suggest the best value for ${paramName} in ${app} ${operation}`
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.suggestions[paramName]) {
          const suggestion = result.suggestions[paramName];
          handleParameterChange(paramName, suggestion.value);
        }
      }
    } catch (error) {
      console.error('AI assist failed:', error);
    }
  };

  // Render form field based on schema type
  const renderField = (paramName: string, paramSchema: ParameterSchema) => {
    const value = parameters[paramName] ?? paramSchema.defaultValue ?? '';
    const hasError = !!errors[paramName];

    const baseInputClass = `bg-white border-slate-300 text-slate-900 text-sm focus:border-blue-500 focus:ring-blue-500/20 ${
      hasError ? 'border-red-300 focus:border-red-500' : ''
    }`;

    const fieldContent = () => {
      switch (paramSchema.type) {
        case 'textarea':
          return (
            <Textarea
              value={value}
              onChange={(e) => handleParameterChange(paramName, e.target.value)}
              placeholder={paramSchema.placeholder}
              className={baseInputClass}
              rows={3}
            />
          );

        case 'select':
          return (
            <Select value={value} onValueChange={(val) => handleParameterChange(paramName, val)}>
              <SelectTrigger className={baseInputClass}>
                <SelectValue placeholder={paramSchema.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {paramSchema.options?.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );

        case 'boolean':
          return (
            <div className="flex items-center space-x-2">
              <Switch
                checked={value}
                onCheckedChange={(checked) => handleParameterChange(paramName, checked)}
              />
              <Label className="text-sm">{value ? 'Enabled' : 'Disabled'}</Label>
            </div>
          );

        case 'number':
          return (
            <Input
              type="number"
              value={value}
              onChange={(e) => handleParameterChange(paramName, parseFloat(e.target.value) || 0)}
              placeholder={paramSchema.placeholder}
              min={paramSchema.validation?.min}
              max={paramSchema.validation?.max}
              className={baseInputClass}
            />
          );

        case 'email':
          return (
            <Input
              type="email"
              value={value}
              onChange={(e) => handleParameterChange(paramName, e.target.value)}
              placeholder={paramSchema.placeholder}
              className={baseInputClass}
            />
          );

        case 'url':
          return (
            <Input
              type="url"
              value={value}
              onChange={(e) => handleParameterChange(paramName, e.target.value)}
              placeholder={paramSchema.placeholder}
              className={baseInputClass}
            />
          );

        case 'password':
          return (
            <Input
              type="password"
              value={value}
              onChange={(e) => handleParameterChange(paramName, e.target.value)}
              placeholder={paramSchema.placeholder}
              className={baseInputClass}
            />
          );

        default: // string
          return (
            <Input
              type="text"
              value={value}
              onChange={(e) => handleParameterChange(paramName, e.target.value)}
              placeholder={paramSchema.placeholder}
              className={baseInputClass}
            />
          );
      }
    };

    return (
      <div key={paramName} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-slate-700">
              {paramSchema.label}
              {paramSchema.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {paramSchema.description && (
              <div className="group relative">
                <HelpCircle className="w-4 h-4 text-slate-400 cursor-help" />
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                  <div className="bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    {paramSchema.description}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* AI Assist Button for each field */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAIAssist(paramName)}
            className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          >
            <Bot className="w-3 h-3 mr-1" />
            AI
          </Button>
        </div>

        {fieldContent()}

        {/* Error message */}
        {hasError && (
          <div className="flex items-center gap-1 text-red-600 text-xs">
            <AlertCircle className="w-3 h-3" />
            {errors[paramName]}
          </div>
        )}

        {/* Success indicator */}
        {!hasError && value && paramSchema.required && (
          <div className="flex items-center gap-1 text-green-600 text-xs">
            <CheckCircle className="w-3 h-3" />
            Valid
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-slate-600">Loading parameter schema...</span>
      </div>
    );
  }

  if (!schema) {
    // Fallback to generic form if no schema available
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            Parameters
            <Badge variant="outline" className="ml-auto">Generic Form</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Textarea
              value={JSON.stringify(parameters, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  onChange(parsed);
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              placeholder="Enter parameters as JSON..."
              rows={6}
              className="font-mono text-sm"
            />
            <div className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              No parameter schema available for {app}:{operation}. Using generic JSON editor.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            Parameters
            <Badge variant="outline" className="ml-2">Schema-Driven</Badge>
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={validateParameters}
              disabled={validationStatus === 'validating'}
              className="h-8 text-xs"
            >
              {validationStatus === 'validating' ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Validate
                </>
              )}
            </Button>
            
            {validationStatus === 'valid' && (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                ✓ Valid
              </Badge>
            )}
            {validationStatus === 'invalid' && (
              <Badge className="bg-red-100 text-red-800 border-red-200">
                ✗ Errors
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(schema).map(([paramName, paramSchema]) => 
            renderField(paramName, paramSchema)
          )}
          
          {Object.keys(schema).length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-sm">No parameters required for this operation</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};