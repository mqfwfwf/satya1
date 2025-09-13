/**
 * Service Worker Entry Point
 * Loads the enhanced service worker with all advanced capabilities
 */

// For compatibility and easier deployment, we'll keep all functionality in one file
// In production, you might want to split this into multiple modules

// Re-export everything from the enhanced service worker
// This file serves as the main service worker that browsers will register

// Import the enhanced service worker functionality
try {
  importScripts('./service-worker-enhanced.js');
  console.log('Enhanced service worker loaded successfully');
} catch (error) {
  console.error('Failed to load enhanced service worker, falling back to basic version');
  
  // Basic fallback service worker implementation
  const CACHE_NAME = 'satya-fallback-v1';
  const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
  ];

  self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.addAll(STATIC_ASSETS))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
  });

  self.addEventListener('fetch', event => {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
        .catch(() => caches.match('/'))
    );
  });
}