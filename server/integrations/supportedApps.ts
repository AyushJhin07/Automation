import { connectorRegistry } from '../ConnectorRegistry';
import { BaseAPIClient, APICredentials } from './BaseAPIClient';
import { LocalSheetsAPIClient, LocalTimeAPIClient } from './LocalCoreAPIClients';
import { ShopifyAPIClient } from './ShopifyAPIClient';

export type ConnectorClientFactory = (
  credentials: APICredentials,
  additionalConfig?: Record<string, any>
) => BaseAPIClient;

export interface ConnectorImplementationEntry {
  id: string;
  source: 'registry' | 'local';
  createClient: ConnectorClientFactory;
}

const LOCAL_IMPLEMENTATIONS: ConnectorImplementationEntry[] = [
  {
    id: 'sheets',
    source: 'local',
    createClient: (credentials: APICredentials) => new LocalSheetsAPIClient(credentials)
  },
  {
    id: 'time',
    source: 'local',
    createClient: (credentials: APICredentials) => new LocalTimeAPIClient(credentials)
  }
];

const REGISTRY_OVERRIDES: Record<string, ConnectorClientFactory> = {
  shopify: (credentials: APICredentials, additionalConfig?: Record<string, any>) => {
    const shopDomain = additionalConfig?.shopDomain;
    if (!shopDomain) {
      throw new Error('Shopify integration requires shopDomain in additionalConfig');
    }

    return new ShopifyAPIClient({ ...credentials, shopDomain });
  }
};

function buildRegistryImplementations(): ConnectorImplementationEntry[] {
  const entries: ConnectorImplementationEntry[] = [];
  const connectors = connectorRegistry.getAllConnectors();

  for (const connector of connectors) {
    const appId = connector.definition.id;
    if (!connectorRegistry.hasImplementation(appId)) {
      continue;
    }

    const ClientCtor = connectorRegistry.getAPIClient(appId);
    if (!ClientCtor) {
      continue;
    }

    const overrideFactory = REGISTRY_OVERRIDES[appId];
    if (overrideFactory) {
      entries.push({
        id: appId,
        source: 'registry',
        createClient: overrideFactory
      });
      continue;
    }

    entries.push({
      id: appId,
      source: 'registry',
      createClient: (credentials: APICredentials, additionalConfig?: Record<string, any>) => {
        const config = {
          ...credentials,
          ...(additionalConfig ?? {})
        };
        return new ClientCtor(config);
      }
    });
  }

  return entries;
}

const IMPLEMENTATIONS: ConnectorImplementationEntry[] = [
  ...buildRegistryImplementations(),
  ...LOCAL_IMPLEMENTATIONS
];

const IMPLEMENTATION_MAP = new Map<string, ConnectorImplementationEntry>(
  IMPLEMENTATIONS.map(entry => [entry.id, entry])
);

export const IMPLEMENTED_CONNECTOR_IDS = IMPLEMENTATIONS.map(entry => entry.id);
export const IMPLEMENTED_CONNECTOR_SET = new Set<string>(IMPLEMENTED_CONNECTOR_IDS);
export type ImplementedConnectorId = typeof IMPLEMENTED_CONNECTOR_IDS[number];

export function getImplementedConnector(appId: string): ConnectorImplementationEntry | undefined {
  return IMPLEMENTATION_MAP.get(appId);
}

export function listImplementedConnectors(): ConnectorImplementationEntry[] {
  return [...IMPLEMENTATION_MAP.values()];
}
