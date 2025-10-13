import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileToAppsScript } from '../compile-to-appsscript';
import type { WorkflowGraph } from '../../../common/workflow-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'apps-script');

function loadWorkflowGraph(name: string): WorkflowGraph {
  const workflowPath = path.join(fixturesDir, `${name}.workflow.json`);
  const raw = readFileSync(workflowPath, 'utf-8');
  return JSON.parse(raw) as WorkflowGraph;
}

describe('Tier-1 Shopify Apps Script snapshot', () => {
  it('generates create_order handler with validation, rate limiting, and structured logs', () => {
    const graph = loadWorkflowGraph('tier-1-commerce');
    const result = compileToAppsScript(graph);

    expect(result.workflowId).toBe(graph.id);

    const codeFile = result.files.find(file => file.path === 'Code.gs');
    expect(codeFile, 'compiled output should include Code.gs').toBeDefined();

    const match = codeFile!.content.match(/function step_createShopifyOrder\(ctx\) {[\s\S]+?\n}\n/);
    expect(match, 'Shopify create_order handler should be generated').not.toBeNull();

    expect(match![0]).toMatchInlineSnapshot(`
function step_createShopifyOrder(ctx) {
  const accessToken = getSecret('SHOPIFY_ACCESS_TOKEN', { connectorKey: 'shopify' });
  const shopDomain = getSecret('SHOPIFY_SHOP_DOMAIN', { connectorKey: 'shopify' });

  if (!accessToken || !shopDomain) {
    logWarn('shopify_missing_credentials', { message: 'Shopify credentials not configured' });
    return ctx;
  }

  const apiVersion = '2024-01';

  function interpolateValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return interpolate(value, ctx);
    }
    if (Array.isArray(value)) {
      const result = [];
      for (let i = 0; i < value.length; i++) {
        result.push(interpolateValue(value[i]));
      }
      return result;
    }
    if (typeof value === 'object') {
      const result = {};
      for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          continue;
        }
        result[key] = interpolateValue(value[key]);
      }
      return result;
    }
    return value;
  }

  function pickFirst(source, keys) {
    if (!source || typeof source !== 'object') {
      return undefined;
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null) {
        return source[key];
      }
    }
    return undefined;
  }

  function toTrimmedString(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  function toPositiveInteger(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numeric = Number(value);
    if (!isFinite(numeric) || numeric <= 0) {
      return null;
    }
    return Math.floor(numeric);
  }

  function toCurrencyString(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }
    const numeric = Number(normalized.replace(/[^0-9.-]/g, ''));
    if (!isFinite(numeric)) {
      return null;
    }
    return numeric.toFixed(2);
  }

  const manifestLineItems = interpolateValue([{ "title": "{{values.product_name}} preorder", "price": "{{values.unit_price}}", "quantity": "{{values.quantity}}", "sku": "{{values.sku}}" }]);
  const fallbackLineItemConfig = interpolateValue({ "title": "{{values.product_name}} preorder", "price": "{{values.unit_price}}", "quantity": "{{values.quantity}}", "variant_id": "", "sku": "{{values.sku}}" });
  const normalizedLineItems = [];

  function appendLineItem(entry, indexLabel) {
    if (!entry || typeof entry !== 'object') {
      logWarn('shopify_line_item_skipped', { index: indexLabel, reason: 'Line item must be an object' });
      return;
    }

    const normalized = {};
    const variantIdRaw = pickFirst(entry, ['variant_id', 'variantId']);
    const productIdRaw = pickFirst(entry, ['product_id', 'productId']);
    const titleRaw = pickFirst(entry, ['title', 'name']);
    const priceRaw = pickFirst(entry, ['price', 'amount']);
    const quantityRaw = pickFirst(entry, ['quantity', 'qty', 'count']);

    const quantity = toPositiveInteger(quantityRaw !== undefined ? quantityRaw : 1);
    if (quantity === null) {
      logWarn('shopify_line_item_skipped', { index: indexLabel, reason: 'Quantity must be a positive number', quantity: quantityRaw });
      return;
    }
    normalized.quantity = quantity;

    if (variantIdRaw !== undefined && variantIdRaw !== null) {
      const variantId = toTrimmedString(variantIdRaw);
      if (variantId) {
        normalized.variant_id = variantId;
      }
    }

    if (productIdRaw !== undefined && productIdRaw !== null) {
      const productId = toTrimmedString(productIdRaw);
      if (productId) {
        normalized.product_id = productId;
      }
    }

    const title = toTrimmedString(titleRaw);
    if (title) {
      normalized.title = title;
    }

    const price = toCurrencyString(priceRaw);
    if (price) {
      normalized.price = price;
    }

    if (!normalized.variant_id) {
      if (!normalized.title) {
        logWarn('shopify_line_item_skipped', { index: indexLabel, reason: 'Line item requires a title when variant_id is omitted' });
        return;
      }
      if (!normalized.price) {
        logWarn('shopify_line_item_skipped', { index: indexLabel, reason: 'Line item requires a numeric price when variant_id is omitted', title: normalized.title });
        return;
      }
    }

    const skuRaw = pickFirst(entry, ['sku']);
    const requiresShippingRaw = pickFirst(entry, ['requires_shipping', 'requiresShipping']);
    const taxableRaw = pickFirst(entry, ['taxable']);
    const fulfillmentServiceRaw = pickFirst(entry, ['fulfillment_service', 'fulfillmentService']);
    const compareAtPriceRaw = pickFirst(entry, ['compare_at_price', 'compareAtPrice']);

    if (skuRaw !== undefined && skuRaw !== null) {
      const sku = toTrimmedString(skuRaw);
      if (sku) {
        normalized.sku = sku;
      }
    }

    if (requiresShippingRaw !== undefined && requiresShippingRaw !== null) {
      normalized.requires_shipping = Boolean(requiresShippingRaw);
    }

    if (taxableRaw !== undefined && taxableRaw !== null) {
      normalized.taxable = Boolean(taxableRaw);
    }

    if (fulfillmentServiceRaw !== undefined && fulfillmentServiceRaw !== null) {
      const fulfillmentService = toTrimmedString(fulfillmentServiceRaw);
      if (fulfillmentService) {
        normalized.fulfillment_service = fulfillmentService;
      }
    }

    if (compareAtPriceRaw !== undefined && compareAtPriceRaw !== null) {
      const compareAtPrice = toCurrencyString(compareAtPriceRaw);
      if (compareAtPrice) {
        normalized.compare_at_price = compareAtPrice;
      }
    }

    if (entry.properties && typeof entry.properties === 'object') {
      const interpolatedProperties = interpolateValue(entry.properties);
      if (interpolatedProperties && typeof interpolatedProperties === 'object') {
        normalized.properties = interpolatedProperties;
      }
    }

    normalizedLineItems.push(normalized);
  }

  if (Array.isArray(manifestLineItems)) {
    for (let i = 0; i < manifestLineItems.length; i++) {
      appendLineItem(manifestLineItems[i], i);
    }
  } else if (manifestLineItems) {
    appendLineItem(manifestLineItems, 'config');
  }

  if (normalizedLineItems.length === 0 && fallbackLineItemConfig) {
    appendLineItem(fallbackLineItemConfig, 'fallback');
  }

  if (normalizedLineItems.length === 0) {
    throw new Error('Shopify create_order requires at least one valid line item with a positive quantity. Provide a variant_id or include both title and price.');
  }

  const manifestCustomer = interpolateValue({ "email": "{{values.customer_email}}", "first_name": "{{values.customer_first_name}}", "last_name": "{{values.customer_last_name}}", "phone": "{{values.customer_phone}}" });
  const fallbackCustomer = interpolateValue({ "id": "", "email": "{{values.customer_email}}", "first_name": "{{values.customer_first_name}}", "last_name": "{{values.customer_last_name}}", "phone": "{{values.customer_phone}}" });
  let resolvedCustomer = manifestCustomer && typeof manifestCustomer === 'object' ? manifestCustomer : null;
  if ((!resolvedCustomer || Object.keys(resolvedCustomer).length === 0) && fallbackCustomer && typeof fallbackCustomer === 'object') {
    resolvedCustomer = fallbackCustomer;
  }

  const customerPayload = {};
  let hasCustomerIdentifier = false;
  let orderEmail = null;

  if (resolvedCustomer) {
    const customerIdRaw = pickFirst(resolvedCustomer, ['id', 'customer_id', 'customerId']);
    if (customerIdRaw !== undefined && customerIdRaw !== null) {
      const customerId = toTrimmedString(customerIdRaw);
      if (customerId) {
        customerPayload.id = customerId;
        hasCustomerIdentifier = true;
      }
    }

    const emailRaw = pickFirst(resolvedCustomer, ['email', 'email_address', 'emailAddress']);
    if (emailRaw !== undefined && emailRaw !== null) {
      const email = toTrimmedString(emailRaw);
      if (email) {
        const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
        if (!emailPattern.test(email)) {
          throw new Error('Shopify create_order received an invalid customer email "' + email + '". Provide a valid email address.');
        }
        customerPayload.email = email;
        orderEmail = email;
        hasCustomerIdentifier = true;
      }
    }

    const firstNameRaw = pickFirst(resolvedCustomer, ['first_name', 'firstName']);
    const lastNameRaw = pickFirst(resolvedCustomer, ['last_name', 'lastName']);
    const phoneRaw = pickFirst(resolvedCustomer, ['phone', 'phone_number', 'phoneNumber']);
    const acceptsMarketingRaw = pickFirst(resolvedCustomer, ['accepts_marketing', 'acceptsMarketing']);

    const firstName = toTrimmedString(firstNameRaw);
    if (firstName) {
      customerPayload.first_name = firstName;
      hasCustomerIdentifier = true;
    }
    const lastName = toTrimmedString(lastNameRaw);
    if (lastName) {
      customerPayload.last_name = lastName;
      hasCustomerIdentifier = true;
    }
    const phone = toTrimmedString(phoneRaw);
    if (phone) {
      customerPayload.phone = phone;
      hasCustomerIdentifier = true;
    }
    if (acceptsMarketingRaw !== undefined && acceptsMarketingRaw !== null) {
      customerPayload.accepts_marketing = Boolean(acceptsMarketingRaw);
      hasCustomerIdentifier = true;
    }
  }

  if (!hasCustomerIdentifier) {
    throw new Error('Shopify create_order requires a customer ID or email address. Update the workflow configuration to provide customer details.');
  }

  const shippingAddressManifest = interpolateValue({ "first_name": "{{values.recipient_first_name}}", "last_name": "{{values.recipient_last_name}}", "address1": "{{values.shipping_address_1}}", "address2": "{{values.shipping_address_2}}", "city": "{{values.shipping_city}}", "province": "{{values.shipping_state}}", "zip": "{{values.shipping_postal_code}}", "country": "{{values.shipping_country}}", "phone": "{{values.customer_phone}}" });
  let shippingAddress = null;
  if (shippingAddressManifest && typeof shippingAddressManifest === 'object') {
    const shippingFields = {
      first_name: ['first_name', 'firstName'],
      last_name: ['last_name', 'lastName'],
      company: ['company'],
      address1: ['address1', 'address_1', 'line1', 'line_1'],
      address2: ['address2', 'address_2', 'line2', 'line_2'],
      city: ['city'],
      province: ['province', 'state', 'region'],
      zip: ['zip', 'postal_code', 'postalCode'],
      country: ['country', 'country_code', 'countryCode'],
      phone: ['phone', 'phone_number', 'phoneNumber']
    };
    const normalizedShipping = {};
    for (const key in shippingFields) {
      if (!Object.prototype.hasOwnProperty.call(shippingFields, key)) {
        continue;
      }
      const value = pickFirst(shippingAddressManifest, shippingFields[key]);
      if (value === undefined || value === null) {
        continue;
      }
      const stringValue = toTrimmedString(value);
      if (stringValue) {
        normalizedShipping[key] = stringValue;
      }
    }
    if (Object.keys(normalizedShipping).length > 0) {
      shippingAddress = normalizedShipping;
    }
  }

  const noteTemplate = 'Created from Apps Script tier-1 commerce workflow';
  const note = noteTemplate ? interpolate(noteTemplate, ctx).trim() : '';
  const tagsManifest = interpolateValue(["apps-script", "tier-1"]);
  const normalizedTags = [];
  if (Array.isArray(tagsManifest)) {
    for (let i = 0; i < tagsManifest.length; i++) {
      const tag = toTrimmedString(tagsManifest[i]);
      if (tag) {
        normalizedTags.push(tag);
      }
    }
  } else if (typeof tagsManifest === 'string') {
    const parts = tagsManifest.split(',');
    for (let i = 0; i < parts.length; i++) {
      const tag = toTrimmedString(parts[i]);
      if (tag) {
        normalizedTags.push(tag);
      }
    }
  }

  const orderPayload = {
    order: {
      line_items: normalizedLineItems
    }
  };

  if (orderEmail) {
    orderPayload.order.email = orderEmail;
  }
  if (customerPayload && Object.keys(customerPayload).length > 0) {
    orderPayload.order.customer = customerPayload;
  }
  if (shippingAddress) {
    orderPayload.order.shipping_address = shippingAddress;
  }
  if (note) {
    orderPayload.order.note = note;
  }
  if (normalizedTags.length > 0) {
    orderPayload.order.tags = normalizedTags.join(', ');
  }

  const requestUrl = 'https://' + shopDomain + '.myshopify.com/admin/api/' + apiVersion + '/orders.json';

  try {
    const response = rateLimitAware(() => fetchJson({
      url: requestUrl,
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(orderPayload),
      contentType: 'application/json'
    }), {
      attempts: 5,
      initialDelayMs: 1000,
      maxDelayMs: 32000,
      jitter: 0.2,
      retryOn: function(context) {
        var headers = {};
        if (context && context.response && context.response.headers) {
          headers = context.response.headers;
        } else if (context && context.error && context.error.headers) {
          headers = context.error.headers;
        }
        var normalized = __normalizeHeaders(headers || {});
        var limitHeader = normalized['x-shopify-shop-api-call-limit'];
        if (limitHeader) {
          var parts = String(limitHeader).split('/');
          if (parts.length === 2) {
            var used = Number(parts[0]);
            var limit = Number(parts[1]);
            if (!isNaN(used) && !isNaN(limit) && limit > 0 && used >= limit) {
              return { retry: true, delayMs: 2000 };
            }
          }
        }
        return null;
      }
    });

    const body = response && response.body ? response.body : null;
    const order = body && body.order ? body.order : body;
    const orderId = order && order.id ? String(order.id) : null;
    const orderName = order && order.name ? String(order.name) : null;
    const orderNumber = order && Object.prototype.hasOwnProperty.call(order, 'order_number') ? order.order_number : null;
    const orderStatusUrl = order && order.order_status_url ? String(order.order_status_url) : null;
    const adminUrl = orderId ? 'https://' + shopDomain + '.myshopify.com/admin/orders/' + orderId : null;
    const customerId = order && order.customer && order.customer.id ? order.customer.id : (customerPayload.id || null);
    const resolvedCustomerEmail = order && order.email ? String(order.email) : (orderEmail || null);

    ctx.shopifyOrderId = orderId;
    ctx.shopifyOrderName = orderName;
    ctx.shopifyOrderNumber = orderNumber;
    ctx.shopifyOrderUrl = orderStatusUrl;
    ctx.shopifyOrderAdminUrl = adminUrl;
    ctx.shopifyCustomerId = customerId;
    ctx.shopifyOrderCustomerEmail = resolvedCustomerEmail;

    logInfo('shopify_create_order_success', {
      orderId: orderId,
      orderName: orderName,
      orderNumber: orderNumber,
      customerId: customerId,
      customerEmail: resolvedCustomerEmail,
      lineItemCount: normalizedLineItems.length,
      statusUrl: orderStatusUrl,
      adminUrl: adminUrl,
      status: response && typeof response.status === 'number' ? response.status : null
    });

    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const headers = error && error.headers ? error.headers : {};
    const payload = Object.prototype.hasOwnProperty.call(error || {}, 'body') ? error.body : null;
    const details = [];

    if (status) {
      details.push('status ' + status);
    }

    let parsed = null;
    if (payload && typeof payload === 'string') {
      const trimmed = payload.trim();
      if (trimmed) {
        details.push(trimmed);
      }
      try {
        parsed = JSON.parse(payload);
      } catch (parseError) {
        parsed = null;
      }
    } else if (payload && typeof payload === 'object') {
      parsed = payload;
    }

    if (parsed && typeof parsed === 'object') {
      if (parsed.errors) {
        const errorsValue = parsed.errors;
        if (typeof errorsValue === 'string') {
          details.push(errorsValue);
        } else if (Array.isArray(errorsValue)) {
          for (let i = 0; i < errorsValue.length; i++) {
            const entry = errorsValue[i];
            if (entry) {
              details.push(String(entry));
            }
          }
        } else if (typeof errorsValue === 'object') {
          for (const key in errorsValue) {
            if (!Object.prototype.hasOwnProperty.call(errorsValue, key)) {
              continue;
            }
            const value = errorsValue[key];
            if (Array.isArray(value)) {
              for (let i = 0; i < value.length; i++) {
                const part = value[i];
                if (part) {
                  details.push(key + ': ' + part);
                }
              }
            } else if (value) {
              details.push(key + ': ' + value);
            }
          }
        }
      }
      if (parsed.error && typeof parsed.error === 'string') {
        details.push(parsed.error);
      }
      if (parsed.message && typeof parsed.message === 'string') {
        details.push(parsed.message);
      }
    }

    logError('shopify_create_order_failed', {
      status: status,
      customerId: customerPayload && customerPayload.id ? customerPayload.id : null,
      lineItemCount: normalizedLineItems.length,
      details: details
    });

    const message = 'Shopify create_order failed. ' + (details.length > 0 ? details.join(' ') : 'Unexpected error.');
    const wrapped = new Error(message);
    wrapped.status = status;
    wrapped.headers = headers;
    wrapped.body = payload;
    wrapped.cause = error;
    throw wrapped;
  }
}
`);
  });
});
