import type { WorkflowMetadata } from '../shared/workflow/metadata';

export type NodeType = 'trigger' | 'action' | 'transform' | 'condition';

export type WorkflowNodeMetadata = WorkflowMetadata;

export type WorkflowNode = {
  id: string;
  type: NodeType;
  app: string;      // e.g., 'gmail' | 'sheets'
  name: string;     // human name, e.g., 'Gmail Trigger'
  op: string;       // machine op, e.g., 'gmail.watchInbox'
  params: Record<string, any>;
  connectionId?: string;
  auth?: Record<string, any>;
  credentials?: Record<string, any>;
  data?: {
    label?: string;
    operation?: string;
    config?: Record<string, any>;
    parameters?: Record<string, any>;
    metadata?: WorkflowNodeMetadata;
    outputMetadata?: WorkflowNodeMetadata;
    [key: string]: any;
  };
  metadata?: WorkflowNodeMetadata;
  outputMetadata?: WorkflowNodeMetadata;
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

export type WorkflowEnvironment = 'dev' | 'stage' | 'prod';
export type WorkflowVersionState = 'draft' | 'published';

export interface WorkflowVersionSummary {
  id: string;
  workflowId: string;
  organizationId: string;
  versionNumber: number;
  state: WorkflowVersionState;
  graph: WorkflowGraph;
  metadata?: Record<string, any> | null;
  name?: string | null;
  description?: string | null;
  createdAt: string;
  createdBy?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
}

export interface WorkflowDeploymentSummary {
  id: string;
  workflowId: string;
  organizationId: string;
  versionId: string;
  environment: WorkflowEnvironment;
  deployedAt: string;
  deployedBy?: string | null;
  metadata?: Record<string, any> | null;
  rollbackOf?: string | null;
}

export interface WorkflowDiffSummary {
  hasChanges: boolean;
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  metadataChanged: boolean;
}

export interface WorkflowDiffResponse {
  draftVersion?: WorkflowVersionSummary | null;
  deployedVersion?: WorkflowVersionSummary | null;
  deployment?: WorkflowDeploymentSummary | null;
  summary: WorkflowDiffSummary;
}

export type CompileResult = {
  workflowId?: string;
  graph: WorkflowGraph;
  stats: { nodes: number; triggers: number; actions: number; transforms: number };
  files: Array<{ path: string; content: string }>;
};
