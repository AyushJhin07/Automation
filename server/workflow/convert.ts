import type { AutomationSpec } from '../../../shared/core/spec';
import { enrichWorkflowNode } from './node-metadata';

export type WorkflowGraph = {
  id: string;
  nodes: Array<{
    id: string;
    type: 'trigger' | 'action';
    data: { app: string; label: string; params: any; outputs: string[] };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
};

export function specToWorkflowGraph(spec: AutomationSpec): WorkflowGraph {
  return {
    id: spec.name,
    nodes: [...(spec.triggers || []), ...(spec.nodes || [])].map((n) => {
      const typeParts = n.type.split('.');
      const kind = typeParts[0]?.startsWith('trigger') ? 'trigger' : 'action';
      const opSegments = typeParts.slice(1);
      const operationName = opSegments.slice(1).join('.') || opSegments[0] || '';
      const fullOperation = n.app && operationName ? `${n.app}.${operationName}` : operationName;

      const baseNode = {
        id: n.id,
        type: kind as 'trigger' | 'action',
        app: n.app,
        name: n.label,
        op: fullOperation || n.type,
        params: n.inputs,
        data: {
          app: n.app,
          label: n.label,
          operation: operationName,
          parameters: n.inputs,
          config: n.inputs,
          outputs: n.outputs || [],
        },
      } as any;

      return enrichWorkflowNode(baseNode);
    }),
    edges: (spec.edges || []).map((e) => ({
      id: `${e.from.nodeId}:${e.from.port}->${e.to.nodeId}:${e.to.port}`,
      source: e.from.nodeId,
      target: e.to.nodeId,
      sourceHandle: e.from.port,
      targetHandle: e.to.port
    }))
  };
}


