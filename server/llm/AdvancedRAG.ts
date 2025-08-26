/**
 * AdvancedRAG - Vector search, document embedding, and smart content retrieval
 * Provides sophisticated information retrieval for enhanced LLM context
 */

export interface Document {
  id: string;
  content: string;
  metadata: {
    title?: string;
    url?: string;
    timestamp: number;
    source: string;
    tags: string[];
    workflowId?: string;
    userId?: string;
  };
  embedding?: number[];
  chunks?: DocumentChunk[];
}

export interface DocumentChunk {
  id: string;
  content: string;
  startIndex: number;
  endIndex: number;
  embedding?: number[];
  metadata: Record<string, any>;
}

export interface RAGQuery {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: {
    tags?: string[];
    sources?: string[];
    workflowId?: string;
    userId?: string;
    since?: number;
  };
  rerank?: boolean;
}

export interface RAGResult {
  documents: ScoredDocument[];
  query: string;
  totalTime: number;
  searchTime: number;
  rerankTime?: number;
}

export interface ScoredDocument {
  document: Document;
  score: number;
  relevantChunks?: ScoredChunk[];
}

export interface ScoredChunk {
  chunk: DocumentChunk;
  score: number;
}

// Simple in-memory vector store (in production, use a proper vector database)
class VectorStore {
  private documents = new Map<string, Document>();
  private embeddings = new Map<string, number[]>();
  private chunkEmbeddings = new Map<string, number[]>();

  async addDocument(document: Document): Promise<void> {
    // Generate embedding for the full document
    const docEmbedding = await this.generateEmbedding(document.content);
    document.embedding = docEmbedding;
    this.embeddings.set(document.id, docEmbedding);

    // Chunk the document and generate embeddings for chunks
    const chunks = this.chunkDocument(document);
    document.chunks = chunks;

    for (const chunk of chunks) {
      const chunkEmbedding = await this.generateEmbedding(chunk.content);
      chunk.embedding = chunkEmbedding;
      this.chunkEmbeddings.set(chunk.id, chunkEmbedding);
    }

    this.documents.set(document.id, document);
    console.log(`📚 Added document: ${document.metadata.title || document.id} (${chunks.length} chunks)`);
  }

  async search(query: string, limit: number = 10, threshold: number = 0.5): Promise<ScoredDocument[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const results: ScoredDocument[] = [];

    for (const [docId, document] of this.documents) {
      if (!document.embedding) continue;

      // Calculate document-level similarity
      const docScore = this.cosineSimilarity(queryEmbedding, document.embedding);
      
      if (docScore < threshold) continue;

      // Find relevant chunks
      const relevantChunks: ScoredChunk[] = [];
      if (document.chunks) {
        for (const chunk of document.chunks) {
          if (!chunk.embedding) continue;
          
          const chunkScore = this.cosineSimilarity(queryEmbedding, chunk.embedding);
          if (chunkScore >= threshold) {
            relevantChunks.push({ chunk, score: chunkScore });
          }
        }
      }

      // Sort chunks by relevance
      relevantChunks.sort((a, b) => b.score - a.score);

      results.push({
        document,
        score: docScore,
        relevantChunks: relevantChunks.slice(0, 3) // Top 3 chunks per document
      });
    }

    // Sort by document score and return top results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private chunkDocument(document: Document): DocumentChunk[] {
    const content = document.content;
    const chunkSize = 500; // Characters per chunk
    const overlap = 100;   // Overlap between chunks
    const chunks: DocumentChunk[] = [];

    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      const endIndex = Math.min(i + chunkSize, content.length);
      const chunkContent = content.slice(i, endIndex);
      
      if (chunkContent.trim().length < 50) continue; // Skip tiny chunks

      chunks.push({
        id: `${document.id}_chunk_${chunks.length}`,
        content: chunkContent,
        startIndex: i,
        endIndex,
        metadata: {
          chunkIndex: chunks.length,
          documentId: document.id
        }
      });
    }

