/**
 * WEBHOOK VERIFIER - Validates incoming webhook signatures and authenticity
 * Supports signature verification for major platforms and provides security for webhook endpoints
 */

import crypto from 'crypto';

export enum WebhookVerificationFailureReason {
  PROVIDER_NOT_REGISTERED = 'PROVIDER_NOT_REGISTERED',
  MISSING_SECRET = 'MISSING_SECRET',
  MISSING_SIGNATURE = 'MISSING_SIGNATURE',
  MISSING_TIMESTAMP = 'MISSING_TIMESTAMP',
  INVALID_SIGNATURE_FORMAT = 'INVALID_SIGNATURE_FORMAT',
  SIGNATURE_MISMATCH = 'SIGNATURE_MISMATCH',
  TIMESTAMP_OUT_OF_TOLERANCE = 'TIMESTAMP_OUT_OF_TOLERANCE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface WebhookVerificationMetadata {
  timestamp?: string;
  eventType?: string;
  signatureMethod?: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  provider: string;
  failureReason?: WebhookVerificationFailureReason;
  message?: string;
  signatureHeader?: string;
  providedSignature?: string;
  timestampSkewSeconds?: number;
  metadata?: WebhookVerificationMetadata;
}

export interface WebhookVerificationRequest {
  headers: Record<string, string>;
  payload: any;
  rawBody?: string | Buffer;
  secret: string;
  toleranceSecondsOverride?: number;
}

interface ProviderVerificationContext {
  headers: Record<string, string>;
  payload: any;
  body: string;
  rawBody?: string | Buffer;
  secret: string;
  config: ProviderConfig;
  toleranceSeconds?: number;
}

type ProviderVerifier = (context: ProviderVerificationContext) => WebhookVerificationResult;

interface ProviderConfig {
  provider: string;
  aliases?: string[];
  algorithm?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  timestampToleranceSeconds?: number;
  verifier: ProviderVerifier;
}

const SLACK_SIGNATURE_VERSION = 'v0';

function toBuffer(value: string, encoding: BufferEncoding | 'hex' | 'base64' = 'utf8'): Buffer | null {
  try {
    if (encoding === 'hex' && value.length % 2 !== 0) {
      return null;
    }
    return Buffer.from(value, encoding as BufferEncoding);
  } catch {
    return null;
  }
}

