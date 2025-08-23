// NODEGRAPH SCHEMA - Formal DAG Structure for Automation Workflows
// Based on ChatGPT's architecture but extended for 500+ applications

export interface NodeGraph {
  id: string;
  name: string;
  version: number;
  nodes: GraphNode[];
  edges: Edge[];
  scopes: string[];
  secrets: string[];
  metadata?: {
    createdBy?: string;
    createdAt?: string;
    description?: string;
    estimatedValue?: string;
    complexity?: 'Simple' | 'Medium' | 'Complex';
  };
}

export interface GraphNode {
  id: string;
  type: string; // e.g., 'trigger.gmail.new_email', 'action.sheets.append_row'
  label: string;
  params: Record<string, any>;
  inputs?: string[];
  outputs?: string[];
  note?: string;
  position?: { x: number; y: number };
  color?: string;
  icon?: string;
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
  dataType?: string;
}

export interface ValidationError {
  nodeId?: string;
  path: string;
  message: string;
  severity: 'error' | 'warn';
}

export interface CodeFile {
  path: string;
  content: string;
}

// LLM Tool Functions Interface
export interface LLMTools {
  getNodeCatalog: () => NodeCatalog;
  validateGraph: (graph: NodeGraph) => ValidationError[];
  searchApps: (query: string) => AppDefinition[];
  getAppFunctions: (appName: string) => NodeType[];
}

// Node Catalog Structure
export interface NodeCatalog {
  triggers: Record<string, NodeType>;
  transforms: Record<string, NodeType>;
  actions: Record<string, NodeType>;
  categories: Record<string, string[]>;
}

export interface NodeType {
  id: string;
  name: string;
  description: string;
  category: 'trigger' | 'transform' | 'action';
  app: string;
  paramsSchema: {
    type: 'object';
    required?: string[];
    properties: Record<string, any>;
  };
  requiredScopes: string[];
  icon: string;
  color: string;
  complexity: 'Simple' | 'Medium' | 'Complex';
  examples?: string[];
}

// App Definition (for 500+ apps)
export interface AppDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  authType: 'oauth2' | 'api_key' | 'basic' | 'none';
  popularity: number;
  triggers: NodeType[];
  actions: NodeType[];
  transforms?: NodeType[];
  baseUrl?: string;
  documentation?: string;
}

// Connector Descriptor (for HTTP/OAuth2 integration)
export interface ConnectorDescriptor {
  name: string;
  auth: {
    type: 'oauth2' | 'api_key' | 'basic';
    lib?: 'AppsScriptOAuth2';
    configProperties?: string[];
    scopes?: string[];
    tokenUrl?: string;
    authUrl?: string;
  };
  actions: Record<string, ConnectorAction>;
  triggers?: Record<string, ConnectorTrigger>;
}

export interface ConnectorAction {
  type: string;
  paramsSchema: {
    type: 'object';
    required: string[];
    properties: Record<string, any>;
  };
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    headers?: Record<string, string>;
    body?: any;
  };
}

export interface ConnectorTrigger {
  type: string;
  paramsSchema: {
    type: 'object';
    required: string[];
    properties: Record<string, any>;
  };
  polling?: {
    endpoint: string;
    method: 'GET' | 'POST';
    intervalMinutes: number;
  };
  webhook?: {
    path: string;
    method: 'POST';
    verification?: 'hmac' | 'token';
  };
}

// LLM Response Types
export interface LLMPlanResponse {
  graph: NodeGraph;
  rationale: string;
  questions?: Question[];
}

export interface Question {
  id: string;
  text: string;
  kind: 'missingParam' | 'disambiguation' | 'permission' | 'volume';
  targetNodeId?: string;
  choices?: string[];
}

// Orchestrator API Types
export interface ClarifyRequest {
  prompt: string;
  context?: any;
}

export interface ClarifyResponse {
  questions?: Question[];
  guessedGraph?: NodeGraph;
  needsMoreInfo?: boolean;
  summary?: string;
  confidence?: number;
  reasoning?: string;
}

export interface PlanRequest {
  prompt: string;
  answers?: Record<string, string>;
  capabilities: Capabilities;
}

export interface PlanResponse {
  graph: NodeGraph;
  rationale: string;
}

export interface FixRequest {
  graph: NodeGraph;
  errors: ValidationError[];
}

export interface FixResponse {
  graph: NodeGraph;
}

export interface CodegenRequest {
  graph: NodeGraph;
}

export interface CodegenResponse {
  files: CodeFile[];
  entry: string;
}

export interface DeployRequest {
  projectId?: string;
  files: CodeFile[];
  scopes: string[];
}

export interface DeployResponse {
  deploymentId: string;
  webAppUrl?: string;
  projectUrl: string;
}

export interface Capabilities {
  nodes: string[];
  schemasByType: Record<string, any>;
  scopesByType: Record<string, string[]>;
}

// Visual Graph Types (for UI)
export interface VisualNode extends GraphNode {
  position: { x: number; y: number };
  color: string;
  icon: string;
  isSelected?: boolean;
  isHighlighted?: boolean;
  status?: 'idle' | 'running' | 'success' | 'error';
}

export interface VisualEdge extends Edge {
  id: string;
  animated?: boolean;
  style?: Record<string, any>;
}

export interface GraphLayout {
  nodes: VisualNode[];
  edges: VisualEdge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

// Execution State
export interface ExecutionState {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  currentNode?: string;
  results: Record<string, any>;
  errors: ValidationError[];
  startTime: string;
  endTime?: string;
  logs: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  nodeId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}