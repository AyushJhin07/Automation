// DYNAMIC PARAMETER FORM - GENERATES UI FORMS FOR FUNCTION PARAMETERS
// Provides type-safe, validated input forms for all application functions

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';
import { 
  AlertCircle, 
  Info, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff,
  HelpCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  options?: string[];
  default?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
  sensitive?: boolean; // For passwords, API keys, etc.
  placeholder?: string;
  helpText?: string;
}

export interface FunctionDefinition {
  id: string;
  name: string;
  description: string;
  category: 'action' | 'trigger' | 'both';
  parameters: Record<string, ParameterDefinition>;
  requiredScopes?: string[];
  rateLimits?: {
    requests: number;
    period: string;
  };
  pricing?: {
    cost: number;
    currency: string;
    unit: string;
  };
}

interface DynamicParameterFormProps {
  functionDef: FunctionDefinition;
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  showAdvanced?: boolean;
  className?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

export const DynamicParameterForm: React.FC<DynamicParameterFormProps> = ({
  functionDef,
  initialValues = {},
  onSubmit,
  onCancel,
  isLoading = false,
  showAdvanced = false,
  className = ''
}) => {
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [arrayValues, setArrayValues] = useState<Record<string, string[]>>({});
  const [showHelp, setShowHelp] = useState<Record<string, boolean>>({});

  // Initialize form values with defaults
  useEffect(() => {
    const defaultValues: Record<string, any> = {};
    const defaultArrayValues: Record<string, string[]> = {};

    Object.entries(functionDef.parameters).forEach(([key, param]) => {
      if (param.default !== undefined) {
        defaultValues[key] = param.default;
      }
      if (param.type === 'array') {
        defaultArrayValues[key] = Array.isArray(initialValues[key]) 
          ? initialValues[key] 
          : [];
      }
    });

    setValues({ ...defaultValues, ...initialValues });
    setArrayValues(defaultArrayValues);
  }, [functionDef, initialValues]);

  // Validate individual field
  const validateField = (key: string, value: any, param: ParameterDefinition): string | null => {
    // Required field validation
    if (param.required && (value === undefined || value === null || value === '')) {
      return `${key} is required`;
    }

    if (value === undefined || value === null || value === '') {
      return null; // Skip validation for empty optional fields
    }

    // Type-specific validation
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') return `${key} must be a string`;
        if (param.validation?.minLength && value.length < param.validation.minLength) {
          return `${key} must be at least ${param.validation.minLength} characters`;
        }
        if (param.validation?.maxLength && value.length > param.validation.maxLength) {
          return `${key} must be no more than ${param.validation.maxLength} characters`;
        }
        if (param.validation?.pattern && !new RegExp(param.validation.pattern).test(value)) {
          return `${key} format is invalid`;
        }
        break;

      case 'number':
        const numValue = Number(value);
        if (isNaN(numValue)) return `${key} must be a number`;
        if (param.validation?.min !== undefined && numValue < param.validation.min) {
          return `${key} must be at least ${param.validation.min}`;
        }
        if (param.validation?.max !== undefined && numValue > param.validation.max) {
          return `${key} must be no more than ${param.validation.max}`;
        }
        break;

      case 'array':
        if (!Array.isArray(value)) return `${key} must be an array`;
        if (param.validation?.min && value.length < param.validation.min) {
          return `${key} must have at least ${param.validation.min} items`;
        }
        if (param.validation?.max && value.length > param.validation.max) {
          return `${key} must have no more than ${param.validation.max} items`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') return `${key} must be true or false`;
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return `${key} must be an object`;
        }
        break;
    }

    return null;
  };

  // Validate all fields
  const validateForm = (): ValidationError[] => {
    const newErrors: ValidationError[] = [];

    Object.entries(functionDef.parameters).forEach(([key, param]) => {
      const value = param.type === 'array' ? arrayValues[key] : values[key];
      const error = validateField(key, value, param);
      if (error) {
        newErrors.push({ field: key, message: error });
      }
    });

    return newErrors;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    setErrors(validationErrors);

    if (validationErrors.length === 0) {
      // Prepare final values with proper types
      const finalValues: Record<string, any> = {};
      
      Object.entries(functionDef.parameters).forEach(([key, param]) => {
        let value = param.type === 'array' ? arrayValues[key] : values[key];
        
        // Type conversion
        if (value !== undefined && value !== null && value !== '') {
          switch (param.type) {
            case 'number':
              finalValues[key] = Number(value);
              break;
            case 'boolean':
              finalValues[key] = Boolean(value);
              break;
            case 'object':
              try {
                finalValues[key] = typeof value === 'string' ? JSON.parse(value) : value;
              } catch {
                finalValues[key] = value;
              }
              break;
            default:
              finalValues[key] = value;
          }
        }
      });

      onSubmit(finalValues);
    }
  };

  // Handle input change
  const handleInputChange = (key: string, value: any) => {
    setValues(prev => ({ ...prev, [key]: value }));
    
    // Clear error for this field
    setErrors(prev => prev.filter(error => error.field !== key));
  };

  // Handle array input changes
  const handleArrayChange = (key: string, index: number, value: string) => {
    setArrayValues(prev => ({
      ...prev,
      [key]: prev[key]?.map((item, i) => i === index ? value : item) || []
    }));
  };

