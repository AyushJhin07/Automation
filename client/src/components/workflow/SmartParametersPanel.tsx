/**
 * Smart Parameters Panel - Simplified Implementation
 *
 * Uses the same pattern as Label and Description fields for consistency
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReactFlow, useStore } from "reactflow";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { RefreshCw } from "lucide-react";
import { buildMetadataFromNode } from "./metadata";
import type { EvaluatedValue } from "../../../../shared/nodeGraphSchema";
import type { ConnectorDefinitionMap } from "@/services/connectorDefinitionsService";
import { normalizeConnectorId } from "@/services/connectorDefinitionsService";

export type JSONSchema = {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  enum?: any[];
  title?: string;
  description?: string;
  default?: any;
  format?: string;
  minimum?: number;
  maximum?: number;
  required?: string[];
};

export type NodeMetadataSummary = {
  columns?: string[];
  headers?: string[];
  sample?: Record<string, any> | any[];
  sampleRow?: Record<string, any> | any[];
  outputSample?: Record<string, any> | any[];
  schema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  derivedFrom?: string[];
  [key: string]: any;
};

export type UpstreamNodeSummary = {
  id: string;
  data?: {
    label?: string;
    app?: string;
    metadata?: NodeMetadataSummary;
    outputMetadata?: NodeMetadataSummary;
    [key: string]: any;
  };
};

type MetadataRefreshState = {
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  reason?: string | null;
  updatedAt?: number;
};

const METADATA_REFRESH_ENDPOINT = "/api/workflows/metadata/refresh";

const AI_MAPPING_DISABLED_MESSAGE =
  "AI mapping is disabled until an AI provider is configured.";

export type AIMappingCapability = {
  available: boolean;
  providers: string[];
};

export const parseAIMappingCapability = (
  response: any,
): AIMappingCapability => {
  const providers = Array.isArray(response?.providers?.available)
    ? response.providers.available.map((value: unknown) => String(value))
    : [];

  const hasModels =
    Array.isArray(response?.models) && response.models.length > 0;
  const aiAvailable =
    typeof response?.aiAvailable === "boolean"
      ? response.aiAvailable
      : hasModels;

  return {
    available: Boolean(aiAvailable && (providers.length > 0 || hasModels)),
    providers,
  };
};

const uniqueStrings = (values: Array<string | undefined>): string[] => {
  const set = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value.trim()) {
      set.add(value.trim());
    }
  });
  return Array.from(set);
};

type LLMEvaluatedValue = Extract<EvaluatedValue, { mode: "llm" }>;

const describeUpstreamForPrompt = (
  upstreamNodes: UpstreamNodeSummary[],
): string => {
  const labels = upstreamNodes
    .map((node) => (node.data?.label || node.id || "").toString().trim())
    .filter((label) => label.length > 0);

  if (labels.length === 0) {
    return "the connected upstream steps";
  }

  if (labels.length === 1) {
    return `the "${labels[0]}" step`;
  }

  if (labels.length === 2) {
    return `the "${labels[0]}" and "${labels[1]}" steps`;
  }

  const head = labels
    .slice(0, -1)
    .map((label) => `"${label}"`)
    .join(", ");
  const tail = labels[labels.length - 1];
  return `the ${head}, and "${tail}" steps`;
};

const buildDefaultLLMPrompt = (
  fieldName: string,
  fieldDef: JSONSchema,
  upstreamNodes: UpstreamNodeSummary[],
): string => {
  const title = fieldDef?.title || fieldName;
  const description = fieldDef?.description?.trim();
  const typeHint = fieldDef?.type ? `Expected type: ${fieldDef.type}.` : "";
  const upstreamHint = upstreamNodes.length
    ? `Review data from ${describeUpstreamForPrompt(upstreamNodes)} to find the best match.`
    : "Review available context to propose an appropriate value.";

  return [
    `You are mapping the "${title}" parameter for the current workflow step.`,
    upstreamHint,
    description ? `Field details: ${description}.` : "",
    typeHint,
    "Return only the selected value or field path without additional commentary.",
  ]
    .filter(Boolean)
    .join(" ");
};

export const createDefaultLLMValue = (
  fieldName: string,
  fieldDef: JSONSchema,
  upstreamNodes: UpstreamNodeSummary[],
): LLMEvaluatedValue => {
  const prompt = buildDefaultLLMPrompt(fieldName, fieldDef, upstreamNodes);
  const defaultModel: LLMEvaluatedValue["model"] = "openai:gpt-4o-mini";
  const defaultProvider: LLMEvaluatedValue["provider"] = "openai";

  const base: LLMEvaluatedValue = {
    mode: "llm",
    provider: defaultProvider,
    model: defaultModel,
    prompt,
    temperature: 0.2,
    maxTokens: 512,
    cacheTtlSec: 300,
  };

  if (fieldDef) {
    base.jsonSchema = fieldDef;
  }

  return base;
};

export const mergeLLMValueWithDefaults = (
  value: any,
  fallback: LLMEvaluatedValue,
): LLMEvaluatedValue => {
  const partial =
    value && typeof value === "object" && value.mode === "llm"
      ? (value as Partial<LLMEvaluatedValue>)
      : {};

  const merged: LLMEvaluatedValue = {
    ...fallback,
    ...partial,
    prompt:
      typeof partial.prompt === "string" && partial.prompt.trim().length > 0
        ? partial.prompt
        : fallback.prompt,
    provider: partial.provider ?? fallback.provider,
    model: partial.model ?? fallback.model,
    temperature:
      typeof partial.temperature === "number"
        ? partial.temperature
        : fallback.temperature,
    maxTokens:
      typeof partial.maxTokens === "number"
        ? partial.maxTokens
        : fallback.maxTokens,
    cacheTtlSec:
      typeof partial.cacheTtlSec === "number"
        ? partial.cacheTtlSec
        : fallback.cacheTtlSec,
    jsonSchema: partial.jsonSchema ?? fallback.jsonSchema,
  };

  if (partial.system !== undefined) {
    merged.system = partial.system;
  }

  return merged;
};

const gatherMetadata = (node: UpstreamNodeSummary): NodeMetadataSummary => {
  const dataMeta = node.data?.metadata || {};
  const outputMeta = node.data?.outputMetadata || {};
  return { ...outputMeta, ...dataMeta };
};

export const computeMetadataSuggestions = (
  upstreamNodes: UpstreamNodeSummary[],
): Array<{ nodeId: string; path: string; label: string }> => {
  const suggestions: Array<{ nodeId: string; path: string; label: string }> =
    [];
  const seen = new Set<string>();

  upstreamNodes.forEach((upNode) => {
    if (!upNode?.id) return;
    const nodeId = upNode.id;
    const baseLabel = upNode.data?.label || nodeId;
    const metadata = gatherMetadata(upNode);

    const addSuggestion = (path: string, label: string) => {
      const key = `${nodeId}:${path}`;
      if (seen.has(key)) return;
      suggestions.push({ nodeId, path, label });
      seen.add(key);
    };

    addSuggestion("", `${baseLabel} • Entire output`);

    const columns: string[] = [];
    if (Array.isArray(metadata.columns)) columns.push(...metadata.columns);
    if (Array.isArray(metadata.headers)) columns.push(...metadata.headers);
    if (Array.isArray((metadata as any).fields))
      columns.push(...(metadata as any).fields);
    uniqueStrings(columns).forEach((column) => {
      addSuggestion(column, `${baseLabel} • ${column}`);
    });

    const sample =
      metadata.sample || metadata.sampleRow || metadata.outputSample;
    if (sample && typeof sample === "object" && !Array.isArray(sample)) {
      Object.keys(sample).forEach((key) => {
        addSuggestion(key, `${baseLabel} • ${key}`);
      });
    }
  });

  return suggestions;
};

export const mapUpstreamNodesForAI = (
  upstreamNodes: UpstreamNodeSummary[],
): Array<{
  nodeId: string;
  label: string;
  app: string;
  columns: string[];
  sample: any;
  schema: Record<string, any> | undefined;
}> => {
  return upstreamNodes.map((upNode) => {
    const metadata = gatherMetadata(upNode);
    const columns: string[] = [];
    if (Array.isArray(metadata.columns)) columns.push(...metadata.columns);
    if (Array.isArray(metadata.headers)) columns.push(...metadata.headers);
    const sample =
      (metadata.sample && typeof metadata.sample === "object"
        ? metadata.sample
        : undefined) ||
      (metadata.sampleRow && typeof metadata.sampleRow === "object"
        ? metadata.sampleRow
        : undefined) ||
      (metadata.outputSample && typeof metadata.outputSample === "object"
        ? metadata.outputSample
        : metadata.outputSample);
    const schema = metadata.schema || metadata.outputSchema;

    return {
      nodeId: upNode.id,
      label: upNode.data?.label || upNode.id,
      app: upNode.data?.app || "unknown",
      columns: uniqueStrings(columns),
      sample:
        sample ??
        metadata.sample ??
        metadata.sampleRow ??
        metadata.outputSample,
      schema,
    };
  });
};

export const syncNodeParameters = (
  data: any,
  nextParams: any,
): Record<string, any> => {
  const paramsValue = nextParams ?? {};
  return {
    ...(data || {}),
    parameters: paramsValue,
    params: paramsValue,
  };
};

const SHEET_NAME_FIELD_CANDIDATES = [
  "sheetname",
  "sheet",
  "worksheet",
  "worksheetname",
  "sheet_name",
  "tab",
  "tabname",
  "sheettitle",
  "sheet_title",
];

export type FetchSheetTabsResult = {
  tabs: string[];
  error?: string;
};

export const fetchSheetTabs = async (
  spreadsheetId: string,
  options: { signal?: AbortSignal } = {},
): Promise<FetchSheetTabsResult> => {
  const trimmed = spreadsheetId?.trim?.() ?? "";
  if (!trimmed) {
    return { tabs: [] };
  }

  const url = `/api/google/sheets/${encodeURIComponent(trimmed)}/metadata`;

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const message =
        errorText || `Failed to load sheet metadata (${response.status})`;
      return { tabs: [], error: message };
    }

    const json = await response.json().catch(() => ({}));
    const candidate = json?.sheets ?? json?.tabs ?? json?.sheetNames ?? [];

    if (!Array.isArray(candidate)) {
      return { tabs: [] };
    }

    const tabs = candidate
      .map((value) =>
        typeof value === "string"
          ? value.trim()
          : typeof value === "number"
            ? String(value)
            : "",
      )
      .filter((value) => value.length > 0);

    return { tabs };
  } catch (error: any) {
    const message =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Unable to load sheet metadata";
    return { tabs: [], error: message };
  }
};

export const augmentSchemaWithSheetTabs = (
  baseSchema: JSONSchema | null,
  sheetTabs: string[],
  options: { fieldNames?: string[] } = {},
): JSONSchema | null => {
  if (!baseSchema) return baseSchema;
  const properties = baseSchema.properties;
  if (!properties) return baseSchema;

  const fields = (options.fieldNames ?? SHEET_NAME_FIELD_CANDIDATES).map((f) =>
    f.toLowerCase(),
  );
  const fieldSet = new Set(fields);
  let mutated = false;
  const nextProperties: Record<string, JSONSchema> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!value) continue;
    const lowerKey = key.toLowerCase();
    if (!fieldSet.has(lowerKey)) {
      nextProperties[key] = value;
      continue;
    }

    const nextDef: JSONSchema = { ...value };
    if (sheetTabs.length > 0) {
      nextDef.enum = sheetTabs;
    } else {
      if (value.enum) {
        nextDef.enum = [...value.enum];
      } else {
        delete nextDef.enum;
      }
    }

    nextProperties[key] = nextDef;
    if (sheetTabs.length > 0) {
      if (
        !Array.isArray(value.enum) ||
        value.enum.join("\u0000") !== sheetTabs.join("\u0000")
      ) {
        mutated = true;
      }
    } else if (value.enum) {
      mutated = true;
    }
  }

  if (!mutated && sheetTabs.length === 0) {
    return baseSchema;
  }

  return {
    ...baseSchema,
    properties: nextProperties,
  };
};

export function renderStaticFieldControl(
  fieldDef: JSONSchema,
  context: {
    fieldName: string;
    localStatic: any;
    setLocalStatic: (value: any) => void;
    commitValue: (value: any) => void;
  },
): JSX.Element {
  const { fieldName, localStatic, setLocalStatic, commitValue } = context;
  const type = fieldDef?.type || (fieldDef?.enum ? "string" : "string");

  if (fieldDef?.enum && Array.isArray(fieldDef.enum)) {
    const optionElements = fieldDef.enum.map((opt: any) => (
      <option key={String(opt)} value={opt}>
        {String(opt)}
      </option>
    ));

    return (
      <select
        value={localStatic}
        onChange={(e) => {
          setLocalStatic(e.target.value);
          commitValue(e.target.value);
        }}
        className="w-full border border-slate-300 rounded px-3 py-2 bg-slate-50 text-slate-900 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
      >
        {[
          <option key="__default" value="">
            -- select --
          </option>,
          ...optionElements,
        ]}
      </select>
    );
  }

  if (type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(localStatic)}
          onChange={(e) => {
            setLocalStatic(e.target.checked);
            commitValue(e.target.checked);
          }}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-600">
          {fieldDef.title || fieldName}
        </span>
      </div>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <Input
        type="number"
        value={localStatic}
        onChange={(e) => {
          setLocalStatic(e.target.value);
        }}
        onBlur={(e) => {
          const val = e.target.value === "" ? "" : Number(e.target.value);
          commitValue(val);
        }}
        min={fieldDef.minimum as any}
        max={fieldDef.maximum as any}
        placeholder={fieldDef?.description || `Enter ${fieldName}`}
        className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
      />
    );
  }

  if (type === "array") {
    return (
      <Input
        value={Array.isArray(localStatic) ? localStatic.join(",") : localStatic}
        onChange={(e) => {
          setLocalStatic(e.target.value);
        }}
        onBlur={(e) => {
          const parts = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          commitValue(parts);
        }}
        placeholder="item1, item2, item3"
        className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
      />
    );
  }

  if (type === "object") {
    return (
      <Textarea
        value={
          typeof localStatic === "string"
            ? localStatic
            : JSON.stringify(localStatic ?? {}, null, 2)
        }
        onChange={(e) => {
          setLocalStatic(e.target.value);
        }}
        onBlur={(e) => {
          const val = e.target.value;
          try {
            const parsed = JSON.parse(val);
            commitValue(parsed);
          } catch {
            commitValue(val);
          }
        }}
        rows={3}
        placeholder="{ }"
        className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors resize-none font-mono text-sm"
      />
    );
  }

  const inputType =
    fieldDef?.format === "email"
      ? "email"
      : fieldDef?.format === "uri"
        ? "url"
        : fieldDef?.format === "date"
          ? "date"
          : fieldDef?.format === "datetime-local"
            ? "datetime-local"
            : "text";

  return (
    <Input
      type={inputType}
      value={localStatic ?? ""}
      onChange={(e) => {
        setLocalStatic(e.target.value);
      }}
      onBlur={(e) => {
        commitValue(e.target.value);
      }}
      placeholder={
        fieldDef?.description || fieldDef?.format || `Enter ${fieldName}`
      }
      className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
    />
  );
}

type SmartParametersPanelProps = {
  connectorDefinitions?: ConnectorDefinitionMap | null;
  onRefreshConnectors?: () => void;
  isRefreshingConnectors?: boolean;
  metadataError?: Error | null;
};

export function SmartParametersPanel({
  connectorDefinitions,
  onRefreshConnectors,
  isRefreshingConnectors,
  metadataError,
}: SmartParametersPanelProps) {
  const rf = useReactFlow();
  const storeNodes = useStore((state) => {
    const anyState = state as any;
    if (typeof anyState.getNodes === "function") {
      return anyState.getNodes();
    }
    return anyState.nodes || [];
  });
  const storeEdges = useStore((state) => {
    const anyState = state as any;
    if (typeof anyState.getEdges === "function") {
      return anyState.getEdges();
    }
    return anyState.edges || [];
  });
  const selected = useMemo(
    () => storeNodes.filter((n: any) => n.selected),
    [storeNodes],
  );
  const node = selected[0];

  const upstreamNodes = useMemo(() => {
    if (!node) return [] as any[];
    const upstreamIds = new Set(
      (storeEdges as any[])
        .filter((edge) => edge?.target === node.id)
        .map((edge) => edge?.source)
        .filter(Boolean),
    );
    return (storeNodes as any[]).filter((n) => upstreamIds.has(n.id));
  }, [node?.id, storeEdges, storeNodes]);

  const upstreamMetadataFingerprint = useMemo(() => {
    try {
      return JSON.stringify(
        (upstreamNodes as UpstreamNodeSummary[]).map((upNode) => ({
          id: upNode?.id,
          metadata: upNode?.data?.metadata ?? null,
          outputMetadata: upNode?.data?.outputMetadata ?? null,
        })),
      );
    } catch {
      return "";
    }
  }, [upstreamNodes]);

  const metadataSuggestions = useMemo(
    () => computeMetadataSuggestions(upstreamNodes as UpstreamNodeSummary[]),
    [upstreamNodes, upstreamMetadataFingerprint],
  );

  // More robust app/op retrieval
  const rawNodeType = node?.data?.nodeType || node?.type || "";

  const canonicalizeAppId = (value: any): string => {
    if (!value) return "";
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const inferAppId = (): string => {
    const direct = canonicalizeAppId(
      node?.data?.app || node?.data?.connectorId || node?.data?.provider,
    );
    if (direct) return direct;
    if (rawNodeType) {
      const match = rawNodeType.match(
        /^(?:trigger|action|transform)[.:]([^.:]+)/i,
      );
      if (match?.[1]) return canonicalizeAppId(match[1]);
    }
    return "";
  };

  const inferOpId = (): string => {
    const direct =
      node?.data?.actionId ??
      node?.data?.function ??
      node?.data?.triggerId ??
      node?.data?.eventId;
    if (direct) return String(direct);
    if (rawNodeType) {
      const parts = rawNodeType.split(/[:.]/);
      return parts[parts.length - 1];
    }
    if (node?.data?.label) return String(node.data.label);
    return "";
  };

  const app = inferAppId();
  const opId = inferOpId();
  const [schema, setSchema] = useState<JSONSchema | null>(null);
  const originalSchemaRef = useRef<JSONSchema | null>(null);
  const [defaults, setDefaults] = useState<any>({});
  const [paramsDraft, setParamsDraft] = useState<any>(
    node?.data?.parameters ?? node?.data?.params ?? {},
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetMetadata, setSheetMetadata] = useState<null | {
    spreadsheetId: string;
    tabs: string[];
    status: "idle" | "loading" | "success" | "error";
    error?: string;
  }>(null);
  const metadataRefreshAbortRef = useRef<AbortController | null>(null);
  const storeNodesRef = useRef<any[]>(storeNodes as any[]);
  const storeEdgesRef = useRef<any[]>(storeEdges as any[]);
  const isMountedRef = useRef(true);
  const [metadataRefreshState, setMetadataRefreshState] =
    useState<MetadataRefreshState>({
      status: "idle",
      error: null,
      reason: null,
    });
  const [aiCapability, setAiCapability] = useState<AIMappingCapability | null>(
    null,
  );

  useEffect(() => {
    storeNodesRef.current = storeNodes as any[];
  }, [storeNodes]);

  useEffect(() => {
    storeEdgesRef.current = storeEdges as any[];
  }, [storeEdges]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      metadataRefreshAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    metadataRefreshAbortRef.current?.abort();
    metadataRefreshAbortRef.current = null;
    setMetadataRefreshState({ status: "idle", error: null, reason: null });
  }, [node?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadCapability = async () => {
      try {
        const response = await fetch("/api/ai/models");
        if (cancelled) return;

        if (!response.ok) {
          setAiCapability({ available: false, providers: [] });
          return;
        }

        const data = await response.json();
        setAiCapability(parseAIMappingCapability(data));
      } catch {
        if (!cancelled) {
          setAiCapability({ available: false, providers: [] });
        }
      }
    };

    loadCapability();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshNodeMetadata = useCallback(
    async (params: any, reason?: string) => {
      if (!node) return;

      const paramsValue = params ?? {};
      metadataRefreshAbortRef.current?.abort();
      const controller = new AbortController();
      metadataRefreshAbortRef.current = controller;

      setMetadataRefreshState({
        status: "loading",
        error: null,
        reason: reason ?? null,
      });

      const currentNodes = (() => {
        try {
          const nodesFromInstance = (rf as any).getNodes?.();
          if (Array.isArray(nodesFromInstance)) {
            return nodesFromInstance;
          }
        } catch {}
        return storeNodesRef.current;
      })();

      const currentEdges = (() => {
        try {
          const edgesFromInstance = (rf as any).getEdges?.();
          if (Array.isArray(edgesFromInstance)) {
            return edgesFromInstance;
          }
        } catch {}
        return storeEdgesRef.current;
      })();

      const normalizeNodeForPayload = (
        graphNode: any,
        overrideParams?: any,
      ) => {
        if (!graphNode) return null;
        const baseData =
          graphNode.data && typeof graphNode.data === "object"
            ? { ...graphNode.data }
            : {};
        const paramsForNode =
          overrideParams ??
          baseData.parameters ??
          baseData.params ??
          graphNode.parameters ??
          graphNode.params ??
          {};
        const metadataValue = {
          ...(graphNode.metadata ?? {}),
          ...(baseData.metadata ?? {}),
        };
        const outputMetadataValue = {
          ...(graphNode.outputMetadata ?? {}),
          ...(baseData.outputMetadata ?? {}),
        };
        const normalizedData = {
          ...baseData,
          parameters: paramsForNode,
          params: paramsForNode,
          metadata: metadataValue,
          outputMetadata: outputMetadataValue,
        };
        return {
          id: graphNode.id,
          type:
            graphNode.type ?? normalizedData.nodeType ?? normalizedData.type,
          app:
            normalizedData.app ??
            normalizedData.connectorId ??
            normalizedData.provider ??
            graphNode.app,
          operation:
            normalizedData.actionId ??
            normalizedData.operation ??
            normalizedData.triggerId ??
            normalizedData.eventId ??
            normalizedData.function ??
            graphNode.operation ??
            graphNode.op,
          data: normalizedData,
          metadata: normalizedData.metadata,
          outputMetadata: normalizedData.outputMetadata,
        };
      };

      const serializedCurrentNode =
        normalizeNodeForPayload(
          currentNodes.find((n: any) => String(n.id) === String(node.id)) ??
            node,
          paramsValue,
        ) ?? undefined;

      const serializedNodes = currentNodes
        .map((graphNode: any) =>
          normalizeNodeForPayload(
            graphNode,
            String(graphNode.id) === String(node.id) ? paramsValue : undefined,
          ),
        )
        .filter(Boolean);

      const serializedEdges = currentEdges.map((edge: any) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        data:
          edge.data && typeof edge.data === "object"
            ? { ...edge.data }
            : undefined,
      }));

      const payload = {
        nodeId: node.id,
        app,
        operation: opId,
        params: paramsValue,
        node: serializedCurrentNode,
        graph: {
          nodes: serializedNodes,
          edges: serializedEdges,
        },
      };

      try {
        const response = await fetch(METADATA_REFRESH_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          const message = errorText?.trim()?.length
            ? errorText
            : `Metadata refresh failed (${response.status})`;
          if (metadataRefreshAbortRef.current === controller) {
            metadataRefreshAbortRef.current = null;
          }
          setMetadataRefreshState({
            status: "error",
            error: message,
            reason: reason ?? null,
          });
          return;
        }

        const result = await response.json().catch(() => ({}));
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }

        const extractMetadata = (value: any) => {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            return value;
          }
          return undefined;
        };

        const metadataFromServer =
          extractMetadata(result?.metadata) ??
          extractMetadata(result?.node?.metadata) ??
          extractMetadata(result?.node?.data?.metadata) ??
          extractMetadata(result?.data?.metadata);

        const outputMetadataFromServer =
          extractMetadata(result?.outputMetadata) ??
          extractMetadata(result?.node?.outputMetadata) ??
          extractMetadata(result?.node?.data?.outputMetadata) ??
          extractMetadata(result?.data?.outputMetadata) ??
          metadataFromServer ??
          undefined;

        if (metadataRefreshAbortRef.current === controller) {
          metadataRefreshAbortRef.current = null;
        }

        setMetadataRefreshState({
          status: "success",
          error: null,
          reason: reason ?? null,
          updatedAt: Date.now(),
        });

        if (!metadataFromServer && !outputMetadataFromServer) {
          return;
        }

        rf.setNodes((nodes) =>
          nodes.map((reactNode) => {
            if (reactNode.id !== node.id) {
              return reactNode;
            }
            const dataWithParams = syncNodeParameters(
              reactNode.data,
              paramsValue,
            );
            const baseMetadata = dataWithParams?.metadata ?? {};
            const baseOutputMetadata =
              dataWithParams?.outputMetadata ?? baseMetadata;

            const mergedData = {
              ...dataWithParams,
              metadata: {
                ...baseMetadata,
                ...(metadataFromServer || {}),
              },
              outputMetadata: {
                ...baseOutputMetadata,
                ...(outputMetadataFromServer || {}),
              },
            };

            const provisionalNode = {
              ...reactNode,
              data: mergedData,
              params: paramsValue,
              parameters: paramsValue,
            };

            const derivedMetadata = buildMetadataFromNode(provisionalNode);

            return {
              ...reactNode,
              data: {
                ...mergedData,
                metadata: {
                  ...mergedData.metadata,
                  ...derivedMetadata,
                },
                outputMetadata: {
                  ...mergedData.outputMetadata,
                  ...derivedMetadata,
                },
              },
            };
          }),
        );
      } catch (error) {
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }
        if (metadataRefreshAbortRef.current === controller) {
          metadataRefreshAbortRef.current = null;
        }
        const message =
          error instanceof Error ? error.message : "Failed to refresh metadata";
        setMetadataRefreshState({
          status: "error",
          error: message,
          reason: reason ?? null,
        });
      }
    },
    [node, rf, app, opId],
  );

  // Load schema when node/app/op changes
  useEffect(() => {
    if (!app) {
      setSchema(null);
      setDefaults({});
      setParamsDraft(node?.data?.parameters ?? node?.data?.params ?? {});
      setSheetMetadata(null);
      return;
    }

    let cancelled = false;
    const resetParams = node?.data?.parameters ?? node?.data?.params ?? {};
    setLoading(true);
    setError(null);
    setSchema(null);
    setDefaults({});
    setSheetMetadata(null);
    setParamsDraft(resetParams);

    const kind =
      node?.data?.kind ||
      (String(rawNodeType || "").startsWith("trigger") ? "trigger" : "auto");

    const buildVariantSet = (values: Array<string | undefined | null>) => {
      const set = new Set<string>();
      values.forEach((value) => {
        if (value === undefined || value === null) return;
        const raw = String(value).trim();
        if (!raw) return;
        set.add(raw);
        set.add(raw.toLowerCase());
        const normalized = normalizeConnectorId(raw);
        if (normalized) {
          set.add(normalized);
          set.add(normalized.replace(/-/g, ""));
        }
        const collapsed = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (collapsed) {
          set.add(collapsed);
        }
      });
      return set;
    };

    const applySchemaState = (nextSchema: JSONSchema, defaultsValue: any) => {
      if (cancelled) {
        return;
      }
      const safeDefaults =
        defaultsValue && typeof defaultsValue === "object" ? defaultsValue : {};
      originalSchemaRef.current = nextSchema;
      setSchema(nextSchema);
      setDefaults(safeDefaults);
      const currentParams = node?.data?.parameters ?? node?.data?.params ?? {};
      const mergedParams = { ...(safeDefaults || {}), ...currentParams };
      setParamsDraft(mergedParams);
      setLoading(false);
    };

    const connectorCandidates = buildVariantSet([
      app,
      node?.data?.app,
      node?.data?.application,
      node?.data?.connectorId,
      node?.data?.provider,
      (node?.data?.metadata as any)?.appId,
      (node?.data?.metadata as any)?.application,
      (node?.data?.metadata as any)?.id,
    ]);

    let connectorDefinition:
      | ConnectorDefinitionMap[keyof ConnectorDefinitionMap]
      | null = null;
    if (connectorDefinitions && Object.keys(connectorDefinitions).length > 0) {
      for (const candidate of connectorCandidates) {
        if (candidate && connectorDefinitions[candidate]) {
          connectorDefinition = connectorDefinitions[candidate];
          break;
        }
      }

      if (!connectorDefinition) {
        for (const candidate of connectorCandidates) {
          if (!candidate) continue;
          const flatCandidate = candidate.replace(/[^a-z0-9]+/g, "");
          if (!flatCandidate) continue;
          for (const definition of Object.values(connectorDefinitions)) {
            if (!definition) continue;
            const definitionVariants = buildVariantSet([
              definition.id,
              definition.name,
              definition.category,
              ...(definition.categories ?? []),
            ]);
            if (
              definitionVariants.has(candidate) ||
              definitionVariants.has(flatCandidate)
            ) {
              connectorDefinition = definition;
              break;
            }
          }
          if (connectorDefinition) {
            break;
          }
        }
      }
    }

    const tryDefinitionSchema = (): boolean => {
      if (!connectorDefinition) {
        return false;
      }

      const nodeLabel = node?.data?.label || node?.data?.name;
      const nodeTypeParts = rawNodeType
        ? rawNodeType.split(/[.:]/).filter(Boolean)
        : [];
      const operationCandidates = buildVariantSet([
        opId,
        node?.data?.actionId,
        node?.data?.triggerId,
        node?.data?.eventId,
        node?.data?.function,
        node?.data?.operation,
        nodeLabel,
        rawNodeType,
        ...nodeTypeParts,
      ]);

      const lists: Array<any> = [];
      if (kind === "trigger") {
        lists.push(...(connectorDefinition.triggers ?? []));
      } else if (kind === "action") {
        lists.push(...(connectorDefinition.actions ?? []));
      } else {
        lists.push(
          ...(connectorDefinition.triggers ?? []),
          ...(connectorDefinition.actions ?? []),
        );
      }

      const findOperation = () => {
        for (const op of lists) {
          if (!op) continue;
          const opVariants = buildVariantSet([
            op.id,
            (op as any)?.slug,
            (op as any)?.operationId,
            op.name,
            (op as any)?.nodeType,
          ]);
          for (const candidate of operationCandidates) {
            if (!candidate) continue;
            const collapsed = candidate.replace(/[^a-z0-9]+/g, "");
            if (
              opVariants.has(candidate) ||
              (collapsed && opVariants.has(collapsed))
            ) {
              return op;
            }
          }
        }
        return null;
      };

      const operation = findOperation();
      if (!operation) {
        return false;
      }

      const params =
        (operation as any)?.params ?? (operation as any)?.parameters ?? null;
      if (!params || typeof params !== "object") {
        return false;
      }

      const schemaCandidate =
        (params as any).schema && typeof (params as any).schema === "object"
          ? (params as any).schema
          : params;
      if (!schemaCandidate || typeof schemaCandidate !== "object") {
        return false;
      }

      const defaultsCandidate =
        typeof (params as any).defaults === "object"
          ? (params as any).defaults
          : typeof (schemaCandidate as any).default === "object"
            ? (schemaCandidate as any).default
            : {};

      applySchemaState(schemaCandidate as JSONSchema, defaultsCandidate);
      return true;
    };

    if (tryDefinitionSchema()) {
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    const opSchemaUrl = opId
      ? `/api/registry/op-schema?app=${encodeURIComponent(app)}&op=${encodeURIComponent(opId)}&kind=${kind}`
      : "";

    const tryOpSchema = opSchemaUrl
      ? fetch(opSchemaUrl, { signal: controller.signal })
          .then((r) => r.json())
          .catch(() => ({ success: false }))
      : Promise.resolve({ success: false });

    tryOpSchema
      .then(async (j) => {
        if (cancelled) {
          return;
        }
        if (!j?.success) {
          setError(j?.error || "Failed to load schema");
          j = { success: false } as any;
        }
        let nextSchema = j.schema || { type: "object", properties: {} };
        let nextDefaults = j.defaults || {};

        const empty =
          !nextSchema?.properties ||
          Object.keys(nextSchema.properties).length === 0;
        if (empty) {
          try {
            const res = await fetch("/api/registry/catalog?implemented=true");
            const json = await res.json();
            const connectorsMap = json?.catalog?.connectors || {};

            const list = Object.entries(connectorsMap)
              .filter(([, def]: any) => def?.hasImplementation)
              .map(([id, def]: any) => ({
                id,
                name: def?.name,
                actions: def?.actions || [],
                triggers: def?.triggers || [],
              }));

            const canonicalize = (s: any) =>
              String(s || "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();
            const appKey = canonicalize(app);
            const opKey = canonicalize(opId);
            const match = list.find((c: any) => {
              const title = canonicalize(c?.name);
              const id = canonicalize(c?.id);
              return (
                title === appKey ||
                id === appKey ||
                title.includes(appKey) ||
                appKey.includes(title)
              );
            });
            if (match) {
              const pools = [match.actions || [], match.triggers || []];
              let found: any = null;
              const opCandidates = [
                opKey,
                canonicalize(node?.data?.label || node?.data?.name),
              ].filter(Boolean);
              for (const pool of pools) {
                found = pool.find((a: any) => {
                  const aid = canonicalize(a?.id);
                  const aname = canonicalize(a?.name || a?.title);
                  const variants = [
                    aid,
                    aname,
                    aid.replace(/-/g, "_"),
                    aname.replace(/-/g, "_"),
                  ];
                  return opCandidates.some((c) => variants.includes(c));
                });
                if (found) break;
              }
              if (!found && (match.actions?.length || match.triggers?.length)) {
                const all = [
                  ...(match.actions || []),
                  ...(match.triggers || []),
                ];
                if (all.length === 1) found = all[0];
              }
              if (
                found &&
                found.parameters &&
                found.parameters.properties &&
                Object.keys(found.parameters.properties).length > 0
              ) {
                nextSchema = found.parameters;
                nextDefaults = found.defaults || {};
              }
            }
          } catch (e) {
            // ignore fallback errors
          }
        }

        if (
          !nextSchema?.properties ||
          Object.keys(nextSchema.properties).length === 0
        ) {
          const appL = String(app).toLowerCase();
          const opL = String(opId).toLowerCase();
          const labelL = String(node?.data?.label || "").toLowerCase();

          if (
            (appL.includes("sheets") || labelL.includes("sheet")) &&
            (opL.includes("row") || labelL.includes("row")) &&
            (opL.includes("add") ||
              opL.includes("added") ||
              labelL.includes("add"))
          ) {
            nextSchema = {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  title: "spreadsheetId",
                  description: "Spreadsheet ID to monitor",
                },
                sheetName: {
                  type: "string",
                  title: "sheetName",
                  description: "Specific sheet name to monitor",
                },
              },
              required: ["spreadsheetId"],
            } as any;
          }
          if (
            appL.includes("gmail") &&
            (opL.includes("send") || opL.includes("email"))
          ) {
            nextSchema = {
              type: "object",
              properties: {
                to: {
                  type: "array",
                  items: { type: "string" },
                  title: "to",
                  description: "Recipient email addresses",
                },
                subject: {
                  type: "string",
                  title: "subject",
                  description: "Email subject",
                },
                body: {
                  type: "string",
                  title: "body",
                  description: "Email body (text or HTML)",
                },
              },
              required: ["to", "subject", "body"],
            } as any;
          }
          if (
            appL.includes("google-chat") &&
            (opL.includes("message") || labelL.includes("message"))
          ) {
            nextSchema = {
              type: "object",
              properties: {
                space: {
                  type: "string",
                  title: "space",
                  description: "Filter by specific space",
                },
              },
              required: [],
            } as any;
          }
        }

        applySchemaState(nextSchema, nextDefaults);
      })
      .catch((e) => {
        if (cancelled) {
          return;
        }
        setError(String(e));
        const fallback = { type: "object", properties: {} } as JSONSchema;
        applySchemaState(fallback, {});
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [app, opId, node?.id, connectorDefinitions, rawNodeType]);

  useEffect(() => {
    const rawId = paramsDraft?.spreadsheetId;
    if (!rawId) {
      setSheetMetadata(null);
      if (originalSchemaRef.current) {
        const restored =
          augmentSchemaWithSheetTabs(originalSchemaRef.current, []) ||
          originalSchemaRef.current;
        setSchema(restored);
      }
      return;
    }

    const spreadsheetId = String(rawId).trim();
    if (!spreadsheetId) {
      setSheetMetadata(null);
      if (originalSchemaRef.current) {
        const restored =
          augmentSchemaWithSheetTabs(originalSchemaRef.current, []) ||
          originalSchemaRef.current;
        setSchema(restored);
      }
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSheetMetadata((prev) => ({
      spreadsheetId,
      tabs: prev?.spreadsheetId === spreadsheetId ? prev.tabs : [],
      status: "loading",
    }));

    fetchSheetTabs(spreadsheetId, { signal: controller.signal })
      .then(({ tabs, error: tabsError }) => {
        if (cancelled) return;
        if (tabsError) {
          setSheetMetadata({
            spreadsheetId,
            tabs: tabs ?? [],
            status: "error",
            error: tabsError || "Failed to load sheet metadata",
          });
          if (originalSchemaRef.current) {
            const restored =
              augmentSchemaWithSheetTabs(originalSchemaRef.current, []) ||
              originalSchemaRef.current;
            setSchema(restored);
          }
          return;
        }

        const safeTabs = Array.isArray(tabs) ? tabs : [];
        setSheetMetadata({ spreadsheetId, tabs: safeTabs, status: "success" });
        if (originalSchemaRef.current) {
          const augmented =
            augmentSchemaWithSheetTabs(originalSchemaRef.current, safeTabs) ||
            originalSchemaRef.current;
          setSchema(augmented);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message = err?.message || "Failed to load sheet metadata";
        setSheetMetadata({
          spreadsheetId,
          tabs: [],
          status: "error",
          error: message,
        });
        if (originalSchemaRef.current) {
          const restored =
            augmentSchemaWithSheetTabs(originalSchemaRef.current, []) ||
            originalSchemaRef.current;
          setSchema(restored);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [paramsDraft?.spreadsheetId]);
  // Commit helper: push a single param back to the graph node
  const commitParams = useCallback(
    (nextParams: any, reason = "parameter-change") => {
      if (!node) return;
      setParamsDraft(nextParams);
      rf.setNodes((nodes) =>
        nodes.map((n) => {
          if (n.id !== node.id) {
            return n;
          }
          const dataWithParams = syncNodeParameters(n.data, nextParams);
          const provisionalNode = {
            ...n,
            data: dataWithParams,
            params: nextParams,
            parameters: nextParams,
          };
          const derivedMetadata = buildMetadataFromNode(provisionalNode);
          return {
            ...n,
            data: {
              ...dataWithParams,
              metadata: {
                ...(dataWithParams?.metadata ?? {}),
                ...derivedMetadata,
              },
              outputMetadata: {
                ...(dataWithParams?.outputMetadata ?? {}),
                ...derivedMetadata,
              },
            },
          };
        }),
      );
      refreshNodeMetadata(nextParams, reason);
    },
    [node?.id, rf, refreshNodeMetadata],
  );

  const commitSingle = (name: string, value: any) => {
    const next = { ...(paramsDraft || {}), [name]: value };
    commitParams(next, "parameter-change");
  };

  useEffect(() => {
    if (!node) return;

    const handleAuthEvent = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail ?? {};
      if (detail?.nodeId && detail.nodeId !== node.id) {
        return;
      }
      if (
        event.type === "automation:auth-complete" &&
        typeof detail?.reason === "string" &&
        detail.reason === "connection"
      ) {
        // Connection events also dispatch auth-complete; avoid double refresh.
        return;
      }
      const mergedParams =
        detail?.params && typeof detail.params === "object"
          ? { ...(paramsDraft || {}), ...detail.params }
          : (paramsDraft ?? {});
      const reason =
        typeof detail?.reason === "string" && detail.reason.trim().length > 0
          ? detail.reason
          : event.type;
      refreshNodeMetadata(mergedParams, reason);
    };

    window.addEventListener("automation:connection-selected", handleAuthEvent);
    window.addEventListener("automation:auth-complete", handleAuthEvent);

    return () => {
      window.removeEventListener(
        "automation:connection-selected",
        handleAuthEvent,
      );
      window.removeEventListener("automation:auth-complete", handleAuthEvent);
    };
  }, [node?.id, paramsDraft, refreshNodeMetadata]);

  type FieldMode = "static" | "dynamic" | "llm";

  const isEvaluatedValue = (value: any): value is { mode: string } => {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "mode" in value
    );
  };

  const deriveFieldState = (
    value: any,
  ): {
    mode: FieldMode;
    staticValue: any;
    refNodeId?: string;
    refPath?: string;
  } => {
    if (isEvaluatedValue(value)) {
      if (value.mode === "ref") {
        return {
          mode: "dynamic",
          staticValue: "",
          refNodeId: value.nodeId,
          refPath: value.path,
        };
      }
      if (value.mode === "llm") {
        return { mode: "llm", staticValue: value };
      }
      if (value.mode === "static") {
        return { mode: "static", staticValue: value.value };
      }
    }

    // primitives fall back to static
    return { mode: "static", staticValue: value };
  };

  const setStaticValue = (name: string, inputValue: any) => {
    commitSingle(name, inputValue);
  };

  const setDynamicValue = (name: string, nodeId: string, path: string) => {
    const value = { mode: "ref", nodeId, path };
    commitSingle(name, value);
  };

  function ParameterField({ name, def }: { name: string; def: JSONSchema }) {
    const fieldDef = useMemo(() => {
      if (def?.enum) return def;
      const tabs = sheetMetadata?.tabs;
      if (!tabs || !tabs.length) return def;
      if (!SHEET_NAME_FIELD_CANDIDATES.includes(name.toLowerCase())) return def;
      return { ...def, enum: tabs };
    }, [def, name, sheetMetadata?.tabs]);

    const rawValue =
      paramsDraft?.[name] ?? fieldDef?.default ?? defaults?.[name] ?? "";
    const llmDefaults = useMemo(
      () =>
        createDefaultLLMValue(
          name,
          fieldDef,
          upstreamNodes as UpstreamNodeSummary[],
        ),
      [name, fieldDef, upstreamNodes],
    );
    const llmValue = useMemo(() => {
      if (isEvaluatedValue(rawValue) && rawValue.mode === "llm") {
        return mergeLLMValueWithDefaults(rawValue, llmDefaults);
      }
      return llmDefaults;
    }, [rawValue, llmDefaults]);
    const valueForDerivation = useMemo(() => {
      if (isEvaluatedValue(rawValue) && rawValue.mode === "llm") {
        return llmValue;
      }
      return rawValue;
    }, [rawValue, llmValue]);
    const { mode, staticValue, refNodeId, refPath } =
      deriveFieldState(valueForDerivation);
    const isRequired = schema?.required?.includes(name) || false;
    const [localStatic, setLocalStatic] = useState<any>(staticValue ?? "");
    const upstreamIds = useMemo(
      () => upstreamNodes.map((n) => n.id).join("|"),
      [upstreamNodes],
    );
    const [localRefNode, setLocalRefNode] = useState<string>(
      refNodeId || (upstreamNodes[0]?.id ?? ""),
    );
    const [localRefPath, setLocalRefPath] = useState<string>(refPath || "");

    useEffect(() => {
      if (mode === "llm") {
        return;
      }
      if (Array.isArray(staticValue)) {
        setLocalStatic(staticValue.join(","));
      } else if (typeof staticValue === "object" && staticValue !== null) {
        try {
          setLocalStatic(JSON.stringify(staticValue, null, 2));
        } catch {
          setLocalStatic(staticValue as any);
        }
      } else {
        setLocalStatic(staticValue != null ? String(staticValue) : "");
      }
    }, [staticValue, mode, node?.id]);

    useEffect(() => {
      setLocalRefNode(refNodeId || (upstreamNodes[0]?.id ?? ""));
      setLocalRefPath(refPath || "");
    }, [refNodeId, refPath, upstreamIds, upstreamNodes.length, node?.id]);

    const aiMappingUnavailable = aiCapability?.available === false;

    const handleModeChange = (nextMode: FieldMode) => {
      if (nextMode === mode) return;

      // Reset AI mapping state when switching modes
      setAiMapping({ isLoading: false, result: null, error: null });

      if (aiMappingUnavailable && nextMode === "llm") {
        setAiMapping({
          isLoading: false,
          result: null,
          error: AI_MAPPING_DISABLED_MESSAGE,
        });
        return;
      }

      if (nextMode === "static") {
        const initial = "";
        setLocalStatic(initial);
        setStaticValue(name, initial);
      } else if (nextMode === "dynamic") {
        const firstNode = upstreamNodes[0]?.id;
        if (!firstNode) {
          return;
        }
        setLocalRefNode(firstNode);
        setLocalRefPath("");
        setDynamicValue(name, firstNode, "");
      } else if (nextMode === "llm") {
        commitSingle(name, { ...llmValue });
      }
    };

    const renderStaticField = () =>
      renderStaticFieldControl(fieldDef, {
        fieldName: name,
        localStatic,
        setLocalStatic,
        commitValue: (value) => setStaticValue(name, value),
      });

    const renderDynamicField = () => {
      if (!upstreamNodes.length) {
        return (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
            Connect this node to a previous step to reference its output.
          </div>
        );
      }

      const handleApply = (nodeId: string, path: string) => {
        setDynamicValue(name, nodeId, path);
      };

      const suggestions = metadataSuggestions;

      const expressionPreview = `{{${localRefNode}${localRefPath ? `.${localRefPath}` : ""}}}`;

      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Source</span>
            <select
              value={localRefNode}
              onChange={(e) => {
                const id = e.target.value;
                setLocalRefNode(id);
                handleApply(id, localRefPath);
              }}
              className="flex-1 border border-slate-300 rounded px-3 py-2 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500/20 text-sm"
            >
              {upstreamNodes.map((upNode) => (
                <option key={upNode.id} value={upNode.id}>
                  {upNode.data?.label || upNode.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">
              Path (dot notation)
            </label>
            <Input
              value={localRefPath}
              onChange={(e) => setLocalRefPath(e.target.value)}
              onBlur={(e) => handleApply(localRefNode, e.target.value)}
              placeholder="e.g. row.email"
              className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
            />
          </div>

          {suggestions.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded p-2 max-h-36 overflow-y-auto space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                Quick Picks
              </div>
              {suggestions.map((sug) => (
                <button
                  key={`${sug.nodeId}:${sug.path}`}
                  type="button"
                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-50 text-slate-600"
                  onClick={() => {
                    setLocalRefNode(sug.nodeId);
                    setLocalRefPath(sug.path);
                    handleApply(sug.nodeId, sug.path);
                  }}
                >
                  {sug.label}
                  {sug.path && (
                    <span className="text-[10px] text-slate-400 ml-1">
                      ({sug.path})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="text-[11px] text-slate-400">
            Example: <code>{expressionPreview}</code>
          </div>
        </div>
      );
    };

    const [aiMapping, setAiMapping] = useState<{
      isLoading: boolean;
      result: {
        nodeId: string;
        path: string;
        confidence?: number;
        reason?: string;
      } | null;
      error: string | null;
    }>({ isLoading: false, result: null, error: null });

    const handleAIMapping = async () => {
      if (aiMappingUnavailable) {
        setAiMapping({
          isLoading: false,
          result: null,
          error: AI_MAPPING_DISABLED_MESSAGE,
        });
        return;
      }

      if (upstreamNodes.length === 0) {
        setAiMapping({
          isLoading: false,
          result: null,
          error: "No upstream nodes available for mapping",
        });
        return;
      }

      setAiMapping({ isLoading: true, result: null, error: null });

      try {
        // Prepare upstream data for AI analysis
        const upstreamData = mapUpstreamNodesForAI(
          upstreamNodes as UpstreamNodeSummary[],
        );

        const response = await fetch("/api/ai/map-params", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parameter: {
              name,
              nodeLabel: node?.data?.label,
              app,
              opId,
              description: fieldDef?.description || "",
              schema: fieldDef,
            },
            upstream: upstreamData,
            instruction: `Map the "${name}" parameter to the most appropriate upstream data. This parameter is for ${fieldDef?.description || "the current operation"}.`,
          }),
        });

        const result = await response.json();

        if (response.status === 503 && result?.code === "ai_mapping_disabled") {
          setAiMapping({
            isLoading: false,
            result: null,
            error: AI_MAPPING_DISABLED_MESSAGE,
          });
          return;
        }

        if (!response.ok) {
          setAiMapping({
            isLoading: false,
            result: null,
            error: result?.error || "AI mapping failed",
          });
          return;
        }

        if (result.success && result.mapping) {
          setAiMapping({
            isLoading: false,
            result: result.mapping,
            error: null,
          });

          // Apply the AI mapping result
          if (result.mapping.nodeId && result.mapping.path) {
            setDynamicValue(name, result.mapping.nodeId, result.mapping.path);
            setLocalRefNode(result.mapping.nodeId);
            setLocalRefPath(result.mapping.path);
          }
        } else {
          setAiMapping({
            isLoading: false,
            result: null,
            error: result.error || "AI mapping failed",
          });
        }
      } catch (error) {
        console.error("AI mapping error:", error);
        const fallbackMessage =
          error instanceof Error
            ? error.message
            : "Failed to connect to AI service";
        setAiMapping({
          isLoading: false,
          result: null,
          error: fallbackMessage || "Failed to connect to AI service",
        });
      }
    };

    useEffect(() => {
      if (aiMappingUnavailable && mode === "llm") {
        setAiMapping({
          isLoading: false,
          result: null,
          error: AI_MAPPING_DISABLED_MESSAGE,
        });
        handleModeChange("static");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiMappingUnavailable, mode]);

    const renderLLMField = () => (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAIMapping}
            disabled={
              aiMapping.isLoading ||
              upstreamNodes.length === 0 ||
              aiMappingUnavailable
            }
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {aiMapping.isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                Map with AI
              </>
            )}
          </button>

          {upstreamNodes.length === 0 && (
            <span className="text-xs text-slate-500">
              Connect upstream nodes first
            </span>
          )}
          {aiMappingUnavailable && (
            <span className="text-xs text-slate-500">
              {AI_MAPPING_DISABLED_MESSAGE}
            </span>
          )}
        </div>

        {aiMapping.result && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-green-600 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <div className="flex-1">
                <div className="text-sm font-medium text-green-800">
                  AI Mapping Applied
                </div>
                <div className="text-xs text-green-700 mt-1">
                  Mapped to:{" "}
                  <code className="bg-green-100 px-1 rounded">
                    {aiMapping.result.nodeId}.{aiMapping.result.path}
                  </code>
                </div>
                {aiMapping.result.confidence && (
                  <div className="text-xs text-green-600 mt-1">
                    Confidence: {Math.round(aiMapping.result.confidence * 100)}%
                  </div>
                )}
                {aiMapping.result.reason && (
                  <div className="text-xs text-green-600 mt-1">
                    {aiMapping.result.reason}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {aiMapping.error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-red-600 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <div className="text-sm font-medium text-red-800">
                  AI Mapping Failed
                </div>
                <div className="text-xs text-red-700 mt-1">
                  {aiMapping.error}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2">
          <strong>AI Mapping:</strong> Analyzes upstream data and automatically
          maps the most appropriate field based on semantic similarity and data
          types.
        </div>
      </div>
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">
            {fieldDef.title || name}{" "}
            {isRequired ? <span className="text-red-500">*</span> : null}
          </div>
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as FieldMode)}
            className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
          >
            <option value="static">Static</option>
            <option value="dynamic" disabled={!upstreamNodes.length}>
              Dynamic
            </option>
            <option
              value="llm"
              disabled={!upstreamNodes.length || aiMappingUnavailable}
            >
              AI Mapping
            </option>
          </select>
        </div>

        {mode === "static" && renderStaticField()}
        {mode === "dynamic" && renderDynamicField()}
        {mode === "llm" && renderLLMField()}

        {fieldDef.description ? (
          <p className="text-xs text-slate-500">{fieldDef.description}</p>
        ) : null}
      </div>
    );
  }

  function FieldsFromSchema({ schema }: { schema: JSONSchema }) {
    const props = schema?.properties || {};
    const keys = Object.keys(props);

    if (!keys.length) {
      return (
        <div className="text-center py-8 text-gray-500">
          <div className="text-sm">No parameters required</div>
          <div className="text-xs mt-1">
            This operation works without configuration
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {keys.map((k) => {
          const def = props[k];

          return (
            <div
              key={k}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
            >
              <ParameterField name={k} def={def} />
            </div>
          );
        })}
      </div>
    );
  }

  if (!node) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="text-sm font-medium">No Node Selected</div>
        <div className="text-xs mt-1">Select a node to edit its parameters</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
          Smart Parameters
        </div>
        <div className="text-sm font-semibold text-gray-900">
          {node.data?.label || `${app} • ${opId}`}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {node.data?.description ||
            "Configure the parameters for this operation"}
        </div>
      </div>

      {(onRefreshConnectors || metadataError) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Connector metadata
            </span>
            {onRefreshConnectors && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onRefreshConnectors?.()}
                disabled={isRefreshingConnectors}
                className="text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-2" />
                {isRefreshingConnectors ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </div>
          {metadataError && !isRefreshingConnectors && (
            <div className="text-xs text-red-600">
              Failed to load the latest connector schema.
              {metadataError?.message
                ? ` ${metadataError.message}`
                : " Using cached definitions."}
            </div>
          )}
          {isRefreshingConnectors && (
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Updating definitions…
            </div>
          )}
        </div>
      )}

      {metadataRefreshState.status === "loading" && (
        <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span>Refreshing metadata suggestions…</span>
        </div>
      )}

      {metadataRefreshState.status === "error" &&
        metadataRefreshState.error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            Metadata refresh failed: {metadataRefreshState.error}
          </div>
        )}

      {sheetMetadata?.status === "error" && sheetMetadata.error && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Sheet tabs unavailable: {sheetMetadata.error}
        </div>
      )}

      {/* Loading/Error/Content states */}
      {loading ? (
        <div className="text-center py-4 text-gray-500">
          <div className="animate-pulse">Loading parameter schema...</div>
          <div className="text-xs mt-1">
            Fetching {String(app)} • {String(opId || node?.data?.label || "")}
          </div>
        </div>
      ) : error ? (
        <div className="text-center py-4 text-red-500">
          <div className="text-sm">Schema error: {error}</div>
          <div className="text-xs mt-1 text-gray-500">
            Check console for details
          </div>
        </div>
      ) : schema ? (
        <FieldsFromSchema schema={schema} />
      ) : (
        <div className="text-center py-4 text-gray-500">
          <div className="text-sm">No parameters for this operation</div>
          <div className="text-xs mt-1">
            This operation works without configuration
          </div>
        </div>
      )}

      {/* Debug info in development */}
      {process.env.NODE_ENV === "development" && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-gray-400">Debug Info</summary>
          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-auto">
            App: {app}
            {"\n"}
            Operation: {String(opId || node?.data?.label || "")}
            {"\n"}
            Current Params: {JSON.stringify(paramsDraft, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export default SmartParametersPanel;
