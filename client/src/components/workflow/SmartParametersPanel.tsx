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

type DynamicOption = {
  label: string;
  value: string;
  group: string;
  description?: string;
};

const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9_]/g, '_');

const flattenSample = (value: any, basePath = '', labelPath: string[] = [], acc: Array<{ path: string; label: string }> = []) => {
  if (value === null || value === undefined) return acc;
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      const path = `${basePath}[${idx}]`;
      const label = [...labelPath, `Index ${idx}`];
      flattenSample(item, path, label, acc);
    });
    return acc;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, val]) => {
      const safeKey = sanitizeKey(key);
      const path = basePath ? `${basePath}.${safeKey}` : `.${safeKey}`;
      const label = [...labelPath, key];
      flattenSample(val, path, label, acc);
    });
    return acc;
  }
  const label = labelPath.join(' › ') || basePath;
  acc.push({ path: basePath, label });
  return acc;
};

const gatherColumnNames = (metadata: Record<string, any> = {}) => {
  const candidateKeys = ['columns', 'columnNames', 'headers', 'headerRow', 'fields', 'fieldNames'];
  const names: string[] = [];
  candidateKeys.forEach((key) => {
    const value = metadata?.[key];
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === 'string') {
          if (entry.trim()) names.push(entry.trim());
        } else if (entry && typeof entry === 'object') {
          const label = entry?.name || entry?.label || entry?.title;
          if (typeof label === 'string' && label.trim()) names.push(label.trim());
        }
      });
    }
  });
  return Array.from(new Set(names));
};

