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
  switch (state.phase) {
    case 'COLLECT_REQUIREMENTS': {
      const draftGraph = context?.draftGraph || {};
      const missing = deriveMissingFields(draftGraph, state.answers);
      if (missing.length > 0) {
        // ask only the next 1-2 essential questions
        return { ...state, missing };
      }
      return { ...state, phase: 'CONFIRM_REQUIREMENTS', missing: [] };
    }
    case 'CONFIRM_REQUIREMENTS': {
      const accepted = /^(ok|yes|confirm)/i.test(userMessage || '');
      if (accepted) {
        return { ...state, phase: 'GENERATE_SPEC' };
      }
      // If user provided edits, merge and go back to collect
      return { ...state, phase: 'COLLECT_REQUIREMENTS' };
    }
    case 'GENERATE_SPEC': {
      // In a real implementation, call server to validate/compile and return a spec
      const spec: AutomationSpec = {
        id: `spec_${Date.now()}`,
        name: state.userGoal.slice(0, 60),
        nodes: [],
        edges: []
      };
      return { ...state, phase: 'DONE', spec };
    }
    default:
      return state;
  }
}


