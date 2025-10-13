import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scopesLiteral = "['https://www.googleapis.com/auth/chat.messages', 'https://www.googleapis.com/auth/chat.spaces']";

function googleChatHelpersBlock() {
  return `
if (typeof googleChatInterpolateConfig !== 'function') {
  var GOOGLE_CHAT_BASE_URL = 'https://chat.googleapis.com/v1';

  function googleChatOptionalSecret(name) {
    try {
      return getSecret(name, { connectorKey: 'google-chat' });
    } catch (error) {
      return '';
    }
  }

  function googleChatInterpolateConfig(config, ctx) {
    return googleChatInterpolateValue(config, ctx);
  }

  function googleChatInterpolateValue(value, ctx) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (!trimmed) {
        return '';
      }
      return interpolate(trimmed, ctx);
    }
    if (Array.isArray(value)) {
      var result = [];
      for (var i = 0; i < value.length; i++) {
        result.push(googleChatInterpolateValue(value[i], ctx));
      }
      return result;
    }
    if (typeof value === 'object') {
      var obj = {};
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        obj[key] = googleChatInterpolateValue(value[key], ctx);
      }
      return obj;
    }
    return value;
  }

  function googleChatPickFirst(source, keys) {
    if (!source || typeof source !== 'object') {
      return undefined;
    }
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null) {
        return source[key];
      }
    }
    return undefined;
  }

  function googleChatTrim(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  function googleChatNormalizeResourceName(value) {
    var trimmed = googleChatTrim(value);
    if (!trimmed) {
      return '';
    }
    return trimmed.replace(/^\/+/, '');
  }

  function googleChatExtractSpaceName(space) {
    if (!space) {
      return '';
    }
    if (typeof space === 'string') {
      return googleChatNormalizeResourceName(space);
    }
    if (space.name) {
      return googleChatNormalizeResourceName(space.name);
    }
    return '';
  }

  function googleChatToPositiveInteger(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    var numeric = Number(value);
    if (!isFinite(numeric) || numeric <= 0) {
      return null;
    }
    return Math.floor(numeric);
  }

  function googleChatNormalizeBoolean(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      var normalized = value.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
        return false;
      }
    }
    return !!value;
  }

  function googleChatBuildUrl(path, query) {
    var normalizedPath = googleChatTrim(path);
    if (normalizedPath && normalizedPath.charAt(0) !== '/') {
      normalizedPath = '/' + normalizedPath;
    }
    var url = GOOGLE_CHAT_BASE_URL + normalizedPath;
    if (query && typeof query === 'object') {
      var parts = [];
      for (var key in query) {
        if (!Object.prototype.hasOwnProperty.call(query, key)) {
          continue;
        }
        var raw = query[key];
        if (raw === undefined || raw === null || raw === '') {
          continue;
        }
        if (Array.isArray(raw)) {
          for (var i = 0; i < raw.length; i++) {
            var entry = raw[i];
            if (entry === undefined || entry === null || entry === '') {
              continue;
            }
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(entry));
          }
        } else {
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(raw));
        }
      }
      if (parts.length) {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&');
      }
    }
    return url;
  }

  function googleChatRequest(method, path, accessToken, options) {
    var query = options && options.query ? options.query : null;
    var hasBody = options && Object.prototype.hasOwnProperty.call(options, 'body');
    var body = hasBody ? options.body : undefined;
    var headers = { Authorization: 'Bearer ' + accessToken };
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    var url = googleChatBuildUrl(path, query);
    return withRetries(function () {
      return fetchJson(url, {
        method: method,
        headers: headers,
        payload: hasBody ? JSON.stringify(body) : undefined,
        contentType: hasBody ? 'application/json' : undefined
      });
    }, { attempts: 4, backoffMs: 500, jitter: 0.2 });
  }

  function googleChatResolveSpace(resolved, options) {
    options = options || {};
    var keys = Array.isArray(options.keys) && options.keys.length ? options.keys : ['space', 'spaceId', 'space_id', 'spaceName', 'space_name', 'parent'];
    var fallbackSecret = Object.prototype.hasOwnProperty.call(options, 'fallbackSecret') ? options.fallbackSecret : 'GOOGLE_CHAT_DEFAULT_SPACE';
    var operation = options.operation || 'operation';
    var required = options.required !== false;
    var raw = googleChatPickFirst(resolved, keys);
    var normalized = googleChatTrim(raw);
    if (!normalized && fallbackSecret) {
      normalized = googleChatTrim(googleChatOptionalSecret(fallbackSecret));
    }
    if (!normalized) {
      if (!required) {
        return '';
      }
      var propertyName = fallbackSecret || 'GOOGLE_CHAT_DEFAULT_SPACE';
      throw new Error('Google Chat ' + operation + ' requires a space. Provide one in the node configuration or configure ' + propertyName + ' in Script Properties.');
    }
    return googleChatNormalizeResourceName(normalized);
  }

  function googleChatResolveName(resolved, operation) {
    var raw = googleChatPickFirst(resolved, ['name', 'message', 'messageName', 'message_name']);
    var normalized = googleChatTrim(raw);
    if (!normalized) {
      throw new Error('Google Chat ' + operation + ' requires a message name (spaces/AAA/messages/BBB).');
    }
    return googleChatNormalizeResourceName(normalized);
  }

  function googleChatEnsureObject(value) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    var keys = Object.keys(value);
    if (!keys.length) {
      return null;
    }
    return value;
  }
}
`;
}

