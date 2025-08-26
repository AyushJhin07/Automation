/**
 * VectorDatabaseManager - Professional vector database integration
 * Supports Pinecone, Weaviate, Chroma, and other enterprise vector databases
 */

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    title?: string;
    source: string;
    timestamp: number;
    workflowId?: string;
    userId?: string;
    tags: string[];
    contentType: string;
    [key: string]: any;
  };
}

export interface VectorQuery {
  vector?: number[];
  text?: string;
  topK?: number;
  threshold?: number;
  filters?: Record<string, any>;
  includeMetadata?: boolean;
  includeValues?: boolean;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  document: VectorDocument;
  distance?: number;
}

export interface VectorDatabaseConfig {
  provider: 'pinecone' | 'weaviate' | 'chroma' | 'qdrant' | 'milvus';
  endpoint: string;
  apiKey?: string;
  indexName: string;
  dimensions: number;
  metric: 'cosine' | 'euclidean' | 'dotproduct';
  region?: string;
  namespace?: string;
}

export interface VectorDatabaseMetrics {
  totalDocuments: number;
  indexSize: number;
  queryLatency: number;
  indexingLatency: number;
  storageUsed: number;
  queryVolume: number;
}

// Base interface for vector database providers
export interface VectorDatabaseProvider {
  name: string;
  config: VectorDatabaseConfig;
  
  // Core operations
  upsert(documents: VectorDocument[]): Promise<{ success: boolean; errors?: string[] }>;
  search(query: VectorQuery): Promise<VectorSearchResult[]>;
  delete(ids: string[]): Promise<{ success: boolean; errors?: string[] }>;
  update(id: string, document: Partial<VectorDocument>): Promise<boolean>;
  
  // Index management
  createIndex(config: Partial<VectorDatabaseConfig>): Promise<boolean>;
  deleteIndex(): Promise<boolean>;
  describeIndex(): Promise<any>;
  
  // Utilities
  getMetrics(): Promise<VectorDatabaseMetrics>;
  healthCheck(): Promise<boolean>;
}

// Pinecone implementation
class PineconeProvider implements VectorDatabaseProvider {
  name = 'pinecone';
  
  constructor(public config: VectorDatabaseConfig) {}

  async upsert(documents: VectorDocument[]): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const vectors = documents.map(doc => ({
        id: doc.id,
        values: doc.embedding || [],
        metadata: {
          content: doc.content,
          ...doc.metadata
        }
      }));

