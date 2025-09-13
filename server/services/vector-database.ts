/**
 * Production-ready Pinecone Vector Database Integration
 * Enhanced with real vector operations and semantic search
 */

import { Pinecone, Index } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import { cacheService } from './redis-cache';

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: {
    content: string;
    type: 'misinformation' | 'factual' | 'claim' | 'source';
    category: string;
    timestamp: string;
    language?: string;
    credibilityScore?: number;
    verified?: boolean;
    sourceUrl?: string;
    contentHash?: string;
  };
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: VectorRecord['metadata'];
  content: string;
}

export interface VectorSearchOptions {
  topK?: number;
  threshold?: number;
  namespace?: string;
  filter?: Record<string, any>;
  includeValues?: boolean;
  includeMetadata?: boolean;
}

export interface VectorDatabaseStats {
  totalVectors: number;
  namespaces: string[];
  indexHealth: 'healthy' | 'degraded' | 'unhealthy';
  lastUpdated: string;
}

class PineconeVectorDatabase {
  private pinecone: Pinecone | null = null;
  private index: Index | null = null;
  private openai: OpenAI | null = null;
  private indexName = process.env.PINECONE_INDEX_NAME || 'satya-misinformation-index';
  private dimension = 1536; // OpenAI embedding dimension
  private isInitialized = false;
  private fallbackVectors = new Map<string, VectorRecord>();

