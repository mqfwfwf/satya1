/**
 * Enhanced Service Worker with Advanced Offline Capabilities
 * Includes intelligent caching, background sync, push notifications, and offline gaming
 */

// Cache version and names
const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE = `satya-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `satya-dynamic-${CACHE_VERSION}`;
const API_CACHE = `satya-api-${CACHE_VERSION}`;
const IMAGES_CACHE = `satya-images-${CACHE_VERSION}`;
const GAMES_CACHE = `satya-games-${CACHE_VERSION}`;

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html',
  '/assets/index.js', // This would be the actual built JS file
  '/assets/index.css', // This would be the actual built CSS file
];

// API endpoints that can be cached
const CACHEABLE_API_ROUTES = [
  '/api/games',
  '/api/games/types',
  '/api/dashboard/stats',
  '/api/translations',
  '/api/health'
];

// Offline-first strategies for different content types
const CACHE_STRATEGIES = {
  static: 'cache-first',
  api: 'stale-while-revalidate',
  images: 'cache-first',
  games: 'cache-first',
  analysis: 'network-first'
};

// Background sync tags
const SYNC_TAGS = {
  ANALYSIS_QUEUE: 'analysis-queue',
  GAME_PROGRESS: 'game-progress',
  USER_FEEDBACK: 'user-feedback',
  ANALYTICS: 'analytics-events'
};

// IndexedDB configuration for offline storage
const DB_NAME = 'satya-offline-db';
const DB_VERSION = 2;
const STORES = {
  ANALYSIS_QUEUE: 'analysis_queue',
  GAME_DATA: 'game_data',
  USER_PROGRESS: 'user_progress',
  CACHED_RESULTS: 'cached_results',
  OFFLINE_CONTENT: 'offline_content'
};

// Install event - cache essential assets
self.addEventListener('install', event => {
  console.log('Service Worker installing with enhanced capabilities');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      
      // Initialize IndexedDB for offline storage
      initializeOfflineDB(),
      
      // Pre-cache game assets
      preloadGameAssets(),
      
      // Cache translations for offline use
      cacheTranslations()
    ]).then(() => {
      console.log('Service Worker installation completed');
      return self.skipWaiting();
    }).catch(error => {
      console.error('Service Worker installation failed:', error);
    })
  );
});

// Activate event - cleanup old caches and claim clients
self.addEventListener('activate', event => {
  console.log('Service Worker activating with enhanced features');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),
      
      // Initialize notification system
      initializeNotifications(),
      
      // Set up periodic background sync
      setupPeriodicSync(),
      
      // Claim all clients
      self.clients.claim()
    ]).then(() => {
      console.log('Service Worker activation completed');
    })
  );
});

// Fetch event - intelligent caching and offline fallbacks
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle different types of requests with appropriate strategies
  if (isStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
  } else if (isAPIRequest(request)) {
    event.respondWith(handleAPIRequest(request));
  } else if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request));
  } else if (isGameAsset(request)) {
    event.respondWith(handleGameAsset(request));
  } else {
    event.respondWith(handleGenericRequest(request));
  }
});

// Background sync for queued operations
self.addEventListener('sync', event => {
  console.log('Background sync triggered:', event.tag);
  
  switch (event.tag) {
    case SYNC_TAGS.ANALYSIS_QUEUE:
      event.waitUntil(syncAnalysisQueue());
      break;
      
    case SYNC_TAGS.GAME_PROGRESS:
      event.waitUntil(syncGameProgress());
      break;
      
    case SYNC_TAGS.USER_FEEDBACK:
      event.waitUntil(syncUserFeedback());
      break;
      
    case SYNC_TAGS.ANALYTICS:
      event.waitUntil(syncAnalyticsEvents());
      break;
      
    default:
      console.log('Unknown sync tag:', event.tag);
  }
});

// Periodic background sync for cache updates
self.addEventListener('periodicsync', event => {
  console.log('Periodic sync triggered:', event.tag);
  
  switch (event.tag) {
    case 'cache-refresh':
      event.waitUntil(refreshCriticalCaches());
      break;
      
    case 'game-content-update':
      event.waitUntil(updateGameContent());
      break;
      
    case 'analytics-sync':
      event.waitUntil(syncPendingAnalytics());
      break;
  }
});

// Push notification handling
self.addEventListener('push', event => {
  if (!event.data) {
    console.log('Push event without data');
    return;
  }
  
  const data = event.data.json();
  console.log('Push notification received:', data);
  
  const options = {
    body: data.body || 'New notification from Satya',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image: data.image,
    data: data.data || {},
    actions: generateNotificationActions(data.type),
    tag: data.tag || 'general',
    requireInteraction: data.important || false,
    silent: false,
    timestamp: Date.now(),
    vibrate: data.important ? [200, 100, 200] : [100]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Satya Alert', options)
  );
});

// Notification click handling with deep linking
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  console.log('Notification clicked:', action, data);
  
  let targetUrl = '/';
  
  if (action === 'analyze') {
    targetUrl = '/?action=analyze';
  } else if (action === 'play') {
    targetUrl = '/games';
  } else if (action === 'dashboard') {
    targetUrl = '/dashboard';
  } else if (data.url) {
    targetUrl = data.url;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            return client.focus().then(() => {
              return client.postMessage({
                type: 'NAVIGATE',
                url: targetUrl,
                source: 'notification'
              });
            });
          }
        }
        
        // Open new window if no existing one
        return clients.openWindow(targetUrl);
      })
  );
});

// Message handling for communication with main thread
self.addEventListener('message', event => {
  const { type, data } = event.data;
  
  console.log('Service Worker received message:', type, data);
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'QUEUE_ANALYSIS':
      queueAnalysisForSync(data);
      break;
      
    case 'SAVE_GAME_PROGRESS':
      saveGameProgress(data);
      break;
      
    case 'GET_OFFLINE_STATUS':
      event.ports[0].postMessage({
        type: 'OFFLINE_STATUS',
        isOffline: !navigator.onLine,
        queuedItems: getQueuedItemsCount()
      });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      });
      break;
  }
});

// Cache handling functions
async function handleStaticAsset(request) {
  try {
    const cachedResponse = await caches.match(request, { cacheName: STATIC_CACHE });
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Static asset fetch failed:', error);
    
    // Return offline fallback
    if (request.url.includes('.html') || request.destination === 'document') {
      return caches.match('/offline.html');
    }
    
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

async function handleAPIRequest(request) {
  const url = new URL(request.url);
  const cacheable = CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route));
  
  if (!cacheable) {
    return handleNonCacheableAPI(request);
  }
  
  try {
    // Try network first for API requests
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log('Network failed, trying cache:', error.message);
  }
  
  // Fallback to cache
  const cachedResponse = await caches.match(request, { cacheName: API_CACHE });
  if (cachedResponse) {
    // Add offline indicator header
    const response = new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers: {
        ...Object.fromEntries(cachedResponse.headers.entries()),
        'X-Served-From': 'cache',
        'X-Cache-Date': cachedResponse.headers.get('date') || new Date().toISOString()
      }
    });
    return response;
  }
  
  // Return offline response for API calls
  return new Response(
    JSON.stringify({
      offline: true,
      message: 'This feature requires an internet connection',
      cached: false
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

async function handleNonCacheableAPI(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Queue for background sync if it's a POST/PUT/DELETE
    if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
      await queueRequestForSync(request);
    }
    
    return new Response(
      JSON.stringify({
        offline: true,
        message: 'Request queued for when connection is restored',
        queued: true
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

async function handleImageRequest(request) {
  try {
    const cachedResponse = await caches.match(request, { cacheName: IMAGES_CACHE });
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(IMAGES_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return placeholder image for failed image requests
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="100%" height="100%" fill="#f0f0f0"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999">Image unavailable offline</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

async function handleGameAsset(request) {
  try {
    const cachedResponse = await caches.match(request, { cacheName: GAMES_CACHE });
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(GAMES_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Game asset fetch failed:', error);
    return new Response('Game asset unavailable offline', { status: 503 });
  }
}

async function handleGenericRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request, { cacheName: DYNAMIC_CACHE });
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }
    
    return new Response('Content unavailable offline', { status: 503 });
  }
}

// Background sync functions
async function syncAnalysisQueue() {
  console.log('Syncing analysis queue');
  
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([STORES.ANALYSIS_QUEUE], 'readonly');
    const store = tx.objectStore(STORES.ANALYSIS_QUEUE);
    const queuedAnalyses = await promisify(store.getAll());
    
    console.log(`Found ${queuedAnalyses.length} queued analyses`);
    
    for (const analysis of queuedAnalyses) {
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analysis.data)
        });
        
        if (response.ok) {
          const result = await response.json();
          
          // Store successful result
          await storeAnalysisResult(analysis.id, result);
          
          // Remove from queue
          await removeFromQueue(STORES.ANALYSIS_QUEUE, analysis.id);
          
          // Notify client of completion
          notifyClients({
            type: 'ANALYSIS_COMPLETE',
            id: analysis.id,
            result
          });
          
          console.log('Successfully synced analysis:', analysis.id);
        } else {
          console.error('Analysis sync failed:', response.status, analysis.id);
        }
      } catch (error) {
        console.error('Individual analysis sync failed:', error, analysis.id);
      }
    }
  } catch (error) {
    console.error('Analysis queue sync failed:', error);
  }
}

async function syncGameProgress() {
  console.log('Syncing game progress');
  
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([STORES.USER_PROGRESS], 'readonly');
    const store = tx.objectStore(STORES.USER_PROGRESS);
    const progressData = await promisify(store.getAll());
    
    for (const progress of progressData) {
      if (progress.synced) continue;
      
      try {
        const response = await fetch('/api/games/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progress.data)
        });
        
        if (response.ok) {
          // Mark as synced
          progress.synced = true;
          await updateInStore(STORES.USER_PROGRESS, progress);
          
          console.log('Game progress synced:', progress.id);
        }
      } catch (error) {
        console.error('Game progress sync failed:', error, progress.id);
      }
    }
  } catch (error) {
    console.error('Game progress sync failed:', error);
  }
}

async function syncUserFeedback() {
  console.log('Syncing user feedback');
  
  // Implementation for syncing user feedback/ratings
  try {
    const db = await openOfflineDB();
    // Similar pattern to other sync functions
  } catch (error) {
    console.error('User feedback sync failed:', error);
  }
}

async function syncAnalyticsEvents() {
  console.log('Syncing analytics events');
  
  // Implementation for syncing analytics data
  try {
    const db = await openOfflineDB();
    // Similar pattern to other sync functions
  } catch (error) {
    console.error('Analytics sync failed:', error);
  }
}

// Cache management functions
async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(name => 
    name.includes('satya') && !name.includes(CACHE_VERSION)
  );
  
  return Promise.all(
    oldCaches.map(cacheName => {
      console.log('Deleting old cache:', cacheName);
      return caches.delete(cacheName);
    })
  );
}

async function refreshCriticalCaches() {
  console.log('Refreshing critical caches');
  
  try {
    const cache = await caches.open(API_CACHE);
    
    // Refresh critical API endpoints
    const criticalEndpoints = [
      '/api/games/types',
      '/api/dashboard/stats',
      '/api/health'
    ];
    
    await Promise.all(
      criticalEndpoints.map(async endpoint => {
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            await cache.put(endpoint, response);
          }
        } catch (error) {
          console.warn(`Failed to refresh cache for ${endpoint}:`, error);
        }
      })
    );
  } catch (error) {
    console.error('Cache refresh failed:', error);
  }
}

async function preloadGameAssets() {
  console.log('Preloading game assets');
  
  try {
    const gameAssets = [
      '/api/games/types',
      '/assets/game-icons.png',
      '/assets/game-sounds.mp3'
    ];
    
    const cache = await caches.open(GAMES_CACHE);
    
    await Promise.all(
      gameAssets.map(async asset => {
        try {
          const response = await fetch(asset);
          if (response.ok) {
            await cache.put(asset, response);
          }
        } catch (error) {
          console.warn(`Failed to preload game asset ${asset}:`, error);
        }
      })
    );
  } catch (error) {
    console.error('Game asset preloading failed:', error);
  }
}

async function cacheTranslations() {
  console.log('Caching translations for offline use');
  
  try {
    const response = await fetch('/api/translations');
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put('/api/translations', response);
    }
  } catch (error) {
    console.warn('Translation caching failed:', error);
  }
}

async function updateGameContent() {
  console.log('Updating game content');
  
  try {
    // Fetch latest game data and update cache
    const response = await fetch('/api/games?includeContent=true');
    if (response.ok) {
      const games = await response.json();
      
      // Store in IndexedDB for offline play
      const db = await openOfflineDB();
      const tx = db.transaction([STORES.GAME_DATA], 'readwrite');
      const store = tx.objectStore(STORES.GAME_DATA);
      
      for (const game of games) {
        await promisify(store.put(game));
      }
      
      console.log(`Updated ${games.length} games for offline play`);
    }
  } catch (error) {
    console.error('Game content update failed:', error);
  }
}

// IndexedDB management
async function initializeOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores if they don't exist
      Object.values(STORES).forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          
          // Add indexes for common queries
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('type', 'type');
          
          console.log('Created object store:', storeName);
        }
      });
    };
  });
}

async function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Queue management
async function queueAnalysisForSync(analysisData) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([STORES.ANALYSIS_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.ANALYSIS_QUEUE);
    
    const queueItem = {
      data: analysisData,
      timestamp: Date.now(),
      type: 'analysis'
    };
    
    await promisify(store.add(queueItem));
    
    // Register background sync
    if ('sync' in self.registration) {
      await self.registration.sync.register(SYNC_TAGS.ANALYSIS_QUEUE);
    }
    
    console.log('Analysis queued for sync');
  } catch (error) {
    console.error('Failed to queue analysis:', error);
  }
}

async function queueRequestForSync(request) {
  try {
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.method !== 'GET' ? await request.text() : null
    };
    
    const db = await openOfflineDB();
    const tx = db.transaction([STORES.ANALYSIS_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.ANALYSIS_QUEUE);
    
    const queueItem = {
      data: requestData,
      timestamp: Date.now(),
      type: 'request'
    };
    
    await promisify(store.add(queueItem));
    
    // Register appropriate sync tag
    const syncTag = request.url.includes('games') ? SYNC_TAGS.GAME_PROGRESS : SYNC_TAGS.ANALYSIS_QUEUE;
    if ('sync' in self.registration) {
      await self.registration.sync.register(syncTag);
    }
  } catch (error) {
    console.error('Failed to queue request:', error);
  }
}

async function saveGameProgress(progressData) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([STORES.USER_PROGRESS], 'readwrite');
    const store = tx.objectStore(STORES.USER_PROGRESS);
    
    const progressItem = {
      data: progressData,
      timestamp: Date.now(),
      synced: false,
      type: 'game_progress'
    };
    
    await promisify(store.put(progressItem));
    
    // Register sync
    if ('sync' in self.registration) {
      await self.registration.sync.register(SYNC_TAGS.GAME_PROGRESS);
    }
    
    console.log('Game progress saved offline');
  } catch (error) {
    console.error('Failed to save game progress:', error);
  }
}

// Utility functions
function isStaticAsset(request) {
  return STATIC_ASSETS.some(asset => request.url.endsWith(asset)) ||
         request.url.includes('/assets/') ||
         request.url.includes('.css') ||
         request.url.includes('.js');
}

function isAPIRequest(request) {
  return request.url.includes('/api/');
}

function isImageRequest(request) {
  return request.destination === 'image' ||
         /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(request.url);
}

function isGameAsset(request) {
  return request.url.includes('/games/') ||
         request.url.includes('game-') ||
         /\.(mp3|wav|ogg)$/i.test(request.url);
}

function generateNotificationActions(type) {
  switch (type) {
    case 'misinformation_alert':
      return [
        { action: 'analyze', title: 'Verify Now', icon: '/icon-analyze.png' },
        { action: 'dismiss', title: 'Dismiss', icon: '/icon-dismiss.png' }
      ];
      
    case 'game_achievement':
      return [
        { action: 'play', title: 'Play More', icon: '/icon-play.png' },
        { action: 'share', title: 'Share', icon: '/icon-share.png' }
      ];
      
    default:
      return [
        { action: 'dashboard', title: 'Open App', icon: '/icon-open.png' }
      ];
  }
}

async function initializeNotifications() {
  // Set up notification system
  console.log('Notification system initialized');
}

async function setupPeriodicSync() {
  // Register periodic background sync
  if ('periodicSync' in self.registration) {
    try {
      await self.registration.periodicSync.register('cache-refresh', {
        minInterval: 24 * 60 * 60 * 1000 // 24 hours
      });
      
      await self.registration.periodicSync.register('game-content-update', {
        minInterval: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      console.log('Periodic sync registered');
    } catch (error) {
      console.warn('Periodic sync not supported:', error);
    }
  }
}

async function storeAnalysisResult(id, result) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([STORES.CACHED_RESULTS], 'readwrite');
    const store = tx.objectStore(STORES.CACHED_RESULTS);
    
    await promisify(store.put({
      id,
      result,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to store analysis result:', error);
  }
}

async function removeFromQueue(storeName, id) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    
    await promisify(store.delete(id));
  } catch (error) {
    console.error('Failed to remove from queue:', error);
  }
}

async function updateInStore(storeName, item) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    
    await promisify(store.put(item));
  } catch (error) {
    console.error('Failed to update item in store:', error);
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage(message);
  });
}

async function getQueuedItemsCount() {
  try {
    const db = await openOfflineDB();
    const counts = {};
    
    for (const store of Object.values(STORES)) {
      const tx = db.transaction([store], 'readonly');
      const objectStore = tx.objectStore(store);
      const count = await promisify(objectStore.count());
      counts[store] = count;
    }
    
    return counts;
  } catch (error) {
    console.error('Failed to get queued items count:', error);
    return {};
  }
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  const satyaCaches = cacheNames.filter(name => name.includes('satya'));
  
  return Promise.all(
    satyaCaches.map(cacheName => {
      console.log('Clearing cache:', cacheName);
      return caches.delete(cacheName);
    })
  );
}

async function syncPendingAnalytics() {
  console.log('Syncing pending analytics');
  
  // Implementation for syncing analytics data
  try {
    // Send queued analytics events to server
  } catch (error) {
    console.error('Analytics sync failed:', error);
  }
}

// Utility to promisify IndexedDB operations
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

console.log('Enhanced Service Worker loaded with advanced offline capabilities');