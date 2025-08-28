import { create } from 'zustand';
import type { CompileResult } from '../../../common/workflow-types';

type S = {
  last?: CompileResult;
  set: (r: CompileResult) => void;
  clear: () => void;
};

export const useWorkflowState = create<S>((set) => ({
  last: undefined,
  set: (r) => {
    localStorage.setItem('lastCompile', JSON.stringify(r));
    set({ last: r });
  },
  clear: () => {
    localStorage.removeItem('lastCompile');
    set({ last: undefined });
  },
}));

export function getSavedCompile(): CompileResult | undefined {
  try { return JSON.parse(localStorage.getItem('lastCompile') || 'null') || undefined; }
  catch { return undefined; }
}