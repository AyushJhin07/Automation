import { connectorRegistry, ConnectorRegistryEntry } from '../ConnectorRegistry';
import { GenericAPIClient } from './GenericAPIClient';
import { IMPLEMENTED_CONNECTOR_SET, ConnectorImplementationEntry, listImplementedConnectors } from './supportedApps';

export type ConnectorWiringStatus = 'wired' | 'partial' | 'missing';

export interface ConnectorHealthRecord {
  id: string;
  name: string;
  status: ConnectorWiringStatus;
  availability: string;
  hasApiClient: boolean;
  usesGenericClient: boolean;
  implementedOperations: number;
  totalOperations: number;
  notes: string[];
  source: 'registry' | 'local';
}

export interface ConnectorHealthReport {
  connectors: ConnectorHealthRecord[];
  wired: ConnectorHealthRecord[];
  partial: ConnectorHealthRecord[];
  missing: ConnectorHealthRecord[];
  local: ConnectorHealthRecord[];
  summary: {
    wired: number;
    partial: number;
    missing: number;
    totalCatalog: number;
    totalReported: number;
  };
  loadFailures: string[];
}

function deriveStatus(
  entry: ConnectorRegistryEntry,
  implementedOps: number,
  totalOps: number,
  manifestEntry?: ConnectorImplementationEntry
): ConnectorHealthRecord {
  const { definition, availability, apiClient } = entry;
  const hasApiClient = Boolean(apiClient);
  const usesGenericClient = apiClient === GenericAPIClient;
  const usesManifestGeneric = manifestEntry?.runtime === 'generic';
  const hasRealClient = hasApiClient && (!usesGenericClient || usesManifestGeneric);
  const hasCompilerOps = implementedOps > 0;
  const notes: string[] = [];

  if (!hasApiClient) {
    notes.push('No API client registered');
  }

  if (usesGenericClient) {
    if (usesManifestGeneric) {
      notes.push('Execution routed through generic HTTP executor');
    } else {
      notes.push('Uses GenericAPIClient placeholder');
    }
  }

  if (totalOps === 0) {
    notes.push('No catalog actions or triggers defined');
  } else if (!hasCompilerOps) {
    notes.push('No compiler-backed operations registered');
  }

  let status: ConnectorWiringStatus;

  if (usesManifestGeneric && totalOps > 0) {
    status = 'wired';
  } else if (hasRealClient && hasCompilerOps) {
    status = 'wired';
  } else if (hasApiClient || availability === 'stable' || totalOps > 0) {
    status = 'partial';
  } else {
    status = 'missing';
  }

  if (IMPLEMENTED_CONNECTOR_SET.has(definition.id)) {
    if (usesManifestGeneric) {
      status = 'wired';
    } else if (hasRealClient && hasCompilerOps) {
      status = 'wired';
    } else {
      if (!hasRealClient) {
        notes.push('Manifest marks as implemented but registry lacks client');
      }
      status = hasCompilerOps ? 'wired' : 'partial';
    }
  }

  return {
    id: definition.id,
    name: definition.name || definition.id,
    status,
    availability,
    hasApiClient,
    usesGenericClient,
    implementedOperations: implementedOps,
    totalOperations: totalOps,
    notes,
    source: 'registry'
  };
}

export function getConnectorHealthReport(): ConnectorHealthReport {
  const registryEntries = connectorRegistry.getAllConnectors({
    includeExperimental: true,
    includeDisabled: true
  });

  const stats = connectorRegistry.getCompilerImplementationStats({
    includeExperimental: true,
    includeDisabled: true
  });

  const manifestEntries = new Map(listImplementedConnectors().map(entry => [entry.id, entry]));

  const records: ConnectorHealthRecord[] = registryEntries.map(entry =>
    deriveStatus(
      entry,
      stats.implementedOpsByApp[entry.definition.id] ?? 0,
      stats.totalOpsByApp[entry.definition.id] ?? entry.functionCount ?? 0,
      manifestEntries.get(entry.definition.id)
    )
  );

  const existingIds = new Set(records.map(r => r.id));
  const localRecords: ConnectorHealthRecord[] = [];

  for (const impl of listImplementedConnectors()) {
    if (impl.source !== 'local') {
      continue;
    }

    if (existingIds.has(impl.id)) {
      continue;
    }

    localRecords.push({
      id: impl.id,
      name: impl.id.charAt(0).toUpperCase() + impl.id.slice(1),
      status: 'wired',
      availability: 'local',
      hasApiClient: true,
      usesGenericClient: false,
      implementedOperations: 0,
      totalOperations: 0,
      notes: ['Local utility connector'],
      source: 'local'
    });
  }

  const allRecords = [...records, ...localRecords];
  const wired = allRecords.filter(record => record.status === 'wired');
  const partial = allRecords.filter(record => record.status === 'partial');
  const missing = allRecords.filter(record => record.status === 'missing');

  return {
    connectors: allRecords,
    wired,
    partial,
    missing,
    local: localRecords,
    summary: {
      wired: wired.length,
      partial: partial.length,
      missing: missing.length,
      totalCatalog: records.length,
      totalReported: allRecords.length
    },
    loadFailures: connectorRegistry.getFailedConnectorFiles()
  };
}
