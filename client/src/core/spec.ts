import { z } from 'zod';

export const PortRef = z.object({
  nodeId: z.string(),
  port: z.string()
});

export const NodeSpec = z.object({
  id: z.string(),
  type: z.string(),            // e.g., "sheets.append_row"
  app: z.string(),             // e.g., "google_sheets"
  label: z.string(),
  inputs: z.record(z.any()),   // literal values or { from: PortRef }
  outputs: z.array(z.string()),
  auth: z.object({
    strategy: z.enum(['oauth','api_key','service_account']).optional(),
    connectionId: z.string().optional()
  }).optional()
});

export const EdgeSpec = z.object({
  from: PortRef,
  to: PortRef
});

export const AutomationSpec = z.object({
  version: z.literal('1.0'),
  name: z.string(),
  description: z.string().optional(),
  triggers: z.array(NodeSpec),
  nodes: z.array(NodeSpec),
  edges: z.array(EdgeSpec)
});

export type AutomationSpec = z.infer<typeof AutomationSpec>;


