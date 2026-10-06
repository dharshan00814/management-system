// ============================================================
// Hyna Management: Native Web Push Service Worker
// Standard browser Push API, JSON payload parsing & Smart Window Focus
// ============================================================

const CACHE_NAME = 'hyna-push-v1';
const DEFAULT_ICON = '/pwa-192x192.png';
const DEFAULT_BADGE = '/favicon.svg';

// Immediate activation on install
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push Event Listener
self.addEventListener('push', (event) => {
  let data = {
    title: 'Hyna Studio Notice',
    body: 'You have a new update in Hyna Management.',
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = {
        title: json.title || data.title,
        body: json.body || json.message || data.body,
        icon: json.icon || DEFAULT_ICON,
        badge: json.badge || DEFAULT_BADGE,
        data: json.data || { url: json.actionUrl || json.url || '/' },
        tag: json.tag || `hyna-notif-${Date.now()}`,
        requireInteraction: json.requireInteraction || false,
      };
    } catch {
      // Fallback for plain text payload
      const text = event.data.text();
      if (text) {
        data.body = text;
      }
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    data: data.data,
    tag: data.tag,
    vibrate: [100, 50, 100],
    renotify: true,
    requireInteraction: data.requireInteraction,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

// Notification Click Listener - Smart Window Reuse & Navigation
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. Try to find an existing window with same origin to focus and navigate
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const destinationUrl = new URL(targetUrl, self.location.origin);

        if (clientUrl.origin === destinationUrl.origin && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(destinationUrl.href);
          }
          return client.focus();
        }
      }

      // 2. If no window is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(new URL(targetUrl, self.location.origin).href);
      }
    })
  );
});
