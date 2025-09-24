// NODE SCHEMA GENERATOR - CREATE JSON SCHEMAS FOR ALL CONNECTOR FUNCTIONS
// Generates comprehensive node schemas for graph validation and UI integration

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface ConnectorFunction {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, {
    type: string;
    required: boolean;
    description: string;
    options?: string[];
    default?: any;
    sensitive?: boolean;
  }>;
  params?: Record<string, {
    type: string;
    required: boolean;
    description: string;
    options?: string[];
    default?: any;
    sensitive?: boolean;
  }>;
  requiredScopes?: string[];
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    dailyLimit?: number;
  };
}

interface ConnectorData {
  name: string;
  category: string;
  description: string;
  actions: ConnectorFunction[];
  triggers: ConnectorFunction[];
  authentication: {
    type: string;
    config: any;
  };
}

interface NodeSchema {
  $schema: string;
  $id: string;
  title: string;
  description: string;
  type: string;
  required: string[];
  properties: Record<string, any>;
  additionalProperties: boolean;
  anyOf?: Array<Record<string, any>>;
}

export class NodeSchemaGenerator {
  private connectorsPath: string;
  private schemasPath: string;
  private nodesSchemasPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
    this.schemasPath = join(process.cwd(), 'schemas');
    this.nodesSchemasPath = join(this.schemasPath, 'nodes');

    // Ensure directories exist
    if (!existsSync(this.schemasPath)) {
      mkdirSync(this.schemasPath, { recursive: true });
    }

