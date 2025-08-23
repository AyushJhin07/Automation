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

export class SimpleGraphValidator {
  
  /**
   * Simple validation without AJV dependency
   */
  public validate(graph: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let requiredScopes: string[] = [];
    let estimatedComplexity = 0;

    // Basic structure validation
    if (!graph) {
      errors.push({
        path: 'root',
        message: 'Graph is required',
        severity: 'error',
        code: 'MISSING_GRAPH'
      });
      return { valid: false, errors, warnings, requiredScopes, estimatedComplexity };
    }

    if (!graph.id) {
      errors.push({
        path: 'id',
        message: 'Graph ID is required',
        severity: 'error',
        code: 'MISSING_ID'
      });
    }

    if (!graph.name) {
      errors.push({
        path: 'name',
        message: 'Graph name is required',
        severity: 'error',
        code: 'MISSING_NAME'
      });
    }

    if (!Array.isArray(graph.nodes)) {
      errors.push({
        path: 'nodes',
        message: 'Nodes must be an array',
        severity: 'error',
        code: 'INVALID_NODES'
      });
    } else {
      // Validate nodes
      graph.nodes.forEach((node: any, index: number) => {
        const nodeValidation = this.validateNode(node, index);
        errors.push(...nodeValidation.errors);
        warnings.push(...nodeValidation.warnings);
        requiredScopes.push(...nodeValidation.scopes);
        estimatedComplexity += nodeValidation.complexity;
      });
    }

    if (!Array.isArray(graph.edges)) {
      errors.push({
        path: 'edges',
        message: 'Edges must be an array',
        severity: 'error',
        code: 'INVALID_EDGES'
      });
    } else {
      // Validate edges
      graph.edges.forEach((edge: any, index: number) => {
        const edgeValidation = this.validateEdge(edge, graph.nodes, index);
        errors.push(...edgeValidation.errors);
        warnings.push(...edgeValidation.warnings);
      });
    }

    // Check for cycles (simple version)
    const cycleCheck = this.detectCycles(graph);
    if (cycleCheck.hasCycles) {
      errors.push({
        path: 'edges',
        message: `Circular dependency detected: ${cycleCheck.cycles.join(' → ')}`,
        severity: 'error',
        code: 'CIRCULAR_DEPENDENCY'
      });
    }

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
    } else {
      // Get scopes for node type
      const nodeScopes = this.getRequiredScopes(node.type);
      scopes.push(...nodeScopes);
      complexity = this.getNodeComplexity(node.type);
    }

    return { errors, warnings, scopes, complexity };
  }

  private validateEdge(edge: any, nodes: any[], index: number): {
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const path = `edges[${index}]`;

    if (!edge.source) {
      errors.push({
        path: `${path}.source`,
        message: 'Edge source is required',
        severity: 'error',
        code: 'MISSING_SOURCE'
      });
    }

    if (!edge.target) {
      errors.push({
        path: `${path}.target`,
        message: 'Edge target is required',
        severity: 'error',
        code: 'MISSING_TARGET'
      });
    }

    // Check if source and target nodes exist
    if (nodes && edge.source && edge.target) {
      const sourceExists = nodes.some(n => n.id === edge.source);
      const targetExists = nodes.some(n => n.id === edge.target);

      if (!sourceExists) {
        errors.push({
          path: `${path}.source`,
          message: `Source node '${edge.source}' not found`,
          severity: 'error',
          code: 'INVALID_SOURCE'
        });
      }

      if (!targetExists) {
        errors.push({
          path: `${path}.target`,
          message: `Target node '${edge.target}' not found`,
          severity: 'error',
          code: 'INVALID_TARGET'
        });
      }
    }

    return { errors, warnings };
  }

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

    // Simple cycle detection using DFS
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

  private getRequiredScopes(nodeType: string): string[] {
    const scopeMap: Record<string, string[]> = {
      'gmail.send': ['https://www.googleapis.com/auth/gmail.send'],
      'gmail.read': ['https://www.googleapis.com/auth/gmail.readonly'],
      'sheets.read': ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      'sheets.write': ['https://www.googleapis.com/auth/spreadsheets'],
      'sheets.append': ['https://www.googleapis.com/auth/spreadsheets'],
      'drive.read': ['https://www.googleapis.com/auth/drive.readonly'],
      'drive.write': ['https://www.googleapis.com/auth/drive.file'],
      'calendar.read': ['https://www.googleapis.com/auth/calendar.readonly'],
      'calendar.write': ['https://www.googleapis.com/auth/calendar'],
      'trigger.gmail.new_email': ['https://www.googleapis.com/auth/gmail.readonly'],
      'trigger.sheets.row_added': ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      'action.gmail.send': ['https://www.googleapis.com/auth/gmail.send'],
      'action.sheets.append': ['https://www.googleapis.com/auth/spreadsheets'],
      'action.drive.create_file': ['https://www.googleapis.com/auth/drive.file']
    };

    return scopeMap[nodeType] || [];
  }

  private getNodeComplexity(nodeType: string): number {
    const complexityMap: Record<string, number> = {
      'trigger.time.cron': 1,
      'trigger.webhook': 2,
      'trigger.gmail.new_email': 3,
      'trigger.sheets.row_added': 2,
      'action.gmail.send': 3,
      'action.sheets.append': 2,
      'action.drive.create_file': 2,
      'action.http.request': 4,
      'condition.if': 2,
      'transform.data_mapper': 3,
      'utility.delay': 1,
      'utility.logger': 1
    };

    return complexityMap[nodeType] || 2;
  }
}

// Export singleton instance
export const simpleGraphValidator = new SimpleGraphValidator();