import { readFile } from 'fs/promises';

export async function load(url, context, defaultLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url));
    return {
      format: 'module',
      source: source.toString(),
      shortCircuit: true
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
