/**
 * LLMMemoryManager - Persistent context management for LLM workflows
 * Maintains conversation history, learned patterns, and contextual knowledge
 */

export interface MemoryEntry {
  id: string;
  workflowId: string;
  userId?: string;
  nodeId?: string;
  timestamp: number;
  type: 'conversation' | 'pattern' | 'context' | 'preference' | 'error';
  content: any;
  importance: number; // 0-1, for memory pruning
  tags: string[];
  expiresAt?: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface LearnedPattern {
  pattern: string;
  frequency: number;
  successRate: number;
  lastUsed: number;
  context: string[];
}

export interface UserPreference {
  key: string;
  value: any;
  confidence: number;
  learnedFrom: string[];
}

export interface MemoryQuery {
  workflowId?: string;
  userId?: string;
  nodeId?: string;
  type?: string;
  tags?: string[];
  limit?: number;
  since?: number;
  minImportance?: number;
}

class MemoryStorage {
  private memories = new Map<string, MemoryEntry>();
  private indexes = {
    byWorkflow: new Map<string, Set<string>>(),
    byUser: new Map<string, Set<string>>(),
    byType: new Map<string, Set<string>>(),
    byTags: new Map<string, Set<string>>()
  };

  store(entry: MemoryEntry): void {
    this.memories.set(entry.id, entry);
    
    // Update indexes
    if (entry.workflowId) {
      if (!this.indexes.byWorkflow.has(entry.workflowId)) {
        this.indexes.byWorkflow.set(entry.workflowId, new Set());
      }
      this.indexes.byWorkflow.get(entry.workflowId)!.add(entry.id);
    }

    if (entry.userId) {
      if (!this.indexes.byUser.has(entry.userId)) {
        this.indexes.byUser.set(entry.userId, new Set());
      }
      this.indexes.byUser.get(entry.userId)!.add(entry.id);
    }

    if (!this.indexes.byType.has(entry.type)) {
      this.indexes.byType.set(entry.type, new Set());
    }
    this.indexes.byType.get(entry.type)!.add(entry.id);

    for (const tag of entry.tags) {
      if (!this.indexes.byTags.has(tag)) {
        this.indexes.byTags.set(tag, new Set());
      }
      this.indexes.byTags.get(tag)!.add(entry.id);
    }
  }

  query(query: MemoryQuery): MemoryEntry[] {
    let candidateIds = new Set<string>(this.memories.keys());

    // Apply filters
    if (query.workflowId) {
      const workflowIds = this.indexes.byWorkflow.get(query.workflowId) || new Set();
      candidateIds = new Set([...candidateIds].filter(id => workflowIds.has(id)));
    }

    if (query.userId) {
      const userIds = this.indexes.byUser.get(query.userId) || new Set();
      candidateIds = new Set([...candidateIds].filter(id => userIds.has(id)));
    }

    if (query.type) {
      const typeIds = this.indexes.byType.get(query.type) || new Set();
      candidateIds = new Set([...candidateIds].filter(id => typeIds.has(id)));
    }

    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        const tagIds = this.indexes.byTags.get(tag) || new Set();
        candidateIds = new Set([...candidateIds].filter(id => tagIds.has(id)));
      }
    }

    // Get entries and apply additional filters
    let results = [...candidateIds]
      .map(id => this.memories.get(id)!)
      .filter(entry => {
        if (query.since && entry.timestamp < query.since) return false;
        if (query.minImportance && entry.importance < query.minImportance) return false;
        if (entry.expiresAt && Date.now() > entry.expiresAt) return false;
        return true;
      });

    // Sort by importance and recency
    results.sort((a, b) => {
      const importanceWeight = 0.7;
      const recencyWeight = 0.3;
      
      const aScore = a.importance * importanceWeight + 
                    (a.timestamp / Date.now()) * recencyWeight;
      const bScore = b.importance * importanceWeight + 
                    (b.timestamp / Date.now()) * recencyWeight;
      
      return bScore - aScore;
    });

    return query.limit ? results.slice(0, query.limit) : results;
  }

  delete(id: string): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;

    this.memories.delete(id);

    // Clean up indexes
    this.indexes.byWorkflow.get(entry.workflowId)?.delete(id);
    this.indexes.byUser.get(entry.userId || '')?.delete(id);
    this.indexes.byType.get(entry.type)?.delete(id);
    entry.tags.forEach(tag => this.indexes.byTags.get(tag)?.delete(id));

    return true;
  }

  prune(maxAge: number, minImportance: number): number {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, entry] of this.memories) {
      const age = now - entry.timestamp;
      const shouldDelete = (
        age > maxAge || 
        entry.importance < minImportance ||
        (entry.expiresAt && now > entry.expiresAt)
      );

      if (shouldDelete) {
        toDelete.push(id);
      }
    }

    toDelete.forEach(id => this.delete(id));
    return toDelete.length;
  }

  size(): number {
    return this.memories.size;
  }
}

