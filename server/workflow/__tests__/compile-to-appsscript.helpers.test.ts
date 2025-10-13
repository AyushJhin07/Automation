import { appsScriptHttpHelpers, REAL_OPS } from '../compile-to-appsscript';

describe('appsScriptHttpHelpers', () => {
  it('emits the shared helper module', () => {
    const helpers = appsScriptHttpHelpers();
    expect(helpers).toContain('function withRetries');
    expect(helpers).toContain('function fetchJson');
    expect(helpers.trim()).toMatchInlineSnapshot(`
var __HTTP_RETRY_DEFAULTS = {
  maxAttempts: 5,
  initialDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 60000
};

function __normalizeHeaders(headers) {
  var normalized = {};
  if (!headers) {
    return normalized;
  }
  for (var key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      normalized[String(key).toLowerCase()] = headers[key];
    }
  }
  return normalized;
}

function __resolveRetryAfterMs(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray && Array.isArray(value) && value.length > 0) {
    value = value[0];
  }
  var raw = String(value).trim();
  if (!raw) {
    return null;
  }
  var asNumber = Number(raw);
  var now = new Date().getTime();
  if (!isNaN(asNumber)) {
    if (asNumber > 1000000000000) {
      return Math.max(0, Math.round(asNumber - now));
    }
    if (asNumber > 1000000000) {
      return Math.max(0, Math.round(asNumber * 1000 - now));
    }
    return Math.max(0, Math.round(asNumber * 1000));
  }
  var parsedDate = new Date(raw);
  if (!isNaN(parsedDate.getTime())) {
    return Math.max(0, parsedDate.getTime() - now);
  }
  return null;
}

function __resolveResetDelayMs(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray && Array.isArray(value) && value.length > 0) {
    value = value[0];
  }
  var raw = String(value).trim();
  if (!raw) {
    return null;
  }
  var asNumber = Number(raw);
  var now = new Date().getTime();
  if (!isNaN(asNumber)) {
    if (asNumber > 1000000000000) {
      return Math.max(0, Math.round(asNumber - now));
    }
    if (asNumber > 1000000000) {
      return Math.max(0, Math.round(asNumber * 1000 - now));
    }
    return Math.max(0, Math.round(asNumber * 1000));
  }
  var parsedDate = new Date(raw);
  if (!isNaN(parsedDate.getTime())) {
    return Math.max(0, parsedDate.getTime() - now);
  }
  return null;
}

function logStructured(level, event, details) {
  var payload = {
    level: level,
    event: event,
    details: details || {},
    timestamp: new Date().toISOString()
  };
  var message = '[' + payload.level + '] ' + payload.event + ' ' + JSON.stringify(payload.details);
  if (level === 'ERROR') {
    console.error(message);
  } else if (level === 'WARN') {
    console.warn(message);
  } else {
    console.log(message);
  }
}

function logInfo(event, details) {
  logStructured('INFO', event, details);
}

function logWarn(event, details) {
  logStructured('WARN', event, details);
}

function logError(event, details) {
  logStructured('ERROR', event, details);
}

var __TRIGGER_REGISTRY_KEY = '__studio_trigger_registry__';

function __loadTriggerRegistry() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(__TRIGGER_REGISTRY_KEY);
    if (!raw) {
      return {};
    }
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    logWarn('trigger_registry_parse_failed', {
      message: error && error.message ? error.message : String(error)
    });
  }
  return {};
}

function __saveTriggerRegistry(registry) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      __TRIGGER_REGISTRY_KEY,
      JSON.stringify(registry || {})
    );
  } catch (error) {
    logError('trigger_registry_save_failed', {
      message: error && error.message ? error.message : String(error)
    });
  }
}

function __findTriggerById(triggerId) {
  if (!triggerId) {
    return null;
  }
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    if (!trigger) {
      continue;
    }
    if (typeof trigger.getUniqueId === 'function' && trigger.getUniqueId() === triggerId) {
      return trigger;
    }
  }
  return null;
}

function __ensureTrigger(triggerKey, handler, type, builderFn, description) {
  var registry = __loadTriggerRegistry();
  var entry = registry[triggerKey];
  if (entry) {
    var existing = __findTriggerById(entry.id);
    if (existing) {
      logInfo('trigger_exists', { key: triggerKey, handler: handler, type: type });
      return { key: triggerKey, triggerId: entry.id, handler: handler, type: type };
    }
    logWarn('trigger_missing_recreating', { key: triggerKey, handler: handler, type: type });
  }

  try {
    var trigger = builderFn();
    var triggerId = trigger && typeof trigger.getUniqueId === 'function' ? trigger.getUniqueId() : null;
    registry[triggerKey] = {
      id: triggerId,
      handler: handler,
      type: type,
      description: description || null,
      updatedAt: new Date().toISOString()
    };
    __saveTriggerRegistry(registry);
    logInfo('trigger_created', { key: triggerKey, handler: handler, type: type, description: description || null });
    return { key: triggerKey, triggerId: triggerId, handler: handler, type: type };
  } catch (error) {
    logError('trigger_create_failed', {
      key: triggerKey,
      handler: handler,
      type: type,
      message: error && error.message ? error.message : String(error)
    });
    throw error;
  }
}

function __createEphemeralTrigger(triggerKey, handler, type, builderFn, description) {
  try {
    var trigger = builderFn();
    var triggerId = trigger && typeof trigger.getUniqueId === 'function' ? trigger.getUniqueId() : null;
    logInfo('trigger_created', {
      key: triggerKey,
      handler: handler,
      type: type,
      ephemeral: true,
      description: description || null
    });
    return { key: triggerKey, triggerId: triggerId, handler: handler, type: type };
  } catch (error) {
    logError('trigger_create_failed', {
      key: triggerKey,
      handler: handler,
      type: type,
      ephemeral: true,
      message: error && error.message ? error.message : String(error)
    });
    throw error;
  }
}

function syncTriggerRegistry(activeKeys) {
  var registry = __loadTriggerRegistry();
  var keep = {};
  if (Array.isArray(activeKeys)) {
    for (var i = 0; i < activeKeys.length; i++) {
      keep[activeKeys[i]] = true;
    }
  }
  var triggers = ScriptApp.getProjectTriggers();
  var changed = false;

  for (var key in registry) {
    if (!keep[key]) {
      var entry = registry[key];
      var triggerId = entry && entry.id;
      if (triggerId) {
        for (var j = 0; j < triggers.length; j++) {
          var trigger = triggers[j];
          if (trigger && typeof trigger.getUniqueId === 'function' && trigger.getUniqueId() === triggerId) {
            ScriptApp.deleteTrigger(trigger);
            break;
          }
        }
      }
      delete registry[key];
      changed = true;
      logInfo('trigger_removed', { key: key });
    }
  }

  if (changed) {
    __saveTriggerRegistry(registry);
  }
}

function clearTriggerByKey(triggerKey) {
  if (!triggerKey) {
    return;
  }
  var registry = __loadTriggerRegistry();
  var entry = registry[triggerKey];
  if (!entry) {
    return;
  }
  var triggerId = entry.id;
  var trigger = triggerId ? __findTriggerById(triggerId) : null;
  if (trigger) {
    ScriptApp.deleteTrigger(trigger);
  }
  delete registry[triggerKey];
  __saveTriggerRegistry(registry);
  logInfo('trigger_cleared', { key: triggerKey });
}

function buildTimeTrigger(config) {
  config = config || {};
  var handler = config.handler || 'main';
  var triggerKey = config.key || handler + ':' + (config.frequency || 'time');
  var description = config.description || null;

  function builder() {
    var timeBuilder = ScriptApp.newTrigger(handler).timeBased();
    if (config.runAt) {
      return timeBuilder.at(new Date(config.runAt)).create();
    }
    if (config.everyMinutes) {
      timeBuilder.everyMinutes(Number(config.everyMinutes) || 1);
    } else if (config.everyHours) {
      timeBuilder.everyHours(Number(config.everyHours) || 1);
    } else if (config.everyDays) {
      timeBuilder.everyDays(Number(config.everyDays) || 1);
    } else if (config.everyWeeks) {
      timeBuilder.everyWeeks(Number(config.everyWeeks) || 1);
    }
    if (typeof config.atHour === 'number' && typeof timeBuilder.atHour === 'function') {
      timeBuilder.atHour(config.atHour);
    }
    if (typeof config.nearMinute === 'number' && typeof timeBuilder.nearMinute === 'function') {
      timeBuilder.nearMinute(config.nearMinute);
    }
    if (typeof config.onMonthDay === 'number' && typeof timeBuilder.onMonthDay === 'function') {
      timeBuilder.onMonthDay(config.onMonthDay);
    }
    if (config.onWeekDay) {
      var weekDay = config.onWeekDay;
      if (typeof weekDay === 'string') {
        weekDay = ScriptApp.WeekDay[weekDay] || ScriptApp.WeekDay.MONDAY;
      }
      if (weekDay) {
        timeBuilder.onWeekDay(weekDay);
      }
    }
    return timeBuilder.create();
  }

  if (config.ephemeral) {
    return __createEphemeralTrigger(triggerKey, handler, 'time', builder, description);
  }

  return __ensureTrigger(triggerKey, handler, 'time', builder, description);
}

function buildPollingWrapper(triggerKey, executor) {
  var stats = { processed: 0 };
  logInfo('trigger_poll_start', { key: triggerKey });
  var runtime = {
    dispatch: function (payload) {
      try {
        main(payload || {});
        stats.processed += 1;
      } catch (error) {
        logError('trigger_dispatch_failed', {
          key: triggerKey,
          message: error && error.message ? error.message : String(error)
        });
        throw error;
      }
    },
    summary: function (partial) {
      if (!partial || typeof partial !== 'object') {
        return;
      }
      for (var key in partial) {
        stats[key] = partial[key];
      }
    }
  };

  try {
    var result = executor(runtime);
    if (result && typeof result === 'object') {
      runtime.summary(result);
    }
    logInfo('trigger_poll_success', { key: triggerKey, stats: stats });
    return stats;
  } catch (error) {
    logError('trigger_poll_error', {
      key: triggerKey,
      message: error && error.message ? error.message : String(error)
    });
    throw error;
  }
}

var __SECRET_HELPER_DEFAULT_OVERRIDES = {
  defaults: {
    AIRTABLE_API_KEY: { aliases: ['apps_script__airtable__api_key'] },
    AIRTABLE_BASE_ID: { aliases: ['apps_script__airtable__base_id'] },
    ASANA_ACCESS_TOKEN: { aliases: ['apps_script__asana__access_token'] },
    BOX_ACCESS_TOKEN: { aliases: ['apps_script__box__access_token'] },
    DOCUSIGN_ACCESS_TOKEN: { aliases: ['apps_script__docusign__access_token'] },
    DOCUSIGN_ACCOUNT_ID: { aliases: ['apps_script__docusign__account_id'] },
    DOCUSIGN_BASE_URI: { aliases: ['apps_script__docusign__base_uri'] },
    DROPBOX_ACCESS_TOKEN: { aliases: ['apps_script__dropbox__access_token'] },
    GITHUB_ACCESS_TOKEN: { aliases: ['apps_script__github__access_token'] },
    GOOGLE_ADMIN_ACCESS_TOKEN: { aliases: ['apps_script__google_admin__access_token'] },
    GOOGLE_ADMIN_CUSTOMER_ID: { aliases: ['apps_script__google_admin__customer_id'] },
    HUBSPOT_API_KEY: { aliases: ['apps_script__hubspot__api_key'] },
    JIRA_API_TOKEN: { aliases: ['apps_script__jira__api_token'] },
    JIRA_BASE_URL: { aliases: ['apps_script__jira__base_url'] },
    JIRA_EMAIL: { aliases: ['apps_script__jira__email'] },
    NOTION_ACCESS_TOKEN: { aliases: ['apps_script__notion__access_token'] },
    SALESFORCE_ACCESS_TOKEN: { aliases: ['apps_script__salesforce__access_token'] },
    SALESFORCE_INSTANCE_URL: { aliases: ['apps_script__salesforce__instance_url'] },
    SHOPIFY_ACCESS_TOKEN: { aliases: ['apps_script__shopify__access_token'] },
    SHOPIFY_API_KEY: { aliases: ['apps_script__shopify__api_key'] },
    SHOPIFY_SHOP_DOMAIN: { aliases: ['apps_script__shopify__shop_domain'] },
    SLACK_ACCESS_TOKEN: { aliases: ['apps_script__slack__bot_token'], mapTo: 'SLACK_BOT_TOKEN' },
    SLACK_BOT_TOKEN: { aliases: ['SLACK_ACCESS_TOKEN', 'apps_script__slack__bot_token'] },
    SLACK_WEBHOOK_URL: { aliases: ['apps_script__slack__webhook_url'] },
    SQUARE_ACCESS_TOKEN: { aliases: ['apps_script__square__access_token'] },
    SQUARE_APPLICATION_ID: { aliases: ['apps_script__square__application_id'] },
    SQUARE_ENVIRONMENT: { aliases: ['apps_script__square__environment'] },
    STRIPE_SECRET_KEY: { aliases: ['apps_script__stripe__secret_key'] },
    TRELLO_API_KEY: { aliases: ['apps_script__trello__api_key'] },
    TRELLO_TOKEN: { aliases: ['apps_script__trello__token'] },
    TWILIO_ACCOUNT_SID: { aliases: ['apps_script__twilio__account_sid'] },
    TWILIO_AUTH_TOKEN: { aliases: ['apps_script__twilio__auth_token'] },
    TWILIO_FROM_NUMBER: { aliases: ['apps_script__twilio__from_number'] },
    TYPEFORM_ACCESS_TOKEN: { aliases: ['apps_script__typeform__access_token'] }
  },
  connectors: {
    airtable: {
      AIRTABLE_API_KEY: { aliases: ['apps_script__airtable__api_key'] },
      AIRTABLE_BASE_ID: { aliases: ['apps_script__airtable__base_id'] }
    },
    asana: {
      ASANA_ACCESS_TOKEN: { aliases: ['apps_script__asana__access_token'] }
    },
    box: {
      BOX_ACCESS_TOKEN: { aliases: ['apps_script__box__access_token'] }
    },
    docusign: {
      DOCUSIGN_ACCESS_TOKEN: { aliases: ['apps_script__docusign__access_token'] },
      DOCUSIGN_ACCOUNT_ID: { aliases: ['apps_script__docusign__account_id'] },
      DOCUSIGN_BASE_URI: { aliases: ['apps_script__docusign__base_uri'] }
    },
    dropbox: {
      DROPBOX_ACCESS_TOKEN: { aliases: ['apps_script__dropbox__access_token'] }
    },
    github: {
      GITHUB_ACCESS_TOKEN: { aliases: ['apps_script__github__access_token'] }
    },
    'google-admin': {
      GOOGLE_ADMIN_ACCESS_TOKEN: { aliases: ['apps_script__google_admin__access_token'] },
      GOOGLE_ADMIN_CUSTOMER_ID: { aliases: ['apps_script__google_admin__customer_id'] }
    },
    hubspot: {
      HUBSPOT_API_KEY: { aliases: ['apps_script__hubspot__api_key'] }
    },
    jira: {
      JIRA_API_TOKEN: { aliases: ['apps_script__jira__api_token'] },
      JIRA_BASE_URL: { aliases: ['apps_script__jira__base_url'] },
      JIRA_EMAIL: { aliases: ['apps_script__jira__email'] }
    },
    notion: {
      NOTION_ACCESS_TOKEN: { aliases: ['apps_script__notion__access_token'] }
    },
    salesforce: {
      SALESFORCE_ACCESS_TOKEN: { aliases: ['apps_script__salesforce__access_token'] },
      SALESFORCE_INSTANCE_URL: { aliases: ['apps_script__salesforce__instance_url'] }
    },
    shopify: {
      SHOPIFY_ACCESS_TOKEN: { aliases: ['apps_script__shopify__access_token'] },
      SHOPIFY_API_KEY: { aliases: ['apps_script__shopify__api_key'] },
      SHOPIFY_SHOP_DOMAIN: { aliases: ['apps_script__shopify__shop_domain'] }
    },
    slack: {
      SLACK_ACCESS_TOKEN: { aliases: ['apps_script__slack__bot_token'], mapTo: 'SLACK_BOT_TOKEN' },
      SLACK_BOT_TOKEN: { aliases: ['SLACK_ACCESS_TOKEN', 'apps_script__slack__bot_token'] },
      SLACK_WEBHOOK_URL: { aliases: ['apps_script__slack__webhook_url'] }
    },
    square: {
      SQUARE_ACCESS_TOKEN: { aliases: ['apps_script__square__access_token'] },
      SQUARE_APPLICATION_ID: { aliases: ['apps_script__square__application_id'] },
      SQUARE_ENVIRONMENT: { aliases: ['apps_script__square__environment'] }
    },
    stripe: {
      STRIPE_SECRET_KEY: { aliases: ['apps_script__stripe__secret_key'] }
    },
    trello: {
      TRELLO_API_KEY: { aliases: ['apps_script__trello__api_key'] },
      TRELLO_TOKEN: { aliases: ['apps_script__trello__token'] }
    },
    twilio: {
      TWILIO_ACCOUNT_SID: { aliases: ['apps_script__twilio__account_sid'] },
      TWILIO_AUTH_TOKEN: { aliases: ['apps_script__twilio__auth_token'] },
      TWILIO_FROM_NUMBER: { aliases: ['apps_script__twilio__from_number'] }
    },
    typeform: {
      TYPEFORM_ACCESS_TOKEN: { aliases: ['apps_script__typeform__access_token'] }
    }
  }
};
var __CONNECTOR_OAUTH_TOKEN_METADATA = {
  asana: {
    displayName: 'Asana',
    property: 'ASANA_ACCESS_TOKEN',
    description: 'personal access token',
    aliases: ['apps_script__asana__access_token']
  },
  box: {
    displayName: 'Box',
    property: 'BOX_ACCESS_TOKEN',
    description: 'OAuth access token',
    aliases: ['apps_script__box__access_token']
  },
  docusign: {
    displayName: 'DocuSign',
    property: 'DOCUSIGN_ACCESS_TOKEN',
    description: 'access token',
    aliases: ['apps_script__docusign__access_token']
  },
  dropbox: {
    displayName: 'Dropbox',
    property: 'DROPBOX_ACCESS_TOKEN',
    description: 'OAuth access token',
    aliases: ['apps_script__dropbox__access_token']
  },
  github: {
    displayName: 'GitHub',
    property: 'GITHUB_ACCESS_TOKEN',
    description: 'access token',
    aliases: ['apps_script__github__access_token']
  },
  'google-admin': {
    displayName: 'Google Admin',
    property: 'GOOGLE_ADMIN_ACCESS_TOKEN',
    description: 'access token',
    aliases: ['apps_script__google_admin__access_token']
  },
  jira: {
    displayName: 'Jira',
    property: 'JIRA_API_TOKEN',
    description: 'API token',
    aliases: ['apps_script__jira__api_token']
  },
  notion: {
    displayName: 'Notion',
    property: 'NOTION_ACCESS_TOKEN',
    description: 'integration token',
    aliases: ['apps_script__notion__access_token']
  },
  salesforce: {
    displayName: 'Salesforce',
    property: 'SALESFORCE_ACCESS_TOKEN',
    description: 'access token',
    aliases: ['apps_script__salesforce__access_token']
  },
  shopify: {
    displayName: 'Shopify',
    property: 'SHOPIFY_ACCESS_TOKEN',
    description: 'access token',
    aliases: ['apps_script__shopify__access_token']
  },
  slack: {
    displayName: 'Slack',
    property: 'SLACK_BOT_TOKEN',
    description: 'bot token',
    aliases: ['SLACK_ACCESS_TOKEN', 'apps_script__slack__bot_token']
  },
  square: {
    displayName: 'Square',
    property: 'SQUARE_ACCESS_TOKEN',
    description: 'access token',
    aliases: ['apps_script__square__access_token']
  },
  stripe: {
    displayName: 'Stripe',
    property: 'STRIPE_SECRET_KEY',
    description: 'secret key',
    aliases: ['apps_script__stripe__secret_key']
  },
  trello: {
    displayName: 'Trello',
    property: 'TRELLO_TOKEN',
    description: 'OAuth token',
    aliases: ['apps_script__trello__token']
  },
  twilio: {
    displayName: 'Twilio',
    property: 'TWILIO_AUTH_TOKEN',
    description: 'auth token',
    aliases: ['apps_script__twilio__auth_token']
  },
  typeform: {
    displayName: 'Typeform',
    property: 'TYPEFORM_ACCESS_TOKEN',
    description: 'access token',
    aliases: ['apps_script__typeform__access_token']
  }
};
var __SECRET_HELPER_OVERRIDES = __mergeSecretHelperOverrides(
  __SECRET_HELPER_DEFAULT_OVERRIDES,
  typeof SECRET_HELPER_OVERRIDES !== 'undefined' && SECRET_HELPER_OVERRIDES ? SECRET_HELPER_OVERRIDES : {}
);
var __SECRET_VAULT_EXPORT_CACHE = null;
var __SECRET_VAULT_EXPORT_PARSED = false;
var __APPS_SCRIPT_SECRET_PREFIX = 'AS1.';
var __APPS_SCRIPT_SECRET_STREAM_INFO_BYTES = null;
var __APPS_SCRIPT_SECRET_METADATA_INFO_BYTES = null;

function __coerceSecretArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(function (item) {
      return typeof item === 'string' && item.trim().length > 0;
    });
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

function __cloneSecretOverrideEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return {};
  }
  var clone = {};
  if (entry.aliases !== undefined) {
    var aliases = __coerceSecretArray(entry.aliases);
    if (aliases.length > 0) {
      clone.aliases = aliases.slice();
    }
  }
  for (var key in entry) {
    if (!Object.prototype.hasOwnProperty.call(entry, key) || key === 'aliases') {
      continue;
    }
    clone[key] = entry[key];
  }
  return clone;
}

function __mergeSecretOverrideEntry(baseEntry, overrideEntry) {
  var merged = __cloneSecretOverrideEntry(baseEntry);
  if (!overrideEntry || typeof overrideEntry !== 'object') {
    return merged;
  }
  if (overrideEntry.aliases !== undefined) {
    var existing = merged.aliases ? merged.aliases.slice() : [];
    var additions = __coerceSecretArray(overrideEntry.aliases);
    for (var i = 0; i < additions.length; i++) {
      var alias = additions[i];
      if (existing.indexOf(alias) === -1) {
        existing.push(alias);
      }
    }
    if (existing.length > 0) {
      merged.aliases = existing;
    } else {
      delete merged.aliases;
    }
  }
  for (var key in overrideEntry) {
    if (!Object.prototype.hasOwnProperty.call(overrideEntry, key) || key === 'aliases') {
      continue;
    }
    merged[key] = overrideEntry[key];
  }
  return merged;
}

function __mergeSecretHelperOverrides(baseOverrides, extraOverrides) {
  var result = { defaults: {}, connectors: {} };

  if (baseOverrides && baseOverrides.defaults) {
    for (var baseDefaultKey in baseOverrides.defaults) {
      if (!Object.prototype.hasOwnProperty.call(baseOverrides.defaults, baseDefaultKey)) {
        continue;
      }
      result.defaults[baseDefaultKey] = __cloneSecretOverrideEntry(baseOverrides.defaults[baseDefaultKey]);
    }
  }

  if (baseOverrides && baseOverrides.connectors) {
    for (var baseConnectorKey in baseOverrides.connectors) {
      if (!Object.prototype.hasOwnProperty.call(baseOverrides.connectors, baseConnectorKey)) {
        continue;
      }
      var baseConnectorOverrides = baseOverrides.connectors[baseConnectorKey];
      var connectorClone = {};
      for (var baseProperty in baseConnectorOverrides) {
        if (!Object.prototype.hasOwnProperty.call(baseConnectorOverrides, baseProperty)) {
          continue;
        }
        connectorClone[baseProperty] = __cloneSecretOverrideEntry(baseConnectorOverrides[baseProperty]);
      }
      result.connectors[baseConnectorKey] = connectorClone;
    }
  }

  if (extraOverrides && extraOverrides.defaults) {
    for (var extraDefaultKey in extraOverrides.defaults) {
      if (!Object.prototype.hasOwnProperty.call(extraOverrides.defaults, extraDefaultKey)) {
        continue;
      }
      result.defaults[extraDefaultKey] = __mergeSecretOverrideEntry(
        result.defaults[extraDefaultKey],
        extraOverrides.defaults[extraDefaultKey]
      );
    }
  }

  if (extraOverrides && extraOverrides.connectors) {
    for (var extraConnectorKey in extraOverrides.connectors) {
      if (!Object.prototype.hasOwnProperty.call(extraOverrides.connectors, extraConnectorKey)) {
        continue;
      }
      var extraConnectorOverrides = extraOverrides.connectors[extraConnectorKey];
      if (!result.connectors[extraConnectorKey]) {
        result.connectors[extraConnectorKey] = {};
      }
      for (var extraProperty in extraConnectorOverrides) {
        if (!Object.prototype.hasOwnProperty.call(extraConnectorOverrides, extraProperty)) {
          continue;
        }
        result.connectors[extraConnectorKey][extraProperty] = __mergeSecretOverrideEntry(
          result.connectors[extraConnectorKey][extraProperty],
          extraConnectorOverrides[extraProperty]
        );
      }
    }
  }

  if (baseOverrides) {
    for (var baseKey in baseOverrides) {
      if (!Object.prototype.hasOwnProperty.call(baseOverrides, baseKey)) {
        continue;
      }
      if (baseKey === 'defaults' || baseKey === 'connectors') {
        continue;
      }
      result[baseKey] = baseOverrides[baseKey];
    }
  }

  if (extraOverrides) {
    for (var extraKey in extraOverrides) {
      if (!Object.prototype.hasOwnProperty.call(extraOverrides, extraKey)) {
        continue;
      }
      if (extraKey === 'defaults' || extraKey === 'connectors') {
        continue;
      }
      result[extraKey] = extraOverrides[extraKey];
    }
  }

  return result;
}

function __loadVaultExports() {
  if (__SECRET_VAULT_EXPORT_PARSED) {
    return __SECRET_VAULT_EXPORT_CACHE;
  }
  __SECRET_VAULT_EXPORT_PARSED = true;

  var scriptProps = PropertiesService.getScriptProperties();
  var raw =
    scriptProps.getProperty('__VAULT_EXPORTS__') ||
    scriptProps.getProperty('VAULT_EXPORTS_JSON') ||
    scriptProps.getProperty('VAULT_EXPORTS');

  if (!raw) {
    __SECRET_VAULT_EXPORT_CACHE = {};
    return __SECRET_VAULT_EXPORT_CACHE;
  }

  try {
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.secrets && typeof parsed.secrets === 'object') {
        __SECRET_VAULT_EXPORT_CACHE = parsed.secrets;
      } else {
        __SECRET_VAULT_EXPORT_CACHE = parsed;
      }
    } else {
      __SECRET_VAULT_EXPORT_CACHE = {};
    }
  } catch (error) {
    logWarn('vault_exports_parse_failed', { message: error && error.message ? error.message : String(error) });
    __SECRET_VAULT_EXPORT_CACHE = {};
  }

  return __SECRET_VAULT_EXPORT_CACHE;
}

function __stringToBytes(value) {
  return Utilities.newBlob(value || '', 'text/plain').getBytes();
}

function __ensureSecretConstants() {
  if (!__APPS_SCRIPT_SECRET_STREAM_INFO_BYTES) {
    __APPS_SCRIPT_SECRET_STREAM_INFO_BYTES = __stringToBytes('apps-script-secret-stream-v1');
  }
  if (!__APPS_SCRIPT_SECRET_METADATA_INFO_BYTES) {
    __APPS_SCRIPT_SECRET_METADATA_INFO_BYTES = __stringToBytes('apps-script-secret-metadata-v1');
  }
}

function __concatByteArrays(chunks) {
  var total = 0;
  for (var i = 0; i < chunks.length; i++) {
    var chunk = chunks[i];
    if (chunk && chunk.length) {
      total += chunk.length;
    }
  }
  var result = new Array(total);
  var offset = 0;
  for (var j = 0; j < chunks.length; j++) {
    var segment = chunks[j];
    if (!segment) {
      continue;
    }
    for (var k = 0; k < segment.length; k++) {
      result[offset++] = segment[k];
    }
  }
  return result;
}

function __numberToUint32Bytes(value) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function __bytesToHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var piece = (bytes[i] & 0xff).toString(16);
    if (piece.length < 2) {
      piece = '0' + piece;
    }
    hex += piece;
  }
  return hex;
}

function __bytesToString(bytes) {
  return Utilities.newBlob(bytes, 'application/octet-stream').getDataAsString('utf-8');
}

function __constantTimeEqualsHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  var result = 0;
  for (var i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function __deriveSecretKeystream(sharedKeyBytes, ivBytes, length) {
  __ensureSecretConstants();
  var blockSize = 32;
  var blocks = Math.ceil(length / blockSize);
  var output = new Array(blocks * blockSize);

  for (var i = 0; i < blocks; i++) {
    var counterBytes = __numberToUint32Bytes(i);
    var digest = Utilities.computeHmacSha256(
      __concatByteArrays([ivBytes, counterBytes, __APPS_SCRIPT_SECRET_STREAM_INFO_BYTES]),
      sharedKeyBytes
    );
    for (var j = 0; j < digest.length; j++) {
      output[i * blockSize + j] = digest[j];
    }
  }

  output.length = length;
  return output;
}

function __decodeAppsScriptSecret(value) {
  if (typeof value !== 'string' || value.indexOf(__APPS_SCRIPT_SECRET_PREFIX) !== 0) {
    return null;
  }

  var encoded = value.substring(__APPS_SCRIPT_SECRET_PREFIX.length);
  var tokenBytes = Utilities.base64Decode(encoded);
  var tokenJson = __bytesToString(tokenBytes);
  var token;

  try {
    token = JSON.parse(tokenJson);
  } catch (error) {
    throw new Error('Failed to parse sealed credential token: ' + error);
  }

  if (!token || typeof token !== 'object' || token.version !== 1) {
    throw new Error('Unrecognized sealed credential token format.');
  }

  var now = Date.now();
  if (typeof token.expiresAt === 'number' && now > token.expiresAt) {
    throw new Error('Credential token for ' + (token.purpose || 'credential') + ' has expired.');
  }

  var sharedKeyBytes = Utilities.base64Decode(token.sharedKey);
  var ivBytes = Utilities.base64Decode(token.iv);
  var ciphertextBytes = Utilities.base64Decode(token.ciphertext);

  __ensureSecretConstants();
  var macInput = __concatByteArrays([
    __APPS_SCRIPT_SECRET_METADATA_INFO_BYTES,
    ivBytes,
    ciphertextBytes,
    __stringToBytes(String(token.issuedAt)),
    __stringToBytes(String(token.expiresAt)),
    __stringToBytes(token.purpose || ''),
  ]);

  var macBytes = Utilities.computeHmacSha256(macInput, sharedKeyBytes);
  var macHex = __bytesToHex(macBytes);
  if (!__constantTimeEqualsHex(macHex, token.hmac)) {
    throw new Error('Credential token integrity check failed for ' + (token.purpose || 'credential') + '.');
  }

  var keystream = __deriveSecretKeystream(sharedKeyBytes, ivBytes, ciphertextBytes.length);
  var plaintextBytes = new Array(ciphertextBytes.length);
  for (var i = 0; i < ciphertextBytes.length; i++) {
    plaintextBytes[i] = ciphertextBytes[i] ^ keystream[i];
  }

  var payloadString = __bytesToString(plaintextBytes);
  var sealedPayload;
  try {
    sealedPayload = JSON.parse(payloadString);
  } catch (error) {
    throw new Error('Failed to decode sealed credential payload: ' + error);
  }

  if (
    !sealedPayload ||
    typeof sealedPayload !== 'object' ||
    sealedPayload.issuedAt !== token.issuedAt ||
    sealedPayload.expiresAt !== token.expiresAt ||
    (sealedPayload.purpose || null) !== (token.purpose || null)
  ) {
    throw new Error('Credential token metadata mismatch for ' + (token.purpose || 'credential') + '.');
  }

  return {
    payload: sealedPayload.payload,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt,
    purpose: token.purpose || null,
  };
}

function getSecret(propertyName, opts) {
  var options = opts || {};
  var key = typeof propertyName === 'string' ? propertyName.trim() : '';

  if (!key) {
    throw new Error('getSecret requires a propertyName');
  }

  var connectorKey = options.connectorKey || options.connector || null;
  if (!connectorKey) {
    var normalizedKey = key.replace(/^_+/, '');
    var underscoreIndex = normalizedKey.indexOf('_');
    if (underscoreIndex > 0) {
      connectorKey = normalizedKey.substring(0, underscoreIndex).toLowerCase();
    }
  }
  var candidates = [];
  var seen = {};

  function pushCandidate(name) {
    if (!name || typeof name !== 'string') {
      return;
    }
    var trimmed = name.trim();
    if (!trimmed || seen[trimmed]) {
      return;
    }
    seen[trimmed] = true;
    candidates.push(trimmed);
  }

  pushCandidate(key);

  var defaultOverrides = (__SECRET_HELPER_OVERRIDES.defaults && __SECRET_HELPER_OVERRIDES.defaults[key]) || null;
  var connectorOverrides =
    (connectorKey &&
      __SECRET_HELPER_OVERRIDES.connectors &&
      __SECRET_HELPER_OVERRIDES.connectors[connectorKey] &&
      __SECRET_HELPER_OVERRIDES.connectors[connectorKey][key]) ||
    null;

  __coerceSecretArray(defaultOverrides && defaultOverrides.aliases).forEach(pushCandidate);
  __coerceSecretArray(connectorOverrides && connectorOverrides.aliases).forEach(pushCandidate);
  __coerceSecretArray(options.aliases || options.alias).forEach(pushCandidate);

  if (defaultOverrides && defaultOverrides.mapTo) {
    pushCandidate(defaultOverrides.mapTo);
  }
  if (connectorOverrides && connectorOverrides.mapTo) {
    pushCandidate(connectorOverrides.mapTo);
  }
  if (options.mapTo) {
    pushCandidate(options.mapTo);
  }

  var scriptProps = PropertiesService.getScriptProperties();
  var resolvedKey = null;
  var value = null;
  var source = null;

  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    var candidateValue = scriptProps.getProperty(candidate);
    if (candidateValue !== null && candidateValue !== undefined && String(candidateValue).trim() !== '') {
      resolvedKey = candidate;
      value = candidateValue;
      source = 'script_properties';
      break;
    }
  }

  if (value === null) {
    var vaultSecrets = __loadVaultExports();
    if (vaultSecrets && typeof vaultSecrets === 'object') {
      for (var j = 0; j < candidates.length; j++) {
        var vaultKey = candidates[j];
        if (vaultSecrets.hasOwnProperty(vaultKey) && vaultSecrets[vaultKey] !== undefined && vaultSecrets[vaultKey] !== null) {
          resolvedKey = vaultKey;
          value = String(vaultSecrets[vaultKey]);
          source = 'vault_exports';
          break;
        }
      }
    }
  }

  if (value === null && defaultOverrides && defaultOverrides.defaultValue !== undefined) {
    value = defaultOverrides.defaultValue;
    source = 'default_override';
    resolvedKey = key;
  }

  if (value === null && connectorOverrides && connectorOverrides.defaultValue !== undefined) {
    value = connectorOverrides.defaultValue;
    source = 'connector_override';
    resolvedKey = key;
  }

  if (value === null && options.defaultValue !== undefined) {
    value = options.defaultValue;
    source = 'default_option';
    resolvedKey = key;
  }

  if (value === null || value === undefined || String(value).trim() === '') {
    logError('secret_missing', {
      property: key,
      connectorKey: connectorKey || null,
      triedKeys: candidates
    });
    throw new Error('Missing required secret "' + key + '"');
  }

  if (options.logResolved) {
    logInfo('secret_resolved', {
      property: key,
      connectorKey: connectorKey || null,
      resolvedKey: resolvedKey,
      source: source
    });
  }

  if (typeof value === 'string') {
    var sealed = __decodeAppsScriptSecret(value);
    if (sealed) {
      if (options.logResolved) {
        logInfo('sealed_secret_validated', {
          property: key,
          connector: connectorKey || null,
          purpose: sealed.purpose,
          expiresAt: new Date(sealed.expiresAt).toISOString(),
        });
      }
      value = sealed.payload;
    }
  }

  return value;
}

function requireOAuthToken(connectorKey, opts) {
  var options = opts || {};
  var key = typeof connectorKey === 'string' ? connectorKey.trim().toLowerCase() : '';

  if (!key) {
    throw new Error('requireOAuthToken requires a connectorKey');
  }

  var metadata = __CONNECTOR_OAUTH_TOKEN_METADATA[key];
  if (!metadata) {
    throw new Error('requireOAuthToken is not configured for connector "' + key + '"');
  }

  var scopes = __coerceSecretArray(options.scopes);

  try {
    return getSecret(metadata.property, { connectorKey: key });
  } catch (error) {
    var message = error && error.message ? String(error.message) : '';
    if (message.indexOf('Missing required secret') === 0) {
      var requirement = metadata.description || 'OAuth token';
      var article = 'a';
      if (requirement && /^[aeiou]/i.test(requirement)) {
        article = 'an';
      }
      var aliasList = __coerceSecretArray(metadata.aliases);
      var aliasText = aliasList.length > 0 ? ' (aliases: ' + aliasList.join(', ') + ')' : '';
      var scopeText = scopes.length > 0 ? ' Required scopes: ' + scopes.join(', ') + '.' : '';
      throw new Error(
        metadata.displayName +
          ' requires ' +
          article +
          ' ' +
          requirement +
          '. Configure ' +
          metadata.property +
          aliasText +
          ' in Script Properties.' +
          scopeText
      );
    }
    throw error;
  }
}

function withRetries(fn, options) {
  var config = options || {};
  var attempts = config.attempts || config.maxAttempts || __HTTP_RETRY_DEFAULTS.maxAttempts;
  var backoffMs = config.backoffMs || config.initialDelayMs || __HTTP_RETRY_DEFAULTS.initialDelayMs;
  var backoffFactor = config.backoffFactor || __HTTP_RETRY_DEFAULTS.backoffFactor;
  var maxDelayMs = config.maxDelayMs || __HTTP_RETRY_DEFAULTS.maxDelayMs;
  var jitter = typeof config.jitter === 'number' ? config.jitter : 0;
  var retryOn = typeof config.retryOn === 'function' ? config.retryOn : null;
  var attempt = 0;
  var delay = backoffMs;

  while (attempt < attempts) {
    try {
      return fn(attempt + 1);
    } catch (error) {
      attempt++;
      var status = error && typeof error.status === 'number' ? error.status : null;
      var headers = error && error.headers ? error.headers : {};
      var normalizedHeaders = __normalizeHeaders(headers);
      var retryAfterMs = __resolveRetryAfterMs(normalizedHeaders['retry-after']);
      var message = error && error.message ? error.message : String(error);
      var shouldRetry = attempt < attempts && (status ? (status === 429 || (status >= 500 && status < 600)) : true);
      var userDelay = null;

      var context = {
        attempt: attempt,
        error: error,
        response: status !== null ? { status: status, headers: headers || {}, body: error.body, text: error.text } : null,
        delayMs: delay,
        retryAfterMs: retryAfterMs
      };

      if (retryOn) {
        try {
          var decision = retryOn(context);
          if (typeof decision === 'boolean') {
            shouldRetry = attempt < attempts && decision;
          } else if (decision && typeof decision === 'object') {
            if (decision.retry !== undefined) {
              shouldRetry = attempt < attempts && !!decision.retry;
            }
            if (decision.delayMs !== undefined) {
              userDelay = Number(decision.delayMs);
              if (isNaN(userDelay)) {
                userDelay = null;
              }
            }
          }
        } catch (retryError) {
          logWarn('http_retry_callback_failed', {
            attempt: attempt,
            message: retryError && retryError.message ? retryError.message : String(retryError)
          });
        }
      }

      if (!shouldRetry || attempt >= attempts) {
        logError('http_retry_exhausted', { attempts: attempt, message: message, status: status });
        throw error;
      }

      var waitMs = userDelay !== null ? userDelay : (retryAfterMs !== null ? retryAfterMs : delay);
      if (typeof waitMs !== 'number' || isNaN(waitMs) || waitMs < 0) {
        waitMs = delay;
      }
      waitMs = Math.min(waitMs, maxDelayMs);

      if (jitter) {
        var jitterRange = waitMs * jitter;
        if (jitterRange > 0) {
          waitMs = Math.min(maxDelayMs, waitMs + Math.floor(Math.random() * jitterRange));
        }
      }

      logWarn('http_retry', { attempt: attempt, delayMs: waitMs, status: status, message: message });
      Utilities.sleep(waitMs);
      delay = Math.min(Math.max(backoffMs, waitMs) * backoffFactor, maxDelayMs);
    }
  }

  throw new Error('withRetries exhausted without executing function');
}

function rateLimitAware(fn, options) {
  var config = options || {};
  var providedRetryOn = typeof config.retryOn === 'function' ? config.retryOn : null;
  var mergedOptions = {};
  for (var key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      mergedOptions[key] = config[key];
    }
  }

  mergedOptions.retryOn = function(context) {
    var headers = {};
    if (context) {
      if (context.response && context.response.headers) {
        headers = context.response.headers;
      } else if (context.error && context.error.headers) {
        headers = context.error.headers;
      }
    }
    var normalizedHeaders = __normalizeHeaders(headers);
    var status = null;
    if (context && context.response && typeof context.response.status === 'number') {
      status = context.response.status;
    } else if (context && context.error && typeof context.error.status === 'number') {
      status = context.error.status;
    }

    var computedDelay = null;

    if (normalizedHeaders['retry-after'] !== undefined) {
      var retryDelay = __resolveRetryAfterMs(normalizedHeaders['retry-after']);
      if (retryDelay !== null) {
        computedDelay = retryDelay;
      }
    }

    var remainingKeys = ['x-ratelimit-remaining', 'x-rate-limit-remaining'];
    for (var i = 0; i < remainingKeys.length; i++) {
      var remainingValue = normalizedHeaders[remainingKeys[i]];
      if (remainingValue === undefined) {
        continue;
      }
      var remaining = Number(String(remainingValue));
      if (!isNaN(remaining) && remaining <= 0) {
        var resetKey = remainingKeys[i] === 'x-ratelimit-remaining' ? 'x-ratelimit-reset' : 'x-rate-limit-reset';
        var resetDelay = __resolveResetDelayMs(normalizedHeaders[resetKey]);
        if (resetDelay !== null) {
          computedDelay = computedDelay === null ? resetDelay : Math.max(computedDelay, resetDelay);
        }
      }
    }

    var result = {};
    if (status === 429 || (status >= 500 && status < 600)) {
      result.retry = true;
    }

    if (computedDelay !== null) {
      result.delayMs = computedDelay;
    }

    if (providedRetryOn) {
      var userDecision = providedRetryOn(context);
      if (typeof userDecision === 'boolean') {
        result.retry = userDecision;
      } else if (userDecision && typeof userDecision === 'object') {
        if (userDecision.retry !== undefined) {
          result.retry = userDecision.retry;
        }
        if (userDecision.delayMs !== undefined) {
          result.delayMs = userDecision.delayMs;
        }
      }
    }

    if (result.delayMs !== undefined && context && typeof context.delayMs === 'number') {
      var numericDelay = Number(result.delayMs);
      if (!isNaN(numericDelay)) {
        result.delayMs = Math.max(numericDelay, context.delayMs);
      }
    }

    return result;
  };

  return withRetries(fn, mergedOptions);
}

function fetchJson(request) {
  var config = request || {};
  if (typeof request === 'string') {
    var legacyOptions = arguments.length > 1 ? (arguments[1] || {}) : {};
    legacyOptions.url = request;
    config = legacyOptions;
  }

  var url = config.url;
  if (!url) {
    throw new Error('fetchJson requires a url');
  }

  var method = config.method || 'GET';
  var headers = config.headers || {};
  var payload = config.payload;
  var contentType = config.contentType || config['contentType'];
  var muteHttpExceptions = config.muteHttpExceptions !== undefined ? config.muteHttpExceptions : true;
  var followRedirects = config.followRedirects;
  var escape = config.escape;
  var start = new Date().getTime();

  var fetchOptions = {
    method: method,
    headers: headers,
    muteHttpExceptions: muteHttpExceptions
  };

  if (typeof payload !== 'undefined') {
    fetchOptions.payload = payload;
  }

  if (typeof contentType !== 'undefined') {
    fetchOptions.contentType = contentType;
  }

  if (typeof followRedirects !== 'undefined') {
    fetchOptions.followRedirects = followRedirects;
  }

  if (typeof escape !== 'undefined') {
    fetchOptions.escape = escape;
  }

  var response = UrlFetchApp.fetch(url, fetchOptions);
  var durationMs = new Date().getTime() - start;
  var status = response.getResponseCode();
  var text = response.getContentText();
  var allHeaders = response.getAllHeaders();
  var normalizedHeaders = __normalizeHeaders(allHeaders);
  var success = status >= 200 && status < 300;

  var logDetails = {
    url: url,
    method: method,
    status: status,
    durationMs: durationMs
  };

  if (!success) {
    logDetails.response = text;
  }

  logStructured(success ? 'INFO' : 'ERROR', success ? 'http_success' : 'http_failure', logDetails);

  var body = text;
  var isJson = false;
  if (normalizedHeaders['content-type'] && normalizedHeaders['content-type'].indexOf('application/json') !== -1) {
    isJson = true;
  }
  if (!isJson && text) {
    var trimmed = text.trim();
    if ((trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}') || (trimmed.charAt(0) === '[' && trimmed.charAt(trimmed.length - 1) === ']')) {
      isJson = true;
    }
  }
  if (isJson) {
    try {
      body = text ? JSON.parse(text) : null;
    } catch (error) {
      logWarn('http_parse_failure', { url: url, message: error && error.message ? error.message : String(error) });
    }
  }

  if (!success) {
    var err = new Error('Request failed with status ' + status);
    err.status = status;
    err.headers = allHeaders;
    err.body = body;
    err.text = text;
    throw err;
  }

  return {
    status: status,
    headers: allHeaders,
    body: body,
    text: text
  };
}
`);
  });
});

