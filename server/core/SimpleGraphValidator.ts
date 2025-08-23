import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import graphSchema from '../../schemas/graph.schema.json';
import { NodeGraph, ValidationError, ValidationResult } from '../../shared/nodeGraphSchema';

export class SimpleGraphValidator {
  private ajv: Ajv;

  constructor() {
    // Initialize AJV with strict schema validation
    this.ajv = new Ajv({ 
      allErrors: true, 
      strict: false,
      removeAdditional: false,
      useDefaults: true,
      validateFormats: true
    });
    
    // Add format validators
    addFormats(this.ajv);
    
    // Add custom formats for our use case
    this.ajv.addFormat('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    this.ajv.addFormat('url', /^https?:\/\/.+/);
    this.ajv.addFormat('cron', /^(\*|[0-5]?\d) (\*|[01]?\d|2[0-3]) (\*|[012]?\d|3[01]) (\*|[1-9]|1[0-2]) (\*|[0-6])$/);
    
    console.log('✅ SimpleGraphValidator initialized with AJV schema validation');
  }

  public validate(graph: NodeGraph): ValidationResult {
    const errors: ValidationError[] = [];

    try {
      // 1. AJV Schema Validation (NEW - strict enforcement)
      errors.push(...this.validateAgainstSchema(graph));

      // 2. Basic structural validation
      errors.push(...this.validateStructure(graph));

      // 3. Node validation
      for (const node of graph.nodes) {
        errors.push(...this.validateNode(node));
      }

      // 4. Edge validation
      for (const edge of graph.edges) {
        errors.push(...this.validateEdge(edge, graph.nodes));
      }

      // 5. Cycle detection
      if (this.detectCycles(graph)) {
        errors.push({
          path: '/graph',
          message: 'Graph contains cycles which are not allowed',
          severity: 'error'
        });
      }

      // 6. Google Apps Script specific validation
      errors.push(...this.validateGoogleAppsScriptCompatibility(graph));

      // 7. Security and PII validation
      errors.push(...this.validateSecurityAndPII(graph));

      return {
        valid: errors.filter(e => e.severity === 'error').length === 0,
        errors: errors.filter(e => e.severity === 'error'),
        warnings: errors.filter(e => e.severity === 'warning'),
        requiredScopes: this.getRequiredScopes(graph),
        estimatedComplexity: this.getNodeComplexity(graph),
        securityWarnings: errors.filter(e => e.path.includes('security'))
      };

    } catch (error) {
      return {
        valid: false,
        errors: [{
          path: '/graph',
          message: `Validation failed: ${error.message}`,
          severity: 'error'
        }],
        warnings: [],
        requiredScopes: [],
        estimatedComplexity: 'unknown'
      };
    }
  }

  // NEW: AJV Schema Validation
  private validateAgainstSchema(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];
    
    try {
      const validate = this.ajv.compile(graphSchema);
      const valid = validate(graph);
      
      if (!valid && validate.errors) {
        for (const error of validate.errors) {
          errors.push({
            path: error.instancePath || '/',
            message: `Schema validation: ${error.message || 'Invalid data'} at ${error.dataPath || 'root'}`,
            severity: 'error',
            code: 'SCHEMA_VALIDATION',
            details: {
              keyword: error.keyword,
              dataPath: error.dataPath,
              schemaPath: error.schemaPath,
              params: error.params
            }
          });
        }
      }
    } catch (schemaError) {
      errors.push({
        path: '/schema',
        message: `Schema compilation failed: ${schemaError.message}`,
        severity: 'error',
        code: 'SCHEMA_ERROR'
      });
    }

    return errors;
  }

  private validateStructure(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!graph.id || typeof graph.id !== 'string') {
      errors.push({
        path: '/id',
        message: 'Graph must have a valid string ID',
        severity: 'error'
      });
    }

    if (!graph.name || typeof graph.name !== 'string') {
      errors.push({
        path: '/name',
        message: 'Graph must have a valid name',
        severity: 'error'
      });
    }