    return chunks;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple hash-based embedding (in production, use OpenAI embeddings or similar)
    // This is a placeholder implementation
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0); // 384-dimensional embedding
    
    for (const word of words) {
      const hash = this.simpleHash(word);
      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1;
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getDocument(id: string): Document | undefined {
    return this.documents.get(id);
  }

  getAllDocuments(): Document[] {
    return Array.from(this.documents.values());
  }

  deleteDocument(id: string): boolean {
    const document = this.documents.get(id);
    if (!document) return false;

    this.documents.delete(id);
    this.embeddings.delete(id);
    
    // Clean up chunk embeddings
    if (document.chunks) {
      for (const chunk of document.chunks) {
        this.chunkEmbeddings.delete(chunk.id);
      }
    }
    
    return true;
  }

  size(): number {
    return this.documents.size;
  }
}

export class AdvancedRAG {
  private vectorStore = new VectorStore();
  private documentProcessors = new Map<string, DocumentProcessor>();

  constructor() {
    this.registerBuiltInProcessors();
  }

  /**
   * Add a document to the RAG system
   */
  async addDocument(document: Document): Promise<void> {
    // Process document based on source type
    const processor = this.documentProcessors.get(document.metadata.source);
    if (processor) {
      document = await processor.process(document);
    }

    await this.vectorStore.addDocument(document);
  }

