import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import { ActionNodeData } from '../types';

export function ActionNode({ data }: NodeProps<ActionNodeData>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <Card className="w-48 border-2 border-blue-300 hover:border-blue-400 transition-colors shadow-lg bg-blue-50">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <CardTitle className="text-sm text-blue-800">ACTION</CardTitle>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="font-medium text-sm mb-1">{data.label}</div>
          {data.description && (
            <div className="text-xs text-gray-600">{data.description}</div>
          )}
        </CardContent>
      </Card>

      <Handle type="source" position={Position.Right} />
    </>
  );
}