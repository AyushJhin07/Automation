/**
 * ChatGPT Schema Fix: Smart Parameters Panel
 * 
 * Renders actual parameter fields from JSON schema instead of showing
 * the schema object itself. Provides proper form inputs for each parameter type.
 */

import { useEffect, useMemo, useState } from "react";
import { useReactFlow, useStore } from "reactflow";
import { Input } from "../ui/input";

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
  // Draft parameters: editable locally; commit to graph on blur or explicit actions
  const [paramsDraft, setParamsDraft] = useState<any>(node?.data?.parameters ?? {});
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
          // proceed to heuristic fallback instead of early return
          j = { success: false } as any;
        }
        let nextSchema = j.schema || { type: "object", properties: {} };
        let nextDefaults = j.defaults || {};

        // Fallback: if schema has no properties, derive from connectors payload
        const empty = !nextSchema?.properties || Object.keys(nextSchema.properties).length === 0;
        if (empty) {
          try {
            // Use node catalog (has actions/triggers with full parameter schemas)
            const res = await fetch('/api/registry/catalog');
            const json = await res.json();
            const connectorsMap = json?.catalog?.connectors || {};

            // Flatten to array for matching by id/title
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
              } else {
                const synthetic = buildSyntheticSchema({
                  kind,
                  appId: appKey,
                  opId: opKey,
                  opDef: found,
                  node,
                });
                if (synthetic) {
                  nextSchema = synthetic.schema;
                  nextDefaults = synthetic.defaults || {};
                }
              }
            }
          } catch (e) {
            // ignore fallback errors, keep empty schema
          }
        }

        // Heuristic fallback for common operations when schema is still empty
        if (!nextSchema?.properties || Object.keys(nextSchema.properties).length === 0) {
          const appL = String(app).toLowerCase();
          const opL = String(opId).toLowerCase();
          const labelL = String(node?.data?.label || '').toLowerCase();
          // Google Sheets: Row Added
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

  // Commit helper: push a single param (or full object) back to the graph node
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

  // --- Renderers ---
  const requiredSet = useMemo(() => new Set(schema?.required || []), [schema]);

  function Field({ name, def }: { name: string; def: JSONSchema }) {
    const value = paramsDraft?.[name] ?? def?.default ?? defaults?.[name] ?? "";
    const isRequired = requiredSet.has(name);
    const type = def?.type || (def?.enum ? "string" : "string");

    const onChange = (v: any) => setParamsDraft((p: any) => ({ ...p, [name]: v }));

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
    if (typeof e.preventDefault === 'function') e.preventDefault();
    const native = e.nativeEvent;
    if (native) {
      if (typeof native.stopPropagation === 'function') native.stopPropagation();
      if (typeof native.stopImmediatePropagation === 'function') native.stopImmediatePropagation();
    }
  };

  // Enhanced event handlers for better focus management
  const handleInputFocus = (e: any) => {
    stopPropagation(e);
    // Prevent ReactFlow from interfering with input focus
    e.target.style.pointerEvents = 'auto';
  };

  const handleInputBlur = (e: any) => {
    // Allow normal blur behavior
    setTimeout(() => {
      e.target.style.pointerEvents = 'auto';
    }, 100);
  };

    const insertExpr = (expr: string, label?: string) => {
      onChange(expr);
      commitSingle(name, expr);
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
                  onClick={(e) => {
                    stopPropagation(e);
                    insertExpr(opt.value, opt.label);
                  }}
                  onMouseDown={stopPropagation}
                  onPointerDown={stopPropagation}
                  style={{ pointerEvents: 'auto' }}
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


    const renderFxControls = () => (
      <div className="mt-1 flex items-center gap-2 text-xs">
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={(e) => {
            stopPropagation(e);
            setShowFx((v) => !v);
          }}
          onMouseDown={stopPropagation}
          onPointerDown={stopPropagation}
          style={{ pointerEvents: 'auto' }}
        >
          Use dynamic value (fx)
        </button>
        <span className="text-gray-300">•</span>
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={(e) => {
            stopPropagation(e);
            handleAutoMap();
          }}
          onMouseDown={stopPropagation}
          onPointerDown={stopPropagation}
          style={{ pointerEvents: 'auto' }}
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
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 nodrag nopan"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => commitSingle(name, e.target.value)}
            onFocus={handleInputFocus}
            onMouseDown={stopPropagation}
            onPointerDown={stopPropagation}
            onClick={stopPropagation}
            style={{ pointerEvents: 'auto' }}
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
                onFocus={handleInputFocus}
                onMouseDown={stopPropagation}
                onPointerDown={stopPropagation}
                onClick={stopPropagation}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 nodrag nopan"
                style={{ pointerEvents: 'auto' }}
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
            <Input
              type="number"
              value={value}
              onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={(e) => commitSingle(name, e.target.value === "" ? "" : Number(e.target.value))}
              onFocus={handleInputFocus}
              onMouseDown={stopPropagation}
              onPointerDown={stopPropagation}
              onClick={stopPropagation}
              min={def.minimum as any}
              max={def.maximum as any}
              placeholder={def.description || `Enter ${name}`}
              className="nodrag nopan"
              style={{ pointerEvents: 'auto' }}
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
              onBlur={(e) => commitSingle(
                name,
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )}
              onFocus={handleInputFocus}
              onMouseDown={stopPropagation}
              onPointerDown={stopPropagation}
              onClick={stopPropagation}
              placeholder="item1, item2, item3"
              className="nodrag nopan"
              style={{ pointerEvents: 'auto' }}
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
              className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 nodrag nopan"
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
              onBlur={(e) => {
                try { commitSingle(name, JSON.parse(e.target.value)); }
                catch { commitSingle(name, e.target.value); }
              }}
              onFocus={handleInputFocus}
              onMouseDown={stopPropagation}
              onPointerDown={stopPropagation}
              onClick={stopPropagation}
              placeholder="{ }"
              style={{ pointerEvents: 'auto' }}
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
            <Input
              type={inputType}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={(e) => commitSingle(name, e.target.value)}
              onFocus={handleInputFocus}
              onMouseDown={stopPropagation}
              onPointerDown={stopPropagation}
              onClick={stopPropagation}
              placeholder={def?.description || def?.format || `Enter ${name}`}
              className="nodrag nopan"
              style={{ pointerEvents: 'auto' }}
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
    <div
      className="p-4 bg-white border-l border-gray-200 h-full overflow-y-auto nodrag nopan"
      style={{ pointerEvents: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
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
            Current Params: {JSON.stringify(paramsDraft, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function buildSyntheticSchema({
  kind,
  appId,
  opId,
  opDef,
  node,
}: {
  kind: string;
  appId: string;
  opId: string;
  opDef?: any;
  node: any;
}): { schema: JSONSchema; defaults?: Record<string, any> } | null {
  const schema: JSONSchema = { type: 'object', properties: {} };
  const required: string[] = [];
  let added = false;

  const addProp = (name: string, def: any, req = false) => {
    if (!schema.properties) schema.properties = {};
    schema.properties[name] = def;
    if (req) required.push(name);
    added = true;
  };

  const endpoint: string = opDef?.endpoint || opDef?.url || "";
  if (endpoint) {
    const regex = /{([^}]+)}/g;
    let match;
    while ((match = regex.exec(endpoint)) !== null) {
      const paramName = match[1];
      addProp(paramName, {
        type: 'string',
        title: paramName,
        description: `Path parameter used in endpoint ${endpoint}`,
      }, true);
    }
  }

  if (kind === 'action') {
    addProp('query', {
      type: 'object',
      description: 'Query string parameters (key/value pairs).',
    });
    const method = String(opDef?.method || 'POST').toUpperCase();
    if (method !== 'GET') {
      addProp('body', {
        type: 'object',
        description: 'Request body as JSON object.',
      });
    }
    addProp('headers', {
      type: 'object',
      description: 'Custom HTTP headers (key/value pairs).',
    });
  } else {
    addProp('filters', {
      type: 'object',
      description: 'Optional filters to limit trigger events (key/value pairs).',
    });
    addProp('pollIntervalMinutes', {
      type: 'number',
      description: 'Override default polling interval (minutes).',
      minimum: 1,
    });
  }

  if (!added) {
    addProp('configuration', {
      type: 'object',
      description: 'Custom configuration for this operation.',
    });
  }

  schema.required = required;
  return { schema };
}

export default SmartParametersPanel;
