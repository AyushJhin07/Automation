// Conversational Orchestrator - Deterministic clarification loop

export type Phase = 'COLLECT_REQUIREMENTS' | 'CONFIRM_REQUIREMENTS' | 'GENERATE_SPEC' | 'DONE';

export interface MissingField {
  nodeId: string;
  field: string;
  prompt: string;
  type: 'string' | 'enum' | 'id' | 'secret' | 'number' | 'boolean' | 'array' | 'object';
  enumOptions?: string[];
}

// Use the unified AutomationSpec from core/spec across app layers
import type { AutomationSpec as CanonicalSpec } from '../core/spec';

export interface ConversationState {
  phase: Phase;
  userGoal: string;                 // raw prompt
  targetAppChain?: string[];        // e.g., ["gmail.read", "sheets.append", "slack.post"]
  answers: Record<string, any>;     // keyed by nodeId.field
  missing: MissingField[];
  spec?: CanonicalSpec;             // final spec when ready
}

export function initializeState(userGoal: string): ConversationState {
  return {
    phase: 'COLLECT_REQUIREMENTS',
    userGoal,
    targetAppChain: [],
    answers: {},
    missing: []
  };
}

// Catalog-driven required field detection
import { GoogleSheetsAppendRowContract } from '../catalog/google_sheets.append_row';

const CONTRACTS: Record<string, { requiredFields: { key: string; type: string; help?: string; example?: any; enumOptions?: string[] }[] }> = {
  'sheets.append_row': GoogleSheetsAppendRowContract as any
  // Add more contracts as you grow coverage
};

export function deriveMissingFields(draftGraph: CanonicalSpec, answers: Record<string, any>): MissingField[] {
  const missing: MissingField[] = [];
  const allNodes: any[] = [...(draftGraph?.triggers || []), ...(draftGraph?.nodes || [])];

  for (const n of allNodes) {
    const contract = CONTRACTS[n.type];
    if (!contract) continue;
    for (const f of contract.requiredFields) {
      const current = n.inputs?.[f.key] ?? answers[`${n.id}.${f.key}`];
      const isBlank = current === undefined || current === null || (typeof current === 'string' && current.trim() === '');
      if (isBlank) {
        missing.push({
          nodeId: n.id,
          field: f.key,
          type: (f.type as any) || 'string',
          prompt: f.help || `Please provide a value for ${f.key}.`,
          enumOptions: f.enumOptions
        });
      }
    }
  }
  return missing;
}

export function nextState(state: ConversationState, userMessage?: string, context?: { draftGraph?: any }): ConversationState {
  const log = (from: Phase, to: Phase, extra?: Record<string, any>) => {
    try { console.info(`[Orchestrator] Phase ${from} → ${to}`, { userGoal: state.userGoal, missing: state.missing?.length || 0, ...(extra||{}) }); } catch {}
  };
  switch (state.phase) {
    case 'COLLECT_REQUIREMENTS': {
      const draftGraph = (context?.draftGraph || {}) as CanonicalSpec;
      const missing = deriveMissingFields(draftGraph, state.answers);
      if (missing.length > 0) {
        // ask only the next 1-2 essential questions
        const next = { ...state, missing } as ConversationState;
        log('COLLECT_REQUIREMENTS','COLLECT_REQUIREMENTS',{ action: 'ASK_MISSING', count: missing.length });
        return next;
      }
      const next = { ...state, phase: 'CONFIRM_REQUIREMENTS', missing: [] } as ConversationState;
      log('COLLECT_REQUIREMENTS','CONFIRM_REQUIREMENTS');
      return next;
    }
    case 'CONFIRM_REQUIREMENTS': {
      const accepted = /^(ok|yes|confirm)/i.test(userMessage || '');
      if (accepted) {
        const next = { ...state, phase: 'GENERATE_SPEC' } as ConversationState;
        log('CONFIRM_REQUIREMENTS','GENERATE_SPEC');
        return next;
      }
      // If user provided edits, merge and go back to collect
      const next = { ...state, phase: 'COLLECT_REQUIREMENTS' } as ConversationState;
      log('CONFIRM_REQUIREMENTS','COLLECT_REQUIREMENTS',{ action: 'EDIT' });
      return next;
    }
    case 'GENERATE_SPEC': {
      // In a real implementation, call server to validate/compile and return a spec
      const spec: CanonicalSpec = {
        version: '1.0',
        name: state.userGoal.slice(0, 60) || 'Untitled Automation',
        description: state.userGoal,
        triggers: [],
        nodes: [],
        edges: []
      } as CanonicalSpec;
      const next = { ...state, phase: 'DONE', spec } as ConversationState;
      log('GENERATE_SPEC','DONE');
      return next;
    }
    default:
      return state;
  }
}


