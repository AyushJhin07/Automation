import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Import our graph schema
const graphSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name", "nodes", "edges"],
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "data"],
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string" },
          "data": { "type": "object" },
          "position": { "type": "object" }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "source", "target"],
        "properties": {
          "id": { "type": "string" },
          "source": { "type": "string" },
          "target": { "type": "string" }
        }
      }
    }
  }
};

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  requiredScopes: string[];
  estimatedComplexity: number;
}

export class GraphValidator {
  private ajv: Ajv;
  private validateSchema: any;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.validateSchema = this.ajv.compile(graphSchema);
  }

  /**
   * Validates a NodeGraph for correctness and Google Apps Script compatibility
   */
  public validate(graph: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let requiredScopes: string[] = [];
    let estimatedComplexity = 0;

    // 1. JSON Schema Validation
    const schemaValid = this.validateSchema(graph);
    if (!schemaValid) {
      this.validateSchema.errors?.forEach((error: any) => {
        errors.push({
          path: error.instancePath || 'root',
          message: error.message || 'Schema validation failed',
          severity: 'error',
          code: 'SCHEMA_ERROR'
        });
      });
    }

    // 2. Topological Sort (DAG validation)
    const cycleCheck = this.detectCycles(graph);
    if (cycleCheck.hasCycles) {
      errors.push({
        path: 'edges',
        message: `Circular dependency detected: ${cycleCheck.cycles.join(' → ')}`,
        severity: 'error',
        code: 'CIRCULAR_DEPENDENCY'
      });
    }

    // 3. Node-specific validation
    graph.nodes?.forEach((node: any, index: number) => {
      const nodeValidation = this.validateNode(node, index);
      errors.push(...nodeValidation.errors);
      warnings.push(...nodeValidation.warnings);
      requiredScopes.push(...nodeValidation.scopes);
      estimatedComplexity += nodeValidation.complexity;
    });

    // 4. Edge validation
    graph.edges?.forEach((edge: any, index: number) => {
      const edgeValidation = this.validateEdge(edge, graph.nodes, index);
      errors.push(...edgeValidation.errors);
      warnings.push(...edgeValidation.warnings);
    });

    // 5. Google Apps Script specific validations
    const gasValidation = this.validateGoogleAppsScriptCompatibility(graph);
    errors.push(...gasValidation.errors);
    warnings.push(...gasValidation.warnings);

    // Remove duplicate scopes
    requiredScopes = [...new Set(requiredScopes)];

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      requiredScopes,
      estimatedComplexity
    };
  }

  /**
   * Detects cycles in the graph using DFS
   */
  private detectCycles(graph: any): { hasCycles: boolean; cycles: string[] } {
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    
    // Build adjacency list
    const adjList: Record<string, string[]> = {};
    nodes.forEach((node: any) => {
      adjList[node.id] = [];
    });
    
    edges.forEach((edge: any) => {
      if (adjList[edge.source]) {
        adjList[edge.source].push(edge.target);
      }
    });

    // DFS cycle detection
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      for (const neighbor of adjList[nodeId] || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path, neighbor])) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          cycles.push(path.slice(cycleStart).join(' → '));
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id, [node.id])) {
          break;
        }
      }
    }

    return {
      hasCycles: cycles.length > 0,
      cycles
    };
  }

  /**
   * Validates individual nodes
   */
  private validateNode(node: any, index: number): {
    errors: ValidationError[];
    warnings: ValidationError[];
    scopes: string[];
    complexity: number;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const scopes: string[] = [];
    let complexity = 1;

    const path = `nodes[${index}]`;

    // Check required fields
    if (!node.id) {
      errors.push({
        path: `${path}.id`,
        message: 'Node ID is required',
        severity: 'error',
        code: 'MISSING_ID'
      });
    }

    if (!node.type) {
      errors.push({
        path: `${path}.type`,
        message: 'Node type is required',
        severity: 'error',
        code: 'MISSING_TYPE'
      });
    }

    // Validate node type and extract scopes
    if (node.type) {
      const nodeScopes = this.getRequiredScopes(node.type, node.data);
      scopes.push(...nodeScopes);
      
      // Estimate complexity based on node type
      complexity = this.getNodeComplexity(node.type);
    }

    // Validate node data based on type
    if (node.type && node.data) {
      const dataValidation = this.validateNodeData(node.type, node.data);
      errors.push(...dataValidation.errors.map(e => ({
        ...e,
        path: `${path}.data.${e.path}`
      })));
      warnings.push(...dataValidation.warnings.map(w => ({
        ...w,
        path: `${path}.data.${w.path}`
      })));
    }

    return { errors, warnings, scopes, complexity };
  }

  /**
   * Validates edges between nodes
   */
  private validateEdge(edge: any, nodes: any[], index: number): {
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const path = `edges[${index}]`;

    // Check if source and target nodes exist
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);

    if (!sourceNode) {
      errors.push({
        path: `${path}.source`,
        message: `Source node '${edge.source}' not found`,
        severity: 'error',
        code: 'INVALID_SOURCE'
      });
    }

    if (!targetNode) {
      errors.push({
        path: `${path}.target`,
        message: `Target node '${edge.target}' not found`,
        severity: 'error',
        code: 'INVALID_TARGET'
      });
    }

    // Validate edge compatibility
    if (sourceNode && targetNode) {
      const compatibility = this.checkNodeCompatibility(sourceNode, targetNode);
      if (!compatibility.compatible) {
        warnings.push({
          path: path,
          message: compatibility.reason || 'Nodes may not be compatible',
          severity: 'warning',
          code: 'COMPATIBILITY_WARNING'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Google Apps Script specific validations
   */
  private validateGoogleAppsScriptCompatibility(graph: any): {
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check for unsupported features
    const unsupportedNodes = graph.nodes?.filter((node: any) => 
      this.isUnsupportedInGAS(node.type)
    ) || [];

    unsupportedNodes.forEach((node: any) => {
      errors.push({
        path: `nodes[${node.id}]`,
        message: `Node type '${node.type}' is not supported in Google Apps Script`,
        severity: 'error',
        code: 'UNSUPPORTED_NODE'
      });
    });

    // Check execution time limits
    const estimatedRuntime = this.estimateRuntime(graph);
    if (estimatedRuntime > 360) { // 6 minutes limit
      warnings.push({
        path: 'graph',
        message: `Estimated runtime (${estimatedRuntime}s) may exceed Google Apps Script limits (360s)`,
        severity: 'warning',
        code: 'RUNTIME_WARNING'
      });
    }

    return { errors, warnings };
  }

  /**
   * Get required OAuth scopes for a node type
   */
  private getRequiredScopes(nodeType: string, nodeData: any): string[] {
    const scopeMap: Record<string, string[]> = {
      'gmail.send': ['https://www.googleapis.com/auth/gmail.send'],
      'gmail.read': ['https://www.googleapis.com/auth/gmail.readonly'],
      'sheets.read': ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      'sheets.write': ['https://www.googleapis.com/auth/spreadsheets'],
      'drive.read': ['https://www.googleapis.com/auth/drive.readonly'],
      'drive.write': ['https://www.googleapis.com/auth/drive.file'],
      'calendar.read': ['https://www.googleapis.com/auth/calendar.readonly'],
      'calendar.write': ['https://www.googleapis.com/auth/calendar']
    };

    return scopeMap[nodeType] || [];
  }

  /**
   * Get complexity score for a node type
   */
  private getNodeComplexity(nodeType: string): number {
    const complexityMap: Record<string, number> = {
      'trigger.time': 1,
      'trigger.webhook': 2,
      'gmail.send': 3,
      'sheets.append': 2,
      'http.request': 4,
      'condition.if': 2,
      'loop.foreach': 5
    };

    return complexityMap[nodeType] || 2;
  }

  /**
   * Validate node-specific data
   */
  private validateNodeData(nodeType: string, data: any): {
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Node-specific validation logic
    switch (nodeType) {
      case 'gmail.send':
        if (!data.to) {
          errors.push({
            path: 'to',
            message: 'Recipient email is required',
            severity: 'error',
            code: 'MISSING_RECIPIENT'
          });
        }
        if (!data.subject && !data.body) {
          warnings.push({
            path: 'content',
            message: 'Email should have subject or body',
            severity: 'warning',
            code: 'EMPTY_EMAIL'
          });
        }
        break;

      case 'sheets.append':
        if (!data.spreadsheetId) {
          errors.push({
            path: 'spreadsheetId',
            message: 'Spreadsheet ID is required',
            severity: 'error',
            code: 'MISSING_SPREADSHEET'
          });
        }
        break;

      case 'http.request':
        if (!data.url) {
          errors.push({
            path: 'url',
            message: 'URL is required for HTTP requests',
            severity: 'error',
            code: 'MISSING_URL'
          });
        }
        break;
    }

    return { errors, warnings };
  }

  /**
   * Check if two nodes are compatible for connection
   */
  private checkNodeCompatibility(sourceNode: any, targetNode: any): {
    compatible: boolean;
    reason?: string;
  } {
    // Basic compatibility rules
    if (sourceNode.type.startsWith('trigger.') && targetNode.type.startsWith('trigger.')) {
      return {
        compatible: false,
        reason: 'Cannot connect two trigger nodes'
      };
    }

    return { compatible: true };
  }

  /**
   * Check if node type is supported in Google Apps Script
   */
  private isUnsupportedInGAS(nodeType: string): boolean {
    const unsupported = [
      'server.express',
      'database.mysql',
      'filesystem.write'
    ];
    
    return unsupported.includes(nodeType);
  }

  /**
   * Estimate runtime for the entire graph
   */
  private estimateRuntime(graph: any): number {
    let totalTime = 0;
    
    graph.nodes?.forEach((node: any) => {
      const nodeTime = this.getNodeExecutionTime(node.type);
      totalTime += nodeTime;
    });

    return totalTime;
  }

  /**
   * Get estimated execution time for a node type
   */
  private getNodeExecutionTime(nodeType: string): number {
    const timeMap: Record<string, number> = {
      'gmail.send': 2,
      'sheets.append': 1,
      'http.request': 3,
      'condition.if': 0.1,
      'loop.foreach': 5
    };

    return timeMap[nodeType] || 1;
  }
}

// Export singleton instance
export const graphValidator = new GraphValidator();