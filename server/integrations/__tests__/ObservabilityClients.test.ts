import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DatadogAPIClient } from '../DatadogAPIClient.js';
import { GrafanaAPIClient } from '../GrafanaAPIClient.js';
import { PrometheusAPIClient } from '../PrometheusAPIClient.js';
import { NewrelicAPIClient } from '../NewrelicAPIClient.js';
import { SentryAPIClient } from '../SentryAPIClient.js';

const originalFetch = globalThis.fetch;

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

type FetchAssertion = (input: RequestInfo | URL, init?: RequestInit) => void;

type MockResponseOptions = {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
};

function loadFixture(name: string): any {
  const path = join(FIXTURE_DIR, name);
  const contents = readFileSync(path, 'utf-8');
  return JSON.parse(contents);
}

function headersToObject(init?: RequestInit): Record<string, string> {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function mockFetch(assertion: FetchAssertion, options: MockResponseOptions = {}): void {
  const { status = 200, headers = { 'content-type': 'application/json' }, body = {} } = options;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assertion(input, init);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(payload, { status, headers });
  }) as typeof fetch;
}

async function testDatadogClient(): Promise<void> {
  const client = new DatadogAPIClient({ apiKey: 'dd-key', appKey: 'app-key' });

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://api.datadoghq.com/api/v1/validate');
    const headers = headersToObject(init);
    assert.equal(headers['dd-api-key'], 'dd-key');
    assert.equal(headers['dd-application-key'], 'app-key');
  }, { body: loadFixture('datadog-submit.json') });
  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'Datadog test connection should succeed');

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://api.datadoghq.com/api/v1/series');
    const body = JSON.parse(String(init?.body || '{}'));
    assert.ok(Array.isArray(body.series));
    assert.equal(body.series[0].metric, 'custom.metric');
  }, { body: loadFixture('datadog-submit.json') });
  const submit = await client.submitMetrics({
    series: [
      { metric: 'custom.metric', points: [[1700000000, 5]] }
    ]
  });
  assert.equal(submit.success, true, 'Datadog metric submission should succeed');

  mockFetch((url) => {
    assert.equal(
      String(url),
      'https://api.datadoghq.com/api/v1/query?query=avg%3Asystem.cpu.user%7B*%7D&from=1700000000&to=1700000600'
    );
  }, { body: loadFixture('datadog-query.json') });
  const query = await client.queryMetrics({ query: 'avg:system.cpu.user{*}', from: 1700000000, to: 1700000600 });
  assert.equal(query.success, true, 'Datadog metric query should succeed');

  mockFetch((url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin + parsed.pathname, 'https://api.datadoghq.com/api/v1/monitor');
    const params = parsed.searchParams;
    assert.equal(params.get('name'), 'Error Rate');
    assert.equal(params.get('tags'), 'env:prod');
  }, { body: loadFixture('datadog-monitors.json') });
  const monitors = await client.getMonitors({ name: 'Error Rate', tags: ['env:prod'] });
  assert.equal(monitors.success, true, 'Datadog monitor retrieval should succeed');
}

async function testGrafanaClient(): Promise<void> {
  const client = new GrafanaAPIClient({ apiKey: 'grafana-key', serverUrl: 'https://grafana.example.com/api' });

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://grafana.example.com/api/health');
    const headers = headersToObject(init);
    assert.equal(headers['authorization'], 'Bearer grafana-key');
  }, { body: { database: 'ok' } });
  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'Grafana test connection should succeed');

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://grafana.example.com/api/dashboards/db');
    const payload = JSON.parse(String(init?.body || '{}'));
    assert.equal(payload.dashboard.title, 'Service Health');
    assert.equal(payload.overwrite, true);
  }, { body: loadFixture('grafana-dashboard.json') });
  const dashboard = await client.createDashboard({ title: 'Service Health', overwrite: true });
  assert.equal(dashboard.success, true, 'Grafana dashboard creation should succeed');

  mockFetch((url) => {
    assert.equal(String(url), 'https://grafana.example.com/api/dashboards/uid/abcd1234');
  }, { body: loadFixture('grafana-dashboard.json') });
  const fetched = await client.getDashboard({ uid: 'abcd1234' });
  assert.equal(fetched.success, true, 'Grafana dashboard retrieval should succeed');
}

