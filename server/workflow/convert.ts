import type { AutomationSpec } from '../../../shared/core/spec';

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
    nodes: [...(spec.triggers || []), ...(spec.nodes || [])].map((n) => ({
      id: n.id,
      type: n.type.startsWith('trigger') ? 'trigger' : 'action',
      data: { app: n.app, label: n.label, params: n.inputs, outputs: n.outputs || [] }
    })),
    edges: (spec.edges || []).map((e) => ({
      id: `${e.from.nodeId}:${e.from.port}->${e.to.nodeId}:${e.to.port}`,
      source: e.from.nodeId,
      target: e.to.nodeId,
      sourceHandle: e.from.port,
      targetHandle: e.to.port
    }))
  };
}


