export type NodeType = 'trigger' | 'action' | 'transform';

export type WorkflowNode = {
  id: string;
  type: NodeType;
  app: string;      // e.g., 'gmail' | 'sheets'
  name: string;     // human name, e.g., 'Gmail Trigger'
  op: string;       // machine op, e.g., 'gmail.watchInbox'
  params: Record<string, any>;
};

export type WorkflowEdge = { id: string; from: string; to: string };

export type WorkflowGraph = {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  meta?: Record<string, any>;
};

export type CompileResult = {
  workflowId: string;
  graph: WorkflowGraph;
  stats: { nodes: number; triggers: number; actions: number; transforms: number };
  files: Array<{ path: string; content: string }>;
};