  constructor() {
    this.initializeServices();
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize Pinecone
      if (process.env.PINECONE_API_KEY) {
        this.pinecone = new Pinecone({
          apiKey: process.env.PINECONE_API_KEY,
        });

        // Initialize or get existing index
        await this.initializeIndex();
        this.isInitialized = true;
        console.log('✅ Pinecone vector database initialized successfully');
      } else {
        console.warn('⚠️ PINECONE_API_KEY not found - using in-memory fallback');
      }

      // Initialize OpenAI for embeddings
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        console.log('✅ OpenAI embeddings service initialized');
      } else {
        console.warn('⚠️ OPENAI_API_KEY not found - embeddings disabled');
      }
    } catch (error) {
      console.error('Vector database initialization failed:', error);
      console.log('Falling back to in-memory vector storage');
    }
  }

  /**
   * Initialize or connect to Pinecone index
   */
  private async initializeIndex(): Promise<void> {
    if (!this.pinecone) return;

    try {
      // List existing indexes
      const indexes = await this.pinecone.listIndexes();
      const indexExists = indexes.indexes?.some(idx => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: this.dimension,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: process.env.PINECONE_REGION || 'us-east-1'
            }
          }
        });

        // Wait for index to be ready
        await this.waitForIndexReady();
        console.log(`✅ Index ${this.indexName} created successfully`);
      }

      // Connect to the index
      this.index = this.pinecone.index(this.indexName);
      console.log(`✅ Connected to index: ${this.indexName}`);

      // Initialize with some seed data if empty
      await this.seedInitialData();

    } catch (error) {
      console.error('Index initialization failed:', error);
      throw error;
    }
  }

  /**
   * Wait for index to be ready after creation
   */
  private async waitForIndexReady(maxAttempts = 30): Promise<void> {
    if (!this.pinecone) return;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const indexStats = await this.pinecone.index(this.indexName).describeIndexStats();
        if (indexStats.totalVectorCount !== undefined) {
          return; // Index is ready
        }
      } catch (error) {
        // Index not ready yet, continue waiting
      }
      
      console.log(`Waiting for index to be ready... (${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Index failed to become ready within timeout');
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(content: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized - cannot generate embeddings');
    }

    try {
      // Check cache first
      const cacheKey = `embedding:${Buffer.from(content).toString('base64')}`;
      const cached = await cacheService.get<number[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: content,
        encoding_format: 'float',
      });

      const embedding = response.data[0].embedding;
      
      // Cache for 24 hours
      await cacheService.set(cacheKey, embedding, 86400);
      
      return embedding;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Store vector with metadata in database
   */
  async upsertVector(record: VectorRecord, namespace?: string): Promise<void> {
    try {
      if (this.index) {
        await this.index.namespace(namespace || 'default').upsert([{
          id: record.id,
          values: record.values,
          metadata: record.metadata
        }]);
        console.log(`Vector ${record.id} upserted successfully`);
      } else {
        // Fallback to in-memory storage
        this.fallbackVectors.set(record.id, record);
        console.log(`Vector ${record.id} stored in fallback memory`);
      }
    } catch (error) {
      console.error('Vector upsert failed:', error);
      throw error;
    }
  }

  /**
   * Store content with automatic embedding generation
   */
  async storeContent(
    id: string,
    content: string,
    metadata: Partial<VectorRecord['metadata']>,
    namespace?: string
  ): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(content);
      const contentHash = this.generateContentHash(content);

      const record: VectorRecord = {
        id,
        values: embedding,
        metadata: {
          content: content.substring(0, 1000), // Store first 1000 chars
          type: 'factual',
          category: 'general',
          timestamp: new Date().toISOString(),
          contentHash,
          ...metadata
        }
      };

      await this.upsertVector(record, namespace);
    } catch (error) {
      console.error('Content storage failed:', error);
      throw error;
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilar(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      const {
        topK = 10,
        threshold = 0.7,
        namespace,
        filter,
        includeValues = false,
        includeMetadata = true
      } = options;

      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      if (this.index) {
        // Use Pinecone for search
        const searchResponse = await this.index.namespace(namespace || 'default').query({
          vector: queryEmbedding,
          topK,
          includeValues,
          includeMetadata,
          filter
        });

        // Filter by threshold and format results
        const results: SearchResult[] = searchResponse.matches
          ?.filter(match => (match.score || 0) >= threshold)
          .map(match => ({
            id: match.id,
            score: match.score || 0,
            metadata: match.metadata as VectorRecord['metadata'],
            content: (match.metadata as any)?.content || ''
          })) || [];

        console.log(`Found ${results.length} similar vectors for query`);
        return results;
      } else {
        // Fallback to in-memory search
        return this.searchInMemory(queryEmbedding, options);
      }
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }

  /**
   * Search by content directly (generates embedding automatically)
   */
  async searchByContent(content: string, options: VectorSearchOptions = {}): Promise<SearchResult[]> {
    return await this.searchSimilar(content, options);
  }

  /**
   * Get vector by ID
   */
  async getVector(id: string, namespace?: string): Promise<VectorRecord | null> {
    try {
      if (this.index) {
        const response = await this.index.namespace(namespace || 'default').fetch([id]);
        const vector = response.records?.[id];
        
        if (vector) {
          return {
            id,
            values: vector.values || [],
            metadata: vector.metadata as VectorRecord['metadata']
          };
        }
      } else {
        // Fallback to in-memory
        return this.fallbackVectors.get(id) || null;
      }
      
      return null;
    } catch (error) {
      console.error('Vector fetch failed:', error);
      return null;
    }
  }

  /**
   * Delete vector by ID
   */
  async deleteVector(id: string, namespace?: string): Promise<void> {
    try {
      if (this.index) {
        await this.index.namespace(namespace || 'default').deleteOne(id);
      } else {
        this.fallbackVectors.delete(id);
      }
      console.log(`Vector ${id} deleted successfully`);
    } catch (error) {
      console.error('Vector deletion failed:', error);
      throw error;
    }
  }

  /**
   * Bulk upsert multiple vectors
   */
  async bulkUpsert(records: VectorRecord[], namespace?: string): Promise<void> {
    try {
      if (this.index) {
        // Batch upsert in chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < records.length; i += chunkSize) {
          const chunk = records.slice(i, i + chunkSize);
          const vectors = chunk.map(record => ({
            id: record.id,
            values: record.values,
            metadata: record.metadata
          }));
          
          await this.index.namespace(namespace || 'default').upsert(vectors);
        }
        console.log(`Bulk upserted ${records.length} vectors`);
      } else {
        // Fallback to in-memory
        records.forEach(record => {
          this.fallbackVectors.set(record.id, record);
        });
      }
    } catch (error) {
      console.error('Bulk upsert failed:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<VectorDatabaseStats> {
    try {
      if (this.index) {
        const stats = await this.index.describeIndexStats();
        return {
          totalVectors: stats.totalVectorCount || 0,
          namespaces: Object.keys(stats.namespaces || {}),
          indexHealth: 'healthy',
          lastUpdated: new Date().toISOString()
        };
      } else {
        return {
          totalVectors: this.fallbackVectors.size,
          namespaces: ['default'],
          indexHealth: 'degraded',
          lastUpdated: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return {
        totalVectors: 0,
        namespaces: [],
        indexHealth: 'unhealthy',
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Seed initial data for testing
   */
  private async seedInitialData(): Promise<void> {
    try {
      const stats = await this.getStats();
      if (stats.totalVectors > 0) {
        console.log('Index already contains data, skipping seed');
        return;
      }

      const seedData = [
        {
          id: 'seed-fact-1',
          content: 'COVID-19 vaccines are safe and effective according to global health authorities',
          metadata: { type: 'factual' as const, category: 'health', credibilityScore: 0.95 }
        },
        {
          id: 'seed-misinfo-1',
          content: '5G towers cause coronavirus infections',
          metadata: { type: 'misinformation' as const, category: 'conspiracy', credibilityScore: 0.1 }
        },
        {
          id: 'seed-claim-1',
          content: 'Climate change is primarily caused by human activities',
          metadata: { type: 'factual' as const, category: 'environment', credibilityScore: 0.98 }
        }
      ];

      for (const item of seedData) {
        try {
          await this.storeContent(item.id, item.content, item.metadata);
        } catch (error) {
          console.warn(`Failed to seed data item ${item.id}:`, error.message);
        }
      }

      console.log('✅ Initial seed data added to vector database');
    } catch (error) {
      console.warn('Failed to seed initial data:', error.message);
    }
  }

  /**
   * In-memory search fallback
   */
  private searchInMemory(queryEmbedding: number[], options: VectorSearchOptions): SearchResult[] {
    const results: SearchResult[] = [];
    const threshold = options.threshold || 0.7;
    const topK = options.topK || 10;

    for (const [id, record] of this.fallbackVectors) {
      const similarity = this.cosineSimilarity(queryEmbedding, record.values);
      
      if (similarity >= threshold) {
        results.push({
          id,
          score: similarity,
          metadata: record.metadata,
          content: record.metadata.content
        });
      }
    }

    // Sort by score descending and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
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

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    // Simple hash function - in production use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    try {
      if (this.index) {
        await this.index.describeIndexStats();
        return { status: 'healthy', message: 'Vector database is operational' };
      } else if (this.fallbackVectors.size >= 0) {
        return { status: 'degraded', message: 'Using in-memory fallback storage' };
      } else {
        return { status: 'unhealthy', message: 'Vector database unavailable' };
      }
    } catch (error) {
      return { status: 'unhealthy', message: `Database error: ${error.message}` };
    }
  }

  /**
   * Clear all vectors (use with caution!)
   */
  async clearAll(namespace?: string): Promise<void> {
    try {
      if (this.index) {
        await this.index.namespace(namespace || 'default').deleteAll();
        console.log('All vectors cleared from database');
      } else {
        this.fallbackVectors.clear();
        console.log('All vectors cleared from fallback storage');
      }
    } catch (error) {
      console.error('Failed to clear vectors:', error);
      throw error;
    }
  }

  /**
   * Export vectors for backup
   */
  async exportVectors(namespace?: string): Promise<VectorRecord[]> {
    if (!this.index) {
      return Array.from(this.fallbackVectors.values());
    }

    // For Pinecone, we'd need to implement pagination to fetch all vectors
    // This is a simplified implementation
    console.warn('Vector export from Pinecone requires pagination - implement as needed');
    return [];
  }

  /**
   * Get initialization status
   */
  isReady(): boolean {
    return this.isInitialized && (this.index !== null || this.fallbackVectors.size >= 0);
  }
}

// Export singleton instance
export const vectorDatabase = new PineconeVectorDatabase();