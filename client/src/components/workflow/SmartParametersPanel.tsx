/**
 * ChatGPT Schema Fix: Smart Parameters Panel
 * 
 * Renders actual parameter fields from JSON schema instead of showing
 * the schema object itself. Provides proper form inputs for each parameter type.
 */

import { useEffect, useMemo, useState } from "react";
import { useReactFlow, useStore } from "reactflow";

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

export function SmartParametersPanel() {
  const rf = useReactFlow();
  const selected = useStore((s) => s.getNodes().filter(n => n.selected));
  const node = selected[0];

  const app = node?.data?.app;
  const opId = node?.data?.actionId ?? node?.data?.function; // support both
  const [schema, setSchema] = useState<JSONSchema | null>(null);
  const [defaults, setDefaults] = useState<any>({});
  const [params, setParams] = useState<any>(node?.data?.parameters ?? {});

  // ChatGPT Panel Root Cause Fix: Proper loading states and error handling
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load schema when node/app/op changes
  useEffect(() => {
    if (!app || !opId) return;
    setLoading(true);
    setError(null);
    setSchema(null);
    setDefaults({});

    const kind = node?.data?.kind || "auto"; // Support trigger/action distinction
    
    fetch(`/api/registry/op-schema?app=${encodeURIComponent(app)}&op=${encodeURIComponent(opId)}&kind=${kind}`)
      .then(r => r.json())
      .then(async (j) => {
        if (!j?.success) {
          setError(j?.error || "Failed to load schema");
          setSchema({type:"object",properties:{}});
          return;
        }
        let nextSchema = j.schema || { type: "object", properties: {} };
        let nextDefaults = j.defaults || {};

        // Fallback: if schema has no properties, derive from connectors payload
        const empty = !nextSchema?.properties || Object.keys(nextSchema.properties).length === 0;
        if (empty) {
          try {
            const connectorsRes = await fetch('/api/registry/connectors');
            const connectorsJson = await connectorsRes.json();
            const list = connectorsJson?.connectors || [];
            // match by name OR id case-insensitive
            const normalize = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const appLc = normalize(app);
            const match = list.find((c: any) => {
              const title = normalize(c?.name || c?.title);
              const id = normalize(c?.id);
              return title === appLc || id === appLc;
            });
            if (match) {
              // search actions and triggers arrays
              const pools = [match.actions || [], match.triggers || []];
              let found: any = null;
              const opCandidates = [opId, node?.data?.label].map(normalize);
              for (const pool of pools) {
                found = pool.find((a: any) => {
                  const aid = normalize(a?.id);
                  const aname = normalize(a?.name || a?.title);
                  // allow underscore/hyphen/space variants
                  const variants = [aid, aname, aid.replace(/_/g,' '), aname.replace(/_/g,' '), aid.replace(/\s/g,'_'), aname.replace(/\s/g,'_')];
                  return opCandidates.some(c => variants.includes(c));
                });
                if (found) break;
              }
              if (found && found.parameters && found.parameters.properties) {
                nextSchema = found.parameters;
                nextDefaults = found.defaults || {};
              }
            }
          } catch (e) {
            // ignore fallback errors, keep empty schema
          }
        }

        setSchema(nextSchema);
        setDefaults(nextDefaults);
        const next = { ...(nextDefaults || {}), ...(node?.data?.parameters || {}) };
        setParams(next);
      })
      .catch(e => { 
        setError(String(e)); 
        setSchema({type:"object",properties:{}}); 
      })
      .finally(() => setLoading(false));
  }, [app, opId, node?.id]);

  // Persist edits back to the graph node
  useEffect(() => {
    if (!node) return;
    rf.setNodes((nodes) =>
      nodes.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, parameters: params } } : n
      )
    );
  }, [params, node?.id, rf]);

  // --- Renderers ---
  const requiredSet = useMemo(() => new Set(schema?.required || []), [schema]);

  function Field({ name, def }: { name: string; def: JSONSchema }) {
    const value = params?.[name] ?? def?.default ?? defaults?.[name] ?? "";
    const isRequired = requiredSet.has(name);
    const type = def?.type || (def?.enum ? "string" : "string");

    const onChange = (v: any) => setParams((p: any) => ({ ...p, [name]: v }));

    if (def?.enum && Array.isArray(def.enum)) {
      return (
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">
            {def.title || name} {isRequired ? <span className="text-red-500">*</span> : null}
          </label>
          <select
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">-- select --</option>
            {def.enum.map((opt: any) => (
              <option key={String(opt)} value={opt}>
                {String(opt)}
              </option>
            ))}
          </select>
          {def.description ? <p className="text-xs text-gray-500 mt-1">{def.description}</p> : null}
        </div>
      );
    }

    switch (type) {
      case "boolean":
        return (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => onChange(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label className="text-sm font-medium">
                {def.title || name} {isRequired ? <span className="text-red-500">*</span> : null}
              </label>
            </div>
            {def.description ? <p className="text-xs text-gray-500 mt-1">{def.description}</p> : null}
          </div>
        );
      case "number":
      case "integer":
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              {def.title || name} {isRequired ? <span className="text-red-500">*</span> : null}
            </label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={value}
              onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
              min={def.minimum as any}
              max={def.maximum as any}
              placeholder={def.description || `Enter ${name}`}
            />
            {def.description ? <p className="text-xs text-gray-500 mt-1">{def.description}</p> : null}
          </div>
        );
      case "array":
        // simple CSV editor; you can enhance to chips UI
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              {def.title || name} (comma-separated) {isRequired ? <span className="text-red-500">*</span> : null}
            </label>
            <input
              className="w-full border border-gray-300 rounded px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={Array.isArray(value) ? value.join(",") : value}
              onChange={(e) =>
                onChange(
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="item1, item2, item3"
            />
            {def.description ? <p className="text-xs text-gray-500 mt-1">{def.description}</p> : null}
          </div>
        );
      case "object":
        // nested object: show a JSON textarea fallback
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              {def.title || name} (JSON) {isRequired ? <span className="text-red-500">*</span> : null}
            </label>
            <textarea
              className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              rows={4}
              value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}
              onChange={(e) => {
                try {
                  const v = JSON.parse(e.target.value);
                  onChange(v);
                } catch {
                  onChange(e.target.value); // keep raw string until valid
                }
              }}
              placeholder="{ }"
            />
            {def.description ? <p className="text-xs text-gray-500 mt-1">{def.description}</p> : null}
          </div>
        );
      default:
        // string, email, url, etc.
        const inputType = def?.format === "email" ? "email" : 
                         def?.format === "uri" ? "url" :
                         def?.format === "date" ? "date" :
                         def?.format === "datetime-local" ? "datetime-local" :
                         "text";
        
        return (
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              {def.title || name} {isRequired ? <span className="text-red-500">*</span> : null}
            </label>
            <input
              type={inputType}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={def?.description || def?.format || `Enter ${name}`}
            />
            {def.description ? <p className="text-xs text-gray-500 mt-1">{def.description}</p> : null}
          </div>
        );
    }
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
      <div className="space-y-1">
        {keys.map((k) => (
          <Field key={k} name={k} def={props[k]} />
        ))}
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
    <div className="p-4 bg-white border-l border-gray-200 h-full overflow-y-auto">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Smart Parameters</div>
        <div className="text-sm font-semibold text-gray-900">
          {node.data?.label || `${app} • ${opId}`}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {node.data?.description || 'Configure the parameters for this operation'}
        </div>
      </div>
      
      {/* ChatGPT Panel Root Cause Fix: Proper loading/error/empty states */}
      {loading ? (
        <div className="text-center py-4 text-gray-500">
          <div className="animate-pulse">Loading parameter schema...</div>
          <div className="text-xs mt-1">Fetching {String(app)} • {String(opId)}</div>
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
            Operation: {opId}{'\n'}
            Current Params: {JSON.stringify(params, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export default SmartParametersPanel;