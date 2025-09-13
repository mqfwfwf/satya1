/**
 * Background sync utility for PWA offline functionality
 * Handles queueing failed requests and syncing when online
 */

interface QueuedRequest {
  id?: number;
  url: string;
  method: string;
  body: any;
  headers: Record<string, string>;
  timestamp: number;
}

class BackgroundSyncManager {
  private dbName = 'satya-db';
  private dbVersion = 1;
  private queueStoreName = 'offline_queue';

  /**
   * Initialize background sync registration
   */
  async initialize() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        console.log('Background sync initialized');
      } catch (error) {
        console.warn('Background sync not available:', error);
      }
    }
  }

  /**
   * Queue a failed request for background sync
   */
  async queueRequest(url: string, options: RequestInit): Promise<void> {
    // Normalize headers to plain object to avoid serialization issues
    let headers: Record<string, string> = {};
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else {
        headers = options.headers as Record<string, string>;
      }
    }

    const queueItem: QueuedRequest = {
      url,
      method: options.method || 'GET',
      body: options.body,
      headers,
      timestamp: Date.now(),
    };

    try {
      const db = await this.openDB();
      const tx = db.transaction([this.queueStoreName], 'readwrite');
      const store = tx.objectStore(this.queueStoreName);
      
      // Properly wrap IndexedDB add operation in Promise
      await new Promise((resolve, reject) => {
        const request = store.add(queueItem);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      console.log('Request queued for background sync:', url);
      
      // Register background sync
      await this.registerSync();
    } catch (error) {
      console.error('Failed to queue request:', error);
    }
  }

  /**
   * Register background sync
   */
  private async registerSync(): Promise<void> {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        // TypeScript workaround for sync property
        await (registration as any).sync.register('background-sync');
        console.log('Background sync registered');
      } catch (error) {
        console.warn('Background sync registration failed:', error);
        // Fallback: try to sync immediately
        this.fallbackSync();
      }
    } else {
      // Browser doesn't support background sync, try immediate sync
      this.fallbackSync();
    }
  }

  /**
   * Fallback sync for browsers without background sync support
   */
  private async fallbackSync(): Promise<void> {
    if (navigator.onLine) {
      try {
        const queuedRequests = await this.getQueuedRequests();
        for (const request of queuedRequests) {
          await this.retryRequest(request);
        }
      } catch (error) {
        console.error('Fallback sync failed:', error);
      }
    }
  }

  /**
   * Retry a queued request
   */
  private async retryRequest(queueItem: QueuedRequest): Promise<void> {
    try {
      const response = await fetch(queueItem.url, {
        method: queueItem.method,
        body: queueItem.body,
        headers: queueItem.headers,
      });

      if (response.ok) {
        // Remove from queue on success
        await this.removeFromQueue(queueItem.id!);
        console.log('Successfully synced queued request:', queueItem.url);
      }
    } catch (error) {
      console.error('Failed to retry request:', queueItem.url, error);
    }
  }

  /**
   * Get all queued requests
   */
  private async getQueuedRequests(): Promise<QueuedRequest[]> {
    const db = await this.openDB();
    const tx = db.transaction([this.queueStoreName], 'readonly');
    const store = tx.objectStore(this.queueStoreName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove a request from the queue
   */
  private async removeFromQueue(id: number): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction([this.queueStoreName], 'readwrite');
    const store = tx.objectStore(this.queueStoreName);
    
    // Properly wrap IndexedDB delete operation in Promise
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Open IndexedDB connection
   */
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.queueStoreName)) {
          db.createObjectStore(this.queueStoreName, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  /**
   * Manually sync queued requests (for when coming back online)
   */
  async syncQueuedRequests(): Promise<void> {
    if (!navigator.onLine) {
      console.log('Still offline, skipping sync');
      return;
    }

    try {
      const queuedRequests = await this.getQueuedRequests();
      console.log(`Syncing ${queuedRequests.length} queued requests`);
      
      for (const request of queuedRequests) {
        await this.retryRequest(request);
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
    }
  }

  /**
   * Clear all queued requests (for testing/debugging)
   */
  async clearQueue(): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction([this.queueStoreName], 'readwrite');
    const store = tx.objectStore(this.queueStoreName);
    
    // Properly wrap IndexedDB clear operation in Promise
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    console.log('Background sync queue cleared');
  }
}

// Create singleton instance
export const backgroundSync = new BackgroundSyncManager();

// Initialize on module load
backgroundSync.initialize();

// Listen for online event to trigger fallback sync
window.addEventListener('online', () => {
  console.log('Back online, attempting to sync queued requests');
  // Immediately try to sync queued requests when coming back online
  backgroundSync.syncQueuedRequests();
});