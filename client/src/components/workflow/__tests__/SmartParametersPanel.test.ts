import assert from "node:assert/strict";
import "../../../../../server/workflow/__tests__/compile-to-appsscript.ref-params.test.ts";
import { answersToGraph } from "../../../../../server/workflow/answers-to-graph";

import {
  computeMetadataSuggestions,
  mapUpstreamNodesForAI,
  syncNodeParameters,
  fetchSheetTabs,
  augmentSchemaWithSheetTabs,
  renderStaticFieldControl,
  type UpstreamNodeSummary,
  type JSONSchema
} from "../SmartParametersPanel";
import { buildMetadataFromNode, mergeMetadataShape } from "../metadataUtils";

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

// Regression: ensure Sheets trigger metadata propagates to Gmail suggestions
{
  const sheetParams = { columns: ["Email", "Amount", "Status"], sheetName: "Invoices" };
  const sheetTemplate = {
    label: "Sheet Edit",
    app: "sheets",
    description: "When a row is edited",
  };
  const sheetNormalized = syncNodeParameters(sheetTemplate, sheetParams) as Record<string, any>;
  const sheetMetadata = buildMetadataFromNode({
    id: "trigger-sheets",
    type: "trigger.sheets.onEdit",
    data: sheetNormalized,
    params: sheetParams,
    parameters: sheetParams,
  });
  const sheetDataWithMetadata = {
    ...sheetNormalized,
    metadata: mergeMetadataShape(sheetNormalized.metadata, sheetMetadata),
    outputMetadata: mergeMetadataShape(sheetNormalized.outputMetadata, sheetMetadata),
  };

  const gmailParams = { to: "", subject: "", body: "" };
  const gmailNormalized = syncNodeParameters({ label: "Send Email", app: "gmail" }, gmailParams);

  const upstreamForGmail: UpstreamNodeSummary[] = [
    {
      id: "trigger-sheets",
      data: {
        label: sheetTemplate.label,
        app: sheetTemplate.app,
        metadata: sheetDataWithMetadata.metadata,
        outputMetadata: sheetDataWithMetadata.outputMetadata,
      },
    },
  ];

  const gmailSuggestions = computeMetadataSuggestions(upstreamForGmail);
  const emailColumn = gmailSuggestions.find(
    (suggestion) => suggestion.nodeId === "trigger-sheets" && suggestion.path === "Email"
  );

  assert.ok(gmailNormalized, "gmail node should normalize params without throwing");
  assert.ok(emailColumn, "connected Gmail node should surface Sheets column quick picks");
}

const originalFetch = globalThis.fetch;
let capturedUrl: string | null = null;

try {
  globalThis.fetch = (async (input: any) => {
    capturedUrl = typeof input === "string" ? input : input?.url ?? String(input);
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

  const tabs = await fetchSheetTabs("spreadsheet-123");
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
  const element = renderStaticFieldControl(augmented?.properties?.sheetName, {
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

console.log("SmartParametersPanel metadata helper checks passed.");
