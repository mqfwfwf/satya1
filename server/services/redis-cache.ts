// Temporarily disabled Redis dependency - using in-memory cache
// import Redis from "redis";

interface CacheItem {
  value: any;
  timestamp: number;
  ttl: number;
}

class RedisCacheService {
  private client: any | null = null;
  private connected = false;
  private fallbackCache = new Map<string, CacheItem>();

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      // Temporarily disabled Redis - using in-memory fallback only
      console.warn("Redis disabled - using fallback memory cache");
    } catch (error) {
      console.error("Redis initialization failed:", error);
      console.log("Falling back to memory cache");
    }
  }

  /**
   * Set a value in cache with TTL
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      // Always use fallback cache for now
      this.fallbackCache.set(key, {
        value,
        timestamp: Date.now(),
        ttl: ttlSeconds * 1000,
      });
    } catch (error) {
      console.error("Cache set error:", error);
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      // Always use fallback cache for now
      const item = this.fallbackCache.get(key);
      
      if (!item) {
        return null;
      }

      // Check if expired
      if (Date.now() - item.timestamp > item.ttl) {
        this.fallbackCache.delete(key);
        return null;
      }

      return item.value as T;
    } catch (error) {
      console.error("Cache get error:", error);
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<void> {
    try {
      this.fallbackCache.delete(key);
    } catch (error) {
      console.error("Cache delete error:", error);
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return this.fallbackCache.has(key);
    } catch (error) {
      console.error("Cache exists error:", error);
      return false;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      return Promise.all(keys.map(key => this.get<T>(key)));
    } catch (error) {
      console.error("Cache mget error:", error);
      return keys.map(() => null);
    }
  }

  /**
   * Delete multiple keys
   */
  async mdel(keys: string[]): Promise<void> {
    try {
      keys.forEach(key => this.fallbackCache.delete(key));
    } catch (error) {
      console.error("Cache mdel error:", error);
    }
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const allKeys = Array.from(this.fallbackCache.keys());
      
      if (pattern === "*") {
        return allKeys;
      }
      
      // Simple pattern matching (only supports * at end)
      const prefix = pattern.replace("*", "");
      return allKeys.filter(key => key.startsWith(prefix));
    } catch (error) {
      console.error("Cache keys error:", error);
      return [];
    }
  }

  /**
   * Clear all cache
   */
  async flushall(): Promise<void> {
    try {
      this.fallbackCache.clear();
    } catch (error) {
      console.error("Cache flush error:", error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    keysCount: number;
    memoryUsage: number;
  }> {
    return {
      connected: this.connected,
      keysCount: this.fallbackCache.size,
      memoryUsage: JSON.stringify(Array.from(this.fallbackCache.entries())).length,
    };
  }

  /**
   * Cleanup expired items from fallback cache
   */
  private cleanupExpired(): void {
    const now = Date.now();
    
    for (const [key, item] of Array.from(this.fallbackCache.entries())) {
      if (now - item.timestamp > item.ttl) {
        this.fallbackCache.delete(key);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMs: number = 300000): void {
    setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    try {
      if (this.client) {
        // await this.client.quit();
        this.client = null;
      }
      this.connected = false;
      this.fallbackCache.clear();
    } catch (error) {
      console.error("Redis close error:", error);
    }
  }
}

// Export singleton instances
export const redisCache = new RedisCacheService();
export const cacheService = redisCache; // Alias for backward compatibility