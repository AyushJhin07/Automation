export function redactSecrets(obj: any): any {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (typeof obj !== 'object') return obj;
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (key.includes('token') || key.includes('secret') || key.includes('apikey') || key.includes('password') || key.includes('access_token')) {
      out[k] = typeof v === 'string' && v.length > 6 ? v.slice(0, 3) + '***' + v.slice(-2) : '***';
    } else if (typeof v === 'object') {
      out[k] = redactSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