const gatherSampleStructures = (metadata: Record<string, any> = {}) => {
  const sampleKeys = ['sampleRow', 'sample', 'example', 'exampleRow', 'mock', 'previewRow', 'previewSample', 'outputExample'];
  const samples: any[] = [];
  sampleKeys.forEach((key) => {
    const val = metadata?.[key];
    if (val) samples.push(val);
  });
  return samples;
};

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
  const app = node?.data?.app || node?.data?.connectorId || node?.data?.provider || "";
  const opId = node?.data?.actionId
    ?? node?.data?.function
    ?? node?.data?.triggerId
    ?? node?.data?.eventId
    ?? node?.data?.id
    ?? node?.data?.label;
  const [schema, setSchema] = useState<JSONSchema | null>(null);
  const [defaults, setDefaults] = useState<any>({});
  const [params, setParams] = useState<any>(node?.data?.parameters ?? {});
  const [dynamicOptions, setDynamicOptions] = useState<DynamicOption[]>([]);

  // ChatGPT Panel Root Cause Fix: Proper loading states and error handling
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load schema when node/app/op changes
  useEffect(() => {
    if (!app) return;
    setLoading(true);
    setError(null);
    setSchema(null);
    setDefaults({});

    const kind = node?.data?.kind || (String(node?.type||"").startsWith("trigger") ? "trigger" : "auto");

    const normalize = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const appKey = normalize(app);
    const opKey = normalize(opId);

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

            const match = list.find((c: any) => {
              const title = normalize(c?.name || c?.title);
              const id = normalize(c?.id);
              return title === appKey || id === appKey || title.includes(appKey) || appKey.includes(title);
            });
            if (match) {
              // search actions and triggers arrays
              const pools = [match.actions || [], match.triggers || []];
              let found: any = null;
              const opCandidates = [opKey, normalize(node?.data?.label)].filter(Boolean);
              for (const pool of pools) {
                found = pool.find((a: any) => {
                  const aid = normalize(a?.id);
                  const aname = normalize(a?.name || a?.title);
                  const variants = [aid, aname, aid.replace(/_/g,' '), aname.replace(/_/g,' '), aid.replace(/\s/g,'_'), aname.replace(/\s/g,'_')];
                  return opCandidates.some(c => variants.includes(c));
                });
                if (found) break;
              }
              if (!found && pools[0].length) {
                // last resort: if only one action/trigger and op unknown, use it
                const all = [...pools[0], ...pools[1]];
                if (all.length === 1) found = all[0];
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

  useEffect(() => {
    if (!node) {
      setDynamicOptions([]);
      return;
    }

    const optionMap = new Map<string, DynamicOption>();
    const addOption = (option: DynamicOption) => {
      if (!option?.value) return;
      if (!optionMap.has(option.value)) optionMap.set(option.value, option);
    };

    upstreamNodes.forEach((upNode) => {
      if (!upNode) return;
      const groupLabel = upNode.data?.label || upNode.data?.name || upNode.id;
      const group = groupLabel || upNode.id;

      addOption({
        label: `${groupLabel} • Entire output`,
        value: `{{${upNode.id}}}`,
        group,
      });

      const metadata = upNode.data?.metadata || {};
      const columnNames = gatherColumnNames(metadata);
      if (columnNames.length) {
        columnNames.forEach((name, index) => {
          addOption({
            label: `${groupLabel} • ${name}`,
            value: `{{${upNode.id}.values[${index}]}}`,
            group,
            description: 'Column from upstream data',
          });
        });
      }

      const samples = gatherSampleStructures(metadata);
      samples.forEach((sample) => {
        const flattened = flattenSample(sample);
        flattened.forEach(({ path, label }) => {
          if (!path) return;
          addOption({
            label: `${groupLabel} • ${label}`,
            value: `{{${upNode.id}${path}}}`,
            group,
          });
        });
      });

      if (!columnNames.length && !samples.length) {
        for (let idx = 0; idx < 10; idx++) {
          const colLabel = String.fromCharCode(65 + idx);
          addOption({
            label: `${groupLabel} • Column ${colLabel}`,
            value: `{{${upNode.id}.values[${idx}]}}`,
            group,
          });
        }
      }
    });

    setDynamicOptions(Array.from(optionMap.values()));
  }, [node?.id, upstreamNodes]);

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

    // Lightweight dynamic binding support (expressions like {{nodeId.field}})
    const [showFx, setShowFx] = useState(false);
    const [autoStatus, setAutoStatus] = useState<string | null>(null);

    useEffect(() => {
      setAutoStatus(null);
    }, [name, node?.id]);

    const groupedDynamicOptions = useMemo(() => {
      return dynamicOptions.reduce<Record<string, DynamicOption[]>>((acc, option) => {
        const group = option.group || 'Connected Nodes';
        if (!acc[group]) acc[group] = [];
        acc[group].push(option);
        return acc;
      }, {});
    }, [dynamicOptions]);

    const hasDynamicOptions = dynamicOptions.length > 0;

    const stopPropagation = (e: any) => {
      if (!e) return;
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (e.nativeEvent) {
        if (typeof e.nativeEvent.stopPropagation === 'function') e.nativeEvent.stopPropagation();
        if (typeof e.nativeEvent.stopImmediatePropagation === 'function') e.nativeEvent.stopImmediatePropagation();
      }
    };

    const insertExpr = (expr: string, label?: string) => {
      onChange(expr);
      setShowFx(false);
      setAutoStatus(label ? `Mapped from ${label}` : `Mapped from ${expr}`);
    };

    const handleAutoMap = () => {
      if (!hasDynamicOptions) {
        setAutoStatus('No connected data available yet.');
        setShowFx(true);
        return;
      }

      const fieldName = (def?.title || name || '').toLowerCase();
      const guess = dynamicOptions.find((opt) => opt.label.toLowerCase().includes(fieldName));
      const emailGuess = /email|mail/.test(fieldName)
        ? dynamicOptions.find((opt) => /email|mail/.test(opt.label.toLowerCase()))
        : undefined;
      const selection = guess || emailGuess || dynamicOptions[0];

      if (selection) {
        insertExpr(selection.value, selection.label);
      } else {
        setAutoStatus('Unable to infer a matching field. Choose one manually.');
        setShowFx(true);
      }
    };

    const renderDynamicPicker = () => (
      <div className="mt-2 w-full border rounded p-3 bg-gray-50 max-h-60 overflow-y-auto space-y-3">
        {hasDynamicOptions ? (
          Object.entries(groupedDynamicOptions).map(([group, options]) => (
            <div key={group} className="space-y-1">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{group}</div>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="w-full text-left px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-blue-50 text-gray-700 text-xs"
                  onClick={() => insertExpr(opt.value, opt.label)}
                >
                  <div className="font-medium">{opt.label}</div>
                  {opt.description ? <div className="text-[10px] text-gray-500">{opt.description}</div> : null}
                  <div className="text-[10px] text-gray-400 mt-0.5">{opt.value}</div>
                </button>
              ))}
            </div>
          ))
        ) : (
          <div className="text-xs text-gray-500">
            Connect this node to an upstream step to reference its output.
          </div>
        )}
      </div>
    );

    const inputEventHandlers = {
      onKeyDown: stopPropagation,
      onPointerDown: stopPropagation,
      onMouseDown: stopPropagation,
      onPaste: stopPropagation,
    } as const;

    const renderFxControls = () => (
      <div className="mt-1 flex items-center gap-2 text-xs">
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={() => setShowFx((v) => !v)}
        >
          Use dynamic value (fx)
        </button>
        <span className="text-gray-300">•</span>
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={handleAutoMap}
        >
          Auto-map
        </button>
      </div>
    );

    const renderFxStatus = () => (
      autoStatus ? <div className="text-[11px] text-emerald-600 mt-1">{autoStatus}</div> : null
    );

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
            {...inputEventHandlers}
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
                {...inputEventHandlers}
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
              {...inputEventHandlers}
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
              {...inputEventHandlers}
            />
            {renderFxControls()}
            {renderFxStatus()}
            {showFx && renderDynamicPicker()}
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
              {...inputEventHandlers}
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
              {...inputEventHandlers}
            />
            {renderFxControls()}
            {renderFxStatus()}
            {showFx && renderDynamicPicker()}
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
            Current Params: {JSON.stringify(params, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export default SmartParametersPanel;
