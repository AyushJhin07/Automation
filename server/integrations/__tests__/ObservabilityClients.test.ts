import assert from 'node:assert/strict';

import { DatadogAPIClient } from '../DatadogAPIClient.js';
import { GrafanaAPIClient } from '../GrafanaAPIClient.js';
import { PrometheusAPIClient } from '../PrometheusAPIClient.js';
import { NewrelicAPIClient } from '../NewrelicAPIClient.js';
import { SentryAPIClient } from '../SentryAPIClient.js';

interface MockResponse {
  expectedUrl?: string | RegExp;
  expectedMethod?: string;
  status?: number;
  body?: any;
  headers?: Record<string, string>;
}

interface RecordedCall {
  url: string;
  method: string;
  body?: any;
}

async function withMockedFetch(responses: MockResponse[], run: (calls: RecordedCall[]) => Promise<void> | void): Promise<void> {
  const originalFetch = globalThis.fetch;
  const calls: RecordedCall[] = [];
  let index = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url ?? String(input);
    const config = responses[index++];
    assert.ok(config, `Unexpected request to ${url}`);

    const method = (init?.method ?? 'GET').toUpperCase();
    if (config.expectedMethod) {
      assert.equal(method, config.expectedMethod, `Expected ${config.expectedMethod} for ${url}`);
    }

    if (config.expectedUrl) {
      if (typeof config.expectedUrl === 'string') {
        assert.equal(url, config.expectedUrl);
      } else {
        assert.match(url, config.expectedUrl);
      }
    }

    let parsedBody: any;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }

    calls.push({ url, method, body: parsedBody });

    const headers = config.headers ?? { 'content-type': 'application/json' };
    const responseBody = config.body ?? {};
    return new Response(JSON.stringify(responseBody), {
      status: config.status ?? 200,
      headers,
    });
  }) as typeof fetch;

  try {
    await run(calls);
    assert.equal(index, responses.length, 'All mock responses should be consumed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const fixtures = {
  datadog: {
    submit: { status: 'ok' },
    query: { series: [{ scope: 'host:app', pointlist: [[1700000000, 1.23]] }] },
    monitors: [{ id: 42, name: 'CPU high', type: 'metric alert' }],
  },
  grafana: {
    createDashboard: { uid: 'dash123', status: 'success' },
    dashboard: { dashboard: { title: 'Service Health' } },
    updateDashboard: { uid: 'dash123', status: 'success', version: 2 },
    dashboards: [{ uid: 'dash123', title: 'Service Health' }],
    alertRules: [{ uid: 'rule1', title: 'CPU High' }],
    deleteDashboard: { message: 'Dashboard dash123 deleted' },
  },
  prometheus: {
    queryRange: { status: 'success', data: { resultType: 'matrix', result: [] } },
    alerts: { data: { alerts: [{ labels: { alertname: 'DiskFull' }, state: 'firing' }] } },
  },
  newrelic: {
    metrics: { metric_data: { metrics: [{ name: 'HttpDispatcher' }] } },
    nrql: { data: { actor: { account: { nrql: { results: [{ average: 123.4 }] } } } } },
    violations: { violations: [{ id: 7, label: 'Apdex below threshold' }] },
  },
  sentry: {
    issues: [{ id: '123', title: 'Unhandled exception', culprit: 'GET /' }],
    events: [{ eventID: 'abc123', message: 'Stacktrace' }],
  },
};

await withMockedFetch([
  // Datadog
  {
    expectedUrl: 'https://api.datadoghq.com/api/v1/series',
    expectedMethod: 'POST',
    body: fixtures.datadog.submit,
  },
  {
    expectedUrl: /https:\/\/api\.datadoghq\.com\/api\/v1\/query\?(?=.*from=1700000000)(?=.*to=1700003600)(?=.*query=avg%3Asystem\.cpu\.user%7B\*%7D).*/,
    expectedMethod: 'GET',
    body: fixtures.datadog.query,
  },
  {
    expectedUrl: /https:\/\/api\.datadoghq\.com\/api\/v1\/monitor\?group_states=Alert&with_downtimes=true/,
    expectedMethod: 'GET',
    body: fixtures.datadog.monitors,
  },
  // Grafana
  {
    expectedUrl: 'https://grafana.example.com/api/dashboards/db',
    expectedMethod: 'POST',
    body: fixtures.grafana.createDashboard,
  },
  {
    expectedUrl: 'https://grafana.example.com/api/dashboards/uid/dash123',
    expectedMethod: 'GET',
    body: fixtures.grafana.dashboard,
  },
  {
    expectedUrl: 'https://grafana.example.com/api/dashboards/db',
    expectedMethod: 'POST',
    body: fixtures.grafana.updateDashboard,
  },
  {
    expectedUrl: 'https://grafana.example.com/api/search?query=Service&type=dash-db',
    expectedMethod: 'GET',
    body: fixtures.grafana.dashboards,
  },
  {
    expectedUrl: 'https://grafana.example.com/api/alert-rules?folderUID=prod',
    expectedMethod: 'GET',
    body: fixtures.grafana.alertRules,
  },
  {
    expectedUrl: 'https://grafana.example.com/api/dashboards/uid/dash123',
    expectedMethod: 'DELETE',
    body: fixtures.grafana.deleteDashboard,
  },
  // Prometheus
  {
    expectedUrl: /http:\/\/prometheus\.example\.com\/api\/v1\/query_range\?query=up&start=2024-06-01T00%3A00%3A00Z&end=2024-06-01T01%3A00%3A00Z&step=60s/,
    expectedMethod: 'GET',
    body: fixtures.prometheus.queryRange,
  },
  {
    expectedUrl: 'http://prometheus.example.com/api/v1/alerts',
    expectedMethod: 'GET',
    body: fixtures.prometheus.alerts,
  },
  // New Relic
  {
    expectedUrl: /https:\/\/api\.newrelic\.com\/v2\/applications\/123\/metrics\/data\.json\?names%5B%5D=HttpDispatcher&values%5B%5D=average_response_time/,
    expectedMethod: 'GET',
    body: fixtures.newrelic.metrics,
  },
  {
    expectedUrl: 'https://api.newrelic.com/graphql',
    expectedMethod: 'POST',
    body: fixtures.newrelic.nrql,
  },
  {
    expectedUrl: /https:\/\/api\.newrelic\.com\/v2\/alerts_violations\.json\?filter%5Bonly_open%5D=true/,
    expectedMethod: 'GET',
    body: fixtures.newrelic.violations,
  },
  // Sentry
  {
    expectedUrl: /https:\/\/sentry\.example\.com\/api\/0\/projects\/test-org\/frontend\/issues\/\?statsPeriod=14d/,
    expectedMethod: 'GET',
    body: fixtures.sentry.issues,
  },
  {
    expectedUrl: /https:\/\/sentry\.example\.com\/api\/0\/issues\/abc123\/events\/\?full=1/,
    expectedMethod: 'GET',
    body: fixtures.sentry.events,
  },
], async calls => {
  const datadog = new DatadogAPIClient({ apiKey: 'dd', appKey: 'app' });
  const datadogSubmit = await datadog.submitMetrics({
    series: [{ metric: 'custom.metric', points: [[1700000000, 1]] }],
  });
  assert.equal(datadogSubmit.success, true);
  assert.deepEqual(datadogSubmit.data, fixtures.datadog.submit);

  const datadogQuery = await datadog.queryMetrics({ query: 'avg:system.cpu.user{*}', from: 1700000000, to: 1700003600 });
  assert.equal(datadogQuery.success, true);
  assert.deepEqual(datadogQuery.data, fixtures.datadog.query);

  const datadogMonitors = await datadog.getMonitors({ group_states: ['Alert'], with_downtimes: true });
  assert.equal(datadogMonitors.success, true);
  assert.deepEqual(datadogMonitors.data, fixtures.datadog.monitors);

  const grafana = new GrafanaAPIClient({ apiKey: 'grafana', serverUrl: 'https://grafana.example.com' });
  const createdDashboard = await grafana.createDashboard({ title: 'Service Health', tags: ['ops'] });
  assert.equal(createdDashboard.success, true);
  assert.deepEqual(createdDashboard.data, fixtures.grafana.createDashboard);

  const fetchedDashboard = await grafana.getDashboard({ uid: 'dash123' });
  assert.equal(fetchedDashboard.success, true);
  assert.deepEqual(fetchedDashboard.data, fixtures.grafana.dashboard);

  const updatedDashboard = await grafana.updateDashboard({
    uid: 'dash123',
    dashboard: { uid: 'dash123', title: 'Service Health', panels: [] },
  });
  assert.equal(updatedDashboard.success, true);
  assert.deepEqual(updatedDashboard.data, fixtures.grafana.updateDashboard);

  const dashboards = await grafana.listDashboards({ query: 'Service' });
  assert.equal(dashboards.success, true);
  assert.deepEqual(dashboards.data, fixtures.grafana.dashboards);

  const alertRules = await grafana.listAlertRules({ folder_uid: 'prod' });
  assert.equal(alertRules.success, true);
  assert.deepEqual(alertRules.data, fixtures.grafana.alertRules);

  const deletedDashboard = await grafana.deleteDashboard({ uid: 'dash123' });
  assert.equal(deletedDashboard.success, true);
  assert.deepEqual(deletedDashboard.data, fixtures.grafana.deleteDashboard);

  const prometheus = new PrometheusAPIClient({ serverUrl: 'http://prometheus.example.com', username: 'user', password: 'pass' });
  const range = await prometheus.queryRange({ query: 'up', start: '2024-06-01T00:00:00Z', end: '2024-06-01T01:00:00Z', step: '60s' });
  assert.equal(range.success, true);
  assert.deepEqual(range.data, fixtures.prometheus.queryRange);

  const alerts = await prometheus.getAlerts();
  assert.equal(alerts.success, true);
  assert.deepEqual(alerts.data, fixtures.prometheus.alerts);

  const newrelic = new NewrelicAPIClient({ apiKey: 'newrelic', accountId: 123 });
  const metricData = await newrelic.getApplicationMetrics({ application_id: 123, names: ['HttpDispatcher'], values: ['average_response_time'] });
  assert.equal(metricData.success, true);
  assert.deepEqual(metricData.data, fixtures.newrelic.metrics);

  const nrql = await newrelic.executeNrql({ nrql: 'SELECT average(duration) FROM Transaction' });
  assert.equal(nrql.success, true);
  assert.deepEqual(nrql.data, fixtures.newrelic.nrql);

  const violations = await newrelic.getViolations({ filter: { only_open: true } });
  assert.equal(violations.success, true);
  assert.deepEqual(violations.data, fixtures.newrelic.violations);

  const sentry = new SentryAPIClient({ accessToken: 'token', baseUrl: 'https://sentry.example.com/api/0' });
  const issues = await sentry.getIssues({ organizationSlug: 'test-org', projectSlug: 'frontend', statsPeriod: '14d' });
  assert.equal(issues.success, true);
  assert.deepEqual(issues.data, fixtures.sentry.issues);

  const events = await sentry.getEvents({ issueId: 'abc123', full: true });
  assert.equal(events.success, true);
  assert.deepEqual(events.data, fixtures.sentry.events);

  // Inspect recorded calls for payload correctness
  const datadogSeriesCall = calls.find(call => call.url.endsWith('/series'));
  assert.ok(datadogSeriesCall, 'Datadog series call should be recorded');
  assert.deepEqual(datadogSeriesCall?.body, { series: [{ metric: 'custom.metric', points: [[1700000000, 1]] }] });

  const grafanaCreateCall = calls.find(call => call.url.endsWith('/dashboards/db') && call.body?.overwrite === false);
  assert.ok(grafanaCreateCall);
  assert.equal(grafanaCreateCall?.body.dashboard.title, 'Service Health');

  const grafanaUpdateCall = calls.find(call => call.url.endsWith('/dashboards/db') && call.body?.overwrite === true);
  assert.ok(grafanaUpdateCall);
  assert.equal(grafanaUpdateCall?.body.dashboard.uid, 'dash123');

  const grafanaListCall = calls.find(call => call.url.includes('/api/search'));
  assert.ok(grafanaListCall);
  assert.equal(grafanaListCall?.method, 'GET');

  const grafanaDeleteCall = calls.find(call => call.url.endsWith('/dashboards/uid/dash123') && call.method === 'DELETE');
  assert.ok(grafanaDeleteCall);

  const nrqlCall = calls.find(call => call.url.endsWith('/graphql'));
  assert.ok(nrqlCall);
  assert.match(String(nrqlCall?.body?.query ?? ''), /Transaction/);

  const sentryIssuesCall = calls.find(call => call.url.includes('/projects/test-org/frontend/issues'));
  assert.ok(sentryIssuesCall);
  const issuesUrl = new URL(sentryIssuesCall!.url);
  assert.equal(issuesUrl.searchParams.get('statsPeriod'), '14d');
});

console.log('Observability API clients exercised successfully.');
