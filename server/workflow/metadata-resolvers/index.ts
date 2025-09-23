import type { MetadataSource, MetadataResolverAuth, ResolverInvocationContext } from '../metadata-types';

export type MetadataResolverResult =
  | MetadataSource
  | {
      metadata?: MetadataSource;
      outputMetadata?: MetadataSource;
    }
  | void;

export type MetadataResolver = (
  context: ResolverInvocationContext,
  auth?: MetadataResolverAuth
) => MetadataResolverResult;

const registry = new Map<string, MetadataResolver>();

const canonicalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const generateResolverKeys = (identifier: string): string[] => {
  const canonical = canonicalize(identifier);
  if (!canonical) return [];
  const collapsed = canonical.replace(/-/g, '');
  const underscored = canonical.replace(/-/g, '_');
  const keys = new Set([identifier.toLowerCase(), canonical, collapsed, underscored]);
  return Array.from(keys).filter((key) => key.length > 0);
};

export const registerMetadataResolver = (
  connectorIds: string | string[],
  resolver: MetadataResolver
) => {
  if (!resolver) return;
  const ids = Array.isArray(connectorIds) ? connectorIds : [connectorIds];
  ids
    .map((id) => (typeof id === 'string' ? id : ''))
    .filter((id) => id.trim().length > 0)
    .forEach((id) => {
      generateResolverKeys(id).forEach((key) => {
        registry.set(key, resolver);
      });
    });
};

export const getMetadataResolver = (
  connectorId?: string | null
): MetadataResolver | undefined => {
  if (!connectorId || typeof connectorId !== 'string') return undefined;
  const trimmed = connectorId.trim();
  if (!trimmed) return undefined;
  const keys = generateResolverKeys(trimmed);
  for (const key of keys) {
    const resolver = registry.get(key);
    if (resolver) return resolver;
  }
  return undefined;
};

export const clearMetadataResolvers = () => registry.clear();

export const listMetadataResolvers = (): Array<{ key: string; resolver: MetadataResolver }> => {
  return Array.from(registry.entries()).map(([key, resolver]) => ({ key, resolver }));
};
