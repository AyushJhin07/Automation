import assert from 'node:assert/strict';

import { TwilioAPIClient } from '../TwilioAPIClient.js';
import { SendGridAPIClient } from '../SendGridAPIClient.js';
import { MailgunAPIClient } from '../MailgunAPIClient.js';

type FetchCall = { url: string; init?: RequestInit };

const originalFetch = global.fetch;

function getHeader(init: RequestInit | undefined, name: string): string | undefined {
  if (!init?.headers) {
    return undefined;
  }

  const headers = init.headers;
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found ? found[1] : undefined;
  }

  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()];
}

async function withMockedFetch(
  responder: (url: string, init?: RequestInit) => Promise<Response> | Response,
  run: () => Promise<void>
) {
  const calls: FetchCall[] = [];
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    const finalUrl = typeof url === 'string' ? url : url.toString();
    calls.push({ url: finalUrl, init });
    return responder(finalUrl, init);
  }) as any;

  try {
    await run();
  } finally {
    global.fetch = originalFetch;
  }

  return calls;
}

async function testTwilioClient(): Promise<void> {
  const calls = await withMockedFetch(async (_url, init) => {
    assert.equal(getHeader(init, 'Authorization'), `Basic ${Buffer.from('AC123:secret').toString('base64')}`);
    return new Response(JSON.stringify({ sid: 'SM123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }, async () => {
    const client = new TwilioAPIClient({ accountSid: 'AC123', authToken: 'secret' });
    const response = await client.sendSms({ to: '+10000000000', from: '+20000000000', body: 'Hello world' });
    assert.equal(response.success, true, 'Twilio sendSms should succeed');
  });

  assert.equal(calls.length, 1, 'Twilio sendSms should execute a single HTTP call');
  const request = calls[0];
  assert.ok(
    request.url.endsWith('/Accounts/AC123/Messages.json'),
    'Twilio sendSms should target the Messages endpoint'
  );
  const body = request.init?.body as string;
  const params = new URLSearchParams(body);
  assert.equal(params.get('To'), '+10000000000');
  assert.equal(params.get('From'), '+20000000000');
  assert.equal(params.get('Body'), 'Hello world');
}

async function testSendGridClient(): Promise<void> {
  const payload = {
    personalizations: [
      {
        to: [{ email: 'user@example.com' }],
        subject: 'Welcome'
      }
    ],
    from: { email: 'noreply@example.com' },
    content: [{ type: 'text/plain', value: 'Hello there' }]
  };

  const calls = await withMockedFetch(async (_url, init) => {
    assert.equal(getHeader(init, 'Authorization'), 'Bearer SG.test');
    return new Response(JSON.stringify({ message: 'accepted' }), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    });
  }, async () => {
    const client = new SendGridAPIClient({ apiKey: 'SG.test' });
    const response = await client.sendEmail(payload);
    assert.equal(response.success, true, 'SendGrid sendEmail should succeed');
  });

  assert.equal(calls.length, 1, 'SendGrid sendEmail should execute a single HTTP call');
  const request = calls[0];
  assert.ok(request.url.endsWith('/mail/send'), 'SendGrid sendEmail should target /mail/send');
  const body = request.init?.body as string;
  const parsed = JSON.parse(body);
  assert.deepEqual(parsed.personalizations[0].to[0], { email: 'user@example.com' });
  assert.equal(parsed.from.email, 'noreply@example.com');
}

async function testMailgunClient(): Promise<void> {
  const calls = await withMockedFetch(async (url, init) => {
    assert.equal(getHeader(init, 'Authorization'), `Basic ${Buffer.from('api:key-mailgun').toString('base64')}`);
    return new Response(JSON.stringify({ message: 'queued' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }, async () => {
    const client = new MailgunAPIClient({ apiKey: 'key-mailgun' });
    const response = await client.sendEmail({
      domain: 'example.com',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Greetings',
      text: 'Testing Mailgun client'
    });
    assert.equal(response.success, true, 'Mailgun sendEmail should succeed');
  });

  assert.equal(calls.length, 1, 'Mailgun sendEmail should execute a single HTTP call');
  const request = calls[0];
  assert.ok(request.url.endsWith('/v3/example.com/messages'), 'Mailgun sendEmail should hit the messages endpoint');
  const params = new URLSearchParams(request.init?.body as string);
  assert.equal(params.get('from'), 'sender@example.com');
  assert.equal(params.get('to'), 'recipient@example.com');
  assert.equal(params.get('subject'), 'Greetings');
  assert.equal(params.get('text'), 'Testing Mailgun client');
}

async function run(): Promise<void> {
  await testTwilioClient();
  await testSendGridClient();
  await testMailgunClient();
  console.log('Communications API clients basic behaviors verified');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
