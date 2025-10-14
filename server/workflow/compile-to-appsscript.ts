  connectorKey?: string;
  tokenProperty?: string;
  missingLogKey?: string;
  connectorLabel?: string;
  useRequireOAuth?: boolean;
  oauthScopes?: string[];
  const {
    handlerName,
    triggerKey,
    queryBlock,
    messageFilterBlock,
    metadataProperties,
    logKey,
    connectorKey = 'gmail',
    tokenProperty = connectorKey === 'gmail' ? 'GMAIL_ACCESS_TOKEN' : 'GMAIL_ACCESS_TOKEN',
    missingLogKey = connectorKey === 'gmail' ? 'gmail_missing_access_token' : `${connectorKey.replace(/[^a-z0-9]/gi, '_')}_missing_access_token`,
    connectorLabel,
    useRequireOAuth = false,
    oauthScopes = [],
  } = options;

  const connectorName = connectorLabel || connectorKey;
  const friendlyOperation = triggerKey.includes(':')
    ? `${connectorName}.${triggerKey.split(':')[1]}`
    : `${connectorName}.${triggerKey}`;
  const accessTokenSnippet = useRequireOAuth
    ? `    let accessToken;
    try {
      accessToken = requireOAuthToken('${connectorKey}', { scopes: ${JSON.stringify(oauthScopes)} });
    } catch (error) {
      logError('${missingLogKey}', {
        operation: '${triggerKey}',
        message: error && error.message ? error.message : String(error)
      });
      throw error;
    }`
    : `    const accessToken = getSecret('${escapeForSingleQuotes(tokenProperty)}', { connectorKey: '${connectorKey}' });
    if (!accessToken) {
      logError('${missingLogKey}', { operation: '${triggerKey}' });
      throw new Error('Missing ${connectorName} access token for ${friendlyOperation} trigger');
    }`;

${accessTokenSnippet}
  'gmail-enhanced': {
    displayName: 'Gmail Enhanced',
    property: 'GMAIL_ENHANCED_ACCESS_TOKEN',
    description: 'OAuth access token',
    aliases: ['apps_script__gmail_enhanced__access_token', 'GMAIL_ACCESS_TOKEN', 'apps_script__gmail__access_token']
  },
