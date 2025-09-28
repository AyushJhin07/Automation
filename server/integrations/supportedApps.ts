export const IMPLEMENTED_CONNECTOR_IDS = [
  'airtable',
  'gmail',
  'notion',
  'shopify',
  'slack',
  'sheets',
  'time'
] as const;

export const IMPLEMENTED_CONNECTOR_SET = new Set<string>(IMPLEMENTED_CONNECTOR_IDS);

export type ImplementedConnectorId = typeof IMPLEMENTED_CONNECTOR_IDS[number];
