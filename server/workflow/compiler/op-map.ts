/**
 * ChatGPT Fix: Export compiler operation map for accurate counting
 * 
 * This provides the single source of truth for what operations
 * are actually implemented in the compiler.
 */

import { REAL_OPS } from '../compile-to-appsscript.js';

/**
 * Get the compiler operation map
 * Returns the same map the compiler uses for code generation
 */
export function getCompilerOpMap(): Record<string, any> {
  return REAL_OPS;
}

/**
 * Check if a specific operation is implemented
 */
export function isOperationImplemented(app: string, operation: string): boolean {
  const key1 = `${app}.${operation}`;
  const key2 = `action.${app}:${operation}`;
  const key3 = `trigger.${app}:${operation}`;
  
  return !!(REAL_OPS[key1] || REAL_OPS[key2] || REAL_OPS[key3]);
}

/**
 * Get all implemented operations
 */
export function getAllImplementedOperations(): string[] {
  return Object.keys(REAL_OPS);
}

/**
 * Get implemented operations by app
 */
export function getImplementedOperationsByApp(): Record<string, string[]> {
  const byApp: Record<string, string[]> = {};
  
  for (const opKey of Object.keys(REAL_OPS)) {
    // Parse operation key (e.g., "action.gmail:sendEmail" -> app: "gmail", op: "sendEmail")
    const match = opKey.match(/^(action|trigger)\.([^:]+):(.+)$/) || opKey.match(/^([^.]+)\.(.+)$/);
    if (match) {
      const app = match[2] || match[1];
      const operation = match[3] || match[2];
      
      if (!byApp[app]) {
        byApp[app] = [];
      }
      byApp[app].push(operation);
    }
  }
  
  return byApp;
}