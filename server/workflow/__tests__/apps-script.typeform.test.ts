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

describe('Apps Script Typeform Tier-1 fixture', () => {
  it('generates a persisted Typeform create_form handler with structured logging', () => {
    const graph = loadWorkflowGraph('tier-1-feedback');
    const result = compileToAppsScript(graph);

    expect(result.workflowId).toBe(graph.id);

    const codeFile = result.files.find(file => file.path === 'Code.gs');
    expect(codeFile, 'compiled output should include Code.gs').toBeDefined();

    const match = codeFile!.content.match(/function step_createTypeform\(ctx\) {[\s\S]+?\n}\n/);
    expect(match, 'Typeform handler should be generated').not.toBeNull();

    expect(match![0]).toMatchInlineSnapshot(`
function step_createTypeform(ctx) {
  const accessToken = getSecret('TYPEFORM_ACCESS_TOKEN', { connectorKey: 'typeform' });

  if (!accessToken) {
    logWarn('typeform_missing_access_token', { message: 'Typeform access token not configured' });
    return ctx;
  }

  const titleTemplate = 'Feedback for {{values.campaign_name}}';
  if (!titleTemplate) {
    throw new Error('Typeform create_form manifest is missing the required Title parameter. Update the workflow configuration to provide a title.');
  }

  const resolvedTitle = interpolate(titleTemplate, ctx).trim();
  if (!resolvedTitle) {
    throw new Error('Typeform create_form requires a title. Configure the Title field or provide a template that resolves to text.');
  }

  const typeTemplate = 'survey';
  const resolvedType = interpolate(typeTemplate, ctx).trim() || 'quiz';
  const allowedTypes = ['quiz', 'survey'];
  const normalizedType = allowedTypes.indexOf(resolvedType.toLowerCase()) !== -1 ? resolvedType.toLowerCase() : null;
  if (!normalizedType) {
    throw new Error('Typeform create_form received an invalid form type "' + resolvedType + '". Supported values: quiz, survey.');
  }

  const fieldsConfig = [{"title":"How would you rate {{values.campaign_name}}?","type":"opinion_scale","properties":{"steps":5,"start_at_one":true,"labels":{"left":"Poor","right":"Excellent"}}},{"title":"What should we improve next time?","type":"long_text","properties":{"description":"Share details for the growth team"}}];

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

  const normalizedFields = [];
  if (Array.isArray(fieldsConfig)) {
    for (let index = 0; index < fieldsConfig.length; index++) {
      const entry = fieldsConfig[index];
      if (!entry || typeof entry !== 'object') {
        logWarn('typeform_field_skipped', { index: index, reason: 'Non-object field configuration' });
        continue;
      }
      const interpolatedField = interpolateValue(entry) || {};
      const fieldType = typeof interpolatedField.type === 'string' ? interpolatedField.type.trim() : '';
      const fieldTitle = typeof interpolatedField.title === 'string' ? interpolatedField.title.trim() : '';

      if (!fieldType || !fieldTitle) {
        logWarn('typeform_field_skipped', { index: index, reason: 'Missing type or title' });
        continue;
      }

      const normalizedField = {};
      for (const key in interpolatedField) {
        if (!Object.prototype.hasOwnProperty.call(interpolatedField, key)) {
          continue;
        }
        normalizedField[key] = interpolatedField[key];
      }

      normalizedField.type = fieldType;
      normalizedField.title = fieldTitle;
      normalizedFields.push(normalizedField);
    }
  }

  const formData = {
    title: resolvedTitle,
    type: normalizedType
  };

  if (normalizedFields.length > 0) {
    formData.fields = normalizedFields;
  }

  try {
    const response = rateLimitAware(() => fetchJson({
      url: 'https://api.typeform.com/forms',
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${accessToken}\`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(formData),
      contentType: 'application/json'
    }), { attempts: 4, initialDelayMs: 1000, jitter: 0.2 });

    const body = response.body || {};
    const formId = body && body.id ? String(body.id) : null;
    ctx.typeformId = formId;
    ctx.typeformFormUrl = body && body._links && body._links.display ? body._links.display : null;

    if (formId && typeof PropertiesService !== 'undefined' && PropertiesService && typeof PropertiesService.getScriptProperties === 'function') {
      try {
        const scriptProps = PropertiesService.getScriptProperties();
        scriptProps.setProperty('TYPEFORM_LAST_FORM_ID', formId);
        scriptProps.setProperty('apps_script__typeform__last_form_id', formId);
      } catch (persistError) {
        logWarn('typeform_persist_form_id_failed', {
          message: persistError && persistError.message ? persistError.message : String(persistError)
        });
      }
    }

    logInfo('typeform_create_form_success', {
      formId: formId,
      title: resolvedTitle,
      type: normalizedType,
      fieldCount: normalizedFields.length,
      url: ctx.typeformFormUrl,
      status: response && typeof response.status === 'number' ? response.status : null
    });

    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const headers = error && error.headers ? error.headers : {};
    let payload = error && Object.prototype.hasOwnProperty.call(error, 'body') ? error.body : null;
    const details = [];

    if (status) {
      details.push('status ' + status);
    }

    let parsed = null;
    if (payload && typeof payload === 'string') {
      details.push(payload);
      try {
        parsed = JSON.parse(payload);
      } catch (parseError) {
        parsed = null;
      }
    } else if (payload && typeof payload === 'object') {
      parsed = payload;
    }

    if (parsed && typeof parsed === 'object') {
      if (parsed.code) {
        details.push('code ' + parsed.code);
      }
      if (parsed.description) {
        details.push(String(parsed.description));
      }
      if (parsed.message) {
        details.push(String(parsed.message));
      }
      if (Array.isArray(parsed.details)) {
        for (let i = 0; i < parsed.details.length; i++) {
          const item = parsed.details[i];
          if (!item) {
            continue;
          }
          const field = item.field ? String(item.field) : null;
          const issue = item.message ? String(item.message) : null;
          if (field || issue) {
            details.push((field ? field + ': ' : '') + (issue || ''));
          }
        }
      }
    }

    logError('typeform_create_form_failed', {
      status: status,
      title: resolvedTitle,
      type: normalizedType,
      details: details
    });

    const message = 'Typeform create_form failed. ' + (details.length > 0 ? details.join(' ') : 'Unexpected error.');
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
