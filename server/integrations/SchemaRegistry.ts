import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

type CacheKey = string;
const validatorCache = new Map<CacheKey, ValidateFunction>();

function buildKey(appId: string, functionId: string): CacheKey {
  return `${appId.toLowerCase()}::${functionId.toLowerCase()}`;
}

export function getValidator(appId: string, functionId: string, schema: any): ValidateFunction | null {
  if (!schema || typeof schema !== 'object') return null;
  const key = buildKey(appId, functionId);
  if (validatorCache.has(key)) {
    return validatorCache.get(key)!;
  }
  try {
    const validate = ajv.compile(schema);
    validatorCache.set(key, validate);
    return validate;
  } catch (error) {
    console.warn(`⚠️ Failed to compile schema for ${appId}.${functionId}:`, (error as any)?.message || error);
    return null;
  }
}