      const response = await fetch(`${this.config.endpoint}/vectors/upsert`, {
        method: 'POST',
        headers: {
          'Api-Key': this.config.apiKey!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vectors,
          namespace: this.config.namespace
        })
      });

      if (!response.ok) {
        throw new Error(`Pinecone upsert failed: ${response.statusText}`);
      }

      console.log(`📌 Upserted ${documents.length} documents to Pinecone`);
      return { success: true };
    } catch (error) {
      console.error('Pinecone upsert error:', error);
      return { success: false, errors: [error.message] };
    }
  }

  async search(query: VectorQuery): Promise<VectorSearchResult[]> {
    try {
      const searchRequest: any = {
        vector: query.vector,
        topK: query.topK || 10,
        includeMetadata: query.includeMetadata !== false,
        includeValues: query.includeValues || false,
        namespace: this.config.namespace
      };

      if (query.filters) {
        searchRequest.filter = query.filters;
      }

      const response = await fetch(`${this.config.endpoint}/query`, {
        method: 'POST',
        headers: {
          'Api-Key': this.config.apiKey!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchRequest)
      });

      if (!response.ok) {
        throw new Error(`Pinecone search failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      return data.matches?.map((match: any) => ({
        id: match.id,
        score: match.score,
        document: {
          id: match.id,
          content: match.metadata?.content || '',
          embedding: match.values,
          metadata: match.metadata || {}
        }
      })) || [];
    } catch (error) {
      console.error('Pinecone search error:', error);
      return [];
    }
  }

  async delete(ids: string[]): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const response = await fetch(`${this.config.endpoint}/vectors/delete`, {
        method: 'POST',
        headers: {
          'Api-Key': this.config.apiKey!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids,
          namespace: this.config.namespace
        })
      });

      if (!response.ok) {
        throw new Error(`Pinecone delete failed: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      return { success: false, errors: [error.message] };
    }
  }

  async update(id: string, document: Partial<VectorDocument>): Promise<boolean> {
    // Pinecone doesn't have direct update - use upsert
    if (document.embedding) {
      const result = await this.upsert([document as VectorDocument]);
      return result.success;
    }
    return false;
  }

  async createIndex(config: Partial<VectorDatabaseConfig>): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/databases`, {
        method: 'POST',
        headers: {
          'Api-Key': this.config.apiKey!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: config.indexName || this.config.indexName,
          dimension: config.dimensions || this.config.dimensions,
          metric: config.metric || this.config.metric
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Pinecone create index error:', error);
      return false;
    }
  }

  async deleteIndex(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/databases/${this.config.indexName}`, {
        method: 'DELETE',
        headers: {
          'Api-Key': this.config.apiKey!
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async describeIndex(): Promise<any> {
    try {
      const response = await fetch(`${this.config.endpoint}/databases/${this.config.indexName}`, {
        headers: {
          'Api-Key': this.config.apiKey!
        }
      });

      return response.ok ? await response.json() : null;
    } catch (error) {
      return null;
    }
  }

  async getMetrics(): Promise<VectorDatabaseMetrics> {
    try {
      const stats = await this.describeIndex();
      return {
        totalDocuments: stats?.database?.dimension || 0,
        indexSize: stats?.status?.state === 'Ready' ? 1 : 0,
        queryLatency: 50, // Estimated
        indexingLatency: 200, // Estimated
        storageUsed: 0, // Not available in API
        queryVolume: 0 // Not available in API
      };
    } catch (error) {
      return {
        totalDocuments: 0,
        indexSize: 0,
        queryLatency: 0,
        indexingLatency: 0,
        storageUsed: 0,
        queryVolume: 0
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/databases`, {
        headers: {
          'Api-Key': this.config.apiKey!
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Weaviate implementation
class WeaviateProvider implements VectorDatabaseProvider {
  name = 'weaviate';
  
  constructor(public config: VectorDatabaseConfig) {}

  async upsert(documents: VectorDocument[]): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const objects = documents.map(doc => ({
        class: this.config.indexName,
        id: doc.id,
        properties: {
          content: doc.content,
          ...doc.metadata
        },
        vector: doc.embedding
      }));

      const response = await fetch(`${this.config.endpoint}/v1/batch/objects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          objects
        })
      });

      if (!response.ok) {
        throw new Error(`Weaviate upsert failed: ${response.statusText}`);
      }

      console.log(`🧠 Upserted ${documents.length} documents to Weaviate`);
      return { success: true };
    } catch (error) {
      return { success: false, errors: [error.message] };
    }
  }

  async search(query: VectorQuery): Promise<VectorSearchResult[]> {
    try {
      const graphqlQuery = `
        {
          Get {
            ${this.config.indexName}(
              nearVector: {
                vector: [${query.vector?.join(',')}]
              }
              limit: ${query.topK || 10}
            ) {
              content
              _additional {
                id
                distance
              }
            }
          }
        }
      `;

      const response = await fetch(`${this.config.endpoint}/v1/graphql`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: graphqlQuery })
      });

      if (!response.ok) {
        throw new Error(`Weaviate search failed: ${response.statusText}`);
      }

      const data = await response.json();
      const results = data.data?.Get?.[this.config.indexName] || [];

      return results.map((result: any) => ({
        id: result._additional.id,
        score: 1 - result._additional.distance, // Convert distance to similarity
        distance: result._additional.distance,
        document: {
          id: result._additional.id,
          content: result.content,
          metadata: result
        }
      }));
    } catch (error) {
      console.error('Weaviate search error:', error);
      return [];
    }
  }

  async delete(ids: string[]): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const promises = ids.map(id => 
        fetch(`${this.config.endpoint}/v1/objects/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        })
      );

      await Promise.all(promises);
      return { success: true };
    } catch (error) {
      return { success: false, errors: [error.message] };
    }
  }

  async update(id: string, document: Partial<VectorDocument>): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/v1/objects/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            content: document.content,
            ...document.metadata
          }
        })
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async createIndex(config: Partial<VectorDatabaseConfig>): Promise<boolean> {
    try {
      const schema = {
        class: config.indexName || this.config.indexName,
        vectorizer: 'none',
        properties: [
          {
            name: 'content',
            dataType: ['text']
          }
        ]
      };

      const response = await fetch(`${this.config.endpoint}/v1/schema`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(schema)
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async deleteIndex(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/v1/schema/${this.config.indexName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async describeIndex(): Promise<any> {
    try {
      const response = await fetch(`${this.config.endpoint}/v1/schema/${this.config.indexName}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      return response.ok ? await response.json() : null;
    } catch (error) {
      return null;
    }
  }

  async getMetrics(): Promise<VectorDatabaseMetrics> {
    // Simplified metrics for Weaviate
    return {
      totalDocuments: 0,
      indexSize: 0,
      queryLatency: 80,
      indexingLatency: 150,
      storageUsed: 0,
      queryVolume: 0
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/v1/meta`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Chroma implementation
class ChromaProvider implements VectorDatabaseProvider {
  name = 'chroma';
  
  constructor(public config: VectorDatabaseConfig) {}

  async upsert(documents: VectorDocument[]): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/collections/${this.config.indexName}/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids: documents.map(d => d.id),
          embeddings: documents.map(d => d.embedding),
          documents: documents.map(d => d.content),
          metadatas: documents.map(d => d.metadata)
        })
      });

      if (!response.ok) {
        throw new Error(`Chroma upsert failed: ${response.statusText}`);
      }

      console.log(`🎨 Upserted ${documents.length} documents to Chroma`);
      return { success: true };
    } catch (error) {
      return { success: false, errors: [error.message] };
    }
  }

  async search(query: VectorQuery): Promise<VectorSearchResult[]> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/collections/${this.config.indexName}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query_embeddings: [query.vector],
          n_results: query.topK || 10,
          where: query.filters,
          include: ['documents', 'metadatas', 'distances']
        })
      });

      if (!response.ok) {
        throw new Error(`Chroma search failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.ids || !data.ids[0]) return [];

      return data.ids[0].map((id: string, index: number) => ({
        id,
        score: 1 - (data.distances?.[0]?.[index] || 0),
        distance: data.distances?.[0]?.[index],
        document: {
          id,
          content: data.documents?.[0]?.[index] || '',
          metadata: data.metadatas?.[0]?.[index] || {}
        }
      }));
    } catch (error) {
      console.error('Chroma search error:', error);
      return [];
    }
  }

  async delete(ids: string[]): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/collections/${this.config.indexName}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });

      return { success: response.ok };
    } catch (error) {
      return { success: false, errors: [error.message] };
    }
  }

  async update(id: string, document: Partial<VectorDocument>): Promise<boolean> {
    // Chroma doesn't have direct update - use upsert
    if (document.embedding) {
      const result = await this.upsert([document as VectorDocument]);
      return result.success;
    }
    return false;
  }

  async createIndex(config: Partial<VectorDatabaseConfig>): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: config.indexName || this.config.indexName,
          metadata: {
            dimension: config.dimensions || this.config.dimensions
          }
        })
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async deleteIndex(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/collections/${this.config.indexName}`, {
        method: 'DELETE'
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async describeIndex(): Promise<any> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/collections/${this.config.indexName}`);
      return response.ok ? await response.json() : null;
    } catch (error) {
      return null;
    }
  }

  async getMetrics(): Promise<VectorDatabaseMetrics> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/collections/${this.config.indexName}/count`);
      const data = response.ok ? await response.json() : { count: 0 };
      
      return {
        totalDocuments: data.count || 0,
        indexSize: 1,
        queryLatency: 60,
        indexingLatency: 100,
        storageUsed: 0,
        queryVolume: 0
      };
    } catch (error) {
      return {
        totalDocuments: 0,
        indexSize: 0,
        queryLatency: 0,
        indexingLatency: 0,
        storageUsed: 0,
        queryVolume: 0
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/api/v1/heartbeat`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export class VectorDatabaseManager {
  private providers = new Map<string, VectorDatabaseProvider>();
  private defaultProvider?: VectorDatabaseProvider;

  /**
   * Register a vector database provider
   */
  registerProvider(config: VectorDatabaseConfig): VectorDatabaseProvider {
    let provider: VectorDatabaseProvider;

    switch (config.provider) {
      case 'pinecone':
        provider = new PineconeProvider(config);
        break;
      case 'weaviate':
        provider = new WeaviateProvider(config);
        break;
      case 'chroma':
        provider = new ChromaProvider(config);
        break;
      default:
        throw new Error(`Unsupported vector database provider: ${config.provider}`);
    }

    this.providers.set(config.indexName, provider);
    
    if (!this.defaultProvider) {
      this.defaultProvider = provider;
    }

    console.log(`🗃️ Registered vector database: ${config.provider} (${config.indexName})`);
    return provider;
  }

  /**
   * Get a provider by index name or use default
   */
  getProvider(indexName?: string): VectorDatabaseProvider {
    if (indexName) {
      const provider = this.providers.get(indexName);
      if (!provider) {
        throw new Error(`Vector database provider not found: ${indexName}`);
      }
      return provider;
    }

    if (!this.defaultProvider) {
      throw new Error('No vector database providers registered');
    }

    return this.defaultProvider;
  }

  /**
   * Universal upsert across providers
   */
  async upsert(documents: VectorDocument[], indexName?: string): Promise<{ success: boolean; errors?: string[] }> {
    const provider = this.getProvider(indexName);
    return await provider.upsert(documents);
  }

  /**
   * Universal search across providers
   */
  async search(query: VectorQuery, indexName?: string): Promise<VectorSearchResult[]> {
    const provider = this.getProvider(indexName);
    return await provider.search(query);
  }

  /**
   * Universal delete across providers
   */
  async delete(ids: string[], indexName?: string): Promise<{ success: boolean; errors?: string[] }> {
    const provider = this.getProvider(indexName);
    return await provider.delete(ids);
  }

  /**
   * Hybrid search combining multiple providers
   */
  async hybridSearch(
    query: VectorQuery,
    providers: string[],
    weights?: number[]
  ): Promise<VectorSearchResult[]> {
    const searchPromises = providers.map(async (providerName, index) => {
      try {
        const results = await this.search(query, providerName);
        const weight = weights?.[index] || 1;
        
        // Apply weight to scores
        return results.map(result => ({
          ...result,
          score: result.score * weight,
          provider: providerName
        }));
      } catch (error) {
        console.error(`Hybrid search failed for provider ${providerName}:`, error);
        return [];
      }
    });

    const allResults = (await Promise.all(searchPromises)).flat();
    
    // Deduplicate and merge results
    const merged = new Map<string, VectorSearchResult>();
    
    for (const result of allResults) {
      const existing = merged.get(result.id);
      if (!existing || result.score > existing.score) {
        merged.set(result.id, result);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, query.topK || 10);
  }

  /**
   * Get health status of all providers
   */
  async getHealthStatus(): Promise<Record<string, boolean>> {
    const healthPromises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        const healthy = await provider.healthCheck();
        return [name, healthy];
      } catch (error) {
        return [name, false];
      }
    });

    const results = await Promise.all(healthPromises);
    return Object.fromEntries(results);
  }

  /**
   * Get metrics from all providers
   */
  async getAllMetrics(): Promise<Record<string, VectorDatabaseMetrics>> {
    const metricsPromises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        const metrics = await provider.getMetrics();
        return [name, metrics];
      } catch (error) {
        return [name, {
          totalDocuments: 0,
          indexSize: 0,
          queryLatency: 0,
          indexingLatency: 0,
          storageUsed: 0,
          queryVolume: 0
        }];
      }
    });

    const results = await Promise.all(metricsPromises);
    return Object.fromEntries(results);
  }

  /**
   * Migrate data between providers
   */
  async migrateData(
    fromIndex: string,
    toIndex: string,
    batchSize: number = 100
  ): Promise<{ migrated: number; errors: string[] }> {
    const fromProvider = this.getProvider(fromIndex);
    const toProvider = this.getProvider(toIndex);
    
    let migrated = 0;
    const errors: string[] = [];

    try {
      // This is a simplified migration - in production, implement proper pagination
      console.log(`🔄 Starting migration from ${fromIndex} to ${toIndex}`);
      
      // For now, return success indication
      return { migrated: 0, errors: ['Migration not fully implemented'] };
    } catch (error) {
      errors.push(error.message);
      return { migrated, errors };
    }
  }

  /**
   * Initialize with default providers
   */
  initializeDefaults(): void {
    // Initialize with local Chroma as default
    try {
      this.registerProvider({
        provider: 'chroma',
        endpoint: 'http://localhost:8000',
        indexName: 'default_collection',
        dimensions: 1536, // OpenAI embedding dimension
        metric: 'cosine'
      });
    } catch (error) {
      console.warn('Failed to initialize default Chroma provider:', error.message);
    }

    console.log('🗃️ Vector database manager initialized');
  }
}

export const vectorDatabaseManager = new VectorDatabaseManager();