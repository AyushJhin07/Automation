import { create } from 'zustand';
import type { AutomationSpec } from '../core/spec';

type SpecState = { spec: AutomationSpec | null; set: (s: AutomationSpec) => void };

export const useSpecStore = create<SpecState>((set) => ({
  spec: null,
  set: (spec) => set({ spec })
}));


