import { getErrorMessage } from '../types/common.js';

function stripExecutionState(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data } as Record<string, any>;
  delete sanitized.executionStatus;
  delete sanitized.executionError;
  delete sanitized.lastExecution;
  delete sanitized.isRunning;
  delete sanitized.isCompleted;

  if (sanitized.parameters === undefined && sanitized.params !== undefined) {
    sanitized.parameters = sanitized.params;
  } else if (sanitized.params === undefined && sanitized.parameters !== undefined) {
    sanitized.params = sanitized.parameters;
  }

  return sanitized;
}

export function sanitizeGraphForExecution(graph: any): any {
  if (!graph || typeof graph !== 'object') {
    return graph;
  }

  const cloned: any = typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(graph)
    : JSON.parse(JSON.stringify(graph));

  const nodes = Array.isArray(cloned.nodes) ? cloned.nodes : [];
  const sanitizedNodes = nodes.map((node: any, index: number) => {
    const baseData = stripExecutionState(node.data || {});
    const params = node.params || baseData?.parameters || baseData?.params || {};
    if (baseData) {
      baseData.parameters = params;
      baseData.params = params;
    }

    const candidateTypes: Array<string | undefined> = [
      node.nodeType,
      baseData?.nodeType,
      baseData?.type,
      typeof node.type === 'string' ? node.type : undefined,
      baseData?.kind ? `${baseData.kind}.custom` : undefined,
    ];
    const canonicalType = candidateTypes.find((value) => typeof value === 'string' && value.includes('.'))
      || candidateTypes.find((value) => typeof value === 'string' && value.trim().length > 0)
      || 'action.custom';

    if (baseData && typeof baseData === 'object') {
      baseData.nodeType = canonicalType;
      baseData.type = canonicalType;
    }

    const position = (node.position && typeof node.position?.x === 'number' && typeof node.position?.y === 'number')
      ? node.position
      : { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 };

    const appId = node.app || baseData?.app || baseData?.application;

    return {
      ...node,
      id: String(node.id ?? `node-${index}`),
      type: canonicalType,
      nodeType: canonicalType,
      label: node.label || baseData?.label || `Node ${index + 1}`,
      params,
      data: baseData,
      app: appId,
      position,
    };
  });

  const edges = Array.isArray(cloned.edges) ? cloned.edges : [];
  const sanitizedEdges = edges
    .map((edge: any, index: number) => {
      const from = edge.from ?? edge.source;
      const to = edge.to ?? edge.target;
      if (!from || !to) {
        return null;
      }

      const source = String(from);
      const target = String(to);
      const edgeId =
        typeof edge.id === 'string' && edge.id.trim().length > 0
          ? edge.id
          : `edge-${index}-${source}-${target}`;

      return {
        ...edge,
        id: edgeId,
        source,
        target,
        from: source,
        to: target,
        label: edge.label ?? edge.data?.label ?? '',
      };
    })
    .filter(Boolean);

  const nowIso = new Date().toISOString();
  const metadataSource = (cloned.metadata && typeof cloned.metadata === 'object') ? cloned.metadata : {};
  const createdAt =
    (typeof (metadataSource as any).createdAt === 'string' && (metadataSource as any).createdAt)
    || (typeof (metadataSource as any).created_at === 'string' && (metadataSource as any).created_at)
    || (typeof cloned.createdAt === 'string' && cloned.createdAt)
    || nowIso;
  const metadataVersion =
    (typeof (metadataSource as any).version === 'string' && (metadataSource as any).version?.trim()?.length > 0)
      ? (metadataSource as any).version.trim()
      : '1.0.0';

  const metadata = {
    ...metadataSource,
    version: metadataVersion,
    createdAt,
    updatedAt: (metadataSource as any).updatedAt && typeof (metadataSource as any).updatedAt === 'string'
      ? (metadataSource as any).updatedAt
      : nowIso,
  };

  return {
    ...cloned,
    id: String(cloned.id ?? ''),
    name: cloned.name,
    version: typeof cloned.version === 'number' ? cloned.version : 1,
    nodes: sanitizedNodes,
    edges: sanitizedEdges,
    scopes: Array.isArray(cloned.scopes) ? cloned.scopes : [],
    secrets: Array.isArray(cloned.secrets) ? cloned.secrets : [],
    metadata,
  };
}

export function computeExecutionOrder(nodes: any[], edges: any[]): string[] {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  nodes.forEach((node: any) => {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  });

  edges.forEach((edge: any) => {
    const from = edge.from ?? edge.source;
    const to = edge.to ?? edge.target;
    if (!from || !to || !adjacency.has(String(from)) || !indegree.has(String(to))) {
      return;
    }
    const source = String(from);
    const target = String(to);
    adjacency.get(source)!.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  });

  const queue: string[] = [];
  nodes.forEach((node: any) => {
    if ((indegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
    }
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const nextDegree = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, nextDegree);
      if (nextDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (order.length !== nodes.length) {
    console.warn('[workflowExecution] Detected cycle or disconnected nodes during execution order computation.', {
      nodeCount: nodes.length,
      orderedCount: order.length,
    });
  }

  return order;
}

export function summarizeDryRunError(error: unknown): { message: string; details?: Record<string, any> } {
  const message = getErrorMessage(error);
  if (error && typeof error === 'object' && 'details' in (error as any) && (error as any).details) {
    return { message, details: (error as any).details as Record<string, any> };
  }
  return { message };
}