    if (!Array.isArray(graph.nodes)) {
      errors.push({
        path: '/nodes',
        message: 'Graph nodes must be an array',
        severity: 'error'
      });
    }

    if (!Array.isArray(graph.edges)) {
      errors.push({
        path: '/edges',
        message: 'Graph edges must be an array',
        severity: 'error'
      });
    }

    if (graph.nodes.length === 0) {
      errors.push({
        path: '/nodes',
        message: 'Graph must contain at least one node',
        severity: 'error'
      });
    }

    return errors;
  }

  private validateNode(node: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!node.id || typeof node.id !== 'string') {
      errors.push({
        path: `/nodes/${node.id || 'unknown'}/id`,
        message: 'Node must have a valid string ID',
        severity: 'error'
      });
    }

    if (!node.type || typeof node.type !== 'string') {
      errors.push({
        path: `/nodes/${node.id}/type`,
        message: 'Node must have a valid type',
        severity: 'error'
      });
    }

    // Validate node type categories
    const validNodeTypes = ['trigger', 'action', 'transform', 'condition', 'delay', 'logger'];
    const nodeCategory = node.type?.split('.')[0];
    if (!validNodeTypes.includes(nodeCategory)) {
      errors.push({
        path: `/nodes/${node.id}/type`,
        message: `Invalid node type category: ${nodeCategory}. Must be one of: ${validNodeTypes.join(', ')}`,
        severity: 'error'
      });
    }

    // Validate required parameters based on node type
    if (node.type?.startsWith('action.gmail.') && !node.params?.recipient) {
      errors.push({
        path: `/nodes/${node.id}/params/recipient`,
        message: 'Gmail action nodes require a recipient parameter',
        severity: 'error'
      });
    }

    if (node.type?.startsWith('action.sheets.') && !node.params?.spreadsheetId) {
      errors.push({
        path: `/nodes/${node.id}/params/spreadsheetId`,
        message: 'Sheets action nodes require a spreadsheetId parameter',
        severity: 'error'
      });
    }

    if (node.type?.startsWith('trigger.time.') && !node.params?.schedule) {
      errors.push({
        path: `/nodes/${node.id}/params/schedule`,
        message: 'Time trigger nodes require a schedule parameter',
        severity: 'error'
      });
    }

    // Validate position coordinates
    if (node.position && (typeof node.position.x !== 'number' || typeof node.position.y !== 'number')) {
      errors.push({
        path: `/nodes/${node.id}/position`,
        message: 'Node position must have numeric x and y coordinates',
        severity: 'warning'
      });
    }

    return errors;
  }

  private validateEdge(edge: any, nodes: any[]): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!edge.id || typeof edge.id !== 'string') {
      errors.push({
        path: `/edges/${edge.id || 'unknown'}/id`,
        message: 'Edge must have a valid string ID',
        severity: 'error'
      });
    }

    if (!edge.source || typeof edge.source !== 'string') {
      errors.push({
        path: `/edges/${edge.id}/source`,
        message: 'Edge must have a valid source node ID',
        severity: 'error'
      });
    }

    if (!edge.target || typeof edge.target !== 'string') {
      errors.push({
        path: `/edges/${edge.id}/target`,
        message: 'Edge must have a valid target node ID',
        severity: 'error'
      });
    }

    // Validate that source and target nodes exist
    const nodeIds = nodes.map(n => n.id);
    if (edge.source && !nodeIds.includes(edge.source)) {
      errors.push({
        path: `/edges/${edge.id}/source`,
        message: `Source node '${edge.source}' does not exist`,
        severity: 'error'
      });
    }

    if (edge.target && !nodeIds.includes(edge.target)) {
      errors.push({
        path: `/edges/${edge.id}/target`,
        message: `Target node '${edge.target}' does not exist`,
        severity: 'error'
      });
    }

    return errors;
  }

  private detectCycles(graph: NodeGraph): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoingEdges = graph.edges.filter(edge => edge.source === nodeId);
      for (const edge of outgoingEdges) {
        const targetId = edge.target;
        
        if (!visited.has(targetId)) {
          if (hasCycleDFS(targetId)) {
            return true;
          }
        } else if (recursionStack.has(targetId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) {
          return true;
        }
      }
    }

    return false;
  }

  private validateGoogleAppsScriptCompatibility(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for unsupported operations
    for (const node of graph.nodes) {
      if (node.type?.includes('file_system') || node.type?.includes('database')) {
        errors.push({
          path: `/nodes/${node.id}/type`,
          message: 'File system and database operations are not supported in Google Apps Script',
          severity: 'error'
        });
      }

      if (node.type?.includes('external_http') && !node.params?.url?.startsWith('https://')) {
        errors.push({
          path: `/nodes/${node.id}/params/url`,
          message: 'External HTTP requests must use HTTPS in Google Apps Script',
          severity: 'warning'
        });
      }
    }

    // Check execution time limits
    if (graph.nodes.length > 50) {
      errors.push({
        path: '/nodes',
        message: 'Large workflows may exceed Google Apps Script execution time limits (6 minutes)',
        severity: 'warning'
      });
    }

    return errors;
  }

  private validateSecurityAndPII(graph: NodeGraph): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const node of graph.nodes) {
      if (node.params) {
        // Check for potential PII in parameters
        const paramString = JSON.stringify(node.params).toLowerCase();
        const piiPatterns = ['password', 'ssn', 'social security', 'credit card', 'bank account'];
        
        for (const pattern of piiPatterns) {
          if (paramString.includes(pattern)) {
            errors.push({
              path: `/nodes/${node.id}/params/security`,
              message: `Potential PII detected in parameters: ${pattern}`,
              severity: 'warning',
              code: 'PII_WARNING'
            });
          }
        }

        // Check for hardcoded secrets
        const secretPatterns = ['api_key', 'token', 'secret', 'password'];
        for (const pattern of secretPatterns) {
          if (paramString.includes(pattern) && !paramString.includes('${') && !paramString.includes('process.env')) {
            errors.push({
              path: `/nodes/${node.id}/params/security`,
              message: `Hardcoded secret detected: ${pattern}. Use environment variables instead.`,
              severity: 'warning',
              code: 'HARDCODED_SECRET'
            });
          }
        }
      }
    }

    return errors;
  }

  public getRequiredScopes(graph: NodeGraph): string[] {
    const scopes = new Set<string>();

    for (const node of graph.nodes) {
      if (node.type?.startsWith('action.gmail.') || node.type?.startsWith('trigger.gmail.')) {
        scopes.add('https://www.googleapis.com/auth/gmail.readonly');
        scopes.add('https://www.googleapis.com/auth/gmail.send');
      }
      
      if (node.type?.startsWith('action.sheets.') || node.type?.startsWith('trigger.sheets.')) {
        scopes.add('https://www.googleapis.com/auth/spreadsheets');
      }
      
      if (node.type?.startsWith('action.drive.') || node.type?.startsWith('trigger.drive.')) {
        scopes.add('https://www.googleapis.com/auth/drive');
      }
      
      if (node.type?.startsWith('action.calendar.') || node.type?.startsWith('trigger.calendar.')) {
        scopes.add('https://www.googleapis.com/auth/calendar');
      }
    }

    return Array.from(scopes);
  }

  public getNodeComplexity(graph: NodeGraph): 'simple' | 'medium' | 'complex' | 'unknown' {
    const nodeCount = graph.nodes.length;
    const edgeCount = graph.edges.length;
    
    if (nodeCount <= 3 && edgeCount <= 2) return 'simple';
    if (nodeCount <= 8 && edgeCount <= 10) return 'medium';
    if (nodeCount <= 20 && edgeCount <= 30) return 'complex';
    return 'unknown';
  }
}

// Export singleton instance
export const simpleGraphValidator = new SimpleGraphValidator();