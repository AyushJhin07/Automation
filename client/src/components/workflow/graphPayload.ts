export const applyExecutionStateDefaults = (data: any = {}) => {
  const base = (data && typeof data === 'object') ? { ...data } : {};
  if (!('executionStatus' in base)) {
    base.executionStatus = 'idle';
  }
  if (!('executionError' in base)) {
    base.executionError = null;
  }
  if (!('lastExecution' in base)) {
    base.lastExecution = null;
  }
  return base;
};

export const sanitizeExecutionState = (data: any = {}) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  const sanitized = { ...data };
  delete sanitized.executionStatus;
  delete sanitized.executionError;
  delete sanitized.lastExecution;
  delete sanitized.isRunning;
  delete sanitized.isCompleted;
  return sanitized;
};

export interface GraphPayloadOptions {
  nodes: Array<any>;
  edges: Array<any>;
  workflowIdentifier: string;
  specName?: string;
  specVersion?: number | string;
  metadata?: Record<string, any> | null | undefined;
}

export const serializeGraphPayload = ({
  nodes,
  edges,
  workflowIdentifier,
  specName,
  specVersion,
  metadata
}: GraphPayloadOptions) => {
  const uniqueScopes = new Set<string>();
  const nowIso = new Date().toISOString();
  const metadataSource: Record<string, any> = (metadata && typeof metadata === 'object')
    ? { ...metadata }
    : {};
  const metadataCreatedAt =
    (typeof metadataSource.createdAt === 'string' && metadataSource.createdAt) ||
    (typeof metadataSource.created_at === 'string' && metadataSource.created_at) ||
    nowIso;
  const metadataVersion =
    (typeof metadataSource.version === 'string' && metadataSource.version.trim().length > 0)
      ? metadataSource.version.trim()
      : '1.0.0';

  const serializedNodes = nodes.map((node, index) => {
    const baseData = applyExecutionStateDefaults(node.data || {});
    const sanitizedData = sanitizeExecutionState(baseData);
    const paramsSource =
      sanitizedData.parameters ??
      sanitizedData.params ??
      baseData.parameters ??
      {};
    const params = { ...paramsSource };

    sanitizedData.parameters = params;
    sanitizedData.params = params;

    const connectionId =
      sanitizedData.connectionId ??
      sanitizedData.auth?.connectionId ??
      baseData.connectionId ??
      baseData.auth?.connectionId ??
      params.connectionId;

    if (connectionId) {
      sanitizedData.connectionId = connectionId;
      const authSource = sanitizedData.auth ?? baseData.auth;
      sanitizedData.auth = { ...(authSource || {}), connectionId };
      if (params.connectionId === undefined) {
        params.connectionId = connectionId;
      }
    }

    if (Array.isArray(sanitizedData.requiredScopes)) {
      sanitizedData.requiredScopes.forEach((scope: string) => uniqueScopes.add(scope));
    }

    const candidateTypes: Array<string | undefined> = [
      sanitizedData.nodeType,
      node.data?.nodeType,
      node.nodeType as string | undefined,
      typeof node.type === 'string' ? node.type : undefined,
      sanitizedData.type
    ];
    const canonicalType = candidateTypes.find((value) => typeof value === 'string' && value.includes('.'))
      || candidateTypes.find((value) => typeof value === 'string' && value.trim().length > 0)
      || (sanitizedData.kind ? `${sanitizedData.kind}.custom` : 'action.custom');

    if (sanitizedData) {
      sanitizedData.nodeType = canonicalType;
      sanitizedData.type = canonicalType;
    }

    const position = (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number')
      ? node.position
      : { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 };

    return {
      id: String(node.id),
      type: canonicalType,
      nodeType: canonicalType,
      label: sanitizedData.label || node.data?.label || `Node ${index + 1}`,
      params,
      data: sanitizedData,
      app: sanitizedData.app || node.data?.app,
      position,
    };
  });

  const serializedEdges = edges
    .filter((edge) => edge.source && edge.target)
    .map((edge, index) => {
      const source = String(edge.source);
      const target = String(edge.target);
      const baseData = edge.data ?? {};
      const edgeId =
        typeof edge.id === 'string' && edge.id.trim().length > 0
          ? edge.id
          : `edge-${index}-${source}-${target}`;

      return {
        id: edgeId,
        source,
        target,
        from: source,
        to: target,
        label: edge.label || baseData.label || '',
        dataType: baseData.dataType || 'default',
        sourceHandle: edge.sourceHandle ?? baseData.sourceHandle,
        targetHandle: edge.targetHandle ?? baseData.targetHandle,
        data: baseData,
      };
    });

  return {
    id: String(workflowIdentifier),
    name: specName || 'Graph Editor Workflow',
    version: typeof specVersion === 'number' ? specVersion : 1,
    nodes: serializedNodes,
    edges: serializedEdges,
    scopes: Array.from(uniqueScopes),
    secrets: [],
    metadata: {
      ...metadataSource,
      version: metadataVersion,
      createdAt: metadataCreatedAt,
      updatedAt: nowIso,
      runPreview: true,
    }
  };
};

