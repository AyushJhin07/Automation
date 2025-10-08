export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

export interface NodeIOMetadataSample {
  data: JsonValue;
  description?: string;
  source?: 'connector' | 'system' | 'user' | 'runtime';
}

export interface NodeIOChannelMetadata {
  schemaVersion: string;
  schema?: Record<string, unknown>;
  columns?: string[];
  sample?: JsonValue;
  samples?: NodeIOMetadataSample[];
}

export interface NodeIOMetadata {
  schemaVersion: string;
  inputs: Record<string, NodeIOChannelMetadata>;
  outputs: Record<string, NodeIOChannelMetadata>;
}

export const NODE_IO_METADATA_SCHEMA_VERSION = '2024-05-01';
export const DEFAULT_NODE_IO_CHANNEL = 'default';
