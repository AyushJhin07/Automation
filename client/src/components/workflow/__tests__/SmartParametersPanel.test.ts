import assert from "node:assert/strict";
import "../../../../../server/workflow/__tests__/compile-to-appsscript.ref-params.test.ts";
import { answersToGraph } from "../../../../../server/workflow/answers-to-graph";
import { enrichWorkflowNode } from "../../../../../server/workflow/node-metadata";
import { resolveAllParams } from "../../../../../server/core/ParameterResolver";
import type { WorkflowNode } from "../../../../../common/workflow-types";
import type { ParameterContext } from "../../../../../shared/nodeGraphSchema";

import {
  computeMetadataSuggestions,
  mapUpstreamNodesForAI,
  syncNodeParameters,
  augmentSchemaWithSheetTabs,
  fetchSheetTabs,
  renderStaticFieldControl,
  createDefaultLLMValue,
  mergeLLMValueWithDefaults,
  parseAIMappingCapability,
  type UpstreamNodeSummary,
  type JSONSchema
} from "../SmartParametersPanel";
import { buildMetadataFromNode } from "../metadata";
import { normalizeWorkflowNode } from "../graphSync";

const upstreamNodes: UpstreamNodeSummary[] = [
  {
    id: "node-1",
    data: {
      label: "Email Parser",
      app: "gmail",
      metadata: {
        columns: ["Invoice Number", "Total"],
        sample: {
          "Invoice Number": "INV-001",
          Total: "$120.00"
        },
        schema: {
          "Invoice Number": { type: "string" },
          Total: { type: "number" }
        }
      }
    }
  },
  {
    id: "node-2",
    data: {
      label: "Sheet Logger",
      app: "sheets",
      metadata: {
        headers: ["Amount"],
        sampleRow: {
          Amount: "99.99"
        }
      }
    }
  },
  {
    id: "node-3",
    data: {
      label: "API Fetch",
      app: "http",
      outputMetadata: {
        headers: ["id", "status"],
        sample: {
          id: "123",
          status: "open"
        },
        derivedFrom: ["runtime"]
      }
    }
  }
];

const suggestions = computeMetadataSuggestions(upstreamNodes);
const invoiceSuggestion = suggestions.find(
  (suggestion) => suggestion.nodeId === "node-1" && suggestion.path === "Invoice Number"
);
const totalSuggestion = suggestions.find(
  (suggestion) => suggestion.nodeId === "node-1" && suggestion.path === "Total"
);
const amountSuggestion = suggestions.find(
  (suggestion) => suggestion.nodeId === "node-2" && suggestion.path === "Amount"
);
const statusSuggestion = suggestions.find(
  (suggestion) => suggestion.nodeId === "node-3" && suggestion.path === "status"
);
const entireOutput = suggestions.filter((suggestion) => suggestion.path === "").map((item) => item.nodeId);

assert.ok(invoiceSuggestion, "should include Invoice Number in quick picks");
assert.ok(invoiceSuggestion?.label.includes("Invoice Number"));
assert.ok(totalSuggestion, "should include Total column quick pick");
assert.ok(amountSuggestion, "should surface Amount column quick pick");
assert.ok(statusSuggestion, "should surface status field from output metadata");
assert.ok(entireOutput.includes("node-1"), "should include entire output suggestions");
assert.ok(entireOutput.includes("node-3"), "should include entire output for runtime metadata nodes");

const disabledCapability = parseAIMappingCapability({
  aiAvailable: false,
  providers: { available: [] },
  models: []
});
assert.equal(
  disabledCapability.available,
  false,
  "AI mapping capability helper should report unavailable when backend disables providers"
);
assert.deepEqual(
  disabledCapability.providers,
  [],
  "AI mapping capability helper should normalize provider lists"
);

const legacyCapability = parseAIMappingCapability({
  models: [
    { id: "gemini-1.5-flash", provider: "gemini" }
  ]
});
assert.equal(
  legacyCapability.available,
  true,
  "AI mapping capability helper should treat legacy payloads with models as available"
);

