/**
 * Smart Parameters Panel - Simplified Implementation
 * 
 * Uses the same pattern as Label and Description fields for consistency
 */

import { useEffect, useMemo, useState } from "react";
import { useReactFlow, useStore } from "reactflow";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

type JSONSchema = {
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

const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9_]/g, '_');

export function SmartParametersPanel() {
  const rf = useReactFlow();
  const storeNodes = useStore((s) => (typeof s.getNodes === 'function' ? s.getNodes() : (s as any).nodes) || []);
  const storeEdges = useStore((s) => (typeof s.getEdges === 'function' ? s.getEdges() : (s as any).edges) || []);
  const selected = useMemo(() => storeNodes.filter((n: any) => n.selected), [storeNodes]);
  const node = selected[0];

  const upstreamNodes = useMemo(() => {
    if (!node) return [] as any[];
    const upstreamIds = new Set(
      (storeEdges as any[])
        .filter((edge) => edge?.target === node.id)
        .map((edge) => edge?.source)
        .filter(Boolean)
    );
    return (storeNodes as any[]).filter((n) => upstreamIds.has(n.id));
  }, [node?.id, storeEdges, storeNodes]);

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
    const direct = canonicalizeAppId(node?.data?.app || node?.data?.connectorId || node?.data?.provider);
    if (direct) return direct;
    if (rawNodeType) {
      const match = rawNodeType.match(/^(?:trigger|action|transform)[.:]([^.:]+)/i);
      if (match?.[1]) return canonicalizeAppId(match[1]);
    }
    return "";
  };

  const inferOpId = (): string => {
    const direct = node?.data?.actionId
      ?? node?.data?.function
      ?? node?.data?.triggerId
      ?? node?.data?.eventId;
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
  const [defaults, setDefaults] = useState<any>({});
  const [paramsDraft, setParamsDraft] = useState<any>(node?.data?.parameters ?? {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load schema when node/app/op changes
  useEffect(() => {
    if (!app) return;
    setLoading(true);
    setError(null);
    setSchema(null);
    setDefaults({});
    setParamsDraft(node?.data?.parameters ?? {});

    const kind = node?.data?.kind || (String(rawNodeType||"").startsWith("trigger") ? "trigger" : "auto");

    const normalize = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const appKey = canonicalizeAppId(app);
    const opKey = canonicalizeAppId(opId);

    const opSchemaUrl = opId 
      ? `/api/registry/op-schema?app=${encodeURIComponent(app)}&op=${encodeURIComponent(opId)}&kind=${kind}`
      : "";

    const tryOpSchema = opSchemaUrl
      ? fetch(opSchemaUrl).then(r => r.json()).catch(() => ({ success: false }))
      : Promise.resolve({ success: false });

    tryOpSchema
      .then(async (j) => {
        if (!j?.success) {
          setError(j?.error || "Failed to load schema");
          j = { success: false } as any;
        }
        let nextSchema = j.schema || { type: "object", properties: {} };
        let nextDefaults = j.defaults || {};

        // Fallback: if schema has no properties, derive from connectors payload
        const empty = !nextSchema?.properties || Object.keys(nextSchema.properties).length === 0;
        if (empty) {
          try {
            const res = await fetch('/api/registry/catalog');
            const json = await res.json();
            const connectorsMap = json?.catalog?.connectors || {};

            const list = Object.entries(connectorsMap).map(([id, def]: any) => ({
              id,
              name: def?.name,
              actions: def?.actions || [],
              triggers: def?.triggers || []
            }));

            const match = list.find((c: any) => {
              const title = canonicalizeAppId(c?.name);
              const id = canonicalizeAppId(c?.id);
              return title === appKey || id === appKey || title.includes(appKey) || appKey.includes(title);
            });
            if (match) {
              const pools = [match.actions || [], match.triggers || []];
              let found: any = null;
              const opCandidates = [opKey, canonicalizeAppId(node?.data?.label || node?.data?.name)].filter(Boolean);
              for (const pool of pools) {
                found = pool.find((a: any) => {
                  const aid = canonicalizeAppId(a?.id);
                  const aname = canonicalizeAppId(a?.name || a?.title);
                  const variants = [aid, aname, aid.replace(/-/g,'_'), aname.replace(/-/g,'_')];
                  return opCandidates.some(c => variants.includes(c));
                });
                if (found) break;
              }
              if (!found && (match.actions?.length || match.triggers?.length)) {
                const all = [...(match.actions || []), ...(match.triggers || [])];
                if (all.length === 1) found = all[0];
              }
              if (found && found.parameters && found.parameters.properties && Object.keys(found.parameters.properties).length > 0) {
                nextSchema = found.parameters;
                nextDefaults = found.defaults || {};
              }
            }
          } catch (e) {
            // ignore fallback errors
          }
        }

        // Heuristic fallback for common operations when schema is still empty
        if (!nextSchema?.properties || Object.keys(nextSchema.properties).length === 0) {
          const appL = String(app).toLowerCase();
          const opL = String(opId).toLowerCase();
          const labelL = String(node?.data?.label || '').toLowerCase();
          
          if ((appL.includes('sheets') || labelL.includes('sheet')) && (opL.includes('row') || labelL.includes('row')) && (opL.includes('add') || opL.includes('added') || labelL.includes('add'))) {
            nextSchema = {
              type: 'object',
              properties: {
                spreadsheetId: { type: 'string', title: 'spreadsheetId', description: 'Spreadsheet ID to monitor' },
                sheetName: { type: 'string', title: 'sheetName', description: 'Specific sheet name to monitor' }
              },
              required: ['spreadsheetId']
            } as any;
          }
          if (appL.includes('gmail') && (opL.includes('send') || opL.includes('email'))) {
            nextSchema = {
              type: 'object',
              properties: {
                to: { type: 'array', items: { type: 'string' }, title: 'to', description: 'Recipient email addresses' },
                subject: { type: 'string', title: 'subject', description: 'Email subject' },
                body: { type: 'string', title: 'body', description: 'Email body (text or HTML)' }
              },
              required: ['to','subject','body']
            } as any;
          }
          if (appL.includes('google-chat') && (opL.includes('message') || labelL.includes('message'))) {
            nextSchema = {
              type: 'object',
              properties: {
                space: { type: 'string', title: 'space', description: 'Filter by specific space' }
              },
              required: []
            } as any;
          }
        }

        setSchema(nextSchema);
        setDefaults(nextDefaults);
        const next = { ...(nextDefaults || {}), ...(node?.data?.parameters || {}) };
        setParamsDraft(next);
      })
      .catch(e => { 
        setError(String(e)); 
        setSchema({type:"object",properties:{}}); 
      })
      .finally(() => setLoading(false));
  }, [app, opId, node?.id]);

  // Commit helper: push a single param back to the graph node
  const commitParams = (nextParams: any) => {
    if (!node) return;
    setParamsDraft(nextParams);
    rf.setNodes((nodes) =>
      nodes.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, parameters: nextParams } } : n))
    );
  };

  const commitSingle = (name: string, value: any) => {
    const next = { ...(paramsDraft || {}), [name]: value };
    commitParams(next);
  };

  // Simple field component - exactly like Label/Description fields
  function SimpleField({ name, def }: { name: string; def: JSONSchema }) {
    const value = paramsDraft?.[name] ?? def?.default ?? defaults?.[name] ?? "";
    const isRequired = schema?.required?.includes(name) || false;
    const type = def?.type || (def?.enum ? "string" : "string");

    const onChange = (newValue: any) => {
      setParamsDraft((p: any) => ({ ...p, [name]: newValue }));
    };

    const onBlur = () => {
      commitSingle(name, value);
    };

    // Simple text input for most cases
    if (type === "string" || type === "text") {
      const inputType = def?.format === "email" ? "email" : 
                       def?.format === "uri" ? "url" :
                       def?.format === "date" ? "date" :
                       def?.format === "datetime-local" ? "datetime-local" :
                       "text";
      
      return (
        <Input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={def?.description || def?.format || `Enter ${name}`}
          className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
        />
      );
    }

    // Number input
    if (type === "number" || type === "integer") {
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          onBlur={onBlur}
          min={def.minimum as any}
          max={def.maximum as any}
          placeholder={def.description || `Enter ${name}`}
          className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
        />
      );
    }

    // Boolean checkbox
    if (type === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            onBlur={onBlur}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label className="text-sm text-slate-700">
            {def.title || name} {isRequired ? <span className="text-red-500">*</span> : null}
          </label>
        </div>
      );
    }

    // Select dropdown
    if (def?.enum && Array.isArray(def.enum)) {
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full border border-slate-300 rounded px-3 py-2 bg-slate-50 text-slate-900 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
        >
          <option value="">-- select --</option>
          {def.enum.map((opt: any) => (
            <option key={String(opt)} value={opt}>
              {String(opt)}
            </option>
          ))}
        </select>
      );
    }

    // Array as comma-separated text
    if (type === "array") {
      return (
        <Input
          value={Array.isArray(value) ? value.join(",") : value}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          onBlur={onBlur}
          placeholder="item1, item2, item3"
          className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
        />
      );
    }

    // Object as textarea (JSON)
    if (type === "object") {
      return (
        <Textarea
          value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(e) => {
            try {
              const v = JSON.parse(e.target.value);
              onChange(v);
            } catch {
              onChange(e.target.value); // keep raw string until valid
            }
          }}
          onBlur={onBlur}
          placeholder="{ }"
          rows={3}
          className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors resize-none font-mono text-sm"
        />
      );
    }

    // Default to text input
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={def?.description || `Enter ${name}`}
        className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
      />
    );
  }

  function FieldsFromSchema({ schema }: { schema: JSONSchema }) {
    const props = schema?.properties || {};
    const keys = Object.keys(props);
    
    if (!keys.length) {
      return (
        <div className="text-center py-8 text-gray-500">
          <div className="text-sm">No parameters required</div>
          <div className="text-xs mt-1">This operation works without configuration</div>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        {keys.map((k) => {
          const def = props[k];
          const isRequired = schema?.required?.includes(k) || false;
          
          return (
            <div key={k} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <label className="text-sm font-semibold text-slate-700 mb-3 block">
                {def.title || k} {isRequired ? <span className="text-red-500">*</span> : null}
              </label>
              <SimpleField name={k} def={def} />
              {def.description ? (
                <p className="text-xs text-slate-500 mt-2">{def.description}</p>
              ) : null}
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
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Smart Parameters</div>
        <div className="text-sm font-semibold text-gray-900">
          {node.data?.label || `${app} • ${opId}`}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {node.data?.description || 'Configure the parameters for this operation'}
        </div>
      </div>
      
      {/* Loading/Error/Content states */}
      {loading ? (
        <div className="text-center py-4 text-gray-500">
          <div className="animate-pulse">Loading parameter schema...</div>
          <div className="text-xs mt-1">Fetching {String(app)} • {String(opId || node?.data?.label || '')}</div>
        </div>
      ) : error ? (
        <div className="text-center py-4 text-red-500">
          <div className="text-sm">Schema error: {error}</div>
          <div className="text-xs mt-1 text-gray-500">Check console for details</div>
        </div>
      ) : schema ? (
        <FieldsFromSchema schema={schema} />
      ) : (
        <div className="text-center py-4 text-gray-500">
          <div className="text-sm">No parameters for this operation</div>
          <div className="text-xs mt-1">This operation works without configuration</div>
        </div>
      )}
      
      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-gray-400">Debug Info</summary>
          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-auto">
            App: {app}{'\n'}
            Operation: {String(opId || node?.data?.label || '')}{'\n'}
            Current Params: {JSON.stringify(paramsDraft, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export default SmartParametersPanel;