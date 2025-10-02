import assert from 'node:assert/strict';

import { OktaAPIClient } from '../OktaAPIClient.js';
import { GoogleAdminAPIClient } from '../GoogleAdminAPIClient.js';
import { DocusignAPIClient } from '../DocusignAPIClient.js';
import { HellosignAPIClient } from '../HellosignAPIClient.js';
import { AdobesignAPIClient } from '../AdobesignAPIClient.js';
import { EgnyteAPIClient } from '../EgnyteAPIClient.js';

interface MockResponse {
  status?: number;
  body?: string | Uint8Array | Record<string, any>;
  headers?: Record<string, string>;
}

interface RecordedRequest {
  url: string;
  init: RequestInit;
}

const originalFetch = global.fetch;

function serializeBody(body: MockResponse['body']): BodyInit | null {
  if (body === undefined || body === null) {
    return null;
  }
  if (typeof body === 'string' || body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return body as BodyInit;
  }
  return JSON.stringify(body);
}

function useMockFetch(sequence: MockResponse[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  let index = 0;

  global.fetch = (async (input: any, init?: RequestInit): Promise<Response> => {
    const current = sequence[Math.min(index, sequence.length - 1)] ?? {};
    index += 1;
    const url = typeof input === 'string' ? input : input.toString();
    requests.push({ url, init: init ? { ...init } : {} });
    const status = current.status ?? 200;
    const headers = current.headers ?? { 'Content-Type': 'application/json' };
    let body = serializeBody(current.body ?? '{}');
    if (status === 204 || status === 205) {
      body = null;
    }
    return new Response(body, { status, headers });
  }) as typeof fetch;

  return requests;
}

async function testOktaUserProvisioning(): Promise<void> {
  const requests = useMockFetch([
    { body: { id: '00u123', status: 'STAGED' } },
    { status: 204, body: '' },
  ]);

  const client = new OktaAPIClient({ apiKey: 'okta-token', domain: 'example' });

  const create = await client.execute('create_user', {
    profile: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', login: 'ada@example.com' },
    activate: true,
  });

  assert.equal(create.success, true, 'Okta create user should succeed');
  assert.ok(
    requests[0].url.endsWith('/users?activate=true'),
    'Okta create user should target the users endpoint with activate query',
  );
  assert.equal(requests[0].init.headers?.['Authorization'], 'SSWS okta-token');
  const payload = JSON.parse(requests[0].init.body as string);
  assert.equal(payload.profile.email, 'ada@example.com');

  const group = await client.execute('add_user_to_group', { userId: '00u123', groupId: '00g456' });
  assert.equal(group.success, true);
  assert.ok(
    requests[1].url.endsWith('/groups/00g456/users/00u123'),
    'Okta add_user_to_group should call the group membership endpoint',
  );
  assert.equal(requests[1].init.method ?? 'PUT', 'PUT');
}

async function testGoogleAdminTokenRefresh(): Promise<void> {
  let refreshed: { accessToken: string; refreshToken?: string; expiresAt?: number } | undefined;
  const requests = useMockFetch([
    {
      body: { access_token: 'ya29.new-token', refresh_token: 'refresh-token', expires_in: 3600 },
    },
    { body: { id: 'user-1' } },
  ]);

  const client = new GoogleAdminAPIClient({
    accessToken: 'expired-token',
    refreshToken: 'refresh-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    expiresAt: Date.now() - 60_000,
    onTokenRefreshed: tokens => {
      refreshed = tokens;
    },
  });

  const response = await client.execute('create_user', {
    primaryEmail: 'ada@example.com',
    name: { givenName: 'Ada', familyName: 'Lovelace' },
    password: 'TempPass123',
  });

  assert.equal(response.success, true);
  assert.equal(requests.length, 2, 'Google Admin client should refresh token before first call');
  assert.ok(requests[0].url.endsWith('/token'), 'Refresh request should hit the token endpoint');
  assert.equal(
    (requests[1].init.headers ?? {})['Authorization'],
    'Bearer ya29.new-token',
    'Subsequent requests should use refreshed access token',
  );
  assert.ok(refreshed, 'onTokenRefreshed callback should be invoked');
  assert.equal(refreshed?.accessToken, 'ya29.new-token');

  const remove = await client.execute('remove_group_member', {
    groupKey: 'engineering',
    memberKey: 'ada@example.com',
  });
  assert.equal(remove.success, true);
}

async function testDocusignEnvelopeFlow(): Promise<void> {
  const requests = useMockFetch([
    { body: { envelopeId: 'env-123' } },
    { body: new Uint8Array(Buffer.from('PDFDATA')),
      headers: { 'Content-Type': 'application/pdf' } },
  ]);

  const client = new DocusignAPIClient({
    accessToken: 'docusign-token',
    refreshToken: 'refresh-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    expiresAt: Date.now() + 3600_000,
    accountId: 'account-1',
    baseUri: 'https://na3.docusign.net/restapi',
  });

  const envelope = await client.execute('create_envelope', {
    emailSubject: 'Please sign',
    documents: [{ documentId: '1', name: 'contract.pdf', fileBase64: 'Q29udHJhY3Q=' }],
    recipients: { signers: [{ email: 'ada@example.com', name: 'Ada Lovelace', recipientId: '1' }] },
    status: 'sent',
  });

  assert.equal(envelope.success, true);
  assert.ok(requests[0].url.endsWith('/envelopes'));
  const docPayload = JSON.parse(requests[0].init.body as string);
  assert.equal(docPayload.documents[0].name, 'contract.pdf');

  const document = await client.execute('download_document', {
    envelopeId: 'env-123',
    documentId: '1',
  });

  assert.equal(document.success, true);
  assert.equal(document.data?.content, Buffer.from('PDFDATA').toString('base64'));
}

async function testHellosignEmbeddedFlow(): Promise<void> {
  const requests = useMockFetch([
    { body: { signature_request: { signature_request_id: 'req-1' } } },
    { body: { embedded: { sign_url: 'https://app.hellosign.com/sign/abc' } } },
  ]);

  const client = new HellosignAPIClient({ apiKey: 'hs-key' });

  const send = await client.execute('send_signature_request', {
    signers: [{ email_address: 'ada@example.com', name: 'Ada' }],
    title: 'NDA',
  });
  assert.equal(send.success, true);
  const authHeader = requests[0].init.headers?.['Authorization'];
  assert.ok(authHeader?.startsWith('Basic '), 'HelloSign requests should include Basic auth header');

  const embed = await client.execute('get_embedded_sign_url', { signature_id: 'sig-123' });
  assert.equal(embed.success, true);
  assert.ok(requests[1].url.endsWith('/embedded/sign_url/sig-123'));
}

async function testAdobesignAgreementLifecycle(): Promise<void> {
  const requests = useMockFetch([
    { body: { id: 'agreement-1' } },
    { body: '{}' },
    { body: '{}' },
  ]);

  const client = new AdobesignAPIClient({
    accessToken: 'adobe-token',
    refreshToken: 'refresh-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    expiresAt: Date.now() + 3600_000,
  });

  const agreement = await client.execute('create_agreement', {
    name: 'MSA',
    fileInfos: [{ libraryDocumentId: 'lib1' }],
    participantSetsInfo: [{ memberInfos: [{ email: 'ada@example.com' }], order: 1, role: 'SIGNER' }],
  });
  assert.equal(agreement.success, true);

  const send = await client.execute('send_agreement', { agreementId: 'agreement-1' });
  assert.equal(send.success, true);
  assert.ok(requests[1].url.endsWith('/agreements/agreement-1/state'));

  const cancel = await client.execute('cancel_agreement', { agreementId: 'agreement-1', reason: 'Updated terms' });
  assert.equal(cancel.success, true);
}

async function testEgnyteFileOperations(): Promise<void> {
  const requests = useMockFetch([
    { body: '{}' },
    { body: new Uint8Array(Buffer.from('file-bytes')), headers: { 'Content-Type': 'application/octet-stream' } },
    { body: '{"folders":[]}' },
  ]);

  const client = new EgnyteAPIClient({
    accessToken: 'egnyte-token',
    refreshToken: 'refresh-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    expiresAt: Date.now() + 3600_000,
    domain: 'tenant',
  });

  const upload = await client.execute('upload_file', {
    path: '/Shared/contract.pdf',
    content: Buffer.from('Hello Egnyte').toString('base64'),
    overwrite: true,
  });
  assert.equal(upload.success, true);
  assert.ok(
    requests[0].url.endsWith('/fs-content/Shared/contract.pdf'),
    'Egnyte upload should target fs-content with encoded path',
  );
  assert.equal(requests[0].init.method, 'PUT');
  assert.equal(requests[0].init.headers?.['Authorization'], 'Bearer egnyte-token');

  const download = await client.execute('download_file', { path: '/Shared/contract.pdf' });
  assert.equal(download.success, true);
  assert.equal(download.data?.content, Buffer.from('file-bytes').toString('base64'));

  const list = await client.execute('list_folder', { path: '/Shared' });
  assert.equal(list.success, true);
  assert.ok(requests[2].url.includes('/fs/Shared'));
}

await testOktaUserProvisioning();
await testGoogleAdminTokenRefresh();
await testDocusignEnvelopeFlow();
await testHellosignEmbeddedFlow();
await testAdobesignAgreementLifecycle();
await testEgnyteFileOperations();

global.fetch = originalFetch;

console.log('Identity, admin, and document management API clients verified.');