const resolverNodeFixtures: Array<{
  description: string;
  node: WorkflowNode;
  expectedFields: string[];
}> = [
  {
    description: "Salesforce create record",
    node: {
      id: "salesforce-create-record",
      type: "action",
      app: "salesforce",
      name: "Create Salesforce Record",
      op: "salesforce.create_record",
      params: {
        sobjectType: "Contact",
        fields: {
          FirstName: "Ada",
          LastName: "Lovelace",
          Email: "ada@example.com"
        }
      },
      data: { label: "Create Salesforce Record" }
    },
    expectedFields: ["sobjectType", "FirstName", "LastName", "Email"]
  },
  {
    description: "HubSpot create contact",
    node: {
      id: "hubspot-create-contact",
      type: "action",
      app: "hubspot",
      name: "Create HubSpot Contact",
      op: "hubspot.create_contact",
      params: {
        properties: {
          email: "ada@example.com",
          firstname: "Ada",
          lastname: "Lovelace",
          phone: "555-0100"
        }
      },
      data: { label: "Create HubSpot Contact" }
    },
    expectedFields: ["email", "firstname", "lastname", "phone"]
  },
  {
    description: "Google Sheets append row",
    node: {
      id: "google-sheets-append-row",
      type: "action",
      app: "google-sheets",
      name: "Append Spreadsheet Row",
      op: "google-sheets.append_row",
      params: {
        spreadsheetId: "sheet-12345",
        sheet: "Leads",
        values: ["Ada", "ada@example.com", "Enterprise"]
      },
      data: { label: "Append Spreadsheet Row" }
    },
    expectedFields: ["spreadsheetId", "sheet", "values"]
  }
];

const resolverSummaries: UpstreamNodeSummary[] = resolverNodeFixtures.map((fixture) => {
  const enriched = enrichWorkflowNode(fixture.node as any);
  return {
    id: enriched.id,
    data: {
      label: enriched.name ?? enriched.data?.label ?? enriched.id,
      app: enriched.app,
      metadata: enriched.metadata,
      outputMetadata: enriched.outputMetadata
    }
  } satisfies UpstreamNodeSummary;
});

const resolverSuggestions = computeMetadataSuggestions(resolverSummaries);

resolverNodeFixtures.forEach((fixture, index) => {
  const summary = resolverSummaries[index];
  fixture.expectedFields.forEach((field) => {
    assert.ok(
      resolverSuggestions.some(
        (entry) => entry.nodeId === summary.id && entry.path === field
      ),
      `${fixture.description} should surface ${field} quick pick from resolver metadata`
    );
  });
  assert.ok(
    resolverSuggestions.some(
      (entry) => entry.nodeId === summary.id && entry.path === ""
    ),
    `${fixture.description} should include an entire output quick pick`
  );
});

const payload = mapUpstreamNodesForAI(upstreamNodes);
const first = payload.find((entry) => entry.nodeId === "node-1");
const second = payload.find((entry) => entry.nodeId === "node-2");
const third = payload.find((entry) => entry.nodeId === "node-3");

assert.ok(first, "AI payload should include first node");
assert.ok(first?.columns.includes("Invoice Number"));
assert.equal(
  typeof first?.sample === "object" && !Array.isArray(first?.sample)
    ? (first?.sample as Record<string, any>).Total
    : undefined,
  "$120.00"
);
assert.equal(first?.schema?.["Invoice Number"]?.type, "string");

assert.ok(second, "AI payload should include second node");
assert.ok(second?.columns.includes("Amount"));
assert.equal(
  typeof second?.sample === "object" && !Array.isArray(second?.sample)
    ? (second?.sample as Record<string, any>).Amount
    : undefined,
  "99.99"
);
assert.ok(third, "AI payload should include third node with runtime metadata");
assert.ok(third?.columns.includes("status"));
assert.equal(
  typeof third?.sample === "object" && !Array.isArray(third?.sample)
    ? (third?.sample as Record<string, any>).status
    : undefined,
  "open",
  "runtime sample should survive metadata merging"
);

const generatedPrompt = "Log invoice emails into Google Sheets";
const generatedAnswers = {
  trigger: "When an email arrives",
  search_query: "subject:Invoice",
  sheets: {
    sheet_id: "sheet-id-1234567890abcdefghijklmnopqrstuvwxyz",
    sheet_name: "Invoices",
    columns: ["Invoice Number", "Amount", "Vendor"]
  },
  data_extraction: "Invoice Number, Amount, Vendor",
  sheet_destination: "Google Sheet"
};