function constantTimeEquals(expected: string, provided: string, encoding: BufferEncoding | 'hex' | 'base64' = 'utf8'): boolean {
  const expectedBuffer = toBuffer(expected, encoding);
  const providedBuffer = toBuffer(provided, encoding);
  if (!expectedBuffer || !providedBuffer) {
    return false;
  }
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function failure(
  provider: string,
  reason: WebhookVerificationFailureReason,
  message: string,
  extras: Partial<WebhookVerificationResult> = {}
): WebhookVerificationResult {
  return {
    isValid: false,
    provider,
    failureReason: reason,
    message,
    ...extras,
  };
}

function success(provider: string, extras: Partial<WebhookVerificationResult> = {}): WebhookVerificationResult {
  return {
    isValid: true,
    provider,
    ...extras,
  };
}

function resolveBody(payload: any, rawBody?: string | Buffer): string {
  if (typeof rawBody === 'string') {
    return rawBody;
  }
  if (rawBody instanceof Buffer) {
    return rawBody.toString('utf8');
  }
  if (typeof payload === 'string') {
    return payload;
  }
  return JSON.stringify(payload ?? {});
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value === 'string') {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.trunc(parsed / 1000);
}

function applyTimestampTolerance(
  provider: string,
  timestampValue: string | undefined,
  toleranceSeconds?: number
): { valid: boolean; result?: WebhookVerificationResult; skew?: number; timestamp?: string } {
  if (timestampValue === undefined) {
    return {
      valid: false,
      result: failure(provider, WebhookVerificationFailureReason.MISSING_TIMESTAMP, 'Missing timestamp header'),
    };
  }

  const parsed = parseTimestamp(timestampValue);
  if (parsed === null) {
    return {
      valid: false,
      result: failure(provider, WebhookVerificationFailureReason.INVALID_SIGNATURE_FORMAT, 'Unable to parse timestamp header'),
    };
  }

  if (toleranceSeconds === undefined) {
    return { valid: true, skew: undefined, timestamp: timestampValue };
  }

  const currentSeconds = Math.floor(Date.now() / 1000);
  const skew = Math.abs(currentSeconds - parsed);

  if (skew > toleranceSeconds) {
    return {
      valid: false,
      result: failure(
        provider,
        WebhookVerificationFailureReason.TIMESTAMP_OUT_OF_TOLERANCE,
        `Timestamp outside tolerance window (${toleranceSeconds}s)`,
        { timestampSkewSeconds: skew, metadata: { timestamp: timestampValue } }
      ),
      skew,
      timestamp: timestampValue,
    };
  }

  return { valid: true, skew, timestamp: timestampValue };
}

class WebhookVerifier {
  private providers = new Map<string, ProviderConfig>();

  registerProvider(config: ProviderConfig): void {
    const entry = { ...config };
    this.providers.set(config.provider, entry);
    if (config.aliases) {
      for (const alias of config.aliases) {
        this.providers.set(alias, entry);
      }
    }
    console.log(`🔒 Registered webhook verification for ${config.provider}`);
  }

  async verifyWebhook(provider: string, request: WebhookVerificationRequest): Promise<WebhookVerificationResult> {
    try {
      const config = this.providers.get(provider);
      if (!config) {
        return failure(provider, WebhookVerificationFailureReason.PROVIDER_NOT_REGISTERED, `No verification configuration found for provider: ${provider}`);
      }

      if (!request.secret) {
        return failure(config.provider, WebhookVerificationFailureReason.MISSING_SECRET, 'Webhook secret is required for signature verification');
      }

      const headers = normalizeHeaders(request.headers);
      const body = resolveBody(request.payload, request.rawBody);

      const context: ProviderVerificationContext = {
        headers,
        payload: request.payload,
        body,
        rawBody: request.rawBody,
        secret: request.secret,
        config,
        toleranceSeconds: request.toleranceSecondsOverride,
      };

      const result = config.verifier(context);

      if (!result.signatureHeader && config.signatureHeader) {
        result.signatureHeader = config.signatureHeader;
      }
      if (!result.providedSignature && result.signatureHeader) {
        result.providedSignature = headers[result.signatureHeader.toLowerCase()];
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return failure(provider, WebhookVerificationFailureReason.INTERNAL_ERROR, `Verification error: ${message}`);
    }
  }

  generateTestSignature(
    provider: string,
    body: string,
    customConfig?: Partial<Pick<ProviderConfig, 'signatureHeader' | 'algorithm' | 'timestampToleranceSeconds'>>
  ): { signature: string; headers: Record<string, string> } {
    const config = this.providers.get(provider);
    if (!config) {
      throw new Error(`No configuration found for provider: ${provider}`);
    }

    const headers: Record<string, string> = {};
    const signatureHeader = customConfig?.signatureHeader ?? config.signatureHeader;

    switch (config.provider) {
      case 'github': {
        const signature = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(body).digest('hex');
        if (signatureHeader) headers[signatureHeader] = signature;
        return { signature, headers };
      }

      case 'stripe': {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = crypto.createHmac('sha256', 'test-secret').update(`${timestamp}.${body}`).digest('hex');
        const headerValue = `t=${timestamp},v1=${signature}`;
        if (signatureHeader) headers[signatureHeader] = headerValue;
        return { signature: headerValue, headers };
      }

      case 'slack': {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = `${SLACK_SIGNATURE_VERSION}=` + crypto.createHmac('sha256', 'test-secret').update(`${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`).digest('hex');
        if (signatureHeader) {
          headers[signatureHeader] = signature;
        }
        headers[config.timestampHeader ?? 'x-slack-request-timestamp'] = timestamp;
        return { signature, headers };
      }

      default: {
        const algorithm = customConfig?.algorithm ?? config.algorithm ?? 'sha256';
        const signature = crypto.createHmac(algorithm, 'test-secret').update(body).digest('hex');
        if (signatureHeader) {
          headers[signatureHeader] = signature;
        }
        return { signature, headers };
      }
    }
  }

  hasProvider(provider: string): boolean {
    return this.providers.has(provider);
  }

  getRegisteredProviders(): string[] {
    return Array.from(new Set(Array.from(this.providers.values()).map((config) => config.provider)));
  }

  getVerificationStats(): {
    registeredProviders: number;
    supportedProviders: string[];
  } {
    const providers = this.getRegisteredProviders();
    return {
      registeredProviders: providers.length,
      supportedProviders: providers,
    };
  }
}

function genericHmacVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const headerName = context.config.signatureHeader ?? 'x-signature';
  const signature = context.headers[headerName.toLowerCase()];

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, `Missing signature header: ${headerName}`);
  }

  const algorithm = context.config.algorithm ?? 'sha256';
  let cleanedSignature = signature;

  if (signature.startsWith(`${algorithm}=`)) {
    cleanedSignature = signature.slice(algorithm.length + 1);
  } else if (signature.startsWith(`${algorithm.toUpperCase()}=`)) {
    cleanedSignature = signature.slice(algorithm.length + 1);
  }

  const expectedSignature = crypto.createHmac(algorithm, context.secret).update(context.body).digest('hex');

  const isValid = constantTimeEquals(expectedSignature, cleanedSignature, 'hex');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'Signature mismatch', {
      signatureHeader: headerName,
      providedSignature: signature,
    });
  }

  return success(provider, {
    signatureHeader: headerName,
    providedSignature: signature,
    metadata: { signatureMethod: algorithm },
  });
}

function slackVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const signatureHeader = context.config.signatureHeader ?? 'x-slack-signature';
  const timestampHeader = context.config.timestampHeader ?? 'x-slack-request-timestamp';
  const signature = context.headers[signatureHeader.toLowerCase()];
  const timestamp = context.headers[timestampHeader.toLowerCase()];

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing Slack signature header', {
      signatureHeader,
    });
  }

  const tolerance = context.toleranceSeconds ?? context.config.timestampToleranceSeconds ?? 300;
  const timestampCheck = applyTimestampTolerance(provider, timestamp, tolerance);

  if (!timestampCheck.valid && timestampCheck.result) {
    return {
      ...timestampCheck.result,
      signatureHeader,
      providedSignature: signature,
    };
  }

  if (!timestamp) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_TIMESTAMP, 'Missing Slack timestamp header', {
      signatureHeader,
      providedSignature: signature,
    });
  }

  const signatureBase = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${context.body}`;
  const expectedSignature = `${SLACK_SIGNATURE_VERSION}=` + crypto.createHmac('sha256', context.secret).update(signatureBase).digest('hex');

  const isValid = constantTimeEquals(expectedSignature, signature, 'utf8');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'Slack signature mismatch', {
      signatureHeader,
      providedSignature: signature,
      metadata: { timestamp },
      timestampSkewSeconds: timestampCheck.skew,
    });
  }

  return success(provider, {
    signatureHeader,
    providedSignature: signature,
    metadata: {
      timestamp,
      signatureMethod: 'sha256',
    },
    timestampSkewSeconds: timestampCheck.skew,
  });
}

function stripeVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const signatureHeader = context.config.signatureHeader ?? 'stripe-signature';
  const headerValue = context.headers[signatureHeader.toLowerCase()];

  if (!headerValue) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing Stripe signature header', {
      signatureHeader,
    });
  }

  const parts = headerValue.split(',');
  const values: Record<string, string> = {};
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      values[key.trim()] = value.trim();
    }
  }

  const timestamp = values['t'];
  const signature = values['v1'];

  if (!timestamp || !signature) {
    return failure(provider, WebhookVerificationFailureReason.INVALID_SIGNATURE_FORMAT, 'Invalid Stripe signature format', {
      signatureHeader,
      providedSignature: headerValue,
    });
  }

  const tolerance = context.toleranceSeconds ?? context.config.timestampToleranceSeconds ?? 300;
  const timestampCheck = applyTimestampTolerance(provider, timestamp, tolerance);
  if (!timestampCheck.valid && timestampCheck.result) {
    return {
      ...timestampCheck.result,
      signatureHeader,
      providedSignature: headerValue,
    };
  }

  const expectedSignature = crypto.createHmac('sha256', context.secret).update(`${timestamp}.${context.body}`).digest('hex');

  const isValid = constantTimeEquals(expectedSignature, signature, 'hex');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'Stripe signature mismatch', {
      signatureHeader,
      providedSignature: headerValue,
      metadata: { timestamp, signatureMethod: 'sha256' },
      timestampSkewSeconds: timestampCheck.skew,
    });
  }

  return success(provider, {
    signatureHeader,
    providedSignature: headerValue,
    metadata: { timestamp, signatureMethod: 'sha256' },
    timestampSkewSeconds: timestampCheck.skew,
  });
}

function shopifyVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const signatureHeader = context.config.signatureHeader ?? 'x-shopify-hmac-sha256';
  const signature = context.headers[signatureHeader.toLowerCase()];

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing Shopify signature header', {
      signatureHeader,
    });
  }

  const expectedSignature = crypto.createHmac('sha256', context.secret).update(context.body).digest('base64');
  const isValid = constantTimeEquals(expectedSignature, signature, 'base64');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'Shopify signature mismatch', {
      signatureHeader,
      providedSignature: signature,
    });
  }

  return success(provider, {
    signatureHeader,
    providedSignature: signature,
    metadata: { signatureMethod: 'sha256' },
  });
}

function githubVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const primaryHeader = context.config.signatureHeader ?? 'x-hub-signature-256';
  const fallbackHeader = 'x-hub-signature';

  let signature = context.headers[primaryHeader.toLowerCase()];
  let algorithm = 'sha256';

  if (!signature) {
    signature = context.headers[fallbackHeader];
    algorithm = 'sha1';
  }

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing GitHub signature header', {
      signatureHeader: primaryHeader,
    });
  }

  const prefix = `${algorithm}=`;
  if (!signature.startsWith(prefix)) {
    return failure(provider, WebhookVerificationFailureReason.INVALID_SIGNATURE_FORMAT, 'Invalid GitHub signature format', {
      signatureHeader: primaryHeader,
      providedSignature: signature,
    });
  }

  const expectedSignature = prefix + crypto.createHmac(algorithm, context.secret).update(context.body).digest('hex');

  const isValid = constantTimeEquals(expectedSignature, signature, 'utf8');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'GitHub signature mismatch', {
      signatureHeader: primaryHeader,
      providedSignature: signature,
      metadata: { signatureMethod: algorithm },
    });
  }

  return success(provider, {
    signatureHeader: primaryHeader,
    providedSignature: signature,
    metadata: {
      eventType: context.headers['x-github-event'],
      signatureMethod: algorithm,
    },
  });
}

function simpleEqualityVerifier(
  provider: string,
  headerName: string,
  context: ProviderVerificationContext
): WebhookVerificationResult {
  const signature = context.headers[headerName.toLowerCase()];
  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, `Missing ${headerName} header`, {
      signatureHeader: headerName,
    });
  }

  if (signature !== context.secret) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, `${provider} signature mismatch`, {
      signatureHeader: headerName,
      providedSignature: signature,
    });
  }

  return success(provider, {
    signatureHeader: headerName,
    providedSignature: signature,
  });
}

function hmacEqualityVerifier(
  provider: string,
  headerName: string,
  algorithm: string,
  context: ProviderVerificationContext,
  encoding: BufferEncoding | 'hex' | 'base64' = 'hex'
): WebhookVerificationResult {
  const signature = context.headers[headerName.toLowerCase()];
  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, `Missing ${headerName} header`, {
      signatureHeader: headerName,
    });
  }

  const expectedSignature = crypto.createHmac(algorithm, context.secret).update(context.body).digest(
    encoding === 'hex' || encoding === 'base64' ? encoding : 'hex'
  );

  const expectedString = typeof expectedSignature === 'string' ? expectedSignature : expectedSignature.toString();
  const isValid = encoding === 'base64'
    ? constantTimeEquals(expectedString, signature, 'base64')
    : constantTimeEquals(expectedString, signature, 'utf8');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, `${provider} signature mismatch`, {
      signatureHeader: headerName,
      providedSignature: signature,
    });
  }

  return success(provider, {
    signatureHeader: headerName,
    providedSignature: signature,
    metadata: { signatureMethod: algorithm },
  });
}

function gitlabVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  return simpleEqualityVerifier(context.config.provider, 'x-gitlab-token', context);
}

function bitbucketVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const headerName = context.config.signatureHeader ?? 'x-hub-signature';
  const signature = context.headers[headerName.toLowerCase()];

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing Bitbucket signature header', {
      signatureHeader: headerName,
    });
  }

  const expected = 'sha256=' + crypto.createHmac('sha256', context.secret).update(context.body).digest('hex');
  const isValid = constantTimeEquals(expected, signature, 'utf8');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'Bitbucket signature mismatch', {
      signatureHeader: headerName,
      providedSignature: signature,
    });
  }

  return success(provider, {
    signatureHeader: headerName,
    providedSignature: signature,
    metadata: { signatureMethod: 'sha256' },
  });
}

function zendeskVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const signatureHeader = context.config.signatureHeader ?? 'x-zendesk-webhook-signature';
  const timestampHeader = context.config.timestampHeader ?? 'x-zendesk-webhook-signature-timestamp';
  const signature = context.headers[signatureHeader.toLowerCase()];
  const timestamp = context.headers[timestampHeader.toLowerCase()];

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing Zendesk signature header', {
      signatureHeader,
    });
  }

  const expectedSignature = crypto.createHash('sha256').update(`${context.body}${context.secret}${timestamp ?? ''}`, 'utf8').digest('base64');
  const isValid = constantTimeEquals(expectedSignature, signature, 'base64');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'Zendesk signature mismatch', {
      signatureHeader,
      providedSignature: signature,
      metadata: { timestamp },
    });
  }

  return success(provider, {
    signatureHeader,
    providedSignature: signature,
    metadata: { timestamp, signatureMethod: 'sha256' },
  });
}

function intercomVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const signatureHeader = context.config.signatureHeader ?? 'x-hub-signature';
  const signature = context.headers[signatureHeader.toLowerCase()];

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing Intercom signature header', {
      signatureHeader,
    });
  }

  const expectedSignature = 'sha1=' + crypto.createHmac('sha1', context.secret).update(context.body).digest('hex');
  const isValid = constantTimeEquals(expectedSignature, signature, 'utf8');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'Intercom signature mismatch', {
      signatureHeader,
      providedSignature: signature,
    });
  }

  return success(provider, {
    signatureHeader,
    providedSignature: signature,
    metadata: { signatureMethod: 'sha1' },
  });
}

function hubspotVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const provider = context.config.provider;
  const signatureHeader = context.config.signatureHeader ?? 'x-hubspot-signature';
  const timestampHeader = context.config.timestampHeader ?? 'x-hubspot-request-timestamp';
  const signature = context.headers[signatureHeader.toLowerCase()];
  const timestamp = context.headers[timestampHeader.toLowerCase()];

  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing HubSpot signature header', {
      signatureHeader,
    });
  }

  const timestampCheck = applyTimestampTolerance(provider, timestamp, context.toleranceSeconds ?? context.config.timestampToleranceSeconds ?? 300);
  if (!timestampCheck.valid && timestampCheck.result) {
    return {
      ...timestampCheck.result,
      signatureHeader,
      providedSignature: signature,
    };
  }

  const path = context.headers['path'] ?? '/webhooks';
  const host = context.headers['host'] ?? '';
  const signedPayload = `POST${host}${path}${context.body}${timestamp ?? ''}`;
  const expectedSignature = crypto.createHmac('sha256', context.secret).update(signedPayload).digest('hex');

  const isValid = constantTimeEquals(expectedSignature, signature, 'hex');

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'HubSpot signature mismatch', {
      signatureHeader,
      providedSignature: signature,
      metadata: { timestamp },
      timestampSkewSeconds: timestampCheck.skew,
    });
  }

  return success(provider, {
    signatureHeader,
    providedSignature: signature,
    metadata: { timestamp, signatureMethod: 'sha256' },
    timestampSkewSeconds: timestampCheck.skew,
  });
}

function simpleHmacVerifier(
  provider: string,
  headerName: string,
  algorithm: string,
  context: ProviderVerificationContext,
  encoding: BufferEncoding | 'hex' | 'base64' = 'hex'
): WebhookVerificationResult {
  const signature = context.headers[headerName.toLowerCase()];
  if (!signature) {
    return failure(provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, `Missing ${headerName} header`, {
      signatureHeader: headerName,
    });
  }

  const expectedSignature = crypto.createHmac(algorithm, context.secret).update(context.body).digest(
    encoding === 'hex' || encoding === 'base64' ? encoding : 'hex'
  );
  const expectedString = typeof expectedSignature === 'string' ? expectedSignature : expectedSignature.toString();
  const compareEncoding = encoding === 'base64' ? 'base64' : 'utf8';
  const isValid = constantTimeEquals(expectedString, signature, compareEncoding);

  if (!isValid) {
    return failure(provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, `${provider} signature mismatch`, {
      signatureHeader: headerName,
      providedSignature: signature,
    });
  }

  return success(provider, {
    signatureHeader: headerName,
    providedSignature: signature,
    metadata: { signatureMethod: algorithm },
  });
}

function ringCentralVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  const signature = context.headers['validation-token'] ?? context.headers['verification-token'];
  if (!signature) {
    return failure(context.config.provider, WebhookVerificationFailureReason.MISSING_SIGNATURE, 'Missing RingCentral validation token', {
      signatureHeader: 'validation-token',
    });
  }

  if (signature !== context.secret) {
    return failure(context.config.provider, WebhookVerificationFailureReason.SIGNATURE_MISMATCH, 'RingCentral validation token mismatch', {
      signatureHeader: 'validation-token',
      providedSignature: signature,
    });
  }

  return success(context.config.provider, {
    signatureHeader: 'validation-token',
    providedSignature: signature,
  });
}

function passthroughVerifier(context: ProviderVerificationContext): WebhookVerificationResult {
  return success(context.config.provider, {
    message: 'Verification not implemented; treated as valid',
  });
}

const webhookVerifier = new WebhookVerifier();

webhookVerifier.registerProvider({
  provider: 'generic_hmac',
  algorithm: 'sha256',
  signatureHeader: 'x-signature',
  verifier: genericHmacVerifier,
  aliases: ['generic'],
});

webhookVerifier.registerProvider({
  provider: 'slack',
  signatureHeader: 'x-slack-signature',
  timestampHeader: 'x-slack-request-timestamp',
  timestampToleranceSeconds: 300,
  verifier: slackVerifier,
  aliases: ['slack-enhanced'],
});

webhookVerifier.registerProvider({
  provider: 'stripe',
  signatureHeader: 'stripe-signature',
  timestampToleranceSeconds: 300,
  verifier: stripeVerifier,
  aliases: ['stripe-enhanced'],
});

webhookVerifier.registerProvider({
  provider: 'shopify',
  signatureHeader: 'x-shopify-hmac-sha256',
  verifier: shopifyVerifier,
  aliases: ['shopify-enhanced'],
});

webhookVerifier.registerProvider({
  provider: 'github',
  signatureHeader: 'x-hub-signature-256',
  verifier: githubVerifier,
  aliases: ['github-enhanced'],
});

webhookVerifier.registerProvider({
  provider: 'gitlab',
  signatureHeader: 'x-gitlab-token',
  verifier: gitlabVerifier,
});

webhookVerifier.registerProvider({
  provider: 'bitbucket',
  signatureHeader: 'x-hub-signature',
  verifier: bitbucketVerifier,
});

webhookVerifier.registerProvider({
  provider: 'zendesk',
  signatureHeader: 'x-zendesk-webhook-signature',
  timestampHeader: 'x-zendesk-webhook-signature-timestamp',
  verifier: zendeskVerifier,
});

webhookVerifier.registerProvider({
  provider: 'intercom',
  signatureHeader: 'x-hub-signature',
  verifier: intercomVerifier,
});

webhookVerifier.registerProvider({
  provider: 'jira',
  signatureHeader: 'x-atlassian-webhook-identifier',
  verifier: (context) => simpleEqualityVerifier(context.config.provider, 'x-atlassian-webhook-identifier', context),
  aliases: ['jira-service-management'],
});

webhookVerifier.registerProvider({
  provider: 'hubspot',
  signatureHeader: 'x-hubspot-signature',
  timestampHeader: 'x-hubspot-request-timestamp',
  timestampToleranceSeconds: 300,
  verifier: hubspotVerifier,
  aliases: ['hubspot-enhanced'],
});

webhookVerifier.registerProvider({
  provider: 'marketo',
  signatureHeader: 'x-marketo-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-marketo-signature', 'sha256', context),
});

webhookVerifier.registerProvider({
  provider: 'iterable',
  signatureHeader: 'x-iterable-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-iterable-signature', 'sha1', context),
});

webhookVerifier.registerProvider({
  provider: 'braze',
  signatureHeader: 'x-braze-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-braze-signature', 'sha256', context),
});

webhookVerifier.registerProvider({
  provider: 'docusign',
  signatureHeader: 'x-docusign-signature-1',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-docusign-signature-1', 'sha256', context, 'base64'),
});

webhookVerifier.registerProvider({
  provider: 'adobesign',
  signatureHeader: 'x-adobesign-clientid',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-adobesign-clientid', 'sha256', context),
});

webhookVerifier.registerProvider({
  provider: 'hellosign',
  signatureHeader: 'x-hellosign-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-hellosign-signature', 'sha256', context),
});

webhookVerifier.registerProvider({
  provider: 'calendly',
  signatureHeader: 'calendly-webhook-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'calendly-webhook-signature', 'sha256', context, 'base64'),
});

webhookVerifier.registerProvider({
  provider: 'caldotcom',
  signatureHeader: 'x-cal-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-cal-signature', 'sha256', context),
});

webhookVerifier.registerProvider({
  provider: 'webex',
  signatureHeader: 'x-spark-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-spark-signature', 'sha1', context),
});

webhookVerifier.registerProvider({
  provider: 'ringcentral',
  signatureHeader: 'validation-token',
  verifier: ringCentralVerifier,
});

webhookVerifier.registerProvider({
  provider: 'square',
  signatureHeader: 'x-square-hmacsha256-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-square-hmacsha256-signature', 'sha256', context, 'base64'),
});

webhookVerifier.registerProvider({
  provider: 'bigcommerce',
  signatureHeader: 'x-bc-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-bc-signature', 'sha256', context),
});

webhookVerifier.registerProvider({
  provider: 'surveymonkey',
  signatureHeader: 'x-surveymonkey-signature',
  verifier: (context) => simpleHmacVerifier(context.config.provider, 'x-surveymonkey-signature', 'sha1', context),
});

webhookVerifier.registerProvider({
  provider: 'paypal',
  verifier: passthroughVerifier,
});

console.log('🔒 Webhook verifier initialized with default configurations');

export { webhookVerifier };

