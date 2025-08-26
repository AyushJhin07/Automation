/**
 * DATA MAPPING EDITOR - Visual field mapping and transformation interface
 * Provides drag-and-drop mapping, expression editor, and real-time preview
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { 
  ArrowRight,
  Plus,
  Trash2,
  Code,
  Eye,
  EyeOff,
  Zap,
  MapPin,
  Target,
  Copy,
  Play,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Settings,
  Book,
  Wand2
} from 'lucide-react';

// Types matching server-side interfaces
interface MappingExpression {
  type: 'static' | 'reference' | 'expression' | 'template';
  value: any;
  expression?: string;
  references?: Array<{
    nodeId: string;
    path: string;
    fallback?: any;
  }>;
}

interface FieldMapping {
  sourceField?: string;
  targetField: string;
  expression: MappingExpression;
  transform?: string;
  validation?: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    pattern?: string;
    min?: number;
    max?: number;
  };
}

interface DataMappingEditorProps {
  mappings: FieldMapping[];
  onMappingsChange: (mappings: FieldMapping[]) => void;
  availableNodes: Array<{
    id: string;
    label: string;
    output?: any;
  }>;
  targetSchema?: any;
  sampleData?: Record<string, any>;
}

export const DataMappingEditor: React.FC<DataMappingEditorProps> = ({
  mappings,
  onMappingsChange,
  availableNodes,
  targetSchema,
  sampleData
}) => {
  const [activeMapping, setActiveMapping] = useState<number | null>(null);
  const [previewResults, setPreviewResults] = useState<Record<string, any>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [expressionMode, setExpressionMode] = useState<'simple' | 'advanced'>('simple');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Get available built-in functions
  const [availableFunctions, setAvailableFunctions] = useState<{
    builtIn: string[];
    custom: string[];
  }>({ builtIn: [], custom: [] });

  useEffect(() => {
    loadAvailableFunctions();
  }, []);

  useEffect(() => {
    if (showPreview) {
      testAllMappings();
    }
  }, [mappings, sampleData, showPreview]);

  const loadAvailableFunctions = async () => {
    try {
      const response = await fetch('/api/data-mapping/functions');
      const functions = await response.json();
      setAvailableFunctions(functions);
    } catch (error) {
      console.error('Failed to load available functions:', error);
    }
  };

  const testAllMappings = async () => {
    if (!sampleData || mappings.length === 0) return;

    try {
      const response = await fetch('/api/data-mapping/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings,
          context: {
            nodeOutputs: sampleData,
            currentNode: {},
            globalVariables: {},
            userContext: {}
          }
        })
      });

      const result = await response.json();
      setPreviewResults(result.result || {});
    } catch (error) {
      console.error('Failed to test mappings:', error);
    }
  };

  const addMapping = () => {
    const newMapping: FieldMapping = {
      targetField: '',
      expression: {
        type: 'static',
        value: ''
      }
    };

    onMappingsChange([...mappings, newMapping]);
    setActiveMapping(mappings.length);
  };

  const updateMapping = (index: number, updates: Partial<FieldMapping>) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    onMappingsChange(newMappings);
  };

  const removeMapping = (index: number) => {
    const newMappings = mappings.filter((_, i) => i !== index);
    onMappingsChange(newMappings);
    if (activeMapping === index) {
      setActiveMapping(null);
    }
  };

  const duplicateMapping = (index: number) => {
    const mapping = { ...mappings[index] };
    mapping.targetField = `${mapping.targetField}_copy`;
    onMappingsChange([...mappings, mapping]);
  };

  const quickMapField = (nodeId: string, sourcePath: string, targetField: string) => {
    const newMapping: FieldMapping = {
      targetField,
      expression: {
        type: 'reference',
        references: [{
          nodeId,
          path: sourcePath
        }]
      }
    };

    onMappingsChange([...mappings, newMapping]);
  };

  const generateAutoMappings = () => {
    if (!targetSchema || !availableNodes.length) return;

    const newMappings: FieldMapping[] = [];
    
    // Simple auto-mapping based on field name similarity
    const targetFields = extractFieldsFromSchema(targetSchema);
    const sourceFields = extractFieldsFromNodeOutputs();

    for (const targetField of targetFields) {
      const matchingSource = findBestFieldMatch(targetField, sourceFields);
      if (matchingSource) {
        newMappings.push({
          targetField,
          expression: {
            type: 'reference',
            references: [{
              nodeId: matchingSource.nodeId,
              path: matchingSource.path
            }]
          }
        });
      }
    }

    onMappingsChange([...mappings, ...newMappings]);
  };

  const extractFieldsFromSchema = (schema: any): string[] => {
    const fields: string[] = [];
    
    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        fields.push(key);
        // Could recursively extract nested fields here
      }
    }
    
    return fields;
  };

  const extractFieldsFromNodeOutputs = (): Array<{ nodeId: string; path: string; value: any }> => {
    const fields: Array<{ nodeId: string; path: string; value: any }> = [];
    
    for (const node of availableNodes) {
      if (node.output) {
        extractFieldsRecursively(node.output, node.id, '', fields);
      }
    }
    
    return fields;
  };

  const extractFieldsRecursively = (
    obj: any,
    nodeId: string,
    currentPath: string,
    results: Array<{ nodeId: string; path: string; value: any }>
  ) => {
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        const path = currentPath ? `${currentPath}.${key}` : key;
        results.push({ nodeId, path, value });
        
        if (typeof value === 'object' && value !== null) {
          extractFieldsRecursively(value, nodeId, path, results);
        }
      }
    }
  };

  const findBestFieldMatch = (
    targetField: string,
    sourceFields: Array<{ nodeId: string; path: string; value: any }>
  ): { nodeId: string; path: string } | null => {
    // Simple name-based matching
    const exactMatch = sourceFields.find(f => 
      f.path.toLowerCase() === targetField.toLowerCase()
    );
    
    if (exactMatch) return exactMatch;
    
    // Partial match
    const partialMatch = sourceFields.find(f => 
      f.path.toLowerCase().includes(targetField.toLowerCase()) ||
      targetField.toLowerCase().includes(f.path.toLowerCase())
    );
    
    return partialMatch || null;
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

  const renderNodeOutput = (nodeId: string, obj: any, path: string = '') => {
    if (typeof obj !== 'object' || obj === null) {
      return (
        <div
          key={path}
          className="flex items-center justify-between p-2 hover:bg-blue-50 rounded cursor-pointer group"
          onClick={() => quickMapField(nodeId, path, path.split('.').pop() || '')}
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3 text-gray-400" />
            <span className="text-sm font-mono">{path}</span>
            <Badge variant="outline" className="text-xs">
              {typeof obj}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 max-w-32 truncate">
              {String(obj)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      );
    }

    if (Array.isArray(obj)) {
      return (
        <div key={path} className="ml-4">
          <div className="text-sm text-gray-600 mb-1">{path} (array[{obj.length}])</div>
          {obj.slice(0, 3).map((item, index) => 
            renderNodeOutput(nodeId, item, `${path}[${index}]`)
          )}
          {obj.length > 3 && (
            <div className="text-xs text-gray-400 ml-4">... {obj.length - 3} more items</div>
          )}
        </div>
      );
    }

    return (
      <div key={path} className="ml-4">
        {Object.entries(obj).map(([key, value]) => {
          const fullPath = path ? `${path}.${key}` : key;
          return renderNodeOutput(nodeId, value, fullPath);
        })}
      </div>
    );
  };

  const MappingExpressionEditor: React.FC<{
    mapping: FieldMapping;
    index: number;
    isActive: boolean;
  }> = ({ mapping, index, isActive }) => {
    const [localExpression, setLocalExpression] = useState(mapping.expression);

    useEffect(() => {
      setLocalExpression(mapping.expression);
    }, [mapping.expression]);

    const handleExpressionChange = (updates: Partial<MappingExpression>) => {
      const newExpression = { ...localExpression, ...updates };
      setLocalExpression(newExpression);
      updateMapping(index, { expression: newExpression });
    };

    const previewValue = previewResults[mapping.targetField];

    return (
      <div className={`border rounded-lg transition-all ${
        isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}>
        <div
          className="p-4 cursor-pointer"
          onClick={() => setActiveMapping(isActive ? null : index)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="w-4 h-4 text-blue-500" />
              <div>
                <div className="font-medium">
                  {mapping.targetField || 'Untitled Field'}
                </div>
                <div className="text-sm text-gray-500">
                  {mapping.expression.type} • {mapping.transform || 'No transform'}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {showPreview && (
                <div className="text-xs bg-white px-2 py-1 rounded border max-w-32 truncate">
                  {previewValue !== undefined ? String(previewValue) : 'No preview'}
                </div>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateMapping(index);
                }}
              >
                <Copy className="w-3 h-3" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMapping(index);
                }}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {isActive && (
          <div className="border-t border-gray-200 p-4 space-y-4 bg-white">
            {/* Target Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Field
              </label>
              <Input
                value={mapping.targetField}
                onChange={(e) => updateMapping(index, { targetField: e.target.value })}
                placeholder="output.fieldName"
                className="font-mono text-sm"
              />
            </div>

            {/* Expression Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expression Type
              </label>
              <div className="flex gap-2">
                {(['static', 'reference', 'expression', 'template'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={localExpression.type === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleExpressionChange({ type })}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>

            {/* Expression Configuration */}
            {localExpression.type === 'static' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Static Value
                </label>
                <Input
                  value={localExpression.value || ''}
                  onChange={(e) => handleExpressionChange({ value: e.target.value })}
                  placeholder="Enter static value"
                />
              </div>
            )}

            {localExpression.type === 'reference' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Reference Configuration
                </label>
                
                {/* Node Selection */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Node</label>
                  <select
                    value={localExpression.references?.[0]?.nodeId || ''}
                    onChange={(e) => {
                      const nodeId = e.target.value;
                      handleExpressionChange({
                        references: [{ nodeId, path: '' }]
                      });
                    }}
                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">Select node...</option>
                    {availableNodes.map(node => (
                      <option key={node.id} value={node.id}>
                        {node.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Path Input */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Field Path</label>
                  <Input
                    value={localExpression.references?.[0]?.path || ''}
                    onChange={(e) => {
                      const path = e.target.value;
                      const currentRef = localExpression.references?.[0];
                      if (currentRef) {
                        handleExpressionChange({
                          references: [{ ...currentRef, path }]
                        });
                      }
                    }}
                    placeholder="field.subfield"
                    className="font-mono text-sm"
                  />
                </div>

                {/* Fallback Value */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fallback Value (optional)</label>
                  <Input
                    value={localExpression.references?.[0]?.fallback || ''}
                    onChange={(e) => {
                      const fallback = e.target.value;
                      const currentRef = localExpression.references?.[0];
                      if (currentRef) {
                        handleExpressionChange({
                          references: [{ ...currentRef, fallback }]
                        });
                      }
                    }}
                    placeholder="Default value if field is missing"
                  />
                </div>
              </div>
            )}

            {(localExpression.type === 'expression' || localExpression.type === 'template') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {localExpression.type === 'expression' ? 'JavaScript Expression' : 'Template String'}
                </label>
                <Textarea
                  value={localExpression.expression || ''}
                  onChange={(e) => handleExpressionChange({ expression: e.target.value })}
                  placeholder={
                    localExpression.type === 'expression'
                      ? 'coalesce(nodes.node1.email, nodes.node2.email, "default@example.com")'
                      : 'Hello {{nodes.node1.name}}, your order #{{nodes.order.id}} is ready!'
                  }
                  className="font-mono text-sm"
                  rows={3}
                />
                
                {/* Function Reference */}
                {localExpression.type === 'expression' && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Could open a function reference modal
                      }}
                      className="text-xs"
                    >
                      <Book className="w-3 h-3 mr-1" />
                      Function Reference
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Transform */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transform (optional)
              </label>
              <select
                value={mapping.transform || ''}
                onChange={(e) => updateMapping(index, { transform: e.target.value || undefined })}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">No transform</option>
                {availableFunctions.builtIn.map(func => (
                  <option key={func} value={func}>
                    {func}
                  </option>
                ))}
              </select>
            </div>

            {/* Validation */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Validation (optional)
              </label>
              
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={mapping.validation?.required || false}
                    onChange={(e) => updateMapping(index, {
                      validation: {
                        ...mapping.validation,
                        required: e.target.checked
                      }
                    })}
                    className="mr-2"
                  />
                  Required
                </label>
                
                <div>
                  <select
                    value={mapping.validation?.type || ''}
                    onChange={(e) => updateMapping(index, {
                      validation: {
                        ...mapping.validation,
                        type: e.target.value as any || undefined
                      }
                    })}
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="">Any type</option>
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="array">Array</option>
                    <option value="object">Object</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Data Mapping</h2>
            <Badge variant="outline">{mappings.length} mappings</Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={generateAutoMappings}
              disabled={!targetSchema || !availableNodes.length}
            >
              <Wand2 className="w-4 h-4 mr-1" />
              Auto Map
            </Button>
            
            <Button
              variant="default"
              size="sm"
              onClick={addMapping}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Mapping
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Source Data Panel */}
        <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-medium text-gray-900 mb-2">Available Data</h3>
            <div className="text-sm text-gray-500">
              Drag fields to create mappings or click + to quick map
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            {availableNodes.map(node => (
              <Card key={node.id} className="overflow-hidden">
                <CardHeader
                  className="py-3 cursor-pointer"
                  onClick={() => toggleNodeExpansion(node.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {expandedNodes.has(node.id) ? 
                        <ChevronDown className="w-4 h-4" /> : 
                        <ChevronRight className="w-4 h-4" />
                      }
                      <CardTitle className="text-sm">{node.label}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {node.id}
                    </Badge>
                  </div>
                </CardHeader>
                
                {expandedNodes.has(node.id) && (
                  <CardContent className="pt-0">
                    {node.output ? (
                      renderNodeOutput(node.id, node.output)
                    ) : (
                      <div className="text-sm text-gray-500">No sample data available</div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>

        {/* Mappings Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {mappings.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Mappings Yet</h3>
              <p className="text-gray-500 mb-4">
                Create field mappings to transform data between workflow nodes
              </p>
              <Button onClick={addMapping}>
                <Plus className="w-4 h-4 mr-1" />
                Add Your First Mapping
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {mappings.map((mapping, index) => (
                <MappingExpressionEditor
                  key={index}
                  mapping={mapping}
                  index={index}
                  isActive={activeMapping === index}
                />
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-medium text-gray-900">Live Preview</h3>
              <div className="text-sm text-gray-500">
                Real-time mapping results
              </div>
            </div>
            
            <div className="p-4">
              {Object.keys(previewResults).length > 0 ? (
                <pre className="text-xs bg-gray-50 p-3 rounded border overflow-x-auto">
                  {JSON.stringify(previewResults, null, 2)}
                </pre>
              ) : (
                <div className="text-sm text-gray-500">
                  No preview data available
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};