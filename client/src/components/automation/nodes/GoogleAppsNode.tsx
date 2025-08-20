import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Settings, X } from 'lucide-react';
import { GoogleAppsNodeData, AppFunction } from '../types';

export function GoogleAppsNode({ data, id }: NodeProps<GoogleAppsNodeData>) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<AppFunction | undefined>(data.selectedFunction);
  const [functionConfig, setFunctionConfig] = useState<Record<string, any>>(data.functionConfig || {});

  const handleFunctionSelect = (functionId: string) => {
    const func = data.functions.find(f => f.id === functionId);
    setSelectedFunction(func);
    
    // Initialize config with default values
    if (func) {
      const defaultConfig: Record<string, any> = {};
      func.parameters.forEach(param => {
        if (param.defaultValue !== undefined) {
          defaultConfig[param.name] = param.defaultValue;
        }
      });
      setFunctionConfig(defaultConfig);
    }
  };

  const handleConfigChange = (paramName: string, value: any) => {
    setFunctionConfig(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const Icon = data.icon;

  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <Card className="w-64 border-2 hover:border-blue-300 transition-colors shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5" style={{ color: data.color }} />
              <CardTitle className="text-sm">{data.name}</CardTitle>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsConfigOpen(true)}
              className="h-6 w-6 p-0"
            >
              <Settings className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          {selectedFunction ? (
            <div>
              <Badge variant="secondary" className="text-xs mb-2">
                {selectedFunction.name}
              </Badge>
              <div className="text-xs text-gray-500">
                {selectedFunction.description}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Click settings to configure
            </div>
          )}
        </CardContent>
      </Card>

      <Handle type="source" position={Position.Right} />

      {/* Configuration Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-96 max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Icon className="w-5 h-5" style={{ color: data.color }} />
                  Configure {data.name}
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsConfigOpen(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="function-select">Select Function</Label>
                <Select onValueChange={handleFunctionSelect} value={selectedFunction?.id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a function" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.functions.map((func) => (
                      <SelectItem key={func.id} value={func.id}>
                        <div>
                          <div className="font-medium">{func.name}</div>
                          <div className="text-xs text-gray-500">{func.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedFunction && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Function Parameters</div>
                  {selectedFunction.parameters.map((param) => (
                    <div key={param.name}>
                      <Label htmlFor={param.name}>
                        {param.name}
                        {param.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      
                      {param.type === 'select' ? (
                        <Select
                          onValueChange={(value) => handleConfigChange(param.name, value)}
                          value={functionConfig[param.name]}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${param.name}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {param.options?.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : param.type === 'textarea' ? (
                        <Textarea
                          id={param.name}
                          placeholder={param.description}
                          value={functionConfig[param.name] || ''}
                          onChange={(e) => handleConfigChange(param.name, e.target.value)}
                        />
                      ) : (
                        <Input
                          id={param.name}
                          type={param.type}
                          placeholder={param.description}
                          value={functionConfig[param.name] || ''}
                          onChange={(e) => handleConfigChange(param.name, e.target.value)}
                        />
                      )}
                      
                      <div className="text-xs text-gray-500 mt-1">
                        {param.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsConfigOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    // Update node data
                    data.selectedFunction = selectedFunction;
                    data.functionConfig = functionConfig;
                    setIsConfigOpen(false);
                  }}
                >
                  Save Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default React.memo(GoogleAppsNode);