const generatedWorkflow = answersToGraph(generatedPrompt, generatedAnswers);
const sheetNode = generatedWorkflow.nodes.find((node) => node.app === "sheets");

assert.ok(sheetNode, "workflow should include a Sheets node");
assert.ok(sheetNode?.metadata?.headers?.length, "enriched metadata should expose headers");
assert.ok(
  sheetNode?.metadata?.sample &&
    typeof sheetNode.metadata.sample === "object" &&
    Object.keys(sheetNode.metadata.sample as Record<string, any>).length > 0,
  "metadata sample should be populated from schema sampling"
);
assert.ok(
  sheetNode?.data?.outputMetadata?.headers?.length,
  "data.outputMetadata should include derived headers"
);

const quickPicksFromWorkflow = computeMetadataSuggestions([
  {
    id: sheetNode!.id,
    data: {
      label: sheetNode!.name,
      app: sheetNode!.app,
      metadata: sheetNode!.metadata,
      outputMetadata: sheetNode!.data?.outputMetadata
    }
  }
]);

assert.ok(
  quickPicksFromWorkflow.some((pick) => pick.nodeId === sheetNode!.id && pick.path),
  "generated workflow should expose non-empty quick picks"
);

const sheetsTriggerTemplate = {
  label: "New row in sheet",
  app: "google-sheets",
  nodeType: "trigger.google-sheets.row_added",
  parameters: {
    spreadsheetId: "sheet-abc123",
    sheetName: "Leads",
    columns: ["Email", "First Name", "Last Name"],
  },
};

const sheetsTriggerData = syncNodeParameters(
  {
    label: sheetsTriggerTemplate.label,
    app: sheetsTriggerTemplate.app,
  },
  sheetsTriggerTemplate.parameters
);

const derivedSheetsMetadata = buildMetadataFromNode({
  id: sheetsTriggerTemplate.nodeType,
  type: "trigger",
  data: sheetsTriggerData,
  params: sheetsTriggerTemplate.parameters,
  parameters: sheetsTriggerTemplate.parameters,
});

const sheetsTriggerSummary: UpstreamNodeSummary = {
  id: sheetsTriggerTemplate.nodeType,
  data: {
    label: sheetsTriggerTemplate.label,
    app: sheetsTriggerTemplate.app,
    metadata: { ...(sheetsTriggerData.metadata ?? {}), ...derivedSheetsMetadata },
    outputMetadata: { ...(sheetsTriggerData.outputMetadata ?? {}), ...derivedSheetsMetadata },
  },
};

const gmailSummary: UpstreamNodeSummary = {
  id: "action.gmail.send",
  data: {
    label: "Send Email",
    app: "gmail",
  },
};

const suggestionsFromNewNodes = computeMetadataSuggestions([
  sheetsTriggerSummary,
  gmailSummary,
]);

assert.ok(
  suggestionsFromNewNodes.some(
    (entry) => entry.nodeId === sheetsTriggerSummary.id && entry.path === "Email"
  ),
  "dropping Sheets trigger and connecting Gmail should expose Email column quick pick"
);

const reactFlowHarnessNodes = generatedWorkflow.nodes.map((node) => ({
  id: node.id,
  data: {
    label: node.name,
    app: node.app,
    metadata: node.metadata,
    outputMetadata: node.outputMetadata ?? node.data?.outputMetadata,
    parameters: node.params,
    params: node.params
  }
}));

