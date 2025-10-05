export interface ConnectorOperationDefinition {
  id?: string | null;
}

export interface ConnectorLikeDefinition {
  id: string;
  actions?: ConnectorOperationDefinition[] | null;
  triggers?: ConnectorOperationDefinition[] | null;
}

export interface ConnectorOperationCoverageSummary {
  total: number;
  implemented: number;
  missing: string[];
}

function buildKeyCandidates(
  connectorId: string,
  operationId: string,
  type: 'action' | 'trigger'
): string[] {
  const normalizedOp = operationId.trim();
  const normalizedConnector = connectorId.trim();
  return [
    `${normalizedConnector}.${normalizedOp}`,
    `${type}.${normalizedConnector}:${normalizedOp}`,
    `${type}.${normalizedConnector}.${normalizedOp}`,
    `${normalizedConnector}:${normalizedOp}`,
  ];
}

export function computeConnectorOperationCoverage(
  connector: ConnectorLikeDefinition,
  opMap: Record<string, unknown>
): ConnectorOperationCoverageSummary {
  const missing: string[] = [];
  let implemented = 0;
  let total = 0;

  const allOps: Array<{ type: 'action' | 'trigger'; id: string }> = [];

  for (const op of connector.actions ?? []) {
    const opId = typeof op?.id === 'string' ? op.id.trim() : '';
    if (!opId) continue;
    allOps.push({ type: 'action', id: opId });
  }

  for (const op of connector.triggers ?? []) {
    const opId = typeof op?.id === 'string' ? op.id.trim() : '';
    if (!opId) continue;
    allOps.push({ type: 'trigger', id: opId });
  }

  for (const op of allOps) {
    total++;
    const candidates = buildKeyCandidates(connector.id, op.id, op.type);
    const hasMatch = candidates.some(key => Object.prototype.hasOwnProperty.call(opMap, key));

    if (hasMatch) {
      implemented++;
    } else {
      missing.push(`${op.type}.${op.id}`);
    }
  }

  return {
    total,
    implemented,
    missing,
  };
}
