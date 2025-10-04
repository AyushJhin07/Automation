import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getErrorMessage } from '../../types/common.js';

export interface GenerateDataKeyResult {
  plaintextKey: Buffer;
  encryptedKey: string;
}

export interface KmsClient {
  readonly provider: 'aws' | 'gcp' | 'local';
  generateDataKey(keyResource: string): Promise<GenerateDataKeyResult>;
  decryptDataKey(encryptedKey: string, keyResource?: string): Promise<Buffer>;
}

class LocalKmsClient implements KmsClient {
  public readonly provider = 'local' as const;
  private readonly masterKey: Buffer;

  constructor(masterKey: string) {
    if (!masterKey || masterKey.length < 32) {
      throw new Error('Local KMS requires ENCRYPTION_MASTER_KEY to be at least 32 characters');
    }
    this.masterKey = Buffer.from(masterKey.slice(0, 32), 'utf8');
  }

  async generateDataKey(): Promise<GenerateDataKeyResult> {
    const plaintext = randomBytes(32);
    const hmac = createHmac('sha256', this.masterKey).update(plaintext).digest();
    const payload = Buffer.concat([plaintext, hmac]).toString('base64');
    return { plaintextKey: plaintext, encryptedKey: payload };
  }

  async decryptDataKey(encryptedKey: string): Promise<Buffer> {
    const buf = Buffer.from(encryptedKey, 'base64');
    if (buf.length < 64) {
      throw new Error('Invalid encrypted data key payload');
    }
    const plaintext = buf.subarray(0, 32);
    const providedHmac = buf.subarray(32);
    const expected = createHmac('sha256', this.masterKey).update(plaintext).digest();
    if (!timingSafeEqual(providedHmac, expected)) {
      throw new Error('Encrypted data key integrity check failed');
    }
    return plaintext;
  }
}

class AwsKmsClient implements KmsClient {
  public readonly provider = 'aws' as const;
  private clientPromise: Promise<any> | null = null;
  private modulePromise: Promise<any> | null = null;

  private async loadModule() {
    if (!this.modulePromise) {
      this.modulePromise = import('@aws-sdk/client-kms').catch((error) => {
        throw new Error(
          `@aws-sdk/client-kms is required for AWS KMS support. Install the dependency to enable it. (${getErrorMessage(
            error
          )})`
        );
      });
    }
    return this.modulePromise;
  }

  private async getClient() {
    if (!this.clientPromise) {
      this.clientPromise = this.loadModule().then((mod) => new mod.KMSClient({}));
    }
    return this.clientPromise;
  }

  async generateDataKey(keyResource: string): Promise<GenerateDataKeyResult> {
    const mod = await this.loadModule();
    const client = await this.getClient();
    const command = new mod.GenerateDataKeyCommand({ KeyId: keyResource, KeySpec: 'AES_256' });
    const response = await client.send(command);
    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('AWS KMS generateDataKey response missing key material');
    }
    return {
      plaintextKey: Buffer.from(response.Plaintext),
      encryptedKey: Buffer.from(response.CiphertextBlob).toString('base64'),
    };
  }

  async decryptDataKey(encryptedKey: string, keyResource?: string): Promise<Buffer> {
    const mod = await this.loadModule();
    const client = await this.getClient();
    const command = new mod.DecryptCommand({
      KeyId: keyResource,
      CiphertextBlob: Buffer.from(encryptedKey, 'base64'),
    });
    const response = await client.send(command);
    if (!response.Plaintext) {
      throw new Error('AWS KMS decrypt response missing plaintext');
    }
    return Buffer.from(response.Plaintext);
  }
}

class GcpKmsClient implements KmsClient {
  public readonly provider = 'gcp' as const;
  private modulePromise: Promise<any> | null = null;
  private clientPromise: Promise<any> | null = null;

  private async loadModule() {
    if (!this.modulePromise) {
      this.modulePromise = import('@google-cloud/kms').catch((error) => {
        throw new Error(
          `@google-cloud/kms is required for GCP KMS support. Install the dependency to enable it. (${getErrorMessage(
            error
          )})`
        );
      });
    }
    return this.modulePromise;
  }

  private async getClient() {
    if (!this.clientPromise) {
      this.clientPromise = this.loadModule().then((mod) => new mod.KeyManagementServiceClient());
    }
    return this.clientPromise;
  }

  private getLocationFromResource(keyResource: string): string {
    const match = keyResource.match(/^(projects\/[^/]+\/locations\/[^/]+)/);
    if (!match) {
      throw new Error(`Unable to determine location for GCP KMS resource: ${keyResource}`);
    }
    return match[1];
  }

  async generateDataKey(keyResource: string): Promise<GenerateDataKeyResult> {
    const mod = await this.loadModule();
    const client = await this.getClient();
    const location = this.getLocationFromResource(keyResource);
    const [randomBytesResponse] = await client.generateRandomBytes({
      location,
      lengthBytes: 32,
    });
    if (!randomBytesResponse.data) {
      throw new Error('GCP KMS generateRandomBytes response missing data');
    }
    const plaintextKey = Buffer.from(randomBytesResponse.data as Uint8Array);
    const [encryptResponse] = await client.encrypt({
      name: keyResource,
      plaintext: plaintextKey,
    });
    if (!encryptResponse.ciphertext) {
      throw new Error('GCP KMS encrypt response missing ciphertext');
    }
    return {
      plaintextKey,
      encryptedKey: Buffer.from(encryptResponse.ciphertext as Uint8Array).toString('base64'),
    };
  }

  async decryptDataKey(encryptedKey: string, keyResource?: string): Promise<Buffer> {
    if (!keyResource) {
      throw new Error('GCP KMS decrypt requires the crypto key resource name');
    }
    const client = await this.getClient();
    const [response] = await client.decrypt({
      name: keyResource,
      ciphertext: Buffer.from(encryptedKey, 'base64'),
    });
    if (!response.plaintext) {
      throw new Error('GCP KMS decrypt response missing plaintext');
    }
    return Buffer.from(response.plaintext as Uint8Array);
  }
}

let cachedClient: KmsClient | null = null;

export function getKmsClient(): KmsClient {
  if (cachedClient) {
    return cachedClient;
  }

  const provider = (process.env.KMS_PROVIDER ?? '').toLowerCase();
  if (provider === 'aws') {
    cachedClient = new AwsKmsClient();
    return cachedClient;
  }
  if (provider === 'gcp') {
    cachedClient = new GcpKmsClient();
    return cachedClient;
  }

  const fallbackSecret = process.env.LOCAL_KMS_SECRET ?? process.env.ENCRYPTION_MASTER_KEY ?? '';
  cachedClient = new LocalKmsClient(fallbackSecret);
  return cachedClient;
}

export function resetKmsClientForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetKmsClientForTests should only be used in test environment');
  }
  cachedClient = null;
}
