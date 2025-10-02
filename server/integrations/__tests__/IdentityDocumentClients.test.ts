import { OktaAPIClient } from '../OktaAPIClient.js';
import { GoogleAdminAPIClient } from '../GoogleAdminAPIClient.js';
import { DocusignAPIClient } from '../DocusignAPIClient.js';
import { EgnyteAPIClient } from '../EgnyteAPIClient.js';

type RecordedRequest = { url: string; init: RequestInit };

type Responder = (url: string, init: RequestInit) => Response | Promise<Response>;

async function runWithMockFetch(responders: Responder[], executor: (requests: RecordedRequest[]) => Promise<void>): Promise<void> {
  const requests: RecordedRequest[] = [];
  const originalFetch = globalThis.fetch;
  let callIndex = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const providedInit = init ?? (input instanceof Request ? ({
      method: input.method,
      headers: Object.fromEntries(input.headers.entries()),
      body: (input as any).body,
    } as RequestInit) : {});
    const capturedInit: RequestInit = { ...providedInit };
    (capturedInit as any).body = (providedInit as any)?.body;
    requests.push({ url, init: capturedInit });

    const responder = responders[Math.min(callIndex, responders.length - 1)];
    callIndex += 1;
    return responder(url, providedInit);
  }) as typeof fetch;

  try {
    await executor(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function parseJsonBody(request: RecordedRequest): any {
  const body = (request.init as any)?.body;
  if (!body) return undefined;
  if (typeof body === 'string') {
    return JSON.parse(body);
  }
  if (body instanceof Uint8Array) {
    return JSON.parse(Buffer.from(body).toString('utf8'));
  }
  if (body instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(body).toString('utf8'));
  }
  if (ArrayBuffer.isView(body)) {
    return JSON.parse(Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('utf8'));
  }
  throw new Error('Unsupported body type for JSON parsing');
}

function readBinaryBody(request: RecordedRequest): Buffer | undefined {
  const body = (request.init as any)?.body;
  if (!body) return undefined;
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  return undefined;
}

function jsonResponse(data: any, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

function assertSuccess(response: { success: boolean } | undefined, message: string): void {
  if (!response?.success) {
    throw new Error(message);
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testOktaProvisioning(): Promise<void> {
  await runWithMockFetch([
    () => jsonResponse({ id: '00u1' }),
    () => jsonResponse({ success: true }),
    () => jsonResponse([{ id: '00u1' }]),
  ], async requests => {
    const client = new OktaAPIClient({ domain: 'example.okta.com', apiToken: 'test-token' });

    const createResult = await client.createUser({
      profile: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        login: 'ada@example.com',
      },
      groupIds: ['00g1'],
    });
    assertSuccess(createResult, 'createUser should succeed');

    const groupResult = await client.addUserToGroup({ userId: '00u1', groupId: '00g1' });
    assertSuccess(groupResult, 'addUserToGroup should succeed');

    const listResult = await client.listUsers({ limit: 50 });
    assertSuccess(listResult, 'listUsers should succeed');

    expect(requests.length === 3, 'expected three Okta API calls');
    expect(requests[0].url.endsWith('/users?activate=true'), 'createUser should include activate query parameter');
    const createBody = parseJsonBody(requests[0]);
    expect(createBody.profile.email === 'ada@example.com', 'createUser should forward profile');
    expect(
      Array.isArray(createBody.groupIds) && createBody.groupIds.length === 1 && createBody.groupIds[0] === '00g1',
      'createUser should include groupIds'
    );

    expect(
      requests[1].url.endsWith('/groups/00g1/users/00u1'),
      'addUserToGroup should target group membership endpoint'
    );
    expect(((requests[1].init.method || 'PUT') as string).toUpperCase() === 'PUT', 'group assignment should use PUT');

    expect(requests[2].url.includes('limit=50'), 'listUsers should forward pagination parameters');
  });
}

async function testGoogleAdminGroups(): Promise<void> {
  await runWithMockFetch([
    () => jsonResponse({ id: 'user-1' }),
    () => jsonResponse({ id: 'group-1' }),
    () => jsonResponse({ role: 'MEMBER' }),
    () => jsonResponse({ success: true }),
  ], async requests => {
    const client = new GoogleAdminAPIClient({ accessToken: 'admin-token' });

    const createUser = await client.createUser({
      primaryEmail: 'new.user@example.com',
      name: { givenName: 'New', familyName: 'User' },
      password: 'TempPass123!',
    });
    assertSuccess(createUser, 'createUser should succeed');

    const createGroup = await client.createGroup({
      email: 'eng@example.com',
      name: 'Engineering',
    });
    assertSuccess(createGroup, 'createGroup should succeed');

    const addMember = await client.addGroupMember({ groupKey: 'eng@example.com', email: 'new.user@example.com' });
    assertSuccess(addMember, 'addGroupMember should succeed');

    const removeMember = await client.removeGroupMember({ groupKey: 'eng@example.com', memberKey: 'new.user@example.com' });
    assertSuccess(removeMember, 'removeGroupMember should succeed');

    expect(requests.length === 4, 'expected four Google Admin API calls');
    const userBody = parseJsonBody(requests[0]);
    expect(userBody.primaryEmail === 'new.user@example.com', 'createUser should send primaryEmail');
    const groupBody = parseJsonBody(requests[1]);
    expect(groupBody.email === 'eng@example.com', 'createGroup should send group email');
    const addBody = parseJsonBody(requests[2]);
    expect(addBody.email === 'new.user@example.com', 'addGroupMember should send member email');
    expect(addBody.role === 'MEMBER', 'addGroupMember should default role to MEMBER');
    expect(
      requests[3].url.endsWith('/groups/eng%40example.com/members/new.user%40example.com'),
      'remove member should target encoded member endpoint'
    );
  });
}

async function testDocusignEnvelope(): Promise<void> {
  await runWithMockFetch([
    () => jsonResponse({ envelopeId: 'env123' }),
  ], async requests => {
    const client = new DocusignAPIClient({
      accessToken: 'docusign-token',
      accountId: '123456',
      baseUrl: 'https://demo.docusign.net/restapi/v2.1',
    });

    const create = await client.createEnvelope({
      emailSubject: 'Please sign this document',
      documents: [
        { documentBase64: Buffer.from('agreement').toString('base64'), name: 'Agreement.pdf', documentId: '1' },
      ],
      recipients: {
        signers: [
          { email: 'signer@example.com', name: 'Signer Example', recipientId: '1' },
        ],
      },
    });

    assertSuccess(create, 'createEnvelope should succeed');
    expect(
      requests[0].url.includes('/accounts/123456/envelopes'),
      'createEnvelope should use the accountId from credentials when not provided'
    );
    const body = parseJsonBody(requests[0]);
    expect(body.emailSubject === 'Please sign this document', 'createEnvelope should forward subject');
    expect(body.documents[0].name === 'Agreement.pdf', 'createEnvelope should include document name');
    expect(body.recipients.signers[0].email === 'signer@example.com', 'createEnvelope should include signer email');
  });
}

async function testEgnyteFileTransfer(): Promise<void> {
  const fileBytes = Buffer.from('Hello Egnyte!', 'utf8');
  await runWithMockFetch([
    () => jsonResponse({ checksum: 'abc123' }),
    () => new Response(fileBytes, { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
  ], async requests => {
    const client = new EgnyteAPIClient({ domain: 'example.egnyte.com', accessToken: 'egnyte-token' });

    const upload = await client.uploadFile({
      path: '/Shared/test',
      fileName: 'greeting.txt',
      fileContent: fileBytes.toString('base64'),
      overwrite: true,
    });
    assertSuccess(upload, 'uploadFile should succeed');

    const download = await client.downloadFile({ path: '/Shared/test/greeting.txt' });
    assertSuccess(download, 'downloadFile should succeed');
    const downloaded = Buffer.from(download.data!);
    expect(downloaded.equals(fileBytes), 'downloaded payload should match uploaded bytes');

    expect(requests.length === 2, 'expected upload and download calls');
    expect(
      requests[0].url.includes('/fs-content//Shared/test?filename=greeting.txt&overwrite=true'),
      'uploadFile should include encoded file path and query'
    );
    const uploadBody = readBinaryBody(requests[0]);
    expect(uploadBody?.equals(fileBytes) ?? false, 'upload should send raw file bytes');
    expect(requests[1].url.endsWith('/fs-content//Shared/test/greeting.txt'), 'download should target encoded file path');
  });
}

await testOktaProvisioning();
await testGoogleAdminGroups();
await testDocusignEnvelope();
await testEgnyteFileTransfer();

console.log('Identity, signature, and storage client flows verified.');
