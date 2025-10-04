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

function computeImplementations(): ConnectorImplementationEntry[] {
  return [...buildRegistryImplementations(), ...LOCAL_IMPLEMENTATIONS];
}

export function listImplementedConnectors(): ConnectorImplementationEntry[] {
  return computeImplementations();
}

export function getImplementedConnector(appId: string): ConnectorImplementationEntry | undefined {
  return computeImplementations().find(entry => entry.id === appId);
}

export function getImplementedConnectorIds(): string[] {
  return computeImplementations().map(entry => entry.id);
}

export function getImplementedConnectorSet(): Set<string> {
  return new Set(getImplementedConnectorIds());
}

export type ImplementedConnectorId = ReturnType<typeof getImplementedConnectorIds>[number];
