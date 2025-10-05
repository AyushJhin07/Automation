import { createHmac, createHash } from 'node:crypto';

type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type FetchSecretInput = {
  region: string;
  secretId: string;
  credentials: AwsCredentials;
};

type SecretPayload = Record<string, string>;

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const pad = (value: number) => value.toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  const amzDate = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  const dateStamp = `${year}${month}${day}`;
  return { amzDate, dateStamp };
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

function normaliseKeyName(secretId: string): string {
  return secretId
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
}

function parseSecretString(secretId: string, payload: string): SecretPayload {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: SecretPayload = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          result[key] = value;
        }
      }
      if (Object.keys(result).length > 0) {
        return result;
      }
    }
  } catch {
    // fall back to treating the payload as a single secret value
  }

  return { [normaliseKeyName(secretId)]: payload };
}

async function fetchSecretValue({ region, secretId, credentials }: FetchSecretInput): Promise<SecretPayload> {
  const host = `secretsmanager.${region}.amazonaws.com`;
  const target = 'secretsmanager.GetSecretValue';
  const body = JSON.stringify({ SecretId: secretId });
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const service = 'secretsmanager';

  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`,
    'content-type;host;x-amz-date;x-amz-target',
    createHash('sha256').update(body).digest('hex'),
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = getSignatureKey(credentials.secretAccessKey, dateStamp, region, service);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Date': amzDate,
    'X-Amz-Target': target,
    Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=${signature}`,
  };

  if (credentials.sessionToken) {
    headers['X-Amz-Security-Token'] = credentials.sessionToken;
  }

  const response = await fetch(`https://${host}/`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch secret ${secretId} (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    SecretString?: string;
    SecretBinary?: string;
  };

  if (data.SecretString) {
    return parseSecretString(secretId, data.SecretString);
  }

  if (data.SecretBinary) {
    const decoded = Buffer.from(data.SecretBinary, 'base64').toString('utf8');
    return parseSecretString(secretId, decoded);
  }

  return {};
}

export async function loadAwsSecrets(
  region: string,
  secretIds: string[],
  credentials: AwsCredentials,
): Promise<Record<string, SecretPayload>> {
  const aggregated: Record<string, SecretPayload> = {};

  for (const secretId of secretIds) {
    aggregated[secretId] = await fetchSecretValue({ region, secretId, credentials });
  }

  return aggregated;
}

export function resolveAwsCredentialsFromEnv(): AwsCredentials {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'AWS credentials not found in environment variables. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY or provide a metadata-backed credential source.',
    );
  }

  return { accessKeyId, secretAccessKey, sessionToken };
}