describe('REAL_OPS HTTP snippets', () => {
  it('wraps Slack webhook operations with retries and logging', () => {
    expect(REAL_OPS['action.slack:send_message']({})).toMatchInlineSnapshot(`\n"function step_sendSlackMessage(ctx) {\n  const webhookUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');\n  if (!webhookUrl) {\n    logWarn('slack_missing_webhook', { message: 'Slack webhook URL not configured' });\n    return ctx;\n  }\n\n  const message = interpolate('Automated notification', ctx);\n  const channel = '#general';\n\n  const payload = {\n    channel: channel,\n    text: message,\n    username: 'Apps Script Bot'\n  };\n\n  withRetries(() => fetchJson(webhookUrl, {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    payload: JSON.stringify(payload),\n    contentType: 'application/json'\n  }));\n\n  logInfo('slack_message_sent', { channel: channel });\n\n  return ctx;\n}"\n`);
  });

  it('wraps Salesforce lead creation with helpers', () => {
    expect(REAL_OPS['action.salesforce:create_lead']({})).toMatchInlineSnapshot(`\n"function step_createSalesforceLead(ctx) {\n  const accessToken = PropertiesService.getScriptProperties().getProperty('SALESFORCE_ACCESS_TOKEN');\n  const instanceUrl = PropertiesService.getScriptProperties().getProperty('SALESFORCE_INSTANCE_URL');\n\n  if (!accessToken || !instanceUrl) {\n    logWarn('salesforce_missing_credentials', { message: 'Salesforce credentials not configured' });\n    return ctx;\n  }\n\n  const leadData = {\n    FirstName: interpolate('{{first_name}}', ctx),\n    LastName: interpolate('{{last_name}}', ctx),\n    Email: interpolate('{{email}}', ctx),\n    Company: interpolate('{{company}}', ctx)\n  };\n\n  const response = withRetries(() => fetchJson(`${instanceUrl}/services/data/v52.0/sobjects/Lead`, {\n    method: 'POST',\n    headers: {\n      'Authorization': `Bearer ${accessToken}`,\n      'Content-Type': 'application/json'\n    },\n    payload: JSON.stringify(leadData),\n    contentType: 'application/json'\n  }));\n\n  ctx.salesforceLeadId = response.body && response.body.id;\n  logInfo('salesforce_create_lead', { leadId: ctx.salesforceLeadId || null });\n  return ctx;\n}"\n`);
  });
});
