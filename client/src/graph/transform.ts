import type { AutomationSpec } from '../core/spec';

export function specToReactFlow(spec: AutomationSpec) {
  const all = [...spec.triggers, ...spec.nodes];

  const nodes = all.map((n, idx) => {
    const [category] = n.type.split('.') as [string];
    const reactFlowType = category === 'trigger'
      ? 'trigger'
      : category === 'transform'
        ? 'transform'
        : 'action';

    const parameters = { ...(n.inputs || {}) };
    const auth = n.auth ? { ...n.auth } : undefined;
    const connectionId = auth?.connectionId;

    if (connectionId && parameters.connectionId === undefined) {
      parameters.connectionId = connectionId;
    }

    return {
      id: n.id,
      type: reactFlowType,
      position: { x: 120 + (idx % 6) * 260, y: 120 + Math.floor(idx / 6) * 180 },
      data: {
        label: n.label,
        app: n.app,
        function: n.type,
        parameters,
        outputs: n.outputs || [],
        auth,
        connectionId,
        ports: {
          inputs: Object.keys(n.inputs || {}),
          outputs: n.outputs || []
        }
      }
    };
  });

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