function generateGmailEnhancedFunction(functionName: string, node: WorkflowNode): string {
  const rawOperationKey = typeof node.op === 'string' ? node.op : '';
  const nodeType = typeof node.type === 'string' ? node.type : '';
  const isTrigger = rawOperationKey.startsWith('trigger.gmail-enhanced')
    || nodeType.startsWith('trigger.gmail-enhanced')
    || nodeType.startsWith('trigger:')
    || nodeType.startsWith('trigger.');

  const operationFromNode =
    (typeof node.data?.operation === 'string' && node.data.operation)
      || (typeof (node.params as any)?.operation === 'string' && (node.params as any).operation)
      || (rawOperationKey.includes(':') ? rawOperationKey.split(':')[1]
        : rawOperationKey.includes('.') ? rawOperationKey.split('.').pop() || ''
        : '');

  const defaultOperation = isTrigger ? 'new_email' : 'test_connection';
  const operationName = operationFromNode || defaultOperation;

  const prefix = isTrigger ? 'trigger.gmail-enhanced' : 'action.gmail-enhanced';
  let resolvedKey = rawOperationKey;

  if (!resolvedKey) {
    resolvedKey = `${prefix}:${operationName}`;
  } else if (!resolvedKey.startsWith('action.gmail-enhanced') && !resolvedKey.startsWith('trigger.gmail-enhanced')) {
    const suffix = resolvedKey.includes(':')
      ? resolvedKey.split(':').pop() || operationName
      : resolvedKey.includes('.') ? resolvedKey.split('.').pop() || operationName
      : operationName;
    resolvedKey = `${prefix}:${suffix}`;
  }

  const config = node.data?.config ?? node.params ?? {};
  const builder = REAL_OPS[resolvedKey];

  if (typeof builder === 'function') {
    const generated = builder(config);
    if (typeof generated === 'string' && generated.trim().length > 0) {
      return generated.replace(/function\s+[^(]+\(/, match => `function ${functionName}(`);
    }
  }

  const safeKey = esc(resolvedKey || `${prefix}:${operationName}`);
  const safeOperation = esc(operationName);

  return `
function ${functionName}(ctx) {
  ctx = ctx || {};
  logWarn('gmail_enhanced_operation_missing', { operation: '${safeKey}' });
  throw new Error('Gmail Enhanced operation "${safeOperation}" is not implemented in Apps Script runtime.');
}`;
}


function buildGmailEnhancedAction(operation: string, config: any): string {
  const functionName = `step_action_gmail_enhanced_${operation.replace(/[^a-z0-9]+/gi, '_')}`;
  const configLiteral = JSON.stringify(prepareValueForCode(config ?? {}));
  const scopesLiteral = JSON.stringify([
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'openid',
    'email',
    'profile',
  ]);

  return String.raw`
function ${functionName}(inputData, params) {
  inputData = inputData || {};
  params = params || {};
  var options = Object.assign({}, ${configLiteral});
  if (params && typeof params === 'object') {
    for (var key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        options[key] = params[key];
      }
    }
  }

  if (typeof __gmailEnhancedHelpers === 'undefined') {
    __gmailEnhancedHelpers = (function () {
      var DEFAULT_SCOPES = ${scopesLiteral};
      var BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/';

      function ensureString(value) {
        if (value === null || value === undefined) {
          return '';
        }
        return String(value);
      }

      function ensureArray(value) {
        if (!value) {
          return [];
        }
        if (Array.isArray(value)) {
          var normalized = [];
          for (var i = 0; i < value.length; i++) {
            var entry = value[i];
            if (entry === null || entry === undefined) {
              continue;
            }
            if (typeof entry === 'string') {
              var trimmed = entry.trim();
              if (trimmed) {
                normalized.push(trimmed);
              }
            } else {
              normalized.push(String(entry));
            }
          }
          return normalized;
        }
        if (typeof value === 'string') {
          var trimmed = value.trim();
          return trimmed ? [trimmed] : [];
        }
        return [String(value)];
      }

      function requireValue(value, field) {
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
          throw new Error('Missing required Gmail Enhanced field: ' + field);
        }
        return value;
      }

      function toUserId(value) {
        if (value === null || value === undefined) {
          return 'me';
        }
        var normalized = String(value).trim();
        return normalized || 'me';
      }

      function resolveScopes(opts) {
        var configured = opts && Array.isArray(opts.scopes) ? opts.scopes : [];
        if (!configured.length) {
          return DEFAULT_SCOPES;
        }
        return configured.map(function (entry) { return String(entry); }).filter(function (entry) { return entry.trim().length > 0; });
      }

      function apiRequest(method, userId, path, options) {
        options = options || {};
        var scopes = resolveScopes(options);
        var token = requireOAuthToken('gmail-enhanced', { scopes: scopes });
        var url = BASE_URL + encodeURIComponent(toUserId(userId)) + path;
        if (options.query && typeof options.query === 'object') {
          var queryParts = [];
          for (var key in options.query) {
            if (!Object.prototype.hasOwnProperty.call(options.query, key)) continue;
            var raw = options.query[key];
            if (raw === undefined || raw === null || raw === '') continue;
            if (Array.isArray(raw)) {
              for (var i = 0; i < raw.length; i++) {
                var item = raw[i];
                if (item === undefined || item === null || item === '') continue;
                queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(item)));
              }
            } else {
              queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(raw)));
            }
          }
          if (queryParts.length > 0) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + queryParts.join('&');
          }
        }

        var headers = { Authorization: 'Bearer ' + token };
        if (options.headers && typeof options.headers === 'object') {
          for (var headerName in options.headers) {
            if (Object.prototype.hasOwnProperty.call(options.headers, headerName)) {
              headers[headerName] = options.headers[headerName];
            }
          }
        }

        var payload = options.payload;
        var payloadText;
        if (payload !== undefined) {
          payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload);
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        var response = rateLimitAware(function () {
          return fetchJson({
            url: url,
            method: method,
            headers: headers,
            payload: payloadText,
            muteHttpExceptions: false
          });
        }, { attempts: 5, backoffMs: 500 });

        return response.body || {};
      }

      function buildMimeMessage(message) {
        var toList = ensureArray(requireValue(message.to, 'to'));
        if (!toList.length) {
          throw new Error('Send email requires at least one recipient.');
        }

        var ccList = ensureArray(message.cc);
        var bccList = ensureArray(message.bcc);
        var headerLines = [];
        headerLines.push('To: ' + toList.join(', '));
        if (ccList.length) {
          headerLines.push('Cc: ' + ccList.join(', '));
        }
        if (bccList.length) {
          headerLines.push('Bcc: ' + bccList.join(', '));
        }
        headerLines.push('Subject: ' + ensureString(requireValue(message.subject, 'subject')));
        headerLines.push('MIME-Version: 1.0');
        var replyTo = ensureString(message.replyTo).trim();
        if (replyTo) {
          headerLines.push('Reply-To: ' + replyTo);
        }

        var bodyContent = ensureString(requireValue(message.body, 'body'));
        var isHtml = !!message.isHtml;
        var attachments = Array.isArray(message.attachments) ? message.attachments : [];

        if (!attachments.length) {
          headerLines.push('Content-Type: ' + (isHtml ? 'text/html' : 'text/plain') + '; charset="UTF-8"');
          headerLines.push('Content-Transfer-Encoding: 7bit');
          var simple = headerLines.join('\r\n') + '\r\n\r\n' + bodyContent;
          return Utilities.base64EncodeWebSafe(simple);
        }

        var boundary = 'gmail-enhanced-' + Utilities.getUuid();
        headerLines.push('Content-Type: multipart/mixed; boundary="' + boundary + '"');

        var parts = [];
        parts.push('--' + boundary);
        parts.push('Content-Type: ' + (isHtml ? 'text/html' : 'text/plain') + '; charset="UTF-8"');
        parts.push('Content-Transfer-Encoding: 7bit');
        parts.push('');
        parts.push(bodyContent);
        parts.push('');

        for (var index = 0; index < attachments.length; index++) {
          var descriptor = attachments[index] || {};
          var name = ensureString(descriptor.filename || descriptor.name).trim();
          var data = descriptor.data !== undefined ? descriptor.data : descriptor.content;
          if (!name || data === undefined || data === null) {
            continue;
          }
          var mimeType = ensureString(descriptor.mimeType || descriptor.contentType || 'application/octet-stream').trim() || 'application/octet-stream';
          var encoded = '';
          try {
            var decoded = Utilities.base64Decode(String(data));
            encoded = Utilities.base64Encode(decoded);
          } catch (error) {
            logWarn('gmail_enhanced_attachment_decode_failed', {
              index: index,
              message: error && error.message ? error.message : String(error)
            });
            encoded = Utilities.base64Encode(Utilities.newBlob(String(data)).getBytes());
          }

          parts.push('--' + boundary);
          parts.push('Content-Type: ' + mimeType);
          parts.push('Content-Disposition: attachment; filename="' + name.replace(/"/g, '\\"') + '"');
          parts.push('Content-Transfer-Encoding: base64');
          parts.push('');
          parts.push(encoded);
          parts.push('');
        }

        parts.push('--' + boundary + '--');
        var fullMessage = headerLines.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
        return Utilities.base64EncodeWebSafe(fullMessage);
      }

      function handleSendEmail(options, inputData) {
        var userId = toUserId(options.userId);
        var raw = buildMimeMessage(options);
        var response = apiRequest('POST', userId, '/messages/send', { payload: { raw: raw }, scopes: options.scopes });
        inputData.gmailEnhancedMessage = response;
        inputData.gmailEnhancedMessageId = response.id || null;
        inputData.gmailEnhancedThreadId = response.threadId || null;
        inputData.gmailEnhancedLabelIds = Array.isArray(response.labelIds) ? response.labelIds : [];
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleCreateDraft(options, inputData) {
        var userId = toUserId(options.userId);
        var raw = buildMimeMessage(options);
        var response = apiRequest('POST', userId, '/drafts', { payload: { message: { raw: raw } }, scopes: options.scopes });
        inputData.gmailEnhancedDraft = response;
        inputData.gmailEnhancedDraftId = response.id || null;
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleGetMessage(options, inputData) {
        var userId = toUserId(options.userId);
        var messageId = ensureString(requireValue(options.id, 'id'));
        var response = apiRequest('GET', userId, '/messages/' + encodeURIComponent(messageId), {
          query: {
            format: ensureString(options.format || 'full'),
            metadataHeaders: ensureArray(options.metadataHeaders)
          },
          scopes: options.scopes
        });
        inputData.gmailEnhancedMessage = response;
        inputData.gmailEnhancedMessageId = response.id || null;
        inputData.gmailEnhancedThreadId = response.threadId || null;
        inputData.gmailEnhancedLabelIds = Array.isArray(response.labelIds) ? response.labelIds : [];
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleListMessages(options, inputData) {
        var userId = toUserId(options.userId);
        var response = apiRequest('GET', userId, '/messages', {
          query: {
            q: ensureString(options.q || ''),
            labelIds: ensureArray(options.labelIds),
            includeSpamTrash: options.includeSpamTrash ? 'true' : undefined,
            maxResults: options.maxResults,
            pageToken: options.pageToken
          },
          scopes: options.scopes
        });
        inputData.gmailEnhancedMessages = Array.isArray(response.messages) ? response.messages : [];
        inputData.gmailEnhancedNextPageToken = response.nextPageToken || null;
        inputData.gmailEnhancedResultSizeEstimate = response.resultSizeEstimate || null;
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleSearchMessages(options, inputData) {
        var parts = [];
        if (options.query) {
          parts.push(String(options.query));
        }
        if (options.from) {
          parts.push('from:' + String(options.from));
        }
        if (options.to) {
          parts.push('to:' + String(options.to));
        }
        if (options.subject) {
          parts.push('subject:' + String(options.subject));
        }
        if (options.hasAttachment) {
          parts.push('has:attachment');
        }
        if (options.isUnread) {
          parts.push('is:unread');
        }
        if (options.dateAfter) {
          parts.push('after:' + String(options.dateAfter));
        }
        if (options.dateBefore) {
          parts.push('before:' + String(options.dateBefore));
        }
        var query = parts.join(' ').trim();
        return handleListMessages({
          userId: options.userId,
          q: query,
          maxResults: options.maxResults,
          scopes: options.scopes
        }, inputData);
      }

      function handleModifyMessage(options, inputData) {
        var userId = toUserId(options.userId);
        var messageId = ensureString(requireValue(options.id, 'id'));
        var response = apiRequest('POST', userId, '/messages/' + encodeURIComponent(messageId) + '/modify', {
          payload: {
            addLabelIds: ensureArray(options.addLabelIds),
            removeLabelIds: ensureArray(options.removeLabelIds)
          },
          scopes: options.scopes
        });
        inputData.gmailEnhancedMessage = response;
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleDeleteMessage(options, inputData) {
        var userId = toUserId(options.userId);
        var messageId = ensureString(requireValue(options.id, 'id'));
        apiRequest('DELETE', userId, '/messages/' + encodeURIComponent(messageId), { scopes: options.scopes });
        inputData.gmailEnhancedDeleted = true;
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleListLabels(options, inputData) {
        var userId = toUserId(options.userId);
        var response = apiRequest('GET', userId, '/labels', { scopes: options.scopes });
        inputData.gmailEnhancedLabels = Array.isArray(response.labels) ? response.labels : [];
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleCreateLabel(options, inputData) {
        var userId = toUserId(options.userId);
        var payload = {
          name: ensureString(requireValue(options.name, 'name')),
          labelListVisibility: options.labelListVisibility || 'labelShow',
          messageListVisibility: options.messageListVisibility || 'show',
          type: options.type || 'user'
        };
        if (options.color && typeof options.color === 'object') {
          payload.color = {
            textColor: ensureString(options.color.textColor),
            backgroundColor: ensureString(options.color.backgroundColor)
          };
        }
        var response = apiRequest('POST', userId, '/labels', { payload: payload, scopes: options.scopes });
        inputData.gmailEnhancedLabel = response;
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function handleTestConnection(options, inputData) {
        var userId = toUserId(options.userId);
        var profile = apiRequest('GET', userId, '/profile', { scopes: options.scopes });
        inputData.gmailEnhancedProfile = profile;
        inputData.gmailEnhancedEmailAddress = profile.emailAddress || null;
        inputData.gmailEnhancedHistoryId = profile.historyId || null;
        inputData.gmailEnhancedSuccess = true;
        return inputData;
      }

      function execute(operation, options, inputData) {
        var op = (operation || '').toLowerCase();
        switch (op) {
          case 'send_email':
            return handleSendEmail(options, inputData);
          case 'create_draft':
            return handleCreateDraft(options, inputData);
          case 'get_message':
            return handleGetMessage(options, inputData);
          case 'list_messages':
            return handleListMessages(options, inputData);
          case 'search_messages':
            return handleSearchMessages(options, inputData);
          case 'modify_message':
            return handleModifyMessage(options, inputData);
          case 'delete_message':
            return handleDeleteMessage(options, inputData);
          case 'list_labels':
            return handleListLabels(options, inputData);
          case 'create_label':
            return handleCreateLabel(options, inputData);
          case 'test_connection':
            return handleTestConnection(options, inputData);
          default:
            throw new Error('Unsupported Gmail Enhanced action: ' + operation);
        }
      }

      return { execute: execute };
    })();
  }

  try {
    return __gmailEnhancedHelpers.execute('${operation}', options, inputData);
  } catch (error) {
    console.error('❌ Gmail Enhanced action failed:', error);
    inputData.gmailEnhancedError = error && error.message ? error.message : String(error);
    inputData.gmailEnhancedSuccess = false;
    throw error;
  }
}

var __gmailEnhancedHelpers;
`;
}

function buildGmailEnhancedTrigger(operation: string, config: any): string {
  const normalizedOperation = operation.trim();
  const scopes = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'openid',
    'email',
    'profile',
  ];

  if (normalizedOperation === 'new_email') {
    const query = esc(config?.query || 'is:unread');
    const labels = JSON.stringify(prepareValueForCode(config?.labelIds ?? []));
    return buildGmailPollingTrigger({
      handlerName: 'onGmailEnhancedNewEmail',
      triggerKey: 'trigger.gmail-enhanced:new_email',
      logKey: 'gmail_enhanced_new_email',
      queryBlock: `
const queryTemplate = '${query}';
const query = queryTemplate ? interpolate(queryTemplate, interpolationContext).trim() : '';
const labelIdsConfig = ${labels};
const labelIds = [];
if (Array.isArray(labelIdsConfig)) {
  for (let i = 0; i < labelIdsConfig.length; i++) {
    const value = typeof labelIdsConfig[i] === 'string' ? interpolate(labelIdsConfig[i], interpolationContext).trim() : '';
    if (value) {
      labelIds.push(value);
    }
  }
}
`,
      metadataProperties: `connector: 'gmail-enhanced', labelCount: labelIds.length,`,
      connectorKey: 'gmail-enhanced',
      tokenProperty: 'GMAIL_ENHANCED_ACCESS_TOKEN',
      missingLogKey: 'gmail_enhanced_missing_access_token',
      connectorLabel: 'gmail-enhanced',
      useRequireOAuth: true,
      oauthScopes: scopes,
    });
  }

  if (normalizedOperation === 'email_starred') {
    return buildGmailPollingTrigger({
      handlerName: 'onGmailEnhancedEmailStarred',
      triggerKey: 'trigger.gmail-enhanced:email_starred',
      logKey: 'gmail_enhanced_email_starred',
      queryBlock: `
const labelIds = ['STARRED'];
const query = 'is:starred';
`,
      messageFilterBlock: `
const hasStarred = Array.isArray(message.labelIds) && message.labelIds.indexOf('STARRED') !== -1;
if (!hasStarred) {
  continue;
}
`,
      metadataProperties: `connector: 'gmail-enhanced', labelCount: labelIds.length,`,
      connectorKey: 'gmail-enhanced',
      tokenProperty: 'GMAIL_ENHANCED_ACCESS_TOKEN',
      missingLogKey: 'gmail_enhanced_missing_access_token',
      connectorLabel: 'gmail-enhanced',
      useRequireOAuth: true,
      oauthScopes: scopes,
    });
  }

  throw new Error(`Unsupported Gmail Enhanced trigger: ${operation}`);
}

  'action.gmail-enhanced:test_connection': (c) => buildGmailEnhancedAction('test_connection', c),
  'action.gmail-enhanced:send_email': (c) => buildGmailEnhancedAction('send_email', c),
  'action.gmail-enhanced:get_message': (c) => buildGmailEnhancedAction('get_message', c),
  'action.gmail-enhanced:list_messages': (c) => buildGmailEnhancedAction('list_messages', c),
  'action.gmail-enhanced:modify_message': (c) => buildGmailEnhancedAction('modify_message', c),
  'action.gmail-enhanced:delete_message': (c) => buildGmailEnhancedAction('delete_message', c),
  'action.gmail-enhanced:create_draft': (c) => buildGmailEnhancedAction('create_draft', c),
  'action.gmail-enhanced:list_labels': (c) => buildGmailEnhancedAction('list_labels', c),
  'action.gmail-enhanced:create_label': (c) => buildGmailEnhancedAction('create_label', c),
  'action.gmail-enhanced:search_messages': (c) => buildGmailEnhancedAction('search_messages', c),
  'trigger.gmail-enhanced:new_email': (c) => buildGmailEnhancedTrigger('new_email', c),
  'trigger.gmail-enhanced:email_starred': (c) => buildGmailEnhancedTrigger('email_starred', c),