const applyParameterUpdateToReactFlow = (
  nodes: Array<{ id: string; data: any }>,
  targetId: string,
  nextParams: Record<string, any>
) => {
  return nodes.map((node) => {
    if (node.id !== targetId) return node;
    const dataWithParams = syncNodeParameters(node.data, nextParams);
    const sanitizedMetadata = { ...(dataWithParams?.metadata ?? {}) };
    delete sanitizedMetadata.sample;
    delete sanitizedMetadata.sampleRow;
    delete sanitizedMetadata.outputSample;
    const sanitizedOutputMetadata = { ...(dataWithParams?.outputMetadata ?? {}) };
    delete sanitizedOutputMetadata.sample;
    delete sanitizedOutputMetadata.sampleRow;
    delete sanitizedOutputMetadata.outputSample;
    const provisionalNode = {
      ...node,
      data: {
        ...dataWithParams,
        metadata: sanitizedMetadata,
        outputMetadata: sanitizedOutputMetadata
      },
      params: nextParams,
      parameters: nextParams
    };
    const derivedMetadata = buildMetadataFromNode(provisionalNode);
    return {
      ...node,
      data: {
        ...dataWithParams,
        metadata: {
          ...sanitizedMetadata,
          ...derivedMetadata
        },
        outputMetadata: {
          ...sanitizedOutputMetadata,
          ...derivedMetadata
        }
      },
      params: nextParams,
      parameters: nextParams
    };
  });
};

const updatedReactFlowNodes = applyParameterUpdateToReactFlow(
  reactFlowHarnessNodes,
  sheetNode!.id,
  {
    ...(sheetNode?.params ?? {}),
    spreadsheetId: "sheet-new-987654321",
    sheetName: "Paid Invoices"
  }
);

const updatedHarnessSheet = updatedReactFlowNodes.find((node) => node.id === sheetNode!.id);

assert.ok(updatedHarnessSheet, "React Flow harness should still include the sheet node after update");
assert.equal(
  updatedHarnessSheet?.data?.parameters?.spreadsheetId,
  "sheet-new-987654321",
  "parameter update should reflect in stored React Flow parameters"
);

const updatedSample = updatedHarnessSheet?.data?.metadata?.sample as
  | Record<string, any>
  | undefined;

assert.equal(
  updatedSample?.spreadsheetId,
  "sheet-new-987654321",
  "metadata sample should refresh spreadsheetId when parameters change"
);
assert.equal(
  (updatedSample?.sheet_name ?? updatedSample?.sheetName ?? updatedSample?.sheet),
  "Paid Invoices",
  "metadata sample should reflect the latest sheet name"
);

const updatedSuggestions = computeMetadataSuggestions([
  {
    id: updatedHarnessSheet!.id,
    data: {
      label: updatedHarnessSheet!.data?.label ?? sheetNode!.name,
      app: updatedHarnessSheet!.data?.app ?? sheetNode!.app,
      metadata: updatedHarnessSheet!.data?.metadata,
      outputMetadata: updatedHarnessSheet!.data?.outputMetadata
    }
  }
]);

const updatedPathsForSheet = updatedSuggestions
  .filter((entry) => entry.nodeId === updatedHarnessSheet!.id)
  .map((entry) => entry.path);

assert.ok(
  updatedPathsForSheet.includes("spreadsheetId"),
  "updated suggestions should continue exposing spreadsheetId quick pick"
);
assert.ok(
  updatedPathsForSheet.includes("sheet_name") ||
    updatedPathsForSheet.includes("sheetName") ||
    updatedPathsForSheet.includes("sheet"),
  "updated suggestions should include a sheet name quick pick"
);

// Ensure the AI Mapping mode placeholder keeps the LLM mode active so the UI can render the Map with AI button
{
  const fieldName = "recipient";
  const fieldSchema: JSONSchema = {
    type: "string",
    title: "Recipient",
    description: "Destination email address"
  };
  const llmDefaults = createDefaultLLMValue(fieldName, fieldSchema, upstreamNodes);
  const placeholder = mergeLLMValueWithDefaults(
    { mode: "ref", nodeId: upstreamNodes[0]!.id, path: "Email" },
    llmDefaults
  );

  assert.equal(
    placeholder.mode,
    "llm",
    "Switching to AI Mapping should yield an llm evaluated value"
  );
  assert.equal(
    placeholder.provider,
    "openai",
    "LLM placeholder should target the default OpenAI provider"
  );
  assert.ok(
    typeof placeholder.prompt === "string" && placeholder.prompt.includes("Recipient"),
    "Default LLM prompt should reference the field name so the Map with AI button has context"
  );
}

