import { connectorRegistry } from '../ConnectorRegistry';
import { BaseAPIClient, APICredentials } from './BaseAPIClient';
import { GenericAPIClient } from './GenericAPIClient';
import { LocalSheetsAPIClient, LocalTimeAPIClient } from './LocalCoreAPIClients';
import { ShopifyAPIClient } from './ShopifyAPIClient';
import { SlackAPIClient } from './SlackAPIClient';
import { NotionAPIClient } from './NotionAPIClient';
import { AirtableAPIClient } from './AirtableAPIClient';
import { GmailAPIClient } from './GmailAPIClient';
import { GenericConnectorClient } from './GenericConnectorClient';

export type ConnectorClientFactory = (
  credentials: APICredentials,
  additionalConfig?: Record<string, any>
) => BaseAPIClient;

export interface ConnectorImplementationEntry {
  id: string;
  source: 'registry' | 'local';
  createClient: ConnectorClientFactory;
  runtime: 'sdk' | 'generic';
}

const LOCAL_IMPLEMENTATIONS: ConnectorImplementationEntry[] = [
  {
    id: 'sheets',
    source: 'local',
    createClient: (credentials: APICredentials) => new LocalSheetsAPIClient(credentials),
    runtime: 'sdk'
  },
  {
    id: 'time',
    source: 'local',
    createClient: (credentials: APICredentials) => new LocalTimeAPIClient(credentials),
    runtime: 'sdk'
  }
];

const REGISTRY_OVERRIDES: Record<string, ConnectorClientFactory> = {
  airtable: (credentials: APICredentials) => {
    if (!credentials.apiKey) {
      throw new Error('Airtable integration requires an API key');
    }
    return new AirtableAPIClient(credentials);
  },
  gmail: (credentials: APICredentials) => new GmailAPIClient(credentials),
  notion: (credentials: APICredentials) => {
    const accessToken = credentials.accessToken ?? credentials.integrationToken;
    if (!accessToken) {
      throw new Error('Notion integration requires an access token');
    }

    return new NotionAPIClient({ ...credentials, accessToken });
  },
  shopify: (credentials: APICredentials, additionalConfig?: Record<string, any>) => {
    const shopDomain = additionalConfig?.shopDomain;
    if (!shopDomain) {
      throw new Error('Shopify integration requires shopDomain in additionalConfig');
    }

    return new ShopifyAPIClient({ ...credentials, shopDomain });
  },
  slack: (credentials: APICredentials) => {
    const accessToken = credentials.accessToken ?? credentials.botToken;
    if (!accessToken) {
      throw new Error('Slack integration requires an access token');
    }

    return new SlackAPIClient({ ...credentials, accessToken });
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
        createClient: overrideFactory,
        runtime: 'sdk'
      });
      continue;
    }

    if (ClientCtor === GenericAPIClient) {
      if (!connector.functionCount || connector.functionCount === 0) {
        continue;
      }
      entries.push({
        id: appId,
        source: 'registry',
        createClient: (credentials: APICredentials, additionalConfig?: Record<string, any>) => {
          const mergedCredentials = {
            ...credentials,
            ...(additionalConfig ?? {})
          };
          return new GenericConnectorClient(appId, mergedCredentials);
        },
        runtime: 'generic'
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
      },
      runtime: 'sdk'
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
