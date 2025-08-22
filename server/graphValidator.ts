// GRAPH VALIDATOR - NodeGraph Validation System
// Based on ChatGPT's validation architecture

import { NodeGraph, ValidationError, GraphNode } from '../shared/nodeGraphSchema';
import { EnhancedNodeCatalog } from './enhancedNodeCatalog';

export class GraphValidator {
  private nodeCatalog: EnhancedNodeCatalog;

  constructor() {
    this.nodeCatalog = EnhancedNodeCatalog.getInstance();
  }

  public validateGraph(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Schema validation
    errors.push(...this.validateSchema(graph));

    // 2. Node ID uniqueness
    errors.push(...this.validateNodeIds(graph));

    // 3. DAG acyclicity check
    errors.push(...this.validateAcyclicity(graph));

    // 4. Node type existence
    errors.push(...this.validateNodeTypes(graph));

    // 5. Parameter completeness
    errors.push(...this.validateParameters(graph));

    // 6. Scope inference validation
    errors.push(...this.validateScopes(graph));

    // 7. Edge validation
    errors.push(...this.validateEdges(graph));

    return errors;
  }

  private validateSchema(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];

    // Required fields
    if (!graph.id) {
      errors.push({
        path: 'id',
        message: 'Graph ID is required',
        severity: 'error'
      });
    }

    if (!graph.name) {
      errors.push({
        path: 'name',
        message: 'Graph name is required',
        severity: 'error'
      });
    }

    if (!graph.version || graph.version < 1) {
      errors.push({
        path: 'version',
        message: 'Graph version must be >= 1',
        severity: 'error'
      });
    }

    if (!Array.isArray(graph.nodes)) {
      errors.push({
        path: 'nodes',
        message: 'Nodes must be an array',
        severity: 'error'
      });
    }

    if (!Array.isArray(graph.edges)) {
      errors.push({
        path: 'edges',
        message: 'Edges must be an array',
        severity: 'error'
      });
    }

    if (!Array.isArray(graph.scopes)) {
      errors.push({
        path: 'scopes',
        message: 'Scopes must be an array',
        severity: 'error'
      });
    }

    if (!Array.isArray(graph.secrets)) {
      errors.push({
        path: 'secrets',
        message: 'Secrets must be an array',
        severity: 'error'
      });
    }

