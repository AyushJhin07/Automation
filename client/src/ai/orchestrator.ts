// Conversational Orchestrator - Deterministic clarification loop

export type Phase = 'COLLECT_REQUIREMENTS' | 'CONFIRM_REQUIREMENTS' | 'GENERATE_SPEC' | 'DONE';

export interface MissingField {
  nodeId: string;
  field: string;
  prompt: string;
  type: 'string' | 'enum' | 'id' | 'secret' | 'number' | 'boolean' | 'array' | 'object';
  enumOptions?: string[];
}

export interface AutomationSpec {
  id: string;
  name: string;
  description?: string;
  nodes: any[];
  edges: any[];
  metadata?: Record<string, any>;
}

export interface ConversationState {
  phase: Phase;
  userGoal: string;                 // raw prompt
  targetAppChain?: string[];        // e.g., ["gmail.read", "sheets.append", "slack.post"]
  answers: Record<string, any>;     // keyed by nodeId.field
  missing: MissingField[];
  spec?: AutomationSpec;            // final spec when ready
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

// Placeholder: determine missing fields from a given draft graph and catalog
export function deriveMissingFields(draftGraph: any, answers: Record<string, any>): MissingField[] {
  const missing: MissingField[] = [];
  const nodes: any[] = draftGraph?.nodes || [];
  for (const n of nodes) {
    const params = n?.data?.parameters || n?.parameters || {};
    const required: string[] = n?.data?.required || n?.required || [];
    for (const field of required) {
      const key = `${n.id}.${field}`;
      const hasAnswer = answers[key] != null || params[field] != null;
      if (!hasAnswer) {
        missing.push({ nodeId: n.id, field, prompt: `Please provide ${field} for ${n.data?.label || n.type}`, type: 'string' });
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
      const draftGraph = context?.draftGraph || {};
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
      const spec: AutomationSpec = {
        id: `spec_${Date.now()}`,
        name: state.userGoal.slice(0, 60),
        nodes: [],
        edges: []
      };
      const next = { ...state, phase: 'DONE', spec } as ConversationState;
      log('GENERATE_SPEC','DONE');
      return next;
    }
    default:
      return state;
  }
}


