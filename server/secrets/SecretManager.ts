import { loadAwsSecrets, resolveAwsCredentialsFromEnv } from './providers/awsSecretsManager';

export type SecretSourceType = 'aws' | 'environment' | 'generated';

export type ManagedSecretMetadata = {
  source: SecretSourceType;
  provider?: 'aws';
  secretId?: string;
  loadedAt: Date;
};

const secretMetadata = new Map<string, ManagedSecretMetadata>();

export function getSecretMetadata(): Map<string, ManagedSecretMetadata> {
  return new Map(secretMetadata);
}

function recordMetadata(key: string, metadata: ManagedSecretMetadata): void {
  secretMetadata.set(key, metadata);
}

export function recordEnvironmentSecret(key: string): void {
  if (secretMetadata.has(key)) {
    return;
  }

  recordMetadata(key, {
    source: 'environment',
    loadedAt: new Date(),
  });
}

export function recordGeneratedSecret(key: string): void {
  recordMetadata(key, {
    source: 'generated',
    loadedAt: new Date(),
  });
}

export function recordManagedSecret(key: string, provider: 'aws', secretId: string): void {
  recordMetadata(key, {
    source: provider,
    provider,
    secretId,
    loadedAt: new Date(),
  });
}

function parseSecretIds(rawIds: string | undefined): string[] {
  if (!rawIds) {
    return [];
  }

  return rawIds
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function loadManagedSecrets(): Promise<{ loaded: boolean; keys: string[]; provider?: string }> {
  const provider = process.env.SECRET_MANAGER_PROVIDER?.toLowerCase();

  if (!provider || provider === 'none') {
    return { loaded: false, keys: [] };
  }

  if (provider !== 'aws') {
    throw new Error(`Unsupported secret manager provider: ${provider}`);
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error('AWS_REGION or AWS_DEFAULT_REGION must be set when using AWS Secrets Manager.');
  }

  const secretIds = parseSecretIds(
    process.env.AWS_SECRETS_MANAGER_SECRET_IDS || process.env.AWS_SECRETS_MANAGER_SECRET_ID,
  );

  if (secretIds.length === 0) {
    throw new Error('No AWS secret identifiers provided. Set AWS_SECRETS_MANAGER_SECRET_IDS or AWS_SECRETS_MANAGER_SECRET_ID.');
  }

  const credentials = resolveAwsCredentialsFromEnv();
  const secrets = await loadAwsSecrets(region, secretIds, credentials);

  const assigned: string[] = [];

  for (const [secretId, payload] of Object.entries(secrets)) {
    for (const [key, value] of Object.entries(payload)) {
      process.env[key] = value;
      recordManagedSecret(key, 'aws', secretId);
      assigned.push(key);
    }
  }

  return { loaded: true, keys: assigned, provider };
}
