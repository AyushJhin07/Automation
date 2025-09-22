import assert from "node:assert/strict";

import {
  computeMetadataSuggestions,
  mapUpstreamNodesForAI,
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
const entireOutput = suggestions.filter((suggestion) => suggestion.path === "").map((item) => item.nodeId);

assert.ok(invoiceSuggestion, "should include Invoice Number in quick picks");
assert.ok(invoiceSuggestion?.label.includes("Invoice Number"));
assert.ok(totalSuggestion, "should include Total column quick pick");
assert.ok(amountSuggestion, "should surface Amount column quick pick");
assert.ok(entireOutput.includes("node-1"), "should include entire output suggestions");

const payload = mapUpstreamNodesForAI(upstreamNodes);
const first = payload.find((entry) => entry.nodeId === "node-1");
const second = payload.find((entry) => entry.nodeId === "node-2");

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

console.log("SmartParametersPanel metadata helper checks passed.");