    if (!existsSync(this.nodesSchemasPath)) {
      mkdirSync(this.nodesSchemasPath, { recursive: true });
    }
  }

  /**
   * Generate all node schemas from connector files
   */
  async generateAllSchemas(): Promise<{ generated: number; errors: string[] }> {
    console.log('🏗️ Generating comprehensive node schemas...\n');
    
    const results = {
      generated: 0,
      errors: [] as string[]
    };

    try {
      // Read all connector files
      const connectorFiles = this.getConnectorFiles();
      console.log(`📁 Found ${connectorFiles.length} connector files`);

      for (const file of connectorFiles) {
        try {
          const generated = await this.generateSchemasForConnector(file);
          results.generated += generated;
          console.log(`✅ Generated ${generated} schemas for ${file}`);
        } catch (error) {
          const errorMsg = `Failed to generate schemas for ${file}: ${error}`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      }

      const staticGenerated = this.generateStaticNodeSchemas();
      results.generated += staticGenerated;
      console.log(`✅ Generated ${staticGenerated} static node schemas`);

      console.log(`\n🎯 Schema generation complete: ${results.generated} schemas generated, ${results.errors.length} errors`);
      return results;

    } catch (error) {
      const errorMsg = `Schema generation failed: ${error}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Get all connector JSON files
   */
  private getConnectorFiles(): string[] {
    try {
      const files = readdirSync(this.connectorsPath);
      return files
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.warn(`⚠️ Could not read connectors directory: ${error}`);
      return [];
    }
  }

  /**
   * Generate schemas for a single connector
   */
  private async generateSchemasForConnector(filename: string): Promise<number> {
    const filePath = join(this.connectorsPath, filename);
    const fileContent = readFileSync(filePath, 'utf-8');
    const connectorData: ConnectorData = JSON.parse(fileContent);
    
    const appName = filename.replace('.json', '').toLowerCase();
    let schemasGenerated = 0;

    // Generate schemas for actions
    for (const action of connectorData.actions || []) {
      const schema = this.createActionSchema(appName, action, connectorData);
      const schemaFilename = `action.${appName}.${action.id}.schema.json`;
      const schemaPath = join(this.nodesSchemasPath, schemaFilename);
      
      writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
      schemasGenerated++;
    }

    // Generate schemas for triggers
    for (const trigger of connectorData.triggers || []) {
      const schema = this.createTriggerSchema(appName, trigger, connectorData);
      const schemaFilename = `trigger.${appName}.${trigger.id}.schema.json`;
      const schemaPath = join(this.nodesSchemasPath, schemaFilename);
      
      writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
      schemasGenerated++;
    }

    return schemasGenerated;
  }

  /**
   * Create action node schema
   */
  private createActionSchema(appName: string, action: ConnectorFunction, connector: ConnectorData): NodeSchema {
    const nodeType = `action.${appName}.${action.id}`;
    const parametersSchema = this.buildParametersSchema(action.parameters || action.params);

    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: `https://apps-script-studio.com/schemas/nodes/${nodeType}.schema.json`,
      title: `${connector.name} - ${action.name}`,
      description: action.description,
      type: "object",
      required: ["id", "type", "position", "parameters"],
      properties: {
        id: {
          type: "string",
          pattern: "^[a-zA-Z0-9_-]+$",
          description: "Unique identifier for the node"
        },
        type: {
          type: "string",
          const: nodeType,
          description: "Node type identifier"
        },
        position: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" }
          },
          required: ["x", "y"],
          additionalProperties: false
        },
        parameters: parametersSchema,
        metadata: {
          type: "object",
          properties: {
            label: { type: "string" },
            description: { type: "string" },
            category: { type: "string", const: connector.category },
            appName: { type: "string", const: connector.name },
            requiredScopes: {
              type: "array",
              items: { type: "string" },
              default: action.requiredScopes || []
            },
            rateLimits: action.rateLimits ? {
              type: "object",
              properties: {
                requestsPerSecond: { type: "number" },
                requestsPerMinute: { type: "number" },
                dailyLimit: { type: "number" }
              }
            } : undefined
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    };
  }

  /**
   * Create trigger node schema
   */
  private createTriggerSchema(appName: string, trigger: ConnectorFunction, connector: ConnectorData): NodeSchema {
    const nodeType = `trigger.${appName}.${trigger.id}`;
    const parametersSchema = this.buildParametersSchema(trigger.parameters || trigger.params);

    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: `https://apps-script-studio.com/schemas/nodes/${nodeType}.schema.json`,
      title: `${connector.name} - ${trigger.name}`,
      description: trigger.description,
      type: "object",
      required: ["id", "type", "position", "parameters"],
      properties: {
        id: {
          type: "string",
          pattern: "^[a-zA-Z0-9_-]+$",
          description: "Unique identifier for the node"
        },
        type: {
          type: "string",
          const: nodeType,
          description: "Node type identifier"
        },
        position: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" }
          },
          required: ["x", "y"],
          additionalProperties: false
        },
        parameters: parametersSchema,
        metadata: {
          type: "object",
          properties: {
            label: { type: "string" },
            description: { type: "string" },
            category: { type: "string", const: connector.category },
            appName: { type: "string", const: connector.name },
            requiredScopes: {
              type: "array",
              items: { type: "string" },
              default: trigger.requiredScopes || []
            },
            outputSchema: {
              type: "object",
              description: "Schema for trigger output data",
              additionalProperties: true
            }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    };
  }

  /**
   * Convert connector parameters to JSON Schema format
   */
  private convertParametersToJsonSchema(parameters: Record<string, any>): Record<string, any> {
    const jsonSchemaProps: Record<string, any> = {};

    for (const [key, param] of Object.entries(parameters)) {
      const schemaProperty: any = {
        description: param.description
      };

      // Handle different parameter types
      switch (param.type) {
        case 'string':
          schemaProperty.type = 'string';
          if (param.options) {
            schemaProperty.enum = param.options;
          }
          if (param.default !== undefined) {
            schemaProperty.default = param.default;
          }
          if (param.sensitive) {
            schemaProperty.format = 'password';
            schemaProperty['x-sensitive'] = true;
          }
          break;

        case 'number':
          schemaProperty.type = 'number';
          if (param.default !== undefined) {
            schemaProperty.default = param.default;
          }
          break;

        case 'boolean':
          schemaProperty.type = 'boolean';
          if (param.default !== undefined) {
            schemaProperty.default = param.default;
          }
          break;

        case 'array':
          schemaProperty.type = 'array';
          schemaProperty.items = { type: 'string' };
          if (param.default !== undefined) {
            schemaProperty.default = param.default;
          }
          break;

        case 'object':
          schemaProperty.type = 'object';
          schemaProperty.additionalProperties = true;
          if (param.default !== undefined) {
            schemaProperty.default = param.default;
          }
          break;

        default:
          schemaProperty.type = 'string';
      }

      jsonSchemaProps[key] = schemaProperty;
    }

    return jsonSchemaProps;
  }

  /**
   * Normalize parameter definitions from connectors into JSON Schema format
   */
  private buildParametersSchema(parameters?: any): { type: string; properties: Record<string, any>; required: string[]; additionalProperties: boolean } {
    const baseSchema = {
      type: 'object',
      properties: {} as Record<string, any>,
      required: [] as string[],
      additionalProperties: false
    };

    if (!parameters || (typeof parameters === 'object' && Object.keys(parameters).length === 0)) {
      return baseSchema;
    }

    if (typeof parameters === 'object' && !Array.isArray(parameters)) {
      const hasSchemaLikeKeys = Object.prototype.hasOwnProperty.call(parameters, 'properties');

      if (hasSchemaLikeKeys) {
        const schema = JSON.parse(JSON.stringify(parameters));

        if (!schema.type) {
          schema.type = 'object';
        }

        if (!schema.properties || typeof schema.properties !== 'object') {
          schema.properties = {};
        }

        if (!Array.isArray(schema.required)) {
          schema.required = schema.required ? [].concat(schema.required) : [];
        }

        if (schema.additionalProperties === undefined) {
          schema.additionalProperties = false;
        }

        return schema;
      }
    }

    return {
      ...baseSchema,
      properties: this.convertParametersToJsonSchema(parameters as Record<string, any>),
      required: this.getRequiredParameters(parameters as Record<string, any>)
    };
  }

  /**
   * Get required parameters from connector function
   */
  private getRequiredParameters(parameters: Record<string, any>): string[] {
    return Object.entries(parameters)
      .filter(([_, param]) => param.required === true)
      .map(([key, _]) => key);
  }

  /**
   * Generate static node schemas that are not derived from connector files
   */
  private generateStaticNodeSchemas(): number {
    const timeParamsSchema = {
      type: 'object',
      properties: {
        schedule: {
          type: 'string',
          pattern:
            '^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\\\d+(ns|us|µs|ms|s|m|h))+)|(((\\\d+,)+\\\d+|(\\\d+([/-])\\\d+)|\\\d+|\\*) ?){5,7}$',
          description: 'Cron expression or Apps Script trigger frequency',
          examples: ['0 9 * * 1-5', '@daily', '@hourly', '*/15 * * * *']
        },
        timezone: {
          type: 'string',
          default: 'America/New_York',
          description: 'Timezone for the schedule'
        },
        enabled: {
          type: 'boolean',
          default: true,
          description: 'Whether this trigger is active'
        },
        description: {
          type: 'string',
          maxLength: 200,
          description: 'Human-readable description of when this runs'
        }
      },
      required: ['schedule'],
      additionalProperties: false
    };

    const webhookParamsSchema = {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          pattern: '^/[a-zA-Z0-9_/-]*$',
          default: '/webhook',
          description: 'Relative path that will receive webhook requests'
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
          default: 'POST',
          description: 'HTTP method expected for the webhook'
        },
        authRequired: {
          type: 'boolean',
          default: false,
          description: 'Require authentication before accepting requests'
        },
        authType: {
          type: 'string',
          enum: ['bearer', 'basic', 'api_key', 'none'],
          default: 'none',
          description: 'Authentication strategy for incoming requests'
        },
        secret: {
          type: 'string',
          description: 'Secret token used to verify webhook payloads'
        },
        responseType: {
          type: 'string',
          enum: ['json', 'text', 'html'],
          default: 'json',
          description: 'Format of the response sent back to the webhook caller'
        },
        responseMessage: {
          type: 'string',
          default: 'Webhook received successfully',
          description: 'Message returned when the webhook is accepted'
        },
        filters: {
          type: 'object',
          properties: {
            contentType: {
              type: 'string',
              description: 'Expected Content-Type header value'
            },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Specific headers that must be present'
            },
            bodyContains: {
              type: 'string',
              description: 'String that must be present in the request body'
            }
          },
          additionalProperties: false
        }
      },
      required: ['path'],
      additionalProperties: false
    };

    const staticNodes: Array<{ filename: string; schema: NodeSchema }> = [
      {
        filename: 'trigger.time.cron.schema.json',
        schema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: 'https://apps-script-studio.com/schemas/nodes/trigger.time.cron.schema.json',
          title: 'Time Trigger - Cron',
          description: 'A time-based trigger that runs on a cron schedule',
          type: 'object',
          required: ['id', 'type', 'position'],
          properties: {
            id: {
              type: 'string',
              pattern: '^[a-zA-Z0-9_-]+$',
              description: 'Unique identifier for the node'
            },
            type: {
              type: 'string',
              const: 'trigger.time.cron',
              description: 'Node type identifier'
            },
            position: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' }
              },
              required: ['x', 'y'],
              additionalProperties: false
            },
            params: timeParamsSchema,
            parameters: timeParamsSchema,
            metadata: {
              type: 'object',
              properties: {
                label: { type: 'string', default: 'Scheduled Trigger' },
                description: {
                  type: 'string',
                  default: 'Runs on an automated schedule defined by a cron expression'
                },
                category: { type: 'string', const: 'Automation' },
                appName: { type: 'string', const: 'Time Scheduler' }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false,
          anyOf: [
            { required: ['params'] },
            { required: ['parameters'] }
          ]
        }
      },
      {
        filename: 'trigger.webhook.inbound.schema.json',
        schema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          $id: 'https://apps-script-studio.com/schemas/nodes/trigger.webhook.inbound.schema.json',
          title: 'Webhook Inbound Trigger',
          description: 'Receives external HTTP requests to trigger workflows',
          type: 'object',
          required: ['id', 'type', 'position'],
          properties: {
            id: {
              type: 'string',
              pattern: '^[a-zA-Z0-9_-]+$',
              description: 'Unique identifier for the node'
            },
            type: {
              type: 'string',
              const: 'trigger.webhook.inbound',
              description: 'Node type identifier'
            },
            position: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' }
              },
              required: ['x', 'y'],
              additionalProperties: false
            },
            params: webhookParamsSchema,
            parameters: webhookParamsSchema,
            metadata: {
              type: 'object',
              properties: {
                label: { type: 'string', default: 'Incoming Webhook' },
                description: {
                  type: 'string',
                  default: 'Starts a workflow when an external system sends an HTTP request'
                },
                category: { type: 'string', const: 'Webhooks' },
                appName: { type: 'string', const: 'Webhook Listener' }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false,
          anyOf: [
            { required: ['params'] },
            { required: ['parameters'] }
          ]
        }
      }
    ];

    for (const staticNode of staticNodes) {
      const schemaPath = join(this.nodesSchemasPath, staticNode.filename);
      writeFileSync(schemaPath, JSON.stringify(staticNode.schema, null, 2));
    }

    return staticNodes.length;
  }

  /**
   * Generate enhanced node catalog
   */
  async generateNodeCatalog(): Promise<void> {
    console.log('📚 Generating enhanced node catalog...');
    
    const catalog = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "https://apps-script-studio.com/schemas/node-catalog.schema.json",
      title: "Node Catalog",
      description: "Comprehensive catalog of all available nodes for workflow building",
      type: "object",
      properties: {
        categories: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              icon: { type: "string" },
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string" },
                    appName: { type: "string" },
                    schemaRef: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    };

    const catalogPath = join(this.schemasPath, 'node-catalog.schema.json');
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    console.log('✅ Generated node catalog schema');
  }

  /**
   * Update main graph schema to reference new node types
   */
  async updateGraphSchema(): Promise<void> {
    console.log('📊 Updating main graph schema...');
    
    try {
      const graphSchemaPath = join(this.schemasPath, 'graph.schema.json');
      const graphSchema = JSON.parse(readFileSync(graphSchemaPath, 'utf-8'));
      
      // Get all node schema files
      const nodeSchemaFiles = readdirSync(this.nodesSchemasPath).sort((a, b) => a.localeCompare(b));
      const nodeTypes = nodeSchemaFiles
        .filter(file => file.endsWith('.schema.json'))
        .map(file => file.replace('.schema.json', ''));

      // Update the Node definition to include all node types
      if (graphSchema.definitions && graphSchema.definitions.Node) {
        graphSchema.definitions.Node.properties.type.enum = nodeTypes;
        
        writeFileSync(graphSchemaPath, JSON.stringify(graphSchema, null, 2));
        console.log(`✅ Updated graph schema with ${nodeTypes.length} node types`);
      }
    } catch (error) {
      console.error('❌ Failed to update graph schema:', error);
    }
  }

  /**
   * Generate statistics about schemas
   */
  getSchemaStats(): { totalSchemas: number; byCategory: Record<string, number>; byType: Record<string, number> } {
    const stats = {
      totalSchemas: 0,
      byCategory: {} as Record<string, number>,
      byType: {} as Record<string, number>
    };

    try {
      const schemaFiles = readdirSync(this.nodesSchemasPath);
      stats.totalSchemas = schemaFiles.filter(f => f.endsWith('.schema.json')).length;

      schemaFiles.forEach(file => {
        if (file.endsWith('.schema.json')) {
          const parts = file.replace('.schema.json', '').split('.');
          const type = parts[0]; // action or trigger
          const app = parts[1]; // app name
          
          stats.byType[type] = (stats.byType[type] || 0) + 1;
          stats.byCategory[app] = (stats.byCategory[app] || 0) + 1;
        }
      });
    } catch (error) {
      console.error('Failed to get schema stats:', error);
    }

    return stats;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runGeneration() {
    console.log('🚀 Running node schema generation from CLI...\n');
    
    const generator = new NodeSchemaGenerator();
    
    try {
      // Generate all schemas
      const results = await generator.generateAllSchemas();
      
      // Generate additional schema files
      await generator.generateNodeCatalog();
      await generator.updateGraphSchema();
      
      // Show statistics
      const stats = generator.getSchemaStats();
      console.log('\n📊 Schema Generation Statistics:');
      console.log(`Total Schemas: ${stats.totalSchemas}`);
      console.log(`Actions: ${stats.byType.action || 0}`);
      console.log(`Triggers: ${stats.byType.trigger || 0}`);
      console.log('\nBy Application:');
      Object.entries(stats.byCategory).forEach(([app, count]) => {
        console.log(`  ${app}: ${count} schemas`);
      });
      
      if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        results.errors.forEach(error => console.log(`  • ${error}`));
      }
      
    } catch (error) {
      console.error('💥 Schema generation failed:', error);
      process.exit(1);
    }
  }

  runGeneration();
}