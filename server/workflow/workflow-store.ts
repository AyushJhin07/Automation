/**
 * ChatGPT Fix 1: Workflow Store for Graph Editor Handoff
 * 
 * Simple in-memory store to persist built workflows for Graph Editor loading
 */

export const WorkflowStore = new Map<string, any>();

export class WorkflowStoreService {
  
  static store(workflowId: string, graph: any): void {
    WorkflowStore.set(workflowId, {
      ...graph,
      storedAt: new Date().toISOString(),
      id: workflowId
    });
    
    console.log(`📦 Stored workflow ${workflowId} for Graph Editor handoff`);
  }

  // ChatGPT's save method for workflow persistence
  static async save(graph: any): Promise<string> {
    const workflowId = `wf-${Date.now()}`;
    this.store(workflowId, graph);
    return workflowId;
  }

  static retrieve(workflowId: string): any | null {
    const workflow = WorkflowStore.get(workflowId);
    
    if (workflow) {
      console.log(`📋 Retrieved workflow ${workflowId} for Graph Editor`);
      return workflow;
    }
    
    console.warn(`⚠️ Workflow ${workflowId} not found in store`);
    return null;
  }

  static exists(workflowId: string): boolean {
    return WorkflowStore.has(workflowId);
  }

  static clear(workflowId: string): boolean {
    const existed = WorkflowStore.has(workflowId);
    WorkflowStore.delete(workflowId);
    
    if (existed) {
      console.log(`🗑️ Cleared workflow ${workflowId} from store`);
    }
    
    return existed;
  }

  static getStats(): { totalWorkflows: number; oldestWorkflow: string | null } {
    const workflows = Array.from(WorkflowStore.entries());
    
    return {
      totalWorkflows: workflows.length,
      oldestWorkflow: workflows.length > 0 ? workflows[0][0] : null
    };
  }

  // Auto-cleanup old workflows (prevent memory leaks)
  static cleanup(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, workflow] of WorkflowStore.entries()) {
      const storedAt = new Date(workflow.storedAt).getTime();
      if (now - storedAt > maxAge) {
        WorkflowStore.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old workflows from store`);
    }
    
    return cleaned;
  }
}

// Auto-cleanup every hour
setInterval(() => {
  WorkflowStoreService.cleanup();
}, 60 * 60 * 1000);