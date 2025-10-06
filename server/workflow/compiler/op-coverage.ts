import { buildOperationKeyCandidates, canonicalizeOperationKey } from './op-map.js';

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

export function computeConnectorOperationCoverage(
  connector: ConnectorLikeDefinition,
  opMap: Record<string, unknown>
): ConnectorOperationCoverageSummary {
  const missing: string[] = [];
  let implemented = 0;
  let total = 0;

  const canonicalOpKeys = new Set<string>();
  for (const key of Object.keys(opMap)) {
    canonicalOpKeys.add(canonicalizeOperationKey(key));
  }

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
    const candidates = buildOperationKeyCandidates(connector.id, op.id, op.type);
    const hasMatch = candidates.some(candidate =>
      canonicalOpKeys.has(canonicalizeOperationKey(candidate))
    );

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
