import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function prepareValueForCode(value) {
  return value;
}

function buildHubSpotAction(slug, operationName, config, scopes, bodyLines) {
  const configLiteral = JSON.stringify(prepareValueForCode(config ?? {}));
  const scopesLiteral = JSON.stringify(scopes);

  return `
function step_action_hubspot_${slug}(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const baseUrl = 'https://api.hubapi.com';
  const accessToken = requireOAuthToken('hubspot', { scopes: ${scopesLiteral} });
  const rateConfig = { attempts: 5, initialDelayMs: 500, maxDelayMs: 8000, jitter: 0.2 };

  function resolveValue(value, opts) {
    opts = opts || {};
    if (value === null || value === undefined) {
      if (opts.required) {
        throw new Error('${operationName} requires ' + (opts.label || 'a value') + '.');
      }
      return opts.allowEmpty ? '' : undefined;
    }
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (!trimmed) {
        if (opts.required && !opts.allowEmpty) {
          throw new Error('${operationName} requires ' + (opts.label || 'a value') + '.');
        }
        return opts.allowEmpty ? '' : undefined;
      }
      var resolved = interpolate(trimmed, ctx);
      if (!resolved && opts.required && !opts.allowEmpty) {
        throw new Error('${operationName} requires ' + (opts.label || 'a value') + '.');
      }
      if (opts.transform === 'number') {
        var num = Number(resolved);
        if (isNaN(num)) {
          throw new Error((opts.label || 'Value') + ' must be numeric.');
        }
        return num;
      }
      return resolved;
    }
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) {
        var entry = resolveValue(value[i], opts.items || {});
        if (entry === undefined || entry === null) {
          continue;
        }
        if (typeof entry === 'string') {
          if (!entry && !(opts.items && opts.items.allowEmpty)) {
            continue;
          }
        } else if (Array.isArray(entry) && entry.length === 0 && !(opts.items && opts.items.keepEmptyArrays)) {
          continue;
        } else if (typeof entry === 'object' && Object.keys(entry).length === 0 && !(opts.items && opts.items.keepEmptyObjects)) {
          continue;
        }
        arr.push(entry);
      }
      if (opts.required && arr.length === 0) {
        throw new Error('${operationName} requires ' + (opts.label || 'a value') + '.');
      }
      return arr;
    }
    if (typeof value === 'object') {
      var obj = {};
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        var resolved = resolveValue(value[key], (opts.properties && opts.properties[key]) || {});
        if (resolved === undefined || resolved === null) {
          continue;
        }
        if (typeof resolved === 'string') {
          if (!resolved && !(opts.properties && opts.properties[key] && opts.properties[key].allowEmpty)) {
            continue;
          }
          obj[key] = resolved;
        } else if (Array.isArray(resolved)) {
          if (resolved.length === 0 && !(opts.properties && opts.properties[key] && opts.properties[key].keepEmptyArrays)) {
            continue;
          }
          obj[key] = resolved;
        } else if (typeof resolved === 'object') {
          if (Object.keys(resolved).length === 0 && !(opts.properties && opts.properties[key] && opts.properties[key].keepEmptyObjects)) {
            continue;
          }
          obj[key] = resolved;
        } else {
          obj[key] = resolved;
        }
      }
      if (opts.required && Object.keys(obj).length === 0) {
        throw new Error('${operationName} requires ' + (opts.label || 'a value') + '.');
      }
      return obj;
    }
    return value;
  }

  function buildProperties(source, skip) {
    var props = {};
    if (!source || typeof source !== 'object') {
      return props;
    }
    var omit = {};
    if (Array.isArray(skip)) {
      for (var i = 0; i < skip.length; i++) {
        omit[skip[i]] = true;
      }
    } else if (skip && typeof skip === 'object') {
      for (var key in skip) {
        if (Object.prototype.hasOwnProperty.call(skip, key)) {
          omit[key] = skip[key];
        }
      }
    }
    for (var key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      if (omit[key]) continue;
      var value = resolveValue(source[key], {});
      if (value === undefined || value === null) continue;
      if (typeof value === 'string') {
        if (!value.trim()) continue;
      } else if (Array.isArray(value) && value.length === 0) {
        continue;
      } else if (typeof value === 'object' && Object.keys(value).length === 0) {
        continue;
      }
      props[key] = value;
    }
    return props;
  }

  function requestOptions(path, method, payload) {
    var request = {
      url: baseUrl + path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json'
      }
    };
    if (payload !== undefined) {
      request.headers['Content-Type'] = 'application/json';
      request.payload = JSON.stringify(payload);
      request.contentType = 'application/json';
    }
    return request;
  }

  function executeRequest(options) {
    try {
      return rateLimitAware(
        function () {
          return fetchJson(options);
        },
        rateConfig
      );
    } catch (error) {
      handleError(error);
    }
  }

  function handleError(error) {
    var status = error && typeof error.status === 'number' ? error.status : null;
    var body = error && error.body ? error.body : null;
    var message = body && body.message ? body.message : (error && error.message ? error.message : 'Unknown HubSpot error');
    var correlationId = null;
    if (body && (body.correlationId || body.requestId || body.traceId)) {
      correlationId = body.correlationId || body.requestId || body.traceId;
    } else if (error && (error.correlationId || error.requestId || error.traceId)) {
      correlationId = error.correlationId || error.requestId || error.traceId;
    }
    var details = [];
    if (body && Array.isArray(body.errors)) {
      for (var i = 0; i < body.errors.length; i++) {
        var entry = body.errors[i];
        if (!entry) continue;
        var summary = [];
        if (entry.errorType || entry.error) {
          summary.push(entry.errorType || entry.error);
        }
        if (entry.field) {
          summary.push(entry.field);
        }
        if (entry.message) {
          summary.push(entry.message);
        }
        if (summary.length) {
          details.push(summary.join(': '));
        }
      }
    }
    if (body && body.category) {
      details.push('Category: ' + body.category);
    }
    if (body && body.subCategory) {
      details.push('Sub-category: ' + body.subCategory);
    }
    if (body && body.context && typeof body.context === 'object') {
      var contextParts = [];
      for (var key in body.context) {
        if (!Object.prototype.hasOwnProperty.call(body.context, key)) continue;
        var value = body.context[key];
        var rendered;
        if (Array.isArray(value)) {
          rendered = value.join(', ');
        } else if (value && typeof value === 'object') {
          rendered = JSON.stringify(value);
        } else {
          rendered = value;
        }
        if (rendered === undefined || rendered === null || rendered === '') {
          continue;
        }
        contextParts.push(key + ': ' + rendered);
      }
      if (contextParts.length) {
        details.push('Context: ' + contextParts.join('; '));
      }
    }
    var infoParts = details.slice();
    if (correlationId) {
      infoParts.push('Correlation ID: ' + correlationId);
    }
    var statusLabel = status ? ' (' + status + ')' : '';
    var suffix = infoParts.length ? ' (' + infoParts.join('; ') + ')' : '';
    logError('hubspot_${slug}_failed', {
      status: status,
      correlationId: correlationId || null,
      message: message,
      errors: details,
      category: body && body.category ? body.category : null,
      context: body && body.context ? body.context : null
    });
    var finalError = error && typeof error === 'object' ? error : new Error(message);
    finalError.message = '${operationName} failed' + statusLabel + ': ' + message + suffix;
    if (typeof finalError.status !== 'number' && status !== null) {
      finalError.status = status;
    }
    if (!finalError.correlationId && correlationId) {
      finalError.correlationId = correlationId;
    }
    if (body && body.category && !finalError.category) {
      finalError.category = body.category;
    }
    if (body && body.context && !finalError.context) {
      finalError.context = body.context;
    }
    finalError.details = finalError.details || {};
    finalError.details.errors = details;
    if (body && body.category) {
      finalError.details.category = body.category;
    }
    if (body && body.context) {
      finalError.details.context = body.context;
    }
    if (correlationId) {
      finalError.details.correlationId = correlationId;
    }
    throw finalError;
  }

${bodyLines.join('\n')}

}
`;
}

