import { canonicalizeMetadataKey, type WorkflowMetadata } from '@shared/workflow/metadata';
import type { WorkflowNode } from '../../../common/workflow-types';

export type ConnectorDefinition = {
  id?: string;
  name?: string;
  actions?: Array<{
    id?: string;
    name?: string;
    title?: string;
    parameters?: { properties?: Record<string, any> };
  }>;
  triggers?: Array<{
    id?: string;
    name?: string;
    title?: string;
    parameters?: { properties?: Record<string, any> };
  }>;
  [key: string]: any;
};

export type MetadataResolverAuth = Record<string, any>;

export interface MetadataResolverContext {
  node: Partial<WorkflowNode>;
  params: Record<string, any>;
  connector?: ConnectorDefinition;
  answers?: Record<string, any>;
  auth?: MetadataResolverAuth;
  operation?: string;
}

export interface MetadataResolverResult {
  metadata?: WorkflowMetadata;
  outputMetadata?: WorkflowMetadata;
}

export type MetadataResolverResponse =
  | MetadataResolverResult
  | WorkflowMetadata
  | null
  | undefined
  | void;

export type MetadataResolver = (context: MetadataResolverContext) => MetadataResolverResponse;

export interface MetadataResolverRegistrationOptions {
  aliases?: string[];
}

type ResolverRegistryEntry = {
  tokens: Set<string>;
  resolver: MetadataResolver;
};

const canonicalize = canonicalizeMetadataKey;

const registry: ResolverRegistryEntry[] = [];

const toTokens = (value?: string): string[] => {
  if (!value) return [];
  const canonical = canonicalize(value);
  if (!canonical) return [];
  const normalized = canonical.trim();
  if (!normalized) return [];
  const tokens = new Set<string>();
  tokens.add(normalized);
  tokens.add(normalized.replace(/-/g, ''));
  tokens.add(normalized.replace(/-/g, '_'));
  return Array.from(tokens).filter(Boolean);
};

const addTokens = (collection: Set<string>, value?: string) => {
  if (!value) return;
  toTokens(value).forEach((token) => collection.add(token));
};

export const registerMetadataResolver = (
  id: string,
  resolver: MetadataResolver,
  options: MetadataResolverRegistrationOptions = {}
): void => {
  if (!id || typeof resolver !== 'function') return;
  const tokens = new Set<string>();
  addTokens(tokens, id);
  options.aliases?.forEach((alias) => addTokens(tokens, alias));
  if (tokens.size === 0) return;
  registry.push({ tokens, resolver });
};

const findResolver = (
  connector: ConnectorDefinition | undefined,
  app: string | undefined
): MetadataResolver | undefined => {
  const searchTokens = new Set<string>();
  addTokens(searchTokens, connector?.id);
  addTokens(searchTokens, connector?.name);
  addTokens(searchTokens, app);
  if (searchTokens.size === 0) return undefined;

  const candidates = Array.from(searchTokens);
  for (const entry of registry) {
    for (const token of candidates) {
      if (entry.tokens.has(token)) {
        return entry.resolver;
      }
    }
  }
  return undefined;
};

const isResolverEnvelope = (value: any): value is MetadataResolverResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return 'metadata' in value || 'outputMetadata' in value;
};

const isWorkflowMetadata = (value: any): value is WorkflowMetadata => {
  return value && typeof value === 'object' && !Array.isArray(value);
};

const normalizeResolverResult = (value: MetadataResolverResponse): MetadataResolverResult => {
  if (!value) return {};
  if (isResolverEnvelope(value)) {
    const normalized: MetadataResolverResult = {};
    if (value.metadata && typeof value.metadata === 'object') {
      normalized.metadata = value.metadata;
    }
    if (value.outputMetadata && typeof value.outputMetadata === 'object') {
      normalized.outputMetadata = value.outputMetadata;
    }
    return normalized;
  }
  if (isWorkflowMetadata(value)) {
    return { metadata: value };
  }
  return {};
};

export const getMetadataResolver = (
  connector?: ConnectorDefinition,
  app?: string
): MetadataResolver | undefined => findResolver(connector, app);

export const resolveConnectorMetadata = (
  app: string | undefined,
  context: MetadataResolverContext
): MetadataResolverResult => {
  const resolver = findResolver(context.connector, app);
  if (!resolver) return {};
  try {
    const result = resolver(context);
    return normalizeResolverResult(result);
  } catch (error) {
    const identifier =
      app ??
      context.connector?.id ??
      context.connector?.name ??
      (context.node?.app as string | undefined) ??
      'unknown-connector';
    console.warn('Failed to resolve connector metadata', identifier, error);
    return {};
  }
};

export const __clearMetadataResolverRegistryForTests = (): void => {
  registry.length = 0;
};

export const listRegisteredMetadataResolvers = (): string[] =>
  registry.map((entry) => Array.from(entry.tokens)[0] ?? '');
