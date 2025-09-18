import type { AutomationSpec } from '../core/spec';

export function specToReactFlow(spec: AutomationSpec) {
  const all = [...spec.triggers, ...spec.nodes];

  const nodes = all.map((n, idx) => ({
    id: n.id,
    // keep generic node type; port handles will be rendered by UI from data
    type: 'action.core',
    position: { x: 120 + (idx % 6) * 260, y: 120 + Math.floor(idx / 6) * 180 },
    data: {
      label: n.label,
      app: n.app,
      function: n.type,
      parameters: n.inputs || {},
      outputs: n.outputs || [],
      ports: {
        inputs: Object.keys(n.inputs || {}),
        outputs: n.outputs || []
      }
    }
  }));

  const edges = spec.edges.map((e) => ({
    id: `${e.from.nodeId}:${e.from.port}->${e.to.nodeId}:${e.to.port}`,
    source: e.from.nodeId,
    target: e.to.nodeId,
    sourceHandle: e.from.port,
    targetHandle: e.to.port,
    type: 'smoothstep'
  }));

  return { nodes, edges };
}