async function testPrometheusClient(): Promise<void> {
  const client = new PrometheusAPIClient({ serverUrl: 'http://prom.example.com' });

  mockFetch((url) => {
    assert.equal(String(url), 'http://prom.example.com/-/ready');
  }, { body: 'OK', headers: { 'content-type': 'text/plain' } });
  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'Prometheus test connection should succeed');

  mockFetch((url) => {
    assert.equal(
      String(url),
      'http://prom.example.com/api/v1/query?query=up&time=1700000000&timeout=30s'
    );
  }, { body: loadFixture('prometheus-query.json') });
  const query = await client.queryMetrics({ query: 'up', time: '1700000000', timeout: '30s' });
  assert.equal(query.success, true, 'Prometheus instant query should succeed');

  mockFetch((url) => {
    assert.equal(
      String(url),
      'http://prom.example.com/api/v1/alerts?filter=severity%3Dwarning'
    );
  }, { body: loadFixture('prometheus-alerts.json') });
  const alerts = await client.getAlerts({ filter: 'severity=warning' });
  assert.equal(alerts.success, true, 'Prometheus alerts retrieval should succeed');
}

async function testNewRelicClient(): Promise<void> {
  const client = new NewrelicAPIClient({ apiKey: 'nr-key', accountId: 24680 });

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://api.newrelic.com/v2/applications.json');
    const headers = headersToObject(init);
    assert.equal(headers['x-api-key'], 'nr-key');
  }, { body: loadFixture('newrelic-applications.json') });
  const applications = await client.getApplications();
  assert.equal(applications.success, true, 'New Relic application listing should succeed');

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://api.newrelic.com/graphql');
    const headers = headersToObject(init);
    assert.equal(headers['x-api-key'], 'nr-key');
    const payload = JSON.parse(String(init?.body || '{}'));
    assert.ok(typeof payload.query === 'string');
    assert.ok(payload.query.includes('nrql'));
  }, { body: loadFixture('newrelic-nrql.json') });
  const nrql = await client.executeNrql({ nrql: 'SELECT count(*) FROM Transaction' });
  assert.equal(nrql.success, true, 'New Relic NRQL execution should succeed');
}

async function testSentryClient(): Promise<void> {
  const client = new SentryAPIClient({ apiKey: 'sentry-token' });

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://sentry.io/api/0/organizations/');
    const headers = headersToObject(init);
    assert.equal(headers['authorization'], 'Bearer sentry-token');
  }, { body: [{ slug: 'acme' }] });
  const ping = await client.testConnection();
  assert.equal(ping.success, true, 'Sentry test connection should succeed');

  mockFetch((url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, 'https://sentry.io');
    assert.equal(parsed.pathname, '/api/0/projects/acme/store%2Finfra/issues/');
    const params = parsed.searchParams;
    assert.equal(params.get('statsPeriod'), '14d');
    assert.equal(params.get('query'), 'is:unresolved');
  }, { body: loadFixture('sentry-issues.json') });
  const issues = await client.getIssues({
    organizationSlug: 'acme',
    projectSlug: 'store/infra',
    statsPeriod: '14d',
    query: 'is:unresolved'
  });
  assert.equal(issues.success, true, 'Sentry issues retrieval should succeed');

  mockFetch((url, init) => {
    assert.equal(String(url), 'https://sentry.io/api/0/organizations/acme/releases/');
    const payload = JSON.parse(String(init?.body || '{}'));
    assert.equal(payload.version, '1.0.0');
    assert.deepEqual(payload.projects, ['store']);
  }, { body: loadFixture('sentry-release.json') });
  const release = await client.createRelease({
    organizationSlug: 'acme',
    version: '1.0.0',
    projects: ['store']
  });
  assert.equal(release.success, true, 'Sentry release creation should succeed');
}

await testDatadogClient();
await testGrafanaClient();
await testPrometheusClient();
await testNewRelicClient();
await testSentryClient();

globalThis.fetch = originalFetch;

console.log('Observability API clients integration tests passed.');