  /**
   * Add multiple documents from URLs
   */
  async addDocumentsFromUrls(urls: string[], workflowId?: string, userId?: string): Promise<Document[]> {
    const documents: Document[] = [];
    
    for (const url of urls) {
      try {
        console.log(`📥 Fetching document from: ${url}`);
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Apps Script Studio RAG Bot/1.0'
          }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch ${url}: ${response.status}`);
          continue;
        }

        const content = await response.text();
        const contentType = response.headers.get('content-type') || '';
        
        const document: Document = {
          id: `url_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          content: this.extractTextContent(content, contentType),
          metadata: {
            title: this.extractTitle(content, contentType),
            url,
            timestamp: Date.now(),
            source: 'web',
            tags: ['web', 'url'],
            workflowId,
            userId
          }
        };

        await this.addDocument(document);
        documents.push(document);
        
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
      }
    }

    return documents;
  }

  /**
   * Search for relevant documents
   */
  async search(query: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now();
    
    // Vector search
    const searchStart = Date.now();
    const results = await this.vectorStore.search(
      query.query, 
      query.limit || 10, 
      query.threshold || 0.5
    );
    const searchTime = Date.now() - searchStart;

    // Apply filters
    let filteredResults = results;
    if (query.filters) {
      filteredResults = this.applyFilters(results, query.filters);
    }

    // Rerank if requested
    let rerankTime: number | undefined;
    if (query.rerank && filteredResults.length > 1) {
      const rerankStart = Date.now();
      filteredResults = await this.rerankResults(query.query, filteredResults);
      rerankTime = Date.now() - rerankStart;
    }

    const totalTime = Date.now() - startTime;

    return {
      documents: filteredResults,
      query: query.query,
      totalTime,
      searchTime,
      rerankTime
    };
  }

  /**
   * Build context string from search results
   */
  buildContext(results: RAGResult, maxLength: number = 4000): string {
    const contextParts: string[] = [];
    let currentLength = 0;

    for (const result of results.documents) {
      // Use relevant chunks if available, otherwise use full document
      const content = result.relevantChunks && result.relevantChunks.length > 0
        ? result.relevantChunks.map(c => c.chunk.content).join('\n\n')
        : result.document.content;

      const title = result.document.metadata.title || result.document.id;
      const source = result.document.metadata.url || result.document.metadata.source;
      
      const section = `## ${title}\nSource: ${source}\nRelevance: ${Math.round(result.score * 100)}%\n\n${content}`;
      
      if (currentLength + section.length > maxLength) {
        const remaining = maxLength - currentLength;
        if (remaining > 100) {
          contextParts.push(section.slice(0, remaining) + '...');
        }
        break;
      }
      
      contextParts.push(section);
      currentLength += section.length;
    }

    return contextParts.join('\n\n---\n\n');
  }

  /**
   * Get enhanced context for LLM prompts
   */
  async getEnhancedContext(
    query: string, 
    workflowId?: string, 
    userId?: string,
    maxLength: number = 4000
  ): Promise<string> {
    const ragQuery: RAGQuery = {
      query,
      limit: 5,
      threshold: 0.3,
      filters: { workflowId, userId },
      rerank: true
    };

    const results = await this.search(ragQuery);
    return this.buildContext(results, maxLength);
  }

  /**
   * Register a custom document processor
   */
  registerProcessor(source: string, processor: DocumentProcessor): void {
    this.documentProcessors.set(source, processor);
    console.log(`📝 Registered document processor for: ${source}`);
  }

  /**
   * Get all documents
   */
  getAllDocuments(): Document[] {
    return this.vectorStore.getAllDocuments();
  }

  /**
   * Delete a document
   */
  deleteDocument(id: string): boolean {
    return this.vectorStore.deleteDocument(id);
  }

  /**
   * Get document count
   */
  getDocumentCount(): number {
    return this.vectorStore.size();
  }

  private applyFilters(results: ScoredDocument[], filters: NonNullable<RAGQuery['filters']>): ScoredDocument[] {
    return results.filter(result => {
      const doc = result.document;
      const meta = doc.metadata;

      if (filters.tags && !filters.tags.some(tag => meta.tags.includes(tag))) {
        return false;
      }

      if (filters.sources && !filters.sources.includes(meta.source)) {
        return false;
      }

      if (filters.workflowId && meta.workflowId !== filters.workflowId) {
        return false;
      }

      if (filters.userId && meta.userId !== filters.userId) {
        return false;
      }

      if (filters.since && meta.timestamp < filters.since) {
        return false;
      }

      return true;
    });
  }

  private async rerankResults(query: string, results: ScoredDocument[]): Promise<ScoredDocument[]> {
    // Simple reranking based on keyword overlap and position
    // In production, use a proper reranking model
    
    const queryWords = query.toLowerCase().split(/\s+/);
    
    const reranked = results.map(result => {
      const content = result.document.content.toLowerCase();
      let rerankScore = result.score;
      
      // Boost score based on keyword matches
      for (const word of queryWords) {
        const matches = (content.match(new RegExp(word, 'g')) || []).length;
        rerankScore += matches * 0.01;
      }
      
      // Boost if keywords appear early in document
      const firstHalf = content.slice(0, content.length / 2);
      for (const word of queryWords) {
        if (firstHalf.includes(word)) {
          rerankScore += 0.05;
        }
      }

      return { ...result, score: rerankScore };
    });

    return reranked.sort((a, b) => b.score - a.score);
  }

  private extractTextContent(content: string, contentType: string): string {
    if (contentType.includes('text/html')) {
      // Basic HTML content extraction
      return content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    return content;
  }

  private extractTitle(content: string, contentType: string): string {
    if (contentType.includes('text/html')) {
      const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch) {
        return titleMatch[1].trim();
      }
    }
    
    return 'Untitled Document';
  }

  private registerBuiltInProcessors(): void {
    // Web page processor
    this.registerProcessor('web', {
      async process(document: Document): Promise<Document> {
        // Clean up web content
        document.content = document.content
          .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
          .trim();
        
        // Extract keywords as tags
        const words = document.content.toLowerCase().split(/\s+/);
        const wordFreq = new Map<string, number>();
        
        for (const word of words) {
          if (word.length > 3 && !/^\d+$/.test(word)) {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
          }
        }
        
        const keywords = Array.from(wordFreq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([word]) => word);
        
        document.metadata.tags = [...document.metadata.tags, ...keywords];
        
        return document;
      }
    });

    // API documentation processor
    this.registerProcessor('api_docs', {
      async process(document: Document): Promise<Document> {
        // Extract API endpoints and methods
        const apiPatterns = [
          /(?:GET|POST|PUT|DELETE|PATCH)\s+\/[^\s]+/g,
          /https?:\/\/[^\s]+\/api\/[^\s]+/g
        ];
        
        const endpoints: string[] = [];
        for (const pattern of apiPatterns) {
          const matches = document.content.match(pattern) || [];
          endpoints.push(...matches);
        }
        
        if (endpoints.length > 0) {
          document.metadata.tags.push('api', 'documentation');
          document.metadata.endpoints = endpoints;
        }
        
        return document;
      }
    });
  }
}

interface DocumentProcessor {
  process(document: Document): Promise<Document>;
}

export const advancedRAG = new AdvancedRAG();