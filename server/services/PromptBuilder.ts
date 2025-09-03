/**
 * ChatGPT Enhancement: Dynamic PromptBuilder with Registry Integration
 * 
 * Builds AI prompts dynamically from the live connector registry
 * supporting both GAS-only and all-connectors modes.
 */

import { connectorRegistry } from "../ConnectorRegistry.js";

export type PlannerMode = "gas-only" | "all";

function getGasOnlyApps() {
  return [
    { id: "gmail",        title: "Gmail",        ops: ["send_email","read_email","search_threads","add_label"] },
    { id: "sheets",       title: "Google Sheets",ops: ["read_sheet","append_row","update_range","create_sheet"] },
    { id: "drive",        title: "Google Drive", ops: ["find_files","create_file","move_file","get_file_metadata"] },
    { id: "calendar",     title: "Google Calendar", ops: ["create_event","update_event","list_events"] },
    { id: "docs",         title: "Google Docs",  ops: ["create_doc","append_text"] },
    { id: "forms",        title: "Google Forms", ops: ["create_form","add_item","get_responses"] },
    { id: "slides",       title: "Google Slides",ops: ["create_presentation","add_slide","replace_text"] },
    { id: "contacts",     title: "Google Contacts", ops: ["create_contact","update_contact","find_contact"] },
    { id: "chat",         title: "Google Chat",  ops: ["send_message"] },
    { id: "core",         title: "Core (GAS Utilities)", ops: ["http_request","transform","schedule","branch","merge"] },
  ];
}

function getAllAppsFromRegistry() {
  // registry already loaded at boot; expose everything the UI has
  const catalog = connectorRegistry.getNodeCatalog();
  // catalog.connectors is usually: { [id]: { title, operations: {opId: {...}} } }
  const entries = Object.entries(catalog.connectors || {});
  return entries.map(([id, c]: any) => ({
    id,
    title: c?.name || id,
    ops: [
      ...(c?.actions || []).map((action: any) => action.id),
      ...(c?.triggers || []).map((trigger: any) => trigger.id)
    ]
  }));
}

function stringifyApps(apps: Array<{id:string; title:string; ops:string[];}>) {
  // compact but readable list for the LLM
  return apps.map(a => `- ${a.title} (${a.id}): ${a.ops.slice(0,50).join(", ")}`).join("\n");
}

export function buildPlannerPrompt(userPrompt: string, mode: PlannerMode) {
  const apps = mode === "gas-only" ? getGasOnlyApps() : getAllAppsFromRegistry();
  const appListBlock = stringifyApps(apps);

  const gasConstraints = `
CONSTRAINTS:
- The solution MUST be executable entirely in Google Apps Script.
- Use ONLY Google Workspace + GAS services:
  GmailApp, SpreadsheetApp, DriveApp, CalendarApp, DocumentApp, FormsApp,
  SlidesApp, UrlFetchApp, PropertiesService, Utilities, Logger, Triggers,
  ContactsApp, Session, HtmlService, AdminDirectory (only if explicitly needed).
- Do NOT use non-Google SaaS connectors. If the user mentions them, replace with Workspace/GAS equivalents.
`.trim();

  const allConnectorsConstraints = `
CONSTRAINTS:
- You may use ANY of the available connectors listed below.
- Prefer Google Workspace if it fits naturally, but do not forbid other apps.
- Only use operations that exist for the chosen app (see list below).
`.trim();

  const constraints = mode === "gas-only" ? gasConstraints : allConnectorsConstraints;

  const schema = `
OUTPUT SCHEMA (STRICT JSON, no markdown, no comments):
{
  "apps": string[],                               // app titles or ids you plan to use
  "trigger": { "type": "manual|time|event", "details": object|null },
  "steps": [
    {
      "app": string,                               // app id (e.g., "sheets", "gmail", or any registry id)
      "operation": string,                         // operation id from the list below
      "required_inputs": string[],                 // human-readable fields needed
      "missing_inputs": string[],                  // subset of required_inputs not known yet
      "description": string
    }
  ],
  "missing_inputs": [
    { "name": string, "reason": string, "category": "trigger|data|mapping|auth|config" }
  ],
  "workflow_name": string,
  "description": string,
  "complexity": "simple"|"medium"|"complex",
  "estimated_setup_time": "5-10m"|"10-20m"|"20-40m"|"40-90m",
  "business_value": string,
  "follow_up_questions": [
    { "id": string, "question": string, "category": "trigger|data|mapping|auth|config", "expected_format": "free|email|url|sheet_id|sheet_range|datetime|timezone|list|number|boolean" }
  ]
}
`.trim();

  const rules = `
PLANNING RULES:
- Select the minimal set of apps to satisfy the request.
- If Sheets involved: ask for sheet URL or ID, tab name, header row (Y/N), exact columns to read/write, create-if-missing (Y/N).
- If Gmail involved: ask for recipients, subject, body template, dynamic fields, attachments (Drive file IDs or none).
- If Drive involved: ask for folder ID(s), file ID(s), file type filters, naming patterns.
- If Calendar involved: ask for calendar ID (primary or explicit), event title, start/end, timezone, guests.
- Always ask for timezone for time-driven triggers.
- Add a follow_up_question for every unknown required input.
`.trim();

  const availability = `
AVAILABLE APPLICATIONS & OPERATIONS:
${appListBlock}
`.trim();

  return `
You are an automation planner.

${constraints}

${schema}

${rules}

${availability}

USER_REQUEST:
${userPrompt}

Return ONLY valid JSON that matches the schema.
`.trim();
}

/**
 * Get allowlist for the specified mode
 */
export function getAllowlistForMode(mode: PlannerMode): Set<string> {
  if (mode === "gas-only") {
    return new Set(["gmail","sheets","drive","calendar","docs","forms","slides","contacts","chat","core"]);
  }
  // Build from live registry
  const catalog = connectorRegistry.getNodeCatalog();
  const all = new Set(Object.keys(catalog.connectors || {}));
  // Always allow "core" nodes
  all.add("core");
  return all;
}

/**
 * Normalize app ID with common synonyms
 */
export function normalizeAppId(id: string): string {
  const x = (id || "").toLowerCase().replace(/\s+/g, "-");
  // keep handy synonyms for Workspace apps
  if (["google-sheets","gsheets","sheet","sheets"].includes(x)) return "sheets";
  if (["google-drive","gdrive","drive"].includes(x)) return "drive";
  if (["google-calendar","gcal","calendar"].includes(x)) return "calendar";
  if (["google-docs","docs","document"].includes(x)) return "docs";
  if (["google-forms","forms"].includes(x)) return "forms";
  if (["google-slides","slides"].includes(x)) return "slides";
  if (["gmail","google-mail"].includes(x)) return "gmail";
  if (["contacts","google-contacts"].includes(x)) return "contacts";
  if (["chat","google-chat"].includes(x)) return "chat";
  if (x === "core") return "core";
  return x;
}