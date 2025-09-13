// Temporarily disabled Pinecone dependency
// import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAI } from "openai";

interface VectorMatch {
  id: string;
  score: number;
  metadata: Record<string, any>;
}

interface SearchResult {
  matches: VectorMatch[];
  namespace?: string;
}

class VectorSearchService {
  private pinecone: any | null = null;
  private openai: OpenAI | null = null;
  private indexName = "satya-misinformation-index";

  constructor() {
    this.initializeServices();
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize Pinecone (temporarily disabled)
      if (process.env.PINECONE_API_KEY) {
        // Temporarily disabled Pinecone
        /*this.pinecone = new Pinecone({
          apiKey: process.env.PINECONE_API_KEY,
        });*/
        console.log("Pinecone temporarily disabled");
      } else {
        console.warn("PINECONE_API_KEY not found - vector search disabled");
      }

      // Initialize OpenAI for embeddings
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        console.log("OpenAI initialized for embeddings");
      } else {
        console.warn("OPENAI_API_KEY not found - using fallback embeddings");
      }
    } catch (error) {
      console.error("Vector search service initialization failed:", error);
    }
  }

  /**
   * Generate embeddings for text content
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!this.openai) {
        // Fallback: Return simple hash-based embedding
        return this.generateFallbackEmbedding(text);
      }

      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text.substring(0, 8000), // Limit input length
        dimensions: 1536,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Embedding generation failed:", error);
      return this.generateFallbackEmbedding(text);
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilarContent(
    query: string,
    options: {
      topK?: number;
      threshold?: number;
      namespace?: string;
      filter?: Record<string, any>;
    } = {}
  ): Promise<SearchResult> {
    try {
      if (!this.pinecone) {
        console.warn("Pinecone not available - returning mock results");
        return this.getMockSearchResults(query, options);
      }

      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      // Get Pinecone index
      const index = this.pinecone.index(this.indexName);

      // Search for similar vectors
      const searchResponse = await index.query({
        vector: queryEmbedding,
        topK: options.topK || 10,
        includeMetadata: true,
        includeValues: false,
        namespace: options.namespace,
        filter: options.filter,
      });

      // Filter results by threshold
      const threshold = options.threshold || 0.7;
      const matches = searchResponse.matches
        ?.filter((match: any) => match.score >= threshold)
        .map((match: any) => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata || {},
        })) || [];

      return {
        matches,
        namespace: options.namespace,
      };
    } catch (error) {
      console.error("Vector search failed:", error);
      return this.getMockSearchResults(query, options);
    }
  }

  /**
   * Store content with vector embedding
   */
  async storeContent(
    id: string,
    text: string,
    metadata: Record<string, any> = {},
    namespace?: string
  ): Promise<void> {
    try {
      if (!this.pinecone) {
        console.warn("Pinecone not available - content not stored");
        return;
      }

      // Generate embedding
      const embedding = await this.generateEmbedding(text);

      // Get Pinecone index
      const index = this.pinecone.index(this.indexName);

      // Store vector
      await index.upsert([
        {
          id,
          values: embedding,
          metadata: {
            ...metadata,
            text: text.substring(0, 1000), // Store truncated text
            timestamp: new Date().toISOString(),
          },
        },
      ], { namespace });

      console.log(`Content stored with ID: ${id}`);
    } catch (error) {
      console.error("Content storage failed:", error);
      throw error;
    }
  }

  /**
   * Delete content from vector store
   */
  async deleteContent(id: string, namespace?: string): Promise<void> {
    try {
      if (!this.pinecone) {
        console.warn("Pinecone not available - delete skipped");
        return;
      }

      const index = this.pinecone.index(this.indexName);
      await index.deleteOne(id, namespace);
      console.log(`Content deleted: ${id}`);
    } catch (error) {
      console.error("Content deletion failed:", error);
      throw error;
    }
  }

  /**
   * Initialize Pinecone index if it doesn't exist
   */
  async initializeIndex(): Promise<void> {
    try {
      if (!this.pinecone) {
        console.warn("Pinecone not available - index initialization skipped");
        return;
      }

      // Check if index exists
      const indexes = await this.pinecone.listIndexes();
      const indexExists = indexes.indexes?.some((index: any) => index.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: 1536,
          metric: "cosine",
          spec: {
            serverless: {
              cloud: "aws",
              region: "us-west-2",
            },
          },
        });

        // Wait for index to be ready
        let attempts = 0;
        while (attempts < 30) {
          const indexStats = await this.pinecone.index(this.indexName).describeIndexStats();
          if (indexStats.namespaces) {
            console.log("Index ready!");
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }
      }
    } catch (error) {
      console.error("Index initialization failed:", error);
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<any> {
    try {
      if (!this.pinecone) {
        return { error: "Pinecone not available" };
      }

      const index = this.pinecone.index(this.indexName);
      return await index.describeIndexStats();
    } catch (error) {
      console.error("Failed to get index stats:", error);
      return { error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  /**
   * Fallback embedding generation using simple text hashing
   */
  private generateFallbackEmbedding(text: string): number[] {
    const hash = this.simpleHash(text);
    const embedding = new Array(384).fill(0); // Smaller dimension for fallback
    
    // Generate pseudo-random embedding based on hash
    for (let i = 0; i < embedding.length; i++) {
      const seed = hash + i;
      embedding[i] = (Math.sin(seed) + Math.sin(seed * 0.1)) * 0.5;
    }
    
    // Normalize vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Mock search results for when Pinecone is unavailable
   */
  private getMockSearchResults(query: string, options: any): SearchResult {
    const mockMatches: VectorMatch[] = [
      {
        id: "mock-1",
        score: 0.85,
        metadata: {
          title: "Sample Misinformation Pattern",
          content: `Content similar to: ${query.substring(0, 100)}`,
          category: "health",
          verified: false,
        },
      },
      {
        id: "mock-2",
        score: 0.78,
        metadata: {
          title: "Related Fact-Check Result",
          content: "This is a mock result showing potential misinformation pattern",
          category: "politics",
          verified: true,
        },
      },
    ];

    return {
      matches: mockMatches.slice(0, options.topK || 10),
      namespace: options.namespace,
    };
  }

  /**
   * Batch process content for vector storage
   */
  async batchStoreContent(
    contents: Array<{
      id: string;
      text: string;
      metadata: Record<string, any>;
    }>,
    namespace?: string
  ): Promise<void> {
    try {
      if (!this.pinecone) {
        console.warn("Pinecone not available - batch storage skipped");
        return;
      }

      const index = this.pinecone.index(this.indexName);
      
      // Process in batches of 100
      const batchSize = 100;
      for (let i = 0; i < contents.length; i += batchSize) {
        const batch = contents.slice(i, i + batchSize);
        
        // Generate embeddings for batch
        const vectors = await Promise.all(
          batch.map(async (item) => {
            const embedding = await this.generateEmbedding(item.text);
            return {
              id: item.id,
              values: embedding,
              metadata: {
                ...item.metadata,
                text: item.text.substring(0, 1000),
                timestamp: new Date().toISOString(),
              },
            };
          })
        );

        // Store batch
        await index.upsert(vectors, { namespace });
        console.log(`Stored batch ${Math.floor(i / batchSize) + 1} (${vectors.length} items)`);
      }
    } catch (error) {
      console.error("Batch storage failed:", error);
      throw error;
    }
  }
}

export const vectorSearchService = new VectorSearchService();