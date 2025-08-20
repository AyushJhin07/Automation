import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Settings, X, Play } from 'lucide-react';
import { TriggerNodeData } from '../types';

export function TriggerNode({ data }: NodeProps<TriggerNodeData>) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, any>>(data.config || {});

  const handleConfigChange = (paramName: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const Icon = data.icon;

  return (
    <>
      <Card className="w-64 border-2 border-green-300 hover:border-green-400 transition-colors shadow-lg bg-green-50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-green-600" />
              <CardTitle className="text-sm text-green-800">TRIGGER</CardTitle>
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
          <div className="flex items-center gap-2 mb-2">
            {Icon && typeof Icon === 'function' ? (
              <Icon className="w-4 h-4 text-green-600" />
            ) : (
              <div className="w-4 h-4 rounded bg-green-300" />
            )}
            <div className="font-medium text-sm">{data.name}</div>
          </div>
          <div className="text-xs text-gray-600">
            {data.description}
          </div>
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
                  {Icon && typeof Icon === 'function' ? (
                    <Icon className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded bg-green-300" />
                  )}
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
              <div className="text-sm text-gray-600 mb-4">
                {data.description}
              </div>

              {data.parameters.map((param) => (
                <div key={param.name}>
                  <Label htmlFor={param.name}>
                    {param.name}
                    {param.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  
                  {param.type === 'select' ? (
                    <Select
                      onValueChange={(value) => handleConfigChange(param.name, value)}
                      value={config[param.name]}
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
                  ) : (
                    <Input
                      id={param.name}
                      type={param.type}
                      placeholder={param.description}
                      value={config[param.name] || ''}
                      onChange={(e) => handleConfigChange(param.name, e.target.value)}
                    />
                  )}
                  
                  <div className="text-xs text-gray-500 mt-1">
                    {param.description}
                  </div>
                </div>
              ))}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsConfigOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    data.config = config;
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

export default React.memo(TriggerNode);