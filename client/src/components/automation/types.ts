export interface AppFunction {
  id: string;
  name: string;
  description: string;
  category: 'MVP' | 'Advanced';
  parameters: {
    name: string;
    type: 'text' | 'select' | 'textarea' | 'number' | 'boolean';
    required: boolean;
    options?: string[];
    defaultValue?: any;
    description: string;
  }[];
}

export interface GoogleApp {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  color: string;
  functions: AppFunction[];
  scopes: string[];
}

export interface GoogleAppsNodeData extends GoogleApp {
  selectedFunction?: AppFunction;
  functionConfig?: Record<string, any>;
}

export interface TriggerNodeData {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  parameters: {
    name: string;
    type: 'text' | 'select' | 'number';
    required: boolean;
    options?: string[];
    description: string;
  }[];
  config?: Record<string, any>;
}

export interface ActionNodeData {
  label: string;
  description?: string;
}

export interface AutomationBuilderProps {
  automationId: string;
  onScriptGenerated: (script: string) => void;
}