export class LLMMemoryManager {
  private storage = new MemoryStorage();
  private conversationHistories = new Map<string, ConversationTurn[]>();
  private learnedPatterns = new Map<string, LearnedPattern>();
  private userPreferences = new Map<string, Map<string, UserPreference>>();

  /**
   * Store a conversation turn
   */
  storeConversation(
    workflowId: string,
    userId: string | undefined,
    nodeId: string | undefined,
    turn: ConversationTurn
  ): void {
    const key = `${workflowId}:${nodeId || 'global'}`;
    
    if (!this.conversationHistories.has(key)) {
      this.conversationHistories.set(key, []);
    }
    
    const history = this.conversationHistories.get(key)!;
    history.push(turn);

    // Keep only last 50 turns to prevent memory bloat
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }

    // Store as memory entry
    this.storage.store({
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      workflowId,
      userId,
      nodeId,
      timestamp: turn.timestamp,
      type: 'conversation',
      content: turn,
      importance: this.calculateConversationImportance(turn),
      tags: ['conversation', turn.role],
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    });
  }

  /**
   * Get conversation history for context
   */
  getConversationHistory(
    workflowId: string,
    nodeId?: string,
    limit: number = 10
  ): ConversationTurn[] {
    const key = `${workflowId}:${nodeId || 'global'}`;
    const history = this.conversationHistories.get(key) || [];
    
    return history.slice(-limit);
  }

  /**
   * Learn from successful patterns
   */
  learnPattern(
    pattern: string,
    context: string[],
    success: boolean
  ): void {
    const existing = this.learnedPatterns.get(pattern);
    
    if (existing) {
      existing.frequency++;
      existing.lastUsed = Date.now();
      if (success) {
        existing.successRate = (existing.successRate * (existing.frequency - 1) + 1) / existing.frequency;
      } else {
        existing.successRate = (existing.successRate * (existing.frequency - 1)) / existing.frequency;
      }
      existing.context = [...new Set([...existing.context, ...context])];
    } else {
      this.learnedPatterns.set(pattern, {
        pattern,
        frequency: 1,
        successRate: success ? 1 : 0,
        lastUsed: Date.now(),
        context
      });
    }

    // Store as memory entry
    this.storage.store({
      id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      workflowId: 'global',
      timestamp: Date.now(),
      type: 'pattern',
      content: { pattern, context, success },
      importance: success ? 0.8 : 0.3,
      tags: ['pattern', success ? 'success' : 'failure', ...context]
    });
  }

  /**
   * Get relevant patterns for a context
   */
  getRelevantPatterns(context: string[], limit: number = 5): LearnedPattern[] {
    const patterns = Array.from(this.learnedPatterns.values());
    
    // Score patterns by relevance
    const scored = patterns.map(pattern => {
      const contextOverlap = context.filter(c => pattern.context.includes(c)).length;
      const relevanceScore = (
        contextOverlap / Math.max(context.length, pattern.context.length) * 0.4 +
        pattern.successRate * 0.4 +
        Math.min(pattern.frequency / 10, 1) * 0.2
      );
      
      return { pattern, score: relevanceScore };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.pattern);
  }

  /**
   * Store user preference
   */
  storeUserPreference(
    userId: string,
    key: string,
    value: any,
    confidence: number,
    learnedFrom: string[]
  ): void {
    if (!this.userPreferences.has(userId)) {
      this.userPreferences.set(userId, new Map());
    }

    const userPrefs = this.userPreferences.get(userId)!;
    const existing = userPrefs.get(key);

    if (existing) {
      // Update existing preference with weighted average
      const totalWeight = existing.confidence + confidence;
      existing.value = this.mergePreferenceValues(existing.value, value, existing.confidence / totalWeight);
      existing.confidence = Math.min(totalWeight / 2, 1); // Average but cap at 1
      existing.learnedFrom = [...new Set([...existing.learnedFrom, ...learnedFrom])];
    } else {
      userPrefs.set(key, {
        key,
        value,
        confidence,
        learnedFrom
      });
    }

    // Store as memory entry
    this.storage.store({
      id: `pref_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      workflowId: 'global',
      userId,
      timestamp: Date.now(),
      type: 'preference',
      content: { key, value, confidence },
      importance: confidence,
      tags: ['preference', key, ...learnedFrom]
    });
  }

  /**
   * Get user preferences
   */
  getUserPreferences(userId: string): Map<string, UserPreference> {
    return this.userPreferences.get(userId) || new Map();
  }

  /**
   * Build context for LLM from memory
   */
  buildContextForLLM(
    workflowId: string,
    userId: string | undefined,
    nodeId: string | undefined,
    contextTags: string[] = []
  ): string {
    const contextParts: string[] = [];

    // Add conversation history
    const conversation = this.getConversationHistory(workflowId, nodeId, 5);
    if (conversation.length > 0) {
      contextParts.push('Recent conversation:');
      conversation.forEach(turn => {
        contextParts.push(`${turn.role}: ${turn.content}`);
      });
    }

    // Add relevant patterns
    const patterns = this.getRelevantPatterns(contextTags, 3);
    if (patterns.length > 0) {
      contextParts.push('\nLearned patterns:');
      patterns.forEach(pattern => {
        contextParts.push(`- ${pattern.pattern} (success rate: ${Math.round(pattern.successRate * 100)}%)`);
      });
    }

    // Add user preferences
    if (userId) {
      const preferences = this.getUserPreferences(userId);
      if (preferences.size > 0) {
        contextParts.push('\nUser preferences:');
        for (const [key, pref] of preferences) {
          if (pref.confidence > 0.5) {
            contextParts.push(`- ${key}: ${JSON.stringify(pref.value)}`);
          }
        }
      }
    }

    // Add relevant memories
    const relevantMemories = this.storage.query({
      workflowId,
      userId,
      tags: contextTags,
      limit: 5,
      minImportance: 0.5,
      since: Date.now() - (7 * 24 * 60 * 60 * 1000) // Last 7 days
    });

    if (relevantMemories.length > 0) {
      contextParts.push('\nRelevant context:');
      relevantMemories.forEach(memory => {
        if (memory.type === 'context') {
          contextParts.push(`- ${JSON.stringify(memory.content)}`);
        }
      });
    }

    return contextParts.length > 0 ? contextParts.join('\n') : '';
  }

  /**
   * Store contextual information
   */
  storeContext(
    workflowId: string,
    userId: string | undefined,
    nodeId: string | undefined,
    context: any,
    importance: number = 0.5,
    tags: string[] = []
  ): void {
    this.storage.store({
      id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      workflowId,
      userId,
      nodeId,
      timestamp: Date.now(),
      type: 'context',
      content: context,
      importance,
      tags: ['context', ...tags],
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    });
  }

  /**
   * Store error information for learning
   */
  storeError(
    workflowId: string,
    userId: string | undefined,
    nodeId: string | undefined,
    error: any,
    context: any
  ): void {
    this.storage.store({
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      workflowId,
      userId,
      nodeId,
      timestamp: Date.now(),
      type: 'error',
      content: { error, context },
      importance: 0.7, // Errors are important for learning
      tags: ['error', error.type || 'unknown'],
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    });
  }

  /**
   * Perform memory cleanup
   */
  cleanup(): { pruned: number; totalMemories: number } {
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
    const minImportance = 0.1;
    
    const pruned = this.storage.prune(maxAge, minImportance);
    const totalMemories = this.storage.size();

    console.log(`🧠 Memory cleanup: pruned ${pruned} entries, ${totalMemories} remaining`);

    return { pruned, totalMemories };
  }

  /**
   * Calculate importance of a conversation turn
   */
  private calculateConversationImportance(turn: ConversationTurn): number {
    let importance = 0.3; // Base importance

    // Longer messages tend to be more important
    importance += Math.min(turn.content.length / 1000, 0.3);

    // System messages are usually important
    if (turn.role === 'system') {
      importance += 0.2;
    }

    // Messages with certain keywords are more important
    const importantKeywords = ['error', 'success', 'complete', 'failed', 'important'];
    const hasImportantKeyword = importantKeywords.some(keyword => 
      turn.content.toLowerCase().includes(keyword)
    );
    if (hasImportantKeyword) {
      importance += 0.2;
    }

    return Math.min(importance, 1);
  }

  /**
   * Merge preference values intelligently
   */
  private mergePreferenceValues(existing: any, newValue: any, existingWeight: number): any {
    if (typeof existing === typeof newValue) {
      if (typeof existing === 'number') {
        return existing * existingWeight + newValue * (1 - existingWeight);
      } else if (typeof existing === 'string') {
        return existingWeight > 0.5 ? existing : newValue;
      } else if (Array.isArray(existing) && Array.isArray(newValue)) {
        return [...new Set([...existing, ...newValue])];
      }
    }
    
    return existingWeight > 0.5 ? existing : newValue;
  }
}

export const llmMemoryManager = new LLMMemoryManager();