{
  const upstreamBefore: UpstreamNodeSummary = {
    id: "spreadsheet-node",
    data: {
      label: "Initial Sheet",
      metadata: {
        columns: ["id", "name"],
        sample: { id: "1", name: "Original" }
      },
      outputMetadata: {
        schema: {
          id: { type: "string" },
          name: { type: "string" }
        }
      }
    }
  };

  const upstreamAfter: UpstreamNodeSummary = {
    id: "spreadsheet-node",
    data: {
      label: "Updated Sheet",
      metadata: {
        columns: ["id", "name", "status"],
        sample: { id: "1", name: "Revised", status: "Active" }
      },
      outputMetadata: {
        schema: {
          id: { type: "string" },
          name: { type: "string" },
          status: { type: "string" }
        }
      }
    }
  };

  const beforeSuggestions = computeMetadataSuggestions([upstreamBefore]);
  const afterSuggestions = computeMetadataSuggestions([upstreamAfter]);

  const beforePaths = beforeSuggestions.map((entry) => entry.path);
  const afterPaths = afterSuggestions.map((entry) => entry.path);

  assert.notDeepEqual(
    beforePaths,
    afterPaths,
    "metadata suggestions should refresh when upstream schemas change"
  );
  assert.ok(
    afterPaths.includes("status"),
    "updated suggestions should include newly introduced fields"
  );
}

const paramSyncBase = {
  label: "Mailer",
  params: { old: "value" },
  metadata: { example: true }
};
const nextParams = { subject: "Hello" };
const mirrored = syncNodeParameters(paramSyncBase, nextParams);

assert.deepEqual(mirrored.parameters, nextParams, "parameters should mirror latest edits");
assert.deepEqual(mirrored.params, nextParams, "params should mirror latest edits");
assert.strictEqual(
  mirrored.parameters,
  mirrored.params,
  "parameter stores should reference the same object"
);
assert.equal(mirrored.label, "Mailer", "other node data should be preserved");
assert.deepEqual(paramSyncBase.params, { old: "value" }, "original data should not be mutated");

const originalFetch = globalThis.fetch;
let capturedUrl: string | null = null;

try {
  globalThis.fetch = (async (input: any) => {
    capturedUrl = typeof input === "string" ? input : (input?.url ?? String(input));
    return {
      ok: true,
      status: 200,
      async json() {
        return { sheets: ["Sheet 1", "Second Tab", "Archive"] };
      },
      async text() {
        return JSON.stringify({ sheets: ["Sheet 1", "Second Tab", "Archive"] });
      }
    } as any;
  }) as any;

  const { tabs, error } = await fetchSheetTabs("spreadsheet-123");
  assert.equal(error, undefined, "successful metadata fetch should not report an error");
  assert.ok(Array.isArray(tabs) && tabs.length === 3, "should return tab names from stubbed metadata fetch");
  assert.ok(
    typeof capturedUrl === "string" && capturedUrl.includes("/api/google/sheets/spreadsheet-123/metadata"),
    "fetchSheetTabs should call the sheet metadata endpoint"
  );

  const baseSchema: JSONSchema = {
    type: "object",
    properties: {
      spreadsheetId: { type: "string" },
      sheetName: { type: "string", title: "Sheet Name" },
      other: { type: "string" }
    }
  };

  const augmented = augmentSchemaWithSheetTabs(baseSchema, tabs);
  assert.ok(augmented && augmented !== baseSchema, "augmentSchemaWithSheetTabs should create a new schema instance");
  assert.deepEqual(
    augmented?.properties?.sheetName?.enum,
    tabs,
    "sheetName field should expose enum values from metadata"
  );

  let localStatic = "";
  let committed: any = null;
  const element = renderStaticFieldControl(augmented!.properties!.sheetName!, {
    fieldName: "sheetName",
    localStatic: "",
    setLocalStatic: (value) => {
      localStatic = value;
    },
    commitValue: (value) => {
      committed = value;
    }
  });

  assert.equal(element.type, "select", "sheet enum should render a select control");
  const optionNodes = (element.props.children as any[]).filter((child: any) => child?.type === "option");
  assert.equal(optionNodes.length, tabs.length + 1, "select should render default + returned sheet options");
  const renderedValues = optionNodes.map((opt: any) => opt.props.value);
  assert.deepEqual(renderedValues.slice(1), tabs, "rendered options should match sheet metadata");

  element.props.onChange({ target: { value: tabs[1] } });
  assert.equal(localStatic, tabs[1], "select change should update local state");
  assert.equal(committed, tabs[1], "select change should commit the chosen sheet");
} finally {
  globalThis.fetch = originalFetch;
}

