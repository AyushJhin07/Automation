import assert from "node:assert/strict";
import "../../../../../server/workflow/__tests__/compile-to-appsscript.ref-params.test.ts";
import { answersToGraph } from "../../../../../server/workflow/answers-to-graph";

import {
  computeMetadataSuggestions,
  mapUpstreamNodesForAI,
  syncNodeParameters,
  type UpstreamNodeSummary
} from "../SmartParametersPanel";

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

console.log("SmartParametersPanel metadata helper checks passed.");