  const addArrayItem = (key: string) => {
    setArrayValues(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), '']
    }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setArrayValues(prev => ({
      ...prev,
      [key]: prev[key]?.filter((_, i) => i !== index) || []
    }));
  };

  // Get error for field
  const getFieldError = (field: string): string | undefined => {
    return errors.find(error => error.field === field)?.message;
  };

  // Render input based on parameter type
  const renderInput = (key: string, param: ParameterDefinition) => {
    const error = getFieldError(key);
    const value = values[key] || '';

    switch (param.type) {
      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={key}
              checked={Boolean(values[key])}
              onCheckedChange={(checked) => handleInputChange(key, checked)}
              disabled={isLoading}
            />
            <Label htmlFor={key} className="text-sm font-medium">
              {param.description}
            </Label>
          </div>
        );

      case 'number':
        return (
          <Input
            id={key}
            type="number"
            value={value}
            onChange={(e) => handleInputChange(key, e.target.value)}
            placeholder={param.placeholder || `Enter ${key}`}
            disabled={isLoading}
            min={param.validation?.min}
            max={param.validation?.max}
            className={error ? 'border-red-500' : ''}
          />
        );

      case 'array':
        const arrayItems = arrayValues[key] || [];
        return (
          <div className="space-y-2">
            {arrayItems.map((item, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={item}
                  onChange={(e) => handleArrayChange(key, index, e.target.value)}
                  placeholder={`Item ${index + 1}`}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeArrayItem(key, index)}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addArrayItem(key)}
              disabled={isLoading}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        );

      case 'object':
        return (
          <Textarea
            id={key}
            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
            onChange={(e) => handleInputChange(key, e.target.value)}
            placeholder={param.placeholder || 'Enter JSON object'}
            disabled={isLoading}
            rows={4}
            className={error ? 'border-red-500' : ''}
          />
        );

      default: // string
        if (param.options) {
          return (
            <Select
              value={value}
              onValueChange={(newValue) => handleInputChange(key, newValue)}
              disabled={isLoading}
            >
              <SelectTrigger className={error ? 'border-red-500' : ''}>
                <SelectValue placeholder={`Select ${key}`} />
              </SelectTrigger>
              <SelectContent>
                {param.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        if (param.sensitive) {
          return (
            <div className="relative">
              <Input
                id={key}
                type={showSensitive[key] ? 'text' : 'password'}
                value={value}
                onChange={(e) => handleInputChange(key, e.target.value)}
                placeholder={param.placeholder || `Enter ${key}`}
                disabled={isLoading}
                className={error ? 'border-red-500 pr-10' : 'pr-10'}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowSensitive(prev => ({ ...prev, [key]: !prev[key] }))}
              >
                {showSensitive[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          );
        }

        return (
          <Textarea
            id={key}
            value={value}
            onChange={(e) => handleInputChange(key, e.target.value)}
            placeholder={param.placeholder || `Enter ${key}`}
            disabled={isLoading}
            rows={param.description.length > 100 ? 3 : 1}
            className={error ? 'border-red-500' : ''}
          />
        );
    }
  };

  // Group parameters by required/optional
  const requiredParams = Object.entries(functionDef.parameters).filter(([_, param]) => param.required);
  const optionalParams = Object.entries(functionDef.parameters).filter(([_, param]) => !param.required);

  return (
    <TooltipProvider>
      <Card className={`w-full max-w-2xl ${className}`}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {functionDef.name}
                <Badge variant={functionDef.category === 'action' ? 'default' : 'secondary'}>
                  {functionDef.category}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {functionDef.description}
              </CardDescription>
            </div>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Function metadata */}
          {(functionDef.requiredScopes || functionDef.rateLimits || functionDef.pricing) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {functionDef.requiredScopes && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs">
                      {functionDef.requiredScopes.length} scopes required
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      Required scopes: {functionDef.requiredScopes.join(', ')}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {functionDef.rateLimits && (
                <Badge variant="outline" className="text-xs">
                  {functionDef.rateLimits.requests}/{functionDef.rateLimits.period}
                </Badge>
              )}
              {functionDef.pricing && (
                <Badge variant="outline" className="text-xs">
                  {functionDef.pricing.cost} {functionDef.pricing.currency}/{functionDef.pricing.unit}
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Required Parameters */}
            {requiredParams.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Required Parameters
                </h4>
                <div className="space-y-4">
                  {requiredParams.map(([key, param]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={key} className="text-sm font-medium">
                          {key}
                          <span className="text-red-500 ml-1">*</span>
                        </Label>
                        {param.helpText && (
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs max-w-xs">{param.helpText}</div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      
                      {param.type !== 'boolean' && (
                        <p className="text-xs text-muted-foreground">{param.description}</p>
                      )}
                      
                      {renderInput(key, param)}
                      
                      {getFieldError(key) && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            {getFieldError(key)}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Parameters */}
            {optionalParams.length > 0 && (
              <>
                {requiredParams.length > 0 && <Separator />}
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-500" />
                    Optional Parameters
                  </h4>
                  <ScrollArea className="max-h-96">
                    <div className="space-y-4 pr-4">
                      {optionalParams.map(([key, param]) => (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={key} className="text-sm font-medium">
                              {key}
                            </Label>
                            {param.helpText && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs max-w-xs">{param.helpText}</div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {param.default !== undefined && (
                              <Badge variant="secondary" className="text-xs">
                                default: {String(param.default)}
                              </Badge>
                            )}
                          </div>
                          
                          {param.type !== 'boolean' && (
                            <p className="text-xs text-muted-foreground">{param.description}</p>
                          )}
                          
                          {renderInput(key, param)}
                          
                          {getFieldError(key) && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription className="text-xs">
                                {getFieldError(key)}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}

            {/* Form Actions */}
            <div className="flex justify-end gap-2 pt-4">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Configuring...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Configure Function
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};