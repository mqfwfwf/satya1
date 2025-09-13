/**
 * PWA Utilities for enhanced offline capabilities
 */

// Push notification utilities
export class PWANotifications {
  private static instance: PWANotifications;
  private registration: ServiceWorkerRegistration | null = null;

  static getInstance(): PWANotifications {
    if (!PWANotifications.instance) {
      PWANotifications.instance = new PWANotifications();
    }
    return PWANotifications.instance;
  }

  async initialize(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('PWA Service Worker registered successfully');
      
      // Set up periodic background sync
      if ('periodicSync' in this.registration) {
        await (this.registration as any).periodicSync.register('cache-refresh', {
          minInterval: 24 * 60 * 60 * 1000, // 24 hours
        });
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  async subscribeToPush(): Promise<PushSubscription | null> {
    if (!this.registration) {
      console.error('Service Worker not registered');
      return null;
    }

    try {
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          process.env.VAPID_PUBLIC_KEY || 'default-vapid-key'
        )
      });

      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);
      return subscription;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return null;
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    try {
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });
    } catch (error) {
      console.error('Failed to send push subscription to server:', error);
    }
  }

  async showNotification(title: string, options: NotificationOptions = {}): Promise<void> {
    if (!this.registration) {
      console.error('Service Worker not registered');
      return;
    }

    const defaultOptions: NotificationOptions = {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      ...options,
    };

    await this.registration.showNotification(title, defaultOptions);
  }
}

// Installation and app update utilities
export class PWAInstaller {
  private deferredPrompt: any = null;
  private updateAvailable = false;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      
      // Trigger custom install prompt UI
      this.dispatchCustomEvent('pwa-install-available');
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.dispatchCustomEvent('pwa-installed');
    });

    // Listen for service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.dispatchCustomEvent('pwa-updated');
      });

      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                this.updateAvailable = true;
                this.dispatchCustomEvent('pwa-update-available');
              }
            });
          }
        });
      });
    }
  }

  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    this.deferredPrompt.prompt();
    const choiceResult = await this.deferredPrompt.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      this.deferredPrompt = null;
      return true;
    }

    return false;
  }

  async updateApp(): Promise<void> {
    if (!this.updateAvailable) {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  isInstallable(): boolean {
    return this.deferredPrompt !== null;
  }

  isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  private dispatchCustomEvent(type: string, detail?: any): void {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

// Offline queue management
export class OfflineQueue {
  private dbName = 'satya-offline';
  private dbVersion = 1;
  private storeName = 'queue';

  async addToQueue(request: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timestamp?: number;
  }): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);

    const queueItem = {
      ...request,
      timestamp: request.timestamp || Date.now(),
      id: crypto.randomUUID(),
    };

    await new Promise<void>((resolve, reject) => {
      const req = store.add(queueItem);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Register background sync if available
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        await (registration as any).sync.register('background-sync');
      }
    }
  }

  async getQueueItems(): Promise<any[]> {
    const db = await this.openDB();
    const tx = db.transaction([this.storeName], 'readonly');
    const store = tx.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async removeFromQueue(id: string): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);

    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.dbVersion);
      
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
}

// Network status monitoring
export class NetworkMonitor {
  private callbacks: ((online: boolean) => void)[] = [];
  private _isOnline = navigator.onLine;

  constructor() {
    window.addEventListener('online', () => {
      this._isOnline = true;
      this.notifyCallbacks(true);
    });

    window.addEventListener('offline', () => {
      this._isOnline = false;
      this.notifyCallbacks(false);
    });
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  onNetworkChange(callback: (online: boolean) => void): () => void {
    this.callbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  private notifyCallbacks(online: boolean): void {
    this.callbacks.forEach(callback => {
      try {
        callback(online);
      } catch (error) {
        console.error('Network change callback error:', error);
      }
    });
  }

  async checkConnectivity(): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// App shortcuts (for advanced PWA features)
export const registerAppShortcuts = (): void => {
  if ('getInstalledRelatedApps' in navigator) {
    // Advanced PWA features
    const shortcuts = [
      {
        name: 'Quick Verify',
        url: '/?action=verify',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }]
      },
      {
        name: 'Dashboard',
        url: '/dashboard',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }]
      },
      {
        name: 'Mini Games',
        url: '/learn',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }]
      }
    ];

    // This would be handled by the manifest.json shortcuts property
    console.log('App shortcuts configured:', shortcuts);
  }
};

// Export singleton instances
export const pwaNotifications = PWANotifications.getInstance();
export const pwaInstaller = new PWAInstaller();
export const offlineQueue = new OfflineQueue();
export const networkMonitor = new NetworkMonitor();

// Initialize PWA features
export const initializePWA = async (): Promise<void> => {
  try {
    await pwaNotifications.initialize();
    registerAppShortcuts();
    
    console.log('PWA features initialized successfully');
  } catch (error) {
    console.error('PWA initialization failed:', error);
  }
};