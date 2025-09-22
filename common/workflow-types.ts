export type NodeType = 'trigger' | 'action' | 'transform';

export type WorkflowNodeMetadata = {
  columns?: string[];
  sample?: Record<string, any> | any[];
  schema?: Record<string, any>;
  derivedFrom?: string[];
};

export type WorkflowNode = {
  id: string;
  type: NodeType;
  app: string;      // e.g., 'gmail' | 'sheets'
  name: string;     // human name, e.g., 'Gmail Trigger'
  op: string;       // machine op, e.g., 'gmail.watchInbox'
  params: Record<string, any>;
  data?: {
    label?: string;
    operation?: string;
    config?: Record<string, any>;
    parameters?: Record<string, any>;
    metadata?: WorkflowNodeMetadata;
    [key: string]: any;
  };
  metadata?: WorkflowNodeMetadata;
};

export type WorkflowEdge = {
  id: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  [key: string]: any;
};

export type WorkflowGraph = {
  id: string;
  name?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  meta?: Record<string, any>;
};

export type CompileResult = {
  workflowId?: string;
  graph: WorkflowGraph;
  stats: { nodes: number; triggers: number; actions: number; transforms: number };
  files: Array<{ path: string; content: string }>;
};
