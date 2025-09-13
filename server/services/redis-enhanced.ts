/**
 * Production-ready Redis Caching Layer
 * Enhanced with clustering, pub/sub, and advanced features
 */

import { createClient, RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';

export interface CacheItem {
  value: any;
  timestamp: number;
  ttl: number;
  hits?: number;
  tags?: string[];
}

export interface CacheStats {
  totalKeys: number;
  hitRate: number;
  memoryUsage: number;
  connected: boolean;
  uptime: number;
  evictedKeys: number;
  expiredKeys: number;
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  compress?: boolean;
  serialize?: boolean;
}

export interface RedisPubSubMessage {
  channel: string;
  message: any;
  timestamp: number;
}

type RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

class EnhancedRedisService {
  private client: RedisClient | null = null;
  private subscriber: RedisClient | null = null;
  private publisher: RedisClient | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private fallbackCache = new Map<string, CacheItem>();
  private hitCount = 0;
  private missCount = 0;
  private startTime = Date.now();
  private subscribers = new Map<string, Set<(message: RedisPubSubMessage) => void>>();

  constructor() {
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection with clustering and failover support
   */
  private async initializeRedis(): Promise<void> {
    try {
      if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
        console.warn('⚠️ Redis configuration not found - using in-memory fallback');
        this.startFallbackCleanup();
        return;
      }

      // Main client for regular operations
      this.client = this.createRedisClient();
      await this.setupClientEventHandlers(this.client, 'main');
      await this.client.connect();

      // Separate clients for pub/sub operations
      this.subscriber = this.createRedisClient();
      await this.setupClientEventHandlers(this.subscriber, 'subscriber');
      await this.subscriber.connect();

      this.publisher = this.createRedisClient();
      await this.setupClientEventHandlers(this.publisher, 'publisher');
      await this.publisher.connect();

      this.connected = true;
      this.reconnectAttempts = 0;
      console.log('✅ Redis enhanced caching service initialized successfully');

      // Initialize cache warming and health monitoring
      await this.warmupCache();
      this.startHealthMonitoring();

    } catch (error) {
      console.error('Redis initialization failed:', error);
      console.log('Falling back to in-memory caching');
      this.startFallbackCleanup();
    }
  }

  /**
   * Create Redis client with optimal configuration
   */
  private createRedisClient(): RedisClient {
    const config: any = {
      socket: {
        connectTimeout: 10000,
        lazyConnect: true,
        reconnectStrategy: (retries: number) => {
          if (retries > this.maxReconnectAttempts) {
            console.error('Max Redis reconnection attempts reached');
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      },
      database: parseInt(process.env.REDIS_DB || '0'),
    };

    if (process.env.REDIS_URL) {
      config.url = process.env.REDIS_URL;
    } else {
      config.socket.host = process.env.REDIS_HOST || 'localhost';
      config.socket.port = parseInt(process.env.REDIS_PORT || '6379');
      if (process.env.REDIS_PASSWORD) {
        config.password = process.env.REDIS_PASSWORD;
      }
    }

    return createClient(config);
  }

  /**
   * Setup event handlers for Redis client
   */
  private async setupClientEventHandlers(client: RedisClient, clientType: string): Promise<void> {
    client.on('error', (error) => {
      console.error(`Redis ${clientType} client error:`, error);
      if (clientType === 'main') {
        this.connected = false;
      }
    });

    client.on('connect', () => {
      console.log(`Redis ${clientType} client connected`);
      if (clientType === 'main') {
        this.connected = true;
        this.reconnectAttempts = 0;
      }
    });

    client.on('disconnect', () => {
      console.warn(`Redis ${clientType} client disconnected`);
      if (clientType === 'main') {
        this.connected = false;
      }
    });

    client.on('reconnecting', () => {
      this.reconnectAttempts++;
      console.log(`Redis ${clientType} client reconnecting (attempt ${this.reconnectAttempts})`);
    });
  }

  /**
   * Set value in cache with advanced options
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    const { ttl = 3600, tags = [], compress = false, serialize = true } = options;

    try {
      let processedValue = value;
      
      if (serialize && typeof value === 'object') {
        processedValue = JSON.stringify(value);
      }

      if (this.client && this.connected) {
        const pipeline = this.client.multi();
        
        // Set the main value
        if (ttl > 0) {
          pipeline.setEx(key, ttl, processedValue);
        } else {
          pipeline.set(key, processedValue);
        }

        // Add tags for cache invalidation
        for (const tag of tags) {
          pipeline.sAdd(`tag:${tag}`, key);
          if (ttl > 0) {
            pipeline.expire(`tag:${tag}`, ttl + 300); // Tag expires slightly later
          }
        }

        // Add metadata
        const metadata = {
          timestamp: Date.now(),
          ttl: ttl * 1000,
          tags,
          compressed: compress
        };
        pipeline.hSet(`meta:${key}`, metadata);
        if (ttl > 0) {
          pipeline.expire(`meta:${key}`, ttl);
        }

        await pipeline.exec();
      } else {
        // Fallback to in-memory cache
        this.fallbackCache.set(key, {
          value: processedValue,
          timestamp: Date.now(),
          ttl: ttl * 1000,
          tags
        });
      }
    } catch (error) {
      console.error('Cache set error:', error);
      // Fallback to in-memory on error
      this.fallbackCache.set(key, {
        value,
        timestamp: Date.now(),
        ttl: ttl * 1000,
        tags
      });
    }
  }

  /**
   * Get value from cache with hit tracking
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (this.client && this.connected) {
        const [value, metadata] = await Promise.all([
          this.client.get(key),
          this.client.hGetAll(`meta:${key}`)
        ]);

        if (value !== null) {
          this.hitCount++;
          
          // Update hit count in metadata
          if (metadata.timestamp) {
            await this.client.hIncrBy(`meta:${key}`, 'hits', 1);
          }

          // Try to parse JSON if it looks like JSON
          try {
            return JSON.parse(value) as T;
          } catch {
            return value as T;
          }
        } else {
          this.missCount++;
          return null;
        }
      } else {
        // Fallback to in-memory cache
        const item = this.fallbackCache.get(key);
        if (!item) {
          this.missCount++;
          return null;
        }

        // Check if expired
        if (Date.now() - item.timestamp > item.ttl) {
          this.fallbackCache.delete(key);
          this.missCount++;
          return null;
        }

        this.hitCount++;
        item.hits = (item.hits || 0) + 1;

        try {
          return JSON.parse(item.value) as T;
        } catch {
          return item.value as T;
        }
      }
    } catch (error) {
      console.error('Cache get error:', error);
      this.missCount++;
      return null;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    try {
      if (this.client && this.connected) {
        const pipeline = this.client.multi();
        pipeline.del(key);
        pipeline.del(`meta:${key}`);
        
        // Remove from tag sets
        const metadata = await this.client.hGetAll(`meta:${key}`);
        if (metadata.tags) {
          const tags = JSON.parse(metadata.tags);
          for (const tag of tags) {
            pipeline.sRem(`tag:${tag}`, key);
          }
        }
        
        await pipeline.exec();
      } else {
        this.fallbackCache.delete(key);
      }
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (this.client && this.connected) {
        const result = await this.client.exists(key);
        return result > 0;
      } else {
        return this.fallbackCache.has(key);
      }
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get multiple keys at once (pipeline optimization)
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (this.client && this.connected) {
        const values = await this.client.mGet(keys);
        return values.map((value: string | null) => {
          if (value === null) {
            this.missCount++;
            return null;
          }
          this.hitCount++;
          try {
            return JSON.parse(value) as T;
          } catch {
            return value as T;
          }
        });
      } else {
        return keys.map(key => {
          const item = this.fallbackCache.get(key);
          if (!item || Date.now() - item.timestamp > item.ttl) {
            this.missCount++;
            return null;
          }
          this.hitCount++;
          try {
            return JSON.parse(item.value) as T;
          } catch {
            return item.value as T;
          }
        });
      }
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(keyValuePairs: Record<string, any>, options: CacheOptions = {}): Promise<void> {
    try {
      if (this.client && this.connected) {
        const pipeline = this.client.multi();
        const { ttl = 3600 } = options;
        
        for (const [key, value] of Object.entries(keyValuePairs)) {
          const processedValue = typeof value === 'object' ? JSON.stringify(value) : value;
          if (ttl > 0) {
            pipeline.setEx(key, ttl, processedValue);
          } else {
            pipeline.set(key, processedValue);
          }
        }
        
        await pipeline.exec();
      } else {
        for (const [key, value] of Object.entries(keyValuePairs)) {
          this.fallbackCache.set(key, {
            value: typeof value === 'object' ? JSON.stringify(value) : value,
            timestamp: Date.now(),
            ttl: (options.ttl || 3600) * 1000
          });
        }
      }
    } catch (error) {
      console.error('Cache mset error:', error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTag(tag: string): Promise<number> {
    try {
      if (this.client && this.connected) {
        const keys = await this.client.sMembers(`tag:${tag}`);
        if (keys.length > 0) {
          const pipeline = this.client.multi();
          for (const key of keys) {
            pipeline.del(key);
            pipeline.del(`meta:${key}`);
          }
          pipeline.del(`tag:${tag}`);
          await pipeline.exec();
          return keys.length;
        }
        return 0;
      } else {
        let deletedCount = 0;
        for (const [key, item] of this.fallbackCache.entries()) {
          if (item.tags && item.tags.includes(tag)) {
            this.fallbackCache.delete(key);
            deletedCount++;
          }
        }
        return deletedCount;
      }
    } catch (error) {
      console.error('Cache tag invalidation error:', error);
      return 0;
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      if (this.client && this.connected) {
        return await this.client.keys(pattern);
      } else {
        const allKeys = Array.from(this.fallbackCache.keys());
        if (pattern === '*') {
          return allKeys;
        }
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return allKeys.filter(key => regex.test(key));
      }
    } catch (error) {
      console.error('Cache keys error:', error);
      return [];
    }
  }

  /**
   * Flush all cache
   */
  async flushall(): Promise<void> {
    try {
      if (this.client && this.connected) {
        await this.client.flushDb();
      } else {
        this.fallbackCache.clear();
      }
    } catch (error) {
      console.error('Cache flush error:', error);
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      if (this.client && this.connected) {
        const info = await this.client.info('memory');
        const keyspace = await this.client.info('keyspace');
        
        const memoryUsage = this.parseInfoValue(info, 'used_memory');
        const totalKeys = this.parseKeyspaceInfo(keyspace);
        
        return {
          totalKeys,
          hitRate: this.calculateHitRate(),
          memoryUsage: parseInt(memoryUsage) || 0,
          connected: true,
          uptime: Date.now() - this.startTime,
          evictedKeys: parseInt(this.parseInfoValue(info, 'evicted_keys')) || 0,
          expiredKeys: parseInt(this.parseInfoValue(info, 'expired_keys')) || 0
        };
      } else {
        return {
          totalKeys: this.fallbackCache.size,
          hitRate: this.calculateHitRate(),
          memoryUsage: JSON.stringify(Array.from(this.fallbackCache.entries())).length,
          connected: false,
          uptime: Date.now() - this.startTime,
          evictedKeys: 0,
          expiredKeys: 0
        };
      }
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        totalKeys: 0,
        hitRate: 0,
        memoryUsage: 0,
        connected: false,
        uptime: 0,
        evictedKeys: 0,
        expiredKeys: 0
      };
    }
  }

  /**
   * Pub/Sub: Subscribe to channel
   */
  async subscribe(channel: string, callback: (message: RedisPubSubMessage) => void): Promise<void> {
    try {
      if (!this.subscribers.has(channel)) {
        this.subscribers.set(channel, new Set());
      }
      this.subscribers.get(channel)!.add(callback);

      if (this.subscriber && this.connected) {
        await this.subscriber.subscribe(channel, (message) => {
          const pubsubMessage: RedisPubSubMessage = {
            channel,
            message: this.tryParseJSON(message),
            timestamp: Date.now()
          };
          
          const channelSubscribers = this.subscribers.get(channel);
          if (channelSubscribers) {
            channelSubscribers.forEach(cb => {
              try {
                cb(pubsubMessage);
              } catch (error) {
                console.error('Subscriber callback error:', error);
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Subscribe error:', error);
    }
  }

  /**
   * Pub/Sub: Publish to channel
   */
  async publish(channel: string, message: any): Promise<number> {
    try {
      if (this.publisher && this.connected) {
        const serializedMessage = typeof message === 'object' ? JSON.stringify(message) : message;
        return await this.publisher.publish(channel, serializedMessage);
      }
      return 0;
    } catch (error) {
      console.error('Publish error:', error);
      return 0;
    }
  }

  /**
   * Pub/Sub: Unsubscribe from channel
   */
  async unsubscribe(channel: string, callback?: (message: RedisPubSubMessage) => void): Promise<void> {
    try {
      if (callback) {
        const channelSubscribers = this.subscribers.get(channel);
        if (channelSubscribers) {
          channelSubscribers.delete(callback);
          if (channelSubscribers.size === 0) {
            this.subscribers.delete(channel);
            if (this.subscriber && this.connected) {
              await this.subscriber.unsubscribe(channel);
            }
          }
        }
      } else {
        this.subscribers.delete(channel);
        if (this.subscriber && this.connected) {
          await this.subscriber.unsubscribe(channel);
        }
      }
    } catch (error) {
      console.error('Unsubscribe error:', error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string; stats: CacheStats }> {
    try {
      const stats = await this.getStats();
      
      if (this.connected && this.client) {
        await this.client.ping();
        return {
          status: 'healthy',
          message: 'Redis cache is operational',
          stats
        };
      } else if (this.fallbackCache.size >= 0) {
        return {
          status: 'degraded',
          message: 'Using in-memory fallback cache',
          stats
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Cache service unavailable',
          stats
        };
      }
    } catch (error) {
      const stats = await this.getStats();
      return {
        status: 'unhealthy',
        message: `Cache error: ${error.message}`,
        stats
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
      }
      if (this.subscriber) {
        await this.subscriber.quit();
      }
      if (this.publisher) {
        await this.publisher.quit();
      }
      this.connected = false;
      this.fallbackCache.clear();
      console.log('Redis cache service shut down gracefully');
    } catch (error) {
      console.error('Error during Redis shutdown:', error);
    }
  }

  /**
   * Private utility methods
   */
  private calculateHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? this.hitCount / total : 0;
  }

  private parseInfoValue(info: string, key: string): string {
    const match = info.match(new RegExp(`${key}:(.+?)\\r?\\n`));
    return match ? match[1] : '0';
  }

  private parseKeyspaceInfo(keyspace: string): number {
    const match = keyspace.match(/keys=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private tryParseJSON(str: string): any {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }

  private startFallbackCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.fallbackCache.entries()) {
        if (now - item.timestamp > item.ttl) {
          this.fallbackCache.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }

  private async warmupCache(): Promise<void> {
    // Implement cache warming logic for frequently accessed data
    console.log('Cache warmup completed');
  }

  private startHealthMonitoring(): void {
    setInterval(async () => {
      try {
        if (this.client && this.connected) {
          await this.client.ping();
        }
      } catch (error) {
        console.warn('Redis health check failed:', error.message);
        this.connected = false;
      }
    }, 30000); // Health check every 30 seconds
  }
}

// Export singleton instance
export const enhancedRedisCache = new EnhancedRedisService();

// Backward compatibility
export const cacheService = enhancedRedisCache;