const resolverContext: ParameterContext = {
  nodeOutputs: {},
  currentNodeId: "node-under-test",
  workflowId: "workflow-under-test",
  executionId: "exec-12345"
};

const originalWarn = console.warn;
const warnLogs: string[] = [];
console.warn = (...args: any[]) => {
  warnLogs.push(args.map((arg) => String(arg)).join(" "));
};

try {
  const missingReferenceResult = await resolveAllParams(
    {
      missing: { mode: "ref", nodeId: "upstream-missing", path: "value" }
    },
    resolverContext
  );

  assert.ok(
    Object.prototype.hasOwnProperty.call(missingReferenceResult, "missing"),
    "resolver should return key for missing reference"
  );
  assert.strictEqual(
    missingReferenceResult.missing,
    undefined,
    "missing references should fall back to undefined"
  );
  assert.ok(
    warnLogs.some((entry) => entry.includes("upstream-missing")),
    "missing reference resolution should emit telemetry warning"
  );
} finally {
  console.warn = originalWarn;
}

const originalError = console.error;
const errorLogs: string[] = [];
console.error = (...args: any[]) => {
  errorLogs.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "));
};

try {
  const llmFailureResult = await resolveAllParams(
    {
      summary: {
        mode: "llm",
        provider: "openai",
        model: "openai:gpt-4o-mini",
        prompt: "Summarize {{ref:missing.value}}"
      }
    },
    resolverContext
  );

  assert.strictEqual(
    llmFailureResult.summary,
    null,
    "LLM resolver failures should fall back to null values"
  );
  assert.ok(
    errorLogs.some((entry) => entry.includes("Failed to resolve parameter summary")),
    "LLM resolver failure should emit telemetry error"
  );
} finally {
  console.error = originalError;
}

const triggerNodeInput = {
  id: "trigger-1",
  type: "trigger.gmail",
  app: "gmail",
  function: "email_received",
  data: {
    label: "When a Gmail message arrives",
    config: { query: "is:unread", label: "Invoices" }
  },
};

const normalizedTrigger = normalizeWorkflowNode(triggerNodeInput, { loadSource: "ai-builder" });

assert.equal(normalizedTrigger.role, "trigger", "gmail trigger should map to trigger role");
assert.equal(normalizedTrigger.data.parameters.query, "is:unread", "trigger parameters should include Gmail query");
assert.equal(normalizedTrigger.data.app, "gmail", "trigger app should remain gmail");
assert.equal(normalizedTrigger.data.loadSource, "ai-builder", "loadSource hint should be preserved when provided");
assert.ok(
  (normalizedTrigger.data.metadata?.columns ?? []).includes("query"),
  "trigger metadata should expose query column for quick picks"
);

const actionNodeInput = {
  id: "action-1",
  type: "action.sheets",
  app: "sheets",
  function: "append_row",
  position: { x: "480", y: 260 },
  data: {
    label: "Append invoice",
    config: {
      spreadsheetId: "sheet-123",
      sheetName: "Invoices",
      range: "A1:C1",
      values: ["{{trigger.subject}}", "{{trigger.amount}}", "{{trigger.sender}}"],
    },
  },
};

const normalizedAction = normalizeWorkflowNode(actionNodeInput, { index: 2 });

assert.equal(normalizedAction.role, "action", "sheets append should remain an action node");
assert.equal(normalizedAction.position.x, 480, "string based coordinates should coerce to numbers");
assert.equal(normalizedAction.data.parameters.range, "A1:C1", "action parameters should merge config values");
assert.ok(
  normalizedAction.data.metadata?.sample?.sheetName === "Invoices",
  "action metadata sampling should include sheet name from config"
);

console.log("SmartParametersPanel metadata helper checks (including sheet metadata) passed.");