function encodeConfig(config) {
  return JSON.stringify(config ?? {});
}

function buildGoogleChatAction(operation, config) {
  const configLiteral = encodeConfig(config);
  const functionName = `step_action_google_chat_${operation}`;
  switch (operation) {
    case 'test_connection':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  try {
    const response = googleChatRequest('GET', '/spaces', accessToken, { query: { pageSize: 1 } });
    const body = response && response.body ? response.body : {};
    const spaces = Array.isArray(body.spaces) ? body.spaces : [];

    ctx.googleChatConnectionTested = true;
    ctx.googleChatSpacesChecked = spaces.length;
    ctx.googleChatSpaces = spaces;

    logInfo('google_chat_test_connection_success', {
      status: response && response.status ? response.status : null,
      spaces: spaces.length
    });

    return ctx;
  } catch (error) {
    logError('google_chat_test_connection_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'send_message':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const space = googleChatResolveSpace(resolved, { operation: 'send_message' });
  const text = googleChatTrim(googleChatPickFirst(resolved, ['text', 'message', 'content']));
  if (!text) {
    throw new Error('Google Chat send_message requires text. Provide text in the node configuration or map it from a previous step.');
  }

  const payload = { text: text };
  const thread = googleChatEnsureObject(googleChatPickFirst(resolved, ['thread']));
  if (thread) {
    payload.thread = thread;
  }
  const cards = googleChatPickFirst(resolved, ['cards']);
  if (Array.isArray(cards) && cards.length) {
    payload.cards = cards;
  }
  const cardsV2 = googleChatPickFirst(resolved, ['cardsV2', 'cards_v2']);
  if (Array.isArray(cardsV2) && cardsV2.length) {
    payload.cardsV2 = cardsV2;
  }
  const actionResponse = googleChatEnsureObject(googleChatPickFirst(resolved, ['actionResponse', 'action_response']));
  if (actionResponse) {
    payload.actionResponse = actionResponse;
  }

  try {
    const response = googleChatRequest('POST', '/' + space + '/messages', accessToken, { body: payload });
    const message = response && response.body ? response.body : {};

    ctx.googleChatSpace = space;
    ctx.googleChatMessage = message;
    ctx.googleChatMessageId = message && message.name ? message.name : null;

    logInfo('google_chat_send_message_success', {
      space: space,
      messageId: message && message.name ? message.name : null
    });

    return ctx;
  } catch (error) {
    logError('google_chat_send_message_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'create_space':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const displayName = googleChatTrim(googleChatPickFirst(resolved, ['displayName', 'name']));
  if (!displayName) {
    throw new Error('Google Chat create_space requires a displayName.');
  }

  const payload = { displayName: displayName };
  const spaceType = googleChatTrim(googleChatPickFirst(resolved, ['spaceType', 'space_type']));
  if (spaceType) {
    payload.spaceType = spaceType;
  }
  const threaded = googleChatNormalizeBoolean(googleChatPickFirst(resolved, ['threaded', 'spaceThreaded', 'space_threaded']));
  if (threaded !== null) {
    payload.spaceThreadingState = threaded ? 'THREADED_MESSAGES' : 'UNTHREADED_MESSAGES';
  }
  const externalAllowed = googleChatNormalizeBoolean(googleChatPickFirst(resolved, ['externalUserAllowed', 'allowExternalUsers', 'external_user_allowed']));
  if (externalAllowed !== null) {
    payload.externalUserAllowed = externalAllowed;
  }
  const historyState = googleChatTrim(googleChatPickFirst(resolved, ['spaceHistoryState', 'historyState', 'space_history_state']));
  if (historyState) {
    payload.spaceHistoryState = historyState;
  }

  try {
    const response = googleChatRequest('POST', '/spaces', accessToken, { body: payload });
    const space = response && response.body ? response.body : {};

    ctx.googleChatSpaceCreated = true;
    ctx.googleChatSpace = space;
    ctx.googleChatSpaceName = space && space.name ? space.name : null;

    logInfo('google_chat_create_space_success', {
      spaceName: space && space.name ? space.name : null
    });

    return ctx;
  } catch (error) {
    logError('google_chat_create_space_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'list_spaces':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const pageSize = googleChatToPositiveInteger(googleChatPickFirst(resolved, ['pageSize', 'page_size']));
  const pageToken = googleChatTrim(googleChatPickFirst(resolved, ['pageToken', 'page_token']));
  const filter = googleChatTrim(googleChatPickFirst(resolved, ['filter']));
  const query = {};
  if (pageSize) {
    query.pageSize = pageSize;
  }
  if (pageToken) {
    query.pageToken = pageToken;
  }
  if (filter) {
    query.filter = filter;
  }

  try {
    const response = googleChatRequest('GET', '/spaces', accessToken, { query: query });
    const body = response && response.body ? response.body : {};
    const spaces = Array.isArray(body.spaces) ? body.spaces : [];

    ctx.googleChatSpaces = spaces;
    ctx.googleChatNextPageToken = body && (body.nextPageToken || body.next_page_token) ? (body.nextPageToken || body.next_page_token) : null;

    logInfo('google_chat_list_spaces_success', {
      count: spaces.length,
      nextPageToken: ctx.googleChatNextPageToken
    });

    return ctx;
  } catch (error) {
    logError('google_chat_list_spaces_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'get_space':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const spaceName = googleChatResolveSpace(resolved, { operation: 'get_space', keys: ['name', 'space', 'spaceName', 'space_name'] });

  try {
    const response = googleChatRequest('GET', '/' + spaceName, accessToken, {});
    const space = response && response.body ? response.body : {};

    ctx.googleChatSpace = space;
    ctx.googleChatSpaceName = spaceName;

    logInfo('google_chat_get_space_success', {
      spaceName: spaceName
    });

    return ctx;
  } catch (error) {
    logError('google_chat_get_space_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'list_members':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const space = googleChatResolveSpace(resolved, { operation: 'list_members' });
  const pageSize = googleChatToPositiveInteger(googleChatPickFirst(resolved, ['pageSize', 'page_size']));
  const pageToken = googleChatTrim(googleChatPickFirst(resolved, ['pageToken', 'page_token']));
  const filter = googleChatTrim(googleChatPickFirst(resolved, ['filter']));
  const showGroups = googleChatNormalizeBoolean(googleChatPickFirst(resolved, ['showGroups', 'show_groups']));
  const query = {};
  if (pageSize) {
    query.pageSize = pageSize;
  }
  if (pageToken) {
    query.pageToken = pageToken;
  }
  if (filter) {
    query.filter = filter;
  }
  if (showGroups !== null) {
    query.showGroups = showGroups;
  }

  try {
    const response = googleChatRequest('GET', '/' + space + '/members', accessToken, { query: query });
    const body = response && response.body ? response.body : {};
    const memberships = Array.isArray(body.memberships) ? body.memberships : (Array.isArray(body.members) ? body.members : []);

    ctx.googleChatSpace = space;
    ctx.googleChatMembers = memberships;
    ctx.googleChatMemberCount = memberships.length;
    ctx.googleChatNextPageToken = body && (body.nextPageToken || body.next_page_token) ? (body.nextPageToken || body.next_page_token) : null;

    logInfo('google_chat_list_members_success', {
      space: space,
      count: memberships.length,
      nextPageToken: ctx.googleChatNextPageToken
    });

    return ctx;
  } catch (error) {
    logError('google_chat_list_members_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'create_membership':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const space = googleChatResolveSpace(resolved, { operation: 'create_membership' });
  const member = googleChatEnsureObject(googleChatPickFirst(resolved, ['member']));
  if (!member) {
    throw new Error('Google Chat create_membership requires member details.');
  }
  const role = googleChatTrim(googleChatPickFirst(resolved, ['role']));
  const payload = { member: member };
  if (role) {
    payload.role = role;
  }

  try {
    const response = googleChatRequest('POST', '/' + space + '/members', accessToken, { body: payload });
    const membership = response && response.body ? response.body : {};

    ctx.googleChatSpace = space;
    ctx.googleChatMembership = membership;
    ctx.googleChatMemberName = membership && membership.name ? membership.name : null;

    logInfo('google_chat_create_membership_success', {
      space: space,
      member: membership && membership.name ? membership.name : null
    });

    return ctx;
  } catch (error) {
    logError('google_chat_create_membership_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'list_messages':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const space = googleChatResolveSpace(resolved, { operation: 'list_messages', keys: ['parent', 'space', 'spaceId', 'spaceName', 'space_name'] });
  const pageSize = googleChatToPositiveInteger(googleChatPickFirst(resolved, ['pageSize', 'page_size']));
  const pageToken = googleChatTrim(googleChatPickFirst(resolved, ['pageToken', 'page_token']));
  const filter = googleChatTrim(googleChatPickFirst(resolved, ['filter']));
  const orderBy = googleChatTrim(googleChatPickFirst(resolved, ['orderBy', 'order_by']));
  const query = {};
  if (pageSize) {
    query.pageSize = pageSize;
  }
  if (pageToken) {
    query.pageToken = pageToken;
  }
  if (filter) {
    query.filter = filter;
  }
  if (orderBy) {
    query.orderBy = orderBy;
  }

  try {
    const response = googleChatRequest('GET', '/' + space + '/messages', accessToken, { query: query });
    const body = response && response.body ? response.body : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];

    ctx.googleChatSpace = space;
    ctx.googleChatMessages = messages;
    ctx.googleChatMessageCount = messages.length;
    ctx.googleChatNextPageToken = body && (body.nextPageToken || body.next_page_token) ? (body.nextPageToken || body.next_page_token) : null;

    logInfo('google_chat_list_messages_success', {
      space: space,
      count: messages.length,
      nextPageToken: ctx.googleChatNextPageToken
    });

    return ctx;
  } catch (error) {
    logError('google_chat_list_messages_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'get_message':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const messageName = googleChatResolveName(resolved, 'get_message');

  try {
    const response = googleChatRequest('GET', '/' + messageName, accessToken, {});
    const message = response && response.body ? response.body : {};

    ctx.googleChatMessage = message;
    ctx.googleChatMessageId = messageName;

    logInfo('google_chat_get_message_success', {
      messageId: messageName
    });

    return ctx;
  } catch (error) {
    logError('google_chat_get_message_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'update_message':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const messageName = googleChatResolveName(resolved, 'update_message');
  const payload = {};
  const text = googleChatTrim(googleChatPickFirst(resolved, ['text', 'message', 'content']));
  if (text) {
    payload.text = text;
  }
  const cards = googleChatPickFirst(resolved, ['cards']);
  if (Array.isArray(cards) && cards.length) {
    payload.cards = cards;
  }
  const cardsV2 = googleChatPickFirst(resolved, ['cardsV2', 'cards_v2']);
  if (Array.isArray(cardsV2) && cardsV2.length) {
    payload.cardsV2 = cardsV2;
  }
  const explicitMask = googleChatTrim(googleChatPickFirst(resolved, ['updateMask', 'update_mask']));
  if (!Object.keys(payload).length) {
    throw new Error('Google Chat update_message requires at least one field to update. Provide text or cards.');
  }
  let updateMask = explicitMask;
  if (!updateMask) {
    const fields = [];
    if (payload.text) {
      fields.push('text');
    }
    if (payload.cards) {
      fields.push('cards');
    }
    if (payload.cardsV2) {
      fields.push('cardsV2');
    }
    updateMask = fields.join(',');
  }
  const query = updateMask ? { updateMask: updateMask } : {};

  try {
    const response = googleChatRequest('PATCH', '/' + messageName, accessToken, { query: query, body: payload });
    const message = response && response.body ? response.body : {};

    ctx.googleChatMessage = message;
    ctx.googleChatMessageId = message && message.name ? message.name : messageName;

    logInfo('google_chat_update_message_success', {
      messageId: ctx.googleChatMessageId,
      updateMask: updateMask || null
    });

    return ctx;
  } catch (error) {
    logError('google_chat_update_message_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    case 'delete_message':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);
  const accessToken = requireOAuthToken('google-chat', { scopes: ${scopesLiteral} });

  const messageName = googleChatResolveName(resolved, 'delete_message');
  const force = googleChatNormalizeBoolean(googleChatPickFirst(resolved, ['force']));
  const query = {};
  if (force !== null) {
    query.force = force;
  }

  try {
    googleChatRequest('DELETE', '/' + messageName, accessToken, { query: query });

    ctx.googleChatMessageDeleted = true;
    ctx.googleChatMessageId = messageName;

    logInfo('google_chat_delete_message_success', {
      messageId: messageName,
      force: force !== null ? force : undefined
    });

    return ctx;
  } catch (error) {
    logError('google_chat_delete_message_failed', { message: error && error.message ? error.message : String(error) });
    throw error;
  }
}
${googleChatHelpersBlock()}
`;
    default:
      throw new Error(`Unhandled action ${operation}`);
  }
}

function buildGoogleChatTrigger(operation, config) {
  const configLiteral = encodeConfig(config);
  const functionName = `trigger_trigger_google_chat_${operation}`;
  switch (operation) {
    case 'message_created':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);

  const filterSpaceRaw = googleChatTrim(googleChatPickFirst(resolved, ['space', 'spaceId', 'space_name', 'spaceName']));
  let normalizedFilter = filterSpaceRaw ? googleChatNormalizeResourceName(filterSpaceRaw) : '';
  if (!normalizedFilter) {
    const fallback = googleChatOptionalSecret('GOOGLE_CHAT_DEFAULT_SPACE');
    if (fallback) {
      normalizedFilter = googleChatNormalizeResourceName(fallback);
    }
  }

  const payload = ctx && ctx.webhookPayload ? ctx.webhookPayload : (ctx && ctx.payload ? ctx.payload : {});
  const event = payload && typeof payload.event === 'object' ? payload.event : (ctx && ctx.event ? ctx.event : payload || {});
  const message = event && event.message ? event.message : (payload && payload.message ? payload.message : null);
  const space = event && event.space ? event.space : (payload && payload.space ? payload.space : (message && message.space ? message.space : null));
  const sender = event && (event.user || event.sender) ? (event.user || event.sender) : (message && (message.sender || message.creator) ? (message.sender || message.creator) : null);

  const actualSpace = googleChatExtractSpaceName(space);
  if (normalizedFilter && (!actualSpace || actualSpace !== normalizedFilter)) {
    logInfo('google_chat_message_created_ignored', {
      expectedSpace: normalizedFilter,
      receivedSpace: actualSpace || null
    });
    return ctx;
  }

  ctx.googleChatTrigger = 'message_created';
  ctx.googleChatEvent = event;
  ctx.googleChatMessage = message;
  ctx.googleChatSpace = space;
  ctx.googleChatSender = sender || null;

  logInfo('google_chat_message_created_received', {
    space: actualSpace || null,
    messageId: message && message.name ? message.name : null
  });

  return ctx;
}
${googleChatHelpersBlock()}
`;
    case 'space_created':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  googleChatInterpolateConfig(config, ctx);

  const payload = ctx && ctx.webhookPayload ? ctx.webhookPayload : (ctx && ctx.payload ? ctx.payload : {});
  const event = payload && typeof payload.event === 'object' ? payload.event : (ctx && ctx.event ? ctx.event : payload || {});
  const space = event && event.space ? event.space : (payload && payload.space ? payload.space : null);

  ctx.googleChatTrigger = 'space_created';
  ctx.googleChatEvent = event;
  ctx.googleChatSpace = space;

  logInfo('google_chat_space_created_received', {
    space: space && space.name ? space.name : null
  });

  return ctx;
}
${googleChatHelpersBlock()}
`;
    case 'membership_created':
      return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const resolved = googleChatInterpolateConfig(config, ctx);

  const filterSpaceRaw = googleChatTrim(googleChatPickFirst(resolved, ['space', 'spaceId', 'space_name', 'spaceName']));
  let normalizedFilter = filterSpaceRaw ? googleChatNormalizeResourceName(filterSpaceRaw) : '';
  if (!normalizedFilter) {
    const fallback = googleChatOptionalSecret('GOOGLE_CHAT_DEFAULT_SPACE');
    if (fallback) {
      normalizedFilter = googleChatNormalizeResourceName(fallback);
    }
  }

  const payload = ctx && ctx.webhookPayload ? ctx.webhookPayload : (ctx && ctx.payload ? ctx.payload : {});
  const event = payload && typeof payload.event === 'object' ? payload.event : (ctx && ctx.event ? ctx.event : payload || {});
  const membership = event && event.membership ? event.membership : (payload && payload.membership ? payload.membership : null);
  const space = membership && membership.space ? membership.space : (event && event.space ? event.space : (payload && payload.space ? payload.space : null));
  const member = membership && membership.member ? membership.member : (event && event.member ? event.member : null);

  const actualSpace = googleChatExtractSpaceName(space);
  if (normalizedFilter && (!actualSpace || actualSpace !== normalizedFilter)) {
    logInfo('google_chat_membership_created_ignored', {
      expectedSpace: normalizedFilter,
      receivedSpace: actualSpace || null
    });
    return ctx;
  }

  ctx.googleChatTrigger = 'membership_created';
  ctx.googleChatEvent = event;
  ctx.googleChatMembership = membership;
  ctx.googleChatSpace = space;
  ctx.googleChatMember = member || null;

  logInfo('google_chat_membership_created_received', {
    space: actualSpace || null,
    member: membership && membership.name ? membership.name : null
  });

  return ctx;
}
${googleChatHelpersBlock()}
`;
    default:
      throw new Error(`Unhandled trigger ${operation}`);
  }
}

const cases = [
  ['action.google-chat:test_connection', {}],
  [
    'action.google-chat:send_message',
    {
      space: 'spaces/AAA',
      text: 'Hello from {{user.name}}',
      thread: { name: 'spaces/AAA/threads/BBB' },
      cards: [{ header: { title: 'Example' } }],
      cardsV2: [{ cardId: 'card-1', card: { sections: [] } }],
      actionResponse: { type: 'NEW_MESSAGE', url: 'https://example.com' }
    }
  ],
  [
    'action.google-chat:create_space',
    {
      displayName: 'Launch Announcements',
      spaceType: 'SPACE',
      threaded: true,
      externalUserAllowed: false,
      spaceHistoryState: 'HISTORY_ON'
    }
  ],
  [
    'action.google-chat:list_spaces',
    {
      pageSize: 25,
      pageToken: 'token-123',
      filter: 'spaceType = "SPACE"'
    }
  ],
  ['action.google-chat:get_space', { name: 'spaces/AAA' }],
  [
    'action.google-chat:list_members',
    {
      parent: 'spaces/AAA',
      pageSize: 50,
      pageToken: 'page-2',
      filter: 'member.type = "HUMAN"',
      showGroups: true
    }
  ],
  [
    'action.google-chat:create_membership',
    {
      parent: 'spaces/AAA',
      member: { name: 'users/123', type: 'HUMAN' },
      role: 'ROLE_MEMBER'
    }
  ],
  [
    'action.google-chat:list_messages',
    {
      parent: 'spaces/AAA',
      pageSize: 20,
      pageToken: 'next-token',
      filter: 'thread.name = "spaces/AAA/threads/BBB"',
      orderBy: 'createTime desc'
    }
  ],
  ['action.google-chat:get_message', { name: 'spaces/AAA/messages/MSG123' }],
  [
    'action.google-chat:update_message',
    {
      name: 'spaces/AAA/messages/MSG123',
      text: 'Updated message {{payload.update}}',
      cards: [{ sections: [{ widgets: [] }] }],
      cardsV2: [{ cardId: 'card-2', card: { sections: [] } }],
      updateMask: 'text,cards,cardsV2'
    }
  ],
  ['action.google-chat:delete_message', { name: 'spaces/AAA/messages/MSG123', force: true }],
  ['trigger.google-chat:message_created', { space: 'spaces/AAA' }],
  ['trigger.google-chat:space_created', {}],
  ['trigger.google-chat:membership_created', { space: 'spaces/AAA' }]
];

const lines = [];
for (const [operation, config] of cases) {
  const builder = operation.startsWith('action')
    ? buildGoogleChatAction(operation.split(':')[1], config)
    : buildGoogleChatTrigger(operation.split(':')[1], config);
  const escapedKey = `Apps Script Google Chat REAL_OPS builds ${operation} 1`;
  lines.push(`exports[\`${escapedKey}\`] = \`${builder}\`;`);
}

const snapshotPath = resolve('server/workflow/__tests__/__snapshots__/apps-script.google-chat.test.ts.snap');
writeFileSync(snapshotPath, lines.join('\n\n') + '\n');