const operations = [
  ['create_contact', 'HubSpot create_contact', { email: '{{lead.email}}', firstname: '{{lead.firstName}}', lastname: 'Customer' }, ['crm.objects.contacts.write'], [
    "  var source = config && typeof config.properties === 'object' ? config.properties : config;",
    "  var properties = buildProperties(source, { operation: true });",
    "  if (!properties.email) {",
    "    throw new Error('HubSpot create_contact requires the email field.');",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/contacts', 'POST', { properties: properties }));",
    "  var contact = response && response.body ? response.body : {};",
    "  ctx.hubspotContactId = contact.id || null;",
    "  ctx.hubspotContact = contact;",
    "  logInfo('hubspot_create_contact', { contactId: ctx.hubspotContactId || null });",
    "  return ctx;"
  ]],
  ['update_contact', 'HubSpot update_contact', { contactId: '12345', phone: '{{lead.phone}}' }, ['crm.objects.contacts.write'], [
    "  var source = config && typeof config.properties === 'object' ? config.properties : config;",
    "  var contactId = resolveValue(config.contactId, { required: true, label: 'contactId' });",
    "  var properties = buildProperties(source, { contactId: true, operation: true });",
    "  if (Object.keys(properties).length === 0) {",
    "    throw new Error('HubSpot update_contact requires at least one property to update.');",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/contacts/' + encodeURIComponent(contactId), 'PATCH', { properties: properties }));",
    "  var contact = response && response.body ? response.body : {};",
    "  ctx.hubspotContactId = contact.id || contactId;",
    "  ctx.hubspotContact = contact;",
    "  logInfo('hubspot_update_contact', { contactId: ctx.hubspotContactId || contactId });",
    "  return ctx;"
  ]],
  ['get_contact', 'HubSpot get_contact', { email: '{{lead.email}}', properties: ['firstname', 'lastname'] }, ['crm.objects.contacts.read'], [
    "  var identifier = resolveValue(config.contactId, { allowEmpty: true, label: 'contactId' });",
    "  var queryParts = [];",
    "  if (!identifier) {",
    "    var emailIdentifier = resolveValue(config.email, { required: true, label: 'email' });",
    "    identifier = emailIdentifier;",
    "    queryParts.push('idProperty=email');",
    "  }",
    "  if (config && Array.isArray(config.properties)) {",
    "    for (var i = 0; i < config.properties.length; i++) {",
    "      var propertyName = resolveValue(config.properties[i], {});",
    "      if (propertyName) {",
    "        queryParts.push('properties=' + encodeURIComponent(propertyName));",
    "      }",
    "    }",
    "  }",
    "  var path = '/crm/v3/objects/contacts/' + encodeURIComponent(identifier);",
    "  if (queryParts.length > 0) {",
    "    path += '?' + queryParts.join('&');",
    "  }",
    "  var response = executeRequest(requestOptions(path, 'GET'));",
    "  var contact = response && response.body ? response.body : {};",
    "  ctx.hubspotContactId = contact.id || identifier;",
    "  ctx.hubspotContact = contact;",
    "  logInfo('hubspot_get_contact', { contactId: ctx.hubspotContactId || identifier });",
    "  return ctx;"
  ]],
  ['create_deal', 'HubSpot create_deal', { dealname: 'Q4 Renewal', amount: '15000' }, ['crm.objects.deals.write'], [
    "  var source = config && typeof config.properties === 'object' ? config.properties : config;",
    "  var properties = buildProperties(source, { operation: true });",
    "  if (!properties.dealname) {",
    "    throw new Error('HubSpot create_deal requires the dealname field.');",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/deals', 'POST', { properties: properties }));",
    "  var deal = response && response.body ? response.body : {};",
    "  ctx.hubspotDealId = deal.id || null;",
    "  ctx.hubspotDeal = deal;",
    "  logInfo('hubspot_create_deal', { dealId: ctx.hubspotDealId || null });",
    "  return ctx;"
  ]],
  ['update_deal', 'HubSpot update_deal', { dealId: '98765', dealstage: 'closedwon', amount: '17500' }, ['crm.objects.deals.write'], [
    "  var source = config && typeof config.properties === 'object' ? config.properties : config;",
    "  var dealId = resolveValue(config.dealId, { required: true, label: 'dealId' });",
    "  var properties = buildProperties(source, { dealId: true, operation: true });",
    "  if (Object.keys(properties).length === 0) {",
    "    throw new Error('HubSpot update_deal requires at least one property to update.');",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/deals/' + encodeURIComponent(dealId), 'PATCH', { properties: properties }));",
    "  var deal = response && response.body ? response.body : {};",
    "  ctx.hubspotDealId = deal.id || dealId;",
    "  ctx.hubspotDeal = deal;",
    "  logInfo('hubspot_update_deal', { dealId: ctx.hubspotDealId || dealId });",
    "  return ctx;"
  ]],
  ['update_deal_stage', 'HubSpot update_deal_stage', { dealId: '98765', properties: { dealstage: 'presentationscheduled' } }, ['crm.objects.deals.write'], [
    "  var dealId = resolveValue(config.dealId, { required: true, label: 'dealId' });",
    "  var propertySource = config && typeof config.properties === 'object' ? config.properties : {};",
    "  var properties = buildProperties(propertySource, {});",
    "  if (Object.keys(properties).length === 0) {",
    "    throw new Error('HubSpot update_deal_stage requires properties for the update.');",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/deals/' + encodeURIComponent(dealId), 'PATCH', { properties: properties }));",
    "  var deal = response && response.body ? response.body : {};",
    "  ctx.hubspotDealId = deal.id || dealId;",
    "  ctx.hubspotDeal = deal;",
    "  logInfo('hubspot_update_deal_stage', { dealId: ctx.hubspotDealId || dealId });",
    "  return ctx;"
  ]],
  ['get_deal', 'HubSpot get_deal', { dealId: '98765', properties: ['dealname', 'amount'] }, ['crm.objects.deals.read'], [
    "  var dealId = resolveValue(config.dealId, { required: true, label: 'dealId' });",
    "  var queryParts = [];",
    "  if (config && Array.isArray(config.properties)) {",
    "    for (var i = 0; i < config.properties.length; i++) {",
    "      var propertyName = resolveValue(config.properties[i], {});",
    "      if (propertyName) {",
    "        queryParts.push('properties=' + encodeURIComponent(propertyName));",
    "      }",
    "    }",
    "  }",
    "  var path = '/crm/v3/objects/deals/' + encodeURIComponent(dealId);",
    "  if (queryParts.length > 0) {",
    "    path += '?' + queryParts.join('&');",
    "  }",
    "  var response = executeRequest(requestOptions(path, 'GET'));",
    "  var deal = response && response.body ? response.body : {};",
    "  ctx.hubspotDealId = deal.id || dealId;",
    "  ctx.hubspotDeal = deal;",
    "  logInfo('hubspot_get_deal', { dealId: ctx.hubspotDealId || dealId });",
    "  return ctx;"
  ]],
  ['create_company', 'HubSpot create_company', { name: 'Acme Corp', domain: 'acme.example.com' }, ['crm.objects.companies.write'], [
    "  var source = config && typeof config.properties === 'object' ? config.properties : config;",
    "  var properties = buildProperties(source, { operation: true });",
    "  if (!properties.name && !properties.domain) {",
    "    throw new Error('HubSpot create_company requires at least the name or domain field.');",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/companies', 'POST', { properties: properties }));",
    "  var company = response && response.body ? response.body : {};",
    "  ctx.hubspotCompanyId = company.id || null;",
    "  ctx.hubspotCompany = company;",
    "  logInfo('hubspot_create_company', { companyId: ctx.hubspotCompanyId || null });",
    "  return ctx;"
  ]],
  ['create_ticket', 'HubSpot create_ticket', { subject: 'Onboarding help', content: 'Customer requested assistance.' }, ['crm.objects.tickets.write'], [
    "  var source = config && typeof config.properties === 'object' ? config.properties : config;",
    "  var properties = buildProperties(source, { operation: true });",
    "  if (!properties.subject) {",
    "    throw new Error('HubSpot create_ticket requires the subject field.');",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/tickets', 'POST', { properties: properties }));",
    "  var ticket = response && response.body ? response.body : {};",
    "  ctx.hubspotTicketId = ticket.id || null;",
    "  ctx.hubspotTicket = ticket;",
    "  logInfo('hubspot_create_ticket', { ticketId: ctx.hubspotTicketId || null });",
    "  return ctx;"
  ]],
  ['create_note', 'HubSpot create_note', {
    hs_note_body: 'Follow up with {{lead.owner}}',
    associations: [
      {
        to: { id: '12345', type: 'contact' },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 280
          }
        ]
      }
    ]
  }, ['crm.objects.notes.write'], [
    "  var propertySource = config && typeof config.properties === 'object' ? config.properties : config;",
    "  var properties = buildProperties(propertySource, { associations: true, operation: true });",
    "  if (!properties.hs_note_body) {",
    "    throw new Error('HubSpot create_note requires the hs_note_body field.');",
    "  }",
    "  var associations = [];",
    "  if (config && Array.isArray(config.associations)) {",
    "    associations = resolveValue(config.associations, { items: {} }) || [];",
    "  }",
    "  var payload = { properties: properties };",
    "  if (associations && associations.length) {",
    "    payload.associations = associations;",
    "  }",
    "  var response = executeRequest(requestOptions('/crm/v3/objects/notes', 'POST', payload));",
    "  var note = response && response.body ? response.body : {};",
    "  ctx.hubspotNoteId = note.id || null;",
    "  ctx.hubspotNote = note;",
    "  logInfo('hubspot_create_note', { noteId: ctx.hubspotNoteId || null });",
    "  return ctx;"
  ]]
];

const snapshotLines = [];
for (const [slug, name, config, scopes, body] of operations) {
  const source = buildHubSpotAction(slug, name, config, scopes, body);
  const escaped = source.replace(/`/g, '\\`');
  snapshotLines.push(`exports[\`Apps Script HubSpot REAL_OPS builds action.hubspot:${slug} 1\`] = \`${escaped}\`;\n`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const snapshotPath = join(__dirname, '../server/workflow/__tests__/__snapshots__/apps-script.hubspot.test.ts.snap');
writeFileSync(snapshotPath, snapshotLines.join('\n'));