    return errors;
  }

  private validateNodeIds(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];
    const nodeIds = new Set<string>();
    const duplicates = new Set<string>();

    graph.nodes.forEach((node, index) => {
      if (!node.id) {
        errors.push({
          path: `nodes[${index}].id`,
          message: 'Node ID is required',
          severity: 'error'
        });
        return;
      }

      if (nodeIds.has(node.id)) {
        duplicates.add(node.id);
      } else {
        nodeIds.add(node.id);
      }
    });

    duplicates.forEach(id => {
      errors.push({
        nodeId: id,
        path: 'id',
        message: `Duplicate node ID: ${id}`,
        severity: 'error'
      });
    });

    return errors;
  }

  private validateAcyclicity(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const sortedNodes = this.topologicalSort(graph);
      if (sortedNodes.length !== graph.nodes.length) {
        errors.push({
          path: 'edges',
          message: 'Graph contains cycles',
          severity: 'error'
        });
      }
    } catch (error) {
      errors.push({
        path: 'edges',
        message: 'Graph validation failed: ' + (error as Error).message,
        severity: 'error'
      });
    }

    return errors;
  }

  private validateNodeTypes(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];
    const catalog = this.nodeCatalog.getNodeCatalog();
    const allNodeTypes = { ...catalog.triggers, ...catalog.transforms, ...catalog.actions };

    graph.nodes.forEach((node, index) => {
      if (!node.type) {
        errors.push({
          nodeId: node.id,
          path: `nodes[${index}].type`,
          message: 'Node type is required',
          severity: 'error'
        });
        return;
      }

      if (!allNodeTypes[node.type]) {
        errors.push({
          nodeId: node.id,
          path: `nodes[${index}].type`,
          message: `Unknown node type: ${node.type}`,
          severity: 'error'
        });
      }
    });

    return errors;
  }

  private validateParameters(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];
    const catalog = this.nodeCatalog.getNodeCatalog();
    const allNodeTypes = { ...catalog.triggers, ...catalog.transforms, ...catalog.actions };

    graph.nodes.forEach((node, index) => {
      const nodeType = allNodeTypes[node.type];
      if (!nodeType) return; // Already caught in type validation

      const schema = nodeType.paramsSchema;
      if (schema && schema.required) {
        schema.required.forEach((requiredParam: string) => {
          if (!node.params || !(requiredParam in node.params)) {
            errors.push({
              nodeId: node.id,
              path: `nodes[${index}].params.${requiredParam}`,
              message: `Missing required parameter: ${requiredParam}`,
              severity: 'error'
            });
          }
        });
      }

      // Validate parameter types
      if (schema && schema.properties && node.params) {
        Object.entries(node.params).forEach(([paramName, paramValue]) => {
          const paramSchema = schema.properties[paramName];
          if (paramSchema) {
            const validationError = this.validateParameterType(
              paramValue, 
              paramSchema, 
              `nodes[${index}].params.${paramName}`
            );
            if (validationError) {
              errors.push({
                nodeId: node.id,
                ...validationError
              });
            }
          }
        });
      }
    });

    return errors;
  }

  private validateParameterType(value: any, schema: any, path: string): ValidationError | null {
    if (schema.type === 'string' && typeof value !== 'string') {
      return {
        path,
        message: `Expected string, got ${typeof value}`,
        severity: 'error'
      };
    }

    if (schema.type === 'number' && typeof value !== 'number') {
      return {
        path,
        message: `Expected number, got ${typeof value}`,
        severity: 'error'
      };
    }

    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      return {
        path,
        message: `Expected boolean, got ${typeof value}`,
        severity: 'error'
      };
    }

    if (schema.type === 'array' && !Array.isArray(value)) {
      return {
        path,
        message: `Expected array, got ${typeof value}`,
        severity: 'error'
      };
    }

    if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      return {
        path,
        message: `Expected object, got ${typeof value}`,
        severity: 'error'
      };
    }

    // Validate enum values
    if (schema.enum && !schema.enum.includes(value)) {
      return {
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        severity: 'error'
      };
    }

    // Validate number constraints
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        return {
          path,
          message: `Value must be >= ${schema.minimum}`,
          severity: 'error'
        };
      }

      if (schema.maximum !== undefined && value > schema.maximum) {
        return {
          path,
          message: `Value must be <= ${schema.maximum}`,
          severity: 'error'
        };
      }
    }

    return null;
  }

  private validateScopes(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];
    const catalog = this.nodeCatalog.getNodeCatalog();
    const allNodeTypes = { ...catalog.triggers, ...catalog.transforms, ...catalog.actions };

    // Calculate required scopes from nodes
    const requiredScopes = new Set<string>();
    graph.nodes.forEach(node => {
      const nodeType = allNodeTypes[node.type];
      if (nodeType) {
        nodeType.requiredScopes.forEach(scope => requiredScopes.add(scope));
      }
    });

    // Check if graph scopes match required scopes
    const graphScopes = new Set(graph.scopes);
    requiredScopes.forEach(scope => {
      if (!graphScopes.has(scope)) {
        errors.push({
          path: 'scopes',
          message: `Missing required scope: ${scope}`,
          severity: 'error'
        });
      }
    });

    // Warn about unnecessary scopes
    graphScopes.forEach(scope => {
      if (!requiredScopes.has(scope)) {
        errors.push({
          path: 'scopes',
          message: `Unnecessary scope: ${scope}`,
          severity: 'warn'
        });
      }
    });

    return errors;
  }

  private validateEdges(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];
    const nodeIds = new Set(graph.nodes.map(n => n.id));

    graph.edges.forEach((edge, index) => {
      if (!edge.from) {
        errors.push({
          path: `edges[${index}].from`,
          message: 'Edge source is required',
          severity: 'error'
        });
      } else if (!nodeIds.has(edge.from)) {
        errors.push({
          path: `edges[${index}].from`,
          message: `Edge references unknown node: ${edge.from}`,
          severity: 'error'
        });
      }

      if (!edge.to) {
        errors.push({
          path: `edges[${index}].to`,
          message: 'Edge target is required',
          severity: 'error'
        });
      } else if (!nodeIds.has(edge.to)) {
        errors.push({
          path: `edges[${index}].to`,
          message: `Edge references unknown node: ${edge.to}`,
          severity: 'error'
        });
      }
    });

    return errors;
  }

  // Topological sort for cycle detection
  private topologicalSort(graph: NodeGraph): string[] {
    const nodeIds = graph.nodes.map(n => n.id);
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    nodeIds.forEach(id => {
      adjacencyList.set(id, []);
      inDegree.set(id, 0);
    });

    // Build adjacency list and in-degree count
    graph.edges.forEach(edge => {
      const fromList = adjacencyList.get(edge.from) || [];
      fromList.push(edge.to);
      adjacencyList.set(edge.from, fromList);

      const currentInDegree = inDegree.get(edge.to) || 0;
      inDegree.set(edge.to, currentInDegree + 1);
    });

    // Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    // Find nodes with no incoming edges
    nodeIds.forEach(id => {
      if ((inDegree.get(id) || 0) === 0) {
        queue.push(id);
      }
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = adjacencyList.get(current) || [];
      neighbors.forEach(neighbor => {
        const newInDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newInDegree);

        if (newInDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    return result;
  }

  // Safety and guardrail validations
  public validateSafetyGuidelines(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];

    graph.nodes.forEach((node, index) => {
      // Check for potential PII exposure
      if (node.type.includes('gmail') && node.type.includes('send')) {
        if (this.containsPotentialPII(node.params)) {
          errors.push({
            nodeId: node.id,
            path: `nodes[${index}].params`,
            message: 'Potential PII exposure detected. Please review email content.',
            severity: 'warn'
          });
        }
      }

      // Check for unbounded polling
      if (node.type.includes('trigger') && node.params.polling) {
        if (!node.params.intervalMinutes || node.params.intervalMinutes < 1) {
          errors.push({
            nodeId: node.id,
            path: `nodes[${index}].params.intervalMinutes`,
            message: 'Unbounded polling detected. Consider adding time filters.',
            severity: 'warn'
          });
        }
      }

      // Check for missing dedupe keys
      if (node.type.includes('trigger') && !node.params.dedupeKey) {
        errors.push({
          nodeId: node.id,
          path: `nodes[${index}].params`,
          message: 'Consider adding dedupe key for high-volume triggers.',
          severity: 'warn'
        });
      }
    });

    return errors;
  }

  private containsPotentialPII(params: any): boolean {
    const piiKeywords = ['email', 'phone', 'ssn', 'address', 'name', 'personal'];
    const paramsString = JSON.stringify(params).toLowerCase();
    
    return piiKeywords.some(keyword => paramsString.includes(keyword));
  }
}