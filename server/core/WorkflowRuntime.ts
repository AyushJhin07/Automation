/**
 * WorkflowRuntime - Server-side execution of workflows
 * This complements the Google Apps Script compiler by providing
 * server-side execution capabilities, especially for LLM nodes
 */

import { NodeGraph, GraphNode, ParameterContext } from '../../shared/nodeGraphSchema';
import { runLLMGenerate, runLLMExtract, runLLMClassify, runLLMToolCall } from '../nodes/llm/executeLLM';
import { resolveAllParams } from './ParameterResolver';

export interface ExecutionContext {
  outputs: Record<string, any>;
  prevOutput?: any;
  userId?: string;
  workflowId: string;
  startTime: Date;
  executionId: string;
}

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  nodeOutputs: Record<string, any>;
}

export class WorkflowRuntime {
  /**
   * Execute a workflow graph server-side
   * Particularly useful for LLM nodes and testing
   */
  async executeWorkflow(graph: NodeGraph, initialData: any = {}, userId?: string): Promise<ExecutionResult> {
    const startTime = new Date();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const context: ExecutionContext = {
      outputs: {},
      prevOutput: initialData,
      userId,
      workflowId: graph.id,
      startTime,
      executionId
    };

    console.log(`🚀 Starting server-side execution of workflow: ${graph.name}`);

    try {
      // Topologically sort nodes to ensure proper execution order
      const sortedNodeIds = this.topologicalSort(graph);
      
      // Execute nodes in order
      for (const nodeId of sortedNodeIds) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) {
          throw new Error(`Node ${nodeId} not found in graph`);
        }

        console.log(`📋 Executing node: ${node.label} (${node.type})`);
        
        try {
          const nodeResult = await this.executeNode(node, context);
          context.outputs[node.id] = nodeResult;
          context.prevOutput = nodeResult;
          
          console.log(`✅ Node ${node.id} completed successfully`);
        } catch (error) {
          console.error(`❌ Node ${node.id} failed:`, error);
          throw new Error(`Node "${node.label}" failed: ${error.message}`);
        }
      }

      const executionTime = Date.now() - startTime.getTime();
      
      console.log(`🎉 Workflow execution completed in ${executionTime}ms`);
      
      return {
        success: true,
        data: context.prevOutput,
        executionTime,
        nodeOutputs: context.outputs
      };
    } catch (error) {
      const executionTime = Date.now() - startTime.getTime();
      
      console.error(`💥 Workflow execution failed after ${executionTime}ms:`, error);
      
      return {
        success: false,
        error: error.message,
        executionTime,
        nodeOutputs: context.outputs
      };
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: GraphNode, context: ExecutionContext): Promise<any> {
    // Resolve node parameters using AI-as-a-field ParameterResolver
    const paramContext: ParameterContext = {
      nodeOutputs: context.outputs,
      currentNodeId: node.id,
      workflowId: context.workflowId,
      userId: context.userId,
      executionId: context.executionId
    };
    
    const resolvedParams = await resolveAllParams(node.data, paramContext);
    
    // Execute based on node type
    switch (node.type) {
      // LLM Actions
      case 'action.llm.generate':
        return await runLLMGenerate(resolvedParams, context);
      
      case 'action.llm.extract':
        return await runLLMExtract(resolvedParams, context);
      
      case 'action.llm.classify':
        return await runLLMClassify(resolvedParams, context);
      
      case 'action.llm.tool_call':
        return await runLLMToolCall(resolvedParams, context);
      
      // HTTP Actions (useful for testing and API calls)
      case 'action.http.request':
        return await this.executeHttpRequest(resolvedParams);
      
      // Transform nodes
      case 'transform.json.extract':
        return this.executeJsonExtract(resolvedParams, context);
      
      case 'transform.text.format':
        return this.executeTextFormat(resolvedParams, context);
      
      // Placeholder for other node types
      default:
        console.warn(`⚠️  Node type ${node.type} not supported in server-side execution`);
        return {
          message: `Node type ${node.type} executed successfully`,
          type: node.type,
          data: resolvedParams
        };
    }
  }



  /**
   * Execute HTTP request node
   */
  private async executeHttpRequest(params: any): Promise<any> {
    const { url, method = 'GET', headers = {}, body } = params;
    
    if (!url) {
      throw new Error('URL is required for HTTP requests');
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await response.text();
      
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch {
        parsedData = data;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: parsedData
      };
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  /**
   * Execute JSON extraction transform
   */
  private executeJsonExtract(params: any, context: ExecutionContext): any {
    const { path } = params;
    const data = context.prevOutput;

    if (!path) {
      return data;
    }

    try {
      // Simple dot notation path extraction
      return path.split('.').reduce((obj: any, key: string) => {
        return obj && obj[key] !== undefined ? obj[key] : undefined;
      }, data);
    } catch (error) {
      throw new Error(`JSON extraction failed: ${error.message}`);
    }
  }

  /**
   * Execute text formatting transform
   */
  private executeTextFormat(params: any, context: ExecutionContext): any {
    const { template } = params;
    const data = context.prevOutput;

    if (!template) {
      return data;
    }

    try {
      // Simple template replacement with {{key}} syntax
      let formatted = template;
      if (typeof data === 'object' && data !== null) {
        Object.entries(data).forEach(([key, value]) => {
          const placeholder = `{{${key}}}`;
          formatted = formatted.replace(new RegExp(placeholder, 'g'), String(value));
        });
      }
      
      return formatted;
    } catch (error) {
      throw new Error(`Text formatting failed: ${error.message}`);
    }
  }

  /**
   * Topologically sort nodes to ensure proper execution order
   */
  private topologicalSort(graph: NodeGraph): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      // Find all nodes that this node depends on (nodes with edges pointing to this node)
      const incomingEdges = graph.edges.filter(edge => edge.target === nodeId);
      incomingEdges.forEach(edge => visit(edge.source));
      
      result.push(nodeId);
    };
    
    // Visit all nodes
    graph.nodes.forEach(node => visit(node.id));
    
    return result;
  }
}

export const workflowRuntime = new WorkflowRuntime();