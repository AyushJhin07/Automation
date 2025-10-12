/**
 * Shared template generators for Apps Script operation builders.
 *
 * These helpers centralize the generic scaffolding that REAL_OPS uses so the
 * generator can pick an appropriate template based on connector metadata.
 */

export interface BaseTemplateMetadata {
  key: string;
  functionName: string;
  connectorId: string;
  operationId: string;
}

export interface HttpTemplateMetadata extends BaseTemplateMetadata {
  baseUrl?: string | null;
  endpoint?: string | null;
  method: string;
  authType?: string | null;
  paginationParam?: string | null;
  hasPagination?: boolean;
}

export interface RestPostTemplateMetadata extends HttpTemplateMetadata {}

export interface RetryableFetchTemplateMetadata extends HttpTemplateMetadata {}

export interface PollingTriggerTemplateMetadata extends HttpTemplateMetadata {
  cursorProperty?: string | null;
}

export interface WebhookReplyTemplateMetadata extends BaseTemplateMetadata {}

export interface TodoTemplateMetadata extends BaseTemplateMetadata {
  backlogTag: string;
}

/**
 * Escape a string for safe inclusion inside single-quoted template literals.
 */
function escapeForSingleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function toSecretKey(connectorId: string, suffix: string): string {
  const normalized = connectorId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${normalized}_${suffix}`;
}

function buildRequestUrlHelper(): string {
  return `  function buildRequestUrl(baseUrl, endpoint, query) {
    var root = baseUrl ? String(baseUrl).replace(/\\/+$/, '') : '';
    var path = endpoint ? String(endpoint) : '';
    var url;
    if (/^https?:/i.test(path)) {
      url = path;
    } else if (root) {
      var normalizedPath = path && path.charAt(0) !== '/' ? '/' + path : path;
      url = root + normalizedPath;
    } else {
      url = path;
    }
    var parts = [];
    if (query && typeof query === 'object') {
      for (var name in query) {
        if (!Object.prototype.hasOwnProperty.call(query, name)) continue;
        var raw = query[name];
        if (raw === undefined || raw === null || raw === '') continue;
        if (Array.isArray(raw)) {
          raw.forEach(function (entry) {
            if (entry === undefined || entry === null || entry === '') return;
            parts.push(encodeURIComponent(name) + '=' + encodeURIComponent(entry));
          });
        } else {
          parts.push(encodeURIComponent(name) + '=' + encodeURIComponent(raw));
        }
      }
    }
    if (parts.length > 0) {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&');
    }
    return url;
  }`;
}

function buildAuthSnippet(
  metadata: HttpTemplateMetadata,
  { indent, missingSecretReturn }: { indent: string; missingSecretReturn: string }
): string {
  const { authType, connectorId, key } = metadata;
  if (!authType) {
    return '';
  }

  const connector = escapeForSingleQuotes(connectorId);
  const keyLiteral = escapeForSingleQuotes(key);

  if (authType === 'oauth2') {
    const accessTokenKey = toSecretKey(connectorId, 'ACCESS_TOKEN');
    return [
      `${indent}var accessToken = getSecret('${escapeForSingleQuotes(accessTokenKey)}', { connector: '${connector}' });`,
      `${indent}if (!accessToken) {`,
      `${indent}  logWarn('missing_oauth_token', { connector: '${connector}', operation: '${keyLiteral}' });`,
      `${indent}  ${missingSecretReturn}`,
      `${indent}}`,
      `${indent}headers['Authorization'] = 'Bearer ' + accessToken;`,
    ].join('\n');
  }

  if (authType === 'apiKey') {
    const apiKey = toSecretKey(connectorId, 'API_KEY');
    return [
      `${indent}var apiKey = getSecret('${escapeForSingleQuotes(apiKey)}', { connector: '${connector}' });`,
      `${indent}if (!apiKey) {`,
      `${indent}  logWarn('missing_api_key', { connector: '${connector}', operation: '${keyLiteral}' });`,
      `${indent}  ${missingSecretReturn}`,
      `${indent}}`,
      `${indent}if (!headers['Authorization']) {`,
      `${indent}  headers['Authorization'] = 'Bearer ' + apiKey;`,
      `${indent}}`,
      `${indent}headers['X-API-Key'] = apiKey;`,
    ].join('\n');
  }

  if (authType === 'basic') {
    const usernameKey = toSecretKey(connectorId, 'USERNAME');
    const passwordKey = toSecretKey(connectorId, 'PASSWORD');
    return [
      `${indent}var username = getSecret('${escapeForSingleQuotes(usernameKey)}', { connector: '${connector}' });`,
      `${indent}var password = getSecret('${escapeForSingleQuotes(passwordKey)}', { connector: '${connector}' });`,
      `${indent}if (!username || !password) {`,
      `${indent}  logWarn('missing_basic_auth', { connector: '${connector}', operation: '${keyLiteral}' });`,
      `${indent}  ${missingSecretReturn}`,
      `${indent}}`,
      `${indent}var encoded = Utilities.base64Encode(username + ':' + password);`,
      `${indent}headers['Authorization'] = 'Basic ' + encoded;`,
    ].join('\n');
  }

  return '';
}

function deriveResultProperty(metadata: BaseTemplateMetadata): string {
  const base = `${metadata.connectorId}_${metadata.operationId}_result`
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return base || 'result';
}

export function restPostActionTemplate(metadata: RestPostTemplateMetadata): string {
  const baseUrl = escapeForSingleQuotes(metadata.baseUrl ?? '');
  const endpoint = escapeForSingleQuotes(metadata.endpoint ?? '');
  const resultProperty = deriveResultProperty(metadata);
  const authSnippet = buildAuthSnippet(metadata, { indent: '  ', missingSecretReturn: 'return ctx;' });

  return `function ${metadata.functionName}(ctx) {
  var request = ctx && ctx.request ? ctx.request : {};
  var body = request.body || request.payload || ctx.payload || {};
  var query = request.query || {};
  var headers = request.headers ? Object.assign({}, request.headers) : {};
${authSnippet ? `${authSnippet}\n` : ''}
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';

  var url = buildRequestUrl('${baseUrl}', '${endpoint}', query);
  var payload = typeof body === 'string' ? body : JSON.stringify(body);
  var response = withRetries(function () {
    return fetchJson(url, {
      method: '${escapeForSingleQuotes(metadata.method)}',
      headers: headers,
      payload: payload,
      contentType: headers['Content-Type']
    });
  });

  ctx['${escapeForSingleQuotes(resultProperty)}'] = response.body !== undefined ? response.body : response;
  logInfo('rest_post_success', { operation: '${escapeForSingleQuotes(metadata.key)}', status: response.status || null });
  return ctx;
${buildRequestUrlHelper()}
}`;
}

export function retryableFetchActionTemplate(metadata: RetryableFetchTemplateMetadata): string {
  const baseUrl = escapeForSingleQuotes(metadata.baseUrl ?? '');
  const endpoint = escapeForSingleQuotes(metadata.endpoint ?? '');
  const resultProperty = deriveResultProperty(metadata);
  const paginationParam = escapeForSingleQuotes(metadata.paginationParam ?? '');
  const authSnippet = buildAuthSnippet(metadata, { indent: '  ', missingSecretReturn: 'return ctx;' });

  const paginationGuard = metadata.hasPagination
    ? `
  var nextToken = (ctx && ctx.state && ctx.state.pageToken) || null;
  var attempts = 0;
  var aggregated = [];
  while (attempts < 25) {
    var queryForPage = Object.assign({}, query);
    if (nextToken && '${paginationParam}' !== '') {
      queryForPage['${paginationParam}'] = nextToken;
    }
    var pageUrl = buildRequestUrl('${baseUrl}', '${endpoint}', queryForPage);
    var pageResponse = withRetries(function () {
      return fetchJson(pageUrl, { method: '${escapeForSingleQuotes(metadata.method)}', headers: headers });
    });
    var pageBody = pageResponse.body || {};
    var items = [];
    if (Array.isArray(pageBody.items)) {
      items = pageBody.items;
    } else if (Array.isArray(pageBody.data)) {
      items = pageBody.data;
    } else if (Array.isArray(pageBody.results)) {
      items = pageBody.results;
    }
    if (items.length > 0) {
      aggregated = aggregated.concat(items);
    }
    nextToken = pageBody.nextToken || pageBody.next_page_token || pageBody.nextCursor || (pageBody.pagination && (pageBody.pagination.next || pageBody.pagination.nextCursor)) || null;
    attempts++;
    if (!nextToken) {
      ctx['${escapeForSingleQuotes(resultProperty)}'] = aggregated.length > 0 ? aggregated : pageBody;
      break;
    }
  }
  if (!ctx['${escapeForSingleQuotes(resultProperty)}']) {
    ctx['${escapeForSingleQuotes(resultProperty)}'] = aggregated;
  }
`
    : `
  var url = buildRequestUrl('${baseUrl}', '${endpoint}', query);
  var response = withRetries(function () {
    return fetchJson(url, { method: '${escapeForSingleQuotes(metadata.method)}', headers: headers });
  });
  ctx['${escapeForSingleQuotes(resultProperty)}'] = response.body !== undefined ? response.body : response;
`;

  return `function ${metadata.functionName}(ctx) {
  var request = ctx && ctx.request ? ctx.request : {};
  var query = request.query || {};
  var headers = request.headers ? Object.assign({}, request.headers) : {};
${authSnippet ? `${authSnippet}\n` : ''}
  logInfo('retryable_fetch_start', { operation: '${escapeForSingleQuotes(metadata.key)}' });
${paginationGuard}
  logInfo('retryable_fetch_complete', { operation: '${escapeForSingleQuotes(metadata.key)}' });
  return ctx;
${buildRequestUrlHelper()}
}`;
}

export function pollingTriggerTemplate(metadata: PollingTriggerTemplateMetadata): string {
  const baseUrl = escapeForSingleQuotes(metadata.baseUrl ?? '');
  const endpoint = escapeForSingleQuotes(metadata.endpoint ?? '');
  const cursorKey = escapeForSingleQuotes(metadata.cursorProperty ?? `${metadata.connectorId}_${metadata.operationId}_cursor`);
  const paginationParam = escapeForSingleQuotes(metadata.paginationParam ?? 'cursor');
  const authSnippet = buildAuthSnippet(metadata, { indent: '    ', missingSecretReturn: 'throw new Error("missing credentials")' });

  return `function ${metadata.functionName}() {
  return buildPollingWrapper('${escapeForSingleQuotes(metadata.key)}', function (runtime) {
    var scriptProps = PropertiesService.getScriptProperties();
    var cursor = scriptProps.getProperty('${cursorKey}') || null;
    var headers = {};
${authSnippet ? `${authSnippet}\n` : ''}
    var query = {};
    if (cursor) {
      query['${paginationParam}'] = cursor;
    }
    var url = buildRequestUrl('${baseUrl}', '${endpoint}', query);
    var response = withRetries(function () {
      return fetchJson(url, { method: '${escapeForSingleQuotes(metadata.method)}', headers: headers });
    });
    var body = response.body || {};
    var events = Array.isArray(body.items) ? body.items : Array.isArray(body.data) ? body.data : [];
    if (Array.isArray(events) && events.length > 0) {
      events.forEach(function (event) {
        runtime.dispatch(event);
      });
    }
    var nextCursor = body.nextCursor || body.next_page_token || (body.pagination && (body.pagination.next || body.pagination.nextCursor)) || null;
    if (nextCursor) {
      scriptProps.setProperty('${cursorKey}', nextCursor);
    }
    runtime.summary({ dispatched: Array.isArray(events) ? events.length : 0, nextCursor: nextCursor || null });
  });
${buildRequestUrlHelper()}
}`;
}

export function webhookReplyTemplate(metadata: WebhookReplyTemplateMetadata): string {
  return `function ${metadata.functionName}(e) {
  var rawBody = e && e.postData && typeof e.postData.getDataAsString === 'function' ? e.postData.getDataAsString() : null;
  var parsed;
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody);
    } catch (error) {
      logWarn('webhook_parse_failed', { operation: '${escapeForSingleQuotes(metadata.key)}', message: error && error.message ? error.message : String(error) });
    }
  }

  logInfo('webhook_received', { operation: '${escapeForSingleQuotes(metadata.key)}' });
  if (parsed) {
    try {
      main(parsed);
    } catch (error) {
      logError('webhook_dispatch_failed', { operation: '${escapeForSingleQuotes(metadata.key)}', message: error && error.message ? error.message : String(error) });
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}`;
}

export function todoTemplate(metadata: TodoTemplateMetadata): string {
  return `function ${metadata.functionName}(ctx) {
  // TODO(${escapeForSingleQuotes(metadata.backlogTag)}): Implement ${escapeForSingleQuotes(metadata.key)} Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: '${escapeForSingleQuotes(metadata.connectorId)}', operation: '${escapeForSingleQuotes(metadata.key)}' });
  throw new Error('TODO[apps-script-backlog]: Implement ${escapeForSingleQuotes(metadata.key)}. See docs/apps-script-rollout/backlog.md.');
}`;
}
