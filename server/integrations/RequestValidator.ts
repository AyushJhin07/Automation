import type { APIResponse } from './BaseAPIClient';
import { getValidator } from './SchemaRegistry';

export function validateParams(appId: string, functionId: string, schema: any, params: any): APIResponse<any> | undefined {
  const validator = getValidator(appId, functionId, schema);
  if (!validator) return undefined;
  const ok = validator(params || {});
  if (ok) return undefined;
  const errors = (validator.errors || []).map(e => `${e.instancePath || ''} ${e.message}`).join('; ');
  return { success: false, error: `Invalid parameters for ${appId}.${functionId}: ${errors}` };
}
